import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { query, row, exec, run, withTransaction, clientQuery } from "../lib/pg";
import { generatePosToken, requirePosAuth, requirePosManager, getPosStaff } from "../lib/posAuth";
import { logger } from "../lib/logger";
import { postPosTransactionJournal } from "../lib/ledger-posting";

const router: IRouter = Router();

const SECRET = process.env["SESSION_SECRET"] ?? "tapingolf_club_portal_2026";

// ─── Club-admin auth (club token OR club_user token with admin role) ─────────
// Outlet management lives in the club portal — only the club account itself or
// a portal user with the admin role may create outlets and manager logins.

function verifyPortalToken(token: string): { clubId: number; isAdmin: boolean } | null {
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
    if (data.type === "club") return { clubId: data.sub, isAdmin: true };
    if (data.type === "club_user") return { clubId: data.sub, isAdmin: data.role === "admin" };
    return null;
  } catch {
    return null;
  }
}

async function requireClubAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization ?? "";
  if (!header.startsWith("Bearer ")) { res.status(401).json({ message: "Unauthorized" }); return; }
  const payload = verifyPortalToken(header.slice(7));
  if (!payload) { res.status(401).json({ message: "Invalid or expired token" }); return; }
  if (!payload.isAdmin) { res.status(403).json({ message: "Admin access required" }); return; }
  const club = await row<any>("SELECT id, name FROM clubs WHERE id = ? AND active = 1", [payload.clubId]);
  if (!club) { res.status(401).json({ message: "Club not found" }); return; }
  (req as any).club = club;
  next();
}

function getClub(req: Request): any { return (req as any).club; }

const OUTLET_TYPES = ["pro_shop", "bar", "restaurant"];

// ─── Club admin: outlets & manager accounts ──────────────────────────────────

router.get("/portal/pos/outlets", requireClubAdmin, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const outlets = await query<any>(
    `SELECT o.id, o.name, o.type, o.active, o.service_fee_percent, o.created_at,
       (SELECT COUNT(*)::int FROM pos_staff s WHERE s.outlet_id = o.id AND s.active = 1) AS staff_count,
       (SELECT COUNT(*)::int FROM pos_products p WHERE p.outlet_id = o.id AND p.active = 1) AS product_count
     FROM pos_outlets o WHERE o.club_id = ? ORDER BY o.id`,
    [club.id]
  );
  res.json({ outlets: outlets.map(o => ({ ...o, service_fee_percent: Number(o.service_fee_percent ?? 0) })) });
});

router.post("/portal/pos/outlets", requireClubAdmin, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const name = String(req.body?.name ?? "").trim();
  const type = String(req.body?.type ?? "");
  if (!name) { res.status(400).json({ message: "Outlet name is required" }); return; }
  if (!OUTLET_TYPES.includes(type)) { res.status(400).json({ message: "Type must be pro_shop, bar or restaurant" }); return; }
  const id = await exec("INSERT INTO pos_outlets (club_id, name, type) VALUES (?, ?, ?)", [club.id, name, type]);
  res.status(201).json({ id, name, type, active: 1 });
});

router.put("/portal/pos/outlets/:id", requireClubAdmin, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const id = parseInt(String(req.params["id"] ?? ""), 10);
  const outlet = await row<any>("SELECT id FROM pos_outlets WHERE id = ? AND club_id = ?", [id, club.id]);
  if (!outlet) { res.status(404).json({ message: "Outlet not found" }); return; }
  const { name, active, service_fee_percent } = req.body ?? {};
  let feePercent: number | null = null;
  if (service_fee_percent != null) {
    feePercent = Number(service_fee_percent);
    if (!Number.isFinite(feePercent) || feePercent < 0 || feePercent > 100) {
      res.status(400).json({ message: "Service fee must be between 0 and 100 percent" }); return;
    }
    feePercent = Math.round(feePercent * 100) / 100;
  }
  await run(
    "UPDATE pos_outlets SET name = COALESCE(?, name), active = COALESCE(?, active), service_fee_percent = COALESCE(?, service_fee_percent) WHERE id = ?",
    [name != null ? String(name).trim() : null, active != null ? (active ? 1 : 0) : null, feePercent, id]
  );
  res.json({ success: true });
});

router.get("/portal/pos/outlets/:id/staff", requireClubAdmin, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const id = parseInt(String(req.params["id"] ?? ""), 10);
  const outlet = await row<any>("SELECT id FROM pos_outlets WHERE id = ? AND club_id = ?", [id, club.id]);
  if (!outlet) { res.status(404).json({ message: "Outlet not found" }); return; }
  const staff = await query<any>(
    "SELECT id, name, email, role, active, created_at FROM pos_staff WHERE outlet_id = ? ORDER BY role, name",
    [id]
  );
  res.json({ staff });
});

router.post("/portal/pos/outlets/:id/staff", requireClubAdmin, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const id = parseInt(String(req.params["id"] ?? ""), 10);
  const outlet = await row<any>("SELECT id FROM pos_outlets WHERE id = ? AND club_id = ?", [id, club.id]);
  if (!outlet) { res.status(404).json({ message: "Outlet not found" }); return; }
  const name = String(req.body?.name ?? "").trim();
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  const role = String(req.body?.role ?? "manager");
  if (role !== "manager" && role !== "waiter") { res.status(400).json({ message: "Role must be manager or waiter" }); return; }
  // Managers need an email login; waiters only need a name and a terminal PIN.
  if (role === "manager") {
    if (!name || !email || !password) { res.status(400).json({ message: "Name, email and password are required" }); return; }
    if (password.length < 6) { res.status(400).json({ message: "Password must be at least 6 characters" }); return; }
    const existing = await row<any>("SELECT id FROM pos_staff WHERE email = ?", [email]);
    if (existing) { res.status(409).json({ message: "An outlet account with this email already exists" }); return; }
  } else {
    if (!name || !password) { res.status(400).json({ message: "Name and PIN are required" }); return; }
    if (password.length < 4) { res.status(400).json({ message: "PIN must be at least 4 characters" }); return; }
  }
  const hash = await bcrypt.hash(password, 10);
  const staffId = await exec(
    "INSERT INTO pos_staff (outlet_id, club_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)",
    [id, club.id, name, role === "manager" ? email : null, hash, role]
  );
  res.status(201).json({ id: staffId, name, email: role === "manager" ? email : null, role, active: 1 });
});

router.put("/portal/pos/staff/:id", requireClubAdmin, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const id = parseInt(String(req.params["id"] ?? ""), 10);
  const staff = await row<any>("SELECT id, role FROM pos_staff WHERE id = ? AND club_id = ?", [id, club.id]);
  if (!staff) { res.status(404).json({ message: "Staff member not found" }); return; }
  const { active, password, name } = req.body ?? {};
  if (password != null) {
    const minLen = staff.role === "manager" ? 6 : 4;
    if (String(password).length < minLen) {
      res.status(400).json({ message: staff.role === "manager" ? "Password must be at least 6 characters" : "PIN must be at least 4 characters" });
      return;
    }
    const hash = await bcrypt.hash(String(password), 10);
    await run("UPDATE pos_staff SET password_hash = ? WHERE id = ?", [hash, id]);
  }
  await run(
    "UPDATE pos_staff SET active = COALESCE(?, active), name = COALESCE(?, name) WHERE id = ?",
    [active != null ? (active ? 1 : 0) : null, name != null ? String(name).trim() : null, id]
  );
  res.json({ success: true });
});

// ─── POS staff auth ──────────────────────────────────────────────────────────

router.post("/pos/auth/login", async (req: Request, res: Response): Promise<void> => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  if (!email || !password) { res.status(400).json({ message: "Email and password required" }); return; }
  // Only managers open the terminal session — waiters/cashiers unlock on the
  // terminal itself with their PIN or fingerprint (see /pos/waiters below).
  const staff = await row<any>(
    `SELECT s.id, s.outlet_id, s.club_id, s.name, s.email, s.password_hash, s.role, s.active,
            o.name AS outlet_name, o.type AS outlet_type, o.active AS outlet_active,
            c.name AS club_name
     FROM pos_staff s
     JOIN pos_outlets o ON o.id = s.outlet_id
     JOIN clubs c ON c.id = s.club_id
     WHERE s.email = ? AND s.role = 'manager' LIMIT 1`,
    [email]
  );
  if (!staff || !staff.active || !staff.outlet_active) { res.status(401).json({ message: "Invalid credentials" }); return; }
  const valid = await bcrypt.compare(password, staff.password_hash);
  if (!valid) { res.status(401).json({ message: "Invalid credentials" }); return; }
  const token = generatePosToken(staff.id, staff.outlet_id, staff.club_id, staff.role);
  res.json({
    token,
    staff: { id: staff.id, name: staff.name, email: staff.email, role: staff.role },
    outlet: { id: staff.outlet_id, name: staff.outlet_name, type: staff.outlet_type, club_name: staff.club_name },
  });
});

router.get("/pos/me", requirePosAuth, async (req: Request, res: Response): Promise<void> => {
  const s = getPosStaff(req);
  const club = await row<any>("SELECT name FROM clubs WHERE id = ?", [s.club_id]);
  res.json({
    staff: { id: s.id, name: s.name, email: s.email, role: s.role },
    outlet: { id: s.outlet_id, name: s.outlet_name, type: s.outlet_type, club_name: club?.name ?? "" },
  });
});

// ─── Waiter terminal unlock (PIN + fingerprint) ──────────────────────────────
// The terminal stays signed in with the manager's outlet session. Staff are
// listed by name; each one unlocks with their personal PIN or a registered
// fingerprint (WebAuthn platform authenticator). Unlocking returns a
// short-lived pos_staff token for that person, so orders/sales are recorded
// against the waiter who actually performed them.

const WAITER_TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // one shift

// WebAuthn challenges are single-use and short-lived; an in-memory store is
// fine for the single-process API server.
const webauthnChallenges = new Map<string, { challenge: string; exp: number }>();
function putChallenge(key: string, challenge: string): void {
  webauthnChallenges.set(key, { challenge, exp: Date.now() + 5 * 60 * 1000 });
}
function takeChallenge(key: string): string | null {
  const entry = webauthnChallenges.get(key);
  webauthnChallenges.delete(key);
  if (!entry || entry.exp < Date.now()) return null;
  return entry.challenge;
}

// WebAuthn is origin-bound by the browser; derive rpID/origin from the request
// so the flow works on both the rotating dev domain and production.
function webauthnRp(req: Request): { rpID: string; origin: string } | null {
  const origin = String(req.headers.origin ?? "");
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:" && url.hostname !== "localhost") return null;
    return { rpID: url.hostname, origin };
  } catch {
    return null;
  }
}

router.get("/pos/waiters", requirePosAuth, async (req: Request, res: Response): Promise<void> => {
  const s = getPosStaff(req);
  const staff = await query<any>(
    `SELECT st.id, st.name, st.role,
            EXISTS (SELECT 1 FROM pos_webauthn_credentials w WHERE w.staff_id = st.id) AS has_fingerprint
     FROM pos_staff st
     WHERE st.outlet_id = ? AND st.active = 1
     ORDER BY st.role, st.name`,
    [s.outlet_id]
  );
  res.json({ staff });
});

