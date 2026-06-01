import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import crypto from "crypto";
import { randomUUID } from "crypto";
import path from "path";
import bcrypt from "bcryptjs";
import multer from "multer";
import { query, row, exec, run } from "../lib/pg";
import { objectStorageClient } from "../lib/objectStorage";
import { generateOTP, hashOTP, generateResetToken, sendOTPEmail, sendInvoiceEmail } from "../lib/otp";
import { logger } from "../lib/logger";

// Normalize tee_start_type: the portal sends snake_case, the DB constraint requires display format
const TEE_START_MAP: Record<string, string> = {
  first_tee:  "1st Tee",
  tenth_tee:  "10th Tee",
  two_tee:    "Two-Tee Start",
};
function normTeeStart(raw: string | undefined | null): string {
  if (!raw) return "1st Tee";
  return TEE_START_MAP[raw] ?? raw; // pass through if already correct format
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

const router: IRouter = Router();

const SECRET = process.env["SESSION_SECRET"] ?? "tapingolf_club_portal_2026";

function generateClubToken(clubId: number): string {
  const payload = Buffer.from(
    JSON.stringify({ sub: clubId, type: "club", iat: Date.now(), exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

function verifyClubToken(token: string): number | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
  if (!crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(sig, "hex"))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (data.type !== "club") return null;
    if (data.exp < Date.now()) return null;
    return data.sub as number;
  } catch {
    return null;
  }
}

async function requireClubAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization ?? "";
  if (!header.startsWith("Bearer ")) { res.status(401).json({ message: "Unauthorized" }); return; }
  const clubId = verifyClubToken(header.slice(7));
  if (!clubId) { res.status(401).json({ message: "Invalid or expired token" }); return; }
  const club = await row<any>("SELECT id, name, location, province, image_url, logo_url, holes, price_from, facilities, website, description, phone, email, address, featured, active, cart_available, cart_compulsory, cart_price, latitude, longitude, geofence_enabled, geofence_radius_m, username FROM clubs WHERE id = ? AND active = 1", [clubId]);
  if (!club) { res.status(401).json({ message: "Club not found" }); return; }
  (req as any).club = club;
  next();
}

function getClub(req: Request): any { return (req as any).club; }

// ─── AUTH ────────────────────────────────────────────────────────────────────

router.post("/portal/auth/login", async (req: Request, res: Response): Promise<void> => {
  const { username, password } = req.body ?? {};
  if (!username || !password) { res.status(400).json({ message: "Username and password required" }); return; }
  const club = await row<any>("SELECT id, name, location, province, password_hash, active FROM clubs WHERE username = ? LIMIT 1", [String(username).trim().toLowerCase()]);
  if (!club || !club.active) { res.status(401).json({ message: "Invalid credentials" }); return; }
  const valid = await bcrypt.compare(String(password), club.password_hash);
  if (!valid) { res.status(401).json({ message: "Invalid credentials" }); return; }
  const token = generateClubToken(club.id);
  res.json({ token, club: { id: club.id, name: club.name, location: club.location, province: club.province } });
});

// ── POST /portal/auth/forgot-password ────────────────────────────────────────
router.post("/portal/auth/forgot-password", async (req: Request, res: Response): Promise<void> => {
  const rawEmail = String(req.body?.email ?? "").trim().toLowerCase();
  if (!rawEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
    res.status(400).json({ message: "Valid email address is required" }); return;
  }
  const club = await row<any>("SELECT id, name, email FROM clubs WHERE LOWER(email) = ? AND active = 1 LIMIT 1", [rawEmail]);
  // Always respond 200 to avoid revealing whether an email is registered
  if (!club) { res.json({ success: true, message: "If that email is registered, a code has been sent." }); return; }

  const recent = await row<any>(
    "SELECT COUNT(*) as cnt FROM club_password_reset_otps WHERE email = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)",
    [rawEmail]
  );
  if (parseInt(recent?.cnt ?? "0") >= 3) {
    res.status(429).json({ message: "Too many attempts. Please wait an hour before trying again." }); return;
  }

  const otp       = generateOTP();
  const otpHash   = hashOTP(otp);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await exec(
    "INSERT INTO club_password_reset_otps (club_id, email, otp_hash, expires_at) VALUES (?, ?, ?, ?)",
    [club.id, rawEmail, otpHash, expiresAt]
  );

  let devOtp: string | undefined;
  try {
    const result = await sendOTPEmail(rawEmail, otp);
    if (result.dev) devOtp = otp;
  } catch (err) {
    logger.error({ err, email: rawEmail }, "Failed to send club OTP email");
    res.status(500).json({ message: "Failed to send verification code. Please try again." }); return;
  }

  const response: Record<string, any> = { success: true, message: "Verification code sent." };
  if (devOtp) response.dev_otp = devOtp;
  res.json(response);
});

// ── POST /portal/auth/verify-otp ─────────────────────────────────────────────
router.post("/portal/auth/verify-otp", async (req: Request, res: Response): Promise<void> => {
  const rawEmail = String(req.body?.email ?? "").trim().toLowerCase();
  const rawOtp   = String(req.body?.otp   ?? "").trim();
  if (!rawEmail || !rawOtp) { res.status(400).json({ message: "Email and OTP are required" }); return; }

  const otpHash = hashOTP(rawOtp);
  const record  = await row<any>(
    "SELECT id, club_id, expires_at, used_at FROM club_password_reset_otps WHERE email = ? AND otp_hash = ? ORDER BY created_at DESC LIMIT 1",
    [rawEmail, otpHash]
  );
  if (!record)            { res.status(400).json({ message: "Invalid or expired code." }); return; }
  if (record.used_at)     { res.status(400).json({ message: "This code has already been used." }); return; }
  if (new Date(record.expires_at) < new Date()) {
    res.status(400).json({ message: "This code has expired. Please request a new one." }); return;
  }

  const resetToken = generateResetToken();
  await exec("UPDATE club_password_reset_otps SET reset_token = ? WHERE id = ?", [resetToken, record.id]);
  res.json({ success: true, reset_token: resetToken });
});

// ── POST /portal/auth/reset-password ─────────────────────────────────────────
router.post("/portal/auth/reset-password", async (req: Request, res: Response): Promise<void> => {
  const resetToken  = String(req.body?.reset_token  ?? "").trim();
  const newPassword = String(req.body?.new_password ?? "").trim();
  if (!resetToken || !newPassword) {
    res.status(400).json({ message: "reset_token and new_password are required" }); return;
  }
  if (newPassword.length < 6) { res.status(400).json({ message: "Password must be at least 6 characters" }); return; }

  const record = await row<any>(
    "SELECT id, club_id, expires_at, used_at FROM club_password_reset_otps WHERE reset_token = ? ORDER BY created_at DESC LIMIT 1",
    [resetToken]
  );
  if (!record)            { res.status(400).json({ message: "Invalid or expired reset token." }); return; }
  if (record.used_at)     { res.status(400).json({ message: "This reset link has already been used." }); return; }
  if (new Date(record.expires_at) < new Date()) {
    res.status(400).json({ message: "This reset link has expired. Please start again." }); return;
  }

  const hash = await bcrypt.hash(newPassword, 10);
  await exec("UPDATE clubs SET password_hash = ? WHERE id = ?", [hash, record.club_id]);
  await exec("UPDATE club_password_reset_otps SET used_at = NOW() WHERE id = ?", [record.id]);
  res.json({ success: true, message: "Password has been reset successfully." });
});

router.get("/portal/auth/me", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  res.json({
    id: club.id, name: club.name, location: club.location, province: club.province,
    image_url: club.image_url, logo_url: club.logo_url, holes: club.holes,
    price_from: club.price_from ? Number(club.price_from) : null,
    facilities: typeof club.facilities === "string" ? JSON.parse(club.facilities || "[]") : (club.facilities ?? []),
    website: club.website, description: club.description, phone: club.phone, email: club.email,
    featured: !!club.featured, active: !!club.active,
    cart_available: !!club.cart_available, cart_compulsory: !!club.cart_compulsory,
    cart_price: club.cart_price ? Number(club.cart_price) : null,
    latitude: club.latitude ? Number(club.latitude) : null,
    longitude: club.longitude ? Number(club.longitude) : null,
    geofence_enabled: !!club.geofence_enabled, geofence_radius_m: club.geofence_radius_m,
    username: club.username,
  });
});

// ─── PROFILE ─────────────────────────────────────────────────────────────────

router.get("/portal/me", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  res.json({
    id: club.id, name: club.name, location: club.location, province: club.province,
    image_url: club.image_url, logo_url: club.logo_url, holes: club.holes,
    price_from: club.price_from ? Number(club.price_from) : null,
    facilities: typeof club.facilities === "string" ? JSON.parse(club.facilities || "[]") : (club.facilities ?? []),
    website: club.website, description: club.description, phone: club.phone, email: club.email,
    featured: !!club.featured, active: !!club.active,
    cart_available: !!club.cart_available, cart_compulsory: !!club.cart_compulsory,
    cart_price: club.cart_price ? Number(club.cart_price) : null,
    latitude: club.latitude ? Number(club.latitude) : null,
    longitude: club.longitude ? Number(club.longitude) : null,
    geofence_enabled: !!club.geofence_enabled, geofence_radius_m: club.geofence_radius_m,
  });
});

