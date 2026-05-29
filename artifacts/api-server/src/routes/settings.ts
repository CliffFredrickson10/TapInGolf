import { Router, type IRouter } from "express";
import crypto from "crypto";
import { query, row, exec, run } from "../lib/pg";
import { getUser } from "../lib/auth";

// ── PayFast URL builder for ad-removal purchases ───────────────────────────
function buildAdRemovalPayFastUrl(
  purchaseId: number,
  amount: number,
  host: string
): string {
  const merchantId  = process.env["PAYFAST_MERCHANT_ID"]  ?? "";
  const merchantKey = process.env["PAYFAST_MERCHANT_KEY"] ?? "";
  const passphrase  = process.env["PAYFAST_PASSPHRASE"]   ?? "";
  const pfUrl       = process.env["PAYFAST_URL"]          ?? "https://sandbox.payfast.co.za/eng/process";

  const data: Record<string, string> = {
    merchant_id:  merchantId,
    merchant_key: merchantKey,
    return_url:   `https://${host}/payment/ad-removal/success`,
    cancel_url:   `https://${host}/payment/ad-removal/cancel`,
    notify_url:   `https://${host}/api/payfast/ad-removal/notify`,
    name_first:   "TapIn",
    name_last:    "Golfer",
    m_payment_id: `ad-removal-${purchaseId}`,
    amount:       amount.toFixed(2),
    item_name:    "TapIn Golf – Remove Banner Ads",
    item_description: "Removes the AdMob banner ad from the TapIn Golf app for the subscribed period.",
  };

  const paramStr = Object.entries(data)
    .map(([k, v]) => `${k}=${encodeURIComponent(v.trim())}`)
    .join("&");

  const signatureStr = passphrase
    ? `${paramStr}&passphrase=${encodeURIComponent(passphrase.trim())}`
    : paramStr;

  data["signature"] = crypto.createHash("md5").update(signatureStr).digest("hex");

  const qs = Object.entries(data)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");

  return `${pfUrl}?${qs}`;
}

const router: IRouter = Router();

// GET /settings/privacy
router.get("/settings/privacy", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const fresh = await row<any>(
    "SELECT is_private, analytics_consent FROM users WHERE id = ?",
    [user.id]
  );
  res.json({
    is_private:         (fresh?.is_private ?? 0) === 1,
    analytics_consent:  (fresh?.analytics_consent ?? 1) === 1,
  });
});