// Any unlocked staff member can see their own tips for today (SA time).
// Tips are attributed the same way as the manager report: the waiter who
// served the table (opened_by), falling back to whoever took the payment.
router.get("/pos/my-tips", requirePosAuth, async (req: Request, res: Response): Promise<void> => {
  const s = getPosStaff(req);
  const totals = await row<any>(
    `SELECT COUNT(*)::int AS orders,
            COALESCE(SUM(o.tip_amount), 0) AS tips,
            COALESCE(SUM(o.service_fee), 0) AS service_fees,
            COALESCE(SUM(o.tip_amount + o.service_fee), 0) AS total_tips
     FROM pos_orders o
     WHERE o.outlet_id = ? AND o.status = 'paid'
       AND COALESCE(o.opened_by, o.closed_by) = ?
       AND (o.tip_amount > 0 OR o.service_fee > 0)
       AND (o.paid_at AT TIME ZONE 'UTC' + INTERVAL '2 hours')::date
           = (NOW() AT TIME ZONE 'UTC' + INTERVAL '2 hours')::date`,
    [s.outlet_id, s.id]
  );
  res.json({
    orders: totals?.orders ?? 0,
    tips: Number(totals?.tips ?? 0),
    service_fees: Number(totals?.service_fees ?? 0),
    total_tips: Number(totals?.total_tips ?? 0),
  });
});

// Brute-force protection for PIN unlocks: after 5 consecutive failures for a
// staff member, further attempts are rejected for 60 seconds.
const pinAttempts = new Map<number, { count: number; lockedUntil: number }>();
const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCKOUT_MS = 60 * 1000;

router.post("/pos/waiters/:id/unlock", requirePosAuth, async (req: Request, res: Response): Promise<void> => {
  const s = getPosStaff(req);
  const id = parseInt(String(req.params["id"] ?? ""), 10);
  const password = String(req.body?.password ?? "");
  if (!password) { res.status(400).json({ message: "PIN required" }); return; }
  const target = await row<any>(
    "SELECT id, outlet_id, club_id, name, role, password_hash, active FROM pos_staff WHERE id = ? AND outlet_id = ?",
    [id, s.outlet_id]
  );
  if (!target || !target.active) { res.status(404).json({ message: "Staff member not found" }); return; }
  const attempts = pinAttempts.get(target.id);
  if (attempts && attempts.lockedUntil > Date.now()) {
    const waitSec = Math.ceil((attempts.lockedUntil - Date.now()) / 1000);
    res.status(429).json({ message: `Too many attempts — try again in ${waitSec}s` });
    return;
  }
  const valid = await bcrypt.compare(password, target.password_hash);
  if (!valid) {
    const count = (attempts && attempts.lockedUntil <= Date.now() && attempts.count >= PIN_MAX_ATTEMPTS ? 0 : attempts?.count ?? 0) + 1;
    pinAttempts.set(target.id, { count, lockedUntil: count >= PIN_MAX_ATTEMPTS ? Date.now() + PIN_LOCKOUT_MS : 0 });
    res.status(401).json({ message: "Incorrect PIN" });
    return;
  }
  pinAttempts.delete(target.id);
  const token = generatePosToken(target.id, target.outlet_id, target.club_id, target.role, WAITER_TOKEN_TTL_MS);
  res.json({ token, staff: { id: target.id, name: target.name, role: target.role } });
});

// Fingerprint registration — only the unlocked person may register their own
// fingerprint (the caller's token must belong to the staff member).
router.post("/pos/waiters/webauthn/register/options", requirePosAuth, async (req: Request, res: Response): Promise<void> => {
  const s = getPosStaff(req);
  const rp = webauthnRp(req);
  if (!rp) { res.status(400).json({ message: "Fingerprint sign-in requires a secure (https) connection" }); return; }
  const existing = await query<any>("SELECT credential_id FROM pos_webauthn_credentials WHERE staff_id = ?", [s.id]);
  const options = await generateRegistrationOptions({
    rpName: "TapIn Golf POS",
    rpID: rp.rpID,
    userName: s.name,
    userDisplayName: s.name,
    userID: Buffer.from(`pos-staff-${s.id}`),
    attestationType: "none",
    excludeCredentials: existing.map((c: any) => ({ id: c.credential_id })),
    authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
  });
  putChallenge(`reg:${s.id}`, options.challenge);
  res.json(options);
});

router.post("/pos/waiters/webauthn/register/verify", requirePosAuth, async (req: Request, res: Response): Promise<void> => {
  const s = getPosStaff(req);
  const rp = webauthnRp(req);
  if (!rp) { res.status(400).json({ message: "Fingerprint sign-in requires a secure (https) connection" }); return; }
  const expectedChallenge = takeChallenge(`reg:${s.id}`);
  if (!expectedChallenge) { res.status(400).json({ message: "Registration expired — try again" }); return; }
  try {
    const verification = await verifyRegistrationResponse({
      response: req.body,
      expectedChallenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      requireUserVerification: true,
    });
    if (!verification.verified || !verification.registrationInfo) {
      res.status(400).json({ message: "Fingerprint could not be verified" });
      return;
    }
    const cred = verification.registrationInfo.credential;
    await run(
      "INSERT INTO pos_webauthn_credentials (staff_id, credential_id, public_key, counter, transports) VALUES (?, ?, ?, ?, ?) ON CONFLICT (credential_id) DO NOTHING",
      [s.id, cred.id, Buffer.from(cred.publicKey).toString("base64url"), cred.counter, JSON.stringify(cred.transports ?? [])]
    );
    res.json({ success: true });
  } catch (err: any) {
    logger.warn({ err, staffId: s.id }, "POS fingerprint registration failed");
    res.status(400).json({ message: "Fingerprint registration failed" });
  }
});

// Fingerprint unlock — any signed-in terminal may request options for a staff
// member of the same outlet; verification returns that person's waiter token.
router.post("/pos/waiters/:id/webauthn/options", requirePosAuth, async (req: Request, res: Response): Promise<void> => {
  const s = getPosStaff(req);
  const id = parseInt(String(req.params["id"] ?? ""), 10);
  const rp = webauthnRp(req);
  if (!rp) { res.status(400).json({ message: "Fingerprint sign-in requires a secure (https) connection" }); return; }
  const target = await row<any>("SELECT id, active FROM pos_staff WHERE id = ? AND outlet_id = ?", [id, s.outlet_id]);
  if (!target || !target.active) { res.status(404).json({ message: "Staff member not found" }); return; }
  const creds = await query<any>("SELECT credential_id, transports FROM pos_webauthn_credentials WHERE staff_id = ?", [id]);
  if (creds.length === 0) { res.status(404).json({ message: "No fingerprint registered" }); return; }
  const options = await generateAuthenticationOptions({
    rpID: rp.rpID,
    userVerification: "required",
    allowCredentials: creds.map((c: any) => ({
      id: c.credential_id,
      transports: c.transports ? JSON.parse(c.transports) : undefined,
    })),
  });
  putChallenge(`auth:${s.outlet_id}:${id}`, options.challenge);
  res.json(options);
});

router.post("/pos/waiters/:id/webauthn/verify", requirePosAuth, async (req: Request, res: Response): Promise<void> => {
  const s = getPosStaff(req);
  const id = parseInt(String(req.params["id"] ?? ""), 10);
  const rp = webauthnRp(req);
  if (!rp) { res.status(400).json({ message: "Fingerprint sign-in requires a secure (https) connection" }); return; }
  const target = await row<any>(
    "SELECT id, outlet_id, club_id, name, role, active FROM pos_staff WHERE id = ? AND outlet_id = ?",
    [id, s.outlet_id]
  );
  if (!target || !target.active) { res.status(404).json({ message: "Staff member not found" }); return; }
  const expectedChallenge = takeChallenge(`auth:${s.outlet_id}:${id}`);
  if (!expectedChallenge) { res.status(400).json({ message: "Fingerprint sign-in expired — try again" }); return; }
  const credentialId = String(req.body?.id ?? "");
  const cred = await row<any>(
    "SELECT id, credential_id, public_key, counter, transports FROM pos_webauthn_credentials WHERE credential_id = ? AND staff_id = ?",
    [credentialId, id]
  );
  if (!cred) { res.status(400).json({ message: "Unknown fingerprint" }); return; }
  try {
    const verification = await verifyAuthenticationResponse({
      response: req.body,
      expectedChallenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      requireUserVerification: true,
      credential: {
        id: cred.credential_id,
        publicKey: Buffer.from(cred.public_key, "base64url"),
        counter: Number(cred.counter),
        transports: cred.transports ? JSON.parse(cred.transports) : undefined,
      },
    });
    if (!verification.verified) { res.status(401).json({ message: "Fingerprint not recognised" }); return; }
    await run("UPDATE pos_webauthn_credentials SET counter = ? WHERE id = ?", [verification.authenticationInfo.newCounter, cred.id]);
    const token = generatePosToken(target.id, target.outlet_id, target.club_id, target.role, WAITER_TOKEN_TTL_MS);
    res.json({ token, staff: { id: target.id, name: target.name, role: target.role } });
  } catch (err: any) {
    logger.warn({ err, staffId: id }, "POS fingerprint unlock failed");
    res.status(401).json({ message: "Fingerprint not recognised" });
  }
});

// Managers may remove a staff member's registered fingerprints (lost device,
// re-registration on a new scanner, etc.).
router.delete("/pos/staff/:id/fingerprints", requirePosAuth, requirePosManager, async (req: Request, res: Response): Promise<void> => {
  const s = getPosStaff(req);
  const id = parseInt(String(req.params["id"] ?? ""), 10);
  const target = await row<any>("SELECT id FROM pos_staff WHERE id = ? AND outlet_id = ?", [id, s.outlet_id]);
  if (!target) { res.status(404).json({ message: "Staff member not found" }); return; }
  await run("DELETE FROM pos_webauthn_credentials WHERE staff_id = ?", [id]);
  res.json({ success: true });
});

// ─── Categories ──────────────────────────────────────────────────────────────

router.get("/pos/categories", requirePosAuth, async (req: Request, res: Response): Promise<void> => {
  const s = getPosStaff(req);
  const categories = await query<any>(
    "SELECT id, name, sort_order FROM pos_categories WHERE outlet_id = ? ORDER BY sort_order, name",
    [s.outlet_id]
  );
  res.json({ categories });
});

router.post("/pos/categories", requirePosAuth, requirePosManager, async (req: Request, res: Response): Promise<void> => {
  const s = getPosStaff(req);
  const name = String(req.body?.name ?? "").trim();
  if (!name) { res.status(400).json({ message: "Category name is required" }); return; }
  const sortOrder = Number(req.body?.sort_order ?? 0) || 0;
  const id = await exec("INSERT INTO pos_categories (outlet_id, name, sort_order) VALUES (?, ?, ?)", [s.outlet_id, name, sortOrder]);
  res.status(201).json({ id, name, sort_order: sortOrder });
});

router.put("/pos/categories/:id", requirePosAuth, requirePosManager, async (req: Request, res: Response): Promise<void> => {
  const s = getPosStaff(req);
  const id = parseInt(String(req.params["id"] ?? ""), 10);
  const cat = await row<any>("SELECT id FROM pos_categories WHERE id = ? AND outlet_id = ?", [id, s.outlet_id]);
  if (!cat) { res.status(404).json({ message: "Category not found" }); return; }
  const { name, sort_order } = req.body ?? {};
  await run(
    "UPDATE pos_categories SET name = COALESCE(?, name), sort_order = COALESCE(?, sort_order) WHERE id = ?",
    [name != null ? String(name).trim() : null, sort_order != null ? Number(sort_order) : null, id]
  );
  res.json({ success: true });
});

router.delete("/pos/categories/:id", requirePosAuth, requirePosManager, async (req: Request, res: Response): Promise<void> => {
  const s = getPosStaff(req);
  const id = parseInt(String(req.params["id"] ?? ""), 10);
  const deleted = await run("DELETE FROM pos_categories WHERE id = ? AND outlet_id = ?", [id, s.outlet_id]);
  if (!deleted) { res.status(404).json({ message: "Category not found" }); return; }
  res.json({ success: true });
});

// ─── Products & variants ─────────────────────────────────────────────────────

