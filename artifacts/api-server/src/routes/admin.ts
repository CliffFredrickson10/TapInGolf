import { Router, type IRouter } from "express";
import { query, row, exec } from "../lib/pg";
import { getUser, isStaff, isPlatform } from "../lib/auth";

const router: IRouter = Router();

// Helper: is this user a platform admin (super-user, or club_admin with no club)?
function isPlatformAdmin(user: any) {
  return isPlatform(user);
}

// Helper: build a WHERE clause fragment to scope to the admin's club (if assigned)
function clubScope(user: any): { where: string; params: any[] } {
  if (user.club_id != null) {
    return { where: "AND c.id = ?", params: [user.club_id] };
  }
  return { where: "", params: [] };
}

// ─────────────────────────────────────────────────────────────────────
// POST /admin/users/:id/assign-club
// Platform admin only: promote a user to club_admin and assign them a club
// ─────────────────────────────────────────────────────────────────────
router.post("/admin/users/:id/assign-club", async (req, res): Promise<void> => {
  const caller = await getUser(req);
  if (!isPlatformAdmin(caller)) {
    res.status(403).json({ message: "Only platform admins can assign clubs" });
    return;
  }

  const targetId = parseInt(req.params.id, 10);
  const { club_id } = req.body ?? {};

  if (isNaN(targetId)) { res.status(400).json({ message: "Invalid user id" }); return; }

  // Verify club exists
  if (club_id != null) {
    const club = await row<any>("SELECT id, name FROM clubs WHERE id = ?", [parseInt(club_id, 10)]);
    if (!club) { res.status(404).json({ message: "Club not found" }); return; }
  }

  await exec(
    "UPDATE users SET role = 'club_admin', club_id = ? WHERE id = ?",
    [club_id ?? null, targetId]
  );

  const updated = await row<any>(
    "SELECT id, name, email, role, club_id FROM users WHERE id = ?",
    [targetId]
  );
  res.json({ user: updated });
});

// ─────────────────────────────────────────────────────────────────────
// GET /admin/users — platform admin only: list all users (for assignment UI)
// ─────────────────────────────────────────────────────────────────────
router.get("/admin/users", async (req, res): Promise<void> => {
  const caller = await getUser(req);
  if (!isPlatformAdmin(caller)) {
    res.status(403).json({ message: "Forbidden" });
    return;
  }

  const users = await query<any>(
    `SELECT u.id, u.name, u.email, u.role, u.club_id, c.name as club_name
     FROM users u
     LEFT JOIN clubs c ON c.id = u.club_id
     ORDER BY u.role DESC, u.name ASC`
  );
  res.json({ users });
});

// ─────────────────────────────────────────────────────────────────────
// GET /admin/revenue/summary
// Platform admin → all clubs; club admin → their club only
// ─────────────────────────────────────────────────────────────────────
router.get("/admin/revenue/summary", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!isStaff(user)) { res.status(403).json({ message: "Forbidden" }); return; }

  const scope = clubScope(user);

  const summary = await row<any>(
    `SELECT
       COUNT(b.id) as total_bookings,
       COALESCE(SUM(b.total_amount), 0) as total_collected,
       COALESCE(SUM(b.platform_fee), 0) as total_platform_fee,
       COALESCE(SUM(b.club_amount), 0) as total_club_payouts
     FROM bookings b
     JOIN portal_tee_slots pts ON pts.id = b.portal_slot_id
     JOIN clubs c ON c.id = pts.club_id
     WHERE b.status IN ('confirmed','completed') ${scope.where}`,
    scope.params
  );

  const [feeSetting, vatSetting] = await Promise.all([
    row<any>("SELECT setting_value FROM platform_settings WHERE setting_key = 'platform_fee_flat'"),
    row<any>("SELECT setting_value FROM platform_settings WHERE setting_key = 'vat_pct'"),
  ]);

  res.json({
    platform_fee_flat:   feeSetting ? parseFloat(feeSetting.setting_value) : 10,
    vat_pct:             vatSetting ? parseFloat(vatSetting.setting_value) : 15,
    total_bookings:      parseInt(summary?.total_bookings ?? "0"),
    total_collected:     parseFloat(summary?.total_collected ?? "0"),
    total_platform_fee:  parseFloat(summary?.total_platform_fee ?? "0"),
    total_club_payouts:  parseFloat(summary?.total_club_payouts ?? "0"),
  });
});

