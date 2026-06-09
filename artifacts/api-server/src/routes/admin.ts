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

  const q = String(req.query.q ?? "").trim();
  const params: any[] = [];
  let whereClause = "";
  if (q) {
    whereClause = "WHERE (u.name ILIKE ? OR u.email ILIKE ?)";
    params.push(`%${q}%`, `%${q}%`);
  }

  const users = await query<any>(
    `SELECT u.id, u.name, u.email, u.role, u.club_id, u.is_super_user, u.created_at,
            c.name as club_name
     FROM users u
     LEFT JOIN clubs c ON c.id = u.club_id
     ${whereClause}
     ORDER BY u.is_super_user DESC, u.role DESC, u.name ASC
     LIMIT 500`,
    params
  );
  res.json({ users });
});

// ─────────────────────────────────────────────────────────────────────
// PUT /admin/users/:id/role — platform admin only: update user role
// ─────────────────────────────────────────────────────────────────────
router.put("/admin/users/:id/role", async (req, res): Promise<void> => {
  const caller = await getUser(req);
  if (!isPlatformAdmin(caller)) { res.status(403).json({ message: "Forbidden" }); return; }

  const targetId = parseInt(req.params.id, 10);
  if (isNaN(targetId)) { res.status(400).json({ message: "Invalid user id" }); return; }

  const { role } = req.body ?? {};
  if (!["user", "club_admin"].includes(role)) {
    res.status(400).json({ message: "role must be 'user' or 'club_admin'" });
    return;
  }

  const clubId = role === "user" ? null : (req.body.club_id ?? null);
  await exec("UPDATE users SET role = ?, club_id = ? WHERE id = ?", [role, clubId, targetId]);
  const updated = await row<any>("SELECT id, name, email, role, club_id FROM users WHERE id = ?", [targetId]);
  res.json({ user: updated });
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
       COALESCE(SUM(b.club_amount), 0) as club_earnings,
       (SELECT COUNT(*) FROM bookings cb JOIN portal_tee_slots cpts ON cb.portal_slot_id = cpts.id
        WHERE cpts.club_id = c.id AND cb.booking_source = 'club_counter' AND cb.status != 'cancelled') AS counter_bookings_total,
       (SELECT COUNT(*) FROM bookings cb JOIN portal_tee_slots cpts ON cb.portal_slot_id = cpts.id
        WHERE cpts.club_id = c.id AND cb.booking_source = 'club_counter' AND cb.status != 'cancelled' AND cb.counter_invoice_id IS NULL) AS counter_bookings_unbilled
     FROM clubs c
     LEFT JOIN portal_tee_slots pts ON pts.club_id = c.id
     LEFT JOIN bookings b ON b.portal_slot_id = pts.id AND b.status IN ('confirmed','completed') AND b.booking_source = 'app'
     WHERE 1=1 ${scope.where.replace("AND c.id", "AND c.id")}
     GROUP BY c.id, c.name, c.location, c.province
     ORDER BY club_earnings DESC`,
    scope.params
  );

  res.json({
    clubs: clubs.map((c: any) => ({
      ...c,
      total_bookings:             parseInt(c.total_bookings ?? 0),
      gross_revenue:              parseFloat(c.gross_revenue ?? 0),
      platform_fees:              parseFloat(c.platform_fees ?? 0),
      club_earnings:              parseFloat(c.club_earnings ?? 0),
      counter_bookings_total:     parseInt(c.counter_bookings_total ?? 0),
      counter_bookings_unbilled:  parseInt(c.counter_bookings_unbilled ?? 0),
    })),
  });
});

// ─────────────────────────────────────────────────────────────────────
// GET /admin/revenue/clubs/:id/bookings?from=YYYY-MM-DD&to=YYYY-MM-DD
// Returns paginated bookings + aggregate summary for one club.
// ─────────────────────────────────────────────────────────────────────
router.get("/admin/revenue/clubs/:id/bookings", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!isStaff(user)) { res.status(403).json({ message: "Forbidden" }); return; }

  const clubId = parseInt(req.params.id, 10);
  if (isNaN(clubId)) { res.status(400).json({ message: "Invalid club id" }); return; }
  // club-scoped admins can only see their own club
  if (user.club_id != null && user.club_id !== clubId) {
    res.status(403).json({ message: "Forbidden" }); return;
  }

  const { from, to } = req.query as any;
  const limit  = Math.min(parseInt(String(req.query.limit  ?? "500"), 10), 500);
  const offset = parseInt(String(req.query.offset ?? "0"), 10);

  const dateFilter = from && to ? "AND pts.date >= ? AND pts.date <= ?" : "";
  const dateParams: any[] = from && to ? [from, to] : [];

  const bookings = await query<any>(
    `SELECT b.id, b.booking_ref, b.total_amount, b.platform_fee, b.club_amount,
            b.payment_method, b.status, b.created_at, b.players,
            u.name as golfer_name, u.email as golfer_email,
            pts.date, pts.tee_time AS time
     FROM bookings b
     JOIN portal_tee_slots pts ON pts.id = b.portal_slot_id
     JOIN users u ON u.id = b.user_id
     WHERE pts.club_id = ? AND b.status IN ('confirmed','completed') ${dateFilter}
     ORDER BY pts.date DESC, pts.tee_time DESC
     LIMIT ${limit} OFFSET ${offset}`,
    [clubId, ...dateParams]
  );

  const agg = await row<any>(
    `SELECT COUNT(b.id) AS cnt,
            COALESCE(SUM(b.total_amount), 0) AS gross,
            COALESCE(SUM(b.platform_fee), 0) AS fees,
            COALESCE(SUM(b.club_amount),  0) AS earnings
     FROM bookings b
     JOIN portal_tee_slots pts ON pts.id = b.portal_slot_id
     WHERE pts.club_id = ? AND b.status IN ('confirmed','completed') ${dateFilter}`,
    [clubId, ...dateParams]
  );

  res.json({
    bookings: bookings.map((b: any) => ({
      ...b,
      total_amount: parseFloat(b.total_amount ?? 0),
      platform_fee: parseFloat(b.platform_fee ?? 0),
      club_amount:  parseFloat(b.club_amount  ?? 0),
    })),
    summary: {
      total_bookings: parseInt(agg?.cnt       ?? "0"),
      gross_revenue:  parseFloat(agg?.gross   ?? "0"),
      platform_fees:  parseFloat(agg?.fees    ?? "0"),
      club_earnings:  parseFloat(agg?.earnings ?? "0"),
    },
  });
});

// ─────────────────────────────────────────────────────────────────────
// GET /api/settings — public endpoint for app-wide display settings
// ─────────────────────────────────────────────────────────────────────
router.get("/settings", async (_req, res): Promise<void> => {
  const [vatSetting, feeSetting] = await Promise.all([
    row<any>("SELECT setting_value FROM platform_settings WHERE setting_key = 'vat_pct'"),
    row<any>("SELECT setting_value FROM platform_settings WHERE setting_key = 'platform_fee_flat'"),
  ]);
  res.json({
    vat_pct:          vatSetting  ? parseFloat(vatSetting.setting_value)  : 15,
    platform_fee_flat: feeSetting ? parseFloat(feeSetting.setting_value)  : 10,
  });
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

// ─────────────────────────────────────────────────────────────────────
// GET /admin/clubs-list — paginated clubs for management
// ─────────────────────────────────────────────────────────────────────
router.get("/admin/clubs-list", async (req, res): Promise<void> => {
  const caller = await getUser(req);
  if (!isPlatformAdmin(caller)) { res.status(403).json({ message: "Forbidden" }); return; }

  const q        = String(req.query.q ?? "").trim();
  const province = String(req.query.province ?? "").trim();
  const active   = req.query.active != null ? String(req.query.active) : null;
  const page     = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
  const limit    = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "30"), 10)));
  const offset   = (page - 1) * limit;

  const where: string[] = [];
  const params: any[]   = [];
  if (q)                          { where.push("(c.name ILIKE ? OR c.location ILIKE ?)"); params.push(`%${q}%`, `%${q}%`); }
  if (province)                   { where.push("c.province = ?"); params.push(province); }
  if (active === "1" || active === "0") { where.push("c.active = ?"); params.push(parseInt(active)); }

  const whereSQL = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [clubs, total] = await Promise.all([
    query<any>(
      `SELECT c.id, c.name, c.location, c.province, c.holes, c.price_from,
              c.active, c.featured, c.created_at
       FROM clubs c ${whereSQL} ORDER BY c.name ASC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    ),
    row<any>(`SELECT COUNT(*) AS total FROM clubs c ${whereSQL}`, params),
  ]);

  res.json({ clubs, total: parseInt(total?.total ?? "0", 10), page, limit });
});