async function productWithVariants(productId: number): Promise<any | null> {
  const product = await row<any>(
    `SELECT p.*, c.name AS category_name FROM pos_products p
     LEFT JOIN pos_categories c ON c.id = p.category_id
     WHERE p.id = ?`,
    [productId]
  );
  if (!product) return null;
  const variants = await query<any>(
    "SELECT id, size, colour, barcode, sku, price, stock_qty, active FROM pos_variants WHERE product_id = ? AND active = 1 ORDER BY id",
    [productId]
  );
  return { ...product, price: Number(product.price), variants: variants.map(v => ({ ...v, price: v.price != null ? Number(v.price) : null })) };
}

router.get("/pos/products", requirePosAuth, async (req: Request, res: Response): Promise<void> => {
  const s = getPosStaff(req);
  const search = String(req.query["search"] ?? "").trim().toLowerCase();
  const categoryId = req.query["category_id"] ? parseInt(String(req.query["category_id"]), 10) : null;
  const includeInactive = req.query["include_inactive"] === "1" && s.role === "manager";

  const conditions = ["p.outlet_id = ?"];
  const params: any[] = [s.outlet_id];
  if (!includeInactive) conditions.push("p.active = 1");
  if (categoryId) { conditions.push("p.category_id = ?"); params.push(categoryId); }
  if (search) {
    conditions.push("(LOWER(p.name) LIKE ? OR LOWER(COALESCE(p.brand,'')) LIKE ? OR p.barcode = ? OR LOWER(COALESCE(p.sku,'')) = ?)");
    params.push(`%${search}%`, `%${search}%`, search, search);
  }
  const products = await query<any>(
    `SELECT p.id, p.category_id, p.name, p.brand, p.description, p.price, p.barcode, p.sku,
            p.stock_qty, p.low_stock_threshold, p.has_variants, p.active, c.name AS category_name
     FROM pos_products p
     LEFT JOIN pos_categories c ON c.id = p.category_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY p.name`,
    params
  );
  const ids = products.map(p => p.id);
  let variantsByProduct: Record<number, any[]> = {};
  if (ids.length > 0) {
    const variants = await query<any>(
      `SELECT id, product_id, size, colour, barcode, sku, price, stock_qty
       FROM pos_variants WHERE product_id IN (${ids.map(() => "?").join(",")}) AND active = 1 ORDER BY id`,
      ids
    );
    for (const v of variants) {
      (variantsByProduct[v.product_id] ??= []).push({ ...v, price: v.price != null ? Number(v.price) : null });
    }
  }
  res.json({
    products: products.map(p => ({
      ...p,
      price: Number(p.price),
      variants: variantsByProduct[p.id] ?? [],
      total_stock: p.has_variants
        ? (variantsByProduct[p.id] ?? []).reduce((sum: number, v: any) => sum + v.stock_qty, 0)
        : p.stock_qty,
    })),
  });
});

router.get("/pos/products/lookup", requirePosAuth, async (req: Request, res: Response): Promise<void> => {
  const s = getPosStaff(req);
  const barcode = String(req.query["barcode"] ?? "").trim();
  if (!barcode) { res.status(400).json({ message: "barcode is required" }); return; }

  // Try variant barcode first (pro shop items), then product barcode
  const variant = await row<any>(
    `SELECT v.id AS variant_id, v.size, v.colour, v.barcode, v.sku, v.price AS variant_price, v.stock_qty AS variant_stock,
            p.id AS product_id, p.name, p.brand, p.price AS product_price, p.category_id
     FROM pos_variants v
     JOIN pos_products p ON p.id = v.product_id
     WHERE (v.barcode = ? OR v.sku = ?) AND p.outlet_id = ? AND v.active = 1 AND p.active = 1
     LIMIT 1`,
    [barcode, barcode, s.outlet_id]
  );
  if (variant) {
    res.json({
      found: true,
      product_id: variant.product_id,
      variant_id: variant.variant_id,
      name: variant.name,
      brand: variant.brand,
      variant_label: [variant.size, variant.colour].filter(Boolean).join(" / "),
      price: Number(variant.variant_price ?? variant.product_price),
      stock_qty: variant.variant_stock,
    });
    return;
  }
  const product = await row<any>(
    `SELECT id, name, brand, price, stock_qty, has_variants FROM pos_products
     WHERE (barcode = ? OR sku = ?) AND outlet_id = ? AND active = 1 LIMIT 1`,
    [barcode, barcode, s.outlet_id]
  );
  if (product) {
    if (product.has_variants) {
      const full = await productWithVariants(product.id);
      res.json({ found: true, needs_variant: true, product: full });
      return;
    }
    res.json({
      found: true,
      product_id: product.id,
      variant_id: null,
      name: product.name,
      brand: product.brand,
      variant_label: null,
      price: Number(product.price),
      stock_qty: product.stock_qty,
    });
    return;
  }
  res.json({ found: false });
});

