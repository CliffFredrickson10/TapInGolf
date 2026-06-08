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
import { saveUserNotification } from "../lib/userNotifications";
import { sendPushNotifications } from "../lib/notifications";

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

function generateClubUserToken(clubId: number, userId: number, role: string, permissions: Record<string, string>): string {
  const payload = Buffer.from(
    JSON.stringify({ sub: clubId, uid: userId, role, perms: permissions, type: "club_user", iat: Date.now(), exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

function verifyClubUserToken(token: string): { clubId: number; userId: number; role: string; permissions: Record<string, string> } | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
  if (!crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(sig, "hex"))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (data.type !== "club_user") return null;
    if (data.exp < Date.now()) return null;
    return { clubId: data.sub, userId: data.uid, role: data.role, permissions: data.perms ?? {} };
  } catch {
    return null;
  }
}

async function requireClubAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization ?? "";
  if (!header.startsWith("Bearer ")) { res.status(401).json({ message: "Unauthorized" }); return; }
  const token = header.slice(7);

  // Try direct club login token first
  const clubId = verifyClubToken(token);
  if (clubId) {
    const club = await row<any>("SELECT id, name, location, province, image_url, logo_url, holes, price_from, facilities, website, description, phone, email, address, featured, active, cart_available, cart_compulsory, cart_price, latitude, longitude, geofence_enabled, geofence_radius_m, username FROM clubs WHERE id = ? AND active = 1", [clubId]);
    if (!club) { res.status(401).json({ message: "Club not found" }); return; }
    (req as any).club = club;
    (req as any).clubUser = null; // direct admin login — no portal user record
    next();
    return;
  }

  // Try club portal user token
  const userPayload = verifyClubUserToken(token);
  if (userPayload) {
    const club = await row<any>("SELECT id, name, location, province, image_url, logo_url, holes, price_from, facilities, website, description, phone, email, address, featured, active, cart_available, cart_compulsory, cart_price, latitude, longitude, geofence_enabled, geofence_radius_m, username FROM clubs WHERE id = ? AND active = 1", [userPayload.clubId]);
    if (!club) { res.status(401).json({ message: "Club not found" }); return; }
    const clubUser = await row<any>("SELECT id, name, email, role, permissions, active FROM club_portal_users WHERE id = ? AND club_id = ? AND active = 1", [userPayload.userId, userPayload.clubId]);
    if (!clubUser) { res.status(401).json({ message: "User not found or inactive" }); return; }
    (req as any).club = club;
    (req as any).clubUser = { ...clubUser, permissions: clubUser.permissions ?? {} };
    next();
    return;
  }

  res.status(401).json({ message: "Invalid or expired token" });
}

function getClub(req: Request): any { return (req as any).club; }
function getClubUser(req: Request): any { return (req as any).clubUser ?? null; }
function isPortalAdmin(req: Request): boolean { return getClubUser(req) === null || getClubUser(req)?.role === "admin"; }

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
  const data = await row<any>(
    `SELECT cancel_policy_preset, cancel_full_refund_hours, cancel_has_partial, cancel_partial_pct,
            cancel_partial_hours, cancel_payment_hours, cancel_payment_minutes,
            cancel_weather, cancel_contact_email, cancel_contact_phone, cancel_other_policies,
            cancel_fee_pct
     FROM clubs WHERE id = ?`,
    [club.id]
  );
  const feeSetting = null;
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
    fee_pct:            data?.cancel_fee_pct != null ? Number(data.cancel_fee_pct) : 0,
    min_fee_pct:        0,
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
  const feePct         = Math.min(100, Math.max(0, Math.round(Number(fee_pct) || 0)));
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
  const [teeTimes, bookings, reviews, members, events, revenue] = await Promise.all([
    row<any>("SELECT COUNT(*) AS total, SUM(is_active) AS active_count FROM portal_tee_slots WHERE club_id = ? AND date = ?", [club.id, today]),
    row<any>("SELECT COUNT(*) AS total, SUM(CASE WHEN status='confirmed' THEN 1 ELSE 0 END) AS confirmed, SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending FROM bookings b JOIN portal_tee_slots pts ON b.portal_slot_id = pts.id WHERE pts.club_id = ? AND DATE(b.created_at) = ?", [club.id, today]),
    row<any>("SELECT COUNT(*) AS total, AVG(rating) AS avg_rating FROM reviews WHERE club_id = ? AND hidden = 0", [club.id]),
    row<any>("SELECT COUNT(*) AS total FROM club_members WHERE club_id = ? AND status = 'active'", [club.id]),
    row<any>("SELECT COUNT(*) AS total FROM golf_events WHERE club_id = ? AND status = 'active'", [club.id]),
    row<any>(`SELECT COALESCE(SUM(b.total_amount),0) AS total_revenue,
                     COALESCE(SUM(b.club_amount),0)  AS club_earnings,
                     COALESCE(SUM(b.platform_fee),0) AS platform_fees
              FROM bookings b
              JOIN portal_tee_slots pts ON b.portal_slot_id = pts.id
              WHERE pts.club_id = ? AND b.status IN ('confirmed','completed')
                AND b.payment_method != 'prepaid'`, [club.id]),
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
    total_revenue:   Number(revenue?.total_revenue ?? 0),
    club_earnings:   Number(revenue?.club_earnings  ?? 0),
    platform_fees:   Number(revenue?.platform_fees  ?? 0),
  });
});

// ─── TEE TIMES ───────────────────────────────────────────────────────────────

router.get("/portal/tee-times", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const { date, from, to } = req.query as any;
  let sql = `SELECT pts.id, pts.date, pts.tee_time AS time, pts.max_players AS total_slots,
       pts.is_active AS active, pts.session_type, pts.tee_start_type, pts.notes,
       pts.weekday_rate_code, pts.weekend_rate_code, COALESCE(pts.blocked_slots,'[]') AS blocked_slots,
       pts.event_id,
       ge.name AS event_name
     FROM portal_tee_slots pts
     LEFT JOIN golf_events ge ON ge.id = pts.event_id
     WHERE pts.club_id = ?
       AND (pts.event_id IS NULL OR ge.status != 'cancelled')`;
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
    tee_start_type: ({ "1st Tee": "first_tee", "10th Tee": "tenth_tee", "Two-Tee Start": "two_tee" } as Record<string, string>)[r.tee_start_type] ?? r.tee_start_type ?? "first_tee",
    crossover_enabled: false,
    active: !!r.active,
    blocked_slots: JSON.parse(r.blocked_slots ?? "[]"),
  })));
});

router.post("/portal/tee-times", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const { date, time, total_slots = 4, active = 1, session_type = "AM", tee_start_type, notes, event_id } = req.body ?? {};
  if (!date || !time) { res.status(400).json({ message: "date and time required" }); return; }
  const evId: number | null = event_id ? Number(event_id) : null;

  let insertId: number | undefined;
  if (evId) {
    // Event-exclusive slot — uses the partial unique index on (club_id, date, tee_time, event_id) WHERE event_id IS NOT NULL
    const rows = await query<any>(
      "INSERT INTO portal_tee_slots (club_id, date, tee_time, max_players, is_active, session_type, tee_start_type, notes, event_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (club_id, date, tee_time, event_id) WHERE event_id IS NOT NULL DO NOTHING RETURNING id",
      [club.id, date, time, Number(total_slots), active ? 1 : 0, session_type, normTeeStart(tee_start_type), notes ?? null, evId]
    );
    insertId = rows[0]?.id;
    // Auto-recalculate max_participants on the event
    const cap = await row<any>("SELECT COALESCE(SUM(max_players),0) AS total FROM portal_tee_slots WHERE event_id = ?", [evId]);
    await exec("UPDATE golf_events SET max_participants = ? WHERE id = ?", [Number(cap?.total ?? 0), evId]);
  } else {
    // General slot — uses the partial unique index on (club_id, date, tee_time, tee_start_type) WHERE event_id IS NULL
    const rows = await query<any>(
      "INSERT INTO portal_tee_slots (club_id, date, tee_time, max_players, is_active, session_type, tee_start_type, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (club_id, date, tee_time, tee_start_type) WHERE event_id IS NULL DO NOTHING RETURNING id",
      [club.id, date, time, Number(total_slots), active ? 1 : 0, session_type, normTeeStart(tee_start_type), notes ?? null]
    );
    insertId = rows[0]?.id;
  }

  const inserted = insertId
    ? await row<any>("SELECT id, date, tee_time AS time, max_players AS total_slots, is_active AS active, session_type, tee_start_type FROM portal_tee_slots WHERE id = ?", [insertId])
    : evId
      ? await row<any>("SELECT id, date, tee_time AS time, max_players AS total_slots, is_active AS active, session_type, tee_start_type FROM portal_tee_slots WHERE club_id = ? AND date = ? AND tee_time = ? AND event_id = ?", [club.id, date, time, evId])
      : await row<any>("SELECT id, date, tee_time AS time, max_players AS total_slots, is_active AS active, session_type, tee_start_type FROM portal_tee_slots WHERE club_id = ? AND date = ? AND tee_time = ? AND event_id IS NULL", [club.id, date, time]);
  res.json({ ...inserted, price: 0, price_9: null, promotional_price: null, crossover_enabled: false, active: !!inserted!.active });
});

// DELETE /portal/tee-times/clear — delete tee times for club in a date range.
// When ?event_id= is supplied, clears only that event's exclusive slots.
// Without event_id, clears only general (non-event) slots.
router.delete("/portal/tee-times/clear", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const { from, to, event_id } = req.query as any;
  if (!from || !to) { res.status(400).json({ message: "from and to dates required" }); return; }
  let deleted: number;
  if (event_id) {
    const evId = Number(event_id);
    deleted = await run("DELETE FROM portal_tee_slots WHERE club_id = ? AND date BETWEEN ? AND ? AND event_id = ?", [club.id, from, to, evId]);
    // Recalculate max_participants after clearing
    const cap = await row<any>("SELECT COALESCE(SUM(max_players),0) AS total FROM portal_tee_slots WHERE event_id = ?", [evId]);
    await exec("UPDATE golf_events SET max_participants = ? WHERE id = ?", [Number(cap?.total ?? 0), evId]);
  } else {
    // Only delete general slots (tournament slots are never touched)
    deleted = await run("DELETE FROM portal_tee_slots WHERE club_id = ? AND date BETWEEN ? AND ? AND event_id IS NULL", [club.id, from, to]);
  }
  res.json({ message: "Cleared", deleted });
});

// Return all tournament-exclusive tee slots in a date range (for pre-flight conflict check)
router.get("/portal/tee-times/tournament-conflicts", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const { from, to } = req.query as { from?: string; to?: string };
  if (!from || !to) { res.status(400).json({ message: "from and to are required" }); return; }
  const conflicts = await query<any>(
    `SELECT pts.date, pts.tee_time AS time, ge.name AS event_name
     FROM portal_tee_slots pts
     JOIN golf_events ge ON ge.id = pts.event_id
     WHERE pts.club_id = ? AND pts.date BETWEEN ? AND ? AND pts.event_id IS NOT NULL
       AND ge.status NOT IN ('cancelled')
     ORDER BY pts.date, pts.tee_time`,
    [club.id, from, to]
  );
  res.json(conflicts);
});

