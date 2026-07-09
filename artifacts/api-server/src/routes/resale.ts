import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { query, row, exec, run } from "../lib/pg";
import { getUser, isStaff } from "../lib/auth";
import { createStitchPayment, getStitchPayment } from "../lib/stitch";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const SECRET = process.env["SESSION_SECRET"] ?? "tapingolf_club_portal_2026";

// How long a pending purchase blocks other buyers / club edits on a listing.
const PENDING_LOCK_MINUTES = 15;

// ─── Tokens ──────────────────────────────────────────────────────────────────

function generateResellerToken(resellerId: number): string {
  const payload = Buffer.from(
    JSON.stringify({ sub: resellerId, type: "reseller", iat: Date.now(), exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

function verifySignedToken(token: string): any | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
  try {
    if (!crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(sig, "hex"))) return null;
  } catch {
    return null;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

async function requireResellerAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization ?? "";
  if (!header.startsWith("Bearer ")) { res.status(401).json({ message: "Unauthorized" }); return; }
  const data = verifySignedToken(header.slice(7));
  if (!data || data.type !== "reseller") { res.status(401).json({ message: "Invalid or expired token" }); return; }
  const reseller = await row<any>(
    "SELECT id, name, contact_email, username, active FROM resellers WHERE id = ? AND active = 1",
    [data.sub]
  );
  if (!reseller) { res.status(401).json({ message: "Reseller account not found or disabled" }); return; }
  (req as any).reseller = reseller;
  next();
}

function getReseller(req: Request): any { return (req as any).reseller; }

// Club-side auth: accepts both direct club tokens and club portal user tokens
// (same token scheme portal.ts issues). Portal users need the "schedule"
// permission — resale listing management is tee-sheet management.
async function requireClubResaleAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization ?? "";
  if (!header.startsWith("Bearer ")) { res.status(401).json({ message: "Unauthorized" }); return; }
  const data = verifySignedToken(header.slice(7));
  if (!data || (data.type !== "club" && data.type !== "club_user")) {
    res.status(401).json({ message: "Invalid or expired token" }); return;
  }
  const clubId = data.sub as number;
  const club = await row<any>(
    "SELECT id, name, active, resale_enabled FROM clubs WHERE id = ? AND active = 1",
    [clubId]
  );
  if (!club) { res.status(401).json({ message: "Club not found" }); return; }

  if (data.type === "club_user") {
    const clubUser = await row<any>(
      "SELECT id, role, permissions, active FROM club_portal_users WHERE id = ? AND club_id = ? AND active = 1",
      [data.uid, clubId]
    );
    if (!clubUser) { res.status(401).json({ message: "User not found or inactive" }); return; }
    const perms = clubUser.permissions ?? {};
    const level = clubUser.role === "admin" ? "edit" : (perms["schedule"] ?? "none");
    const isWrite = req.method !== "GET";
    if (level === "none" || (isWrite && level !== "edit")) {
      res.status(403).json({ message: "You don't have permission to manage resale listings" }); return;
    }
  }

  (req as any).club = club;
  next();
}

function getClub(req: Request): any { return (req as any).club; }

// ─── Purchase confirmation (webhook + verify share this) ────────────────────
// Idempotent + status-guarded: only the caller that flips the purchase
// pending→confirmed proceeds; the listing must then flip listed→sold or the
// purchase is rolled back to cancelled (never sell the same slot twice, never
// resurrect an unlisted/cancelled state).
export async function confirmResalePurchase(purchaseId: number): Promise<"confirmed" | "already_confirmed" | "conflict" | "not_found" | "not_pending"> {
  const purchase = await row<any>("SELECT id, listing_id, reseller_id, amount, status FROM resale_purchases WHERE id = ?", [purchaseId]);
  if (!purchase) return "not_found";
  if (purchase.status === "confirmed") return "already_confirmed";

  const claimed = await run(
    "UPDATE resale_purchases SET status = 'confirmed', confirmed_at = NOW() WHERE id = ? AND status = 'pending'",
    [purchaseId]
  );
  if (claimed !== 1) return "not_pending";

  const sold = await run(
    "UPDATE resale_listings SET status = 'sold', sold_at = NOW() WHERE id = ? AND status = 'listed'",
    [purchase.listing_id]
  );
  if (sold !== 1) {
    // Listing was unlisted or already sold to someone else — roll the claim back.
    await run("UPDATE resale_purchases SET status = 'cancelled', confirmed_at = NULL WHERE id = ? AND status = 'confirmed'", [purchaseId]);
    logger.warn({ purchaseId, listingId: purchase.listing_id }, "resale purchase paid but listing no longer available");
    return "conflict";
  }

  // Notify the club in the portal inbox.
  try {
    const info = await row<any>(
      `SELECT rl.club_id, rl.price, pts.date, pts.tee_time, c.name AS club_name, r.name AS reseller_name
       FROM resale_listings rl
       JOIN portal_tee_slots pts ON pts.id = rl.slot_id
       JOIN clubs c ON c.id = rl.club_id
       JOIN resellers r ON r.id = ?
       WHERE rl.id = ?`,
      [purchase.reseller_id, purchase.listing_id]
    );
    if (info) {
      const dateStr = (info.date instanceof Date ? info.date.toISOString() : String(info.date)).slice(0, 10);
      const timeStr = String(info.tee_time).slice(0, 5);
      const amount = parseFloat(purchase.amount);
      await exec(
        "INSERT INTO club_inbox_notifications (club_id, type, title, body, meta) VALUES (?, 'resale_sold', ?, ?, ?)",
        [info.club_id,
         "💰 Tee Time Sold to Reseller",
         `${info.reseller_name} bought your listed tee time on ${dateStr} at ${timeStr} for R${amount.toFixed(2)}. Payment has been confirmed via Stitch.`,
         JSON.stringify({ listing_id: purchase.listing_id, purchase_id: purchaseId, date: dateStr, tee_time: timeStr, amount, reseller: info.reseller_name })]
      );
    }
  } catch (err) {
    logger.warn({ err, purchaseId }, "failed to create resale sale notification");
  }
  return "confirmed";
}

// ─── Reseller auth endpoints ─────────────────────────────────────────────────

router.post("/portal/reseller/login", async (req: Request, res: Response): Promise<void> => {
  const { username, password } = req.body ?? {};
  if (!username || !password) { res.status(400).json({ message: "Username and password required" }); return; }
  const reseller = await row<any>(
    "SELECT id, name, contact_email, username, password_hash, active FROM resellers WHERE username = ? LIMIT 1",
    [String(username).trim().toLowerCase()]
  );
  if (!reseller || !reseller.active) { res.status(401).json({ message: "Invalid credentials" }); return; }
  const valid = await bcrypt.compare(String(password), reseller.password_hash);
  if (!valid) { res.status(401).json({ message: "Invalid credentials" }); return; }
  const token = generateResellerToken(reseller.id);
  res.json({ token, reseller: { id: reseller.id, name: reseller.name, contact_email: reseller.contact_email, username: reseller.username } });
});

router.get("/portal/reseller/me", requireResellerAuth, async (req: Request, res: Response): Promise<void> => {
  const r = getReseller(req);
  res.json({ id: r.id, name: r.name, contact_email: r.contact_email, username: r.username });
});

// ─── Reseller marketplace ────────────────────────────────────────────────────

// Participating clubs with count of active future listings.
router.get("/portal/reseller/clubs", requireResellerAuth, async (req: Request, res: Response): Promise<void> => {
  const search = String(req.query.search ?? "").trim();
  const province = String(req.query.province ?? "").trim();
  const params: any[] = [];
  let where = "c.active = 1 AND c.resale_enabled = 1";
  if (search) {
    where += " AND (LOWER(c.name) LIKE ? OR LOWER(COALESCE(c.location,'')) LIKE ?)";
    const like = `%${search.toLowerCase()}%`;
    params.push(like, like);
  }
  if (province) {
    where += " AND c.province = ?";
    params.push(province);
  }
  const clubs = await query<any>(
    `SELECT c.id, c.name, c.location, c.province, c.logo_url, c.image_url, c.holes,
       (SELECT COUNT(*)::int FROM resale_listings rl
        JOIN portal_tee_slots pts ON pts.id = rl.slot_id
        WHERE rl.club_id = c.id AND rl.status = 'listed' AND pts.date >= CURRENT_DATE
       ) AS listing_count
     FROM clubs c
     WHERE ${where}
     ORDER BY c.name ASC
     LIMIT 200`,
    params
  );
  res.json({ clubs });
});

// A participating club's active listings.
router.get("/portal/reseller/clubs/:id/listings", requireResellerAuth, async (req: Request, res: Response): Promise<void> => {
  const clubId = parseInt(String(req.params.id), 10);
  if (isNaN(clubId)) { res.status(400).json({ message: "Invalid club id" }); return; }
  const club = await row<any>(
    "SELECT id, name, location, province, logo_url, holes FROM clubs WHERE id = ? AND active = 1 AND resale_enabled = 1",
    [clubId]
  );
  if (!club) { res.status(404).json({ message: "Club not found or not participating" }); return; }
  const listings = await query<any>(
    `SELECT rl.id, rl.price, rl.status, pts.date, pts.tee_time, pts.max_players,
       EXISTS (SELECT 1 FROM resale_purchases p
               WHERE p.listing_id = rl.id AND p.status = 'pending'
                 AND p.created_at > NOW() - INTERVAL '${PENDING_LOCK_MINUTES} minutes'
       ) AS payment_pending
     FROM resale_listings rl
     JOIN portal_tee_slots pts ON pts.id = rl.slot_id
     WHERE rl.club_id = ? AND rl.status = 'listed' AND pts.date >= CURRENT_DATE
     ORDER BY pts.date ASC, pts.tee_time ASC`,
    [clubId]
  );
  res.json({
    club,
    listings: listings.map((l) => ({
      id: l.id,
      date: (l.date instanceof Date ? l.date.toISOString() : String(l.date)).slice(0, 10),
      tee_time: String(l.tee_time).slice(0, 5),
      max_players: l.max_players,
      price: parseFloat(l.price),
      payment_pending: !!l.payment_pending,
    })),
  });
});

// Buy a listing: create a pending purchase + Stitch hosted payment link.
router.post("/portal/reseller/listings/:id/buy", requireResellerAuth, async (req: Request, res: Response): Promise<void> => {
  const reseller = getReseller(req);
  const listingId = parseInt(String(req.params.id), 10);
  if (isNaN(listingId)) { res.status(400).json({ message: "Invalid listing id" }); return; }

  const listing = await row<any>(
    `SELECT rl.id, rl.price, rl.status, rl.club_id, pts.date, pts.tee_time, c.name AS club_name, c.active, c.resale_enabled
     FROM resale_listings rl
     JOIN portal_tee_slots pts ON pts.id = rl.slot_id
     JOIN clubs c ON c.id = rl.club_id
     WHERE rl.id = ?`,
    [listingId]
  );
  if (!listing || !listing.active || !listing.resale_enabled) { res.status(404).json({ message: "Listing not found" }); return; }
  if (listing.status !== "listed") { res.status(409).json({ message: "This tee time is no longer available" }); return; }

  const dateStr = (listing.date instanceof Date ? listing.date.toISOString() : String(listing.date)).slice(0, 10);
  const timeStr = String(listing.tee_time).slice(0, 5);
  const teeDt = new Date(`${dateStr}T${timeStr}:00+02:00`);
  if (isNaN(teeDt.getTime()) || teeDt.getTime() < Date.now()) {
    res.status(409).json({ message: "This tee time has already passed" }); return;
  }

  const price = parseFloat(listing.price);

  // Atomic guard: only one pending purchase may exist per listing at a time
  // (any buyer), checked inside the inserting statement.
  const purchaseId = await exec(
    `INSERT INTO resale_purchases (listing_id, reseller_id, amount, status)
     SELECT ?, ?, ?, 'pending'
     WHERE EXISTS (SELECT 1 FROM resale_listings rl WHERE rl.id = ? AND rl.status = 'listed')
       AND NOT EXISTS (
         SELECT 1 FROM resale_purchases p
         WHERE p.listing_id = ? AND p.status = 'pending'
           AND p.created_at > NOW() - INTERVAL '${PENDING_LOCK_MINUTES} minutes'
       )`,
    [listingId, reseller.id, price, listingId, listingId]
  );
  if (!purchaseId) {
    res.status(409).json({ message: "Another payment for this tee time is already in progress. Try again in a few minutes." });
    return;
  }

  const host = req.get("host") ?? "";
  try {
    const pr = await createStitchPayment({
      amount:            price,
      payerName:         reseller.name,
      payerEmail:        reseller.contact_email || undefined,
      merchantReference: `resale-${purchaseId}`,
      redirectUrl:       `https://${host}/club-portal/resale-success`,
    });
    await run("UPDATE resale_purchases SET stitch_payment_id = ? WHERE id = ?", [pr.id, purchaseId]);
    res.json({ purchase_id: purchaseId, payment_url: pr.url, amount: price });
  } catch (err: any) {
    await run("UPDATE resale_purchases SET status = 'cancelled' WHERE id = ? AND status = 'pending'", [purchaseId]);
    logger.error({ err, listingId }, "failed to create Stitch payment for resale purchase");
    res.status(502).json({ message: "Could not start the payment. Please try again." });
  }
});

// Reseller's purchase history.
router.get("/portal/reseller/purchases", requireResellerAuth, async (req: Request, res: Response): Promise<void> => {
  const reseller = getReseller(req);
  const purchases = await query<any>(
    `SELECT p.id, p.amount, p.status, p.created_at, p.confirmed_at,
            rl.id AS listing_id, pts.date, pts.tee_time, pts.max_players,
            c.id AS club_id, c.name AS club_name, c.province
     FROM resale_purchases p
     JOIN resale_listings rl ON rl.id = p.listing_id
     JOIN portal_tee_slots pts ON pts.id = rl.slot_id
     JOIN clubs c ON c.id = rl.club_id
     WHERE p.reseller_id = ?
     ORDER BY p.created_at DESC
     LIMIT 200`,
    [reseller.id]
  );
  res.json({
    purchases: purchases.map((p) => ({
      id: p.id,
      amount: parseFloat(p.amount),
      status: p.status,
      created_at: p.created_at,
      confirmed_at: p.confirmed_at,
      date: (p.date instanceof Date ? p.date.toISOString() : String(p.date)).slice(0, 10),
      tee_time: String(p.tee_time).slice(0, 5),
      max_players: p.max_players,
      club_id: p.club_id,
      club_name: p.club_name,
      province: p.province,
    })),
  });
});

// Verify a pending purchase against Stitch directly (used by the portal after
// the redirect — the webhook remains the primary confirmation path; this never
// trusts the redirect itself, it re-checks the payment status with Stitch).
router.post("/portal/reseller/purchases/:id/verify", requireResellerAuth, async (req: Request, res: Response): Promise<void> => {
  const reseller = getReseller(req);
  const purchaseId = parseInt(String(req.params.id), 10);
  if (isNaN(purchaseId)) { res.status(400).json({ message: "Invalid purchase id" }); return; }
  const purchase = await row<any>(
    "SELECT id, status, stitch_payment_id FROM resale_purchases WHERE id = ? AND reseller_id = ?",
    [purchaseId, reseller.id]
  );
  if (!purchase) { res.status(404).json({ message: "Purchase not found" }); return; }
  if (purchase.status !== "pending") { res.json({ status: purchase.status }); return; }
  if (!purchase.stitch_payment_id) { res.json({ status: "pending" }); return; }

  try {
    const detail = await getStitchPayment(purchase.stitch_payment_id);
    const paid = detail && ["PAID", "COMPLETED"].includes(String(detail.status ?? "").toUpperCase());
    if (paid) {
      const outcome = await confirmResalePurchase(purchaseId);
      const p2 = await row<any>("SELECT status FROM resale_purchases WHERE id = ?", [purchaseId]);
      res.json({ status: p2?.status ?? "pending", outcome });
      return;
    }
    res.json({ status: "pending" });
  } catch (err) {
    logger.warn({ err, purchaseId }, "resale purchase verify failed");
    res.status(502).json({ message: "Could not verify the payment right now" });
  }
});

// ─── Club-side listing management ───────────────────────────────────────────

// Toggle + listings overview.
router.get("/portal/resale", requireClubResaleAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const listings = await query<any>(
    `SELECT rl.id, rl.slot_id, rl.price, rl.status, rl.created_at, rl.sold_at,
            pts.date, pts.tee_time, pts.max_players,
            sold.reseller_name, sold.sold_amount,
            EXISTS (SELECT 1 FROM resale_purchases p
                    WHERE p.listing_id = rl.id AND p.status = 'pending'
                      AND p.created_at > NOW() - INTERVAL '${PENDING_LOCK_MINUTES} minutes'
            ) AS payment_pending
     FROM resale_listings rl
     JOIN portal_tee_slots pts ON pts.id = rl.slot_id
     LEFT JOIN LATERAL (
       SELECT r.name AS reseller_name, p.amount AS sold_amount
       FROM resale_purchases p JOIN resellers r ON r.id = p.reseller_id
       WHERE p.listing_id = rl.id AND p.status = 'confirmed'
       ORDER BY p.confirmed_at DESC LIMIT 1
     ) sold ON TRUE
     WHERE rl.club_id = ? AND rl.status IN ('listed','sold')
     ORDER BY pts.date ASC, pts.tee_time ASC`,
    [club.id]
  );
  res.json({
    enabled: !!club.resale_enabled,
    listings: listings.map((l) => ({
      id: l.id,
      slot_id: l.slot_id,
      price: parseFloat(l.price),
      status: l.status,
      date: (l.date instanceof Date ? l.date.toISOString() : String(l.date)).slice(0, 10),
      tee_time: String(l.tee_time).slice(0, 5),
      max_players: l.max_players,
      payment_pending: !!l.payment_pending,
      reseller_name: l.reseller_name ?? null,
      sold_amount: l.sold_amount != null ? parseFloat(l.sold_amount) : null,
      sold_at: l.sold_at,
    })),
  });
});

router.put("/portal/resale/enabled", requireClubResaleAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const enabled = !!req.body?.enabled;
  await run("UPDATE clubs SET resale_enabled = ? WHERE id = ?", [enabled ? 1 : 0, club.id]);
  res.json({ enabled });
});