router.post("/pos/products", requirePosAuth, requirePosManager, async (req: Request, res: Response): Promise<void> => {
  const s = getPosStaff(req);
  const { name, brand, description, price, barcode, sku, stock_qty, low_stock_threshold, category_id, variants } = req.body ?? {};
  const nameStr = String(name ?? "").trim();
  if (!nameStr) { res.status(400).json({ message: "Product name is required" }); return; }
  const priceNum = Number(price);
  if (!Number.isFinite(priceNum) || priceNum < 0) { res.status(400).json({ message: "A valid price is required" }); return; }
  if (category_id != null) {
    const cat = await row<any>("SELECT id FROM pos_categories WHERE id = ? AND outlet_id = ?", [category_id, s.outlet_id]);
    if (!cat) { res.status(400).json({ message: "Invalid category" }); return; }
  }
  const hasVariants = Array.isArray(variants) && variants.length > 0;
  const productId = await exec(
    `INSERT INTO pos_products (outlet_id, category_id, name, brand, description, price, barcode, sku, stock_qty, low_stock_threshold, has_variants)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [s.outlet_id, category_id ?? null, nameStr, brand ? String(brand).trim() : null, description ?? null,
     priceNum, barcode ? String(barcode).trim() : null, sku ? String(sku).trim() : null,
     hasVariants ? 0 : Math.max(0, Math.round(Number(stock_qty) || 0)),
     Math.max(0, Math.round(Number(low_stock_threshold) || 5)), hasVariants ? 1 : 0]
  );
  if (hasVariants) {
    for (const v of variants) {
      await exec(
        "INSERT INTO pos_variants (product_id, size, colour, barcode, sku, price, stock_qty) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [productId, v.size ? String(v.size).trim() : null, v.colour ? String(v.colour).trim() : null,
         v.barcode ? String(v.barcode).trim() : null, v.sku ? String(v.sku).trim() : null,
         v.price != null && v.price !== "" ? Number(v.price) : null, Math.max(0, Math.round(Number(v.stock_qty) || 0))]
      );
    }
  }
  const full = await productWithVariants(productId);
  res.status(201).json(full);
});

router.put("/pos/products/:id", requirePosAuth, requirePosManager, async (req: Request, res: Response): Promise<void> => {
  const s = getPosStaff(req);
  const id = parseInt(String(req.params["id"] ?? ""), 10);
  const product = await row<any>("SELECT id, has_variants FROM pos_products WHERE id = ? AND outlet_id = ?", [id, s.outlet_id]);
  if (!product) { res.status(404).json({ message: "Product not found" }); return; }
  const { name, brand, description, price, barcode, sku, stock_qty, low_stock_threshold, category_id, active, variants } = req.body ?? {};
  if (category_id != null) {
    const cat = await row<any>("SELECT id FROM pos_categories WHERE id = ? AND outlet_id = ?", [category_id, s.outlet_id]);
    if (!cat) { res.status(400).json({ message: "Invalid category" }); return; }
  }
  await run(
    `UPDATE pos_products SET
       name = COALESCE(?, name), brand = ?, description = ?,
       price = COALESCE(?, price), barcode = ?, sku = ?,
       stock_qty = COALESCE(?, stock_qty), low_stock_threshold = COALESCE(?, low_stock_threshold),
       category_id = ?, active = COALESCE(?, active)
     WHERE id = ?`,
    [name != null ? String(name).trim() : null,
     brand !== undefined ? (brand ? String(brand).trim() : null) : null,
     description !== undefined ? (description || null) : null,
     price != null ? Number(price) : null,
     barcode !== undefined ? (barcode ? String(barcode).trim() : null) : null,
     sku !== undefined ? (sku ? String(sku).trim() : null) : null,
     product.has_variants ? null : (stock_qty != null ? Math.max(0, Math.round(Number(stock_qty))) : null),
     low_stock_threshold != null ? Math.max(0, Math.round(Number(low_stock_threshold))) : null,
     category_id ?? null,
     active != null ? (active ? 1 : 0) : null,
     id]
  );
  if (Array.isArray(variants)) {
    const keepIds: number[] = [];
    for (const v of variants) {
      if (v.id) {
        const existing = await row<any>("SELECT id FROM pos_variants WHERE id = ? AND product_id = ?", [v.id, id]);
        if (!existing) continue;
        await run(
          "UPDATE pos_variants SET size = ?, colour = ?, barcode = ?, sku = ?, price = ?, stock_qty = COALESCE(?, stock_qty) WHERE id = ?",
          [v.size ? String(v.size).trim() : null, v.colour ? String(v.colour).trim() : null,
           v.barcode ? String(v.barcode).trim() : null, v.sku ? String(v.sku).trim() : null,
           v.price != null && v.price !== "" ? Number(v.price) : null,
           v.stock_qty != null ? Math.max(0, Math.round(Number(v.stock_qty))) : null, v.id]
        );
        keepIds.push(v.id);
      } else {
        const newId = await exec(
          "INSERT INTO pos_variants (product_id, size, colour, barcode, sku, price, stock_qty) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [id, v.size ? String(v.size).trim() : null, v.colour ? String(v.colour).trim() : null,
           v.barcode ? String(v.barcode).trim() : null, v.sku ? String(v.sku).trim() : null,
           v.price != null && v.price !== "" ? Number(v.price) : null, Math.max(0, Math.round(Number(v.stock_qty) || 0))]
        );
        keepIds.push(newId);
      }
    }
    // Soft-deactivate removed variants (they may be referenced by past sales)
    if (keepIds.length > 0) {
      await run(
        `UPDATE pos_variants SET active = 0 WHERE product_id = ? AND id NOT IN (${keepIds.map(() => "?").join(",")})`,
        [id, ...keepIds]
      );
    } else {
      await run("UPDATE pos_variants SET active = 0 WHERE product_id = ?", [id]);
    }
    await run("UPDATE pos_products SET has_variants = ? WHERE id = ?", [keepIds.length > 0 ? 1 : 0, id]);
  }
  const full = await productWithVariants(id);
  res.json(full);
});

router.delete("/pos/products/:id", requirePosAuth, requirePosManager, async (req: Request, res: Response): Promise<void> => {
  const s = getPosStaff(req);
  const id = parseInt(String(req.params["id"] ?? ""), 10);
  const updated = await run("UPDATE pos_products SET active = 0 WHERE id = ? AND outlet_id = ?", [id, s.outlet_id]);
  if (!updated) { res.status(404).json({ message: "Product not found" }); return; }
  res.json({ success: true });
});

router.post("/pos/products/:id/adjust-stock", requirePosAuth, requirePosManager, async (req: Request, res: Response): Promise<void> => {
  const s = getPosStaff(req);
  const id = parseInt(String(req.params["id"] ?? ""), 10);
  const product = await row<any>("SELECT id, has_variants FROM pos_products WHERE id = ? AND outlet_id = ?", [id, s.outlet_id]);
  if (!product) { res.status(404).json({ message: "Product not found" }); return; }
  const change = Math.round(Number(req.body?.change));
  if (!Number.isFinite(change) || change === 0) { res.status(400).json({ message: "A non-zero change is required" }); return; }
  const variantId = req.body?.variant_id ? parseInt(String(req.body.variant_id), 10) : null;
  if (product.has_variants) {
    if (!variantId) { res.status(400).json({ message: "variant_id is required for this product" }); return; }
    const variant = await row<any>("SELECT id FROM pos_variants WHERE id = ? AND product_id = ?", [variantId, id]);
    if (!variant) { res.status(404).json({ message: "Variant not found" }); return; }
    await run("UPDATE pos_variants SET stock_qty = stock_qty + ? WHERE id = ?", [change, variantId]);
  } else {
    await run("UPDATE pos_products SET stock_qty = stock_qty + ? WHERE id = ?", [change, id]);
  }
  await exec(
    "INSERT INTO pos_stock_movements (outlet_id, product_id, variant_id, change, reason, created_by) VALUES (?, ?, ?, ?, 'adjustment', ?)",
    [s.outlet_id, id, variantId, change, s.id]
  );
  res.json({ success: true });
});

// ─── Suppliers ───────────────────────────────────────────────────────────────

router.get("/pos/suppliers", requirePosAuth, requirePosManager, async (req: Request, res: Response): Promise<void> => {
  const s = getPosStaff(req);
  const suppliers = await query<any>(
    "SELECT id, name, contact_name, email, phone, notes, active FROM pos_suppliers WHERE outlet_id = ? ORDER BY name",
    [s.outlet_id]
  );
  res.json({ suppliers });
});

router.post("/pos/suppliers", requirePosAuth, requirePosManager, async (req: Request, res: Response): Promise<void> => {
  const s = getPosStaff(req);
  const name = String(req.body?.name ?? "").trim();
  if (!name) { res.status(400).json({ message: "Supplier name is required" }); return; }
  const { contact_name, email, phone, notes } = req.body ?? {};
  const id = await exec(
    "INSERT INTO pos_suppliers (outlet_id, name, contact_name, email, phone, notes) VALUES (?, ?, ?, ?, ?, ?)",
    [s.outlet_id, name, contact_name || null, email || null, phone || null, notes || null]
  );
  res.status(201).json({ id, name });
});

router.put("/pos/suppliers/:id", requirePosAuth, requirePosManager, async (req: Request, res: Response): Promise<void> => {
  const s = getPosStaff(req);
  const id = parseInt(String(req.params["id"] ?? ""), 10);
  const supplier = await row<any>("SELECT id FROM pos_suppliers WHERE id = ? AND outlet_id = ?", [id, s.outlet_id]);
  if (!supplier) { res.status(404).json({ message: "Supplier not found" }); return; }
  const { name, contact_name, email, phone, notes, active } = req.body ?? {};
  await run(
    `UPDATE pos_suppliers SET name = COALESCE(?, name), contact_name = ?, email = ?, phone = ?, notes = ?,
       active = COALESCE(?, active) WHERE id = ?`,
    [name != null ? String(name).trim() : null, contact_name || null, email || null, phone || null, notes || null,
     active != null ? (active ? 1 : 0) : null, id]
  );
  res.json({ success: true });
});

// ─── Stock orders ────────────────────────────────────────────────────────────

router.get("/pos/stock-orders", requirePosAuth, requirePosManager, async (req: Request, res: Response): Promise<void> => {
  const s = getPosStaff(req);
  const orders = await query<any>(
    `SELECT so.id, so.status, so.notes, so.created_at, so.received_at,
            sup.name AS supplier_name, st.name AS created_by_name,
            (SELECT COUNT(*)::int FROM pos_stock_order_items i WHERE i.stock_order_id = so.id) AS item_count,
            (SELECT COALESCE(SUM(i.quantity * i.unit_cost), 0) FROM pos_stock_order_items i WHERE i.stock_order_id = so.id) AS total_cost
     FROM pos_stock_orders so
     JOIN pos_suppliers sup ON sup.id = so.supplier_id
     LEFT JOIN pos_staff st ON st.id = so.created_by
     WHERE so.outlet_id = ?
     ORDER BY so.created_at DESC LIMIT 200`,
    [s.outlet_id]
  );
  res.json({ orders: orders.map(o => ({ ...o, total_cost: Number(o.total_cost) })) });
});

router.get("/pos/stock-orders/:id", requirePosAuth, requirePosManager, async (req: Request, res: Response): Promise<void> => {
  const s = getPosStaff(req);
  const id = parseInt(String(req.params["id"] ?? ""), 10);
  const order = await row<any>(
    `SELECT so.*, sup.name AS supplier_name FROM pos_stock_orders so
     JOIN pos_suppliers sup ON sup.id = so.supplier_id
     WHERE so.id = ? AND so.outlet_id = ?`,
    [id, s.outlet_id]
  );
  if (!order) { res.status(404).json({ message: "Stock order not found" }); return; }
  const items = await query<any>(
    `SELECT i.id, i.product_id, i.variant_id, i.quantity, i.unit_cost,
            p.name AS product_name, v.size, v.colour
     FROM pos_stock_order_items i
     JOIN pos_products p ON p.id = i.product_id
     LEFT JOIN pos_variants v ON v.id = i.variant_id
     WHERE i.stock_order_id = ? ORDER BY i.id`,
    [id]
  );
  res.json({
    ...order,
    items: items.map(i => ({
      ...i,
      unit_cost: Number(i.unit_cost),
      variant_label: [i.size, i.colour].filter(Boolean).join(" / ") || null,
    })),
  });
});

router.post("/pos/stock-orders", requirePosAuth, requirePosManager, async (req: Request, res: Response): Promise<void> => {
  const s = getPosStaff(req);
  const supplierId = parseInt(String(req.body?.supplier_id ?? ""), 10);
  const items = req.body?.items;
  if (!supplierId) { res.status(400).json({ message: "supplier_id is required" }); return; }
  const supplier = await row<any>("SELECT id FROM pos_suppliers WHERE id = ? AND outlet_id = ? AND active = 1", [supplierId, s.outlet_id]);
  if (!supplier) { res.status(400).json({ message: "Invalid supplier" }); return; }
  if (!Array.isArray(items) || items.length === 0) { res.status(400).json({ message: "At least one item is required" }); return; }

  for (const item of items) {
    const qty = Math.round(Number(item?.quantity));
    if (!Number.isFinite(qty) || qty <= 0) { res.status(400).json({ message: "Each item needs a positive quantity" }); return; }
    const product = await row<any>("SELECT id, has_variants FROM pos_products WHERE id = ? AND outlet_id = ?", [item.product_id, s.outlet_id]);
    if (!product) { res.status(400).json({ message: "Item product not found in this outlet" }); return; }
    if (product.has_variants) {
      if (!item.variant_id) { res.status(400).json({ message: `Product ${product.id} requires a variant` }); return; }
      const variant = await row<any>("SELECT id FROM pos_variants WHERE id = ? AND product_id = ?", [item.variant_id, item.product_id]);
      if (!variant) { res.status(400).json({ message: "Item variant not found" }); return; }
    }
  }

  const orderId = await exec(
    "INSERT INTO pos_stock_orders (outlet_id, supplier_id, status, notes, created_by) VALUES (?, ?, 'ordered', ?, ?)",
    [s.outlet_id, supplierId, req.body?.notes || null, s.id]
  );
  for (const item of items) {
    await exec(
      "INSERT INTO pos_stock_order_items (stock_order_id, product_id, variant_id, quantity, unit_cost) VALUES (?, ?, ?, ?, ?)",
      [orderId, item.product_id, item.variant_id ?? null, Math.round(Number(item.quantity)), Number(item.unit_cost) || 0]
    );
  }
  res.status(201).json({ id: orderId, status: "ordered" });
});

router.post("/pos/stock-orders/:id/receive", requirePosAuth, requirePosManager, async (req: Request, res: Response): Promise<void> => {
  const s = getPosStaff(req);
  const id = parseInt(String(req.params["id"] ?? ""), 10);
  try {
    await withTransaction(async (client) => {
      const orderRes = await clientQuery(client,
        "SELECT id, status FROM pos_stock_orders WHERE id = ? AND outlet_id = ? FOR UPDATE", [id, s.outlet_id]);
      const order = orderRes.rows[0];
      if (!order) throw Object.assign(new Error("Stock order not found"), { status: 404 });
      if (order.status !== "ordered") throw Object.assign(new Error(`Order is already ${order.status}`), { status: 409 });

      const itemsRes = await clientQuery(client,
        "SELECT product_id, variant_id, quantity FROM pos_stock_order_items WHERE stock_order_id = ?", [id]);
      for (const item of itemsRes.rows) {
        // Constrain every stock update to this outlet — reject if any line
        // references a product/variant outside it (data integrity guard).
        if (item.variant_id) {
          const upd = await clientQuery(client,
            `UPDATE pos_variants v SET stock_qty = v.stock_qty + ?
             FROM pos_products p
             WHERE v.id = ? AND p.id = v.product_id AND p.id = ? AND p.outlet_id = ?`,
            [item.quantity, item.variant_id, item.product_id, s.outlet_id]);
          if (upd.rowCount !== 1) {
            throw Object.assign(new Error("Stock order line references an item outside this outlet"), { status: 409 });
          }
        } else {
          const upd = await clientQuery(client,
            "UPDATE pos_products SET stock_qty = stock_qty + ? WHERE id = ? AND outlet_id = ?",
            [item.quantity, item.product_id, s.outlet_id]);
          if (upd.rowCount !== 1) {
            throw Object.assign(new Error("Stock order line references an item outside this outlet"), { status: 409 });
          }
        }
        await clientQuery(client,
          "INSERT INTO pos_stock_movements (outlet_id, product_id, variant_id, change, reason, ref_id, created_by) VALUES (?, ?, ?, ?, 'stock_order', ?, ?)",
          [s.outlet_id, item.product_id, item.variant_id ?? null, item.quantity, id, s.id]);
      }
      await clientQuery(client, "UPDATE pos_stock_orders SET status = 'received', received_at = NOW() WHERE id = ?", [id]);
    });
    res.json({ success: true, status: "received" });
  } catch (err: any) {
    if (err.status) { res.status(err.status).json({ message: err.message }); return; }
    logger.error({ err, orderId: id }, "Failed to receive stock order");
    res.status(500).json({ message: "Failed to receive stock order" });
  }
});

router.post("/pos/stock-orders/:id/cancel", requirePosAuth, requirePosManager, async (req: Request, res: Response): Promise<void> => {
  const s = getPosStaff(req);
  const id = parseInt(String(req.params["id"] ?? ""), 10);
  const updated = await run(
    "UPDATE pos_stock_orders SET status = 'cancelled' WHERE id = ? AND outlet_id = ? AND status = 'ordered'",
    [id, s.outlet_id]
  );
  if (!updated) { res.status(409).json({ message: "Order cannot be cancelled" }); return; }
  res.json({ success: true });
});

// ─── Promotions ──────────────────────────────────────────────────────────────

router.get("/pos/promotions", requirePosAuth, requirePosManager, async (req: Request, res: Response): Promise<void> => {
  const s = getPosStaff(req);
  const promotions = await query<any>(
    `SELECT pr.*, c.name AS category_name, p.name AS product_name
     FROM pos_promotions pr
     LEFT JOIN pos_categories c ON c.id = pr.category_id
     LEFT JOIN pos_products p ON p.id = pr.product_id
     WHERE pr.outlet_id = ? ORDER BY pr.created_at DESC`,
    [s.outlet_id]
  );
  res.json({ promotions: promotions.map(p => ({ ...p, discount_value: Number(p.discount_value) })) });
});

router.post("/pos/promotions", requirePosAuth, requirePosManager, async (req: Request, res: Response): Promise<void> => {
  const s = getPosStaff(req);
  const name = String(req.body?.name ?? "").trim();
  const discountType = String(req.body?.discount_type ?? "");
  const discountValue = Number(req.body?.discount_value);
  const appliesTo = String(req.body?.applies_to ?? "all");
  if (!name) { res.status(400).json({ message: "Promotion name is required" }); return; }
  if (discountType !== "percentage" && discountType !== "amount") { res.status(400).json({ message: "discount_type must be percentage or amount" }); return; }
  if (!Number.isFinite(discountValue) || discountValue <= 0) { res.status(400).json({ message: "A positive discount value is required" }); return; }
  if (discountType === "percentage" && discountValue > 100) { res.status(400).json({ message: "Percentage cannot exceed 100" }); return; }
  if (!["all", "category", "product"].includes(appliesTo)) { res.status(400).json({ message: "Invalid applies_to" }); return; }

  let categoryId: number | null = null;
  let productId: number | null = null;
  if (appliesTo === "category") {
    categoryId = parseInt(String(req.body?.category_id ?? ""), 10);
    const cat = await row<any>("SELECT id FROM pos_categories WHERE id = ? AND outlet_id = ?", [categoryId, s.outlet_id]);
    if (!cat) { res.status(400).json({ message: "Invalid category" }); return; }
  }
  if (appliesTo === "product") {
    productId = parseInt(String(req.body?.product_id ?? ""), 10);
    const prod = await row<any>("SELECT id FROM pos_products WHERE id = ? AND outlet_id = ?", [productId, s.outlet_id]);
    if (!prod) { res.status(400).json({ message: "Invalid product" }); return; }
  }
  const daysOfWeek = req.body?.days_of_week ? String(req.body.days_of_week) : null;
  const startTime = req.body?.start_time || null;
  const endTime = req.body?.end_time || null;
  const id = await exec(
    `INSERT INTO pos_promotions (outlet_id, name, discount_type, discount_value, applies_to, category_id, product_id, days_of_week, start_time, end_time)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [s.outlet_id, name, discountType, discountValue, appliesTo, categoryId, productId, daysOfWeek, startTime, endTime]
  );
  res.status(201).json({ id, name });
});

