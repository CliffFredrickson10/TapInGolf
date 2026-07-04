import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { query, row, exec, run } from "../lib/pg";
import { generateToken, getUser } from "../lib/auth";
import { getHnaStatus } from "../lib/hna";
import { generateOTP, hashOTP, generateResetToken, normalizePhone, sendOTPEmail, sendOTPPhone } from "../lib/otp";
import { logger } from "../lib/logger";
import { nextMemberNumber } from "../lib/memberNumber";

const router: IRouter = Router();

// Version of the Privacy Policy currently in force (matches the Effective date shown
// in the mobile app's Privacy Policy screen). Stored against each user at sign-up so
// we have an auditable record of what they consented to (POPIA).
const PRIVACY_POLICY_VERSION = "2026-05-31";

// pg driver returns DATE columns as JS Date objects; String() gives "Fri Jan 29 …"
// Use toISOString() when available so we always get "YYYY-MM-DD".
const fmtDate = (d: unknown): string | null => {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
};

router.post("/auth/login", async (req, res): Promise<void> => {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    res.status(400).json({ message: "Email and password are required" });
    return;
  }

  const user = await row<any>(
    "SELECT * FROM users WHERE email = ?",
    [String(email).trim().toLowerCase()]
  );

  if (!user) {
    res.status(401).json({ message: "Invalid email or password" });
    return;
  }

  const valid = await bcrypt.compare(String(password), user.password_hash);
  if (!valid) {
    res.status(401).json({ message: "Invalid email or password" });
    return;
  }

  const token = generateToken(user.id);
  const hna = await getHnaStatus(user.id, user.hna_number);
  res.json({
    user: {
      id:                    user.id,
      name:                  user.name,
      email:                 user.email,
      phone:                 user.phone ?? null,
      handicap:              user.handicap ? parseFloat(user.handicap) : null,
      role:                  user.role,
      club_id:               user.club_id ?? null,
      avatar:                user.profile_picture ?? null,
      gender:                user.gender ?? null,
      date_of_birth:         fmtDate(user.date_of_birth),
      home_province:         user.home_province ?? null,
      hna_number:            hna.hna_number,
      hna_verified:          hna.hna_verified,
      hna_verified_club_name: hna.hna_verified_club_name,
      hna_valid_until:       hna.hna_valid_until,
      student_number:        user.student_number ?? null,
      hna_locked:            hna.hna_locked,
      student_number_locked: user.student_number_locked === 1 || user.student_number_locked === true,
      is_super_user:         user.is_super_user === 1 || user.is_super_user === true,
      terms_accepted:        user.terms_accepted_at != null,
      chat_disabled:         user.chat_disabled === 1 || user.chat_disabled === true,
      token,
    },
  });
});