router.put("/portal/tee-times/:id", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const ttId = Number(req.params.id);
  const existing = await row<any>("SELECT id, event_id FROM portal_tee_slots WHERE id = ? AND club_id = ?", [ttId, club.id]);
  if (!existing) { res.status(404).json({ message: "Tee time not found" }); return; }
  if (existing.event_id) {
    res.status(409).json({ message: "This slot belongs to a tournament. Manage its tee times from the Events page." });
    return;
  }
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
  const existing = await row<any>("SELECT id, event_id FROM portal_tee_slots WHERE id = ? AND club_id = ?", [ttId, club.id]);
  if (!existing) { res.status(404).json({ message: "Tee time not found" }); return; }
  const evId: number | null = existing.event_id ?? null;
  if (evId) {
    res.status(409).json({ message: "This slot belongs to a tournament. Cancel the tournament first or manage its tee times from the Events page." });
    return;
  }
  await exec("DELETE FROM portal_tee_slots WHERE id = ? AND club_id = ?", [ttId, club.id]);
  res.json({ message: "Deleted" });
});

// PUT /portal/events/:eventId/tee-times/:id — edit an event-exclusive tee slot
router.put("/portal/events/:eventId/tee-times/:id", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const eventId = Number(req.params.eventId);
  const ttId    = Number(req.params.id);
  const ev = await row<any>("SELECT id FROM golf_events WHERE id = ? AND club_id = ?", [eventId, club.id]);
  if (!ev) { res.status(404).json({ message: "Event not found" }); return; }
  const existing = await row<any>("SELECT id FROM portal_tee_slots WHERE id = ? AND club_id = ? AND event_id = ?", [ttId, club.id, eventId]);
  if (!existing) { res.status(404).json({ message: "Slot not found in this event" }); return; }
  const { time, total_slots, active, tee_start_type } = req.body ?? {};
  const normStart = tee_start_type != null ? normTeeStart(tee_start_type) : null;
  await exec(
    `UPDATE portal_tee_slots SET
      tee_time    = COALESCE(?, tee_time),
      max_players = COALESCE(?, max_players),
      is_active   = COALESCE(?, is_active),
      tee_start_type = COALESCE(?, tee_start_type)
     WHERE id = ? AND club_id = ?`,
    [time ?? null, total_slots ?? null,
     active != null ? (active ? 1 : 0) : null, normStart,
     ttId, club.id]
  );
  const cap = await row<any>("SELECT COALESCE(SUM(max_players),0) AS total FROM portal_tee_slots WHERE event_id = ?", [eventId]);
  await exec("UPDATE golf_events SET max_participants = ? WHERE id = ?", [Number(cap?.total ?? 0), eventId]);
  const updated = await row<any>("SELECT id, date, tee_time AS time, max_players AS total_slots, is_active AS active, tee_start_type FROM portal_tee_slots WHERE id = ?", [ttId]);
  res.json({ ...updated, active: !!updated!.active });
});

// DELETE /portal/events/:eventId/tee-times/:id — delete an event-exclusive tee slot
router.delete("/portal/events/:eventId/tee-times/:id", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const eventId = Number(req.params.eventId);
  const ttId    = Number(req.params.id);
  const ev = await row<any>("SELECT id FROM golf_events WHERE id = ? AND club_id = ?", [eventId, club.id]);
  if (!ev) { res.status(404).json({ message: "Event not found" }); return; }
  const existing = await row<any>("SELECT id FROM portal_tee_slots WHERE id = ? AND club_id = ? AND event_id = ?", [ttId, club.id, eventId]);
  if (!existing) { res.status(404).json({ message: "Slot not found in this event" }); return; }
  await exec("DELETE FROM portal_tee_slots WHERE id = ? AND club_id = ?", [ttId, club.id]);
  const cap = await row<any>("SELECT COALESCE(SUM(max_players),0) AS total FROM portal_tee_slots WHERE event_id = ?", [eventId]);
  await exec("UPDATE golf_events SET max_participants = ? WHERE id = ?", [Number(cap?.total ?? 0), eventId]);
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
                    pts.date, pts.tee_time AS time, 0 AS tee_price,
                    b.refund_processed_at
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

// Mark a cancelled booking's refund as processed.
router.put("/portal/bookings/:id/refund-processed", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const bId = Number(req.params.id);
  const existing = await row<any>(
    "SELECT b.id FROM bookings b JOIN portal_tee_slots pts ON b.portal_slot_id = pts.id WHERE b.id = ? AND pts.club_id = ? AND b.status = 'cancelled'",
    [bId, club.id]
  );
  if (!existing) { res.status(404).json({ message: "Booking not found or not cancelled" }); return; }
  await exec("UPDATE bookings SET refund_processed_at = NOW() WHERE id = ?", [bId]);
  res.json({ ok: true });
});

// ─── REVIEWS ─────────────────────────────────────────────────────────────────

router.get("/portal/reviews", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const rows = await query<any>(
    `SELECT r.id, r.rating, r.comment, r.created_at, r.response, r.responded_at, r.hidden,
            u.name AS guest_name, u.email AS guest_email,
            rep.status AS report_status
     FROM reviews r
     JOIN users u ON r.user_id = u.id
     LEFT JOIN LATERAL (
       SELECT status FROM review_reports rr
       WHERE rr.review_id = r.id
       ORDER BY rr.created_at DESC LIMIT 1
     ) rep ON true
     WHERE r.club_id = ? ORDER BY r.created_at DESC LIMIT 200`,
    [club.id]
  );
  res.json(rows);
});

// Club publicly responds to a golfer review (shown in the mobile app).
// Passing an empty/blank response clears it.
router.post("/portal/reviews/:id/respond", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const id = parseInt(String(req.params["id"]), 10);
  const review = await row<any>("SELECT id, club_id FROM reviews WHERE id = ?", [id]);
  if (!review || review.club_id !== club.id) {
    res.status(404).json({ message: "Review not found" });
    return;
  }
  const raw = req.body?.response;
  const text = raw == null ? "" : String(raw).trim().slice(0, 2000);
  if (text) {
    await run("UPDATE reviews SET response = ?, responded_at = NOW() WHERE id = ?", [text, id]);
  } else {
    await run("UPDATE reviews SET response = NULL, responded_at = NULL WHERE id = ?", [id]);
  }
  res.json({ success: true, response: text || null });
});

// Allowed reasons a club can cite when reporting an abusive review.
const REVIEW_REPORT_REASONS = ["spam", "harassment", "hate_speech", "inappropriate", "false_info", "other"];

// Club flags a review as abusive → a TapIn super-admin reviews & decides.
router.post("/portal/reviews/:id/report", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const id = parseInt(String(req.params["id"]), 10);
  const review = await row<any>("SELECT id, club_id, rating, comment FROM reviews WHERE id = ?", [id]);
  if (!review || review.club_id !== club.id) {
    res.status(404).json({ message: "Review not found" });
    return;
  }

  const reason = String(req.body?.reason ?? "");
  if (!REVIEW_REPORT_REASONS.includes(reason)) {
    res.status(400).json({ message: `reason must be one of: ${REVIEW_REPORT_REASONS.join(", ")}` });
    return;
  }
  const note = req.body?.note ? String(req.body.note).trim().slice(0, 1000) : null;

  // Collapse duplicate open reports against the same review.
  const dup = await row<any>(
    "SELECT id FROM review_reports WHERE review_id = ? AND status = 'pending'",
    [id]
  );
  if (dup) {
    res.status(200).json({ success: true, id: dup.id, duplicate: true });
    return;
  }

  const excerpt = review.comment ? String(review.comment).slice(0, 500) : null;
  const reportId = await exec(
    `INSERT INTO review_reports (review_id, club_id, reported_excerpt, rating, reason, note)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, club.id, excerpt, review.rating, reason, note]
  );
  res.status(201).json({ success: true, id: reportId, status: "pending" });
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

// Portal proxies to admin/events routes — all event management uses the same
// underlying events.ts handlers (requireClubAuth verifies ownership here).

router.get("/portal/events", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club     = getClub(req);
  const upcoming = req.query.upcoming;
  const today    = new Date().toISOString().split("T")[0];
  // upcoming=all → no date filter (client handles splitting); otherwise legacy behaviour
  const filter   = upcoming === "all"   ? "" :
                   upcoming === "false" ? `AND e.event_date < '${today}'` :
                                          `AND e.event_date >= '${today}'`;
  const events   = await query<any>(
    `SELECT e.*,
            (SELECT COUNT(*) FROM event_registrations er WHERE er.event_id = e.id) as total_registrations,
            (SELECT COUNT(*) FROM event_registrations er WHERE er.event_id = e.id AND er.status = 'approved') as approved_count,
            (SELECT COUNT(*) FROM event_registrations er WHERE er.event_id = e.id AND er.status = 'pending') as pending_count
     FROM golf_events e WHERE e.club_id = ? ${filter}
     ORDER BY e.event_date ASC, e.start_time ASC`,
    [club.id]
  );
  res.json(events.map((e: any) => ({
    ...e,
    entry_fee:           e.entry_fee != null ? parseFloat(e.entry_fee) : null,
    total_registrations: parseInt(e.total_registrations ?? "0"),
    approved_count:      parseInt(e.approved_count ?? "0"),
    pending_count:       parseInt(e.pending_count ?? "0"),
  })));
});

router.post("/portal/events", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const {
    name, description, event_date, end_date, start_time, end_time,
    event_type = "competition", format = "gross_stroke_play", restriction = "open",
    entry_fee, max_participants, divisions, entries_open, entries_close,
    ballot, scoring_enabled, payment_required, entries_required,
    use_tiered_pricing, allow_wallet, allow_prepaid, allow_voucher,
    rounds = 1,
  } = req.body ?? {};
  const status = "pending_publish";
  if (!name || !event_date) { res.status(400).json({ message: "name and event_date required" }); return; }
  const DEFAULT_DIVISIONS = [
    { label: "A Division", key: "A", min_hcp: 0,  max_hcp: 9.9,  format: "stroke_play", tees: "championship" },
    { label: "B Division", key: "B", min_hcp: 10, max_hcp: 17.9, format: "stroke_play", tees: "club" },
    { label: "C Division", key: "C", min_hcp: 18, max_hcp: 36,   format: "stableford",  tees: "club" },
  ];
  const eventId = await exec(
    `INSERT INTO golf_events (club_id, name, description, event_date, end_date, start_time, end_time,
       event_type, format, format_custom, format2, format2_custom, restriction, entry_fee, max_participants, divisions, entries_open, entries_close,
       ballot, scoring_enabled, payment_required, entries_required, use_tiered_pricing, allow_wallet, allow_prepaid, allow_voucher,
       rounds, image_url, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [club.id, name, description ?? null, event_date, end_date ?? null, start_time ?? null, end_time ?? null,
     event_type, format, (req.body?.format_custom) ?? null,
     (req.body?.format2) || null, (req.body?.format2_custom) || null,
     restriction,
     entry_fee != null ? parseFloat(entry_fee) : null,
     max_participants != null ? parseInt(max_participants) : null,
     divisions ? JSON.stringify(divisions) : JSON.stringify(DEFAULT_DIVISIONS),
     entries_open ?? null, entries_close ?? null,
     ballot ? 1 : 0, scoring_enabled ? 1 : 0, payment_required ? 1 : 0,
     entries_required === false || entries_required === 0 ? 0 : 1,
     use_tiered_pricing ? 1 : 0, allow_wallet ? 1 : 0, allow_prepaid ? 1 : 0, allow_voucher ? 1 : 0,
     Number(rounds), (req.body?.image_url) || null, status, club.id]
  );

  // No notification at creation — members are notified when the event is published.
  res.json(await row<any>("SELECT * FROM golf_events WHERE id = ?", [eventId]));
});