router.put("/pos/promotions/:id", requirePosAuth, requirePosManager, async (req: Request, res: Response): Promise<void> => {
  const s = getPosStaff(req);
  const id = parseInt(String(req.params["id"] ?? ""), 10);
  const promo = await row<any>("SELECT id FROM pos_promotions WHERE id = ? AND outlet_id = ?", [id, s.outlet_id]);
  if (!promo) { res.status(404).json({ message: "Promotion not found" }); return; }
  const { active, name } = req.body ?? {};
  await run(
    "UPDATE pos_promotions SET active = COALESCE(?, active), name = COALESCE(?, name) WHERE id = ?",
    [active != null ? (active ? 1 : 0) : null, name != null ? String(name).trim() : null, id]
  );
  res.json({ success: true });
});

router.delete("/pos/promotions/:id", requirePosAuth, requirePosManager, async (req: Request, res: Response): Promise<void> => {
  const s = getPosStaff(req);
  const id = parseInt(String(req.params["id"] ?? ""), 10);
  const deleted = await run("DELETE FROM pos_promotions WHERE id = ? AND outlet_id = ?", [id, s.outlet_id]);
  if (!deleted) { res.status(404).json({ message: "Promotion not found" }); return; }
  res.json({ success: true });
});

// ─── Promotion engine ────────────────────────────────────────────────────────
// Evaluated in South Africa time (UTC+2, no DST). getUTCDay(): Sun=0 … Sat=6.

function saNow(): { day: number; hhmm: string } {
  const d = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const hhmm = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  return { day: d.getUTCDay(), hhmm };
}

interface PromoRow {
  id: number; discount_type: string; discount_value: number; applies_to: string;
  category_id: number | null; product_id: number | null;
  days_of_week: string | null; start_time: string | null; end_time: string | null;
}

async function activePromotions(outletId: number): Promise<PromoRow[]> {
  const promos = await query<any>(
    "SELECT id, discount_type, discount_value, applies_to, category_id, product_id, days_of_week, start_time, end_time FROM pos_promotions WHERE outlet_id = ? AND active = 1",
    [outletId]
  );
  const { day, hhmm } = saNow();
  return promos.filter((p) => {
    if (p.days_of_week) {
      const days = String(p.days_of_week).split(",").map((v: string) => parseInt(v.trim(), 10));
      if (!days.includes(day)) return false;
    }
    const start = p.start_time ? String(p.start_time).slice(0, 5) : null;
    const end = p.end_time ? String(p.end_time).slice(0, 5) : null;
    if (start && hhmm < start) return false;
    if (end && hhmm > end) return false;
    return true;
  }).map((p) => ({ ...p, discount_value: Number(p.discount_value) }));
}

// Best (largest) discount per line; returns { discount, promotionId }.
function bestLineDiscount(
  promos: PromoRow[],
  item: { product_id: number; category_id: number | null; unit_price: number; quantity: number }
): { discount: number; promotionId: number | null } {
  const lineSubtotal = item.unit_price * item.quantity;
  let best = 0;
  let bestId: number | null = null;
  for (const p of promos) {
    if (p.applies_to === "category" && p.category_id !== item.category_id) continue;
    if (p.applies_to === "product" && p.product_id !== item.product_id) continue;
    let d = 0;
    if (p.discount_type === "percentage") d = lineSubtotal * (p.discount_value / 100);
    else d = Math.min(p.discount_value * item.quantity, lineSubtotal);
    if (d > best) { best = d; bestId = p.id; }
  }
  return { discount: Math.round(best * 100) / 100, promotionId: bestId };
}

async function orderWithTotals(orderId: number, outletId: number): Promise<any | null> {
  const order = await row<any>(
    `SELECT o.*, opener.name AS opened_by_name, closer.name AS closed_by_name
     FROM pos_orders o
     LEFT JOIN pos_staff opener ON opener.id = o.opened_by
     LEFT JOIN pos_staff closer ON closer.id = o.closed_by
     WHERE o.id = ? AND o.outlet_id = ?`,
    [orderId, outletId]
  );
  if (!order) return null;
  const items = await query<any>(
    `SELECT i.*, p.category_id FROM pos_order_items i
     JOIN pos_products p ON p.id = i.product_id
     WHERE i.order_id = ? ORDER BY i.id`,
    [orderId]
  );
  if (order.status === "open") {
    // Live totals — promotions re-evaluated on each read so time windows apply
    const promos = await activePromotions(outletId);
    let subtotal = 0, discountTotal = 0;
    const withDiscounts = items.map((i) => {
      const unitPrice = Number(i.unit_price);
      const line = unitPrice * i.quantity;
      const { discount, promotionId } = bestLineDiscount(promos, {
        product_id: i.product_id, category_id: i.category_id, unit_price: unitPrice, quantity: i.quantity,
      });
      subtotal += line;
      discountTotal += discount;
      return { ...i, unit_price: unitPrice, discount, promotion_id: promotionId, line_total: Math.round((line - discount) * 100) / 100 };
    });
    const feePercent = await outletServiceFeePercent(outletId);
    const serviceFee = Math.round((subtotal - discountTotal) * feePercent) / 100;
    return {
      ...order,
      subtotal: Math.round(subtotal * 100) / 100,
      discount_total: Math.round(discountTotal * 100) / 100,
      service_fee_percent: feePercent,
      service_fee: serviceFee,
      tip_amount: 0,
      total: Math.round((subtotal - discountTotal) * 100) / 100 + serviceFee,
      items: withDiscounts,
    };
  }
  return {
    ...order,
    subtotal: Number(order.subtotal), discount_total: Number(order.discount_total), total: Number(order.total),
    service_fee: Number(order.service_fee ?? 0), tip_amount: Number(order.tip_amount ?? 0),
    amount_paid: order.amount_paid != null ? Number(order.amount_paid) : null,
    items: items.map((i) => ({ ...i, unit_price: Number(i.unit_price), discount: Number(i.discount), line_total: Number(i.line_total) })),
  };
}

async function outletServiceFeePercent(outletId: number): Promise<number> {
  const o = await row<any>("SELECT service_fee_percent FROM pos_outlets WHERE id = ?", [outletId]);
  const pct = Number(o?.service_fee_percent ?? 0);
  return Number.isFinite(pct) && pct > 0 ? pct : 0;
}

// ─── Orders (tables / takeaway / counter) ────────────────────────────────────

router.get("/pos/orders", requirePosAuth, async (req: Request, res: Response): Promise<void> => {
  const s = getPosStaff(req);
  const status = String(req.query["status"] ?? "open");
  if (!["open", "paid", "cancelled"].includes(status)) { res.status(400).json({ message: "Invalid status" }); return; }
  const orders = await query<any>(
    `SELECT o.id, o.order_type, o.table_name, o.status, o.created_at, o.paid_at,
            o.opened_by, opener.name AS opened_by_name, opener.role AS opened_by_role,
            (SELECT COUNT(*)::int FROM pos_order_items i WHERE i.order_id = o.id) AS item_count
     FROM pos_orders o
     LEFT JOIN pos_staff opener ON opener.id = o.opened_by
     WHERE o.outlet_id = ? AND o.status = ?
     ORDER BY o.created_at ASC`,
    [s.outlet_id, status]
  );
  // Compute live totals for open orders (promotions applied)
  const result = [];
  for (const o of orders) {
    const full = await orderWithTotals(o.id, s.outlet_id);
    result.push({ ...o, total: full?.total ?? 0 });
  }
  res.json({ orders: result });
});

router.post("/pos/orders", requirePosAuth, async (req: Request, res: Response): Promise<void> => {
  const s = getPosStaff(req);
  const orderType = String(req.body?.order_type ?? "");
  if (!["table", "takeaway", "counter"].includes(orderType)) { res.status(400).json({ message: "order_type must be table, takeaway or counter" }); return; }
  const tableName = orderType === "table" ? String(req.body?.table_name ?? "").trim() : null;
  if (orderType === "table" && !tableName) { res.status(400).json({ message: "table_name is required for table orders" }); return; }
  const id = await exec(
    "INSERT INTO pos_orders (outlet_id, order_type, table_name, opened_by) VALUES (?, ?, ?, ?)",
    [s.outlet_id, orderType, tableName, s.id]
  );
  const full = await orderWithTotals(id, s.outlet_id);
  res.status(201).json(full);
});

router.get("/pos/orders/:id", requirePosAuth, async (req: Request, res: Response): Promise<void> => {
  const s = getPosStaff(req);
  const id = parseInt(String(req.params["id"] ?? ""), 10);
  const order = await orderWithTotals(id, s.outlet_id);
  if (!order) { res.status(404).json({ message: "Order not found" }); return; }
  res.json(order);
});