// PUT /admin/clubs/:id/toggle — toggle active
router.put("/admin/clubs/:id/toggle", async (req, res): Promise<void> => {
  const caller = await getUser(req);
  if (!isPlatformAdmin(caller)) { res.status(403).json({ message: "Forbidden" }); return; }
  const id = parseInt(req.params.id, 10);
  await exec("UPDATE clubs SET active = CASE WHEN active = 1 THEN 0 ELSE 1 END WHERE id = ?", [id]);
  const club = await row<any>("SELECT id, active FROM clubs WHERE id = ?", [id]);
  res.json({ club });
});

// PUT /admin/clubs/:id/toggle-featured
router.put("/admin/clubs/:id/toggle-featured", async (req, res): Promise<void> => {
  const caller = await getUser(req);
  if (!isPlatformAdmin(caller)) { res.status(403).json({ message: "Forbidden" }); return; }
  const id = parseInt(req.params.id, 10);
  await exec("UPDATE clubs SET featured = CASE WHEN featured = 1 THEN 0 ELSE 1 END WHERE id = ?", [id]);
  const club = await row<any>("SELECT id, featured FROM clubs WHERE id = ?", [id]);
  res.json({ club });
});

// ─────────────────────────────────────────────────────────────────────
// Ads management — platform admin only
// ─────────────────────────────────────────────────────────────────────
router.get("/admin/ads", async (req, res): Promise<void> => {
  const caller = await getUser(req);
  if (!isPlatformAdmin(caller)) { res.status(403).json({ message: "Forbidden" }); return; }
  const ads = await query<any>(
    `SELECT a.*, c.name AS club_name
     FROM ads a LEFT JOIN clubs c ON c.id = a.club_id
     ORDER BY a.priority DESC, a.id DESC`
  );
  res.json({ ads });
});