router.put("/portal/events/:id", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const evId = Number(req.params.id);
  const existing = await row<any>("SELECT id, status FROM golf_events WHERE id = ? AND club_id = ?", [evId, club.id]);
  if (!existing) { res.status(404).json({ message: "Event not found" }); return; }
  const {
    name, description, event_date, end_date, start_time, end_time, event_type, format, format_custom, format2, format2_custom,
    restriction, entry_fee, max_participants, status, divisions, entries_open, entries_close,
    ballot, scoring_enabled, payment_required, entries_required,
    use_tiered_pricing, allow_wallet, allow_prepaid, allow_voucher, rounds, holes, image_url,
  } = req.body ?? {};
  const updates: string[] = []; const vals: any[] = [];
  if (name !== undefined)                { updates.push("name = ?");              vals.push(name); }
  if (description !== undefined)         { updates.push("description = ?");       vals.push(description ?? null); }
  if (event_date !== undefined)          { updates.push("event_date = ?");        vals.push(event_date); }
  if (end_date !== undefined)            { updates.push("end_date = ?");          vals.push(end_date ?? null); }
  if (start_time !== undefined)          { updates.push("start_time = ?");        vals.push(start_time ?? null); }
  if (end_time !== undefined)            { updates.push("end_time = ?");          vals.push(end_time ?? null); }
  if (event_type !== undefined)          { updates.push("event_type = ?");        vals.push(event_type); }
  if (format !== undefined)              { updates.push("format = ?");            vals.push(format); }
  if (format_custom !== undefined)       { updates.push("format_custom = ?");     vals.push(format_custom ?? null); }
  if (format2 !== undefined)             { updates.push("format2 = ?");           vals.push(format2 || null); }
  if (format2_custom !== undefined)      { updates.push("format2_custom = ?");    vals.push(format2_custom || null); }
  if (image_url !== undefined)           { updates.push("image_url = ?");         vals.push(image_url || null); }
  if (restriction !== undefined)         { updates.push("restriction = ?");       vals.push(restriction); }
  if (entry_fee !== undefined)           { updates.push("entry_fee = ?");         vals.push(entry_fee != null ? parseFloat(entry_fee) : null); }
  if (max_participants !== undefined)    { updates.push("max_participants = ?");  vals.push(max_participants != null ? parseInt(max_participants) : null); }
  if (divisions !== undefined)           { updates.push("divisions = ?");         vals.push(JSON.stringify(divisions)); }
  if (entries_open !== undefined)        { updates.push("entries_open = ?");      vals.push(entries_open ?? null); }
  if (entries_close !== undefined)       { updates.push("entries_close = ?");     vals.push(entries_close ?? null); }
  if (ballot !== undefined)              { updates.push("ballot = ?");            vals.push(ballot ? 1 : 0); }
  if (scoring_enabled !== undefined)     { updates.push("scoring_enabled = ?");   vals.push(scoring_enabled ? 1 : 0); }
  if (payment_required !== undefined)    { updates.push("payment_required = ?");  vals.push(payment_required ? 1 : 0); }
  if (entries_required !== undefined)    { updates.push("entries_required = ?");  vals.push(entries_required === false || entries_required === 0 ? 0 : 1); }
  if (use_tiered_pricing !== undefined)  { updates.push("use_tiered_pricing = ?"); vals.push(use_tiered_pricing ? 1 : 0); }
  if (allow_wallet !== undefined)        { updates.push("allow_wallet = ?");       vals.push(allow_wallet ? 1 : 0); }
  if (allow_prepaid !== undefined)       { updates.push("allow_prepaid = ?");      vals.push(allow_prepaid ? 1 : 0); }
  if (allow_voucher !== undefined)       { updates.push("allow_voucher = ?");      vals.push(allow_voucher ? 1 : 0); }
  if (rounds !== undefined)              { updates.push("rounds = ?");            vals.push(Number(rounds)); }
  if (holes !== undefined)               { updates.push("holes = ?");             vals.push(Number(holes)); }
  // Editing a published tournament requires republishing — reset to pending_publish
  // so the portal shows "Publish Changes" and notifications go out on republish.
  if (existing.status === "active") {
    updates.push("status = ?");
    vals.push("pending_publish");
  }
  if (!updates.length) { res.json({ message: "No changes" }); return; }
  vals.push(evId, club.id);
  await exec(`UPDATE golf_events SET ${updates.join(", ")} WHERE id = ? AND club_id = ?`, vals);
  res.json(await row<any>("SELECT * FROM golf_events WHERE id = ?", [evId]));
});

router.delete("/portal/events/:id", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const evId = Number(req.params.id);
  const ev = await row<any>("SELECT id, name, event_date, end_date FROM golf_events WHERE id = ? AND club_id = ?", [evId, club.id]);
  if (!ev) { res.status(404).json({ message: "Event not found" }); return; }
  // "delete" removes all tee slots for the date range; "open" (default) converts
  // event-exclusive slots to general public slots instead of deleting them.
  const slotsMode: "delete" | "open" = req.query["slots"] === "delete" ? "delete" : "open";

  // Build notification audience BEFORE cancelling:
  // Union of all registrants (any status) + all active club members so nobody who
  // was notified of the event creation/publish is left in the dark.
  const audience = await query<any>(
    `SELECT DISTINCT u.id, u.push_token
     FROM users u
     WHERE u.id IN (
       SELECT er.user_id FROM event_registrations er WHERE er.event_id = ?
       UNION
       SELECT cm.user_id FROM club_members cm WHERE cm.club_id = ? AND cm.status = 'active'
     )`,
    [evId, club.id]
  );

  const dateFrom = String(ev.event_date).slice(0, 10);
  const dateTo   = ev.end_date ? String(ev.end_date).slice(0, 10) : dateFrom;
  await exec("UPDATE golf_events SET status = 'cancelled' WHERE id = ? AND club_id = ?", [evId, club.id]);
  await exec("DELETE FROM event_draws WHERE event_id = ?", [evId]);

  if (slotsMode === "open") {
    // Convert event-exclusive slots back to general open public slots.
    // If a general slot already exists at that date/time, delete the event slot instead
    // (to avoid creating a duplicate alongside the existing general slot).
    await run(
      `DELETE FROM portal_tee_slots
       WHERE event_id = ?
         AND EXISTS (
           SELECT 1 FROM portal_tee_slots g
           WHERE g.club_id = portal_tee_slots.club_id
             AND g.date     = portal_tee_slots.date
             AND g.tee_time = portal_tee_slots.tee_time
             AND g.event_id IS NULL
         )`,
      [evId]
    );
    await run("UPDATE portal_tee_slots SET event_id = NULL WHERE event_id = ?", [evId]);
  } else {
    // Delete mode: remove event-exclusive slots AND any general slots on those dates
    // (handles the case where slots were generated on the Schedule page for the same dates
    //  and were never linked to the tournament directly).
    await run("DELETE FROM portal_tee_slots WHERE event_id = ?", [evId]);
    await run(
      "DELETE FROM portal_tee_slots WHERE club_id = ? AND date BETWEEN ? AND ? AND event_id IS NULL",
      [club.id, dateFrom, dateTo]
    );
  }

  // Notify audience
  const title = `❌ Tournament Cancelled — ${club.name}`;
  const body  = `${String(ev.name)} has been cancelled. We're sorry for the inconvenience.`;
  const data  = { type: "event_cancelled", event_id: evId, club_id: club.id };

  const pushAudience = audience.filter((u: any) => u.push_token);
  if (pushAudience.length > 0) {
    sendPushNotifications(pushAudience.map((u: any) => ({
      to: u.push_token, sound: "default", title, body, data,
    })));
  }
  for (const u of audience) {
    saveUserNotification(u.id, "event_cancelled", title, body, data);
  }

  res.json({ message: "Cancelled" });
});

// POST /portal/events/:id/publish  →  move to active, notify audience
router.post("/portal/events/:id/publish", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const evId = Number(req.params.id);
  const ev = await row<any>("SELECT id, name, event_date, restriction FROM golf_events WHERE id = ? AND club_id = ?", [evId, club.id]);
  if (!ev) { res.status(404).json({ message: "Event not found" }); return; }

  // Check if this is a republish (event already had registrations) or a first publish
  const regRow = await row<any>("SELECT COUNT(*) AS cnt FROM event_registrations WHERE event_id = ?", [evId]);
  const isRepublish = parseInt(regRow?.cnt ?? "0") > 0;

  await exec("UPDATE golf_events SET status = 'active' WHERE id = ? AND club_id = ?", [evId, club.id]);

  const fmtDateStr = (d: any) => {
    try {
      const iso = d instanceof Date ? d.toISOString() : String(d);
      return new Date(iso.slice(0, 10) + "T12:00:00").toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
    } catch { return String(d); }
  };

  if (isRepublish) {
    // Republish: notify all registrants (any status) that details have changed
    const audience = await query<any>(
      `SELECT DISTINCT u.id, u.push_token
       FROM users u
       JOIN event_registrations er ON er.user_id = u.id AND er.event_id = ?
       LIMIT 500`,
      [evId]
    );
    if (audience.length > 0) {
      const title = `📢 Tournament Updated — ${club.name}`;
      const body  = `${String(ev.name)} · ${fmtDateStr(ev.event_date)} has been updated. Check the latest details.`;
      const pushAudience = audience.filter((u: any) => u.push_token);
      if (pushAudience.length > 0) {
        sendPushNotifications(pushAudience.map((u: any) => ({
          to: u.push_token, sound: "default", title, body,
          data: { type: "event_updated", event_id: evId, club_id: club.id },
        })));
      }
      for (const u of audience) {
        saveUserNotification(u.id, "event_updated", title, body, { event_id: evId, club_id: club.id });
      }
    }
  } else {
    // First publish: notify the full discovery audience
    // - invitation_only  → notify only invited users
    // - everything else  → notify ALL active club members
    const isInviteOnly = ev.restriction === "invitation_only";
    const audience = await query<any>(
      isInviteOnly
        ? `SELECT DISTINCT u.id, u.push_token
           FROM users u
           JOIN event_invites ei ON ei.user_id = u.id AND ei.event_id = ?
           LIMIT 500`
        : `SELECT DISTINCT u.id, u.push_token
           FROM users u
           JOIN club_members cm ON cm.user_id = u.id AND cm.club_id = ? AND cm.status = 'active'
           LIMIT 500`,
      isInviteOnly ? [evId] : [club.id]
    );
    if (audience.length > 0) {
      const title = isInviteOnly
        ? `📩 You've been invited — ${club.name}`
        : `⛳ Tournament Now Open — ${club.name}`;
      const body = isInviteOnly
        ? `${String(ev.name)} · ${fmtDateStr(ev.event_date)}. You have been invited — tap to register.`
        : `${String(ev.name)} · ${fmtDateStr(ev.event_date)}. Tap to view & enter.`;
      const pushAudience = audience.filter((u: any) => u.push_token);
      if (pushAudience.length > 0) {
        sendPushNotifications(pushAudience.map((u: any) => ({
          to: u.push_token, sound: "default", title, body,
          data: { type: "event_published", event_id: evId, club_id: club.id },
        })));
      }
      for (const u of audience) {
        saveUserNotification(u.id, "event_published", title, body, { event_id: evId, club_id: club.id });
      }
    }
  }
  res.json(await row<any>("SELECT * FROM golf_events WHERE id = ?", [evId]));
});

