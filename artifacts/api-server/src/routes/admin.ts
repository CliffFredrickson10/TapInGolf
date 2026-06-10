import { Router, type IRouter } from "express";
import { query, row, exec } from "../lib/pg";
import { getUser, isStaff, isPlatform } from "../lib/auth";
import { createStitchPayment } from "../lib/stitch";
import { randomUUID } from "crypto";
import path from "path";
import multer from "multer";
import { objectStorageClient } from "../lib/objectStorage";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

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
       (SELECT COALESCE(SUM(cb.players),0) FROM bookings cb JOIN portal_tee_slots cpts ON cb.portal_slot_id = cpts.id
        WHERE cpts.club_id = c.id AND cb.booking_source = 'club_counter' AND cb.status != 'cancelled') AS counter_bookings_total,
       (SELECT COALESCE(SUM(cb.players),0) FROM bookings cb JOIN portal_tee_slots cpts ON cb.portal_slot_id = cpts.id
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

// GET /admin/featured-carousel — live state of the home screen carousel
router.get("/admin/featured-carousel", async (req, res): Promise<void> => {
  const caller = await getUser(req);
  if (!isPlatformAdmin(caller)) { res.status(403).json({ message: "Forbidden" }); return; }

  const clubs = await query<any>(`
    SELECT c.id, c.name, c.location, c.province, c.featured_slot_seconds,
      a.id AS ad_id, a.slot_duration AS ad_slot_duration,
      a.campaign_start, a.campaign_end,
      ar.package_name, ar.status AS request_status
    FROM clubs c
    LEFT JOIN ads a ON a.club_id = c.id
      AND a.placement = 'featured_home' AND a.active = 1
      AND (a.campaign_end IS NULL OR a.campaign_end >= CURRENT_DATE)
    LEFT JOIN ad_requests ar ON ar.id = a.ad_request_id
    WHERE c.featured = 1 AND c.active = 1
    ORDER BY a.id DESC NULLS LAST, c.name ASC
  `);

  const result = clubs.map((c: any) => {
    const slotMatch = String(c.ad_slot_duration ?? "").match(/^(\d+)/);
    return {
      id: c.id,
      name: c.name,
      location: c.location,
      province: c.province,
      has_paid_ad: !!c.ad_id,
      ad_slot_duration: c.ad_slot_duration,
      slot_seconds: slotMatch
        ? parseInt(slotMatch[1])
        : (c.featured_slot_seconds ?? 8),
      campaign_end: c.campaign_end,
      package_name: c.package_name,
    };
  });

  res.json({ clubs: result });
});

// PUT /admin/clubs/:id/feature — add to carousel as house pick with optional slot_seconds
router.put("/admin/clubs/:id/feature", async (req, res): Promise<void> => {
  const caller = await getUser(req);
  if (!isPlatformAdmin(caller)) { res.status(403).json({ message: "Forbidden" }); return; }
  const id = parseInt(req.params.id, 10);
  const { slot_seconds } = (req.body ?? {}) as { slot_seconds?: number | null };
  await exec(
    "UPDATE clubs SET featured = 1, featured_slot_seconds = ? WHERE id = ?",
    [slot_seconds ?? null, id]
  );
  res.json({ success: true });
});

// DELETE /admin/clubs/:id/feature — remove from carousel
router.delete("/admin/clubs/:id/feature", async (req, res): Promise<void> => {
  const caller = await getUser(req);
  if (!isPlatformAdmin(caller)) { res.status(403).json({ message: "Forbidden" }); return; }
  const id = parseInt(req.params.id, 10);
  await exec("UPDATE clubs SET featured = 0, featured_slot_seconds = NULL WHERE id = ?", [id]);
  res.json({ success: true });
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
  const { title, subtitle, image_url, cta_text, link_url, placement, layout, priority, active, club_id } = req.body ?? {};
  if (!title || !placement) { res.status(400).json({ message: "title and placement are required" }); return; }
  const id = await exec(
    `INSERT INTO ads (title, subtitle, image_url, cta_text, link_url, placement, layout, priority, active, club_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [title, subtitle ?? null, image_url ?? null, cta_text ?? null, link_url ?? null,
     placement, layout ?? null, priority ?? 0, active !== false ? 1 : 0, club_id ?? null]
  );
  res.status(201).json({ id });
});

router.put("/admin/ads/:id", async (req, res): Promise<void> => {
  const caller = await getUser(req);
  if (!isPlatformAdmin(caller)) { res.status(403).json({ message: "Forbidden" }); return; }
  const id = parseInt(req.params.id, 10);
  const { title, subtitle, image_url, cta_text, link_url, placement, layout, priority, active, club_id } = req.body ?? {};
  await exec(
    `UPDATE ads SET title=?, subtitle=?, image_url=?, cta_text=?, link_url=?,
     placement=?, layout=?, priority=?, active=?, club_id=? WHERE id=?`,
    [title, subtitle ?? null, image_url ?? null, cta_text ?? null, link_url ?? null,
     placement, layout ?? null, priority ?? 0, active ? 1 : 0, club_id ?? null, id]
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
// Admin banner-ad image upload
// ─────────────────────────────────────────────────────────────────────
router.post("/admin/ad-image/upload", upload.single("image"), async (req: any, res: any): Promise<void> => {
  const caller = await getUser(req);
  if (!isPlatformAdmin(caller)) { res.status(403).json({ message: "Forbidden" }); return; }
  const file = req.file;
  if (!file) { res.status(400).json({ message: "No image file provided" }); return; }

  const privateDir = process.env["PRIVATE_OBJECT_DIR"] ?? "";
  if (!privateDir) { res.status(500).json({ message: "Object storage not configured" }); return; }

  const fileUuid = randomUUID();
  const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, "") || "jpg";

  const cleanDir = privateDir.replace(/^\/+/, "").replace(/\/+$/, "");
  const slashIdx = cleanDir.indexOf("/");
  const parsedBucket = slashIdx >= 0 ? cleanDir.slice(0, slashIdx) : cleanDir;
  const basePath = slashIdx >= 0 ? cleanDir.slice(slashIdx + 1) : "";

  const objectKey = basePath
    ? `${basePath}/ad-images/staff/${fileUuid}.${ext}`
    : `ad-images/staff/${fileUuid}.${ext}`;

  const bucket = objectStorageClient.bucket(parsedBucket);
  await bucket.file(objectKey).save(file.buffer, { contentType: file.mimetype });
  await bucket.file(objectKey).setMetadata({ cacheControl: "public, max-age=86400" });

  const host = req.get("host") ?? "localhost";
  const url = `https://${host}/api/storage/objects/ad-images/staff/${fileUuid}.${ext}`;
  res.json({ url });
});

// ─────────────────────────────────────────────────────────────────────
// Ad Requests management — platform admin only
// ─────────────────────────────────────────────────────────────────────

router.get("/admin/ad-requests", async (req, res): Promise<void> => {
  const caller = await getUser(req);
  if (!isPlatformAdmin(caller)) { res.status(403).json({ message: "Forbidden" }); return; }
  const status = req.query.status as string | undefined;
  const where = status ? "WHERE ar.status = ?" : "";
  const params = status ? [status] : [];
  const requests = await query<any>(
    `SELECT ar.*, c.name AS club_name, c.province AS club_province, c.email AS club_email
     FROM ad_requests ar JOIN clubs c ON c.id = ar.club_id
     ${where} ORDER BY ar.created_at DESC`,
    params
  );
  res.json(requests);
});

router.get("/admin/ad-requests/stats", async (req, res): Promise<void> => {
  const caller = await getUser(req);
  if (!isPlatformAdmin(caller)) { res.status(403).json({ message: "Forbidden" }); return; }
  const [pending, live, paymentPending, revenue] = await Promise.all([
    row<any>("SELECT COUNT(*) AS cnt FROM ad_requests WHERE status = 'pending_review'"),
    row<any>("SELECT COUNT(*) AS cnt FROM ad_requests WHERE status = 'live'"),
    row<any>("SELECT COUNT(*) AS cnt FROM ad_requests WHERE status = 'payment_pending'"),
    row<any>("SELECT COALESCE(SUM(confirmed_price),0) AS total FROM ad_requests WHERE status IN ('live','expired') AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())"),
  ]);
  res.json({
    pending_review: Number(pending?.cnt ?? 0),
    live: Number(live?.cnt ?? 0),
    payment_pending: Number(paymentPending?.cnt ?? 0),
    revenue_this_month: Number(revenue?.total ?? 0),
  });
});

router.get("/admin/ad-requests/:id", async (req, res): Promise<void> => {
  const caller = await getUser(req);
  if (!isPlatformAdmin(caller)) { res.status(403).json({ message: "Forbidden" }); return; }
  const reqId = parseInt(req.params.id, 10);
  const request = await row<any>(
    `SELECT ar.*, c.name AS club_name, c.province AS club_province, c.email AS club_email
     FROM ad_requests ar JOIN clubs c ON c.id = ar.club_id WHERE ar.id = ?`,
    [reqId]
  );
  if (!request) { res.status(404).json({ message: "Not found" }); return; }
  res.json(request);
});

router.get("/admin/ad-requests/:id/billing-cycles", async (req, res): Promise<void> => {
  const caller = await getUser(req);
  if (!isPlatformAdmin(caller)) { res.status(403).json({ message: "Forbidden" }); return; }
  const reqId = parseInt(req.params.id, 10);
  const cycles = await query<any>(
    `SELECT id, billing_month, amount, status, stitch_payment_url,
            invoice_sent_at, paid_at, created_at
     FROM ad_billing_cycles WHERE ad_request_id = ? ORDER BY billing_month ASC`,
    [reqId]
  );
  res.json(cycles);
});

router.put("/admin/ad-requests/:id", async (req, res): Promise<void> => {
  const caller = await getUser(req);
  if (!isPlatformAdmin(caller)) { res.status(403).json({ message: "Forbidden" }); return; }
  const reqId = parseInt(req.params.id, 10);
  const { confirmed_price, confirmed_start, confirmed_end, slot_duration, sharing_tier, staff_notes, payment_link, billing_frequency } = req.body ?? {};
  await exec(
    `UPDATE ad_requests SET confirmed_price = COALESCE(?, confirmed_price),
      confirmed_start = COALESCE(?, confirmed_start), confirmed_end = COALESCE(?, confirmed_end),
      slot_duration = COALESCE(?, slot_duration), sharing_tier = COALESCE(?, sharing_tier),
      staff_notes = COALESCE(?, staff_notes),
      payment_link = CASE WHEN ? IS NOT NULL THEN ? ELSE payment_link END,
      billing_frequency = CASE WHEN ? IS NOT NULL THEN ? ELSE billing_frequency END,
      updated_at = NOW()
     WHERE id = ?`,
    [confirmed_price ?? null, confirmed_start ?? null, confirmed_end ?? null,
     slot_duration ?? null, sharing_tier ?? null, staff_notes ?? null,
     payment_link ?? null, payment_link ?? null,
     billing_frequency ?? null, billing_frequency ?? null, reqId]
  );
  res.json(await row<any>("SELECT * FROM ad_requests WHERE id = ?", [reqId]));
});

router.post("/admin/ad-requests/:id/approve", async (req, res): Promise<void> => {
  const caller = await getUser(req);
  if (!isPlatformAdmin(caller)) { res.status(403).json({ message: "Forbidden" }); return; }
  const reqId = parseInt(req.params.id, 10);
  const existing = await row<any>("SELECT id, club_id, headline, status FROM ad_requests WHERE id = ?", [reqId]);
  if (!existing) { res.status(404).json({ message: "Not found" }); return; }
  if (existing.status !== "pending_review") { res.status(400).json({ message: "Only pending_review requests can be approved" }); return; }
  const { confirmed_price, confirmed_start, confirmed_end, slot_duration, sharing_tier, staff_notes, billing_frequency } = req.body ?? {};
  const billingFreq: string = billing_frequency === "monthly" ? "monthly" : "once";

  // Update the record first — COALESCE keeps any previously-saved values when
  // the body field is null (e.g. staff already saved start date via Save Config
  // then clicked Approve without re-entering it).
  await exec(
    `UPDATE ad_requests SET status = 'payment_pending', billing_frequency = ?,
      confirmed_price = COALESCE(?, confirmed_price), confirmed_start = COALESCE(?, confirmed_start),
      confirmed_end = COALESCE(?, confirmed_end), slot_duration = COALESCE(?, slot_duration),
      sharing_tier = COALESCE(?, sharing_tier), staff_notes = COALESCE(?, staff_notes),
      updated_at = NOW()
     WHERE id = ?`,
    [billingFreq, confirmed_price ?? null, confirmed_start ?? null, confirmed_end ?? null,
     slot_duration ?? null, sharing_tier ?? null, staff_notes ?? null, reqId]
  );

  // Read the effective post-COALESCE values from the DB.  We must NOT use the
  // raw body fields for billing calculations — staff may have previously saved
  // price/start via "Save Config" and then clicked Approve without re-filling
  // the form, leaving those body fields null.
  const adReqFull = await row<any>("SELECT * FROM ad_requests WHERE id = ?", [reqId]);
  const amount = Number(adReqFull?.confirmed_price ?? 0);
  const effectiveStart: string | null = adReqFull?.confirmed_start ?? null;

  // Create a club_invoices record of type 'ad_campaign' so it appears on the
  // club's Invoices page with a Pay Now button identical to other invoice types.
  let invoiceId: number | null = null;
  let invoiceRef = "";
  let finalLink: string | null = null;

  // ── Pro-rata calculation ──────────────────────────────────────────────────
  // For monthly campaigns that start mid-month, the initial invoice covers only
  // the remaining days of that first month.  Subsequent full months are billed
  // by the monthly worker on the 1st of each month.
  let invoiceAmount = amount;
  let isProRata = false;
  let proRataNote = "";
  let proRataDays = 0;
  let daysInStartMonth = 0;

  if (billingFreq === "monthly" && effectiveStart) {
    const startDate = new Date(effectiveStart);
    const startDay  = startDate.getUTCDate();
    if (startDay > 1) {
      const y = startDate.getUTCFullYear();
      const m = startDate.getUTCMonth();
      daysInStartMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      proRataDays      = daysInStartMonth - startDay + 1;
      invoiceAmount    = Math.round((amount * proRataDays / daysInStartMonth) * 100) / 100;
      isProRata        = true;
      proRataNote      = ` (pro-rata: ${proRataDays}/${daysInStartMonth} days)`;
    }
  }
  if (billingFreq === "quarterly" && effectiveStart) {
    const startDate      = new Date(effectiveStart);
    const startMonth     = startDate.getUTCMonth(); // 0-11
    const year           = startDate.getUTCFullYear();
    const qStartMonth    = Math.floor(startMonth / 3) * 3; // 0, 3, 6, or 9
    const qEndMonth      = qStartMonth + 2;
    const qEndDate       = new Date(Date.UTC(year, qEndMonth + 1, 0));
    const isFirstDayOfQ  = startDate.getUTCDate() === 1 && startMonth === qStartMonth;
    if (!isFirstDayOfQ) {
      let daysInQuarter = 0;
      for (let i = 0; i < 3; i++) {
        daysInQuarter += new Date(Date.UTC(year, qStartMonth + i + 1, 0)).getUTCDate();
      }
      const remainingDays = Math.floor((qEndDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      invoiceAmount    = Math.round((amount * remainingDays / daysInQuarter) * 100) / 100;
      isProRata        = true;
      proRataDays      = remainingDays;
      daysInStartMonth = daysInQuarter;
      proRataNote      = ` (pro-rata: ${remainingDays}/${daysInQuarter} days)`;
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  if (amount >= 1) {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    invoiceRef = `ADV-${reqId}-${dateStr}${billingFreq === "quarterly" ? "-Q" : ""}${isProRata ? "-PR" : ""}`;
    const vatAmt = Math.round(invoiceAmount * 15 / 115 * 100) / 100;
    const lineItems = [{
      headline:          adReqFull?.headline ?? existing.headline,
      ad_type:           adReqFull?.ad_type ?? "ad",
      start_date:        adReqFull?.confirmed_start ?? null,
      end_date:          adReqFull?.confirmed_end   ?? null,
      billing_frequency: billingFreq,
      amount:            invoiceAmount,
      ...(isProRata && {
        pro_rata:            true,
        pro_rata_days:       proRataDays,
        days_in_month:       daysInStartMonth,
        full_monthly_price:  amount,
      }),
    }];
    const startLabel = adReqFull?.confirmed_start
      ? new Date(adReqFull.confirmed_start).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })
      : null;
    const endLabel = adReqFull?.confirmed_end
      ? new Date(adReqFull.confirmed_end).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })
      : null;
    const periodStr = startLabel && endLabel ? ` · ${startLabel} – ${endLabel}` : "";
    const billingLabel = billingFreq === "monthly"
      ? isProRata ? ` (pro-rata first month${proRataNote})` : " (initial payment)"
      : billingFreq === "quarterly"
      ? isProRata ? ` (pro-rata first quarter${proRataNote})` : " (quarterly initial payment)"
      : "";
    const description = `Ad Campaign: ${existing.headline}${periodStr}${billingLabel}`;

    const invRows = await query<any>(
      `INSERT INTO club_invoices
         (club_id, invoice_ref, description, total_rounds, platform_fee_rate, vat_rate,
          vat_amount, total_amount, invoice_type, line_items, ad_request_id)
       VALUES (?, ?, ?, 1, ?, 0.15, ?, ?, 'ad_campaign', ?::jsonb, ?)
       RETURNING id`,
      [existing.club_id, invoiceRef, description, amount, vatAmt, invoiceAmount,
       JSON.stringify(lineItems), reqId]
    );
    invoiceId = invRows?.[0]?.id ?? null;

    // Try to auto-generate a Stitch payment link on the invoice
    if (invoiceId) {
      try {
        const host = `https://${req.get("host")}`;
        const payment = await createStitchPayment({
          amount:            invoiceAmount,
          payerName:         existing.headline,
          merchantReference: `invoice-${invoiceId}`,
          redirectUrl:       `${host}/api/portal/invoice-success`,
        });
        await exec(
          "UPDATE club_invoices SET stitch_payment_id = ?, stitch_payment_url = ? WHERE id = ?",
          [payment.id, payment.url, invoiceId]
        );
        finalLink = payment.url;
      } catch { /* Stitch not configured — club will pay via portal Pay Now button */ }
    }

    // Keep payment_link on ad_requests pointing at the Stitch URL for staff reference
    if (finalLink) {
      await exec("UPDATE ad_requests SET payment_link = ? WHERE id = ?", [finalLink, reqId]);
    }
  }

  const displayAmount = invoiceAmount;
  const priceStr = displayAmount >= 1
    ? isProRata
      ? ` R ${displayAmount.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} is due for the remainder of this ${billingFreq === "quarterly" ? "quarter" : "month"}${proRataNote}.`
      : ` R ${displayAmount.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} is due.`
    : "";
  const billingNote = billingFreq === "monthly"
    ? isProRata
      ? ` Full monthly invoices of R ${amount.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} will then appear on your Invoices page on the 1st of each subsequent month.`
      : " Monthly invoices will appear on your Invoices page on the 1st of each month for the duration of your campaign."
    : billingFreq === "quarterly"
    ? isProRata
      ? ` Full quarterly invoices of R ${amount.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} will then appear on your Invoices page on the 1st of each quarter.`
      : " Quarterly invoices will appear on your Invoices page on the 1st of each quarter (Jan, Apr, Jul, Oct) for the duration of your campaign."
    : " Once payment is received, your ad will publish automatically.";
  const invoiceStr = invoiceId
    ? ` An invoice (${invoiceRef}) has been added to your Invoices page — use the Pay Now button there to complete payment.`
    : " TapIn staff will be in touch with payment details.";
  const notesStr = staff_notes ? ` Note: ${staff_notes}` : "";
  await exec(
    `INSERT INTO club_inbox_notifications (club_id, type, title, body, meta) VALUES (?, 'ad_update', ?, ?, ?)`,
    [existing.club_id,
     "💳 Payment Required — Complete Your Ad Booking",
     `Great news! Your ad campaign "${existing.headline}" has been approved by TapIn staff.${priceStr}${invoiceStr}${notesStr}${billingNote}`,
     JSON.stringify({ ad_request_id: reqId, invoice_id: invoiceId, payment_link: finalLink, billing_frequency: billingFreq, is_pro_rata: isProRata, invoice_amount: displayAmount })]
  );
  res.json({ success: true });
});

router.post("/admin/ad-requests/:id/reject", async (req, res): Promise<void> => {
  const caller = await getUser(req);
  if (!isPlatformAdmin(caller)) { res.status(403).json({ message: "Forbidden" }); return; }
  const reqId = parseInt(req.params.id, 10);
  const existing = await row<any>("SELECT id, club_id, headline FROM ad_requests WHERE id = ?", [reqId]);
  if (!existing) { res.status(404).json({ message: "Not found" }); return; }
  const { staff_notes } = req.body ?? {};
  await exec(
    "UPDATE ad_requests SET status = 'rejected', staff_notes = COALESCE(?, staff_notes), updated_at = NOW() WHERE id = ?",
    [staff_notes ?? null, reqId]
  );
  const reason = staff_notes ? ` Reason: ${staff_notes}` : " Please contact TapIn staff for more information.";
  await exec(
    `INSERT INTO club_inbox_notifications (club_id, type, title, body, meta) VALUES (?, 'ad_update', ?, ?, ?)`,
    [existing.club_id,
     "Ad Request Not Approved",
     `Unfortunately your ad campaign "${existing.headline}" was not approved at this time.${reason}`,
     JSON.stringify({ ad_request_id: reqId })]
  );
  res.json({ success: true });
});

router.post("/admin/ad-requests/:id/payment-requested", async (req, res): Promise<void> => {
  const caller = await getUser(req);
  if (!isPlatformAdmin(caller)) { res.status(403).json({ message: "Forbidden" }); return; }
  const reqId = parseInt(req.params.id, 10);
  const existing = await row<any>("SELECT id, club_id, headline, confirmed_price, status FROM ad_requests WHERE id = ?", [reqId]);
  if (!existing) { res.status(404).json({ message: "Not found" }); return; }
  if (existing.status !== "approved") { res.status(400).json({ message: "Only approved requests can move to payment_pending" }); return; }
  const { payment_link, staff_notes } = req.body ?? {};
  await exec(
    "UPDATE ad_requests SET status = 'payment_pending', payment_link = COALESCE(?, payment_link), staff_notes = COALESCE(?, staff_notes), updated_at = NOW() WHERE id = ?",
    [payment_link ?? null, staff_notes ?? null, reqId]
  );
  const priceStr = existing.confirmed_price ? ` R ${Number(existing.confirmed_price).toLocaleString()} is due.` : "";
  const linkStr = payment_link
    ? ` Use this link to complete payment: ${payment_link}`
    : " TapIn staff will share a payment link with you via email or phone.";
  const notesStr = staff_notes ? ` Note: ${staff_notes}` : "";
  await exec(
    `INSERT INTO club_inbox_notifications (club_id, type, title, body, meta) VALUES (?, 'ad_update', ?, ?, ?)`,
    [existing.club_id,
     "💳 Payment Required — Complete Your Ad Booking",
     `Your ad campaign "${existing.headline}" is confirmed and ready to go live.${priceStr}${linkStr}${notesStr} Once payment is received, TapIn staff will publish your ad to the app.`,
     JSON.stringify({ ad_request_id: reqId, payment_link: payment_link ?? null })]
  );
  res.json({ success: true });
});

router.post("/admin/ad-requests/:id/publish", async (req, res): Promise<void> => {
  const caller = await getUser(req);
  if (!isPlatformAdmin(caller)) { res.status(403).json({ message: "Forbidden" }); return; }
  const reqId = parseInt(req.params.id, 10);
  const adReq = await row<any>(
    `SELECT ar.*, c.name AS club_name FROM ad_requests ar JOIN clubs c ON c.id = ar.club_id WHERE ar.id = ?`,
    [reqId]
  );
  if (!adReq) { res.status(404).json({ message: "Not found" }); return; }
  if (!["approved","payment_pending"].includes(adReq.status)) {
    res.status(400).json({ message: "Request must be approved or payment_pending to publish" }); return;
  }
  const placementMap: Record<string, string> = {
    club_detail: "club", featured_home: "featured_home", explore: "explore",
    push: "home", tournament: "home", newsletter: "home", nearby_alert: "home", tee_time_deal: "home",
  };
  const placement = placementMap[adReq.ad_type] ?? "home";
  // Resolve "self" placeholder inserted by the club portal when the club doesn't know their own ID
  let resolvedLinkUrl = adReq.link_url ?? null;
  if (resolvedLinkUrl && adReq.club_id) {
    resolvedLinkUrl = resolvedLinkUrl.replace(/tapin:\/\/clubs\/self\b/, `tapin://clubs/${adReq.club_id}`);
  }
  const result = await exec(
    `INSERT INTO ads (club_id, title, subtitle, image_url, cta_text, link_url, layout, placement, priority, active,
      ad_request_id, campaign_start, campaign_end, slot_duration, sharing_tier)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
    [adReq.club_id, adReq.headline, adReq.subtitle ?? null, adReq.image_url ?? null,
     adReq.cta_text ?? "Book Now", resolvedLinkUrl, adReq.layout ?? "classic", placement, 0, reqId,
     adReq.confirmed_start ?? null, adReq.confirmed_end ?? null,
     adReq.slot_duration ?? null, adReq.sharing_tier ?? null]
  );
  const adId = (result as any).insertId;
  await exec(
    "UPDATE ad_requests SET status = 'live', published_ad_id = ?, updated_at = NOW() WHERE id = ?",
    [adId, reqId]
  );
  // Auto-feature the club on the home carousel when a featured_home ad goes live
  if (adReq.ad_type === "featured_home") {
    await exec("UPDATE clubs SET featured = 1 WHERE id = ?", [adReq.club_id]);
  }
  const endNote = adReq.confirmed_end
    ? ` Your campaign runs until ${new Date(adReq.confirmed_end).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}.`
    : "";
  await exec(
    `INSERT INTO club_inbox_notifications (club_id, type, title, body, meta) VALUES (?, 'ad_update', ?, ?, ?)`,
    [adReq.club_id,
     "🚀 Your Ad is Now Live!",
     `"${adReq.headline}" is now live in the TapIn Golf app and visible to golfers across South Africa.${endNote}`,
     JSON.stringify({ ad_request_id: reqId, ad_id: adId })]
  );
  res.json({ success: true, ad_id: adId });
});

router.post("/admin/ad-requests/:id/unpublish", async (req, res): Promise<void> => {
  const caller = await getUser(req);
  if (!isPlatformAdmin(caller)) { res.status(403).json({ message: "Forbidden" }); return; }
  const reqId = parseInt(req.params.id, 10);
  const adReq = await row<any>("SELECT id, status, published_ad_id, ad_type, club_id FROM ad_requests WHERE id = ?", [reqId]);
  if (!adReq) { res.status(404).json({ message: "Not found" }); return; }
  if (adReq.published_ad_id) {
    await exec("DELETE FROM ads WHERE id = ?", [adReq.published_ad_id]);
  }
  await exec("UPDATE ad_requests SET status = 'expired', published_ad_id = NULL, updated_at = NOW() WHERE id = ?", [reqId]);
  // Auto-unfeature the club if this was a featured_home ad and no other active
  // featured_home ads remain AND the club is not a house pick (featured_slot_seconds IS NULL)
  if (adReq.ad_type === "featured_home" && adReq.club_id) {
    const remaining = await row<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM ads
       WHERE club_id = ? AND placement = 'featured_home' AND active = 1 AND id != ?`,
      [adReq.club_id, adReq.published_ad_id ?? 0]
    );
    const housePickClub = await row<{ featured_slot_seconds: number | null }>(
      "SELECT featured_slot_seconds FROM clubs WHERE id = ?",
      [adReq.club_id]
    );
    if ((remaining?.cnt ?? 0) === 0 && housePickClub?.featured_slot_seconds == null) {
      await exec("UPDATE clubs SET featured = 0 WHERE id = ?", [adReq.club_id]);
    }
  }
  if (adReq.club_id) {
    await exec(
      `INSERT INTO club_inbox_notifications (club_id, type, title, body, meta) VALUES (?, 'ad_update', ?, ?, ?)`,
      [adReq.club_id,
       "Ad Campaign Ended",
       "Your ad campaign has been removed from the TapIn Golf app. Contact TapIn staff if you'd like to run another campaign.",
       JSON.stringify({ ad_request_id: reqId })]
    );
  }
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

// ─────────────────────────────────────────────────────────────────────
// Ad Offerings & Packages — pricing catalogue management
// ─────────────────────────────────────────────────────────────────────

router.get("/admin/ad-offerings", async (req, res): Promise<void> => {
  const caller = await getUser(req);
  if (!isPlatformAdmin(caller)) { res.status(403).json({ message: "Forbidden" }); return; }
  const offerings = await query<any>("SELECT * FROM ad_offerings ORDER BY sort_order ASC, id ASC");
  const packages  = await query<any>("SELECT * FROM ad_packages ORDER BY ad_type, sort_order ASC, id ASC");
  const pkgByType: Record<string, any[]> = {};
  for (const pkg of packages) {
    if (!pkgByType[pkg.ad_type]) pkgByType[pkg.ad_type] = [];
    pkgByType[pkg.ad_type].push(pkg);
  }
  res.json(offerings.map(o => ({ ...o, packages: pkgByType[o.ad_type] ?? [] })));
});

router.post("/admin/ad-offerings", async (req, res): Promise<void> => {
  const caller = await getUser(req);
  if (!isPlatformAdmin(caller)) { res.status(403).json({ message: "Forbidden" }); return; }
  const { ad_type, icon = "📢", title, description, where_shown, color = "#1a5c38",
          is_extra = 0, extra_badge, extra_badge_color, extra_price_label, sort_order = 0 } = req.body ?? {};
  if (!ad_type || !title) { res.status(400).json({ message: "ad_type and title required" }); return; }
  const result = await exec(
    `INSERT INTO ad_offerings (ad_type, icon, title, description, where_shown, color, is_extra, extra_badge, extra_badge_color, extra_price_label, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [ad_type, icon, title, description ?? null, where_shown ?? null, color,
     is_extra ? 1 : 0, extra_badge ?? null, extra_badge_color ?? null, extra_price_label ?? null, sort_order]
  );
  res.status(201).json(await row<any>("SELECT * FROM ad_offerings WHERE id = ?", [(result as any).insertId]));
});

router.put("/admin/ad-offerings/:id", async (req, res): Promise<void> => {
  const caller = await getUser(req);
  if (!isPlatformAdmin(caller)) { res.status(403).json({ message: "Forbidden" }); return; }
  const id = parseInt(req.params.id, 10);
  const { icon, title, description, where_shown, color, is_extra, extra_badge,
          extra_badge_color, extra_price_label, sort_order } = req.body ?? {};
  await exec(
    `UPDATE ad_offerings SET
      icon = COALESCE(?, icon), title = COALESCE(?, title),
      description = COALESCE(?, description), where_shown = COALESCE(?, where_shown),
      color = COALESCE(?, color), is_extra = COALESCE(?, is_extra),
      extra_badge = COALESCE(?, extra_badge), extra_badge_color = COALESCE(?, extra_badge_color),
      extra_price_label = COALESCE(?, extra_price_label), sort_order = COALESCE(?, sort_order)
     WHERE id = ?`,
    [icon ?? null, title ?? null, description ?? null, where_shown ?? null, color ?? null,
     is_extra != null ? (is_extra ? 1 : 0) : null,
     extra_badge ?? null, extra_badge_color ?? null, extra_price_label ?? null,
     sort_order ?? null, id]
  );
  res.json(await row<any>("SELECT * FROM ad_offerings WHERE id = ?", [id]));
});

router.post("/admin/ad-offerings/:id/toggle", async (req, res): Promise<void> => {
  const caller = await getUser(req);
  if (!isPlatformAdmin(caller)) { res.status(403).json({ message: "Forbidden" }); return; }
  const id = parseInt(req.params.id, 10);
  await exec("UPDATE ad_offerings SET active = CASE WHEN active = 1 THEN 0 ELSE 1 END WHERE id = ?", [id]);
  res.json(await row<any>("SELECT * FROM ad_offerings WHERE id = ?", [id]));
});

router.delete("/admin/ad-offerings/:id", async (req, res): Promise<void> => {
  const caller = await getUser(req);
  if (!isPlatformAdmin(caller)) { res.status(403).json({ message: "Forbidden" }); return; }
  const id = parseInt(req.params.id, 10);
  await exec("DELETE FROM ad_packages WHERE ad_type = (SELECT ad_type FROM ad_offerings WHERE id = ?)", [id]);
  await exec("DELETE FROM ad_offerings WHERE id = ?", [id]);
  res.json({ success: true });
});

router.post("/admin/ad-packages", async (req, res): Promise<void> => {
  const caller = await getUser(req);
  if (!isPlatformAdmin(caller)) { res.status(403).json({ message: "Forbidden" }); return; }
  const { ad_type, name, price_display, price_period, slot_duration, reach_info, is_popular = 0, sort_order = 0 } = req.body ?? {};
  if (!ad_type || !name || !price_display) { res.status(400).json({ message: "ad_type, name, price_display required" }); return; }
  const result = await exec(
    `INSERT INTO ad_packages (ad_type, name, price_display, price_period, slot_duration, reach_info, is_popular, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [ad_type, name, price_display, price_period ?? null, slot_duration ?? null, reach_info ?? null, is_popular ? 1 : 0, sort_order]
  );
  res.status(201).json(await row<any>("SELECT * FROM ad_packages WHERE id = ?", [(result as any).insertId]));
});

router.put("/admin/ad-packages/:id", async (req, res): Promise<void> => {
  const caller = await getUser(req);
  if (!isPlatformAdmin(caller)) { res.status(403).json({ message: "Forbidden" }); return; }
  const id = parseInt(req.params.id, 10);
  const { name, price_display, price_period, slot_duration, reach_info, is_popular, active, sort_order } = req.body ?? {};
  await exec(
    `UPDATE ad_packages SET
      name = COALESCE(?, name), price_display = COALESCE(?, price_display),
      price_period = COALESCE(?, price_period), slot_duration = COALESCE(?, slot_duration),
      reach_info = COALESCE(?, reach_info),
      is_popular = COALESCE(?, is_popular), active = COALESCE(?, active),
      sort_order = COALESCE(?, sort_order)
     WHERE id = ?`,
    [name ?? null, price_display ?? null, price_period ?? null, slot_duration ?? null,
     reach_info ?? null,
     is_popular != null ? (is_popular ? 1 : 0) : null,
     active != null ? (active ? 1 : 0) : null,
     sort_order ?? null, id]
  );
  res.json(await row<any>("SELECT * FROM ad_packages WHERE id = ?", [id]));
});

router.delete("/admin/ad-packages/:id", async (req, res): Promise<void> => {
  const caller = await getUser(req);
  if (!isPlatformAdmin(caller)) { res.status(403).json({ message: "Forbidden" }); return; }
  await exec("DELETE FROM ad_packages WHERE id = ?", [parseInt(req.params.id, 10)]);
  res.json({ success: true });
});

export default router;
