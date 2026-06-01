import { Router, type IRouter } from "express";
import { query, row, exec } from "../lib/pg";
import { getUser, isStaff, effectiveClubId } from "../lib/auth";
import { saveUserNotification } from "../lib/userNotifications";
import { sendPushNotifications } from "../lib/notifications";

const router: IRouter = Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateVoucherCode(clubName: string, userId: number): string {
  const slug = clubName.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3).padEnd(3, "X");
  const uid  = String(userId).padStart(4, "0");
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `CV-${slug}-${uid}-${rand}`;
}

async function ensureUniqueCode(clubName: string, userId: number): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateVoucherCode(clubName, userId);
    const existing = await row<any>("SELECT id FROM cancellation_vouchers WHERE code = ?", [code]);
    if (!existing) return code;
  }
  throw new Error("Could not generate unique voucher code");
}

// ── GET /admin/cancellation-vouchers/preview ──────────────────────────────────
// Preview affected bookings for a given date (before issuing vouchers)
router.get("/admin/cancellation-vouchers/preview", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!isStaff(user)) { res.status(403).json({ message: "Forbidden" }); return; }
  const clubId = effectiveClubId(user, req.query.club_id);
  if (!clubId) { res.status(400).json({ message: "club_id required" }); return; }

  const date = req.query.date ? String(req.query.date) : null;

  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ message: "date must be YYYY-MM-DD" });
    return;
  }

  let affected: any[];
  if (date) {
    affected = await query<any>(
      `SELECT DISTINCT u.id, u.name, u.email, b.id as booking_id,
              pts.tee_time as time
       FROM bookings b
       LEFT JOIN portal_tee_slots pts ON pts.id = b.portal_slot_id
       JOIN users u ON u.id = b.user_id
       WHERE pts.club_id = ?
         AND pts.date = ?
         AND b.status IN ('confirmed','pending')
       ORDER BY pts.tee_time, u.name`,
      [clubId, date]
    );
  } else {
    affected = [];
  }

  res.json({ count: affected.length, users: affected });
});

// ── POST /admin/cancellation-vouchers/issue ───────────────────────────────────
// Issue unique per-user vouchers for all affected bookings on a date
// Body: { affected_date?, reason, value_rands?, expires_in_days?, booking_ids? }
router.post("/admin/cancellation-vouchers/issue", async (req, res): Promise<void> => {
  const caller = await getUser(req);
  if (!isStaff(caller)) { res.status(403).json({ message: "Forbidden" }); return; }
  const clubId = effectiveClubId(caller, req.body?.club_id);
  if (!clubId) { res.status(400).json({ message: "club_id required" }); return; }

  const { affected_date, reason, value_rands, expires_in_days, booking_ids } = req.body ?? {};

  if (!reason || !String(reason).trim()) {
    res.status(400).json({ message: "reason is required" });
    return;
  }

  const club = await row<any>("SELECT id, name FROM clubs WHERE id = ?", [clubId]);
  if (!club) { res.status(404).json({ message: "Club not found" }); return; }

  // Compute expiry timestamp
  const expiresAt: string | null = expires_in_days
    ? new Date(Date.now() + Number(expires_in_days) * 86_400_000).toISOString()
    : null;

  const dateParam: string | null = affected_date || null;

  // Get affected users — either from explicit booking_ids or from the date
  let recipients: any[];
  if (Array.isArray(booking_ids) && booking_ids.length > 0) {
    recipients = await query<any>(
      `SELECT DISTINCT u.id, u.name, u.email, u.push_token, b.id as booking_id
       FROM bookings b
       JOIN users u ON u.id = b.user_id
       WHERE b.id = ANY(?::int[])
         AND b.status IN ('confirmed','pending')`,
      [booking_ids]
    );
  } else if (dateParam) {
    recipients = await query<any>(
      `SELECT DISTINCT u.id, u.name, u.email, u.push_token, b.id as booking_id
       FROM bookings b
       LEFT JOIN portal_tee_slots pts ON pts.id = b.portal_slot_id
       JOIN users u ON u.id = b.user_id
       WHERE pts.club_id = ?
         AND pts.date = ?
         AND b.status IN ('confirmed','pending')`,
      [clubId, dateParam]
    );
  } else {
    res.status(400).json({ message: "Either affected_date or booking_ids is required" });
    return;
  }

  if (recipients.length === 0) {
    res.status(400).json({ message: "No affected bookings found for the given criteria" });
    return;
  }

  // De-duplicate by user (one voucher per user per batch, even if they had multiple bookings)
  const seen = new Set<number>();
  const uniqueRecipients = recipients.filter((r: any) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });

  // Create the batch record
  const batchRow = await row<any>(
    `INSERT INTO cancellation_voucher_batches
       (club_id, issued_by, reason, affected_date, value_rands, expires_at, voucher_count)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [clubId, caller.id, String(reason).trim(), dateParam, value_rands ?? null, expiresAt, uniqueRecipients.length]
  );
  const batchId = batchRow.id;

  // Issue one voucher per unique user
  const issued: { userId: number; name: string; code: string }[] = [];
  for (const recipient of uniqueRecipients) {
    const code = await ensureUniqueCode(club.name, recipient.id);

    // Find the first booking for this user on the date (for the booking_id link)
    const bookingForUser = recipients.find((r: any) => r.id === recipient.id);

    await exec(
      `INSERT INTO cancellation_vouchers
         (code, batch_id, club_id, user_id, booking_id, reason, value_rands, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        code,
        batchId,
        clubId,
        recipient.id,
        bookingForUser?.booking_id ?? null,
        String(reason).trim(),
        value_rands ?? null,
        expiresAt,
      ]
    );

    issued.push({ userId: recipient.id, name: recipient.name, code });

    // In-app notification (always)
    const notifTitle = `Voucher from ${club.name}`;
    const valueStr   = value_rands ? ` worth R${Number(value_rands).toFixed(2)}` : "";
    const expiryStr  = expiresAt
      ? ` — valid until ${new Date(expiresAt).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}`
      : "";
    const notifBody  = `You've received a cancellation voucher${valueStr}${expiryStr}. Your code: ${code}`;

    saveUserNotification(recipient.id, "cancellation_voucher", notifTitle, notifBody, {
      code,
      club_id:    clubId,
      batch_id:   batchId,
      value_rands: value_rands ?? null,
    });

    // Push notification (best-effort)
    if (recipient.push_token?.startsWith("ExponentPushToken[")) {
      sendPushNotifications([{
        to:    recipient.push_token,
        sound: "default",
        title: notifTitle,
        body:  notifBody,
        data:  { type: "cancellation_voucher", code, club_id: clubId },
      }]);
    }
  }

  res.json({ success: true, batch_id: batchId, voucher_count: issued.length, vouchers: issued });
});