router.put("/portal/me", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const { name, location, province, image_url, logo_url, holes, price_from, facilities, website, description,
          phone, email, address, cart_available, cart_compulsory, cart_price, latitude, longitude,
          geofence_enabled, geofence_radius_m } = req.body ?? {};

  await exec(
    `UPDATE clubs SET
      name = COALESCE(?, name), location = COALESCE(?, location), province = COALESCE(?, province),
      image_url = ?, logo_url = ?, holes = COALESCE(?, holes), price_from = COALESCE(?, price_from),
      facilities = COALESCE(?, facilities), website = ?, description = ?, phone = ?, email = ?, address = ?,
      cart_available = COALESCE(?, cart_available), cart_compulsory = COALESCE(?, cart_compulsory),
      cart_price = ?, latitude = ?, longitude = ?,
      geofence_enabled = COALESCE(?, geofence_enabled), geofence_radius_m = COALESCE(?, geofence_radius_m)
    WHERE id = ?`,
    [name ?? null, location ?? null, province ?? null,
     image_url ?? null, logo_url ?? null, holes ?? null, price_from ?? null,
     facilities ? JSON.stringify(facilities) : null, website ?? null, description ?? null, phone ?? null, email ?? null, address ?? null,
     cart_available != null ? (cart_available ? 1 : 0) : null,
     cart_compulsory != null ? (cart_compulsory ? 1 : 0) : null,
     cart_price ?? null, latitude ?? null, longitude ?? null,
     geofence_enabled != null ? (geofence_enabled ? 1 : 0) : null, geofence_radius_m ?? null,
     club.id]
  );
  const updated = await row<any>("SELECT id, name, location, province, image_url, logo_url, holes, price_from, facilities, website, description, phone, email, address, cart_available, cart_compulsory, cart_price, latitude, longitude, geofence_enabled, geofence_radius_m FROM clubs WHERE id = ?", [club.id]);
  res.json({ ...updated, facilities: typeof updated!.facilities === "string" ? JSON.parse(updated!.facilities || "[]") : updated!.facilities });
});

// ─── CANCELLATION POLICY ─────────────────────────────────────────────────────

router.get("/portal/cancellation-policy", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const [data, feeSetting] = await Promise.all([
    row<any>(
      `SELECT cancel_policy_preset, cancel_full_refund_hours, cancel_has_partial, cancel_partial_pct,
              cancel_partial_hours, cancel_payment_hours, cancel_payment_minutes,
              cancel_weather, cancel_contact_email, cancel_contact_phone, cancel_other_policies,
              cancel_fee_pct
       FROM clubs WHERE id = ?`,
      [club.id]
    ),
    row<any>("SELECT setting_value FROM platform_settings WHERE setting_key = 'platform_fee_pct'"),
  ]);
  const minFeePct = feeSetting ? parseFloat(feeSetting.setting_value) : 5;
  res.json({
    preset:             data?.cancel_policy_preset   ?? "standard",
    full_refund_hours:  data?.cancel_full_refund_hours != null ? Number(data.cancel_full_refund_hours) : 48,
    has_partial:        data?.cancel_has_partial != null ? !!Number(data.cancel_has_partial) : true,
    partial_pct:        data?.cancel_partial_pct  != null ? Number(data.cancel_partial_pct)  : 50,
    partial_hours:      data?.cancel_partial_hours != null ? Number(data.cancel_partial_hours) : 24,
    payment_minutes:    data?.cancel_payment_minutes != null
                          ? Number(data.cancel_payment_minutes)
                          : (data?.cancel_payment_hours != null ? Number(data.cancel_payment_hours) * 60 : 1440),
    weather:            data?.cancel_weather ?? "full_refund",
    contact_email:      data?.cancel_contact_email  ?? null,
    contact_phone:      data?.cancel_contact_phone  ?? null,
    other_policies:     data?.cancel_other_policies ?? null,
    fee_pct:            data?.cancel_fee_pct != null ? Math.max(Number(data.cancel_fee_pct), minFeePct) : minFeePct,
    min_fee_pct:        minFeePct,
  });
});

router.put("/portal/cancellation-policy", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const { preset, full_refund_hours, has_partial, partial_pct, partial_hours,
          payment_hours, payment_minutes, weather, contact_email, contact_phone,
          other_policies, fee_pct } = req.body ?? {};

  const VALID_PRESETS  = ["flexible", "standard", "strict", "non_refundable"];
  const VALID_WEATHER  = ["full_refund", "rebook_only", "no_refund"];
  const presetVal      = VALID_PRESETS.includes(String(preset)) ? String(preset) : "standard";
  const weatherVal     = VALID_WEATHER.includes(String(weather)) ? String(weather) : "full_refund";
  const rawMins        = payment_minutes != null ? Number(payment_minutes) : (payment_hours != null ? Number(payment_hours) * 60 : 1440);
  const payMins        = Math.min(2880, Math.max(30, Math.round(rawMins)));
  const platformFeeSetting = await row<any>("SELECT setting_value FROM platform_settings WHERE setting_key = 'platform_fee_pct'");
  const minFeePct      = platformFeeSetting ? parseFloat(platformFeeSetting.setting_value) : 5;
  const feePct         = Math.max(minFeePct, Math.min(100, Math.round(Number(fee_pct) || minFeePct)));
  const fullHours      = full_refund_hours != null ? Number(full_refund_hours) : null;
  const hasPartial     = !!has_partial && presetVal !== "non_refundable";
  const partialPct     = partial_pct  != null ? Math.min(100, Math.max(1, Number(partial_pct)))  : null;
  const partialHours   = partial_hours != null ? Number(partial_hours) : null;

  await exec(
    `UPDATE clubs SET
       cancel_policy_preset    = ?,
       cancel_full_refund_hours = ?,
       cancel_has_partial      = ?,
       cancel_partial_pct      = ?,
       cancel_partial_hours    = ?,
       cancel_payment_hours    = ?,
       cancel_payment_minutes  = ?,
       cancel_weather          = ?,
       cancel_contact_email    = ?,
       cancel_contact_phone    = ?,
       cancel_other_policies   = ?,
       cancel_fee_pct          = ?
     WHERE id = ?`,
    [presetVal, fullHours, hasPartial ? 1 : 0, partialPct, partialHours,
     Math.round(payMins / 60), payMins, weatherVal,
     contact_email ? String(contact_email).trim() || null : null,
     contact_phone ? String(contact_phone).trim() || null : null,
     other_policies ? String(other_policies).trim() || null : null,
     feePct,
     club.id]
  );
  res.json({ success: true });
});

