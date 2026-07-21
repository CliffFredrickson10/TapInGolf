import { Router, Request, Response } from "express";
import {
  getAccounts,
  getJournals,
  getJournalDetail,
  getTrialBalance,
  postJournal,
  reverseJournal,
  provisionChartOfAccounts,
  getAccountBalance,
  getJournalsBySource,
} from "../lib/ledger";
import { requireClubAuth, getClub } from "../lib/portalAuth";
import { query, row } from "../lib/pg";
import { logger } from "../lib/logger";

const router = Router();

// ── Provision Chart of Accounts ──────────────────────────────────────────────
router.post("/portal/ledger/provision", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  try {
    await provisionChartOfAccounts(club.id);
    res.json({ message: "Chart of accounts provisioned", club_id: club.id });
  } catch (e: any) {
    logger.error({ err: e, club_id: club.id }, "Failed to provision COA");
    res.status(500).json({ message: e.message });
  }
});

// ── Accounts ─────────────────────────────────────────────────────────────────
router.get("/portal/ledger/accounts", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const accounts = await getAccounts(club.id);
  res.json(accounts);
});

// ── Post Manual Journal ──────────────────────────────────────────────────────
router.post("/portal/ledger/journals", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const { journal_date, description, entries } = req.body;

  if (!description || !entries || !Array.isArray(entries) || entries.length < 2) {
    res.status(400).json({ message: "Description and at least 2 entries required" });
    return;
  }

  try {
    const journalId = await postJournal({
      club_id: club.id,
      journal_date,
      description,
      source_module: "manual",
      entries,
      posted_by: (req as any).userId ?? null,
    });
    res.json({ message: "Journal posted", journal_id: journalId });
  } catch (e: any) {
    res.status(400).json({ message: e.message });
  }
});

// ── List Journals ────────────────────────────────────────────────────────────
router.get("/portal/ledger/journals", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const { from, to, source_module, limit, offset } = req.query as any;
  const journals = await getJournals(club.id, {
    from, to, source_module,
    limit: limit ? Number(limit) : 50,
    offset: offset ? Number(offset) : 0,
  });
  res.json(journals);
});

// ── Journal Detail ───────────────────────────────────────────────────────────
router.get("/portal/ledger/journals/:id", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const journalId = Number(req.params.id);
  const detail = await getJournalDetail(journalId);
  if (!detail || detail.journal.club_id !== club.id) {
    res.status(404).json({ message: "Journal not found" });
    return;
  }
  res.json(detail);
});

// ── Reverse Journal ──────────────────────────────────────────────────────────
router.post("/portal/ledger/journals/:id/reverse", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const journalId = Number(req.params.id);
  const { reason } = req.body;

  if (!reason) {
    res.status(400).json({ message: "Reason is required for reversal" });
    return;
  }

  // Verify ownership
  const journal = await row<{ club_id: number }>(
    "SELECT club_id FROM ledger_journals WHERE id = ?",
    [journalId]
  );
  if (!journal || journal.club_id !== club.id) {
    res.status(404).json({ message: "Journal not found" });
    return;
  }

  try {
    const reversalId = await reverseJournal(journalId, reason, (req as any).userId);
    res.json({ message: "Journal reversed", reversal_journal_id: reversalId });
  } catch (e: any) {
    res.status(400).json({ message: e.message });
  }
});

// ── Trial Balance ────────────────────────────────────────────────────────────
router.get("/portal/ledger/trial-balance", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const { from, to } = req.query as any;

  if (!from || !to) {
    res.status(400).json({ message: "from and to date parameters required" });
    return;
  }

  const trialBalance = await getTrialBalance(club.id, from, to);
  const totalDebits = trialBalance.reduce((s, r) => s + Number(r.debit_total), 0);
  const totalCredits = trialBalance.reduce((s, r) => s + Number(r.credit_total), 0);

  res.json({
    accounts: trialBalance,
    totals: {
      debit: Math.round(totalDebits * 100) / 100,
      credit: Math.round(totalCredits * 100) / 100,
      balanced: Math.abs(totalDebits - totalCredits) < 0.01,
    },
  });
});