router.post("/auth/register", async (req, res): Promise<void> => {
  const { name, email, password, phone, terms_accepted } = req.body ?? {};
  if (!name || !email || !password) {
    res.status(400).json({ message: "Name, email and password are required" });
    return;
  }
  if (terms_accepted !== true) {
    res.status(400).json({ message: "You must accept the Terms of Use & Community Guidelines to create an account" });
    return;
  }

  const emailStr = String(email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr)) {
    res.status(400).json({ message: "Invalid email address" });
    return;
  }

  // Validate + normalise phone to E.164 if one was supplied (POPIA data quality —
  // reject arbitrary strings rather than storing them). Phone remains optional.
  let normalizedPhone: string | null = null;
  if (phone && String(phone).trim() !== "") {
    normalizedPhone = normalizePhone(String(phone));
    if (!normalizedPhone) {
      res.status(400).json({ message: "Enter a valid South African phone number (e.g. 082 123 4567)" });
      return;
    }
  }

  const existing = await row("SELECT id FROM users WHERE email = ?", [emailStr]);
  if (existing) {
    res.status(409).json({ message: "An account with this email already exists" });
    return;
  }

  const SUPER_USER_EMAILS = ["marco@tapingolf.co.za", "cliff@tapingolf.co.za"];
  const isSuperUser = SUPER_USER_EMAILS.includes(emailStr);

  const hash = await bcrypt.hash(String(password), 10);
  const id = await exec(
    "INSERT INTO users (name, email, password_hash, phone, role, is_super_user, terms_accepted_at, privacy_accepted_at, privacy_policy_version) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW(), ?)",
    [String(name).trim(), emailStr, hash, normalizedPhone, "golfer", isSuperUser ? 1 : 0, PRIVACY_POLICY_VERSION]
  );

  // Auto-create friendships from any pending invitations sent to this email
  const pendingInvites = await query<any>(
    `SELECT inviter_id FROM pending_invitations WHERE invitee_email = ?`,
    [emailStr]
  );
  for (const inv of pendingInvites) {
    try {
      await exec(
        `INSERT INTO friendships (requester_id, addressee_id, status) VALUES (?, ?, 'accepted') ON CONFLICT (requester_id, addressee_id) DO NOTHING`,
        [inv.inviter_id, id]
      );
    } catch { /* ignore duplicate */ }
  }
  if (pendingInvites.length > 0) {
    await run(`DELETE FROM pending_invitations WHERE invitee_email = ?`, [emailStr]);
  }

  // Promote any pending club memberships a club added for this email before the golfer
  // signed up. These become real memberships and set the golfer's HNA number (the club
  // roster is authoritative). Once promoted, the HNA is club-verified.
  const pendingMemberships = await query<any>(
    `SELECT * FROM pending_memberships WHERE email = ?`,
    [emailStr]
  );
  const promotedPendingIds: number[] = [];
  for (const pm of pendingMemberships) {
    try {
      // Carry the club member number over from the pending row; if it clashed
      // with a number assigned to someone else in the meantime, take the next one.
      let memberNo: number | null = Number(pm.member_number) || null;
      if (memberNo) {
        const clash = await row<any>(
          "SELECT 1 AS x FROM club_members WHERE club_id = ? AND member_number = ? AND user_id != ?",
          [pm.club_id, memberNo, id]
        );
        if (clash) memberNo = await nextMemberNumber(pm.club_id);
      } else {
        memberNo = await nextMemberNumber(pm.club_id);
      }
      await exec(
        `INSERT INTO club_members
           (club_id, user_id, membership_type, status, added_by, start_date, renewal_date, benefits, prepaid_rounds, member_number)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (club_id, user_id) DO UPDATE SET
           membership_type = EXCLUDED.membership_type,
           status          = EXCLUDED.status,
           start_date      = EXCLUDED.start_date,
           renewal_date    = EXCLUDED.renewal_date,
           benefits        = EXCLUDED.benefits,
           prepaid_rounds  = EXCLUDED.prepaid_rounds,
           member_number   = COALESCE(club_members.member_number, EXCLUDED.member_number)`,
        [pm.club_id, id, pm.membership_type || "standard", pm.status || "active", pm.club_id,
         fmtDate(pm.start_date), fmtDate(pm.renewal_date), pm.benefits ?? null, Number(pm.prepaid_rounds) || 0, memberNo]
      );
      // Set home club if the user doesn't have one yet
      await exec("UPDATE users SET club_id = ? WHERE id = ? AND club_id IS NULL", [pm.club_id, id]);
      const pmHna = pm.hna_number ? String(pm.hna_number).trim().replace(/\D/g, "") || null : null;
      const pmStu = pm.student_number ? String(pm.student_number).trim() || null : null;
      if (pmHna || pmStu) {
        await exec(
          `UPDATE users SET
             hna_number     = COALESCE(?, hna_number),
             student_number = COALESCE(?, student_number)
           WHERE id = ?`,
          [pmHna, pmStu, id]
        );
      }
      promotedPendingIds.push(pm.id);
    } catch (err: any) {
      logger.error({ err, email: emailStr, club_id: pm.club_id }, "register: failed to promote pending membership");
    }
  }
  // Only remove the rows we actually promoted — leave any that failed so they can be
  // retried on a later sign-in/registration rather than silently lost.
  if (promotedPendingIds.length > 0) {
    const placeholders = promotedPendingIds.map(() => "?").join(",");
    await run(`DELETE FROM pending_memberships WHERE id IN (${placeholders})`, promotedPendingIds);
  }

  const token = generateToken(id);
  const fresh = await row<any>("SELECT hna_number, student_number FROM users WHERE id = ?", [id]);
  const hna = await getHnaStatus(id, fresh?.hna_number ?? null);
  res.status(201).json({
    user: {
      id,
      name:                  String(name).trim(),
      email:                 emailStr,
      phone:                 normalizedPhone,
      handicap:              null,
      role:                  "golfer",
      club_id:               null,
      avatar:                null,
      gender:                null,
      date_of_birth:         null,
      home_province:         null,
      hna_number:            hna.hna_number,
      hna_verified:          hna.hna_verified,
      hna_verified_club_name: hna.hna_verified_club_name,
      hna_valid_until:       hna.hna_valid_until,
      student_number:        fresh?.student_number ?? null,
      hna_locked:            hna.hna_locked,
      student_number_locked: false,
      is_super_user:         isSuperUser,
      terms_accepted:        true,
      chat_disabled:         false,
      token,
    },
  });
});