// ── Conflict detection ────────────────────────────────────────────────────────

// GET /portal/events/:id/conflicts
// Returns regular-booking conflicts and overlapping-event conflicts for the
// event's date range so the portal can ask the admin to resolve them before publishing.
router.get("/portal/events/:id/conflicts", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club  = getClub(req);
  const evId  = Number(req.params.id);
  const ev    = await row<any>("SELECT id, event_date, end_date FROM golf_events WHERE id = ? AND club_id = ?", [evId, club.id]);
  if (!ev) { res.status(404).json({ message: "Event not found" }); return; }

  const dateFrom = String(ev.event_date).slice(0, 10);
  const dateTo   = ev.end_date ? String(ev.end_date).slice(0, 10) : dateFrom;

  // Active bookings on regular (non-event) tee slots that fall within the event's dates
  const conflicting_bookings = await query<any>(
    `SELECT b.id, b.booking_ref, u.name AS user_name, u.id AS user_id,
            pts.date AS tee_date, pts.tee_time, b.status, b.players
     FROM bookings b
     JOIN portal_tee_slots pts ON pts.id = b.portal_slot_id
     JOIN users u ON u.id = b.user_id
     WHERE pts.club_id = ?
       AND pts.event_id IS NULL
       AND pts.date BETWEEN ? AND ?
       AND b.status NOT IN ('cancelled', 'refunded')
     ORDER BY pts.date, pts.tee_time`,
    [club.id, dateFrom, dateTo]
  );

  // Other non-cancelled events at this club whose date range overlaps the new event's dates
  const conflicting_events = await query<any>(
    `SELECT ge.id, ge.name, ge.event_date, ge.end_date, ge.status,
            (SELECT COUNT(*) FROM portal_tee_slots pts WHERE pts.event_id = ge.id) AS slot_count,
            (SELECT COUNT(*) FROM event_registrations er WHERE er.event_id = ge.id) AS registrant_count
     FROM golf_events ge
     WHERE ge.club_id = ?
       AND ge.id != ?
       AND ge.status NOT IN ('cancelled')
       AND ge.event_date <= ?
       AND COALESCE(ge.end_date, ge.event_date) >= ?
     ORDER BY ge.event_date ASC`,
    [club.id, evId, dateTo, dateFrom]
  );

  res.json({ conflicting_bookings, conflicting_events });
});

// POST /portal/events/:id/resolve-and-publish
// Accepts { cancel_booking_ids, cancel_event_ids }, resolves each conflict,
// then publishes the event (same notification logic as /publish).
router.post("/portal/events/:id/resolve-and-publish", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club  = getClub(req);
  const evId  = Number(req.params.id);
  const ev    = await row<any>("SELECT id, name, event_date, end_date, restriction FROM golf_events WHERE id = ? AND club_id = ?", [evId, club.id]);
  if (!ev) { res.status(404).json({ message: "Event not found" }); return; }

  const cancel_booking_ids: number[] = (req.body?.cancel_booking_ids ?? []).map(Number).filter(Boolean);
  const cancel_event_ids:   number[] = (req.body?.cancel_event_ids   ?? []).map(Number).filter(Boolean);

  // ── 1. Cancel conflicting regular bookings and notify the affected players ──
  if (cancel_booking_ids.length > 0) {
    const ph = cancel_booking_ids.map(() => "?").join(",");
    const affected = await query<any>(
      `SELECT b.id, u.id AS user_id, u.push_token
       FROM bookings b JOIN users u ON u.id = b.user_id
       WHERE b.id IN (${ph})`,
      cancel_booking_ids
    );
    await exec(
      `UPDATE bookings SET status = 'cancelled' WHERE id IN (${ph}) AND status NOT IN ('cancelled','refunded')`,
      cancel_booking_ids
    );
    const bTitle = `Booking Cancelled — ${club.name}`;
    const bBody  = `Your tee time booking has been cancelled to accommodate a tournament. We apologise for the inconvenience.`;
    const bData  = { type: "booking_cancelled_tournament", club_id: club.id, event_id: evId };
    const bPush  = affected.filter((u: any) => u.push_token);
    if (bPush.length > 0) {
      sendPushNotifications(bPush.map((u: any) => ({ to: u.push_token, sound: "default", title: bTitle, body: bBody, data: bData })));
    }
    for (const u of affected) {
      saveUserNotification(u.user_id, "booking_cancelled", bTitle, bBody, bData);
    }
  }

  // ── 2. Cancel each conflicting event: tee slots, draws, and notify audience ─
  for (const conflictEvId of cancel_event_ids) {
    const conflictEv = await row<any>("SELECT id, name FROM golf_events WHERE id = ? AND club_id = ?", [conflictEvId, club.id]);
    if (!conflictEv) continue;

    const cAudience = await query<any>(
      `SELECT DISTINCT u.id, u.push_token
       FROM users u
       WHERE u.id IN (
         SELECT er.user_id FROM event_registrations er WHERE er.event_id = ?
         UNION
         SELECT cm.user_id FROM club_members cm WHERE cm.club_id = ? AND cm.status = 'active'
       )`,
      [conflictEvId, club.id]
    );

    await exec("UPDATE golf_events SET status = 'cancelled' WHERE id = ?", [conflictEvId]);
    await exec("DELETE FROM event_draws WHERE event_id = ?", [conflictEvId]);
    await run("DELETE FROM portal_tee_slots WHERE event_id = ?", [conflictEvId]);

    const cTitle = `❌ Tournament Cancelled — ${club.name}`;
    const cBody  = `${String(conflictEv.name)} has been cancelled. We're sorry for the inconvenience.`;
    const cData  = { type: "event_cancelled", event_id: conflictEvId, club_id: club.id };
    const cPush  = cAudience.filter((u: any) => u.push_token);
    if (cPush.length > 0) {
      sendPushNotifications(cPush.map((u: any) => ({ to: u.push_token, sound: "default", title: cTitle, body: cBody, data: cData })));
    }
    for (const u of cAudience) {
      saveUserNotification(u.id, "event_cancelled", cTitle, cBody, cData);
    }
  }

  // ── 3. Publish the new event (mirrors /publish logic exactly) ────────────────
  await exec("UPDATE golf_events SET status = 'active' WHERE id = ? AND club_id = ?", [evId, club.id]);

  const fmtDate = (d: any) => {
    try {
      const iso = d instanceof Date ? d.toISOString() : String(d);
      return new Date(iso.slice(0, 10) + "T12:00:00").toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
    } catch { return String(d); }
  };
  const isInviteOnly = ev.restriction === "invitation_only";
  const audience = await query<any>(
    isInviteOnly
      ? `SELECT DISTINCT u.id, u.push_token FROM users u JOIN event_invites ei ON ei.user_id = u.id AND ei.event_id = ? LIMIT 500`
      : `SELECT DISTINCT u.id, u.push_token FROM users u JOIN club_members cm ON cm.user_id = u.id AND cm.club_id = ? AND cm.status = 'active' LIMIT 500`,
    isInviteOnly ? [evId] : [club.id]
  );
  if (audience.length > 0) {
    const pTitle = isInviteOnly ? `📩 You've been invited — ${club.name}` : `⛳ Tournament Now Open — ${club.name}`;
    const pBody  = isInviteOnly
      ? `${String(ev.name)} · ${fmtDate(ev.event_date)}. You have been invited — tap to register.`
      : `${String(ev.name)} · ${fmtDate(ev.event_date)}. Tap to view & enter.`;
    const pPush = audience.filter((u: any) => u.push_token);
    if (pPush.length > 0) {
      sendPushNotifications(pPush.map((u: any) => ({
        to: u.push_token, sound: "default", title: pTitle, body: pBody,
        data: { type: "event_published", event_id: evId, club_id: club.id },
      })));
    }
    for (const u of audience) {
      saveUserNotification(u.id, "event_published", pTitle, pBody, { event_id: evId, club_id: club.id });
    }
  }

  res.json(await row<any>("SELECT * FROM golf_events WHERE id = ?", [evId]));
});

// ── Invite list management (invitation_only events) ──────────────────────────

// GET /portal/events/:id/invites
router.get("/portal/events/:id/invites", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const evId = Number(req.params.id);
  const ev = await row<any>("SELECT id FROM golf_events WHERE id = ? AND club_id = ?", [evId, club.id]);
  if (!ev) { res.status(404).json({ message: "Event not found" }); return; }
  const invites = await query<any>(
    `SELECT ei.id, ei.user_id, u.name, u.email, u.handicap_index, ei.invited_at
     FROM event_invites ei
     JOIN users u ON u.id = ei.user_id
     WHERE ei.event_id = ?
     ORDER BY u.name ASC`,
    [evId]
  );
  res.json({ invites });
});

// POST /portal/events/:id/invites  — add a user to the invite list
router.post("/portal/events/:id/invites", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const evId = Number(req.params.id);
  const ev = await row<any>("SELECT id FROM golf_events WHERE id = ? AND club_id = ?", [evId, club.id]);
  if (!ev) { res.status(404).json({ message: "Event not found" }); return; }
  const { user_id } = req.body ?? {};
  if (!user_id) { res.status(400).json({ message: "user_id required" }); return; }
  const userRow = await row<any>("SELECT id FROM users WHERE id = ?", [user_id]);
  if (!userRow) { res.status(404).json({ message: "User not found" }); return; }
  await exec(
    "INSERT INTO event_invites (event_id, user_id) VALUES (?, ?) ON CONFLICT (event_id, user_id) DO NOTHING",
    [evId, user_id]
  );
  const invites = await query<any>(
    `SELECT ei.id, ei.user_id, u.name, u.email, u.handicap_index, ei.invited_at
     FROM event_invites ei JOIN users u ON u.id = ei.user_id
     WHERE ei.event_id = ? ORDER BY u.name ASC`,
    [evId]
  );
  res.json({ invites });
});

// DELETE /portal/events/:id/invites/:userId  — remove user from invite list
router.delete("/portal/events/:id/invites/:userId", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const evId = Number(req.params.id);
  const userId = Number(req.params.userId);
  const ev = await row<any>("SELECT id FROM golf_events WHERE id = ? AND club_id = ?", [evId, club.id]);
  if (!ev) { res.status(404).json({ message: "Event not found" }); return; }
  await exec("DELETE FROM event_invites WHERE event_id = ? AND user_id = ?", [evId, userId]);
  res.json({ message: "Removed from invite list" });
});

// GET /portal/users/search?q=  — search users by name or email (for invite list)
router.get("/portal/users/search", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const q = String(req.query.q ?? "").trim();
  if (!q || q.length < 2) { res.json({ users: [] }); return; }
  const users = await query<any>(
    `SELECT id, name, email, handicap_index
     FROM users
     WHERE name ILIKE ? OR email ILIKE ?
     ORDER BY name ASC
     LIMIT 20`,
    [`%${q}%`, `%${q}%`]
  );
  res.json({ users });
});

// ── Tee-slot linking (portal) ────────────────────────────────────────────────

// GET /portal/events/:id/tee-slots  → tee slots exclusively owned by this event
router.get("/portal/events/:id/tee-slots", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const evId = Number(req.params.id);
  const ev = await row<any>("SELECT id FROM golf_events WHERE id = ? AND club_id = ?", [evId, club.id]);
  if (!ev) { res.status(404).json({ message: "Event not found" }); return; }
  const slots = await query<any>(
    `SELECT id, date, tee_time AS time, max_players AS total_slots, is_active AS active, session_type, tee_start_type
     FROM portal_tee_slots
     WHERE event_id = ? AND club_id = ?
     ORDER BY date, tee_time`,
    [evId, club.id]
  );
  res.json(slots.map(s => ({ ...s, active: !!s.active })));
});