// ── Account Balance ──────────────────────────────────────────────────────────
router.get("/portal/ledger/accounts/:id/balance", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const accountId = Number(req.params.id);
  const { as_of } = req.query as any;

  // Verify ownership
  const account = await row<{ club_id: number }>(
    "SELECT club_id FROM ledger_accounts WHERE id = ?",
    [accountId]
  );
  if (!account || account.club_id !== club.id) {
    res.status(404).json({ message: "Account not found" });
    return;
  }

  const balance = await getAccountBalance(accountId, as_of);
  res.json({ account_id: accountId, balance, as_of: as_of ?? "current" });
});

// ── Journals by Source ───────────────────────────────────────────────────────
router.get("/portal/ledger/source/:module/:sourceId", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const { module: sourceModule, sourceId } = req.params;
  const journals = await getJournalsBySource(club.id, String(sourceModule), Number(sourceId));
  res.json(journals);
});

// ── Profit & Loss Report ─────────────────────────────────────────────────────
router.get("/portal/ledger/reports/profit-loss", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const { from, to } = req.query as any;
  if (!from || !to) {
    res.status(400).json({ message: "from and to date parameters required" });
    return;
  }

  const revenue = await query<{ code: string; name: string; total: string }>(
    `SELECT la.code, la.name,
            (COALESCE(SUM(le.credit), 0) - COALESCE(SUM(le.debit), 0)) AS total
     FROM ledger_accounts la
     LEFT JOIN ledger_entries le ON le.account_id = la.id
     LEFT JOIN ledger_journals lj ON le.journal_id = lj.id
       AND lj.journal_date BETWEEN ? AND ?
     WHERE la.club_id = ? AND la.type = 'revenue' AND la.active = 1
     GROUP BY la.id, la.code, la.name
     HAVING (COALESCE(SUM(le.credit), 0) - COALESCE(SUM(le.debit), 0)) != 0
     ORDER BY la.code`,
    [from, to, club.id]
  );

  const expenses = await query<{ code: string; name: string; total: string }>(
    `SELECT la.code, la.name,
            (COALESCE(SUM(le.debit), 0) - COALESCE(SUM(le.credit), 0)) AS total
     FROM ledger_accounts la
     LEFT JOIN ledger_entries le ON le.account_id = la.id
     LEFT JOIN ledger_journals lj ON le.journal_id = lj.id
       AND lj.journal_date BETWEEN ? AND ?
     WHERE la.club_id = ? AND la.type = 'expense' AND la.active = 1
     GROUP BY la.id, la.code, la.name
     HAVING (COALESCE(SUM(le.debit), 0) - COALESCE(SUM(le.credit), 0)) != 0
     ORDER BY la.code`,
    [from, to, club.id]
  );

  const totalRevenue = revenue.reduce((s, r) => s + Number(r.total), 0);
  const totalExpenses = expenses.reduce((s, r) => s + Number(r.total), 0);

  res.json({
    period: { from, to },
    revenue: revenue.map(r => ({ ...r, total: Number(r.total) })),
    expenses: expenses.map(r => ({ ...r, total: Number(r.total) })),
    total_revenue: Math.round(totalRevenue * 100) / 100,
    total_expenses: Math.round(totalExpenses * 100) / 100,
    net_profit: Math.round((totalRevenue - totalExpenses) * 100) / 100,
  });
});