// PUT /settings/privacy
router.put("/settings/privacy", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const { is_private, analytics_consent } = req.body ?? {};
  const sets: string[] = [];
  const vals: any[] = [];
  if (is_private !== undefined)        { sets.push("is_private = ?");        vals.push(is_private ? 1 : 0); }
  if (analytics_consent !== undefined) { sets.push("analytics_consent = ?"); vals.push(analytics_consent ? 1 : 0); }
  if (sets.length > 0) {
    await exec(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`, [...vals, user.id]);
  }
  res.json({ success: true });
});

// GET /settings/blocked
router.get("/settings/blocked", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const blocked = await query<any>(
    `SELECT b.id, b.blocked_user_id AS userId, u.name, u.email,
            u.profile_picture AS avatar
     FROM user_blocks b
     JOIN users u ON b.blocked_user_id = u.id
     WHERE b.user_id = ?
     ORDER BY b.created_at DESC`,
    [user.id]
  );
  res.json({ blocked });
});

// POST /settings/block
router.post("/settings/block", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const targetId = Number(req.body?.target_id);
  if (!targetId || targetId === user.id) {
    res.status(400).json({ message: "Invalid target" }); return;
  }
  const target = await row("SELECT id FROM users WHERE id = ?", [targetId]);
  if (!target) { res.status(404).json({ message: "User not found" }); return; }

  try {
    const id = await exec(
      "INSERT INTO user_blocks (user_id, blocked_user_id) VALUES (?, ?)",
      [user.id, targetId]
    );
    res.status(201).json({ success: true, id });
  } catch {
    res.status(409).json({ message: "Already blocked" });
  }
});

// DELETE /settings/block/:id
router.delete("/settings/block/:id", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  await exec(
    "DELETE FROM user_blocks WHERE id = ? AND user_id = ?",
    [req.params["id"], user.id]
  );
  res.json({ success: true });
});

// GET /settings/notifications
router.get("/settings/notifications", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  // Upsert a default row if none exists yet
  await exec(
    `INSERT INTO user_notification_prefs (user_id) VALUES (?) ON CONFLICT (user_id) DO NOTHING`,
    [user.id]
  );
  const prefs = await row<any>(
    `SELECT notif_bookings, notif_messages, notif_friend_requests,
            notif_payments, notif_club_news, notif_promotions
     FROM user_notification_prefs WHERE user_id = ?`,
    [user.id]
  );
  res.json({
    bookings:        (prefs?.notif_bookings        ?? 1) === 1,
    messages:        (prefs?.notif_messages        ?? 1) === 1,
    friend_requests: (prefs?.notif_friend_requests ?? 1) === 1,
    payments:        (prefs?.notif_payments        ?? 1) === 1,
    club_news:       (prefs?.notif_club_news       ?? 1) === 1,
    promotions:      (prefs?.notif_promotions      ?? 0) === 1,
  });
});

// PUT /settings/notifications
router.put("/settings/notifications", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const allowed = [
    "bookings", "messages", "friend_requests", "payments", "club_news", "promotions",
  ] as const;
  const colMap: Record<string, string> = {
    bookings:        "notif_bookings",
    messages:        "notif_messages",
    friend_requests: "notif_friend_requests",
    payments:        "notif_payments",
    club_news:       "notif_club_news",
    promotions:      "notif_promotions",
  };

  const sets: string[] = [];
  const vals: any[] = [];
  for (const key of allowed) {
    if (req.body?.[key] !== undefined) {
      sets.push(`${colMap[key]} = ?`);
      vals.push(req.body[key] ? 1 : 0);
    }
  }
  if (sets.length > 0) {
    await exec(
      `INSERT INTO user_notification_prefs (user_id, ${sets.map((s) => s.split(" ")[0]).join(", ")})
       VALUES (?, ${vals.map(() => "?").join(", ")})
       ON CONFLICT (user_id) DO UPDATE SET ${sets.join(", ")}`,
      [user.id, ...vals, ...vals]
    );
  }
  res.json({ success: true });
});

// ── GET /super/settings — read all app-level settings (super user only) ──────
router.get("/super/settings", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }
  if (!user.is_super_user) { res.status(403).json({ message: "Forbidden" }); return; }

  const rows = await query<any>("SELECT key, value, updated_at FROM app_settings ORDER BY key");
  const settings: Record<string, string> = {};
  for (const r of rows) settings[r.key] = r.value;
  res.json({ settings });
});

// ── PUT /super/settings — update one or more app-level settings (super user only)
router.put("/super/settings", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }
  if (!user.is_super_user) { res.status(403).json({ message: "Forbidden" }); return; }

  const updates = req.body as Record<string, string>;
  if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
    res.status(400).json({ message: "Body must be an object of { key: value } pairs" }); return;
  }

  const ALLOWED_KEYS = ["notify_minutes_before"];
  const VALIDATORS: Record<string, (v: string) => string | null> = {
    notify_minutes_before: (v) => {
      const n = parseInt(v, 10);
      if (isNaN(n) || n < 5 || n > 1440) return "Must be between 5 and 1440 minutes";
      return null;
    },
  };

  for (const [k, v] of Object.entries(updates)) {
    if (!ALLOWED_KEYS.includes(k)) {
      res.status(400).json({ message: `Unknown setting key: ${k}` }); return;
    }
    const err = VALIDATORS[k]?.(String(v));
    if (err) { res.status(400).json({ message: `${k}: ${err}` }); return; }
  }

  for (const [k, v] of Object.entries(updates)) {
    await run(
      "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
      [k, String(v)]
    );
  }

  res.json({ success: true });
});

// ── DELETE /settings/account ──────────────────────────────────────────────
// Permanently deletes the authenticated user's account and all related data.
router.delete("/settings/account", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  // CASCADE on foreign keys handles bookings, booking_players, friendships,
  // reviews, notification_prefs, ad_removal records, etc.
  await exec("DELETE FROM users WHERE id = ?", [user.id]);

  res.json({ success: true, message: "Account permanently deleted." });
});

// ── GET /settings/ad-removal ───────────────────────────────────────────────
// Returns the configured price/period and the user's current subscription status.
router.get("/settings/ad-removal", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const cfg = await row<any>(
    "SELECT price_zar, period_days, period_label FROM ad_removal_config WHERE id = 1"
  );

  const sub = await row<any>(
    `SELECT id, expires_at, status
     FROM user_ad_removal
     WHERE user_id = ? AND status = 'active' AND expires_at > NOW()
     ORDER BY expires_at DESC LIMIT 1`,
    [user.id]
  );

  res.json({
    config: {
      price_zar:    cfg ? parseFloat(cfg.price_zar)  : 29.99,
      period_days:  cfg ? cfg.period_days             : 30,
      period_label: cfg?.period_label                 ?? "30 days",
    },
    subscription: sub
      ? { active: true, expires_at: String(sub.expires_at) }
      : null,
  });
});

// ── POST /settings/ad-removal/purchase ────────────────────────────────────
// Creates a pending purchase record and returns a PayFast payment URL.
router.post("/settings/ad-removal/purchase", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const cfg = await row<any>(
    "SELECT price_zar, period_days FROM ad_removal_config WHERE id = 1"
  );
  const price      = cfg ? parseFloat(cfg.price_zar) : 29.99;
  const periodDays = cfg ? cfg.period_days            : 30;

  // Calculate expiry: now + period_days (from today, not stacked)
  const purchaseId = await exec(
    `INSERT INTO user_ad_removal (user_id, expires_at, price_paid, period_days, status)
     VALUES (?, DATE_ADD(NOW(), INTERVAL ? DAY), ?, ?, 'pending')`,
    [user.id, periodDays, price, periodDays]
  );

  const host       = req.get("host") ?? "";
  const paymentUrl = buildAdRemovalPayFastUrl(purchaseId, price, host);

  res.status(201).json({ purchase_id: purchaseId, payment_url: paymentUrl });
});

// ── POST /settings/ad-removal/confirm/:id ────────────────────────────────
// Activates the purchase after the user returns from PayFast.
router.post("/settings/ad-removal/confirm/:id", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const id = Number(req.params["id"]);
  const purchase = await row<any>(
    "SELECT id, user_id, expires_at FROM user_ad_removal WHERE id = ? AND status = 'pending'",
    [id]
  );
  if (!purchase) { res.status(404).json({ message: "Purchase not found or already processed" }); return; }
  if (purchase.user_id !== user.id) { res.status(403).json({ message: "Forbidden" }); return; }

  await exec(
    "UPDATE user_ad_removal SET status = 'active' WHERE id = ?",
    [id]
  );

  res.json({ success: true, expires_at: String(purchase.expires_at) });
});

// ── POST /api/payfast/ad-removal/notify ───────────────────────────────────
// PayFast ITN server-to-server callback for ad-removal payments.
router.post("/payfast/ad-removal/notify", async (req, res): Promise<void> => {
  const data = req.body as Record<string, string>;
  if (data["payment_status"] === "COMPLETE") {
    const paymentId = data["m_payment_id"] ?? ""; // "ad-removal-{id}"
    const parts     = paymentId.split("-");
    const id        = Number(parts[parts.length - 1]);
    if (id) {
      await exec(
        "UPDATE user_ad_removal SET status = 'active', payment_ref = ? WHERE id = ? AND status = 'pending'",
        [data["pf_payment_id"] ?? null, id]
      );
    }
  }
  res.status(200).send("OK");
});

export default router;