// ─── DASHBOARD ───────────────────────────────────────────────────────────────

router.get("/portal/dashboard", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const today = new Date().toISOString().split("T")[0];
  const [teeTimes, bookings, reviews, members, events] = await Promise.all([
    row<any>("SELECT COUNT(*) AS total, SUM(is_active) AS active_count FROM portal_tee_slots WHERE club_id = ? AND date = ?", [club.id, today]),
    row<any>("SELECT COUNT(*) AS total, SUM(CASE WHEN status='confirmed' THEN 1 ELSE 0 END) AS confirmed, SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending FROM bookings b JOIN portal_tee_slots pts ON b.portal_slot_id = pts.id WHERE pts.club_id = ? AND DATE(b.created_at) = ?", [club.id, today]),
    row<any>("SELECT COUNT(*) AS total, AVG(rating) AS avg_rating FROM reviews WHERE club_id = ?", [club.id]),
    row<any>("SELECT COUNT(*) AS total FROM club_members WHERE club_id = ? AND status = 'active'", [club.id]),
    row<any>("SELECT COUNT(*) AS total FROM golf_events WHERE club_id = ? AND status = 'active'", [club.id]),
  ]);
  const recentBookings = await query<any>(
    `SELECT b.id, b.booking_ref, b.players, b.total_amount, b.status, b.created_at,
            u.name AS guest_name, pts.date, pts.tee_time AS time
     FROM bookings b
     JOIN portal_tee_slots pts ON b.portal_slot_id = pts.id
     JOIN users u ON b.user_id = u.id
     WHERE pts.club_id = ?
     ORDER BY b.created_at DESC LIMIT 5`,
    [club.id]
  );
  res.json({
    tee_times_today: Number(teeTimes?.total ?? 0),
    active_tee_times_today: Number(teeTimes?.active_count ?? 0),
    bookings_today: Number(bookings?.total ?? 0),
    confirmed_bookings_today: Number(bookings?.confirmed ?? 0),
    pending_bookings_today: Number(bookings?.pending ?? 0),
    total_reviews: Number(reviews?.total ?? 0),
    avg_rating: reviews?.avg_rating ? Number(Number(reviews.avg_rating).toFixed(1)) : null,
    active_members: Number(members?.total ?? 0),
    active_events: Number(events?.total ?? 0),
    recent_bookings: recentBookings.map((b: any) => ({ ...b, time: String(b.time).slice(0, 5) })),
  });
});

// ─── TEE TIMES ───────────────────────────────────────────────────────────────

router.get("/portal/tee-times", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const { date, from, to } = req.query as any;
  let sql = "SELECT id, date, tee_time AS time, max_players AS total_slots, is_active AS active, session_type, tee_start_type, notes, weekday_rate_code, weekend_rate_code, COALESCE(blocked_slots,'[]') AS blocked_slots FROM portal_tee_slots WHERE club_id = ?";
  const params: any[] = [club.id];
  if (date) { sql += " AND date = ?"; params.push(date); }
  else if (from && to) { sql += " AND date BETWEEN ? AND ?"; params.push(from, to); }
  else { sql += " AND date >= CURRENT_DATE"; }
  sql += " ORDER BY date, tee_time LIMIT 1000";
  const rows = await query<any>(sql, params);
  res.json(rows.map(r => ({
    ...r,
    price: 0,
    price_9: null,
    promotional_price: null,
    tee_start_type: r.tee_start_type ?? "1st Tee",
    crossover_enabled: false,
    active: !!r.active,
    blocked_slots: JSON.parse(r.blocked_slots ?? "[]"),
  })));
});

router.post("/portal/tee-times", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const { date, time, total_slots = 4, active = 1, session_type = "AM", tee_start_type, notes } = req.body ?? {};
  if (!date || !time) { res.status(400).json({ message: "date and time required" }); return; }
  const insertRows = await query<any>(
    "INSERT INTO portal_tee_slots (club_id, date, tee_time, max_players, is_active, session_type, tee_start_type, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
    [club.id, date, time, Number(total_slots), active ? 1 : 0, session_type, normTeeStart(tee_start_type), notes ?? null]
  );
  const insertId = insertRows[0]?.id;
  const inserted = await row<any>("SELECT id, date, tee_time AS time, max_players AS total_slots, is_active AS active, session_type, tee_start_type FROM portal_tee_slots WHERE id = ?", [insertId]);
  res.json({ ...inserted, price: 0, price_9: null, promotional_price: null, crossover_enabled: false, active: !!inserted!.active });
});

// DELETE /portal/tee-times/clear — delete all tee times for club in a date range
router.delete("/portal/tee-times/clear", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const { from, to } = req.query as any;
  if (!from || !to) { res.status(400).json({ message: "from and to dates required" }); return; }
  const deleted = await run("DELETE FROM portal_tee_slots WHERE club_id = ? AND date BETWEEN ? AND ?", [club.id, from, to]);
  res.json({ message: "Cleared", deleted });
});

router.put("/portal/tee-times/:id", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const ttId = Number(req.params.id);
  const existing = await row<any>("SELECT id FROM portal_tee_slots WHERE id = ? AND club_id = ?", [ttId, club.id]);
  if (!existing) { res.status(404).json({ message: "Tee time not found" }); return; }
  const { date, time, total_slots, active, session_type, tee_start_type, notes, blocked_slots } = req.body ?? {};
  const normStart = tee_start_type != null ? normTeeStart(tee_start_type) : null;
  const blockedJson = blocked_slots !== undefined ? JSON.stringify(blocked_slots) : null;
  await exec(
    `UPDATE portal_tee_slots SET
      date = COALESCE(?, date), tee_time = COALESCE(?, tee_time),
      max_players = COALESCE(?, max_players), is_active = COALESCE(?, is_active),
      session_type = COALESCE(?, session_type),
      tee_start_type = COALESCE(?, tee_start_type),
      notes = COALESCE(?, notes),
      blocked_slots = COALESCE(?, blocked_slots)
     WHERE id = ? AND club_id = ?`,
    [date ?? null, time ?? null,
     total_slots ?? null, active != null ? (active ? 1 : 0) : null,
     session_type ?? null, normStart, notes ?? null, blockedJson,
     ttId, club.id]
  );
  const updated = await row<any>("SELECT id, date, tee_time AS time, max_players AS total_slots, is_active AS active, session_type, tee_start_type, COALESCE(blocked_slots,'[]') AS blocked_slots FROM portal_tee_slots WHERE id = ?", [ttId]);
  res.json({ ...updated, price: 0, price_9: null, promotional_price: null, crossover_enabled: false, active: !!updated!.active, blocked_slots: JSON.parse(updated!.blocked_slots ?? "[]") });
});

router.delete("/portal/tee-times/:id", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const ttId = Number(req.params.id);
  const existing = await row<any>("SELECT id FROM portal_tee_slots WHERE id = ? AND club_id = ?", [ttId, club.id]);
  if (!existing) { res.status(404).json({ message: "Tee time not found" }); return; }
  await exec("DELETE FROM portal_tee_slots WHERE id = ? AND club_id = ?", [ttId, club.id]);
  res.json({ message: "Deleted" });
});

// ─── BOOKINGS ────────────────────────────────────────────────────────────────