// PUT /portal/events/:id/tee-slots  → replace linked slot set; recalculates max_participants
router.put("/portal/events/:id/tee-slots", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const evId = Number(req.params.id);
  const ev = await row<any>("SELECT id FROM golf_events WHERE id = ? AND club_id = ?", [evId, club.id]);
  if (!ev) { res.status(404).json({ message: "Event not found" }); return; }

  const raw: any[] = Array.isArray(req.body?.slot_ids) ? req.body.slot_ids : [];
  const ids: number[] = raw.map(Number).filter(n => n > 0);

  if (ids.length > 0) {
    const valid = await query<any>(
      `SELECT id FROM portal_tee_slots WHERE id IN (${ids.map(() => "?").join(",")}) AND club_id = ?`,
      [...ids, club.id]
    );
    if (valid.length !== ids.length) {
      res.status(400).json({ message: "One or more tee slots not found for this club" }); return;
    }
  }

  let maxParticipants: number | null = null;
  if (ids.length > 0) {
    const cap = await row<any>(
      `SELECT COALESCE(SUM(max_players), 0) AS total FROM portal_tee_slots WHERE id IN (${ids.map(() => "?").join(",")})`,
      ids
    );
    maxParticipants = Number(cap?.total ?? 0);
  }
  await exec("UPDATE golf_events SET max_participants = ? WHERE id = ?", [maxParticipants, evId]);

  res.json({ linked: ids.length, max_participants: maxParticipants });
});

router.get("/portal/events/:id/registrations", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club    = getClub(req);
  const evId    = Number(req.params.id);
  const event   = await row<any>("SELECT id FROM golf_events WHERE id = ? AND club_id = ?", [evId, club.id]);
  if (!event) { res.status(404).json({ message: "Event not found" }); return; }
  const regs = await query<any>(
    `SELECT er.id, er.status, er.registered_at, er.division, er.frozen_handicap,
            er.payment_status, er.paid_at,
            u.id as user_id, u.name as user_name, u.email as user_email, u.handicap, u.phone
     FROM event_registrations er
     JOIN users u ON u.id = er.user_id
     WHERE er.event_id = ?
     ORDER BY er.division ASC, er.registered_at ASC`,
    [evId]
  );
  res.json(regs.map((r: any) => ({ ...r, frozen_handicap: r.frozen_handicap != null ? parseFloat(r.frozen_handicap) : null })));
});

router.put("/portal/events/:id/registrations/:userId", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club     = getClub(req);
  const evId     = Number(req.params.id);
  const targetId = Number(req.params.userId);
  const { status } = req.body ?? {};
  if (!["approved","rejected"].includes(status)) { res.status(400).json({ message: "status must be approved or rejected" }); return; }
  const event = await row<any>(
    "SELECT e.id, e.name, e.payment_required, e.entry_fee, c.name as club_name FROM golf_events e JOIN clubs c ON c.id = e.club_id WHERE e.id = ? AND e.club_id = ?",
    [evId, club.id]
  );
  if (!event) { res.status(404).json({ message: "Event not found" }); return; }
  await exec("UPDATE event_registrations SET status = ? WHERE event_id = ? AND user_id = ?", [status, evId, targetId]);
  const target = await row<any>("SELECT push_token FROM users WHERE id = ?", [targetId]);
  const needsPayment = status === "approved" && event.payment_required && event.entry_fee;
  const notifTitle = status === "approved" ? "Spot Confirmed ⛳" : "Registration Update";
  const notifBody  = status === "approved"
    ? needsPayment
      ? `Your entry for "${event.name}" is approved. Open the app to pay R${parseFloat(event.entry_fee).toFixed(2)}.`
      : `Your entry for "${event.name}" is confirmed.`
    : `Your entry for "${event.name}" was not accepted.`;
  const notifData  = { type: "event_registration_update", event_id: evId, status };
  // in-app notification (always, regardless of push token)
  await exec(
    "INSERT INTO user_notifications (user_id, type, title, body, data) VALUES (?, ?, ?, ?, ?::jsonb)",
    [targetId, "event_registration_update", notifTitle, notifBody, JSON.stringify(notifData)]
  );
  if (target?.push_token) {
    const { sendPushNotifications } = await import("../lib/notifications");
    sendPushNotifications([{ to: target.push_token, sound: "default", title: notifTitle, body: notifBody, data: notifData }]);
  }
  res.json({ success: true });
});

// ── Approve all pending registrations (ballot-aware) ──────────────────────────
router.post("/portal/events/:id/registrations/approve-all", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club  = getClub(req);
  const evId  = Number(req.params.id);

  const event = await row<any>(
    `SELECT e.id, e.name, e.payment_required, e.entry_fee, e.max_participants,
            c.name as club_name
     FROM golf_events e JOIN clubs c ON c.id = e.club_id
     WHERE e.id = ? AND e.club_id = ?`,
    [evId, club.id]
  );
  if (!event) { res.status(404).json({ message: "Event not found" }); return; }

  // All pending registrations — oldest first (by registered_at) so early registrants get priority
  const pending = await query<any>(
    `SELECT er.id, er.user_id, u.push_token, u.name as user_name
     FROM event_registrations er
     JOIN users u ON u.id = er.user_id
     WHERE er.event_id = ? AND er.status = 'pending'
     ORDER BY er.registered_at ASC`,
    [evId]
  );

  if (pending.length === 0) {
    res.json({ approved: 0, rejected: 0, message: "No pending registrations" });
    return;
  }

  // How many spots remain?
  const cap = Number(event.max_participants ?? 0);
  let toApprove: any[];
  let toReject:  any[];

  if (cap > 0) {
    const { n: alreadyApproved } = (await row<any>(
      "SELECT COUNT(*) AS n FROM event_registrations WHERE event_id = ? AND status = 'approved'",
      [evId]
    ))!;
    const remaining = Math.max(0, cap - Number(alreadyApproved));
    toApprove = pending.slice(0, remaining);
    toReject  = pending.slice(remaining);
  } else {
    // No cap — approve everyone
    toApprove = pending;
    toReject  = [];
  }

  const needsPayment = event.payment_required && event.entry_fee;
  const { sendPushNotifications } = await import("../lib/notifications");

  // Approve
  if (toApprove.length > 0) {
    const placeholders = toApprove.map(() => "?").join(",");
    await run(
      `UPDATE event_registrations SET status = 'approved' WHERE event_id = ? AND user_id IN (${placeholders}) AND status = 'pending'`,
      [evId, ...toApprove.map((p: any) => p.user_id)]
    );
    const approveTitle = "Spot Confirmed ⛳";
    const approveBody  = needsPayment
      ? `Your entry for "${event.name}" is approved. Open the app to pay R${parseFloat(event.entry_fee).toFixed(2)}.`
      : `Your entry for "${event.name}" is confirmed.`;
    const approveData  = { type: "event_registration_update", event_id: evId, status: "approved" };
    const pushTokens: string[] = [];
    for (const p of toApprove) {
      await exec(
        "INSERT INTO user_notifications (user_id, type, title, body, data) VALUES (?, ?, ?, ?, ?::jsonb)",
        [p.user_id, "event_registration_update", approveTitle, approveBody, JSON.stringify(approveData)]
      );
      if (p.push_token) pushTokens.push(p.push_token);
    }
    if (pushTokens.length > 0) {
      sendPushNotifications(pushTokens.map(to => ({ to, sound: "default", title: approveTitle, body: approveBody, data: approveData })));
    }
  }

  // Reject overflow (ballot)
  if (toReject.length > 0) {
    const placeholders = toReject.map(() => "?").join(",");
    await run(
      `UPDATE event_registrations SET status = 'rejected' WHERE event_id = ? AND user_id IN (${placeholders}) AND status = 'pending'`,
      [evId, ...toReject.map((p: any) => p.user_id)]
    );
    const rejectTitle = "Registration Update";
    const rejectBody  = `Your entry for "${event.name}" was not accepted — the field is full.`;
    const rejectData  = { type: "event_registration_update", event_id: evId, status: "rejected" };
    const pushTokens: string[] = [];
    for (const p of toReject) {
      await exec(
        "INSERT INTO user_notifications (user_id, type, title, body, data) VALUES (?, ?, ?, ?, ?::jsonb)",
        [p.user_id, "event_registration_update", rejectTitle, rejectBody, JSON.stringify(rejectData)]
      );
      if (p.push_token) pushTokens.push(p.push_token);
    }
    if (pushTokens.length > 0) {
      sendPushNotifications(pushTokens.map(to => ({ to, sound: "default", title: rejectTitle, body: rejectBody, data: rejectData })));
    }
  }

  res.json({ approved: toApprove.length, rejected: toReject.length });
});