router.post("/pos/orders/:id/items", requirePosAuth, async (req: Request, res: Response): Promise<void> => {
  const s = getPosStaff(req);
  const id = parseInt(String(req.params["id"] ?? ""), 10);
  const order = await row<any>("SELECT id, status FROM pos_orders WHERE id = ? AND outlet_id = ?", [id, s.outlet_id]);
  if (!order) { res.status(404).json({ message: "Order not found" }); return; }
  if (order.status !== "open") { res.status(409).json({ message: "Order is no longer open" }); return; }

  const productId = parseInt(String(req.body?.product_id ?? ""), 10);
  const variantId = req.body?.variant_id ? parseInt(String(req.body.variant_id), 10) : null;
  const quantity = Math.max(1, Math.round(Number(req.body?.quantity) || 1));
  const product = await row<any>(
    "SELECT id, name, price, has_variants FROM pos_products WHERE id = ? AND outlet_id = ? AND active = 1",
    [productId, s.outlet_id]
  );
  if (!product) { res.status(400).json({ message: "Product not found in this outlet" }); return; }

  let unitPrice = Number(product.price);
  let variantLabel: string | null = null;
  if (product.has_variants) {
    if (!variantId) { res.status(400).json({ message: "This product requires a variant selection" }); return; }
    const variant = await row<any>("SELECT id, size, colour, price FROM pos_variants WHERE id = ? AND product_id = ? AND active = 1", [variantId, productId]);
    if (!variant) { res.status(400).json({ message: "Variant not found" }); return; }
    if (variant.price != null) unitPrice = Number(variant.price);
    variantLabel = [variant.size, variant.colour].filter(Boolean).join(" / ") || null;
  }

  // Merge with an existing identical line
  const existing = await row<any>(
    "SELECT id, quantity FROM pos_order_items WHERE order_id = ? AND product_id = ? AND variant_id IS NOT DISTINCT FROM ?",
    [id, productId, variantId]
  );
  if (existing) {
    await run("UPDATE pos_order_items SET quantity = quantity + ?, line_total = unit_price * (quantity + ?) WHERE id = ?", [quantity, quantity, existing.id]);
  } else {
    await exec(
      "INSERT INTO pos_order_items (order_id, product_id, variant_id, name, variant_label, quantity, unit_price, line_total) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [id, productId, variantId, product.name, variantLabel, quantity, unitPrice, unitPrice * quantity]
    );
  }
  const full = await orderWithTotals(id, s.outlet_id);
  res.json(full);
});

router.put("/pos/orders/:id/items/:itemId", requirePosAuth, async (req: Request, res: Response): Promise<void> => {
  const s = getPosStaff(req);
  const id = parseInt(String(req.params["id"] ?? ""), 10);
  const itemId = parseInt(String(req.params["itemId"] ?? ""), 10);
  const order = await row<any>("SELECT id, status FROM pos_orders WHERE id = ? AND outlet_id = ?", [id, s.outlet_id]);
  if (!order) { res.status(404).json({ message: "Order not found" }); return; }
  if (order.status !== "open") { res.status(409).json({ message: "Order is no longer open" }); return; }
  const quantity = Math.round(Number(req.body?.quantity));
  if (!Number.isFinite(quantity) || quantity < 0) { res.status(400).json({ message: "Invalid quantity" }); return; }
  if (quantity === 0) {
    await run("DELETE FROM pos_order_items WHERE id = ? AND order_id = ?", [itemId, id]);
  } else {
    const updated = await run("UPDATE pos_order_items SET quantity = ?, line_total = unit_price * ? WHERE id = ? AND order_id = ?", [quantity, quantity, itemId, id]);
    if (!updated) { res.status(404).json({ message: "Item not found" }); return; }
  }
  const full = await orderWithTotals(id, s.outlet_id);
  res.json(full);
});

router.delete("/pos/orders/:id/items/:itemId", requirePosAuth, async (req: Request, res: Response): Promise<void> => {
  const s = getPosStaff(req);
  const id = parseInt(String(req.params["id"] ?? ""), 10);
  const itemId = parseInt(String(req.params["itemId"] ?? ""), 10);
  const order = await row<any>("SELECT id, status FROM pos_orders WHERE id = ? AND outlet_id = ?", [id, s.outlet_id]);
  if (!order) { res.status(404).json({ message: "Order not found" }); return; }
  if (order.status !== "open") { res.status(409).json({ message: "Order is no longer open" }); return; }
  await run("DELETE FROM pos_order_items WHERE id = ? AND order_id = ?", [itemId, id]);
  const full = await orderWithTotals(id, s.outlet_id);
  res.json(full);
});

// Finalize: lock in promotion discounts, decrement stock, record movements.
// If amountPaid is provided, the tip is worked out as amountPaid - bill total
// (never negative); the outlet's automatic service fee is locked in either way.
async function finalizeOrderPayment(orderId: number, outletId: number, staffId: number, paymentMethod: string, amountPaid: number | null = null): Promise<any> {
  return withTransaction((client) => finalizeOrderPaymentOn(client, orderId, outletId, staffId, paymentMethod, amountPaid));
}

// Same as finalizeOrderPayment but runs on an existing transaction client so
// callers can combine the sale with other writes (e.g. a walk-in golf booking)
// in one atomic transaction.
async function finalizeOrderPaymentOn(client: any, orderId: number, outletId: number, staffId: number, paymentMethod: string, amountPaid: number | null = null): Promise<any> {
    const orderRes = await clientQuery(client,
      "SELECT id, status FROM pos_orders WHERE id = ? AND outlet_id = ? FOR UPDATE", [orderId, outletId]);
    const order = orderRes.rows[0];
    if (!order) throw Object.assign(new Error("Order not found"), { status: 404 });
    if (order.status !== "open") throw Object.assign(new Error(`Order is already ${order.status}`), { status: 409 });

    const itemsRes = await clientQuery(client,
      `SELECT i.id, i.product_id, i.variant_id, i.name, i.variant_label, i.quantity, i.unit_price, p.category_id, p.has_variants
       FROM pos_order_items i JOIN pos_products p ON p.id = i.product_id
       WHERE i.order_id = ? AND p.outlet_id = ?`, [orderId, outletId]);
    const items = itemsRes.rows;
    if (items.length === 0) throw Object.assign(new Error("Order has no items"), { status: 400 });

    const promos = await activePromotions(outletId);
    let subtotal = 0, discountTotal = 0;
    for (const item of items) {
      const unitPrice = Number(item.unit_price);
      const line = unitPrice * item.quantity;
      const { discount, promotionId } = bestLineDiscount(promos, {
        product_id: item.product_id, category_id: item.category_id, unit_price: unitPrice, quantity: item.quantity,
      });
      subtotal += line;
      discountTotal += discount;
      await clientQuery(client,
        "UPDATE pos_order_items SET discount = ?, promotion_id = ?, line_total = ? WHERE id = ?",
        [discount, promotionId, Math.round((line - discount) * 100) / 100, item.id]);

      // Decrement stock + movement audit trail. Capacity is enforced inside the
      // mutating statement (stock_qty >= qty) so concurrent sales can't oversell,
      // and every update is constrained to this outlet.
      const itemLabel = [item.name, item.variant_label].filter(Boolean).join(" ");
      if (item.variant_id) {
        const upd = await clientQuery(client,
          `UPDATE pos_variants v SET stock_qty = v.stock_qty - ?
           FROM pos_products p
           WHERE v.id = ? AND p.id = v.product_id AND p.id = ? AND p.outlet_id = ? AND v.stock_qty >= ?`,
          [item.quantity, item.variant_id, item.product_id, outletId, item.quantity]);
        if (upd.rowCount !== 1) {
          throw Object.assign(new Error(`Insufficient stock for ${itemLabel}`), { status: 409 });
        }
      } else {
        const upd = await clientQuery(client,
          "UPDATE pos_products SET stock_qty = stock_qty - ? WHERE id = ? AND outlet_id = ? AND stock_qty >= ?",
          [item.quantity, item.product_id, outletId, item.quantity]);
        if (upd.rowCount !== 1) {
          throw Object.assign(new Error(`Insufficient stock for ${itemLabel}`), { status: 409 });
        }
      }
      await clientQuery(client,
        "INSERT INTO pos_stock_movements (outlet_id, product_id, variant_id, change, reason, ref_id, created_by) VALUES (?, ?, ?, ?, 'sale', ?, ?)",
        [outletId, item.product_id, item.variant_id ?? null, -item.quantity, orderId, staffId]);
    }
    const feePercent = await outletServiceFeePercent(outletId);
    const serviceFee = Math.round((subtotal - discountTotal) * feePercent) / 100;
    const total = Math.round((subtotal - discountTotal) * 100) / 100 + serviceFee;
    const tip = amountPaid != null ? Math.max(0, Math.round((amountPaid - total) * 100) / 100) : 0;
    await clientQuery(client,
      `UPDATE pos_orders SET status = 'paid', payment_method = ?, subtotal = ?, discount_total = ?, total = ?,
         service_fee = ?, tip_amount = ?, amount_paid = ?,
         closed_by = ?, paid_at = NOW() WHERE id = ?`,
      [paymentMethod, Math.round(subtotal * 100) / 100, Math.round(discountTotal * 100) / 100, total,
       serviceFee, tip, amountPaid, staffId, orderId]);
    return { subtotal: Math.round(subtotal * 100) / 100, discount_total: Math.round(discountTotal * 100) / 100, service_fee: serviceFee, tip_amount: tip, total };
}

router.post("/pos/orders/:id/pay", requirePosAuth, async (req: Request, res: Response): Promise<void> => {
  const s = getPosStaff(req);
  const id = parseInt(String(req.params["id"] ?? ""), 10);
  const paymentMethod = String(req.body?.payment_method ?? "");
  if (paymentMethod !== "cash" && paymentMethod !== "card") { res.status(400).json({ message: "payment_method must be cash or card" }); return; }
  let amountPaid: number | null = null;
  if (req.body?.amount_paid != null && String(req.body.amount_paid).trim() !== "") {
    amountPaid = Number(req.body.amount_paid);
    if (!Number.isFinite(amountPaid) || amountPaid < 0) { res.status(400).json({ message: "amount_paid must be zero or a positive amount" }); return; }
    amountPaid = Math.round(amountPaid * 100) / 100;
  }
  try {
    await finalizeOrderPayment(id, s.outlet_id, s.id, paymentMethod, amountPaid);
    const full = await orderWithTotals(id, s.outlet_id);
    // Post to financial ledger (non-blocking)
    if (full?.total > 0) {
      const outlet = await row<any>("SELECT club_id, type FROM pos_outlets WHERE id = ?", [s.outlet_id]);
      if (outlet) {
        postPosTransactionJournal({
          transaction_id: id,
          club_id: outlet.club_id,
          outlet_type: outlet.type,
          amount: Number(full.total),
          tip_amount: Number(full.tip_amount ?? 0),
          service_fee: Number(full.service_fee ?? 0),
          platform_fee: 0,
          payment_method: paymentMethod,
        }).catch(() => {});
      }
    }
    res.json(full);
  } catch (err: any) {
    if (err.status) { res.status(err.status).json({ message: err.message }); return; }
    logger.error({ err, orderId: id }, "Failed to finalize POS payment");
    res.status(500).json({ message: "Failed to complete payment" });
  }
});

router.post("/pos/orders/:id/cancel", requirePosAuth, async (req: Request, res: Response): Promise<void> => {
  const s = getPosStaff(req);
  const id = parseInt(String(req.params["id"] ?? ""), 10);
  const updated = await run(
    "UPDATE pos_orders SET status = 'cancelled', closed_by = ? WHERE id = ? AND outlet_id = ? AND status = 'open'",
    [s.id, id, s.outlet_id]
  );
  if (!updated) { res.status(409).json({ message: "Order cannot be cancelled" }); return; }
  res.json({ success: true });
});

// Validate + resolve sale line items (prices, variants) for the given outlet.
// Throws { status, message } on any invalid line.
async function resolveSaleItems(items: any[], outletId: number): Promise<any[]> {
  const resolved: any[] = [];
  for (const item of items) {
    const productId = parseInt(String(item?.product_id ?? ""), 10);
    const variantId = item?.variant_id ? parseInt(String(item.variant_id), 10) : null;
    const quantity = Math.max(1, Math.round(Number(item?.quantity) || 1));
    const product = await row<any>(
      "SELECT id, name, price, category_id, has_variants FROM pos_products WHERE id = ? AND outlet_id = ? AND active = 1",
      [productId, outletId]
    );
    if (!product) throw Object.assign(new Error("Product not found in this outlet"), { status: 400 });
    let unitPrice = Number(product.price);
    let variantLabel: string | null = null;
    if (product.has_variants) {
      if (!variantId) throw Object.assign(new Error(`${product.name} requires a variant selection`), { status: 400 });
      const variant = await row<any>("SELECT id, size, colour, price FROM pos_variants WHERE id = ? AND product_id = ? AND active = 1", [variantId, productId]);
      if (!variant) throw Object.assign(new Error("Variant not found"), { status: 400 });
      if (variant.price != null) unitPrice = Number(variant.price);
      variantLabel = [variant.size, variant.colour].filter(Boolean).join(" / ") || null;
    }
    resolved.push({ productId, variantId, quantity, unitPrice, name: product.name, variantLabel, categoryId: product.category_id ?? null });
  }
  return resolved;
}

