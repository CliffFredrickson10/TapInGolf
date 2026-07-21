import { PoolClient } from "pg";
import { getPool, query, row, exec, withTransaction, clientQuery } from "./pg";
import { logger } from "./logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";

export interface LedgerAccount {
  id: number;
  club_id: number;
  code: string;
  name: string;
  type: AccountType;
  parent_id: number | null;
  system_account: number;
  active: number;
  created_at: string;
}

export interface LedgerJournal {
  id: number;
  club_id: number;
  journal_ref: string;
  journal_date: string;
  description: string;
  source_module: string;
  source_id: number | null;
  source_ref: string | null;
  posted_by: number | null;
  reversal_of_id: number | null;
  reversed_by_id: number | null;
  metadata: Record<string, any> | null;
  created_at: string;
}

export interface LedgerEntry {
  id: number;
  journal_id: number;
  account_id: number;
  debit: number;
  credit: number;
  description: string | null;
  created_at: string;
}

export interface JournalLine {
  account_code: string;
  debit?: number;
  credit?: number;
  description?: string;
}

export interface PostJournalOptions {
  club_id: number;
  journal_date?: string;
  description: string;
  source_module: string;
  source_id?: number;
  source_ref?: string;
  entries: JournalLine[];
  posted_by?: number;
  metadata?: Record<string, any>;
}

export interface TrialBalanceRow {
  account_id: number;
  code: string;
  name: string;
  type: AccountType;
  debit_total: number;
  credit_total: number;
  balance: number;
}

// ─── Chart of Accounts Template ───────────────────────────────────────────────

const COA_TEMPLATE: { code: string; name: string; type: AccountType; parent?: string }[] = [
  // Assets
  { code: "1000", name: "Assets", type: "asset" },
  { code: "1010", name: "Cash & Bank", type: "asset", parent: "1000" },
  { code: "1020", name: "Accounts Receivable", type: "asset", parent: "1000" },
  { code: "1030", name: "PayFast Clearing", type: "asset", parent: "1000" },
  { code: "1031", name: "Stitch Clearing", type: "asset", parent: "1000" },
  { code: "1040", name: "Wallet Clearing", type: "asset", parent: "1000" },
  { code: "1050", name: "Gift Card Asset", type: "asset", parent: "1000" },
  // Liabilities
  { code: "2000", name: "Liabilities", type: "liability" },
  { code: "2010", name: "Accounts Payable", type: "liability", parent: "2000" },
  { code: "2020", name: "VAT Output", type: "liability", parent: "2000" },
  { code: "2030", name: "Unearned Revenue", type: "liability", parent: "2000" },
  { code: "2040", name: "Customer Deposits", type: "liability", parent: "2000" },
  { code: "2050", name: "Gift Card Liability", type: "liability", parent: "2000" },
  // Equity
  { code: "3000", name: "Equity", type: "equity" },
  { code: "3010", name: "Retained Earnings", type: "equity", parent: "3000" },
  // Revenue
  { code: "4000", name: "Revenue", type: "revenue" },
  { code: "4010", name: "Green Fee Revenue", type: "revenue", parent: "4000" },
  { code: "4020", name: "Cart Hire Revenue", type: "revenue", parent: "4000" },
  { code: "4030", name: "Pro Shop Revenue", type: "revenue", parent: "4000" },
  { code: "4040", name: "Bar & Restaurant Revenue", type: "revenue", parent: "4000" },
  { code: "4050", name: "Membership Revenue", type: "revenue", parent: "4000" },
  { code: "4060", name: "Event Entry Revenue", type: "revenue", parent: "4000" },
  { code: "4070", name: "Driving Range Revenue", type: "revenue", parent: "4000" },
  { code: "4080", name: "Club Hire Revenue", type: "revenue", parent: "4000" },
  { code: "4090", name: "Resale Commission Revenue", type: "revenue", parent: "4000" },
  { code: "4100", name: "Function & Event Revenue", type: "revenue", parent: "4000" },
  { code: "4110", name: "Other Revenue", type: "revenue", parent: "4000" },
  // Expenses
  { code: "5000", name: "Expenses", type: "expense" },
  { code: "5010", name: "Platform Fees", type: "expense", parent: "5000" },
  { code: "5020", name: "Payment Processing Fees", type: "expense", parent: "5000" },
  { code: "5030", name: "Refunds & Chargebacks", type: "expense", parent: "5000" },
  { code: "5040", name: "Voucher Discounts", type: "expense", parent: "5000" },
  { code: "5050", name: "COGS - Pro Shop", type: "expense", parent: "5000" },
  { code: "5060", name: "COGS - Bar & Restaurant", type: "expense", parent: "5000" },
  { code: "5070", name: "Service Fees", type: "expense", parent: "5000" },
];