// ── Generate draw (returns entries without saving — staff reviews then publishes) ──
router.post("/portal/events/:id/draw/generate", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club  = getClub(req);
  const evId  = Number(req.params.id);
  const {
    round = 1,
    date: reqDate,
    mode = "random",
    players_per_group = 4,
    seed_metric = "points",
    seed_round,
    group_by_division = false,
  } = req.body ?? {};

  const event = await row<any>(
    "SELECT id, event_date, end_date, rounds FROM golf_events WHERE id = ? AND club_id = ?",
    [evId, club.id]
  );
  if (!event) { res.status(404).json({ message: "Event not found" }); return; }

  const teeDate: string = reqDate
    ? String(reqDate).slice(0, 10)
    : String(event.event_date).slice(0, 10);

  // Get tournament-exclusive tee slots for this date
  const slots = await query<any>(
    "SELECT id, tee_time, tee_start_type, max_players FROM portal_tee_slots WHERE event_id = ? AND date = ? AND is_active = 1 ORDER BY tee_time",
    [evId, teeDate]
  );

  // All approved players for this event
  const approved = await query<any>(
    `SELECT er.user_id, u.name AS user_name, er.division, er.frozen_handicap
     FROM event_registrations er
     JOIN users u ON u.id = er.user_id
     WHERE er.event_id = ? AND er.status = 'approved'
     ORDER BY u.name`,
    [evId]
  );

  let players = [...approved];

  // seedValueMap: user_id → { value, metric } for display in the draw
  const seedValueMap = new Map<number, { value: number | null; metric: string }>();

  // Pre-fetch previous-round scores if seeding by score metric
  let scoreMap = new Map<number, any>();
  if (mode === "seeded" && seed_metric !== "handicap") {
    const sr = seed_round != null ? Number(seed_round) : Math.max(1, Number(round) - 1);
    const prevScores = await query<any>(
      "SELECT user_id, gross, net, points FROM event_scores WHERE event_id = ? AND round = ?",
      [evId, sr]
    );
    scoreMap = new Map(prevScores.map((s: any) => [Number(s.user_id), s]));
  }

  // Sort a slice of players in-place (random or seeded)
  const sortSlice = (slice: any[]) => {
    if (mode === "seeded") {
      if (seed_metric === "handicap") {
        // Highest handicap (weakest) first → best player last group
        slice.sort((a, b) => (b.frozen_handicap ?? 999) - (a.frozen_handicap ?? 999));
      } else {
        // Players without a score → first groups; then worst→best so best score = last group
        slice.sort((a, b) => {
          const sa = scoreMap.get(a.user_id);
          const sb = scoreMap.get(b.user_id);
          if (!sa && !sb) return 0;
          if (!sa) return -1;
          if (!sb) return 1;
          if (seed_metric === "points") return (sa.points ?? 0) - (sb.points ?? 0);
          if (seed_metric === "gross")  return (sb.gross ?? 999) - (sa.gross ?? 999);
          return (sb.net ?? 999) - (sa.net ?? 999);
        });
      }
    } else {
      // Fisher-Yates shuffle
      for (let i = slice.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [slice[i], slice[j]] = [slice[j]!, slice[i]!];
      }
    }
  };

  if (group_by_division) {
    // Partition players by division, sort within each, then concatenate (divisions alphabetically)
    const divMap = new Map<string, any[]>();
    for (const p of players) {
      const div = p.division ?? "Unassigned";
      if (!divMap.has(div)) divMap.set(div, []);
      divMap.get(div)!.push(p);
    }
    const sortedDivs = [...divMap.keys()].sort();
    players = sortedDivs.flatMap(div => {
      const slice = [...divMap.get(div)!];
      sortSlice(slice);
      return slice;
    });
  } else {
    sortSlice(players);
  }

  // Build seedValueMap after ordering is finalised
  if (mode === "seeded") {
    for (const p of players) {
      if (seed_metric === "handicap") {
        seedValueMap.set(p.user_id, { value: p.frozen_handicap ?? null, metric: "handicap" });
      } else {
        const s = scoreMap.get(p.user_id);
        const val = s ? (seed_metric === "points" ? s.points : seed_metric === "gross" ? s.gross : s.net) : null;
        seedValueMap.set(p.user_id, { value: val ?? null, metric: seed_metric });
      }
    }
  }

  const pgSize = Math.max(1, Math.min(4, Number(players_per_group)));
  const entries: any[] = [];
  let playerIdx = 0;
  let groupNum  = 1;

  const assignGroup = (teeTime: string, startingTee: number) => {
    const count = Math.min(pgSize, players.length - playerIdx);
    for (let i = 0; i < count; i++) {
      const p = players[playerIdx++]!;
      const seed = seedValueMap.get(p.user_id);
      entries.push({
        id: Date.now() + entries.length,
        round: Number(round),
        tee_date: teeDate,
        tee_time: teeTime,
        draw_group: groupNum,
        starting_tee: startingTee,
        user_id: p.user_id,
        user_name: p.user_name,
        division: p.division,
        frozen_handicap: p.frozen_handicap,
        seed_metric: seed?.metric ?? null,
        seed_value: seed?.value ?? null,
        notes: null,
      });
    }
    groupNum++;
  };

  if (slots.length > 0) {
    for (const slot of slots) {
      if (playerIdx >= players.length) break;
      const teeTime     = String(slot.tee_time).slice(0, 5);
      const startingTee = (slot.tee_start_type === "10th Tee" || slot.tee_start_type === "tenth_tee") ? 10 : 1;
      assignGroup(teeTime, startingTee);
    }
    // Overflow: more players than slots — continue at last slot's time
    if (playerIdx < players.length) {
      const last        = slots[slots.length - 1]!;
      const teeTime     = String(last.tee_time).slice(0, 5);
      const startingTee = (last.tee_start_type === "10th Tee" || last.tee_start_type === "tenth_tee") ? 10 : 1;
      while (playerIdx < players.length) assignGroup(teeTime, startingTee);
    }
  } else {
    // No tee slots configured — create groups at 08:00
    while (playerIdx < players.length) assignGroup("08:00", 1);
  }

  res.json({ entries });
});

router.get("/portal/events/:id/draw", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club  = getClub(req);
  const evId  = Number(req.params.id);
  const round = req.query.round ? Number(req.query.round) : 1;
  const event = await row<any>("SELECT id FROM golf_events WHERE id = ? AND club_id = ?", [evId, club.id]);
  if (!event) { res.status(404).json({ message: "Event not found" }); return; }
  const draws = await query<any>(
    `SELECT d.id, d.round, d.tee_date, d.tee_time, d.draw_group, d.starting_tee, d.notes,
            d.seed_metric, d.seed_value,
            u.id as user_id, u.name as user_name, u.email as user_email,
            r.division, r.frozen_handicap
     FROM event_draws d
     JOIN users u ON u.id = d.user_id
     JOIN event_registrations r ON r.event_id = d.event_id AND r.user_id = d.user_id
     WHERE d.event_id = ? AND d.round = ?
     ORDER BY d.draw_group ASC, d.tee_time ASC`,
    [evId, round]
  );
  res.json(draws.map((d: any) => ({
    ...d,
    seed_value: d.seed_value != null ? parseFloat(d.seed_value) : null,
  })));
});

router.put("/portal/events/:id/draw", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club  = getClub(req);
  const evId  = Number(req.params.id);
  const { round = 1, entries = [] } = req.body ?? {};
  const event = await row<any>(
    "SELECT e.id, e.name, e.payment_required, e.entry_fee FROM golf_events e WHERE e.id = ? AND e.club_id = ?",
    [evId, club.id]
  );
  if (!event) { res.status(404).json({ message: "Event not found" }); return; }
  await exec("DELETE FROM event_draws WHERE event_id = ? AND round = ?", [evId, round]);

  const drawUserIds: number[] = [];
  for (const entry of entries) {
    if (!entry.user_id || !entry.tee_date || !entry.tee_time) continue;
    await exec(
      "INSERT INTO event_draws (event_id, round, tee_date, tee_time, draw_group, starting_tee, user_id, notes, seed_metric, seed_value) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [evId, round, entry.tee_date, entry.tee_time, entry.draw_group ?? 1, entry.starting_tee ?? 1, entry.user_id, entry.notes ?? null, entry.seed_metric ?? null, entry.seed_value ?? null]
    );
    drawUserIds.push(Number(entry.user_id));
  }

  // Auto-approve every golfer placed in the draw (they were pending ballot)
  if (drawUserIds.length > 0) {
    const placeholders = drawUserIds.map(() => "?").join(", ");
    await exec(
      `UPDATE event_registrations SET status = 'approved' WHERE event_id = ? AND user_id IN (${placeholders}) AND status = 'pending'`,
      [evId, ...drawUserIds]
    );
  }

  // Notify all draw entrants — push + in-app
  if (drawUserIds.length > 0) {
    const placeholders = drawUserIds.map(() => "?").join(", ");
    const recipients = await query<any>(
      `SELECT u.id as user_id, u.push_token, er.payment_status
       FROM users u
       JOIN event_registrations er ON er.user_id = u.id AND er.event_id = ?
       WHERE u.id IN (${placeholders})`,
      [evId, ...drawUserIds]
    );
    const { sendPushNotifications } = await import("../lib/notifications");
    const pushMessages: any[] = [];
    for (const r of recipients) {
      const needsPay = event.payment_required && r.payment_status !== "paid";
      const title = needsPay ? "Draw Published — Payment Required ⛳" : "Draw Published ⛳";
      const body  = needsPay
        ? `You're in the draw for "${event.name}" Round ${round}. Open the app to pay R${parseFloat(event.entry_fee ?? "0").toFixed(2)} and confirm your spot.`
        : `The tee-time draw for "${event.name}" Round ${round} is now available.`;
      const data = { type: "event_draw_published", event_id: evId, round };
      // in-app notification
      await exec(
        "INSERT INTO user_notifications (user_id, type, title, body, data) VALUES (?, ?, ?, ?, ?::jsonb)",
        [r.user_id, "event_draw_published", title, body, JSON.stringify(data)]
      );
      if (r.push_token) pushMessages.push({ to: r.push_token, sound: "default", title, body, data });
    }
    if (pushMessages.length > 0) sendPushNotifications(pushMessages);
  }
  res.json({ success: true });
});

router.get("/portal/events/:id/scores", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club  = getClub(req);
  const evId  = Number(req.params.id);
  const round = req.query.round ? Number(req.query.round) : null;
  const event = await row<any>("SELECT id FROM golf_events WHERE id = ? AND club_id = ?", [evId, club.id]);
  if (!event) { res.status(404).json({ message: "Event not found" }); return; }
  const roundFilter = round != null ? "AND s.round = ?" : "";
  const params: any[] = round != null ? [evId, round] : [evId];
  const scores = await query<any>(
    `SELECT s.id, s.round, s.gross, s.net, s.points, s.hole_scores, s.submitted_at, s.verified,
            u.id as user_id, u.name as user_name,
            r.division, r.frozen_handicap
     FROM event_scores s
     JOIN users u ON u.id = s.user_id
     JOIN event_registrations r ON r.event_id = s.event_id AND r.user_id = s.user_id
     WHERE s.event_id = ? ${roundFilter}
     ORDER BY r.division ASC, s.gross ASC NULLS LAST`,
    params
  );
  res.json(scores);
});

router.post("/portal/events/:id/scores", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club  = getClub(req);
  const evId  = Number(req.params.id);
  const { round = 1, scores = [] } = req.body ?? {};
  const event = await row<any>("SELECT id FROM golf_events WHERE id = ? AND club_id = ?", [evId, club.id]);
  if (!event) { res.status(404).json({ message: "Event not found" }); return; }
  for (const s of scores) {
    if (!s.user_id) continue;
    await exec(
      `INSERT INTO event_scores (event_id, user_id, round, hole_scores, gross, net, points, verified, verified_by, verified_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, NOW())
       ON CONFLICT (event_id, user_id, round) DO UPDATE
         SET hole_scores = EXCLUDED.hole_scores, gross = EXCLUDED.gross, net = EXCLUDED.net,
             points = EXCLUDED.points, verified = 1, verified_by = EXCLUDED.verified_by, verified_at = EXCLUDED.verified_at`,
      [evId, s.user_id, round, s.hole_scores ? JSON.stringify(s.hole_scores) : null,
       s.gross ?? null, s.net ?? null, s.points ?? null, club.id]
    );
  }
  res.json({ success: true });
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
  const nid = parseInt(String(req.params["id"]), 10);
  await exec("UPDATE club_inbox_notifications SET read_at = NOW() WHERE id = ? AND club_id = ?", [nid, club.id]);
  res.json({ ok: true });
});

router.put("/portal/inbox/read-all", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  await exec("UPDATE club_inbox_notifications SET read_at = NOW() WHERE club_id = ? AND read_at IS NULL", [club.id]);
  res.json({ ok: true });
});

router.put("/portal/inbox/:id/unread", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const nid = parseInt(String(req.params["id"]), 10);
  await exec("UPDATE club_inbox_notifications SET read_at = NULL WHERE id = ? AND club_id = ?", [nid, club.id]);
  res.json({ ok: true });
});

router.put("/portal/inbox/:id/refund-processed", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const nid = parseInt(String(req.params["id"]), 10);
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

// ─── Tournament image upload ──────────────────────────────────────────────────
router.post(
  "/portal/events/image/upload",
  requireClubAuth,
  upload.single("image"),
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
      ? `${basePath}/tournament-images/${club.id}/${fileUuid}.${ext}`
      : `tournament-images/${club.id}/${fileUuid}.${ext}`;
    const bucket = objectStorageClient.bucket(parsedBucket);
    await bucket.file(objectKey).save(file.buffer, { contentType: file.mimetype });
    await bucket.file(objectKey).setMetadata({ cacheControl: "public, max-age=86400" });
    const host = req.get("host") ?? "localhost";
    const url = `https://${host}/api/storage/objects/tournament-images/${club.id}/${fileUuid}.${ext}`;
    res.json({ url });
  }
);

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
  const imageId = parseInt(String(req.params["imageId"]), 10);
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
  const imageId = parseInt(String(req.params["imageId"]), 10);
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