// Slots eligible for listing on a given date (empty, active, non-event, no
// holds, deduped by MIN(id) since duplicate rows per date/time exist).
router.get("/portal/resale/slots", requireClubResaleAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const date = String(req.query.date ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { res.status(400).json({ message: "date=YYYY-MM-DD is required" }); return; }
  const slots = await query<any>(
    `SELECT pts.id, pts.tee_time, pts.max_players, pts.player_count,
       (SELECT COUNT(*)::int FROM standing_holds sh WHERE sh.slot_id = pts.id AND sh.status = 'held') AS held_count,
       rl.id AS listing_id, rl.status AS listing_status, rl.price AS listing_price
     FROM portal_tee_slots pts
     LEFT JOIN resale_listings rl ON rl.slot_id = pts.id AND rl.status IN ('listed','sold')
     WHERE pts.club_id = ? AND pts.date = ? AND pts.is_active = 1 AND pts.event_id IS NULL
       AND pts.id = (
         SELECT MIN(p2.id) FROM portal_tee_slots p2
         WHERE p2.club_id = pts.club_id AND p2.date = pts.date AND p2.tee_time = pts.tee_time
           AND p2.is_active = 1 AND p2.event_id IS NULL
       )
     ORDER BY pts.tee_time ASC`,
    [club.id, date]
  );
  res.json({
    slots: slots.map((s) => ({
      id: s.id,
      tee_time: String(s.tee_time).slice(0, 5),
      max_players: s.max_players,
      player_count: s.player_count,
      held_count: s.held_count,
      listable: s.player_count === 0 && s.held_count === 0 && !s.listing_id,
      listing_id: s.listing_id ?? null,
      listing_status: s.listing_status ?? null,
      listing_price: s.listing_price != null ? parseFloat(s.listing_price) : null,
    })),
  });
});

