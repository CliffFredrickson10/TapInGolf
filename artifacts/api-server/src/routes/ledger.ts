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
  const journals = await getJournalsBySource(club.id, sourceModule, Number(sourceId));
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

export default router;