router.get("/portal/bookings", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const { status, date, from, to, limit = 50, offset = 0 } = req.query as any;
  let sql = `SELECT b.id, b.portal_slot_id, b.portal_slot_id AS tee_time_id,
                    b.booking_ref, b.players, b.total_amount, b.my_amount, b.club_amount,
                    b.payment_method, b.status, b.split_bill, b.cart_fee, b.platform_fee,
                    b.discount_amount, b.voucher_code, b.created_at,
                    u.name AS guest_name, u.email AS guest_email, u.phone AS guest_phone,
                    COALESCE(
                      (SELECT json_agg(COALESCE(pu.name, bp.guest_name) ORDER BY bp.id)
                         FROM booking_players bp
                         LEFT JOIN users pu ON bp.user_id = pu.id
                        WHERE bp.booking_id = b.id),
                      '[]'::json
                    ) AS player_names,
                    COALESCE(
                      (SELECT json_agg(bp.paid ORDER BY bp.id)
                         FROM booking_players bp
                        WHERE bp.booking_id = b.id),
                      '[]'::json
                    ) AS player_paid,
                    pts.date, pts.tee_time AS time, 0 AS tee_price
             FROM bookings b
             JOIN portal_tee_slots pts ON b.portal_slot_id = pts.id
             JOIN users u ON b.user_id = u.id
             WHERE pts.club_id = ?`;
  const params: any[] = [club.id];
  if (status) { sql += " AND b.status = ?"; params.push(status); }
  if (date) { sql += " AND pts.date = ?"; params.push(date); }
  else if (from && to) { sql += " AND pts.date BETWEEN ? AND ?"; params.push(from, to); }
  sql += ` ORDER BY b.created_at DESC LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;
  const rows = await query<any>(sql, params);
  res.json(rows.map(r => ({ ...r, time: String(r.time).slice(0, 5), total_amount: Number(r.total_amount), tee_price: Number(r.tee_price) })));
});

router.put("/portal/bookings/:id", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const bId = Number(req.params.id);
  const { status } = req.body ?? {};
  if (!["pending","confirmed","cancelled","completed"].includes(status)) { res.status(400).json({ message: "Invalid status" }); return; }
  const existing = await row<any>("SELECT b.id FROM bookings b JOIN portal_tee_slots pts ON b.portal_slot_id = pts.id WHERE b.id = ? AND pts.club_id = ?", [bId, club.id]);
  if (!existing) { res.status(404).json({ message: "Booking not found" }); return; }
  await exec("UPDATE bookings SET status = ? WHERE id = ?", [status, bId]);
  res.json({ message: "Updated", status });
});

// ─── REVIEWS ─────────────────────────────────────────────────────────────────

router.get("/portal/reviews", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const rows = await query<any>(
    `SELECT r.id, r.rating, r.comment, r.created_at, u.name AS guest_name, u.email AS guest_email
     FROM reviews r JOIN users u ON r.user_id = u.id
     WHERE r.club_id = ? ORDER BY r.created_at DESC LIMIT 200`,
    [club.id]
  );
  res.json(rows);
});

// ─── ADS ─────────────────────────────────────────────────────────────────────

router.get("/portal/ads", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  res.json(await query<any>("SELECT id, title, subtitle, image_url, cta_text, link_url, placement, priority, active, created_at FROM ads WHERE club_id = ? ORDER BY created_at DESC", [club.id]));
});

router.post("/portal/ads", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const { title, subtitle, image_url, cta_text, link_url, placement = "home", priority = 0, active = 1 } = req.body ?? {};
  if (!title) { res.status(400).json({ message: "title required" }); return; }
  const result = await exec(
    "INSERT INTO ads (club_id, title, subtitle, image_url, cta_text, link_url, placement, priority, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [club.id, title, subtitle ?? null, image_url ?? null, cta_text ?? null, link_url ?? null, placement, Number(priority), active ? 1 : 0]
  );
  const inserted = await row<any>("SELECT * FROM ads WHERE id = ?", [(result as any).insertId]);
  res.json(inserted);
});

router.put("/portal/ads/:id", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const adId = Number(req.params.id);
  const existing = await row<any>("SELECT id FROM ads WHERE id = ? AND club_id = ?", [adId, club.id]);
  if (!existing) { res.status(404).json({ message: "Ad not found" }); return; }
  const { title, subtitle, image_url, cta_text, link_url, placement, priority, active } = req.body ?? {};
  await exec(
    `UPDATE ads SET title = COALESCE(?, title), subtitle = ?, image_url = ?, cta_text = ?,
      link_url = ?, placement = COALESCE(?, placement), priority = COALESCE(?, priority),
      active = COALESCE(?, active) WHERE id = ? AND club_id = ?`,
    [title ?? null, subtitle ?? null, image_url ?? null, cta_text ?? null, link_url ?? null,
     placement ?? null, priority ?? null, active != null ? (active ? 1 : 0) : null, adId, club.id]
  );
  res.json(await row<any>("SELECT * FROM ads WHERE id = ?", [adId]));
});

router.delete("/portal/ads/:id", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const adId = Number(req.params.id);
  const existing = await row<any>("SELECT id FROM ads WHERE id = ? AND club_id = ?", [adId, club.id]);
  if (!existing) { res.status(404).json({ message: "Ad not found" }); return; }
  await exec("DELETE FROM ads WHERE id = ? AND club_id = ?", [adId, club.id]);
  res.json({ message: "Deleted" });
});

// ─── EVENTS ──────────────────────────────────────────────────────────────────

router.get("/portal/events", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  res.json(await query<any>("SELECT id, name, description, event_date, start_time, end_time, event_type, restriction, entry_fee, max_participants, status, created_at FROM golf_events WHERE club_id = ? ORDER BY event_date DESC LIMIT 200", [club.id]));
});

router.post("/portal/events", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const { name, description, event_date, start_time, end_time, event_type = "other",
          restriction = "open", entry_fee, max_participants, status = "active" } = req.body ?? {};
  if (!name || !event_date) { res.status(400).json({ message: "name and event_date required" }); return; }
  const result = await exec(
    "INSERT INTO golf_events (club_id, name, description, event_date, start_time, end_time, event_type, restriction, entry_fee, max_participants, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [club.id, name, description ?? null, event_date, start_time ?? null, end_time ?? null, event_type, restriction, entry_fee ?? null, max_participants ?? null, status, club.id]
  );
  res.json(await row<any>("SELECT * FROM golf_events WHERE id = ?", [(result as any).insertId]));
});

router.put("/portal/events/:id", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const evId = Number(req.params.id);
  const existing = await row<any>("SELECT id FROM golf_events WHERE id = ? AND club_id = ?", [evId, club.id]);
  if (!existing) { res.status(404).json({ message: "Event not found" }); return; }
  const { name, description, event_date, start_time, end_time, event_type, restriction, entry_fee, max_participants, status } = req.body ?? {};
  await exec(
    `UPDATE golf_events SET name = COALESCE(?, name), description = ?, event_date = COALESCE(?, event_date),
      start_time = ?, end_time = ?, event_type = COALESCE(?, event_type), restriction = COALESCE(?, restriction),
      entry_fee = ?, max_participants = ?, status = COALESCE(?, status) WHERE id = ? AND club_id = ?`,
    [name ?? null, description ?? null, event_date ?? null, start_time ?? null, end_time ?? null,
     event_type ?? null, restriction ?? null, entry_fee ?? null, max_participants ?? null, status ?? null, evId, club.id]
  );
  res.json(await row<any>("SELECT * FROM golf_events WHERE id = ?", [evId]));
});

router.delete("/portal/events/:id", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const evId = Number(req.params.id);
  const existing = await row<any>("SELECT id FROM golf_events WHERE id = ? AND club_id = ?", [evId, club.id]);
  if (!existing) { res.status(404).json({ message: "Event not found" }); return; }
  await exec("DELETE FROM golf_events WHERE id = ? AND club_id = ?", [evId, club.id]);
  res.json({ message: "Deleted" });
});

// ─── MEMBERS ─────────────────────────────────────────────────────────────────

router.get("/portal/members", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const rows = await query<any>(
    `SELECT cm.id, cm.membership_type, cm.status, cm.created_at,
            cm.start_date, cm.renewal_date, cm.benefits,
            cm.prepaid_rounds, cm.prepaid_rounds_used,
            u.id AS user_id, u.name, u.email, u.phone, u.handicap, u.date_of_birth, u.hna_number, u.student_number
     FROM club_members cm JOIN users u ON cm.user_id = u.id
     WHERE cm.club_id = ? ORDER BY cm.created_at DESC`,
    [club.id]
  );
  res.json(rows);
});

router.post("/portal/members", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const { email, membership_type = "standard", start_date, renewal_date, benefits, prepaid_rounds = 0, hna_number, student_number } = req.body ?? {};
  if (!email) { res.status(400).json({ message: "email required" }); return; }
  const hnaClean = hna_number ? String(hna_number).trim().replace(/\D/g, "") : null;
  if (!hnaClean) { res.status(400).json({ message: "hna_number is required for all members" }); return; }
  if (!membership_type) { res.status(400).json({ message: "membership_type is required" }); return; }
  if (!start_date) { res.status(400).json({ message: "start_date is required" }); return; }
  if (!renewal_date) { res.status(400).json({ message: "renewal_date is required" }); return; }
  const emailClean = String(email).trim().toLowerCase();
  const stuClean = student_number ? String(student_number).trim() || null : null;
  const user = await row<any>("SELECT id FROM users WHERE email = ?", [emailClean]);

  // No TapIn account yet → stage the membership; it auto-links when the golfer registers.
  if (!user) {
    await exec(
      `INSERT INTO pending_memberships
         (club_id, email, hna_number, membership_type, status, start_date, renewal_date, benefits, prepaid_rounds, student_number)
       VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)
       ON CONFLICT (club_id, email) DO UPDATE SET
         hna_number      = EXCLUDED.hna_number,
         membership_type = EXCLUDED.membership_type,
         status          = EXCLUDED.status,
         start_date      = EXCLUDED.start_date,
         renewal_date    = EXCLUDED.renewal_date,
         benefits        = EXCLUDED.benefits,
         prepaid_rounds  = EXCLUDED.prepaid_rounds,
         student_number  = EXCLUDED.student_number`,
      [club.id, emailClean, hnaClean, membership_type, start_date ?? null, renewal_date ?? null,
       benefits ?? null, Number(prepaid_rounds) || 0, stuClean]
    );
    res.json({ message: "Member staged — will activate when the golfer signs up", pending: true });
    return;
  }

  // Existing account → upsert the membership (re-adding renews it) and write the HNA
  // authoritatively (the club roster is the source of truth).
  await exec(
    `INSERT INTO club_members (club_id, user_id, membership_type, status, added_by, start_date, renewal_date, benefits, prepaid_rounds)
     VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?)
     ON CONFLICT (club_id, user_id) DO UPDATE SET
       membership_type = EXCLUDED.membership_type,
       status          = 'active',
       start_date      = EXCLUDED.start_date,
       renewal_date    = EXCLUDED.renewal_date,
       benefits        = EXCLUDED.benefits,
       prepaid_rounds  = EXCLUDED.prepaid_rounds`,
    [club.id, user.id, membership_type, club.id, start_date ?? null, renewal_date ?? null, benefits ?? null, Number(prepaid_rounds) || 0]
  );
  await exec(
    `UPDATE users SET
       hna_number            = ?,
       student_number        = COALESCE(?, student_number),
       student_number_locked = CASE WHEN ? IS NOT NULL THEN 1 ELSE student_number_locked END
     WHERE id = ?`,
    [hnaClean, stuClean, stuClean, user.id]
  );
  res.json({ message: "Member added" });
});

router.post("/portal/members/import", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const { rows } = req.body ?? {};
  if (!Array.isArray(rows) || rows.length === 0) { res.status(400).json({ message: "rows array required" }); return; }

  let added = 0;       // new active membership created for an existing account
  let renewed = 0;     // existing membership refreshed/renewed
  let pending = 0;     // staged for a golfer with no account yet
  const errors: string[] = [];

  for (const r of rows) {
    const email = String(r.email ?? "").trim().toLowerCase();
    const membership_type = String(r.membership_type ?? "standard").trim().toLowerCase();
    const start_date = r.start_date ?? null;
    const renewal_date = r.renewal_date ?? null;
    const benefits = r.benefits ? String(r.benefits) : null;
    const prepaid_rounds = Number(r.prepaid_rounds) || 0;
    const hnaClean = r.hna_number ? String(r.hna_number).trim().replace(/\D/g, "") : "";
    const stuClean = r.student_number ? String(r.student_number).trim() || null : null;
    if (!email) continue;
    if (!hnaClean) { errors.push(`${email}: HNA number is required`); continue; }
    if (!membership_type) { errors.push(`${email}: Membership type is required`); continue; }
    if (!start_date) { errors.push(`${email}: Start date is required`); continue; }
    if (!renewal_date) { errors.push(`${email}: Renewal date is required`); continue; }
    try {
      const user = await row<any>("SELECT id FROM users WHERE email = ?", [email]);

      // No account → stage as pending (auto-links on signup)
      if (!user) {
        await exec(
          `INSERT INTO pending_memberships
             (club_id, email, hna_number, membership_type, status, start_date, renewal_date, benefits, prepaid_rounds, student_number)
           VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)
           ON CONFLICT (club_id, email) DO UPDATE SET
             hna_number      = EXCLUDED.hna_number,
             membership_type = EXCLUDED.membership_type,
             status          = EXCLUDED.status,
             start_date      = EXCLUDED.start_date,
             renewal_date    = EXCLUDED.renewal_date,
             benefits        = EXCLUDED.benefits,
             prepaid_rounds  = EXCLUDED.prepaid_rounds,
             student_number  = EXCLUDED.student_number`,
          [club.id, email, hnaClean, membership_type, start_date, renewal_date, benefits, prepaid_rounds, stuClean]
        );
        pending++;
        continue;
      }

      const existing = await row<any>("SELECT id FROM club_members WHERE club_id = ? AND user_id = ?", [club.id, user.id]);
      await exec(
        `INSERT INTO club_members (club_id, user_id, membership_type, status, added_by, start_date, renewal_date, benefits, prepaid_rounds)
         VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?)
         ON CONFLICT (club_id, user_id) DO UPDATE SET
           membership_type = EXCLUDED.membership_type,
           status          = 'active',
           start_date      = EXCLUDED.start_date,
           renewal_date    = EXCLUDED.renewal_date,
           benefits        = EXCLUDED.benefits,
           prepaid_rounds  = EXCLUDED.prepaid_rounds`,
        [club.id, user.id, membership_type, club.id, start_date, renewal_date, benefits, prepaid_rounds]
      );
      // Roster is authoritative for the HNA number
      await exec(
        `UPDATE users SET
           hna_number            = ?,
           student_number        = COALESCE(?, student_number),
           student_number_locked = CASE WHEN ? IS NOT NULL THEN 1 ELSE student_number_locked END
         WHERE id = ?`,
        [hnaClean, stuClean, stuClean, user.id]
      );
      if (existing) renewed++; else added++;
    } catch (err: any) {
      errors.push(`${email}: ${err.message}`);
    }
  }

  res.json({ added, renewed, pending, errors });
});

router.put("/portal/members/:id", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const mId = Number(req.params.id);
  const { membership_type, status, start_date, renewal_date, benefits, prepaid_rounds, hna_number } = req.body ?? {};
  const existing = await row<any>("SELECT id, user_id FROM club_members WHERE id = ? AND club_id = ?", [mId, club.id]);
  if (!existing) { res.status(404).json({ message: "Member not found" }); return; }
  // Validate the HNA edit BEFORE any write so an invalid number can't leave the
  // membership row updated while the user's HNA is rejected (partial write).
  let hnaClean: string | null = null;
  if (hna_number !== undefined && hna_number !== null && String(hna_number).trim() !== "") {
    hnaClean = String(hna_number).trim().replace(/\D/g, "");
    if (hnaClean.length !== 10) { res.status(400).json({ message: "HNA number must be exactly 10 digits" }); return; }
  }
  await exec(
    `UPDATE club_members SET
       membership_type   = COALESCE(?, membership_type),
       status            = COALESCE(?, status),
       start_date        = COALESCE(?, start_date),
       renewal_date      = COALESCE(?, renewal_date),
       benefits          = COALESCE(?, benefits),
       prepaid_rounds    = COALESCE(?, prepaid_rounds)
     WHERE id = ? AND club_id = ?`,
    [membership_type ?? null, status ?? null, start_date ?? null, renewal_date ?? null,
     benefits ?? null, prepaid_rounds != null ? Number(prepaid_rounds) : null, mId, club.id]
  );
  // The club can correct the golfer's HNA number (roster is authoritative)
  if (hnaClean) {
    await exec("UPDATE users SET hna_number = ? WHERE id = ?", [hnaClean, existing.user_id]);
  }
  res.json({ message: "Updated" });
});

// Bulk-renew memberships: push the renewal date forward and reactivate. This is the
// one-click annual renewal that keeps members' HNAs verified for another season.
router.post("/portal/members/bulk-renew", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const { ids, renewal_date } = req.body ?? {};
  if (!Array.isArray(ids) || ids.length === 0) { res.status(400).json({ message: "ids array required" }); return; }
  if (!renewal_date) { res.status(400).json({ message: "renewal_date required" }); return; }
  const memberIds = ids.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n));
  if (memberIds.length === 0) { res.status(400).json({ message: "no valid ids" }); return; }
  const placeholders = memberIds.map(() => "?").join(",");
  await exec(
    `UPDATE club_members SET renewal_date = ?, status = 'active'
     WHERE club_id = ? AND id IN (${placeholders})`,
    [renewal_date, club.id, ...memberIds]
  );
  res.json({ message: "Renewed", renewed: memberIds.length });
});

// Pending members — roster rows for golfers who have not signed up yet.
router.get("/portal/pending-members", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const rows = await query<any>(
    `SELECT id, email, hna_number, membership_type, status, start_date, renewal_date,
            benefits, prepaid_rounds, student_number, created_at
     FROM pending_memberships WHERE club_id = ? ORDER BY created_at DESC`,
    [club.id]
  );
  res.json(rows);
});

router.delete("/portal/pending-members/:id", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const pId = Number(req.params.id);
  const existing = await row<any>("SELECT id FROM pending_memberships WHERE id = ? AND club_id = ?", [pId, club.id]);
  if (!existing) { res.status(404).json({ message: "Pending member not found" }); return; }
  await exec("DELETE FROM pending_memberships WHERE id = ? AND club_id = ?", [pId, club.id]);
  res.json({ message: "Removed" });
});

router.delete("/portal/members/:id", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const mId = Number(req.params.id);
  const existing = await row<any>("SELECT id FROM club_members WHERE id = ? AND club_id = ?", [mId, club.id]);
  if (!existing) { res.status(404).json({ message: "Member not found" }); return; }
  await exec("DELETE FROM club_members WHERE id = ? AND club_id = ?", [mId, club.id]);
  res.json({ message: "Removed" });
});

// ─── VOUCHERS ────────────────────────────────────────────────────────────────

router.get("/portal/vouchers", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  res.json(await query<any>("SELECT id, code, discount_type, discount_value, min_amount, max_uses, uses_count, active, expires_at, created_at FROM vouchers WHERE club_id = ? ORDER BY created_at DESC", [club.id]));
});

router.post("/portal/vouchers", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const { code, discount_type, discount_value, min_amount, max_uses, expires_at } = req.body ?? {};
  if (!code || !discount_type || discount_value == null) { res.status(400).json({ message: "code, discount_type and discount_value required" }); return; }
  const existing = await row<any>("SELECT id FROM vouchers WHERE code = ?", [code]);
  if (existing) { res.status(409).json({ message: "Code already exists" }); return; }
  const result = await exec(
    "INSERT INTO vouchers (code, discount_type, discount_value, club_id, min_amount, max_uses, active, expires_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)",
    [code.toUpperCase(), discount_type, Number(discount_value), club.id, min_amount ?? null, max_uses ?? null, expires_at ?? null]
  );
  res.json(await row<any>("SELECT * FROM vouchers WHERE id = ?", [(result as any).insertId]));
});

router.put("/portal/vouchers/:id", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const vId = Number(req.params.id);
  const existing = await row<any>("SELECT id FROM vouchers WHERE id = ? AND club_id = ?", [vId, club.id]);
  if (!existing) { res.status(404).json({ message: "Voucher not found" }); return; }
  const { discount_value, min_amount, max_uses, active, expires_at } = req.body ?? {};
  await exec(
    "UPDATE vouchers SET discount_value = COALESCE(?, discount_value), min_amount = ?, max_uses = ?, active = COALESCE(?, active), expires_at = ? WHERE id = ? AND club_id = ?",
    [discount_value ?? null, min_amount ?? null, max_uses ?? null, active != null ? (active ? 1 : 0) : null, expires_at ?? null, vId, club.id]
  );
  res.json(await row<any>("SELECT * FROM vouchers WHERE id = ?", [vId]));
});

router.delete("/portal/vouchers/:id", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const vId = Number(req.params.id);
  const existing = await row<any>("SELECT id FROM vouchers WHERE id = ? AND club_id = ?", [vId, club.id]);
  if (!existing) { res.status(404).json({ message: "Voucher not found" }); return; }
  await exec("DELETE FROM vouchers WHERE id = ? AND club_id = ?", [vId, club.id]);
  res.json({ message: "Deleted" });
});

// ─── INBOX (system → club) ────────────────────────────────────────────────────

router.get("/portal/inbox", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  res.json(await query<any>(
    "SELECT id, type, title, body, meta, read_at, created_at FROM club_inbox_notifications WHERE club_id = ? ORDER BY created_at DESC LIMIT 50",
    [club.id]
  ));
});

router.get("/portal/inbox/unread-count", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const r = await row<any>("SELECT COUNT(*) AS cnt FROM club_inbox_notifications WHERE club_id = ? AND read_at IS NULL", [club.id]);
  res.json({ count: Number(r?.cnt ?? 0) });
});

router.put("/portal/inbox/:id/read", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const nid = parseInt(req.params.id, 10);
  await exec("UPDATE club_inbox_notifications SET read_at = NOW() WHERE id = ? AND club_id = ?", [nid, club.id]);
  res.json({ ok: true });
});

router.put("/portal/inbox/read-all", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  await exec("UPDATE club_inbox_notifications SET read_at = NOW() WHERE club_id = ? AND read_at IS NULL", [club.id]);
  res.json({ ok: true });
});

router.put("/portal/inbox/:id/refund-processed", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const nid = parseInt(req.params.id, 10);
  await exec(
    "UPDATE club_inbox_notifications SET refund_processed_at = NOW(), read_at = COALESCE(read_at, NOW()) WHERE id = ? AND club_id = ? AND type = 'cancellation'",
    [nid, club.id]
  );
  res.json({ ok: true });
});

// ─── NOTIFICATIONS (club → golfers) ──────────────────────────────────────────

router.get("/portal/notifications", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  res.json(await query<any>("SELECT id, type, title, body, tee_shift_minutes, affected_date, recipient_count, sent_at FROM club_notifications WHERE club_id = ? ORDER BY sent_at DESC LIMIT 100", [club.id]));
});

router.post("/portal/notifications", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const { type = "general", title, body, tee_shift_minutes, affected_date } = req.body ?? {};
  if (!title || !body) { res.status(400).json({ message: "title and body required" }); return; }
  const [memberCount] = await query<any>("SELECT COUNT(*) AS cnt FROM club_members WHERE club_id = ? AND status = 'active'", [club.id]);
  const recipient_count = Number(memberCount?.cnt ?? 0);
  const result = await exec(
    "INSERT INTO club_notifications (club_id, sent_by, type, title, body, tee_shift_minutes, affected_date, recipient_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [club.id, club.id, type, title, body, tee_shift_minutes ?? null, affected_date ?? null, recipient_count]
  );
  res.json(await row<any>("SELECT * FROM club_notifications WHERE id = ?", [(result as any).insertId]));
});

// ── Club photo gallery ────────────────────────────────────────────────────────

// ─── Logo upload ─────────────────────────────────────────────────────────────
router.post(
  "/portal/logo/upload",
  requireClubAuth,
  upload.single("logo"),
  async (req: Request, res: Response): Promise<void> => {
    const file = req.file;
    if (!file) { res.status(400).json({ message: "No image file provided" }); return; }

    const club = getClub(req);
    const privateDir = process.env["PRIVATE_OBJECT_DIR"] ?? "";
    if (!privateDir) { res.status(500).json({ message: "Object storage not configured" }); return; }

    const fileUuid = randomUUID();
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, "") || "jpg";

    const cleanDir = privateDir.replace(/^\/+/, "").replace(/\/+$/, "");
    const slashIdx = cleanDir.indexOf("/");
    const parsedBucket = slashIdx >= 0 ? cleanDir.slice(0, slashIdx) : cleanDir;
    const basePath = slashIdx >= 0 ? cleanDir.slice(slashIdx + 1) : "";

    const objectKey = basePath
      ? `${basePath}/club-logos/${club.id}/${fileUuid}.${ext}`
      : `club-logos/${club.id}/${fileUuid}.${ext}`;

    const bucket = objectStorageClient.bucket(parsedBucket);
    await bucket.file(objectKey).save(file.buffer, { contentType: file.mimetype });

    const host = req.get("host") ?? "localhost";
    const logoUrl = `https://${host}/api/storage/objects/club-logos/${club.id}/${fileUuid}.${ext}`;

    await bucket.file(objectKey).setMetadata({ cacheControl: "public, max-age=86400" });
    await exec("UPDATE clubs SET logo_url = ? WHERE id = ?", [logoUrl, club.id]);

    res.json({ logo_url: logoUrl });
  }
);