// ── Balance Sheet Report ─────────────────────────────────────────────────────
router.get("/portal/ledger/reports/balance-sheet", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const { as_of } = req.query as any;
  const dateFilter = as_of ?? new Date().toISOString().slice(0, 10);

  const rows = await query<{ code: string; name: string; type: string; balance: string }>(
    `SELECT la.code, la.name, la.type,
            CASE WHEN la.type IN ('asset','expense')
              THEN COALESCE(SUM(le.debit), 0) - COALESCE(SUM(le.credit), 0)
              ELSE COALESCE(SUM(le.credit), 0) - COALESCE(SUM(le.debit), 0)
            END AS balance
     FROM ledger_accounts la
     LEFT JOIN ledger_entries le ON le.account_id = la.id
     LEFT JOIN ledger_journals lj ON le.journal_id = lj.id
       AND lj.journal_date <= ?
     WHERE la.club_id = ? AND la.active = 1
     GROUP BY la.id, la.code, la.name, la.type
     HAVING CASE WHEN la.type IN ('asset','expense')
              THEN COALESCE(SUM(le.debit), 0) - COALESCE(SUM(le.credit), 0)
              ELSE COALESCE(SUM(le.credit), 0) - COALESCE(SUM(le.debit), 0)
            END != 0
     ORDER BY la.code`,
    [dateFilter, club.id]
  );

  const assets = rows.filter(r => r.type === "asset").map(r => ({ ...r, balance: Number(r.balance) }));
  const liabilities = rows.filter(r => r.type === "liability").map(r => ({ ...r, balance: Number(r.balance) }));
  const equity = rows.filter(r => r.type === "equity").map(r => ({ ...r, balance: Number(r.balance) }));

  const totalAssets = assets.reduce((s, r) => s + r.balance, 0);
  const totalLiabilities = liabilities.reduce((s, r) => s + r.balance, 0);
  const totalEquity = equity.reduce((s, r) => s + r.balance, 0);

  res.json({
    as_of: dateFilter,
    assets,
    liabilities,
    equity,
    total_assets: Math.round(totalAssets * 100) / 100,
    total_liabilities: Math.round(totalLiabilities * 100) / 100,
    total_equity: Math.round(totalEquity * 100) / 100,
    balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Settlement & Reconciliation Endpoints
// ══════════════════════════════════════════════════════════════════════════════

import {
  generateSettlementBatch,
  confirmSettlement,
  cancelSettlement,
  getSettlementBatches,
  getReconciliationRecords,
  reconcileTransaction,
  autoReconcile,
} from "../lib/settlement";

import {
  getConnections,
  createConnection,
  updateConnectionConfig,
  disconnectProvider,
  syncJournals,
  getSyncStatus,
  getAdapter,
  getAvailableProviders,
} from "../lib/accounting";
import "../lib/accounting-xero"; // Register Xero adapter
import "../lib/accounting-sage"; // Register Sage adapter
import "../lib/accounting-quickbooks"; // Register QuickBooks adapter
import "../lib/accounting-zoho"; // Register Zoho adapter

// ── List Settlement Batches ──────────────────────────────────────────────────
router.get("/portal/ledger/settlements", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const { provider, status, limit } = req.query as any;
  const batches = await getSettlementBatches(club.id, {
    provider: provider ?? undefined,
    status: status ?? undefined,
    limit: limit ? Number(limit) : 50,
  });
  res.json(batches);
});

// ── Generate Settlement Batch ────────────────────────────────────────────────
router.post("/portal/ledger/settlements/generate", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const { provider, period_from, period_to } = req.body ?? {};
  if (!provider || !period_from || !period_to) {
    res.status(400).json({ message: "provider, period_from, and period_to are required" });
    return;
  }
  try {
    const batchId = await generateSettlementBatch(club.id, provider, period_from, period_to);
    res.json({ batch_id: batchId });
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

// ── Confirm Settlement ───────────────────────────────────────────────────────
router.post("/portal/ledger/settlements/:id/confirm", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const batchId = parseInt(String(req.params["id"]), 10);
  try {
    const journalId = await confirmSettlement(batchId);
    res.json({ journal_id: journalId });
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

// ── Cancel Settlement ────────────────────────────────────────────────────────
router.post("/portal/ledger/settlements/:id/cancel", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const batchId = parseInt(String(req.params["id"]), 10);
  try {
    await cancelSettlement(batchId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

// ── Reconciliation Records ───────────────────────────────────────────────────
router.get("/portal/ledger/reconciliation", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const { provider, status, limit } = req.query as any;
  const records = await getReconciliationRecords(club.id, {
    provider: provider ?? undefined,
    status: status ?? undefined,
    limit: limit ? Number(limit) : 50,
  });
  res.json(records);
});

// ── Auto-Reconcile ───────────────────────────────────────────────────────────
router.post("/portal/ledger/reconciliation/auto", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const { provider, records } = req.body ?? {};
  if (!provider || !Array.isArray(records)) {
    res.status(400).json({ message: "provider and records[] are required" });
    return;
  }
  try {
    const result = await autoReconcile(club.id, provider, records);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// ── Manual Reconciliation ────────────────────────────────────────────────────
router.post("/portal/ledger/reconciliation/manual", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const { provider, external_ref, external_amount, journal_id, notes } = req.body ?? {};
  if (!provider || !external_ref || external_amount == null) {
    res.status(400).json({ message: "provider, external_ref, and external_amount are required" });
    return;
  }
  const id = await reconcileTransaction(
    club.id,
    provider,
    external_ref,
    Number(external_amount),
    journal_id ? Number(journal_id) : null,
    notes,
  );
  res.json({ id });
});

// ══════════════════════════════════════════════════════════════════════════════
// Accounting Integration Endpoints
// ══════════════════════════════════════════════════════════════════════════════

// ── Available Providers ──────────────────────────────────────────────────────
router.get("/portal/ledger/accounting/providers", requireClubAuth, async (_req: Request, res: Response): Promise<void> => {
  res.json({ providers: getAvailableProviders() });
});

// ── List Connections ─────────────────────────────────────────────────────────
router.get("/portal/ledger/accounting/connections", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const connections = await getConnections(club.id);
  // Strip sensitive credentials from response
  res.json(connections.map(c => ({
    ...c,
    credentials: undefined,
    has_credentials: !!c.credentials,
  })));
});

// ── Create/Update Connection ─────────────────────────────────────────────────
router.post("/portal/ledger/accounting/connections", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const { provider, credentials, config } = req.body ?? {};
  if (!provider || !credentials) {
    res.status(400).json({ message: "provider and credentials are required" });
    return;
  }

  const adapter = getAdapter(provider);
  if (!adapter) {
    res.status(400).json({ message: `Provider "${provider}" is not supported. Available: ${getAvailableProviders().join(", ")}` });
    return;
  }

  // Test connection before saving
  const valid = await adapter.testConnection(credentials);
  if (!valid) {
    res.status(400).json({ message: "Connection test failed — invalid credentials or provider unreachable" });
    return;
  }

  const id = await createConnection(club.id, provider, credentials, config);
  res.json({ id, status: "active" });
});

// ── Update Connection Config (account mappings) ──────────────────────────────
router.put("/portal/ledger/accounting/connections/:id/config", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const connectionId = parseInt(String(req.params["id"]), 10);
  const { config } = req.body ?? {};
  if (!config) { res.status(400).json({ message: "config is required" }); return; }
  await updateConnectionConfig(connectionId, config);
  res.json({ success: true });
});

// ── Disconnect Provider ──────────────────────────────────────────────────────
router.post("/portal/ledger/accounting/connections/:id/disconnect", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const connectionId = parseInt(String(req.params["id"]), 10);
  await disconnectProvider(connectionId);
  res.json({ success: true });
});

// ── Trigger Sync ─────────────────────────────────────────────────────────────
router.post("/portal/ledger/accounting/connections/:id/sync", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const connectionId = parseInt(String(req.params["id"]), 10);
  const { limit } = req.body ?? {};

  const conn = await row<any>("SELECT provider FROM accounting_connections WHERE id = ?", [connectionId]);
  if (!conn) { res.status(404).json({ message: "Connection not found" }); return; }

  const adapter = getAdapter(conn.provider);
  if (!adapter) { res.status(400).json({ message: `No adapter for ${conn.provider}` }); return; }

  try {
    const result = await syncJournals(connectionId, adapter, limit ?? 50);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// ── Sync Status ──────────────────────────────────────────────────────────────
router.get("/portal/ledger/accounting/connections/:id/status", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const connectionId = parseInt(String(req.params["id"]), 10);
  try {
    const status = await getSyncStatus(connectionId);
    res.json(status);
  } catch (err: any) {
    res.status(404).json({ message: err.message });
  }
});

// ── Get External Accounts (for mapping UI) ───────────────────────────────────
router.get("/portal/ledger/accounting/connections/:id/accounts", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const connectionId = parseInt(String(req.params["id"]), 10);
  const conn = await row<any>(
    "SELECT * FROM accounting_connections WHERE id = ?",
    [connectionId]
  );
  if (!conn) { res.status(404).json({ message: "Connection not found" }); return; }

  const adapter = getAdapter(conn.provider);
  if (!adapter?.getExternalAccounts) {
    res.status(400).json({ message: "Provider does not support account listing" });
    return;
  }

  const accounts = await adapter.getExternalAccounts(conn);
  res.json(accounts);
});

// ══════════════════════════════════════════════════════════════════════════════
// Xero OAuth2 Flow
// ══════════════════════════════════════════════════════════════════════════════

const XERO_CLIENT_ID = process.env["XERO_CLIENT_ID"] ?? "";
const XERO_CLIENT_SECRET = process.env["XERO_CLIENT_SECRET"] ?? "";
const XERO_REDIRECT_URI = process.env["XERO_REDIRECT_URI"] ?? "";
const XERO_SCOPES = "openid profile email accounting.transactions accounting.settings accounting.contacts offline_access";

// ── Initiate Xero OAuth ──────────────────────────────────────────────────────
router.get("/portal/ledger/accounting/xero/connect", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  if (!XERO_CLIENT_ID || !XERO_REDIRECT_URI) {
    res.status(500).json({ message: "Xero integration not configured (missing XERO_CLIENT_ID or XERO_REDIRECT_URI)" });
    return;
  }

  // Store club_id in state so the callback knows which club to link
  const state = Buffer.from(JSON.stringify({ club_id: club.id })).toString("base64url");

  const authUrl = new URL("https://login.xero.com/identity/connect/authorize");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", XERO_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", XERO_REDIRECT_URI);
  authUrl.searchParams.set("scope", XERO_SCOPES);
  authUrl.searchParams.set("state", state);

  res.json({ auth_url: authUrl.toString() });
});

// ── Xero OAuth Callback ──────────────────────────────────────────────────────
router.get("/portal/ledger/accounting/xero/callback", async (req: Request, res: Response): Promise<void> => {
  const { code, state } = req.query as any;

  if (!code || !state) {
    res.status(400).send("Missing code or state parameter");
    return;
  }

  let clubId: number;
  try {
    const parsed = JSON.parse(Buffer.from(state, "base64url").toString());
    clubId = parsed.club_id;
  } catch {
    res.status(400).send("Invalid state parameter");
    return;
  }

  // Exchange code for tokens
  const tokenRes = await fetch("https://identity.xero.com/connect/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: XERO_REDIRECT_URI,
      client_id: XERO_CLIENT_ID,
      client_secret: XERO_CLIENT_SECRET,
    }),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    logger.error({ status: tokenRes.status, body }, "Xero token exchange failed");
    res.status(500).send("Failed to exchange Xero authorization code");
    return;
  }

  const tokens = await tokenRes.json() as any;

  // Get tenant connections (Xero orgs the user has access to)
  const connectionsRes = await fetch("https://api.xero.com/connections", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const xeroConnections = connectionsRes.ok ? await connectionsRes.json() as any[] : [];
  const tenantId = xeroConnections?.[0]?.tenantId ?? null;
  const tenantName = xeroConnections?.[0]?.tenantName ?? "Unknown";

  if (!tenantId) {
    res.status(400).send("No Xero organisation found. Please ensure you have at least one Xero organisation.");
    return;
  }

  // Store credentials
  const credentials = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: Date.now() + (tokens.expires_in ?? 1800) * 1000,
    tenant_id: tenantId,
    tenant_name: tenantName,
    client_id: XERO_CLIENT_ID,
    client_secret: XERO_CLIENT_SECRET,
  };

  await createConnection(clubId, "xero", credentials, { tenant_name: tenantName });

  // Redirect back to the portal integrations page
  const portalUrl = process.env["PORTAL_URL"] ?? "http://localhost:5174";
  res.redirect(`${portalUrl}/finance/integrations?connected=xero`);
});

// ── Refresh Xero Token ───────────────────────────────────────────────────────
router.post("/portal/ledger/accounting/xero/refresh", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const conn = await row<any>(
    "SELECT * FROM accounting_connections WHERE club_id = ? AND provider = 'xero' AND status = 'connected'",
    [club.id]
  );
  if (!conn) { res.status(404).json({ message: "No active Xero connection" }); return; }

  const creds = conn.credentials;
  if (!creds?.refresh_token) {
    res.status(400).json({ message: "No refresh token available — please reconnect" });
    return;
  }

  const tokenRes = await fetch("https://identity.xero.com/connect/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: creds.refresh_token,
      client_id: creds.client_id ?? XERO_CLIENT_ID,
      client_secret: creds.client_secret ?? XERO_CLIENT_SECRET,
    }),
  });

  if (!tokenRes.ok) {
    await query("UPDATE accounting_connections SET status = 'error' WHERE id = ?", [conn.id]);
    res.status(400).json({ message: "Token refresh failed — please reconnect" });
    return;
  }

  const tokens = await tokenRes.json() as any;
  const updatedCreds = {
    ...creds,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: Date.now() + (tokens.expires_in ?? 1800) * 1000,
  };

  await query(
    "UPDATE accounting_connections SET credentials = ?::jsonb WHERE id = ?",
    [JSON.stringify(updatedCreds), conn.id]
  );

  res.json({ success: true, expires_at: updatedCreds.expires_at });
});