// ─────────────────────────────────────────────────────────────────────
// GET /admin/revenue/bookings
// ─────────────────────────────────────────────────────────────────────
router.get("/admin/revenue/bookings", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!isStaff(user)) { res.status(403).json({ message: "Forbidden" }); return; }

  const limit  = Math.min(parseInt(String(req.query.limit  ?? "50"), 10), 100);
  const offset = parseInt(String(req.query.offset ?? "0"), 10);
  const scope  = clubScope(user);

  const bookings = await query<any>(
    `SELECT b.id, b.booking_ref, b.total_amount, b.platform_fee, b.club_amount,
            b.payment_method, b.status, b.created_at,
            c.name as club_name, u.name as golfer_name, u.email as golfer_email,
            pts.date, pts.tee_time AS time
     FROM bookings b
     JOIN portal_tee_slots pts ON pts.id = b.portal_slot_id
     JOIN clubs c ON c.id = pts.club_id
     JOIN users u ON u.id = b.user_id
     WHERE b.status IN ('confirmed','completed') ${scope.where}
     ORDER BY b.created_at DESC
     LIMIT ${limit} OFFSET ${offset}`,
    [...scope.params]
  );

  const total = await row<any>(
    `SELECT COUNT(b.id) as cnt
     FROM bookings b
     JOIN portal_tee_slots pts ON pts.id = b.portal_slot_id
     JOIN clubs c ON c.id = pts.club_id
     WHERE b.status IN ('confirmed','completed') ${scope.where}`,
    scope.params
  );

  res.json({
    bookings: bookings.map((b: any) => ({
      ...b,
      total_amount: parseFloat(b.total_amount ?? 0),
      platform_fee: parseFloat(b.platform_fee ?? 0),
      club_amount:  parseFloat(b.club_amount ?? b.total_amount ?? 0),
    })),
    total: parseInt(total?.cnt ?? "0"),
  });
});

// ─────────────────────────────────────────────────────────────────────
// GET /admin/revenue/clubs
// ─────────────────────────────────────────────────────────────────────
router.get("/admin/revenue/clubs", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!isStaff(user)) { res.status(403).json({ message: "Forbidden" }); return; }

  const scope = clubScope(user);
  // For club-scoped admin the "clubs" list is just their one club
  const clubs = await query<any>(
    `SELECT c.id, c.name, c.location, c.province,
       COUNT(DISTINCT b.id) as total_bookings,
       COALESCE(SUM(b.total_amount), 0) as gross_revenue,
       COALESCE(SUM(b.platform_fee), 0) as platform_fees,
       COALESCE(SUM(b.club_amount), 0) as club_earnings
     FROM clubs c
     LEFT JOIN portal_tee_slots pts ON pts.club_id = c.id
     LEFT JOIN bookings b ON b.portal_slot_id = pts.id AND b.status IN ('confirmed','completed')
     WHERE 1=1 ${scope.where.replace("AND c.id", "AND c.id")}
     GROUP BY c.id, c.name, c.location, c.province
     ORDER BY club_earnings DESC`,
    scope.params
  );

  res.json({
    clubs: clubs.map((c: any) => ({
      ...c,
      total_bookings: parseInt(c.total_bookings ?? 0),
      gross_revenue:  parseFloat(c.gross_revenue ?? 0),
      platform_fees:  parseFloat(c.platform_fees ?? 0),
      club_earnings:  parseFloat(c.club_earnings ?? 0),
    })),
  });
});

// ─────────────────────────────────────────────────────────────────────
// GET /api/settings — public endpoint for app-wide display settings
// ─────────────────────────────────────────────────────────────────────
router.get("/settings", async (_req, res): Promise<void> => {
  const vatSetting = await row<any>("SELECT setting_value FROM platform_settings WHERE setting_key = 'vat_pct'");
  res.json({ vat_pct: vatSetting ? parseFloat(vatSetting.setting_value) : 15 });
});

// ─────────────────────────────────────────────────────────────────────
// PUT /admin/revenue/vat — platform admin only
// ─────────────────────────────────────────────────────────────────────
router.put("/admin/revenue/vat", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!isPlatformAdmin(user)) {
    res.status(403).json({ message: "Only platform admins can change the VAT rate" });
    return;
  }

  const { vat_pct } = req.body ?? {};
  const pct = parseFloat(String(vat_pct ?? ""));
  if (isNaN(pct) || pct < 0 || pct > 100) {
    res.status(400).json({ message: "vat_pct must be a number between 0 and 100" });
    return;
  }

  await exec(
    "UPDATE platform_settings SET setting_value = ? WHERE setting_key = 'vat_pct'",
    [pct.toFixed(2)]
  );

  res.json({ success: true, vat_pct: pct });
});

// ─────────────────────────────────────────────────────────────────────
// PUT /admin/revenue/fee — platform admin only
// ─────────────────────────────────────────────────────────────────────
router.put("/admin/revenue/fee", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!isPlatformAdmin(user)) {
    res.status(403).json({ message: "Only platform admins can change the platform fee" });
    return;
  }

  const { fee_flat } = req.body ?? {};
  const flat = parseFloat(String(fee_flat ?? ""));
  if (isNaN(flat) || flat < 0 || flat > 1000) {
    res.status(400).json({ message: "fee_flat must be a rand amount between 0 and 1000" });
    return;
  }

  await exec(
    "UPDATE platform_settings SET setting_value = ? WHERE setting_key = 'platform_fee_flat'",
    [flat.toFixed(2)]
  );

  res.json({ success: true, platform_fee_flat: flat });
});

export default router;