// ── Tee Auto-generation Rules ──────────────────────────────────────────────────
router.get("/portal/tee-auto-rules", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const rows = await query<any>(
    "SELECT id, name, season_start, season_end, lookahead_days, lookback_days, players_per_slot, config_type, config_data, active, last_run_at, created_at FROM tee_auto_rules WHERE club_id = ? ORDER BY created_at ASC",
    [club.id]
  );
  res.json(rows.map(r => ({ ...r, config_data: typeof r.config_data === "string" ? JSON.parse(r.config_data) : r.config_data })));
});

router.post("/portal/tee-auto-rules", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const { name, season_start, season_end, lookahead_days, lookback_days, players_per_slot, config_type, config_data, active } = req.body ?? {};
  if (!name || !season_start || !season_end) { res.status(400).json({ message: "name, season_start and season_end are required" }); return; }
  const id = await exec(
    "INSERT INTO tee_auto_rules (club_id, name, season_start, season_end, lookahead_days, lookback_days, players_per_slot, config_type, config_data, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [club.id, String(name).trim(), season_start, season_end, Number(lookahead_days ?? 14), Number(lookback_days ?? 0), Number(players_per_slot ?? 4), config_type ?? "A", JSON.stringify(config_data ?? {}), active !== false]
  );
  const created = await row<any>("SELECT id, name, season_start, season_end, lookahead_days, lookback_days, players_per_slot, config_type, config_data, active, last_run_at, created_at FROM tee_auto_rules WHERE id = ?", [id]);
  res.status(201).json({ ...created, config_data: typeof created?.config_data === "string" ? JSON.parse(created.config_data) : created?.config_data });
});

router.put("/portal/tee-auto-rules/:id", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const ruleId = Number(req.params.id);
  const existing = await row<any>("SELECT id FROM tee_auto_rules WHERE id = ? AND club_id = ?", [ruleId, club.id]);
  if (!existing) { res.status(404).json({ message: "Rule not found" }); return; }
  const { name, season_start, season_end, lookahead_days, lookback_days, players_per_slot, config_type, config_data, active } = req.body ?? {};
  const updates: string[] = []; const vals: any[] = [];
  if (name !== undefined)             { updates.push("name = ?");             vals.push(String(name).trim()); }
  if (season_start !== undefined)     { updates.push("season_start = ?");     vals.push(season_start); }
  if (season_end !== undefined)       { updates.push("season_end = ?");       vals.push(season_end); }
  if (lookahead_days !== undefined)   { updates.push("lookahead_days = ?");   vals.push(Number(lookahead_days)); }
  if (lookback_days !== undefined)    { updates.push("lookback_days = ?");    vals.push(Number(lookback_days)); }
  if (players_per_slot !== undefined) { updates.push("players_per_slot = ?"); vals.push(Number(players_per_slot)); }
  if (config_type !== undefined)      { updates.push("config_type = ?");      vals.push(config_type); }
  if (config_data !== undefined)      { updates.push("config_data = ?");      vals.push(JSON.stringify(config_data)); }
  if (active !== undefined)           { updates.push("active = ?");           vals.push(Boolean(active)); }
  if (!updates.length) { res.status(400).json({ message: "No fields to update" }); return; }
  vals.push(ruleId, club.id);
  await run(`UPDATE tee_auto_rules SET ${updates.join(", ")} WHERE id = ? AND club_id = ?`, vals);
  const updated = await row<any>("SELECT id, name, season_start, season_end, lookahead_days, lookback_days, players_per_slot, config_type, config_data, active, last_run_at, created_at FROM tee_auto_rules WHERE id = ?", [ruleId]);
  res.json({ ...updated, config_data: typeof updated?.config_data === "string" ? JSON.parse(updated.config_data) : updated?.config_data });
});

router.delete("/portal/tee-auto-rules/:id", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const ruleId = Number(req.params.id);
  await run("DELETE FROM tee_auto_rules WHERE id = ? AND club_id = ?", [ruleId, club.id]);
  res.json({ message: "Deleted" });
});

router.post("/portal/tee-auto-rules/:id/run-now", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const ruleId = Number(req.params.id);
  const rule = await row<any>("SELECT * FROM tee_auto_rules WHERE id = ? AND club_id = ?", [ruleId, club.id]);
  if (!rule) { res.status(404).json({ message: "Rule not found" }); return; }
  const { runAutoRuleNow } = await import("../worker/autoTeeGen");
  const { datesProcessed, slotsCreated, no_config, out_of_season, season_start, season_end } = await runAutoRuleNow(rule);
  if (!no_config && !out_of_season) await run("UPDATE tee_auto_rules SET last_run_at = NOW() WHERE id = ?", [ruleId]);
  res.json({ dates_processed: datesProcessed, slots_created: slotsCreated, no_config: no_config ?? false, out_of_season: out_of_season ?? false, season_start, season_end });
});

// ── Tournament Templates ───────────────────────────────────────────────────────
router.get("/portal/tournament-templates", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const rows = await query<any>(
    "SELECT id, name, template_data, created_at FROM tournament_templates WHERE club_id = ? ORDER BY created_at ASC",
    [club.id]
  );
  res.json(rows.map(r => ({ ...r, template_data: typeof r.template_data === "string" ? JSON.parse(r.template_data) : r.template_data })));
});

router.post("/portal/tournament-templates", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const { name, template_data } = req.body ?? {};
  if (!name || !template_data) { res.status(400).json({ message: "name and template_data are required" }); return; }
  const id = await exec(
    "INSERT INTO tournament_templates (club_id, name, template_data) VALUES (?, ?, ?)",
    [club.id, String(name).trim(), JSON.stringify(template_data)]
  );
  res.status(201).json({ id, name, template_data });
});

router.put("/portal/tournament-templates/:id", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const tplId = Number(req.params.id);
  const existing = await row<any>("SELECT id FROM tournament_templates WHERE id = ? AND club_id = ?", [tplId, club.id]);
  if (!existing) { res.status(404).json({ message: "Template not found" }); return; }
  const { name } = req.body ?? {};
  await exec(
    "UPDATE tournament_templates SET name = COALESCE(?, name) WHERE id = ? AND club_id = ?",
    [name ? String(name).trim() : null, tplId, club.id]
  );
  res.json({ message: "Updated" });
});