// ══════════════════════════════════════════════════════════════════════════════
// Sage OAuth2 Flow
// ══════════════════════════════════════════════════════════════════════════════

const SAGE_CLIENT_ID = process.env["SAGE_CLIENT_ID"] ?? "";
const SAGE_CLIENT_SECRET = process.env["SAGE_CLIENT_SECRET"] ?? "";
const SAGE_REDIRECT_URI = process.env["SAGE_REDIRECT_URI"] ?? "";

router.get("/portal/ledger/accounting/sage/connect", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  if (!SAGE_CLIENT_ID || !SAGE_REDIRECT_URI) {
    res.status(500).json({ message: "Sage integration not configured" }); return;
  }
  const state = Buffer.from(JSON.stringify({ club_id: club.id, provider: "sage" })).toString("base64url");
  const authUrl = new URL("https://www.sageone.com/oauth2/auth/central");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", SAGE_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", SAGE_REDIRECT_URI);
  authUrl.searchParams.set("scope", "full_access");
  authUrl.searchParams.set("state", state);
  res.json({ auth_url: authUrl.toString() });
});

router.get("/portal/ledger/accounting/sage/callback", async (req: Request, res: Response): Promise<void> => {
  const { code, state } = req.query as any;
  if (!code || !state) { res.status(400).send("Missing code or state"); return; }

  let clubId: number;
  try { clubId = JSON.parse(Buffer.from(state, "base64url").toString()).club_id; }
  catch { res.status(400).send("Invalid state"); return; }

  const tokenRes = await fetch("https://oauth.accounting.sage.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: SAGE_REDIRECT_URI,
      client_id: SAGE_CLIENT_ID,
      client_secret: SAGE_CLIENT_SECRET,
    }),
  });

  if (!tokenRes.ok) {
    logger.error({ status: tokenRes.status }, "Sage token exchange failed");
    res.status(500).send("Failed to exchange Sage authorization code"); return;
  }

  const tokens = await tokenRes.json() as any;
  const credentials = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    client_id: SAGE_CLIENT_ID,
    client_secret: SAGE_CLIENT_SECRET,
  };

  await createConnection(clubId, "sage", credentials, {});
  const portalUrl = process.env["PORTAL_URL"] ?? "http://localhost:5174";
  res.redirect(`${portalUrl}/finance/integrations?connected=sage`);
});