router.get("/profile", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const fresh = await row<any>("SELECT * FROM users WHERE id = ?", [user.id]);
  if (!fresh) { res.status(404).json({ message: "User not found" }); return; }

  const adSub = await row<any>(
    `SELECT expires_at FROM user_ad_removal
     WHERE user_id = ? AND status = 'active' AND expires_at > NOW()
     ORDER BY expires_at DESC LIMIT 1`,
    [fresh.id]
  );

  const hna = await getHnaStatus(fresh.id, fresh.hna_number);
  res.json({
    user: {
      id:            fresh.id,
      name:          fresh.name,
      email:         fresh.email,
      phone:         fresh.phone ?? null,
      handicap:      fresh.handicap ? parseFloat(fresh.handicap) : null,
      role:          fresh.role,
      club_id:       fresh.club_id ?? null,
      avatar:        fresh.profile_picture ?? null,
      gender:        fresh.gender ?? null,
      date_of_birth: fmtDate(fresh.date_of_birth),
      home_province: fresh.home_province ?? null,
      hna_number:            hna.hna_number,
      hna_verified:          hna.hna_verified,
      hna_verified_club_name: hna.hna_verified_club_name,
      hna_valid_until:       hna.hna_valid_until,
      student_number:        fresh.student_number ?? null,
      hna_locked:            hna.hna_locked,
      student_number_locked: fresh.student_number_locked === 1 || fresh.student_number_locked === true,
      ad_free_until: adSub ? String(adSub.expires_at) : null,
      is_super_user: fresh.is_super_user === 1 || fresh.is_super_user === true,
      terms_accepted: fresh.terms_accepted_at != null,
      chat_disabled: fresh.chat_disabled === 1 || fresh.chat_disabled === true,
    },
  });
});

// One-time acceptance of the Terms of Use & Community Guidelines. Used by the
// launch-time gate shown to users who registered before terms acceptance existed.
router.post("/profile/accept-terms", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }
  await exec("UPDATE users SET terms_accepted_at = NOW() WHERE id = ? AND terms_accepted_at IS NULL", [user.id]);
  res.json({ success: true });
});