// Live cart preview for the pro-shop till: applies active promotions so the
// running total reflects discounts before payment. No data is written.
router.post("/pos/sales/preview", requirePosAuth, async (req: Request, res: Response): Promise<void> => {
  const s = getPosStaff(req);
  const items = req.body?.items;
  if (!Array.isArray(items) || items.length === 0) { res.status(400).json({ message: "At least one item is required" }); return; }
  try {
    const resolved = await resolveSaleItems(items, s.outlet_id);
    const promos = await activePromotions(s.outlet_id);
    let subtotal = 0, discountTotal = 0;
    const lines = resolved.map((r) => {
      const line = r.unitPrice * r.quantity;
      const { discount, promotionId } = bestLineDiscount(promos, {
        product_id: r.productId, category_id: r.categoryId, unit_price: r.unitPrice, quantity: r.quantity,
      });
      subtotal += line;
      discountTotal += discount;
      return {
        product_id: r.productId, variant_id: r.variantId, quantity: r.quantity,
        unit_price: r.unitPrice, discount, promotion_id: promotionId,
        line_total: Math.round((line - discount) * 100) / 100,
      };
    });
    res.json({
      subtotal: Math.round(subtotal * 100) / 100,
      discount_total: Math.round(discountTotal * 100) / 100,
      total: Math.round((subtotal - discountTotal) * 100) / 100,
      lines,
    });
  } catch (err: any) {
    if (err.status) { res.status(err.status).json({ message: err.message }); return; }
    logger.error({ err }, "Failed to preview sale");
    res.status(500).json({ message: "Failed to preview sale" });
  }
});

// One-shot pro-shop sale: create counter order + items + pay atomically.
router.post("/pos/sales", requirePosAuth, async (req: Request, res: Response): Promise<void> => {
  const s = getPosStaff(req);
  const items = req.body?.items;
  const paymentMethod = String(req.body?.payment_method ?? "");
  if (paymentMethod !== "cash" && paymentMethod !== "card") { res.status(400).json({ message: "payment_method must be cash or card" }); return; }
  if (!Array.isArray(items) || items.length === 0) { res.status(400).json({ message: "At least one item is required" }); return; }

  let resolved: any[];
  try {
    resolved = await resolveSaleItems(items, s.outlet_id);
  } catch (err: any) {
    res.status(err.status ?? 500).json({ message: err.message ?? "Failed to validate sale items" });
    return;
  }

  const orderId = await exec(
    "INSERT INTO pos_orders (outlet_id, order_type, opened_by) VALUES (?, 'counter', ?)",
    [s.outlet_id, s.id]
  );
  for (const r of resolved) {
    await exec(
      "INSERT INTO pos_order_items (order_id, product_id, variant_id, name, variant_label, quantity, unit_price, line_total) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [orderId, r.productId, r.variantId, r.name, r.variantLabel, r.quantity, r.unitPrice, r.unitPrice * r.quantity]
    );
  }
  try {
    await finalizeOrderPayment(orderId, s.outlet_id, s.id, paymentMethod);
    const full = await orderWithTotals(orderId, s.outlet_id);
    res.status(201).json(full);
  } catch (err: any) {
    // Roll the shell order back so it doesn't linger as an open ghost
    await run("UPDATE pos_orders SET status = 'cancelled' WHERE id = ? AND status = 'open'", [orderId]);
    if (err.status) { res.status(err.status).json({ message: err.message }); return; }
    logger.error({ err, orderId }, "Failed to complete pro shop sale");
    res.status(500).json({ message: "Failed to complete sale" });
  }
});

// ─── Staff management (manager) ──────────────────────────────────────────────

router.get("/pos/staff", requirePosAuth, requirePosManager, async (req: Request, res: Response): Promise<void> => {
  const s = getPosStaff(req);
  const staff = await query<any>(
    `SELECT st.id, st.name, st.email, st.role, st.active, st.created_at,
            EXISTS (SELECT 1 FROM pos_webauthn_credentials w WHERE w.staff_id = st.id) AS has_fingerprint
     FROM pos_staff st WHERE st.outlet_id = ? ORDER BY st.role, st.name`,
    [s.outlet_id]
  );
  res.json({ staff });
});

router.post("/pos/staff", requirePosAuth, requirePosManager, async (req: Request, res: Response): Promise<void> => {
  const s = getPosStaff(req);
  const name = String(req.body?.name ?? "").trim();
  const password = String(req.body?.password ?? "");
  // Waiters/cashiers don't have logins — just a name and a personal PIN they
  // type on the terminal. Managers are created by the club admin.
  if (!name || !password) { res.status(400).json({ message: "Name and PIN are required" }); return; }
  if (password.length < 4) { res.status(400).json({ message: "PIN must be at least 4 characters" }); return; }
  const hash = await bcrypt.hash(password, 10);
  const id = await exec(
    "INSERT INTO pos_staff (outlet_id, club_id, name, email, password_hash, role) VALUES (?, ?, ?, NULL, ?, 'waiter')",
    [s.outlet_id, s.club_id, name, hash]
  );
  res.status(201).json({ id, name, email: null, role: "waiter", active: 1 });
});

router.put("/pos/staff/:id", requirePosAuth, requirePosManager, async (req: Request, res: Response): Promise<void> => {
  const s = getPosStaff(req);
  const id = parseInt(String(req.params["id"] ?? ""), 10);
  const target = await row<any>("SELECT id, role FROM pos_staff WHERE id = ? AND outlet_id = ?", [id, s.outlet_id]);
  if (!target) { res.status(404).json({ message: "Staff member not found" }); return; }
  if (target.role === "manager" && target.id !== s.id) { res.status(403).json({ message: "Managers cannot modify other managers — ask your club admin" }); return; }
  const { active, password, name } = req.body ?? {};
  if (password != null) {
    const minLen = target.role === "manager" ? 6 : 4;
    if (String(password).length < minLen) {
      res.status(400).json({ message: target.role === "manager" ? "Password must be at least 6 characters" : "PIN must be at least 4 characters" });
      return;
    }
    const hash = await bcrypt.hash(String(password), 10);
    await run("UPDATE pos_staff SET password_hash = ? WHERE id = ?", [hash, id]);
  }
  await run(
    "UPDATE pos_staff SET active = COALESCE(?, active), name = COALESCE(?, name) WHERE id = ?",
    [active != null ? (active ? 1 : 0) : null, name != null ? String(name).trim() : null, id]
  );
  res.json({ success: true });
});

// ─── Transactions (manager) ──────────────────────────────────────────────────

router.get("/pos/transactions", requirePosAuth, requirePosManager, async (req: Request, res: Response): Promise<void> => {
  const s = getPosStaff(req);
  const conditions = ["o.outlet_id = ?", "o.status = 'paid'"];
  const params: any[] = [s.outlet_id];
  if (req.query["from"]) { conditions.push("o.paid_at >= ?::date"); params.push(String(req.query["from"])); }
  if (req.query["to"]) { conditions.push("o.paid_at < (?::date + INTERVAL '1 day')"); params.push(String(req.query["to"])); }
  if (req.query["payment_method"]) { conditions.push("o.payment_method = ?"); params.push(String(req.query["payment_method"])); }
  if (req.query["staff_id"]) { conditions.push("o.closed_by = ?"); params.push(parseInt(String(req.query["staff_id"]), 10)); }
  const transactions = await query<any>(
    `SELECT o.id, o.order_type, o.table_name, o.subtotal, o.discount_total, o.total, o.payment_method,
            o.service_fee, o.tip_amount, o.amount_paid,
            o.paid_at, o.created_at, closer.name AS staff_name,
            (SELECT COUNT(*)::int FROM pos_order_items i WHERE i.order_id = o.id) AS item_count
     FROM pos_orders o
     LEFT JOIN pos_staff closer ON closer.id = o.closed_by
     WHERE ${conditions.join(" AND ")}
     ORDER BY o.paid_at DESC LIMIT 500`,
    params
  );
  res.json({
    transactions: transactions.map(t => ({
      ...t, subtotal: Number(t.subtotal), discount_total: Number(t.discount_total), total: Number(t.total),
      service_fee: Number(t.service_fee ?? 0), tip_amount: Number(t.tip_amount ?? 0),
      amount_paid: t.amount_paid != null ? Number(t.amount_paid) : null,
    })),
  });
});

// ─── Reports (manager) ───────────────────────────────────────────────────────

router.get("/pos/reports/summary", requirePosAuth, requirePosManager, async (req: Request, res: Response): Promise<void> => {
  const s = getPosStaff(req);
  const from = req.query["from"] ? String(req.query["from"]) : null;
  const to = req.query["to"] ? String(req.query["to"]) : null;
  const dateCond = ["o.outlet_id = ?", "o.status = 'paid'"];
  const params: any[] = [s.outlet_id];
  if (from) { dateCond.push("o.paid_at >= ?::date"); params.push(from); }
  if (to) { dateCond.push("o.paid_at < (?::date + INTERVAL '1 day')"); params.push(to); }
  const where = dateCond.join(" AND ");

  const totals = await row<any>(
    `SELECT COUNT(*)::int AS transaction_count, COALESCE(SUM(o.total), 0) AS total_sales,
            COALESCE(SUM(o.discount_total), 0) AS total_discounts,
            COALESCE(SUM(o.service_fee), 0) AS total_service_fees,
            COALESCE(SUM(o.tip_amount), 0) AS total_tips,
            COALESCE(SUM(o.total) FILTER (WHERE o.payment_method = 'cash'), 0) AS cash_sales,
            COALESCE(SUM(o.total) FILTER (WHERE o.payment_method = 'card'), 0) AS card_sales
     FROM pos_orders o WHERE ${where}`, params);

  const byDay = await query<any>(
    `SELECT (o.paid_at AT TIME ZONE 'UTC' + INTERVAL '2 hours')::date AS day,
            COUNT(*)::int AS transactions, COALESCE(SUM(o.total), 0) AS sales
     FROM pos_orders o WHERE ${where}
     GROUP BY day ORDER BY day`, params);

  const topProducts = await query<any>(
    `SELECT i.product_id, i.name, COALESCE(SUM(i.quantity), 0)::int AS units, COALESCE(SUM(i.line_total), 0) AS sales
     FROM pos_order_items i JOIN pos_orders o ON o.id = i.order_id
     WHERE ${where}
     GROUP BY i.product_id, i.name ORDER BY sales DESC LIMIT 10`, params);

  const byCategory = await query<any>(
    `SELECT COALESCE(c.name, 'Uncategorised') AS category, COALESCE(SUM(i.quantity), 0)::int AS units, COALESCE(SUM(i.line_total), 0) AS sales
     FROM pos_order_items i
     JOIN pos_orders o ON o.id = i.order_id
     JOIN pos_products p ON p.id = i.product_id
     LEFT JOIN pos_categories c ON c.id = p.category_id
     WHERE ${where}
     GROUP BY c.name ORDER BY sales DESC`, params);

  const byStaff = await query<any>(
    `SELECT st.id AS staff_id, st.name, COUNT(*)::int AS transactions, COALESCE(SUM(o.total), 0) AS sales
     FROM pos_orders o JOIN pos_staff st ON st.id = o.closed_by
     WHERE ${where}
     GROUP BY st.id, st.name ORDER BY sales DESC`, params);

  // Tips are attributed to the waiter who served the table (opened_by),
  // falling back to whoever took the payment.
  const tipsByStaff = await query<any>(
    `SELECT st.id AS staff_id, st.name, COUNT(*)::int AS orders,
            COALESCE(SUM(o.tip_amount), 0) AS tips,
            COALESCE(SUM(o.service_fee), 0) AS service_fees,
            COALESCE(SUM(o.tip_amount + o.service_fee), 0) AS total_tips
     FROM pos_orders o JOIN pos_staff st ON st.id = COALESCE(o.opened_by, o.closed_by)
     WHERE ${where} AND (o.tip_amount > 0 OR o.service_fee > 0)
     GROUP BY st.id, st.name ORDER BY total_tips DESC`, params);

  res.json({
    totals: {
      transaction_count: totals?.transaction_count ?? 0,
      total_sales: Number(totals?.total_sales ?? 0),
      total_discounts: Number(totals?.total_discounts ?? 0),
      total_service_fees: Number(totals?.total_service_fees ?? 0),
      total_tips: Number(totals?.total_tips ?? 0),
      cash_sales: Number(totals?.cash_sales ?? 0),
      card_sales: Number(totals?.card_sales ?? 0),
    },
    by_day: byDay.map(d => ({ ...d, sales: Number(d.sales) })),
    top_products: topProducts.map(p => ({ ...p, sales: Number(p.sales) })),
    by_category: byCategory.map(c => ({ ...c, sales: Number(c.sales) })),
    by_staff: byStaff.map(w => ({ ...w, sales: Number(w.sales) })),
    tips_by_staff: tipsByStaff.map(w => ({
      ...w, tips: Number(w.tips), service_fees: Number(w.service_fees), total_tips: Number(w.total_tips),
    })),
  });
});