router.delete("/portal/tournament-templates/:id", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const tplId = Number(req.params.id);
  await run("DELETE FROM tournament_templates WHERE id = ? AND club_id = ?", [tplId, club.id]);
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
           b.invoice_sent_at, b.invoice_resend_count,
           u.name AS user_name, u.email AS user_email, u.phone AS user_phone,
           pts.date AS tee_date, pts.tee_time AS tee_time,
           c.cancel_payment_minutes, c.cancel_fee_pct,
           c.cancel_refund_tiers,   c.cancel_contact_email,
           c.cancel_contact_phone,  c.cancel_other_policies
    FROM bookings b
    JOIN portal_tee_slots pts ON b.portal_slot_id = pts.id
    JOIN users u ON b.user_id = u.id
    JOIN clubs c ON c.id = pts.club_id
    WHERE b.id = ? AND pts.club_id = ?`,
    [bId, club.id]
  );
  if (!b) { res.status(404).json({ message: "Booking not found" }); return; }

  const players = await query<any>(
    `SELECT COALESCE(u.name, bp.guest_name, 'Guest') AS name, u.email, bp.amount, bp.paid
     FROM booking_players bp LEFT JOIN users u ON bp.user_id = u.id WHERE bp.booking_id = ? ORDER BY bp.id`,
    [bId]
  );

  let refundTiers: Array<{ label: string; refund_pct: number }> = [];
  try { refundTiers = b.cancel_refund_tiers ? JSON.parse(b.cancel_refund_tiers) : []; } catch { /* ignore */ }
  const cancelPolicy = {
    windowMinutes: b.cancel_payment_minutes ?? null,
    feePct:        Number(b.cancel_fee_pct ?? 5),
    refundTiers,
    contactEmail:  b.cancel_contact_email  ?? null,
    contactPhone:  b.cancel_contact_phone  ?? null,
    otherPolicies: b.cancel_other_policies ?? null,
  };

  try {
    await sendInvoiceEmail({ ...b, tee_date: String(b.tee_date).slice(0, 10), tee_time: String(b.tee_time).slice(0, 5), players_list: players }, club.name, cancelPolicy);
    res.json({ message: "Invoice sent to " + b.user_email });
  } catch (err) {
    logger.error({ err }, "Failed to send invoice email");
    res.status(500).json({ message: "Failed to send invoice email" });
  }
});

// ─── PORTAL USERS ─────────────────────────────────────────────────────────────

// Login as a club portal user (email + password)
router.post("/portal/users/login", async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body ?? {};
  if (!email || !password) { res.status(400).json({ message: "Email and password required" }); return; }
  const u = await row<any>(
    `SELECT cpu.id, cpu.club_id, cpu.name, cpu.email, cpu.password_hash, cpu.role, cpu.permissions, cpu.active,
            c.name AS club_name, c.location, c.province
     FROM club_portal_users cpu
     JOIN clubs c ON c.id = cpu.club_id
     WHERE LOWER(cpu.email) = ? AND cpu.active = 1
     LIMIT 1`,
    [String(email).trim().toLowerCase()]
  );
  if (!u) { res.status(401).json({ message: "Invalid credentials" }); return; }
  const valid = await bcrypt.compare(String(password), u.password_hash);
  if (!valid) { res.status(401).json({ message: "Invalid credentials" }); return; }
  const permissions = u.permissions ?? {};
  const token = generateClubUserToken(u.club_id, u.id, u.role, permissions);
  res.json({
    token,
    club: { id: u.club_id, name: u.club_name, location: u.location, province: u.province },
    clubUser: { id: u.id, name: u.name, email: u.email, role: u.role, permissions },
  });
});

// Get current portal user profile (works for both direct club login + club user login)
router.get("/portal/users/me-user", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const cu = getClubUser(req);
  const club = getClub(req);
  if (!cu) {
    // Direct club admin login — return a synthetic "admin" record
    res.json({ clubUser: null, club: { id: club.id, name: club.name, location: club.location, province: club.province } });
    return;
  }
  res.json({ clubUser: { id: cu.id, name: cu.name, email: cu.email, role: cu.role, permissions: cu.permissions }, club: { id: club.id, name: club.name, location: club.location, province: club.province } });
});

// List all portal users for this club (admin only)
router.get("/portal/users", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  if (!isPortalAdmin(req)) { res.status(403).json({ message: "Admin access required" }); return; }
  const club = getClub(req);
  const users = await query<any>(
    "SELECT id, name, email, role, permissions, active, created_at FROM club_portal_users WHERE club_id = ? ORDER BY created_at ASC",
    [club.id]
  );
  res.json({ users: users.map(u => ({ ...u, permissions: u.permissions ?? {} })) });
});

// Create a new portal user (admin only)
router.post("/portal/users", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  if (!isPortalAdmin(req)) { res.status(403).json({ message: "Admin access required" }); return; }
  const club = getClub(req);
  const { name, email, password, role = "member", permissions = {} } = req.body ?? {};
  if (!name || !email || !password) { res.status(400).json({ message: "Name, email and password are required" }); return; }
  const cleanEmail = String(email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) { res.status(400).json({ message: "Invalid email address" }); return; }
  if (String(password).length < 6) { res.status(400).json({ message: "Password must be at least 6 characters" }); return; }
  const existing = await row<any>("SELECT id FROM club_portal_users WHERE club_id = ? AND LOWER(email) = ?", [club.id, cleanEmail]);
  if (existing) { res.status(409).json({ message: "A user with this email already exists for this club" }); return; }
  const hash = await bcrypt.hash(String(password), 10);
  const newRow = await row<any>(
    "INSERT INTO club_portal_users (club_id, name, email, password_hash, role, permissions) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
    [club.id, String(name).trim(), cleanEmail, hash, role === "admin" ? "admin" : "member", JSON.stringify(permissions)]
  );
  const newId = newRow?.id;
  res.status(201).json({ user: { id: newId, name: String(name).trim(), email: cleanEmail, role, permissions, active: 1 } });
});

// Update a portal user (name, email, role, permissions, active) — admin only
router.put("/portal/users/:id", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  if (!isPortalAdmin(req)) { res.status(403).json({ message: "Admin access required" }); return; }
  const club = getClub(req);
  const userId = parseInt(String(req.params["id"] ?? "0"), 10);
  const u = await row<any>("SELECT id, role FROM club_portal_users WHERE id = ? AND club_id = ?", [userId, club.id]);
  if (!u) { res.status(404).json({ message: "User not found" }); return; }
  const { name, email, role, permissions, active } = req.body ?? {};
  const fields: string[] = [];
  const vals: any[] = [];
  if (name !== undefined) { fields.push("name = ?"); vals.push(String(name).trim()); }
  if (email !== undefined) { fields.push("email = ?"); vals.push(String(email).trim().toLowerCase()); }
  if (role !== undefined) { fields.push("role = ?"); vals.push(role === "admin" ? "admin" : "member"); }
  if (permissions !== undefined) { fields.push("permissions = ?"); vals.push(JSON.stringify(permissions)); }
  if (active !== undefined) { fields.push("active = ?"); vals.push(active ? 1 : 0); }
  if (fields.length === 0) { res.status(400).json({ message: "Nothing to update" }); return; }
  vals.push(userId, club.id);
  await run(`UPDATE club_portal_users SET ${fields.join(", ")} WHERE id = ? AND club_id = ?`, vals);
  const updated = await row<any>("SELECT id, name, email, role, permissions, active FROM club_portal_users WHERE id = ?", [userId]);
  res.json({ user: { ...updated, permissions: updated?.permissions ?? {} } });
});

// Reset a portal user's password — admin only
router.put("/portal/users/:id/password", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  if (!isPortalAdmin(req)) { res.status(403).json({ message: "Admin access required" }); return; }
  const club = getClub(req);
  const userId = parseInt(String(req.params["id"] ?? "0"), 10);
  const { password } = req.body ?? {};
  if (!password || String(password).length < 6) { res.status(400).json({ message: "Password must be at least 6 characters" }); return; }
  const u = await row<any>("SELECT id FROM club_portal_users WHERE id = ? AND club_id = ?", [userId, club.id]);
  if (!u) { res.status(404).json({ message: "User not found" }); return; }
  const hash = await bcrypt.hash(String(password), 10);
  await run("UPDATE club_portal_users SET password_hash = ? WHERE id = ? AND club_id = ?", [hash, userId, club.id]);
  res.json({ message: "Password updated" });
});

// Delete a portal user — admin only
router.delete("/portal/users/:id", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  if (!isPortalAdmin(req)) { res.status(403).json({ message: "Admin access required" }); return; }
  const club = getClub(req);
  const userId = parseInt(String(req.params["id"] ?? "0"), 10);
  const u = await row<any>("SELECT id FROM club_portal_users WHERE id = ? AND club_id = ?", [userId, club.id]);
  if (!u) { res.status(404).json({ message: "User not found" }); return; }
  await run("DELETE FROM club_portal_users WHERE id = ? AND club_id = ?", [userId, club.id]);
  res.json({ message: "User deleted" });
});

// ── Club bans ──────────────────────────────────────────────────────────────

// Search any TapIn user by phone or name (for the "ban a golfer" dialog)
router.get("/portal/user-lookup", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const q = String(req.query["q"] ?? "").trim();
  res.setHeader("Cache-Control", "no-store");
  if (q.length < 2) { res.json([]); return; }
  const like = `%${q}%`;
  const users = await query<any>(
    "SELECT id, name, phone, email FROM users WHERE phone ILIKE ? OR name ILIKE ? ORDER BY name LIMIT 10",
    [like, like]
  );
  res.json(users);
});

// GET /portal/bans — list all bans for this club, appeals first
router.get("/portal/bans", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const statusFilter = req.query["status"] ? "AND cb.status = ?" : "";
  const params: any[] = [club.id];
  if (req.query["status"]) params.push(req.query["status"]);
  const bans = await query<any>(
    `SELECT cb.id, cb.status, cb.reason, cb.appeal_message, cb.appealed_at,
            cb.appeal_response, cb.lift_note, cb.lifted_at, cb.created_at,
            u.id AS user_id, u.name AS user_name, u.phone, u.email
     FROM club_bans cb
     JOIN users u ON u.id = cb.user_id
     WHERE cb.club_id = ? ${statusFilter}
     ORDER BY CASE cb.status WHEN 'appealing' THEN 0 WHEN 'active' THEN 1 ELSE 2 END, cb.created_at DESC`,
    params
  );
  res.json(bans);
});

// GET /portal/bans/appeals/count — pending appeal badge count
router.get("/portal/bans/appeals/count", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const r = await row<any>(
    "SELECT COUNT(*) AS pending FROM club_bans WHERE club_id = ? AND status = 'appealing'",
    [club.id]
  );
  res.json({ pending: Number(r?.pending ?? 0) });
});

// POST /portal/bans — ban a golfer from this club
router.post("/portal/bans", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const clubUser = (req as any).clubUser;
  const { user_id, reason } = req.body ?? {};
  if (!user_id || !String(reason ?? "").trim()) {
    res.status(400).json({ message: "user_id and reason are required." });
    return;
  }
  const target = await row<any>("SELECT id, name, push_token FROM users WHERE id = ?", [user_id]);
  if (!target) { res.status(404).json({ message: "User not found" }); return; }

  const existing = await row<any>(
    "SELECT id, status FROM club_bans WHERE club_id = ? AND user_id = ?",
    [club.id, user_id]
  );
  let banId: number;
  if (existing) {
    if (existing.status === "active" || existing.status === "appealing") {
      // Already banned — idempotent, return success so the UI can refresh
      res.status(200).json({ success: true, id: existing.id, already_active: true });
      return;
    }
    await run(
      `UPDATE club_bans SET reason = ?, status = 'active', banned_by = ?, created_at = NOW(),
       appeal_message = NULL, appealed_at = NULL, appeal_response = NULL,
       lift_note = NULL, lifted_at = NULL, lifted_by = NULL WHERE id = ?`,
      [String(reason).trim(), clubUser?.id ?? null, existing.id]
    );
    banId = existing.id;
  } else {
    const inserted = await row<any>(
      "INSERT INTO club_bans (club_id, user_id, reason, banned_by) VALUES (?, ?, ?, ?) RETURNING id",
      [club.id, user_id, String(reason).trim(), clubUser?.id ?? null]
    );
    banId = inserted!.id;
  }

  const title = `Club Access Restricted — ${club.name}`;
  const body = String(reason).trim().slice(0, 200);
  if (target.push_token) {
    sendPushNotifications([{
      to: target.push_token, sound: "default", title, body,
      data: { type: "club_ban", club_id: club.id },
    }]);
  }
  saveUserNotification(user_id, "club_ban", title, body, { club_id: club.id, ban_id: banId });
  res.status(201).json({ success: true, id: banId });
});

// POST /portal/bans/:id/lift — lift a ban (optionally with a note)
router.post("/portal/bans/:id/lift", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const clubUser = (req as any).clubUser;
  const id = parseInt(String(req.params["id"] ?? "0"), 10);
  const { lift_note } = req.body ?? {};
  const ban = await row<any>(
    "SELECT id, user_id, status FROM club_bans WHERE id = ? AND club_id = ?",
    [id, club.id]
  );
  if (!ban) { res.status(404).json({ message: "Ban not found" }); return; }
  if (ban.status === "lifted") { res.status(409).json({ message: "Ban is already lifted." }); return; }

  await run(
    "UPDATE club_bans SET status = 'lifted', lift_note = ?, lifted_at = NOW(), lifted_by = ? WHERE id = ?",
    [lift_note ? String(lift_note).trim() : null, clubUser?.id ?? null, id]
  );
  const userRow = await row<any>("SELECT push_token FROM users WHERE id = ?", [ban.user_id]);
  const title = `Access Restored — ${club.name}`;
  const body = lift_note ? String(lift_note).trim().slice(0, 200) : `Your booking access at ${club.name} has been restored.`;
  if (userRow?.push_token) {
    sendPushNotifications([{ to: userRow.push_token, sound: "default", title, body, data: { type: "club_ban_lifted", club_id: club.id } }]);
  }
  saveUserNotification(ban.user_id, "club_ban_lifted", title, body, { club_id: club.id, ban_id: id });
  res.json({ success: true });
});

// POST /portal/bans/:id/respond — respond to a golfer's appeal (lift or maintain)
router.post("/portal/bans/:id/respond", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const clubUser = (req as any).clubUser;
  const id = parseInt(String(req.params["id"] ?? "0"), 10);
  const { action, response_note } = req.body ?? {};
  if (!["lift", "maintain"].includes(action)) {
    res.status(400).json({ message: "action must be 'lift' or 'maintain'" });
    return;
  }
  const ban = await row<any>(
    "SELECT id, user_id, status FROM club_bans WHERE id = ? AND club_id = ?",
    [id, club.id]
  );
  if (!ban) { res.status(404).json({ message: "Ban not found" }); return; }
  if (ban.status !== "appealing") {
    res.status(409).json({ message: "This ban has no pending appeal." });
    return;
  }

  const note = response_note ? String(response_note).trim() : null;
  const userRow = await row<any>("SELECT push_token FROM users WHERE id = ?", [ban.user_id]);

  if (action === "lift") {
    await run(
      "UPDATE club_bans SET status = 'lifted', appeal_response = ?, lift_note = ?, lifted_at = NOW(), lifted_by = ? WHERE id = ?",
      [note, note, clubUser?.id ?? null, id]
    );
    const title = `Appeal Accepted — ${club.name}`;
    const body = note ?? `Your appeal at ${club.name} was accepted. Your booking access has been restored.`;
    if (userRow?.push_token) sendPushNotifications([{ to: userRow.push_token, sound: "default", title, body, data: { type: "club_ban_lifted", club_id: club.id } }]);
    saveUserNotification(ban.user_id, "club_ban_lifted", title, body, { club_id: club.id, ban_id: id });
  } else {
    await run(
      "UPDATE club_bans SET status = 'active', appeal_response = ? WHERE id = ?",
      [note, id]
    );
    const title = `Appeal Declined — ${club.name}`;
    const body = note ?? `Your appeal at ${club.name} was reviewed. The restriction on your booking access remains in place.`;
    if (userRow?.push_token) sendPushNotifications([{ to: userRow.push_token, sound: "default", title, body, data: { type: "club_ban", club_id: club.id } }]);
    saveUserNotification(ban.user_id, "club_ban", title, body, { club_id: club.id, ban_id: id });
  }
  res.json({ success: true });
});

export default router;