router.put("/profile", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const { name, phone, handicap, gender, date_of_birth, home_province, hna_number, student_number, email, password } = req.body ?? {};

  // Validate + normalise phone to E.164 if one was supplied (POPIA data quality).
  // Phone remains optional; clearing it stores NULL.
  let normalizedPhone: string | null = null;
  if (phone && String(phone).trim() !== "") {
    normalizedPhone = normalizePhone(String(phone));
    if (!normalizedPhone) {
      res.status(400).json({ message: "Enter a valid South African phone number (e.g. 082 123 4567)" }); return;
    }
  }

  // Email change — validate + uniqueness check
  if (email && String(email).trim().toLowerCase() !== user.email) {
    const emailStr = String(email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr)) {
      res.status(400).json({ message: "Invalid email address" }); return;
    }
    const existing = await row("SELECT id FROM users WHERE email = ? AND id != ?", [emailStr, user.id]);
    if (existing) {
      res.status(409).json({ message: "That email is already in use by another account" }); return;
    }
    await exec("UPDATE users SET email = ? WHERE id = ?", [emailStr, user.id]);
  }

  // Password change
  if (password && String(password).length > 0) {
    if (String(password).length < 6) {
      res.status(400).json({ message: "Password must be at least 6 characters" }); return;
    }
    const hash = await bcrypt.hash(String(password), 10);
    await exec("UPDATE users SET password_hash = ? WHERE id = ?", [hash, user.id]);
  }

  // HNA lock is DERIVED from club verification, not a stored flag: a golfer can edit
  // their HNA only while it is not currently club-verified (no active, non-expired
  // membership anywhere). The student-number lock remains a stored flag.
  const lockRow = await row<any>("SELECT hna_number, student_number_locked FROM users WHERE id = ?", [user.id]);
  const currentHna = await getHnaStatus(user.id, lockRow?.hna_number ?? null);
  const hnaLocked = currentHna.hna_verified;
  const stuLocked = lockRow?.student_number_locked === 1 || lockRow?.student_number_locked === true;

  // Validate HNA number (only if not locked)
  if (!hnaLocked && hna_number !== undefined && hna_number !== null && String(hna_number).trim() !== "") {
    const cleaned = String(hna_number).trim().replace(/\D/g, "");
    if (cleaned.length !== 10) {
      res.status(400).json({ message: "HNA membership number must be exactly 10 digits" }); return;
    }
  }

  // Compute final hna/student values — ignore the submitted value if the field is locked
  const finalHna = hnaLocked
    ? undefined
    : (hna_number !== undefined && hna_number !== null && String(hna_number).trim() !== ""
        ? String(hna_number).trim().replace(/\D/g, "")
        : null);
  const finalStudent = stuLocked
    ? undefined
    : (student_number !== undefined && student_number !== null ? (String(student_number).trim() || null) : null);

  // Update profile fields
  await exec(
    `UPDATE users SET name = ?, phone = ?, handicap = ?, gender = ?, date_of_birth = ?, home_province = ?
       ${!hnaLocked ? ", hna_number = ?" : ""}
       ${!stuLocked ? ", student_number = ?" : ""}
     WHERE id = ?`,
    [
      name ?? user.name,
      normalizedPhone,
      handicap ?? null,
      gender || null,
      date_of_birth || null,
      home_province || null,
      ...(!hnaLocked ? [finalHna] : []),
      ...(!stuLocked ? [finalStudent] : []),
      user.id,
    ]
  );

  const fresh = await row<any>("SELECT * FROM users WHERE id = ?", [user.id]);
  const hnaOut = await getHnaStatus(fresh.id, fresh.hna_number);
  res.json({
    success: true,
    user: {
      id:            fresh.id,
      name:          fresh.name,
      email:         fresh.email,
      phone:         fresh.phone ?? null,
      handicap:      fresh.handicap ? parseFloat(fresh.handicap) : null,
      role:          fresh.role,
      club_id:       fresh.club_id ?? null,
      avatar:        fresh.profile_picture ?? null,
      gender:        fresh.gender ?? null,
      date_of_birth: fmtDate(fresh.date_of_birth),
      home_province: fresh.home_province ?? null,
      hna_number:            hnaOut.hna_number,
      hna_verified:          hnaOut.hna_verified,
      hna_verified_club_name: hnaOut.hna_verified_club_name,
      hna_valid_until:       hnaOut.hna_valid_until,
      student_number:        fresh.student_number ?? null,
      hna_locked:            hnaOut.hna_locked,
      student_number_locked: fresh.student_number_locked === 1 || fresh.student_number_locked === true,
    },
  });
});

router.put("/profile/push-token", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const { push_token } = req.body ?? {};
  if (!push_token || typeof push_token !== "string") {
    res.status(400).json({ message: "push_token is required" });
    return;
  }
  await exec("UPDATE users SET push_token = ? WHERE id = ?", [push_token, user.id]);
  res.json({ success: true });
});

router.put("/profile/picture", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const { picture } = req.body ?? {};
  if (!picture || typeof picture !== "string") {
    res.status(400).json({ message: "picture is required" });
    return;
  }
  // Accept base64 data URIs only
  if (!picture.startsWith("data:image/")) {
    res.status(400).json({ message: "Invalid image format" });
    return;
  }
  // Limit size to ~2MB of base64 (~1.5MB actual)
  if (picture.length > 2_800_000) {
    res.status(413).json({ message: "Image too large (max ~2MB)" });
    return;
  }
  await exec("UPDATE users SET profile_picture = ? WHERE id = ?", [picture, user.id]);
  res.json({ success: true, avatar: picture });
});

