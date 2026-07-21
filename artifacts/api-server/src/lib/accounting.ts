/**
 * Accounting Integration Layer
 *
 * Provides a provider-agnostic interface for syncing ledger journals
 * to external accounting systems (Xero, Sage, QuickBooks, etc.).
 *
 * The internal ledger is always the source of truth. External systems
 * receive data generated from ledger journals.
 */
import { query, row, exec, run } from "./pg";
import { logger } from "./logger";

// ─── Provider Adapter Interface ──────────────────────────────────────────────

export interface AccountingAdapter {
  /** Provider name (xero, sage, quickbooks, etc.) */
  readonly provider: string;

  /** Test connection validity */
  testConnection(credentials: any): Promise<boolean>;

  /** Push a journal entry to the external system */
  pushJournal(connection: AccountingConnection, journalData: ExternalJournalData): Promise<string>;

  /** Push an invoice to the external system */
  pushInvoice?(connection: AccountingConnection, invoiceData: ExternalInvoiceData): Promise<string>;

  /** Get chart of accounts from external system (for mapping) */
  getExternalAccounts?(connection: AccountingConnection): Promise<ExternalAccount[]>;

  /** Refresh OAuth tokens if needed */
  refreshToken?(connection: AccountingConnection): Promise<any>;
}

export interface AccountingConnection {
  id: number;
  club_id: number;
  provider: string;
  credentials: any;
  status: string;
  config: any; // Account mappings, sync preferences
  last_sync_at: string | null;
}

export interface ExternalJournalData {
  date: string;
  reference: string;
  description: string;
  lines: { account_code: string; description: string; debit: number; credit: number }[];
  metadata?: Record<string, any>;
}

export interface ExternalInvoiceData {
  date: string;
  due_date: string;
  reference: string;
  contact_name: string;
  contact_email?: string;
  lines: { description: string; quantity: number; unit_amount: number; account_code: string; tax_type?: string }[];
}

export interface ExternalAccount {
  code: string;
  name: string;
  type: string;
}

// ─── Connection Management ───────────────────────────────────────────────────

export async function getConnection(clubId: number, provider: string): Promise<AccountingConnection | null> {
  return row<AccountingConnection>(
    "SELECT * FROM accounting_connections WHERE club_id = ? AND provider = ? AND status = 'connected'",
    [clubId, provider]
  );
}

export async function getConnections(clubId: number): Promise<AccountingConnection[]> {
  return query<AccountingConnection>(
    "SELECT * FROM accounting_connections WHERE club_id = ? ORDER BY provider",
    [clubId]
  );
}

export async function createConnection(
  clubId: number,
  provider: string,
  credentials: any,
  config?: any,
): Promise<number> {
  return exec(
    `INSERT INTO accounting_connections (club_id, provider, credentials, config, status)
     VALUES (?, ?, ?::jsonb, ?::jsonb, 'connected')
     ON CONFLICT (club_id, provider)
     DO UPDATE SET credentials = EXCLUDED.credentials, config = COALESCE(EXCLUDED.config, accounting_connections.config), status = 'connected'
     RETURNING id`,
    [clubId, provider, JSON.stringify(credentials), JSON.stringify(config ?? {})]
  );
}

export async function updateConnectionConfig(connectionId: number, config: any): Promise<void> {
  await run(
    "UPDATE accounting_connections SET config = ?::jsonb WHERE id = ?",
    [JSON.stringify(config), connectionId]
  );
}

export async function disconnectProvider(connectionId: number): Promise<void> {
  await run("UPDATE accounting_connections SET status = 'disconnected' WHERE id = ?", [connectionId]);
}

// ─── Sync Engine ─────────────────────────────────────────────────────────────

/**
 * Sync unsynced journals to the connected accounting provider.
 * Returns count of journals synced.
 */