router.get("/pos/reports/stock", requirePosAuth, requirePosManager, async (req: Request, res: Response): Promise<void> => {
  const s = getPosStaff(req);
  const products = await query<any>(
    `SELECT p.id, p.name, p.brand, p.has_variants, p.stock_qty, p.low_stock_threshold,
            c.name AS category_name
     FROM pos_products p
     LEFT JOIN pos_categories c ON c.id = p.category_id
     WHERE p.outlet_id = ? AND p.active = 1
     ORDER BY p.name`,
    [s.outlet_id]
  );
  const ids = products.map(p => p.id);
  let variantsByProduct: Record<number, any[]> = {};
  if (ids.length > 0) {
    const variants = await query<any>(
      `SELECT id, product_id, size, colour, sku, stock_qty FROM pos_variants
       WHERE product_id IN (${ids.map(() => "?").join(",")}) AND active = 1 ORDER BY id`,
      ids
    );
    for (const v of variants) (variantsByProduct[v.product_id] ??= []).push(v);
  }
  res.json({
    stock: products.map(p => {
      const variants = variantsByProduct[p.id] ?? [];
      const total = p.has_variants ? variants.reduce((sum: number, v: any) => sum + v.stock_qty, 0) : p.stock_qty;
      return {
        id: p.id, name: p.name, brand: p.brand, category_name: p.category_name,
        has_variants: p.has_variants, total_stock: total, low_stock_threshold: p.low_stock_threshold,
        low_stock: total <= p.low_stock_threshold,
        variants: variants.map((v: any) => ({
          id: v.id, label: [v.size, v.colour].filter(Boolean).join(" / ") || v.sku || `#${v.id}`,
          stock_qty: v.stock_qty, low_stock: v.stock_qty <= p.low_stock_threshold,
        })),
      };
    }),
  });
});

// ─── Walk-in golf bookings (pro shop till) ───────────────────────────────────
// Pro shop staff can book a tee time for walk-in golfers at the counter and
// take payment (cash/card). Bookings are created with booking_source
// 'club_counter' so they appear on the portal schedule and roll into the
// monthly counter-booking invoice exactly like portal walk-ins.

function requireProShop(req: Request, res: Response, next: NextFunction): void {
  const s = getPosStaff(req);
  if (!s || s.outlet_type !== "pro_shop") {
    res.status(403).json({ message: "Golf bookings are only available at pro shop outlets" });
    return;
  }
  next();
}

router.get("/pos/tee-times", requirePosAuth, requireProShop, async (req: Request, res: Response): Promise<void> => {
  const s = getPosStaff(req);
  const date = String(req.query["date"] ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { res.status(400).json({ message: "date (YYYY-MM-DD) required" }); return; }
  // The slots table can contain duplicate rows per date/time — offer the
  // lowest-id row per (tee_time, tee_start_type) as the bookable slot.
  const slots = await query<any>(
    `SELECT DISTINCT ON (pts.tee_time, pts.tee_start_type)
            pts.id, pts.tee_time AS time, pts.tee_start_type, pts.session_type,
            pts.max_players, pts.player_count,
            GREATEST(COALESCE(pts.max_players, 4) - COALESCE(pts.player_count, 0), 0) AS available
     FROM portal_tee_slots pts
     WHERE pts.club_id = ? AND pts.date = ? AND pts.is_active = 1 AND pts.event_id IS NULL
     ORDER BY pts.tee_time, pts.tee_start_type, pts.id`,
    [s.club_id, date]
  );
  res.json({
    slots: slots.map(sl => ({
      id: sl.id,
      time: String(sl.time).slice(0, 5),
      tee_start_type: sl.tee_start_type,
      session_type: sl.session_type,
      max_players: sl.max_players ?? 4,
      available: Number(sl.available),
    })),
  });
});

router.post("/pos/walk-in-bookings", requirePosAuth, requireProShop, async (req: Request, res: Response): Promise<void> => {
  const s = getPosStaff(req);
  const teeTimeId = parseInt(String(req.body?.tee_time_id ?? ""), 10);
  const players = parseInt(String(req.body?.players ?? ""), 10);
  const guestName = String(req.body?.guest_name ?? "").trim();
  const guestPhone = String(req.body?.guest_phone ?? "").trim() || null;
  const paymentMethod = String(req.body?.payment_method ?? "");
  if (!Number.isFinite(teeTimeId) || teeTimeId < 1) { res.status(400).json({ message: "tee_time_id required" }); return; }
  if (!Number.isFinite(players) || players < 1 || players > 4) { res.status(400).json({ message: "players must be 1-4" }); return; }
  if (!guestName) { res.status(400).json({ message: "Guest name is required" }); return; }
  if (paymentMethod !== "cash" && paymentMethod !== "card") { res.status(400).json({ message: "payment_method must be cash or card" }); return; }
  let feePerPlayer = 0;
  if (req.body?.green_fee_per_player != null && String(req.body.green_fee_per_player).trim() !== "") {
    feePerPlayer = Number(req.body.green_fee_per_player);
    if (!Number.isFinite(feePerPlayer) || feePerPlayer < 0) { res.status(400).json({ message: "green_fee_per_player must be zero or a positive amount" }); return; }
    feePerPlayer = Math.round(feePerPlayer * 100) / 100;
  }
  const totalAmount = Math.round(feePerPlayer * players * 100) / 100;

  const names: string[] = Array.isArray(req.body?.player_names)
    ? req.body.player_names.map((n: any) => String(n ?? "").trim()).slice(0, players)
    : [];

  // Optional: sell products (from the till cart) together with the booking —
  // one combined payment, all-or-nothing in a single transaction.
  let resolvedItems: any[] = [];
  if (req.body?.items != null) {
    if (!Array.isArray(req.body.items)) { res.status(400).json({ message: "items must be an array" }); return; }
    if (req.body.items.length > 0) {
      try {
        resolvedItems = await resolveSaleItems(req.body.items, s.outlet_id);
      } catch (err: any) {
        res.status(err.status ?? 500).json({ message: err.message ?? "Failed to validate sale items" });
        return;
      }
    }
  }

  try {
    const created = await withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('portal_slot_' || $1::text))", [teeTimeId]);
      // Atomic capacity check: only claims the seats if they are still free.
      const upd = await clientQuery(client,
        `UPDATE portal_tee_slots
         SET player_count = COALESCE(player_count, 0) + ?
         WHERE id = ? AND club_id = ? AND is_active = 1 AND event_id IS NULL
           AND COALESCE(player_count, 0) + ? <= COALESCE(max_players, 4)
         RETURNING id, date::text AS date, tee_time`,
        [players, teeTimeId, s.club_id, players]
      );
      if (upd.rows.length === 0) {
        const slot = await clientQuery(client,
          "SELECT id, GREATEST(COALESCE(max_players,4) - COALESCE(player_count,0), 0) AS available FROM portal_tee_slots WHERE id = ? AND club_id = ?",
          [teeTimeId, s.club_id]);
        const available = slot.rows[0] ? Number(slot.rows[0].available) : 0;
        throw Object.assign(new Error(slot.rows[0] ? `Only ${available} slot(s) available` : "Tee time not found"), { statusCode: slot.rows[0] ? 400 : 404 });
      }

      const bookingRef = `POS-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const ins = await clientQuery(client,
        `INSERT INTO bookings (user_id, portal_slot_id, players, total_amount, my_amount, club_amount, platform_fee,
           booking_ref, payment_method, status, holes, booking_source, guest_name, guest_email, guest_phone)
         VALUES (NULL, ?, ?, ?, 0, ?, 0, ?, ?, 'confirmed', 18, 'club_counter', ?, NULL, ?)
         RETURNING id`,
        [teeTimeId, players, totalAmount, totalAmount, bookingRef, paymentMethod, guestName, guestPhone]
      );
      const bookingId: number = ins.rows[0].id;
      for (let i = 0; i < players; i++) {
        const pName = names[i] || (i === 0 ? guestName : `${guestName} guest ${i + 1}`);
        await clientQuery(client,
          "INSERT INTO booking_players (booking_id, user_id, guest_name, guest_email, paid) VALUES (?, NULL, ?, NULL, 1)",
          [bookingId, pName]
        );
      }

      // Sell the cart items in the same transaction: a stock failure rolls the
      // booking back too, so the golfer is never booked without their goods
      // (and vice versa).
      let sale: any = null;
      if (resolvedItems.length > 0) {
        const orderRes = await clientQuery(client,
          "INSERT INTO pos_orders (outlet_id, order_type, opened_by) VALUES (?, 'counter', ?) RETURNING id",
          [s.outlet_id, s.id]
        );
        const orderId: number = orderRes.rows[0].id;
        for (const r of resolvedItems) {
          await clientQuery(client,
            "INSERT INTO pos_order_items (order_id, product_id, variant_id, name, variant_label, quantity, unit_price, line_total) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [orderId, r.productId, r.variantId, r.name, r.variantLabel, r.quantity, r.unitPrice, r.unitPrice * r.quantity]
          );
        }
        const totals = await finalizeOrderPaymentOn(client, orderId, s.outlet_id, s.id, paymentMethod);
        sale = { order_id: orderId, ...totals };
      }

      return {
        id: bookingId, booking_ref: bookingRef,
        date: String(upd.rows[0].date).slice(0, 10), time: String(upd.rows[0].tee_time).slice(0, 5),
        sale,
      };
    });

    const productsTotal = created.sale ? Number(created.sale.total) : 0;
    const grandTotal = Math.round((totalAmount + productsTotal) * 100) / 100;
    logger.info({ bookingId: created.id, staffId: s.id, outletId: s.outlet_id, players, totalAmount, productsTotal }, "POS walk-in booking created");
    res.json({
      ...created, players, guest_name: guestName,
      green_fee_per_player: feePerPlayer, green_fee_total: totalAmount,
      products_total: productsTotal, total: totalAmount, grand_total: grandTotal,
      payment_method: paymentMethod,
    });
  } catch (err: any) {
    const status = err?.statusCode ?? err?.status;
    if (status) { res.status(status).json({ message: err.message }); return; }
    logger.error({ err }, "POS walk-in booking failed");
    res.status(500).json({ message: "Could not create booking" });
  }
});

export default router;