router.post(
  "/portal/images/upload",
  requireClubAuth,
  upload.single("photo"),
  async (req: Request, res: Response): Promise<void> => {
    const file = req.file;
    if (!file) { res.status(400).json({ message: "No image file provided" }); return; }

    const club = getClub(req);
    const privateDir = process.env["PRIVATE_OBJECT_DIR"] ?? "";
    if (!privateDir) { res.status(500).json({ message: "Object storage not configured" }); return; }

    const fileUuid = randomUUID();
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, "") || "jpg";

    // Parse PRIVATE_OBJECT_DIR → bucket + base path (format: "bucket-name/base-path" or "/bucket-name/base-path")
    const cleanDir = privateDir.replace(/^\/+/, "").replace(/\/+$/, "");
    const slashIdx = cleanDir.indexOf("/");
    const parsedBucket = slashIdx >= 0 ? cleanDir.slice(0, slashIdx) : cleanDir;
    const basePath = slashIdx >= 0 ? cleanDir.slice(slashIdx + 1) : "";

    const objectKey = basePath
      ? `${basePath}/club-photos/${club.id}/${fileUuid}.${ext}`
      : `club-photos/${club.id}/${fileUuid}.${ext}`;

    const bucket = objectStorageClient.bucket(parsedBucket);
    await bucket.file(objectKey).save(file.buffer, { contentType: file.mimetype });

    const caption: string | null = typeof req.body?.caption === "string" && req.body.caption.trim() ? req.body.caption.trim() : null;
    const display_order = Number(req.body?.display_order ?? 0);
    const host = req.get("host") ?? "localhost";
    const url = `https://${host}/api/storage/objects/club-photos/${club.id}/${fileUuid}.${ext}`;

    const insertId = await exec(
      "INSERT INTO club_images (club_id, url, caption, display_order) VALUES (?, ?, ?, ?)",
      [club.id, url, caption, display_order]
    );
    const image = await row<any>("SELECT * FROM club_images WHERE id = ?", [insertId]);
    res.status(201).json({ image, url });
  }
);