// ── POST /auth/forgot-password ────────────────────────────────────────────
// Generates a 6-digit OTP and sends it to the user's email (primary).
router.post("/auth/forgot-password", async (req, res): Promise<void> => {
  const rawEmail = String(req.body?.email ?? "").trim().toLowerCase();
  if (!rawEmail) { res.status(400).json({ message: "Email address is required" }); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
    res.status(400).json({ message: "Invalid email address" }); return;
  }

  const user = await row<any>("SELECT id, name, email FROM users WHERE email = ?", [rawEmail]);
  // Always respond 200 to avoid revealing whether an email is registered
  if (!user) {
    res.json({ success: true, message: "If that email is registered, a code has been sent." });
    return;
  }

  // Rate limit: max 3 OTPs per email in the last hour
  const recent = await row<any>(
    `SELECT COUNT(*) as cnt FROM password_reset_otps
     WHERE email = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)`,
    [rawEmail]
  );
  if (parseInt(recent?.cnt ?? "0") >= 3) {
    res.status(429).json({ message: "Too many attempts. Please wait an hour before trying again." });
    return;
  }

  const otp       = generateOTP();
  const otpHash   = hashOTP(otp);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  await exec(
    `INSERT INTO password_reset_otps (user_id, email, otp_hash, expires_at)
     VALUES (?, ?, ?, ?)`,
    [user.id, rawEmail, otpHash, expiresAt]
  );

  let devOtp: string | undefined;
  try {
    const result = await sendOTPEmail(rawEmail, otp);
    if (result.dev) devOtp = otp;
  } catch (err) {
    logger.error({ err, email: rawEmail }, "Failed to send OTP email");
    res.status(500).json({ message: "Failed to send verification code. Please try again." });
    return;
  }

  const response: Record<string, any> = {
    success: true,
    message: "Verification code sent.",
  };
  if (devOtp) response.dev_otp = devOtp;

  res.json(response);
});

// ── POST /auth/verify-otp ─────────────────────────────────────────────────
// Verifies the 6-digit OTP (email) and returns a short-lived reset_token.
router.post("/auth/verify-otp", async (req, res): Promise<void> => {
  const rawEmail = String(req.body?.email ?? "").trim().toLowerCase();
  const rawOtp   = String(req.body?.otp   ?? "").trim();

  if (!rawEmail || !rawOtp) { res.status(400).json({ message: "Email and OTP are required" }); return; }

  const otpHash = hashOTP(rawOtp);

  const record = await row<any>(
    `SELECT id, user_id, expires_at, used_at FROM password_reset_otps
     WHERE email = ? AND otp_hash = ?
     ORDER BY created_at DESC LIMIT 1`,
    [rawEmail, otpHash]
  );

  if (!record) { res.status(400).json({ message: "Invalid or expired code." }); return; }
  if (record.used_at) { res.status(400).json({ message: "This code has already been used." }); return; }
  if (new Date(record.expires_at) < new Date()) {
    res.status(400).json({ message: "This code has expired. Please request a new one." });
    return;
  }

  const resetToken = generateResetToken();
  await exec(
    "UPDATE password_reset_otps SET reset_token = ? WHERE id = ?",
    [resetToken, record.id]
  );

  res.json({ success: true, reset_token: resetToken });
});

// ── POST /auth/reset-password ─────────────────────────────────────────────
// Accepts the reset_token and sets the new password.
router.post("/auth/reset-password", async (req, res): Promise<void> => {
  const resetToken  = String(req.body?.reset_token  ?? "").trim();
  const newPassword = String(req.body?.new_password ?? "").trim();

  if (!resetToken || !newPassword) {
    res.status(400).json({ message: "reset_token and new_password are required" }); return;
  }
  if (newPassword.length < 6) {
    res.status(400).json({ message: "Password must be at least 6 characters" }); return;
  }

  const record = await row<any>(
    `SELECT id, user_id, expires_at, used_at FROM password_reset_otps
     WHERE reset_token = ? LIMIT 1`,
    [resetToken]
  );

  if (!record) { res.status(400).json({ message: "Invalid or expired reset link." }); return; }
  if (record.used_at) { res.status(400).json({ message: "This reset link has already been used." }); return; }
  if (new Date(record.expires_at) < new Date()) {
    res.status(400).json({ message: "This reset link has expired. Please start over." }); return;
  }

  const hash = await bcrypt.hash(newPassword, 10);
  await exec("UPDATE users SET password_hash = ? WHERE id = ?", [hash, record.user_id]);
  await exec("UPDATE password_reset_otps SET used_at = NOW() WHERE id = ?", [record.id]);

  res.json({ success: true, message: "Password has been reset successfully." });
});

router.get("/users/search", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }
  const q = String(req.query.q ?? "").trim();
  if (q.length < 2) { res.json({ users: [] }); return; }
  const results = await query<any>(
    `SELECT id, name, email, handicap,
            profile_picture AS avatar
     FROM users
     WHERE (name ILIKE ? OR email ILIKE ?) AND id != ?
     ORDER BY name ASC
     LIMIT 20`,
    [`%${q}%`, `%${q}%`, user.id]
  );
  res.json({ users: results.map((u: any) => ({
    id:       u.id,
    name:     u.name,
    email:    u.email,
    handicap: u.handicap ? parseFloat(u.handicap) : null,
    avatar:   u.avatar ?? null,
  })) });
});

export default router;