router.post("/portal/resale/listings", requireClubResaleAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const slotId = parseInt(String(req.body?.slot_id), 10);
  const price = parseFloat(String(req.body?.price));
  if (isNaN(slotId)) { res.status(400).json({ message: "slot_id is required" }); return; }
  if (isNaN(price) || price < 1) { res.status(400).json({ message: "Price must be at least R1.00" }); return; }

  // All state checks live inside the inserting statement so concurrent
  // bookings/holds/listings can't race past them; the partial unique index is
  // the final backstop.
  let listingId = 0;
  try {
    listingId = await exec(
      `INSERT INTO resale_listings (club_id, slot_id, price, status)
       SELECT ?, ?, ?, 'listed'
       WHERE EXISTS (
           SELECT 1 FROM portal_tee_slots pts
           WHERE pts.id = ? AND pts.club_id = ? AND pts.is_active = 1
             AND pts.event_id IS NULL AND pts.player_count = 0 AND pts.date >= CURRENT_DATE
         )
         AND NOT EXISTS (SELECT 1 FROM standing_holds sh WHERE sh.slot_id = ? AND sh.status IN ('held','confirmed'))
         AND NOT EXISTS (SELECT 1 FROM portal_slot_bookings psb WHERE psb.slot_id = ?)
         AND NOT EXISTS (SELECT 1 FROM resale_listings rl WHERE rl.slot_id = ? AND rl.status IN ('listed','sold'))`,
      [club.id, slotId, price, slotId, club.id, slotId, slotId, slotId]
    );
  } catch (err: any) {
    if (err?.code === "23505") { res.status(409).json({ message: "This slot is already listed" }); return; }
    throw err;
  }
  if (!listingId) {
    res.status(409).json({ message: "This slot can't be listed — it may have bookings, holds, or already be listed." });
    return;
  }
  res.status(201).json({ id: listingId });
});

