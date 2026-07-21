/**
 * Settlement Engine
 *
 * Generates settlement batches from ledger journals, posts clearing → bank
 * journals, and provides reconciliation against external provider statements.
 */
import { query, row, exec, run, withTransaction, clientQuery } from "./pg";
import { postJournal } from "./ledger";
import { logger } from "./logger";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SettlementBatch {
  id: number;
  club_id: number;
  provider: string;
  batch_ref: string;
  period_from: string;
  period_to: string;
  total_amount: number;
  fee_amount: number;
  net_amount: number;
  status: string;
  journal_id: number | null;
  settled_at: string | null;
  created_at: string;
}

// ─── Settlement Batch Generation ─────────────────────────────────────────────

/**
 * Generate a settlement batch for a specific provider and club.
 * Collects all unsettled ledger journals that debited the provider's clearing account
 * within the specified period.
 */
export async function generateSettlementBatch(
  clubId: number,
  provider: string,
  periodFrom: string,
  periodTo: string,
): Promise<number> {
  const clearingCode = getProviderClearingCode(provider);

  // Find all journal entries that debited the clearing account in this period
  // (i.e., money received via this provider that hasn't been settled yet)
  const unsettled = await query<any>(
    `SELECT j.id AS journal_id, j.source_module, j.source_id, e.debit AS gross_amount
     FROM ledger_journals j
     JOIN ledger_entries e ON e.journal_id = j.id
     JOIN ledger_accounts a ON a.id = e.account_id
     WHERE j.club_id = ?
       AND a.code = ?
       AND a.club_id = ?
       AND e.debit > 0
       AND j.journal_date >= ?
       AND j.journal_date <= ?
       AND j.reversed_by_id IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM settlement_items si
         JOIN settlement_batches sb ON sb.id = si.batch_id
         WHERE si.source_module = j.source_module AND si.source_id = j.source_id
           AND sb.club_id = ? AND sb.provider = ? AND sb.status != 'cancelled'
       )
     ORDER BY j.journal_date`,
    [clubId, clearingCode, clubId, periodFrom, periodTo, clubId, provider]
  );

  if (unsettled.length === 0) {
    throw new Error(`No unsettled transactions for ${provider} in period ${periodFrom} to ${periodTo}`);
  }

  // Calculate totals
  let totalAmount = 0;
  for (const item of unsettled) {
    totalAmount += Number(item.gross_amount);
  }

  // Estimate provider fees (can be refined with actual fee schedules)
  const feeRate = getProviderFeeRate(provider);
  const feeAmount = Math.round(totalAmount * feeRate * 100) / 100;
  const netAmount = Math.round((totalAmount - feeAmount) * 100) / 100;
  totalAmount = Math.round(totalAmount * 100) / 100;

  const batchRef = `STL-${clubId}-${provider.toUpperCase()}-${Date.now().toString(36)}`;

  return await withTransaction(async (client) => {
    const batchRes = await clientQuery(client,
      `INSERT INTO settlement_batches (club_id, provider, batch_ref, period_from, period_to, total_amount, fee_amount, net_amount, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
       RETURNING id`,
      [clubId, provider, batchRef, periodFrom, periodTo, totalAmount, feeAmount, netAmount]
    );
    const batchId = batchRes.rows[0].id;

    // Insert settlement items
    for (const item of unsettled) {
      const itemFee = Math.round(Number(item.gross_amount) * feeRate * 100) / 100;
      const itemNet = Math.round((Number(item.gross_amount) - itemFee) * 100) / 100;
      await clientQuery(client,
        `INSERT INTO settlement_items (batch_id, source_module, source_id, gross_amount, fee_amount, net_amount, status)
         VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
        [batchId, item.source_module, item.source_id, Number(item.gross_amount), itemFee, itemNet]
      );
    }

    return batchId;
  });
}

/**
 * Confirm settlement of a batch (provider has paid out).
 * Posts a journal: Debit Bank, Credit Provider Clearing, Debit Payment Processing Fees.
 */
export async function confirmSettlement(batchId: number): Promise<number> {
  const batch = await row<SettlementBatch>(
    "SELECT * FROM settlement_batches WHERE id = ?",
    [batchId]
  );
  if (!batch) throw new Error("Settlement batch not found");
  if (batch.status !== "pending") throw new Error(`Batch already ${batch.status}`);

  const clearingCode = getProviderClearingCode(batch.provider);

  // Post settlement journal: move from clearing to bank
  const entries: { account_code: string; debit?: number; credit?: number; description?: string }[] = [
    // Debit: Bank account (money arrived)
    { account_code: "1010", debit: batch.net_amount, description: `Settlement from ${batch.provider}` },
    // Debit: Payment processing fees expense
    { account_code: "5020", debit: batch.fee_amount, description: `${batch.provider} processing fees` },
    // Credit: Provider clearing (money leaves clearing)
    { account_code: clearingCode, credit: batch.total_amount, description: `Clear ${batch.provider} settling ${batch.batch_ref}` },
  ];

  const journalId = await postJournal({
    club_id: batch.club_id,
    description: `Settlement ${batch.batch_ref} — ${batch.provider}`,
    source_module: "settlement",
    source_id: batchId,
    entries,
    metadata: {
      provider: batch.provider,
      period_from: batch.period_from,
      period_to: batch.period_to,
      item_count: (await query<any>("SELECT COUNT(*) AS cnt FROM settlement_items WHERE batch_id = ?", [batchId]))[0]?.cnt,
    },
  });

  // Update batch status
  await run(
    "UPDATE settlement_batches SET status = 'settled', journal_id = ?, settled_at = NOW() WHERE id = ?",
    [journalId, batchId]
  );
  await run(
    "UPDATE settlement_items SET status = 'settled' WHERE batch_id = ?",
    [batchId]
  );

  return journalId!;
}

/**
 * Cancel a pending settlement batch.
 */
export async function cancelSettlement(batchId: number): Promise<void> {
  const updated = await run(
    "UPDATE settlement_batches SET status = 'cancelled' WHERE id = ? AND status = 'pending'",
    [batchId]
  );
  if (updated === 0) throw new Error("Batch not found or already processed");
  await run("UPDATE settlement_items SET status = 'cancelled' WHERE batch_id = ?", [batchId]);
}

// ─── Reconciliation ──────────────────────────────────────────────────────────

/**
 * Record a reconciliation entry — match an external provider reference to a ledger journal.
 */
export async function reconcileTransaction(
  clubId: number,
  provider: string,
  externalRef: string,
  externalAmount: number,
  matchedJournalId: number | null,
  notes?: string,
): Promise<number> {
  const status = matchedJournalId ? "matched" : "unmatched";
  const id = await exec(
    `INSERT INTO reconciliation_records (club_id, provider, external_ref, external_amount, matched_journal_id, status, notes, reconciled_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ${matchedJournalId ? "NOW()" : "NULL"})`,
    [clubId, provider, externalRef, externalAmount, matchedJournalId, status, notes ?? null]
  );
  return id;
}

/**
 * Attempt auto-reconciliation: match external records to ledger journals by amount + date.
 */
export async function autoReconcile(
  clubId: number,
  provider: string,
  externalRecords: { ref: string; amount: number; date: string }[],
): Promise<{ matched: number; unmatched: number }> {
  let matched = 0, unmatched = 0;
  const clearingCode = getProviderClearingCode(provider);

  for (const ext of externalRecords) {
    // Try to find a journal with matching amount on the same date
    const journal = await row<any>(
      `SELECT j.id FROM ledger_journals j
       JOIN ledger_entries e ON e.journal_id = j.id
       JOIN ledger_accounts a ON a.id = e.account_id
       WHERE j.club_id = ? AND a.code = ? AND a.club_id = ?
         AND e.debit = ? AND j.journal_date = ?
         AND j.reversed_by_id IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM reconciliation_records rr
           WHERE rr.matched_journal_id = j.id AND rr.status = 'matched'
         )
       LIMIT 1`,
      [clubId, clearingCode, clubId, ext.amount, ext.date]
    );

    if (journal) {
      await reconcileTransaction(clubId, provider, ext.ref, ext.amount, journal.id);
      matched++;
    } else {
      await reconcileTransaction(clubId, provider, ext.ref, ext.amount, null);
      unmatched++;
    }
  }

  return { matched, unmatched };
}

/**
 * Get settlement batches for a club.
 */
export async function getSettlementBatches(
  clubId: number,
  options?: { provider?: string; status?: string; limit?: number },
): Promise<SettlementBatch[]> {
  let sql = "SELECT * FROM settlement_batches WHERE club_id = ?";
  const params: any[] = [clubId];

  if (options?.provider) {
    sql += " AND provider = ?";
    params.push(options.provider);
  }
  if (options?.status) {
    sql += " AND status = ?";
    params.push(options.status);
  }
  sql += " ORDER BY created_at DESC";
  if (options?.limit) {
    sql += ` LIMIT ${Number(options.limit)}`;
  }

  return query<SettlementBatch>(sql, params);
}

/**
 * Get reconciliation records for a club.
 */
export async function getReconciliationRecords(
  clubId: number,
  options?: { provider?: string; status?: string; limit?: number },
): Promise<any[]> {
  let sql = "SELECT * FROM reconciliation_records WHERE club_id = ?";
  const params: any[] = [clubId];

  if (options?.provider) {
    sql += " AND provider = ?";
    params.push(options.provider);
  }
  if (options?.status) {
    sql += " AND status = ?";
    params.push(options.status);
  }
  sql += " ORDER BY created_at DESC";
  if (options?.limit) {
    sql += ` LIMIT ${Number(options.limit)}`;
  }

  return query<any>(sql, params);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getProviderClearingCode(provider: string): string {
  switch (provider) {
    case "payfast": return "1030";
    case "stitch": return "1031";
    case "ozow": return "1032";
    case "yoco": return "1033";
    case "stripe": return "1034";
    default: return "1030";
  }
}

function getProviderFeeRate(provider: string): number {
  // Default fee rates (can be overridden per club via config)
  switch (provider) {
    case "payfast": return 0.035;  // 3.5%
    case "stitch": return 0.01;   // 1%
    case "ozow": return 0.015;    // 1.5%
    case "yoco": return 0.0275;   // 2.75%
    case "stripe": return 0.029;  // 2.9%
    default: return 0.03;
  }
}
