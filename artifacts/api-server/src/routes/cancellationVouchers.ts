import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { query, row, exec } from "../lib/pg";
import { getUser } from "../lib/auth";
import { requireClubAuth, getClub } from "../lib/portalAuth";
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

// ── Fetch affected players for a date (+ optional from_time / to_time) ────────
// Returns one record per (user, booking) combo:
//   - Booking creators: voucher_value = total_amount (non-split) or my_amount/bp.amount (split)
//   - Split-bill co-players: voucher_value = their bp.amount
// Then de-duplicated by user_id (first booking wins per user).
async function fetchAffectedPlayers(
  clubId: number,
  date: string,
  fromTime: string | null,
  toTime: string | null = null
): Promise<Array<{
  id: number;
  name: string;
  email: string;
  push_token: string | null;
  booking_id: number;
  voucher_value: number | null;
  time: string;
  payment_method: string | null;
}>> {
  // Build a time-range filter from the optional from_time / to_time bounds.
  const timeClauses: string[] = [];
  const timeValues: string[]  = [];
  if (fromTime) { timeClauses.push("pts.tee_time >= ?"); timeValues.push(fromTime); }
  if (toTime)   { timeClauses.push("pts.tee_time <= ?"); timeValues.push(toTime);   }
  const timeFilter = timeClauses.length ? "AND " + timeClauses.join(" AND ") : "";

  // 1. Booking creators — only confirmed bookings (pending = Stitch payment not yet received)
  const creatorsParams: any[] = [clubId, date, ...timeValues];

  const creators = await query<any>(
    `SELECT
       u.id, u.name, u.email, u.push_token,
       b.id AS booking_id,
       b.total_amount, b.my_amount, b.split_bill,
       b.payment_method AS booking_payment_method,
       pts.tee_time AS time,
       (SELECT bp.amount FROM booking_players bp
         WHERE bp.booking_id = b.id AND bp.user_id = u.id LIMIT 1) AS bp_amount
     FROM bookings b
     JOIN users u ON u.id = b.user_id
     JOIN portal_tee_slots pts ON pts.id = b.portal_slot_id
     WHERE pts.club_id = ?
       AND pts.date = ?
       AND b.status = 'confirmed'
       ${timeFilter}
     ORDER BY pts.tee_time, u.name`,
    creatorsParams
  );

  // 2. Split-bill co-players (registered users who are NOT the booking creator)
  //    Only include co-players who have actually paid their share (bp.paid = 1).
  //    bp.payment_method tracks how they paid (stitch/wallet/prepaid/null for legacy).
  const coParams: any[] = [clubId, date, ...timeValues];

  const coPlayers = await query<any>(
    `SELECT
       u.id, u.name, u.email, u.push_token,
       b.id AS booking_id,
       bp.amount AS voucher_value,
       bp.payment_method AS co_payment_method,
       pts.tee_time AS time
     FROM bookings b
     JOIN booking_players bp
       ON bp.booking_id = b.id
       AND bp.user_id IS NOT NULL
       AND bp.user_id != b.user_id
       AND bp.paid = 1
     JOIN users u ON u.id = bp.user_id
     JOIN portal_tee_slots pts ON pts.id = b.portal_slot_id
     WHERE pts.club_id = ?
       AND pts.date = ?
       AND b.split_bill = 1
       AND b.status = 'confirmed'
       ${timeFilter}
     ORDER BY pts.tee_time, u.name`,
    coParams
  );

  // Map creators → compute voucher_value; prepaid organizers have value=0 (round was the payment)
  const creatorRows = creators.map((r: any) => {
    const isPrepaid = r.booking_payment_method === "prepaid";
    return {
      id:             r.id,
      name:           r.name,
      email:          r.email,
      push_token:     r.push_token ?? null,
      booking_id:     r.booking_id,
      time:           String(r.time).slice(0, 5),
      payment_method: r.booking_payment_method ?? null,
      // Prepaid: no monetary value (round is the compensation); others: actual amount paid
      voucher_value:  isPrepaid
        ? null
        : r.bp_amount != null
          ? parseFloat(r.bp_amount)
          : r.split_bill
            ? parseFloat(r.my_amount ?? 0)
            : parseFloat(r.total_amount ?? 0),
    };
  });

  const coPlayerRows = coPlayers.map((r: any) => {
    const isPrepaid = r.co_payment_method === "prepaid";
    return {
      id:             r.id,
      name:           r.name,
      email:          r.email,
      push_token:     r.push_token ?? null,
      booking_id:     r.booking_id,
      time:           String(r.time).slice(0, 5),
      payment_method: r.co_payment_method ?? null,
      voucher_value:  isPrepaid ? null : (r.voucher_value != null ? parseFloat(r.voucher_value) : null),
    };
  });

  // Merge: booking creators first, then co-players; de-dup by user_id
  const all = [...creatorRows, ...coPlayerRows];
  const seen = new Map<number, typeof all[0]>();
  for (const p of all) {
    if (!seen.has(p.id)) seen.set(p.id, p);
  }

  return Array.from(seen.values()).sort((a, b) =>
    a.time.localeCompare(b.time) || a.name.localeCompare(b.name)
  );
}