// ─── Core Ledger Functions ────────────────────────────────────────────────────

/**
 * Generate a unique journal reference: JNL-{clubId}-{timestamp}-{random}
 */
function generateJournalRef(clubId: number): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 6);
  return `JNL-${clubId}-${ts}-${rand}`;
}

/**
 * Provision the standard Chart of Accounts for a club.
 * Idempotent — skips accounts that already exist.
 */
export async function provisionChartOfAccounts(clubId: number): Promise<void> {
  const existing = await query<{ code: string }>(
    "SELECT code FROM ledger_accounts WHERE club_id = ?",
    [clubId]
  );
  const existingCodes = new Set(existing.map(a => a.code));

  // First pass: insert parent accounts (no parent_id)
  for (const acct of COA_TEMPLATE.filter(a => !a.parent)) {
    if (existingCodes.has(acct.code)) continue;
    await exec(
      `INSERT INTO ledger_accounts (club_id, code, name, type, system_account)
       VALUES (?, ?, ?, ?, 1)`,
      [clubId, acct.code, acct.name, acct.type]
    );
  }

  // Second pass: insert child accounts (with parent_id)
  for (const acct of COA_TEMPLATE.filter(a => a.parent)) {
    if (existingCodes.has(acct.code)) continue;
    const parent = await row<{ id: number }>(
      "SELECT id FROM ledger_accounts WHERE club_id = ? AND code = ?",
      [clubId, acct.parent]
    );
    await exec(
      `INSERT INTO ledger_accounts (club_id, code, name, type, parent_id, system_account)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [clubId, acct.code, acct.name, acct.type, parent?.id ?? null]
    );
  }

  logger.info({ clubId }, "Chart of accounts provisioned");
}

/**
 * Post a balanced journal to the ledger.
 * Validates that total debits = total credits.
 * Returns the new journal ID.
 * 
 * Uses a transaction to ensure atomicity.
 * Rejects unbalanced journals.
 * Prevents duplicate posting via source_module + source_id uniqueness.
 */
export async function postJournal(opts: PostJournalOptions): Promise<number> {
  const {
    club_id,
    journal_date = new Date().toISOString().slice(0, 10),
    description,
    source_module,
    source_id,
    source_ref,
    entries,
    posted_by,
    metadata,
  } = opts;

  // ── Validate balance ────────────────────────────────────────────────────────
  if (!entries || entries.length < 2) {
    throw new Error("A journal must have at least two entries");
  }

  let totalDebit = 0;
  let totalCredit = 0;
  for (const e of entries) {
    totalDebit += e.debit ?? 0;
    totalCredit += e.credit ?? 0;
  }

  // Round to avoid floating point issues
  totalDebit = Math.round(totalDebit * 100) / 100;
  totalCredit = Math.round(totalCredit * 100) / 100;

  if (totalDebit !== totalCredit) {
    throw new Error(
      `Journal does not balance: debits=${totalDebit}, credits=${totalCredit}`
    );
  }

  if (totalDebit === 0) {
    throw new Error("Journal has zero value");
  }

  // ── Check for duplicate posting ────────────────────────────────────────────
  if (source_id) {
    const existing = await row<{ id: number }>(
      "SELECT id FROM ledger_journals WHERE club_id = ? AND source_module = ? AND source_id = ? AND reversal_of_id IS NULL",
      [club_id, source_module, source_id]
    );
    if (existing) {
      logger.warn({ club_id, source_module, source_id, existing_journal: existing.id }, "Duplicate journal posting prevented");
      return existing.id;
    }
  }

  // ── Post within transaction ─────────────────────────────────────────────────
  return await withTransaction(async (client: PoolClient) => {
    const journalRef = generateJournalRef(club_id);

    // Insert journal header
    const jResult = await clientQuery(client,
      `INSERT INTO ledger_journals (club_id, journal_ref, journal_date, description, source_module, source_id, source_ref, posted_by, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
      [club_id, journalRef, journal_date, description, source_module, source_id ?? null, source_ref ?? null, posted_by ?? null, metadata ? JSON.stringify(metadata) : null]
    );
    const journalId = jResult.rows[0].id;

    // Resolve account codes to IDs and insert entries
    for (const entry of entries) {
      const account = await clientQuery(client,
        "SELECT id FROM ledger_accounts WHERE club_id = ? AND code = ?",
        [club_id, entry.account_code]
      );
      if (account.rows.length === 0) {
        throw new Error(`Account code "${entry.account_code}" not found for club ${club_id}`);
      }

      await clientQuery(client,
        `INSERT INTO ledger_entries (journal_id, account_id, debit, credit, description)
         VALUES (?, ?, ?, ?, ?)`,
        [journalId, account.rows[0].id, entry.debit ?? 0, entry.credit ?? 0, entry.description ?? null]
      );
    }

    logger.info({ club_id, journalId, journalRef, source_module, source_id, totalDebit }, "Journal posted");
    return journalId;
  });
}