router.post("/admin/ads", async (req, res): Promise<void> => {
  const caller = await getUser(req);
  if (!isPlatformAdmin(caller)) { res.status(403).json({ message: "Forbidden" }); return; }
  const { title, subtitle, image_url, cta_text, link_url, placement, priority, active, club_id } = req.body ?? {};
  if (!title || !placement) { res.status(400).json({ message: "title and placement are required" }); return; }
  const id = await exec(
    `INSERT INTO ads (title, subtitle, image_url, cta_text, link_url, placement, priority, active, club_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [title, subtitle ?? null, image_url ?? null, cta_text ?? null, link_url ?? null,
     placement, priority ?? 0, active !== false ? 1 : 0, club_id ?? null]
  );
  res.status(201).json({ id });
});

router.put("/admin/ads/:id", async (req, res): Promise<void> => {
  const caller = await getUser(req);
  if (!isPlatformAdmin(caller)) { res.status(403).json({ message: "Forbidden" }); return; }
  const id = parseInt(req.params.id, 10);
  const { title, subtitle, image_url, cta_text, link_url, placement, priority, active, club_id } = req.body ?? {};
  await exec(
    `UPDATE ads SET title=?, subtitle=?, image_url=?, cta_text=?, link_url=?,
     placement=?, priority=?, active=?, club_id=? WHERE id=?`,
    [title, subtitle ?? null, image_url ?? null, cta_text ?? null, link_url ?? null,
     placement, priority ?? 0, active ? 1 : 0, club_id ?? null, id]
  );
  res.json({ success: true });
});

router.delete("/admin/ads/:id", async (req, res): Promise<void> => {
  const caller = await getUser(req);
  if (!isPlatformAdmin(caller)) { res.status(403).json({ message: "Forbidden" }); return; }
  await exec("DELETE FROM ads WHERE id = ?", [parseInt(req.params.id, 10)]);
  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────────────
// Vouchers management — platform admin only
// ─────────────────────────────────────────────────────────────────────
router.get("/admin/vouchers", async (req, res): Promise<void> => {
  const caller = await getUser(req);
  if (!isPlatformAdmin(caller)) { res.status(403).json({ message: "Forbidden" }); return; }
  const vouchers = await query<any>(
    `SELECT v.*, c.name AS club_name
     FROM vouchers v LEFT JOIN clubs c ON c.id = v.club_id
     ORDER BY v.created_at DESC`
  );
  res.json({ vouchers });
});

router.post("/admin/vouchers", async (req, res): Promise<void> => {
  const caller = await getUser(req);
  if (!isPlatformAdmin(caller)) { res.status(403).json({ message: "Forbidden" }); return; }
  const { code, discount_type, discount_value, club_id, min_amount, max_uses, expires_at } = req.body ?? {};
  if (!code || !discount_type || discount_value === undefined) {
    res.status(400).json({ message: "code, discount_type and discount_value are required" });
    return;
  }
  const codeUpper = String(code).toUpperCase().trim();
  const id = await exec(
    `INSERT INTO vouchers (code, discount_type, discount_value, club_id, min_amount, max_uses, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [codeUpper, discount_type, parseFloat(discount_value),
     club_id ?? null, min_amount ? parseFloat(min_amount) : 0,
     max_uses ? parseInt(max_uses) : null, expires_at ?? null]
  );
  res.status(201).json({ id });
});

router.put("/admin/vouchers/:id", async (req, res): Promise<void> => {
  const caller = await getUser(req);
  if (!isPlatformAdmin(caller)) { res.status(403).json({ message: "Forbidden" }); return; }
  const id = parseInt(req.params.id, 10);
  const { active, max_uses, expires_at, min_amount } = req.body ?? {};
  const sets: string[] = [];
  const params: any[] = [];
  if (active !== undefined)    { sets.push("active = ?");    params.push(active ? 1 : 0); }
  if (max_uses !== undefined)  { sets.push("max_uses = ?");  params.push(max_uses ? parseInt(max_uses) : null); }
  if (expires_at !== undefined){ sets.push("expires_at = ?");params.push(expires_at || null); }
  if (min_amount !== undefined){ sets.push("min_amount = ?");params.push(parseFloat(min_amount) || 0); }
  if (sets.length === 0) { res.status(400).json({ message: "Nothing to update" }); return; }
  await exec(`UPDATE vouchers SET ${sets.join(", ")} WHERE id = ?`, [...params, id]);
  res.json({ success: true });
});

router.delete("/admin/vouchers/:id", async (req, res): Promise<void> => {
  const caller = await getUser(req);
  if (!isPlatformAdmin(caller)) { res.status(403).json({ message: "Forbidden" }); return; }
  await exec("DELETE FROM vouchers WHERE id = ?", [parseInt(req.params.id, 10)]);
  res.json({ success: true });
});

export default router;