// ── GET /admin/cancellation-vouchers/batches ──────────────────────────────────
// List past voucher batches for this club
router.get("/admin/cancellation-vouchers/batches", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!isStaff(user)) { res.status(403).json({ message: "Forbidden" }); return; }
  const clubId = effectiveClubId(user, req.query.club_id);
  if (!clubId) { res.status(400).json({ message: "club_id required" }); return; }

  const limit  = Math.min(parseInt(String(req.query.limit  ?? "30"), 10), 100);
  const offset = parseInt(String(req.query.offset ?? "0"), 10);

  const batches = await query<any>(
    `SELECT b.id, b.reason, b.affected_date, b.value_rands, b.expires_at,
            b.voucher_count, b.created_at,
            u.name as issued_by_name,
            COUNT(cv.id) FILTER (WHERE cv.redeemed_at IS NOT NULL) as redeemed_count
     FROM cancellation_voucher_batches b
     JOIN users u ON u.id = b.issued_by
     LEFT JOIN cancellation_vouchers cv ON cv.batch_id = b.id
     WHERE b.club_id = ?
     GROUP BY b.id, u.name
     ORDER BY b.created_at DESC
     LIMIT ${limit} OFFSET ${offset}`,
    [clubId]
  );

  res.json({ batches });
});

// ── GET /admin/cancellation-vouchers/batches/:batchId ────────────────────────
// List individual vouchers in a batch
router.get("/admin/cancellation-vouchers/batches/:batchId", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!isStaff(user)) { res.status(403).json({ message: "Forbidden" }); return; }
  const clubId = effectiveClubId(user, req.query.club_id);
  if (!clubId) { res.status(400).json({ message: "club_id required" }); return; }

  const batchId = parseInt(req.params.batchId, 10);

  // Confirm the batch belongs to this club
  const batch = await row<any>(
    "SELECT * FROM cancellation_voucher_batches WHERE id = ? AND club_id = ?",
    [batchId, clubId]
  );
  if (!batch) { res.status(404).json({ message: "Batch not found" }); return; }

  const vouchers = await query<any>(
    `SELECT cv.id, cv.code, cv.value_rands, cv.redeemed_at, cv.expires_at, cv.created_at,
            u.name as user_name, u.email as user_email
     FROM cancellation_vouchers cv
     JOIN users u ON u.id = cv.user_id
     WHERE cv.batch_id = ?
     ORDER BY u.name`,
    [batchId]
  );

  res.json({ batch, vouchers });
});

// ── GET /profile/cancellation-vouchers ───────────────────────────────────────
// A user's own cancellation vouchers (for mobile profile screen)
router.get("/profile/cancellation-vouchers", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const vouchers = await query<any>(
    `SELECT cv.id, cv.code, cv.value_rands, cv.redeemed_at, cv.expires_at, cv.created_at,
            c.name as club_name, c.location as club_location,
            cvb.reason, cvb.affected_date
     FROM cancellation_vouchers cv
     JOIN clubs c ON c.id = cv.club_id
     JOIN cancellation_voucher_batches cvb ON cvb.id = cv.batch_id
     WHERE cv.user_id = ?
     ORDER BY cv.created_at DESC`,
    [user.id]
  );

  res.json({ vouchers });
});

// ── POST /cancellation-vouchers/validate ─────────────────────────────────────
// Validate a cancellation voucher code for the authenticated user at checkout
router.post("/cancellation-vouchers/validate", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const { code } = req.body ?? {};
  if (!code) { res.status(400).json({ valid: false, message: "code is required" }); return; }

  const voucher = await row<any>(
    `SELECT cv.*, c.name as club_name
     FROM cancellation_vouchers cv
     JOIN clubs c ON c.id = cv.club_id
     WHERE cv.code = ? AND cv.user_id = ?`,
    [String(code).toUpperCase().trim(), user.id]
  );

  if (!voucher) {
    res.status(404).json({ valid: false, message: "Voucher not found or not assigned to your account" });
    return;
  }
  if (voucher.redeemed_at) {
    res.status(400).json({ valid: false, message: "This voucher has already been redeemed" });
    return;
  }
  if (voucher.expires_at && new Date(voucher.expires_at) < new Date()) {
    res.status(400).json({ valid: false, message: "This voucher has expired" });
    return;
  }

  res.json({
    valid:       true,
    code:        voucher.code,
    value_rands: voucher.value_rands ? parseFloat(voucher.value_rands) : null,
    club_name:   voucher.club_name,
    club_id:     voucher.club_id,
    expires_at:  voucher.expires_at,
  });
});

export default router;
