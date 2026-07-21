import { Router, type IRouter } from "express";
import { query, row, exec } from "../lib/pg";
import { getUser } from "../lib/auth";
import { buildPayFastPaymentUrl } from "../lib/payfast";
import { postVoucherRedemptionJournal } from "../lib/ledger-posting";

const router: IRouter = Router();

async function ensureWallet(userId: number): Promise<number> {
  const wallet = await row<any>("SELECT balance FROM wallets WHERE user_id = ?", [userId]);
  if (!wallet) {
    await exec("INSERT INTO wallets (user_id, balance) VALUES (?, 0.00)", [userId]);
    return 0;
  }
  return parseFloat(wallet.balance);
}

// GET /payments/methods — wallet balance only (card saving is disabled)
router.get("/payments/methods", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const balance = await ensureWallet(user.id);
  res.json({ wallet: { balance }, methods: [] });
});

// POST /payments/wallet/topup-url — create a PayFast payment URL for wallet top-up
router.post("/payments/wallet/topup-url", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const amount = parseFloat(req.body?.amount ?? "0");
  if (!amount || amount <= 0 || amount > 10000) {
    res.status(400).json({ message: "Amount must be between R1 and R10,000" }); return;
  }

  // exec() returns the new row's id directly (it appends RETURNING * internally).
  const topupId = await exec(
    "INSERT INTO wallet_topups (user_id, amount, status) VALUES (?, ?, 'pending')",
    [user.id, amount]
  );
  const host = req.get("host") ?? "";

  const pr = buildPayFastPaymentUrl({
    amount,
    merchantReference: `wallet-${topupId}`,
    itemName: "TapIn Golf - Wallet Top Up",
    returnUrl: `https://${host}/booking/success`,
    cancelUrl: `https://${host}/booking/cancel`,
    notifyUrl: `https://${host}/api/payfast/notify`,
    payerFirstName: user.name?.split(" ")[0],
    payerLastName: user.name?.split(" ").slice(1).join(" ") || undefined,
    payerEmail: user.email,
  });

  res.json({ payment_url: pr.url, topup_id: topupId });
});

// POST /payments/wallet/redeem-voucher — redeem a wallet_credit voucher code
router.post("/payments/wallet/redeem-voucher", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const code = String(req.body?.code ?? "").toUpperCase().trim();
  if (!code) { res.status(400).json({ message: "Voucher code is required" }); return; }

  const voucher = await row<any>(
    "SELECT * FROM vouchers WHERE code = ? AND active = 1 AND discount_type = 'wallet_credit'",
    [code]
  );

  if (!voucher) {
    res.status(404).json({ message: "Voucher code not found or not a wallet voucher" }); return;
  }
  if (voucher.expires_at && new Date(voucher.expires_at) < new Date()) {
    res.status(400).json({ message: "This voucher has expired" }); return;
  }
  if (voucher.max_uses !== null && voucher.uses_count >= voucher.max_uses) {
    res.status(400).json({ message: "This voucher has already been fully redeemed" }); return;
  }

  const creditAmount = parseFloat(voucher.discount_value);

  await exec("UPDATE vouchers SET uses_count = uses_count + 1 WHERE id = ?", [voucher.id]);

  const existing = await row<any>("SELECT id FROM wallets WHERE user_id = ?", [user.id]);
  if (existing) {
    await exec("UPDATE wallets SET balance = balance + ? WHERE user_id = ?", [creditAmount, user.id]);
  } else {
    await exec("INSERT INTO wallets (user_id, balance) VALUES (?, ?)", [user.id, creditAmount]);
  }

  const updated = await row<any>("SELECT balance FROM wallets WHERE user_id = ?", [user.id]);

  // Post to financial ledger
  postVoucherRedemptionJournal({
    voucher_id: voucher.id,
    user_id: user.id,
    amount: creditAmount,
    club_id: voucher.club_id ?? undefined,
  }).catch(() => {});

  res.json({ success: true, credit_amount: creditAmount, new_balance: parseFloat(updated.balance) });
});

// GET /payments/wallet/topup-status/:id — poll top-up completion status
router.get("/payments/wallet/topup-status/:id", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const topup = await row<any>(
    "SELECT status FROM wallet_topups WHERE id = ? AND user_id = ?",
    [req.params["id"], user.id]
  );
  if (!topup) { res.status(404).json({ message: "Not found" }); return; }
  res.json({ status: topup.status });
});

// POST /payments/wallet/topup — add funds to wallet (mock; real: via PayFast)
router.post("/payments/wallet/topup", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const amount = parseFloat(req.body?.amount ?? "0");
  if (!amount || amount <= 0 || amount > 10000) {
    res.status(400).json({ message: "Amount must be between R1 and R10,000" }); return;
  }

  const existing = await row<any>("SELECT id FROM wallets WHERE user_id = ?", [user.id]);
  if (existing) {
    await exec("UPDATE wallets SET balance = balance + ? WHERE user_id = ?", [amount, user.id]);
  } else {
    await exec("INSERT INTO wallets (user_id, balance) VALUES (?, ?)", [user.id, amount]);
  }
  const updated = await row<any>("SELECT balance FROM wallets WHERE user_id = ?", [user.id]);
  res.json({ success: true, balance: parseFloat(updated.balance) });
});

// GET /payments/transactions — booking history as transactions
router.get("/payments/transactions", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const transactions = await query<any>(
    `SELECT b.id, b.booking_ref, b.my_amount, b.total_amount, b.players,
            b.split_bill, b.payment_method, b.status, b.created_at,
            pts.date AS tee_date,
            pts.tee_time AS tee_time,
            c.name AS club_name,
            c.id AS club_id
     FROM bookings b
     LEFT JOIN portal_tee_slots pts ON b.portal_slot_id = pts.id
     LEFT JOIN clubs c ON pts.club_id = c.id
     WHERE b.user_id = ?
     ORDER BY b.created_at DESC
     LIMIT 100`,
    [user.id]
  );
  res.json({ transactions });
});

// GET /payments/memberships — club memberships (set by club admins)
router.get("/payments/memberships", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const memberships = await query<any>(
    `SELECT cm.id,
            cm.membership_type AS plan_name,
            cm.benefits        AS plan_details,
            cm.start_date,
            cm.renewal_date    AS expiry_date,
            cm.status,
            NULL               AS notes,
            cm.created_at,
            c.name AS club_name, c.id AS club_id, c.location AS club_location, c.province
     FROM club_members cm
     JOIN clubs c ON cm.club_id = c.id
     WHERE cm.user_id = ?
     ORDER BY CASE cm.status
       WHEN 'active'    THEN 1
       WHEN 'suspended' THEN 2
       WHEN 'expired'   THEN 3
       WHEN 'cancelled' THEN 4
       ELSE 5
     END, cm.created_at DESC`,
    [user.id]
  );
  res.json({ memberships });
});

export default router;