router.put("/portal/resale/listings/:id", requireClubResaleAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const listingId = parseInt(String(req.params.id), 10);
  const price = parseFloat(String(req.body?.price));
  if (isNaN(listingId)) { res.status(400).json({ message: "Invalid listing id" }); return; }
  if (isNaN(price) || price < 1) { res.status(400).json({ message: "Price must be at least R1.00" }); return; }
  const updated = await run(
    `UPDATE resale_listings SET price = ?
     WHERE id = ? AND club_id = ? AND status = 'listed'
       AND NOT EXISTS (
         SELECT 1 FROM resale_purchases p
         WHERE p.listing_id = resale_listings.id AND p.status = 'pending'
           AND p.created_at > NOW() - INTERVAL '${PENDING_LOCK_MINUTES} minutes'
       )`,
    [price, listingId, club.id]
  );
  if (!updated) { res.status(409).json({ message: "Listing can't be edited right now (sold, unlisted, or a payment is in progress)" }); return; }
  res.json({ id: listingId, price });
});

router.delete("/portal/resale/listings/:id", requireClubResaleAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const listingId = parseInt(String(req.params.id), 10);
  if (isNaN(listingId)) { res.status(400).json({ message: "Invalid listing id" }); return; }
  const updated = await run(
    `UPDATE resale_listings SET status = 'unlisted'
     WHERE id = ? AND club_id = ? AND status = 'listed'
       AND NOT EXISTS (
         SELECT 1 FROM resale_purchases p
         WHERE p.listing_id = resale_listings.id AND p.status = 'pending'
           AND p.created_at > NOW() - INTERVAL '${PENDING_LOCK_MINUTES} minutes'
       )`,
    [listingId, club.id]
  );
  if (!updated) { res.status(409).json({ message: "Listing can't be unlisted right now (sold, already unlisted, or a payment is in progress)" }); return; }
  res.json({ id: listingId, status: "unlisted" });
});