router.get("/portal/images", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const images = await query<any>(
    "SELECT id, url, caption, display_order, created_at FROM club_images WHERE club_id = ? ORDER BY display_order ASC, id ASC",
    [club.id]
  );
  res.json({ images });
});

router.post("/portal/images", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const { url, caption, display_order = 0 } = req.body ?? {};
  if (!url || typeof url !== "string" || !url.startsWith("http")) {
    res.status(400).json({ message: "A valid image URL is required" });
    return;
  }
  const result = await exec(
    "INSERT INTO club_images (club_id, url, caption, display_order) VALUES (?, ?, ?, ?)",
    [club.id, url.trim(), caption?.trim() ?? null, Number(display_order)]
  );
  const image = await row<any>("SELECT * FROM club_images WHERE id = ?", [(result as any).insertId]);
  res.status(201).json({ image });
});

router.put("/portal/images/:imageId", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const imageId = parseInt(req.params.imageId, 10);
  const { caption, display_order } = req.body ?? {};
  await exec(
    "UPDATE club_images SET caption = ?, display_order = ? WHERE id = ? AND club_id = ?",
    [caption?.trim() ?? null, Number(display_order ?? 0), imageId, club.id]
  );
  const image = await row<any>("SELECT * FROM club_images WHERE id = ? AND club_id = ?", [imageId, club.id]);
  if (!image) { res.status(404).json({ message: "Image not found" }); return; }
  res.json({ image });
});