// ══════════════════════════════════════════════════════════════════════════════
// QuickBooks OAuth2 Flow
// ══════════════════════════════════════════════════════════════════════════════

const QB_CLIENT_ID = process.env["QUICKBOOKS_CLIENT_ID"] ?? "";
const QB_CLIENT_SECRET = process.env["QUICKBOOKS_CLIENT_SECRET"] ?? "";
const QB_REDIRECT_URI = process.env["QUICKBOOKS_REDIRECT_URI"] ?? "";

router.get("/portal/ledger/accounting/quickbooks/connect", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  if (!QB_CLIENT_ID || !QB_REDIRECT_URI) {
    res.status(500).json({ message: "QuickBooks integration not configured" }); return;
  }
  const state = Buffer.from(JSON.stringify({ club_id: club.id, provider: "quickbooks" })).toString("base64url");
  const authUrl = new URL("https://appcenter.intuit.com/connect/oauth2");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", QB_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", QB_REDIRECT_URI);
  authUrl.searchParams.set("scope", "com.intuit.quickbooks.accounting");
  authUrl.searchParams.set("state", state);
  res.json({ auth_url: authUrl.toString() });
});

router.get("/portal/ledger/accounting/quickbooks/callback", async (req: Request, res: Response): Promise<void> => {
  const { code, state, realmId } = req.query as any;
  if (!code || !state) { res.status(400).send("Missing code or state"); return; }

  let clubId: number;
  try { clubId = JSON.parse(Buffer.from(state, "base64url").toString()).club_id; }
  catch { res.status(400).send("Invalid state"); return; }

  const basicAuth = Buffer.from(`${QB_CLIENT_ID}:${QB_CLIENT_SECRET}`).toString("base64");
  const tokenRes = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: QB_REDIRECT_URI,
    }),
  });

  if (!tokenRes.ok) {
    logger.error({ status: tokenRes.status }, "QuickBooks token exchange failed");
    res.status(500).send("Failed to exchange QuickBooks authorization code"); return;
  }

  const tokens = await tokenRes.json() as any;
  const credentials = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    realm_id: realmId ?? "",
    client_id: QB_CLIENT_ID,
    client_secret: QB_CLIENT_SECRET,
  };

  await createConnection(clubId, "quickbooks", credentials, { realm_id: realmId });
  const portalUrl = process.env["PORTAL_URL"] ?? "http://localhost:5174";
  res.redirect(`${portalUrl}/finance/integrations?connected=quickbooks`);
});