// ─── TapIn staff: reseller account management ────────────────────────────────

router.get("/admin/resellers", async (req: Request, res: Response): Promise<void> => {
  const user = await getUser(req);
  if (!isStaff(user)) { res.status(403).json({ message: "Forbidden" }); return; }
  const resellers = await query<any>(
    `SELECT r.id, r.name, r.contact_email, r.username, r.active, r.created_at,
       (SELECT COUNT(*)::int FROM resale_purchases p WHERE p.reseller_id = r.id AND p.status = 'confirmed') AS purchase_count,
       (SELECT COALESCE(SUM(p.amount), 0) FROM resale_purchases p WHERE p.reseller_id = r.id AND p.status = 'confirmed') AS total_spent
     FROM resellers r
     ORDER BY r.created_at DESC`
  );
  res.json({
    resellers: resellers.map((r) => ({
      ...r,
      active: !!r.active,
      total_spent: parseFloat(r.total_spent),
    })),
  });
});

router.post("/admin/resellers", async (req: Request, res: Response): Promise<void> => {
  const user = await getUser(req);
  if (!isStaff(user)) { res.status(403).json({ message: "Forbidden" }); return; }
  const name = String(req.body?.name ?? "").trim();
  const contactEmail = String(req.body?.contact_email ?? "").trim().toLowerCase();
  const username = String(req.body?.username ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  if (!name || !contactEmail || !username || !password) {
    res.status(400).json({ message: "name, contact_email, username and password are required" }); return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) { res.status(400).json({ message: "Invalid contact email" }); return; }
  if (!/^[a-z0-9_.-]{3,100}$/.test(username)) { res.status(400).json({ message: "Username must be 3+ characters (letters, numbers, _ . -)" }); return; }
  if (password.length < 8) { res.status(400).json({ message: "Password must be at least 8 characters" }); return; }
  const existing = await row<any>("SELECT id FROM resellers WHERE username = ?", [username]);
  if (existing) { res.status(409).json({ message: "Username already taken" }); return; }
  const hash = await bcrypt.hash(password, 10);
  const id = await exec(
    "INSERT INTO resellers (name, contact_email, username, password_hash, active) VALUES (?, ?, ?, ?, 1)",
    [name, contactEmail, username, hash]
  );
  res.status(201).json({ id, name, contact_email: contactEmail, username, active: true });
});

router.patch("/admin/resellers/:id", async (req: Request, res: Response): Promise<void> => {
  const user = await getUser(req);
  if (!isStaff(user)) { res.status(403).json({ message: "Forbidden" }); return; }
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ message: "Invalid id" }); return; }
  const reseller = await row<any>("SELECT id FROM resellers WHERE id = ?", [id]);
  if (!reseller) { res.status(404).json({ message: "Reseller not found" }); return; }

  const sets: string[] = [];
  const params: any[] = [];
  if (req.body?.name !== undefined) { sets.push("name = ?"); params.push(String(req.body.name).trim()); }
  if (req.body?.contact_email !== undefined) {
    const email = String(req.body.contact_email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { res.status(400).json({ message: "Invalid contact email" }); return; }
    sets.push("contact_email = ?"); params.push(email);
  }
  if (req.body?.active !== undefined) { sets.push("active = ?"); params.push(req.body.active ? 1 : 0); }
  if (req.body?.password !== undefined) {
    const password = String(req.body.password);
    if (password.length < 8) { res.status(400).json({ message: "Password must be at least 8 characters" }); return; }
    sets.push("password_hash = ?"); params.push(await bcrypt.hash(password, 10));
  }
  if (!sets.length) { res.status(400).json({ message: "Nothing to update" }); return; }
  params.push(id);
  await run(`UPDATE resellers SET ${sets.join(", ")} WHERE id = ?`, params);
  res.json({ id });
});

export default router;