/**
 * Reverse an existing journal by creating a mirror journal.
 * Marks the original as reversed.
 * Returns the new reversal journal ID.
 */
export async function reverseJournal(journalId: number, reason: string, postedBy?: number): Promise<number> {
  const journal = await row<LedgerJournal>(
    "SELECT * FROM ledger_journals WHERE id = ?",
    [journalId]
  );
  if (!journal) throw new Error(`Journal ${journalId} not found`);
  if (journal.reversed_by_id) throw new Error(`Journal ${journalId} is already reversed`);

  const entries = await query<LedgerEntry>(
    "SELECT * FROM ledger_entries WHERE journal_id = ?",
    [journalId]
  );

  // Create reversal entries (swap debits and credits)
  const reversalEntries: JournalLine[] = [];
  for (const entry of entries) {
    const account = await row<{ code: string }>(
      "SELECT code FROM ledger_accounts WHERE id = ?",
      [entry.account_id]
    );
    if (!account) continue;
    reversalEntries.push({
      account_code: account.code,
      debit: Number(entry.credit),
      credit: Number(entry.debit),
      description: entry.description ?? undefined,
    });
  }

  return await withTransaction(async (client: PoolClient) => {
    const journalRef = generateJournalRef(journal.club_id);

    // Insert reversal journal
    const jResult = await clientQuery(client,
      `INSERT INTO ledger_journals (club_id, journal_ref, journal_date, description, source_module, source_id, source_ref, posted_by, reversal_of_id, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
      [journal.club_id, journalRef, new Date().toISOString().slice(0, 10), `REVERSAL: ${reason}`, journal.source_module, journal.source_id, journal.source_ref, postedBy ?? null, journalId, JSON.stringify({ reason, original_journal: journalId })]
    );
    const reversalId = jResult.rows[0].id;

    // Insert reversed entries
    for (const entry of reversalEntries) {
      const account = await clientQuery(client,
        "SELECT id FROM ledger_accounts WHERE club_id = ? AND code = ?",
        [journal.club_id, entry.account_code]
      );
      await clientQuery(client,
        `INSERT INTO ledger_entries (journal_id, account_id, debit, credit, description)
         VALUES (?, ?, ?, ?, ?)`,
        [reversalId, account.rows[0].id, entry.debit ?? 0, entry.credit ?? 0, entry.description ?? null]
      );
    }

    // Mark original as reversed
    await clientQuery(client,
      "UPDATE ledger_journals SET reversed_by_id = ? WHERE id = ?",
      [reversalId, journalId]
    );

    logger.info({ club_id: journal.club_id, reversalId, originalJournalId: journalId, reason }, "Journal reversed");
    return reversalId;
  });
}

// ─── Query Functions ──────────────────────────────────────────────────────────

/**
 * Get account balance (debit-normal for assets/expenses, credit-normal for liabilities/revenue/equity)
 */
export async function getAccountBalance(accountId: number, asOf?: string): Promise<number> {
  let sql = `SELECT COALESCE(SUM(debit), 0) AS total_debit, COALESCE(SUM(credit), 0) AS total_credit
             FROM ledger_entries le
             JOIN ledger_journals lj ON le.journal_id = lj.id
             WHERE le.account_id = ?`;
  const params: any[] = [accountId];
  if (asOf) {
    sql += " AND lj.journal_date <= ?";
    params.push(asOf);
  }

  const result = await row<{ total_debit: string; total_credit: string }>(sql, params);
  if (!result) return 0;

  const debit = Number(result.total_debit);
  const credit = Number(result.total_credit);

  // Get account type to determine normal balance
  const account = await row<{ type: AccountType }>(
    "SELECT type FROM ledger_accounts WHERE id = ?",
    [accountId]
  );
  if (!account) return 0;

  // Debit-normal: assets, expenses → balance = debit - credit
  // Credit-normal: liabilities, revenue, equity → balance = credit - debit
  if (account.type === "asset" || account.type === "expense") {
    return debit - credit;
  }
  return credit - debit;
}

/**
 * Get trial balance for a club within a date range.
 */
export async function getTrialBalance(clubId: number, from: string, to: string): Promise<TrialBalanceRow[]> {
  const rows = await query<TrialBalanceRow>(
    `SELECT la.id AS account_id, la.code, la.name, la.type,
            COALESCE(SUM(le.debit), 0) AS debit_total,
            COALESCE(SUM(le.credit), 0) AS credit_total,
            CASE WHEN la.type IN ('asset','expense')
              THEN COALESCE(SUM(le.debit), 0) - COALESCE(SUM(le.credit), 0)
              ELSE COALESCE(SUM(le.credit), 0) - COALESCE(SUM(le.debit), 0)
            END AS balance
     FROM ledger_accounts la
     LEFT JOIN ledger_entries le ON le.account_id = la.id
     LEFT JOIN ledger_journals lj ON le.journal_id = lj.id
       AND lj.journal_date BETWEEN ? AND ?
     WHERE la.club_id = ? AND la.active = 1
     GROUP BY la.id, la.code, la.name, la.type
     HAVING COALESCE(SUM(le.debit), 0) > 0 OR COALESCE(SUM(le.credit), 0) > 0
     ORDER BY la.code`,
    [from, to, clubId]
  );
  return rows;
}

/**
 * Get journals for a specific source (e.g., all journals for booking #123).
 */
export async function getJournalsBySource(clubId: number, sourceModule: string, sourceId: number): Promise<LedgerJournal[]> {
  return query<LedgerJournal>(
    "SELECT * FROM ledger_journals WHERE club_id = ? AND source_module = ? AND source_id = ? ORDER BY created_at DESC",
    [clubId, sourceModule, sourceId]
  );
}

/**
 * Get journal with its entries.
 */
export async function getJournalDetail(journalId: number): Promise<{ journal: LedgerJournal; entries: (LedgerEntry & { account_code: string; account_name: string })[] } | null> {
  const journal = await row<LedgerJournal>(
    "SELECT * FROM ledger_journals WHERE id = ?",
    [journalId]
  );
  if (!journal) return null;

  const entries = await query<LedgerEntry & { account_code: string; account_name: string }>(
    `SELECT le.*, la.code AS account_code, la.name AS account_name
     FROM ledger_entries le
     JOIN ledger_accounts la ON le.account_id = la.id
     WHERE le.journal_id = ?
     ORDER BY le.id`,
    [journalId]
  );

  return { journal, entries };
}

/**
 * Get all journals for a club (paginated).
 */
export async function getJournals(clubId: number, opts: { from?: string; to?: string; source_module?: string; limit?: number; offset?: number } = {}): Promise<LedgerJournal[]> {
  let sql = "SELECT * FROM ledger_journals WHERE club_id = ?";
  const params: any[] = [clubId];

  if (opts.from) { sql += " AND journal_date >= ?"; params.push(opts.from); }
  if (opts.to) { sql += " AND journal_date <= ?"; params.push(opts.to); }
  if (opts.source_module) { sql += " AND source_module = ?"; params.push(opts.source_module); }

  sql += ` ORDER BY journal_date DESC, created_at DESC LIMIT ${opts.limit ?? 50} OFFSET ${opts.offset ?? 0}`;
  return query<LedgerJournal>(sql, params);
}

/**
 * Get all accounts for a club.
 */
export async function getAccounts(clubId: number): Promise<LedgerAccount[]> {
  return query<LedgerAccount>(
    "SELECT * FROM ledger_accounts WHERE club_id = ? ORDER BY code",
    [clubId]
  );
}