export async function syncJournals(
  connectionId: number,
  adapter: AccountingAdapter,
  limit: number = 50,
): Promise<{ synced: number; failed: number; skipped: number }> {
  const conn = await row<AccountingConnection>(
    "SELECT * FROM accounting_connections WHERE id = ? AND status = 'connected'",
    [connectionId]
  );
  if (!conn) throw new Error("Connection not found or inactive");

  // Get unsynced journals for this club
  const unsyncedJournals = await query<any>(
    `SELECT j.* FROM ledger_journals j
     WHERE j.club_id = ?
       AND NOT EXISTS (
         SELECT 1 FROM accounting_sync_log sl
         WHERE sl.journal_id = j.id AND sl.connection_id = ? AND sl.status IN ('synced', 'skipped')
       )
     ORDER BY j.created_at ASC
     LIMIT ${Number(limit)}`,
    [conn.club_id, connectionId]
  );

  let synced = 0, failed = 0, skipped = 0;

  for (const journal of unsyncedJournals) {
    // Check if this source module should be synced (based on connection config)
    const syncModules = conn.config?.sync_modules;
    if (syncModules && !syncModules.includes(journal.source_module)) {
      await logSync(connectionId, journal.id, "skipped", null, null);
      skipped++;
      continue;
    }

    // Get journal entries with account details
    const entries = await query<any>(
      `SELECT le.debit, le.credit, le.description, la.code, la.name
       FROM ledger_entries le
       JOIN ledger_accounts la ON la.id = le.account_id
       WHERE le.journal_id = ?`,
      [journal.id]
    );

    // Map internal account codes to external codes (from connection config)
    const accountMap: Record<string, string> = conn.config?.account_mappings ?? {};

    const externalData: ExternalJournalData = {
      date: journal.journal_date,
      reference: journal.journal_ref,
      description: journal.description,
      lines: entries.map((e: any) => ({
        account_code: accountMap[e.code] ?? e.code,
        description: e.description ?? "",
        debit: Number(e.debit) || 0,
        credit: Number(e.credit) || 0,
      })),
    };

    try {
      const externalId = await adapter.pushJournal(conn, externalData);
      await logSync(connectionId, journal.id, "synced", externalId, null);
      synced++;
    } catch (err: any) {
      const attempts = await incrementSyncAttempts(connectionId, journal.id);
      await logSync(connectionId, journal.id, "failed", null, err.message, attempts);
      failed++;

      // If too many failures on a single journal, skip it to avoid blocking the queue
      if (attempts >= 3) {
        logger.warn({ journal_id: journal.id, connectionId }, "Skipping journal after 3 failed sync attempts");
      }
    }
  }

  // Update last_sync_at
  if (synced > 0) {
    await run("UPDATE accounting_connections SET last_sync_at = NOW() WHERE id = ?", [connectionId]);
  }

  return { synced, failed, skipped };
}

// ─── Sync Log ────────────────────────────────────────────────────────────────

async function logSync(
  connectionId: number,
  journalId: number,
  status: "synced" | "failed" | "skipped",
  externalId: string | null,
  errorMessage: string | null,
  attempts?: number,
): Promise<void> {
  await exec(
    `INSERT INTO accounting_sync_log (connection_id, journal_id, direction, status, external_id, error_message, attempts, synced_at)
     VALUES (?, ?, 'outbound', ?, ?, ?, ?, ${status === "synced" ? "NOW()" : "NULL"})
     ON CONFLICT (connection_id, journal_id) WHERE direction = 'outbound'
     DO UPDATE SET status = EXCLUDED.status, external_id = COALESCE(EXCLUDED.external_id, accounting_sync_log.external_id),
       error_message = EXCLUDED.error_message, attempts = COALESCE(EXCLUDED.attempts, accounting_sync_log.attempts + 1),
       synced_at = EXCLUDED.synced_at`,
    [connectionId, journalId, status, externalId, errorMessage, attempts ?? 1]
  );
}

async function incrementSyncAttempts(connectionId: number, journalId: number): Promise<number> {
  const existing = await row<{ attempts: number }>(
    "SELECT attempts FROM accounting_sync_log WHERE connection_id = ? AND journal_id = ? AND direction = 'outbound'",
    [connectionId, journalId]
  );
  return (existing?.attempts ?? 0) + 1;
}

/**
 * Get sync status summary for a connection.
 */
export async function getSyncStatus(connectionId: number): Promise<{
  total_journals: number;
  synced: number;
  failed: number;
  pending: number;
}> {
  const conn = await row<AccountingConnection>(
    "SELECT * FROM accounting_connections WHERE id = ?",
    [connectionId]
  );
  if (!conn) throw new Error("Connection not found");

  const total = await row<{ cnt: string }>(
    "SELECT COUNT(*) AS cnt FROM ledger_journals WHERE club_id = ?",
    [conn.club_id]
  );

  const syncedCount = await row<{ cnt: string }>(
    "SELECT COUNT(*) AS cnt FROM accounting_sync_log WHERE connection_id = ? AND status = 'synced'",
    [connectionId]
  );

  const failedCount = await row<{ cnt: string }>(
    "SELECT COUNT(*) AS cnt FROM accounting_sync_log WHERE connection_id = ? AND status = 'failed'",
    [connectionId]
  );

  const totalNum = Number(total?.cnt ?? 0);
  const syncedNum = Number(syncedCount?.cnt ?? 0);
  const failedNum = Number(failedCount?.cnt ?? 0);

  return {
    total_journals: totalNum,
    synced: syncedNum,
    failed: failedNum,
    pending: totalNum - syncedNum - failedNum,
  };
}

// ─── Provider Registry ───────────────────────────────────────────────────────

const adapters = new Map<string, AccountingAdapter>();

export function registerAdapter(adapter: AccountingAdapter): void {
  adapters.set(adapter.provider, adapter);
}

export function getAdapter(provider: string): AccountingAdapter | undefined {
  return adapters.get(provider);
}

export function getAvailableProviders(): string[] {
  return Array.from(adapters.keys());
}