// ══════════════════════════════════════════════════════════════════════════════
// Zoho Books OAuth2 Flow
// ══════════════════════════════════════════════════════════════════════════════

const ZOHO_CLIENT_ID = process.env["ZOHO_CLIENT_ID"] ?? "";
const ZOHO_CLIENT_SECRET = process.env["ZOHO_CLIENT_SECRET"] ?? "";
const ZOHO_REDIRECT_URI = process.env["ZOHO_REDIRECT_URI"] ?? "";
const ZOHO_REGION = process.env["ZOHO_REGION"] ?? "com"; // com, eu, in, com.au

router.get("/portal/ledger/accounting/zoho/connect", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  if (!ZOHO_CLIENT_ID || !ZOHO_REDIRECT_URI) {
    res.status(500).json({ message: "Zoho integration not configured" }); return;
  }
  const state = Buffer.from(JSON.stringify({ club_id: club.id, provider: "zoho" })).toString("base64url");
  const authUrl = new URL(`https://accounts.zoho.${ZOHO_REGION}/oauth/v2/auth`);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", ZOHO_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", ZOHO_REDIRECT_URI);
  authUrl.searchParams.set("scope", "ZohoBooks.fullaccess.all");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  res.json({ auth_url: authUrl.toString() });
});

router.get("/portal/ledger/accounting/zoho/callback", async (req: Request, res: Response): Promise<void> => {
  const { code, state } = req.query as any;
  if (!code || !state) { res.status(400).send("Missing code or state"); return; }

  let clubId: number;
  try { clubId = JSON.parse(Buffer.from(state, "base64url").toString()).club_id; }
  catch { res.status(400).send("Invalid state"); return; }

  const tokenRes = await fetch(`https://accounts.zoho.${ZOHO_REGION}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: ZOHO_REDIRECT_URI,
      client_id: ZOHO_CLIENT_ID,
      client_secret: ZOHO_CLIENT_SECRET,
    }),
  });

  if (!tokenRes.ok) {
    logger.error({ status: tokenRes.status }, "Zoho token exchange failed");
    res.status(500).send("Failed to exchange Zoho authorization code"); return;
  }

  const tokens = await tokenRes.json() as any;

  // Get organization ID
  const orgsRes = await fetch(`https://www.zohoapis.${ZOHO_REGION}/books/v3/organizations`, {
    headers: { Authorization: `Zoho-oauthtoken ${tokens.access_token}` },
  });
  const orgs = orgsRes.ok ? await orgsRes.json() as any : null;
  const orgId = orgs?.organizations?.[0]?.organization_id ?? "";
  const orgName = orgs?.organizations?.[0]?.name ?? "";

  const credentials = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    organization_id: orgId,
    region: ZOHO_REGION,
    client_id: ZOHO_CLIENT_ID,
    client_secret: ZOHO_CLIENT_SECRET,
  };

  await createConnection(clubId, "zoho", credentials, { organization_name: orgName });
  const portalUrl = process.env["PORTAL_URL"] ?? "http://localhost:5174";
  res.redirect(`${portalUrl}/finance/integrations?connected=zoho`);
});

export default router;