router.delete("/portal/images/:imageId", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const imageId = parseInt(req.params.imageId, 10);
  await exec("DELETE FROM club_images WHERE id = ? AND club_id = ?", [imageId, club.id]);
  res.json({ message: "Deleted" });
});

// ─── PRICING TIERS ───────────────────────────────────────────────────────────

const PRICING_TIERS = [
  "full_member","six_day_member","week_day_member",
  "pensioner_full","pensioner_six_day","pensioner_week_day",
  "student_member","junior_member","honorary",
  "affiliated_visitor","affiliated_pensioner",
  "non_affiliated_visitor","non_affiliated_pensioner",
  "student_visitor","junior_visitor",
] as const;

// ── Schedule Configs ──────────────────────────────────────────────────────────
router.get("/portal/schedule-configs", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const rows = await query<any>(
    "SELECT id, name, config_type, config_data, created_at, updated_at FROM tee_time_schedule_configs WHERE club_id = ? ORDER BY created_at ASC",
    [club.id]
  );
  res.json(rows.map(r => ({ ...r, config_data: typeof r.config_data === "string" ? JSON.parse(r.config_data) : r.config_data })));
});

router.post("/portal/schedule-configs", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const { name, config_type, config_data } = req.body ?? {};
  if (!name || !config_type || !config_data) { res.status(400).json({ message: "name, config_type and config_data are required" }); return; }
  const id = await exec(
    "INSERT INTO tee_time_schedule_configs (club_id, name, config_type, config_data) VALUES (?, ?, ?, ?)",
    [club.id, String(name).trim(), String(config_type).toUpperCase(), JSON.stringify(config_data)]
  );
  res.status(201).json({ id, name, config_type, config_data });
});