// ── GET /admin/cancellation-vouchers/preview ──────────────────────────────────
// Preview affected players for a given date (+ optional from_time filter)
// Returns per-player voucher_value auto-calculated from booking data.
router.get("/admin/cancellation-vouchers/preview", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club   = getClub(req);
  const clubId = club.id as number;

  const date     = req.query.date      ? String(req.query.date)      : null;
  const fromTime = req.query.from_time ? String(req.query.from_time) : null;
  const toTime   = req.query.to_time   ? String(req.query.to_time)   : null;

  if (!date) { res.status(400).json({ message: "date is required" }); return; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ message: "date must be YYYY-MM-DD" });
    return;
  }

  const players = await fetchAffectedPlayers(clubId, date, fromTime ?? null, toTime ?? null);
  res.json({ count: players.length, users: players });
});

// ── POST /admin/cancellation-vouchers/issue ───────────────────────────────────
// Issue unique per-user vouchers for all affected bookings on a date.
// Body: { affected_date, reason, from_time?, expires_in_days? }
// Voucher value is automatically calculated per player from booking data.
router.post("/admin/cancellation-vouchers/issue", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club   = getClub(req);
  const clubId = club.id as number;

  const { affected_date, reason, from_time, to_time, expires_in_days } = req.body ?? {};

  if (!reason || !String(reason).trim()) {
    res.status(400).json({ message: "reason is required" });
    return;
  }
  if (!affected_date) {
    res.status(400).json({ message: "affected_date is required" });
    return;
  }

  const expiresAt: string | null = expires_in_days
    ? new Date(Date.now() + Number(expires_in_days) * 86_400_000).toISOString()
    : null;

  const fromTime: string | null = from_time || null;
  const toTime:   string | null = to_time   || null;
  const dateParam: string       = String(affected_date);

  const recipients = await fetchAffectedPlayers(clubId, dateParam, fromTime, toTime);

  if (recipients.length === 0) {
    res.status(400).json({ message: "No affected bookings found for the given criteria" });
    return;
  }

  // Create the batch record (value_rands is null — amounts vary per player; issued_by is null for portal)
  const batchRow = await row<any>(
    `INSERT INTO cancellation_voucher_batches
       (club_id, issued_by, reason, affected_date, from_time, to_time, value_rands, expires_at, voucher_count)
     VALUES (?, NULL, ?, ?, ?, ?, NULL, ?, ?)
     RETURNING id`,
    [clubId, String(reason).trim(), dateParam, fromTime, toTime, expiresAt, recipients.length]
  );
  const batchId = batchRow.id;

  const issued: { userId: number; name: string; code: string | null; voucher_value: number | null; prepaid_rollback: boolean }[] = [];

  for (const recipient of recipients) {
    const isPrepaid = recipient.payment_method === "prepaid";

    if (isPrepaid) {
      // ── Prepaid round: return the round to the player's membership balance ──
      await exec(
        `UPDATE club_members
           SET prepaid_rounds_used = GREATEST(0, prepaid_rounds_used - 1)
         WHERE club_id = ? AND user_id = ? AND status = 'active'`,
        [clubId, recipient.id]
      );

      // Track the rollback in the batch (null code = prepaid rollback, not a redeemable voucher)
      await exec(
        `INSERT INTO cancellation_vouchers
           (code, batch_id, club_id, user_id, booking_id, reason, value_rands, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)`,
        [
          `PR-${club.name.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3).padEnd(3, "X")}-${recipient.id}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
          batchId,
          clubId,
          recipient.id,
          recipient.booking_id ?? null,
          String(reason).trim(),
        ]
      );

      issued.push({ userId: recipient.id, name: recipient.name, code: null, voucher_value: null, prepaid_rollback: true });

      const notifTitle = `Prepaid round returned — ${club.name}`;
      const notifBody  = `Your tee time on ${dateParam} was cancelled. Your prepaid round has been returned to your membership balance.`;

      saveUserNotification(recipient.id, "cancellation_voucher", notifTitle, notifBody, {
        code:        null,
        club_id:     clubId,
        batch_id:    batchId,
        value_rands: null,
      });

      if (recipient.push_token?.startsWith("ExponentPushToken[")) {
        sendPushNotifications([{
          to:    recipient.push_token,
          sound: "default",
          title: notifTitle,
          body:  notifBody,
          data:  { type: "prepaid_rollback", club_id: clubId },
        }]);
      }
    } else {
      // ── Monetary payment: issue a cancellation voucher ──────────────────────
      const code = await ensureUniqueCode(club.name, recipient.id);

      await exec(
        `INSERT INTO cancellation_vouchers
           (code, batch_id, club_id, user_id, booking_id, reason, value_rands, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          code,
          batchId,
          clubId,
          recipient.id,
          recipient.booking_id ?? null,
          String(reason).trim(),
          recipient.voucher_value ?? null,
          expiresAt,
        ]
      );

      issued.push({ userId: recipient.id, name: recipient.name, code, voucher_value: recipient.voucher_value, prepaid_rollback: false });

      const notifTitle = `Voucher from ${club.name}`;
      const valueStr   = recipient.voucher_value ? ` worth R${recipient.voucher_value.toFixed(2)}` : "";
      const expiryStr  = expiresAt
        ? ` — valid until ${new Date(expiresAt).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}`
        : "";
      const notifBody  = `Your tee time was cancelled${valueStr ? ` — here's a voucher${valueStr}` : ""}${expiryStr}. Code: ${code}`;

      saveUserNotification(recipient.id, "cancellation_voucher", notifTitle, notifBody, {
        code,
        club_id:      clubId,
        batch_id:     batchId,
        value_rands:  recipient.voucher_value ?? null,
      });

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
  }

  const voucherCount   = issued.filter(i => !i.prepaid_rollback).length;
  const rollbackCount  = issued.filter(i =>  i.prepaid_rollback).length;

  // ── Close all affected tee slots (even unbooked ones) ─────────────────────
  // Any pending bookings on those slots are also cancelled (payment never confirmed).
  const slotClauses: string[] = [];
  const slotValues:  any[]    = [clubId, dateParam];
  if (fromTime) { slotClauses.push("tee_time >= ?"); slotValues.push(fromTime); }
  if (toTime)   { slotClauses.push("tee_time <= ?"); slotValues.push(toTime);   }
  const slotTimeFilter = slotClauses.length ? "AND " + slotClauses.join(" AND ") : "";

  await exec(
    `UPDATE portal_tee_slots SET is_active = 0
     WHERE club_id = ? AND date = ? ${slotTimeFilter}`,
    slotValues
  );

  await exec(
    `UPDATE bookings SET status = 'cancelled'
     WHERE status = 'pending'
       AND portal_slot_id IN (
         SELECT id FROM portal_tee_slots
         WHERE club_id = ? AND date = ? ${slotTimeFilter}
       )`,
    slotValues
  );

  res.json({ success: true, batch_id: batchId, voucher_count: issued.length, vouchers: issued, prepaid_rollbacks: rollbackCount, monetary_vouchers: voucherCount, slots_closed: true });
});

// ── GET /admin/cancellation-vouchers/batches ──────────────────────────────────
router.get("/admin/cancellation-vouchers/batches", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club   = getClub(req);
  const clubId = club.id as number;

  const limit  = Math.min(parseInt(String(req.query.limit  ?? "30"), 10), 100);
  const offset = parseInt(String(req.query.offset ?? "0"), 10);

  const batches = await query<any>(
    `SELECT b.id, b.reason, b.affected_date, b.from_time, b.to_time, b.value_rands, b.expires_at,
            b.voucher_count, b.created_at,
            COALESCE(u.name, 'Portal') as issued_by_name,
            COUNT(cv.id) FILTER (WHERE cv.redeemed_at IS NOT NULL) as redeemed_count
     FROM cancellation_voucher_batches b
     LEFT JOIN users u ON u.id = b.issued_by
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
router.get("/admin/cancellation-vouchers/batches/:batchId", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club   = getClub(req);
  const clubId = club.id as number;

  const batchId = parseInt(req.params.batchId, 10);

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