router.put("/portal/schedule-configs/:id", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const cfgId = Number(req.params.id);
  const existing = await row<any>("SELECT id FROM tee_time_schedule_configs WHERE id = ? AND club_id = ?", [cfgId, club.id]);
  if (!existing) { res.status(404).json({ message: "Config not found" }); return; }
  const { name, config_type, config_data } = req.body ?? {};
  await exec(
    `UPDATE tee_time_schedule_configs SET
       name        = COALESCE(?, name),
       config_type = COALESCE(?, config_type),
       config_data = COALESCE(?, config_data)
     WHERE id = ? AND club_id = ?`,
    [name ? String(name).trim() : null, config_type ? String(config_type).toUpperCase() : null,
     config_data ? JSON.stringify(config_data) : null, cfgId, club.id]
  );
  res.json({ message: "Updated" });
});

router.delete("/portal/schedule-configs/:id", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const cfgId = Number(req.params.id);
  await run("DELETE FROM tee_time_schedule_configs WHERE id = ? AND club_id = ?", [cfgId, club.id]);
  res.json({ message: "Deleted" });
});

router.get("/portal/pricing-tiers", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  // Try to include the hidden column; fall back gracefully if migration hasn't run yet
  let rows: any[];
  try {
    rows = await query<any>(
      "SELECT tier_type, price_18h, price_9h, hidden FROM club_pricing_tiers WHERE club_id = ?",
      [club.id]
    );
  } catch {
    rows = await query<any>(
      "SELECT tier_type, price_18h, price_9h FROM club_pricing_tiers WHERE club_id = ?",
      [club.id]
    );
  }
  // Return a full map keyed by tier_type (empty tiers have null prices)
  const map: Record<string, { price_18h: number | null; price_9h: number | null; hidden: boolean }> = {};
  for (const tier of PRICING_TIERS) map[tier] = { price_18h: null, price_9h: null, hidden: false };
  for (const r of rows) map[r.tier_type] = { price_18h: r.price_18h != null ? parseFloat(r.price_18h) : null, price_9h: r.price_9h != null ? parseFloat(r.price_9h) : null, hidden: !!r.hidden };
  res.json(map);
});

router.put("/portal/pricing-tiers", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const { tiers } = req.body ?? {};
  if (!tiers || typeof tiers !== "object") { res.status(400).json({ message: "tiers object required" }); return; }
  for (const [tier_type, prices] of Object.entries(tiers) as [string, any][]) {
    if (!PRICING_TIERS.includes(tier_type as any)) continue;
    const p18     = prices.price_18h != null && prices.price_18h !== "" ? parseFloat(prices.price_18h) : null;
    const p9      = prices.price_9h  != null && prices.price_9h  !== "" ? parseFloat(prices.price_9h)  : null;
    const hidden  = prices.hidden ? 1 : 0;
    await exec(
      `INSERT INTO club_pricing_tiers (club_id, tier_type, price_18h, price_9h, hidden)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (club_id, tier_type) DO UPDATE SET price_18h = EXCLUDED.price_18h, price_9h = EXCLUDED.price_9h, hidden = EXCLUDED.hidden`,
      [club.id, tier_type, p18, p9, hidden]
    );
  }
  res.json({ message: "Pricing tiers saved" });
});

// ─── PAYMENTS ────────────────────────────────────────────────────────────────

router.get("/portal/payments", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const { status, from, to, search, limit = 200, offset = 0 } = req.query as any;

  let sql = `
    SELECT b.id, b.booking_ref, b.players, b.total_amount, b.my_amount, b.club_amount,
           b.payment_method, b.status, b.split_bill, b.cart_fee, b.platform_fee,
           b.discount_amount, b.voucher_code, b.created_at, b.holes,
           u.name AS user_name, u.email AS user_email, u.phone AS user_phone,
           pts.date AS tee_date, pts.tee_time AS tee_time,
           COALESCE(
             (SELECT json_agg(json_build_object(
                'name',  COALESCE(pu.name, bp.guest_name, 'Guest'),
                'email', pu.email,
                'amount', COALESCE(bp.amount, 0),
                'paid', CASE WHEN bp.paid = 1 THEN true ELSE false END
             ) ORDER BY bp.id)
              FROM booking_players bp
              LEFT JOIN users pu ON bp.user_id = pu.id
             WHERE bp.booking_id = b.id),
             '[]'::json
           ) AS players_list
    FROM bookings b
    JOIN portal_tee_slots pts ON b.portal_slot_id = pts.id
    JOIN users u ON b.user_id = u.id
    WHERE pts.club_id = ?`;
  const params: any[] = [club.id];

  if (status && status !== "all") { sql += " AND b.status = ?"; params.push(status); }
  if (from) { sql += " AND pts.date >= ?"; params.push(from); }
  if (to) { sql += " AND pts.date <= ?"; params.push(to); }
  if (search) {
    sql += " AND (u.name ILIKE ? OR u.email ILIKE ? OR b.booking_ref ILIKE ?)";
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  sql += ` ORDER BY b.created_at DESC LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;

  const rows = await query<any>(sql, params);
  res.json(rows.map((r: any) => ({
    ...r,
    tee_date: String(r.tee_date).slice(0, 10),
    tee_time: String(r.tee_time).slice(0, 5),
    total_amount:    Number(r.total_amount ?? 0),
    my_amount:       Number(r.my_amount ?? 0),
    club_amount:     Number(r.club_amount ?? 0),
    cart_fee:        Number(r.cart_fee ?? 0),
    platform_fee:    Number(r.platform_fee ?? 0),
    discount_amount: Number(r.discount_amount ?? 0),
    holes:           r.holes ? Number(r.holes) : 18,
    price_tier:      null,
    split_bill:      !!r.split_bill,
    players_list:    typeof r.players_list === "string" ? JSON.parse(r.players_list) : (r.players_list ?? []),
  })));
});

router.post("/portal/payments/:id/resend-invoice", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const bId = Number(req.params.id);

  const b = await row<any>(`
    SELECT b.id, b.booking_ref, b.players, b.total_amount, b.my_amount, b.club_amount,
           b.payment_method, b.status, b.split_bill, b.cart_fee, b.platform_fee,
           b.discount_amount, b.voucher_code, b.created_at, b.holes,
           u.name AS user_name, u.email AS user_email,
           pts.date AS tee_date, pts.tee_time AS tee_time
    FROM bookings b
    JOIN portal_tee_slots pts ON b.portal_slot_id = pts.id
    JOIN users u ON b.user_id = u.id
    WHERE b.id = ? AND pts.club_id = ?`,
    [bId, club.id]
  );
  if (!b) { res.status(404).json({ message: "Booking not found" }); return; }

  const players = await query<any>(
    `SELECT COALESCE(u.name, bp.guest_name, 'Guest') AS name, u.email, bp.amount, bp.paid
     FROM booking_players bp LEFT JOIN users u ON bp.user_id = u.id WHERE bp.booking_id = ? ORDER BY bp.id`,
    [bId]
  );

  try {
    await sendInvoiceEmail({ ...b, tee_date: String(b.tee_date).slice(0, 10), tee_time: String(b.tee_time).slice(0, 5), players_list: players }, club.name);
    res.json({ message: "Invoice sent to " + b.user_email });
  } catch (err) {
    logger.error({ err }, "Failed to send invoice email");
    res.status(500).json({ message: "Failed to send invoice email" });
  }
});

export default router;
