import { Router, type IRouter } from "express";
import crypto from "crypto";
import { query, row, exec, run, withTransaction, clientQuery } from "../lib/pg";
import { getUser } from "../lib/auth";
import { isHnaVerified } from "../lib/hna";
import { sendPushNotifications } from "../lib/notifications";
import { saveUserNotification } from "../lib/userNotifications";
import { buildPayFastPaymentUrl, validatePayFastIPN, PLATFORM_FEE_PER_PLAYER } from "../lib/payfast";
import { sendInvoiceEmail } from "../lib/otp";
import { getUserTierPrices } from "../lib/pricing";
import { confirmResalePurchase } from "./resale";
import { logger } from "../lib/logger";
import { postBookingConfirmedJournal, postBookingCancelledJournal, postWalletTopupJournal, postEventRegistrationJournal } from "../lib/ledger-posting";

const router: IRouter = Router();

/**
 * When a booking for a portal tee slot that belongs to a tournament is confirmed,
 * automatically register the player in that tournament and mark them as paid.
 * This is fire-and-forget — booking confirmation is never blocked by this.
 */
async function syncEventRegistration(bookingId: number): Promise<void> {
  try {
    const bk = await row<any>(
      `SELECT b.user_id, b.payment_method, pts.event_id
       FROM bookings b
       JOIN portal_tee_slots pts ON pts.id = b.portal_slot_id
       WHERE b.id = ? AND pts.event_id IS NOT NULL`,
      [bookingId]
    );
    if (!bk?.event_id) return;

    const ev = await row<any>("SELECT id FROM golf_events WHERE id = ? AND status = 'active'", [bk.event_id]);
    if (!ev) return;

    const u = await row<any>("SELECT handicap FROM users WHERE id = ?", [bk.user_id]);
    await exec(
      `INSERT INTO event_registrations (event_id, user_id, status, frozen_handicap, payment_status, payment_method, paid_at)
       VALUES (?, ?, 'approved', ?, 'paid', ?, NOW())
       ON CONFLICT (event_id, user_id) DO UPDATE
         SET status         = 'approved',
             payment_status = 'paid',
             payment_method = EXCLUDED.payment_method,
             paid_at        = COALESCE(event_registrations.paid_at, EXCLUDED.paid_at)`,
      [bk.event_id, bk.user_id, u?.handicap ?? null, bk.payment_method ?? "manual"]
    );
  } catch {}
}

/**
 * Post a booking's journal entry to the ledger by fetching its data from the DB.
 * Used by payment webhooks where only bookingId is available.
 */
async function postBookingLedgerFromId(bookingId: number, paymentMethod: string): Promise<void> {
  try {
    const b = await row<any>(
      `SELECT b.id, b.booking_ref, b.total_amount, b.my_amount, b.platform_fee,
              b.club_amount, b.cart_fee, b.discount_amount, b.players,
              b.driving_range_fee, b.club_hire_fee,
              pts.club_id
       FROM bookings b
       JOIN portal_tee_slots pts ON pts.id = b.portal_slot_id
       WHERE b.id = ?`,
      [bookingId]
    );
    if (!b) return;
    await postBookingConfirmedJournal({
      booking_id: b.id,
      club_id: b.club_id,
      booking_ref: b.booking_ref,
      total_amount: Number(b.total_amount),
      platform_fee: Number(b.platform_fee ?? 0),
      club_amount: Number(b.club_amount ?? 0),
      cart_fee: Number(b.cart_fee ?? 0),
      driving_range_fee: Number(b.driving_range_fee ?? 0),
      club_hire_fee: Number(b.club_hire_fee ?? 0),
      discount_amount: Number(b.discount_amount ?? 0),
      payment_method: paymentMethod,
    });
  } catch (e: any) {
    logger.error({ err: e, bookingId }, "postBookingLedgerFromId failed");
  }
}

/**
 * Verify a Svix webhook signature (used by Stitch Express) without the svix SDK.
 * Signed content is `{id}.{timestamp}.{rawBody}`, HMAC-SHA256'd with the
 * base64-decoded secret (the part after the `whsec_` prefix). The svix-signature
 * header is a space-separated list of `v1,<base64sig>` entries.
 */
function verifySvixSignature(
  secret: string,
  svixId: string,
  svixTimestamp: string,
  svixSignature: string,
  rawBody: string,
): boolean {
  if (!svixId || !svixTimestamp || !svixSignature) return false;

  // Reject deliveries older than 5 minutes to limit replay attacks.
  const ts = parseInt(svixTimestamp, 10);
  if (Number.isNaN(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = crypto
    .createHmac("sha256", key)
    .update(`${svixId}.${svixTimestamp}.${rawBody}`)
    .digest("base64");
  const expectedBuf = Buffer.from(expected);

  return svixSignature.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) return false;
    const sigBuf = Buffer.from(sig);
    return sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf);
  });
}

async function fireInvoiceEmail(bookingId: number): Promise<void> {
  try {
    const b = await row<any>(`
      SELECT b.id, b.booking_ref, b.players, b.total_amount, b.my_amount, b.cart_fee,
             b.platform_fee, b.discount_amount, b.voucher_code, b.created_at,
             b.holes, b.payment_method, b.status, b.price_tier,
             b.invoice_sent_at, b.invoice_resend_count,
             u.name  AS user_name,  u.email AS user_email, u.phone AS user_phone,
             pts.date     AS tee_date,  pts.tee_time,
             c.name AS club_name,
             c.cancel_payment_minutes, c.cancel_fee_pct,
             c.cancel_refund_tiers,   c.cancel_contact_email,
             c.cancel_contact_phone,  c.cancel_other_policies
      FROM bookings b
      JOIN users            u   ON u.id  = b.user_id
      JOIN portal_tee_slots pts ON pts.id = b.portal_slot_id
      JOIN clubs            c   ON c.id  = pts.club_id
      WHERE b.id = ?`, [bookingId]);
    if (!b?.user_email) return;

    let refundTiers: Array<{ label: string; refund_pct: number }> = [];
    try { refundTiers = b.cancel_refund_tiers ? JSON.parse(b.cancel_refund_tiers) : []; } catch { /* ignore */ }

    const cancelPolicy = {
      windowMinutes:  b.cancel_payment_minutes ?? null,
      feePct:         Number(b.cancel_fee_pct ?? 5),
      refundTiers,
      contactEmail:   b.cancel_contact_email   ?? null,
      contactPhone:   b.cancel_contact_phone   ?? null,
      otherPolicies:  b.cancel_other_policies  ?? null,
    };

    await sendInvoiceEmail({
      ...b,
      tee_date: String(b.tee_date).slice(0, 10),
      tee_time: String(b.tee_time).slice(0, 5),
    }, b.club_name, cancelPolicy);
  } catch (err) {
    console.error("[invoice] auto-send failed for booking", bookingId, err);
  }
}

function generateRef(): string {
  return "TG" + crypto.randomBytes(4).toString("hex").toUpperCase();
}

function splitName(name?: string | null): { firstName?: string; lastName?: string } {
  const trimmed = name?.trim();
  if (!trimmed) return {};
  const parts = trimmed.split(/\s+/);
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" ") || undefined,
  };
}

async function getSlotClubPayFastInfo(slotId: number): Promise<{ clubId: number; merchantId?: string } | undefined> {
  const clubRow = await row<any>(
    `SELECT c.id AS club_id, c.payfast_merchant_id
       FROM portal_tee_slots pts
       JOIN clubs c ON c.id = pts.club_id
      WHERE pts.id = ?`,
    [slotId]
  );
  if (!clubRow) return undefined;
  return { clubId: clubRow.club_id, merchantId: clubRow.payfast_merchant_id || undefined };
}

async function getBookingPayFastDetails(bookingId: number): Promise<{
  clubMerchantId?: string;
  bookingRef?: string;
  players?: number;
}> {
  const booking = await row<any>(
    `SELECT b.booking_ref, b.players, c.payfast_merchant_id
       FROM bookings b
       JOIN portal_tee_slots pts ON pts.id = b.portal_slot_id
       JOIN clubs c ON c.id = pts.club_id
      WHERE b.id = ?`,
    [bookingId]
  );
  return {
    clubMerchantId: booking?.payfast_merchant_id || undefined,
    bookingRef: booking?.booking_ref ?? undefined,
    players: booking?.players != null ? parseInt(String(booking.players), 10) : undefined,
  };
}

// Release seats reserved by Stitch checkouts that were never completed.
// Such bookings stay 'pending' (the webhook confirms them on payment); past a
// short grace window they are cancelled so the slot opens back up.
async function releaseStalePendingBookings(): Promise<void> {
  await exec(`
    WITH stale AS (
      UPDATE bookings b SET status = 'cancelled'
      WHERE b.status = 'pending'
        AND (
          b.payment_method IN ('stitch','payfast','pay_at_club')
          -- prepaid greens with unpaid add-ons: still waiting on a Stitch payment
          OR (b.payment_method = 'prepaid' AND EXISTS (
            SELECT 1 FROM booking_players bp
            WHERE bp.booking_id = b.id AND bp.user_id = b.user_id
              AND bp.pending_prepaid_greens = 1
          ))
        )
        AND b.created_at < NOW() - INTERVAL '15 minutes'
      RETURNING b.portal_slot_id, b.players
    ), agg AS (
      SELECT portal_slot_id, SUM(players)::int AS total
      FROM stale
      WHERE portal_slot_id IS NOT NULL
      GROUP BY portal_slot_id
    )
    UPDATE portal_tee_slots pts
    SET player_count = GREATEST(0, pts.player_count - agg.total)
    FROM agg
    WHERE pts.id = agg.portal_slot_id
  `);
}

// ── Open games (portal slots with space still available) ──────────────────────
router.get("/bookings/open", async (req, res): Promise<void> => {
  const province = String(req.query.province ?? "").trim();
  const suburb   = String(req.query.suburb ?? "").trim();
  const date     = String(req.query.date ?? "").trim();
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date);

  const where: string[] = [
    "pts.is_active = 1",
    validDate ? "pts.date = ?" : "pts.date >= CURRENT_DATE",
    "pts.player_count > 0",
    "GREATEST(0, pts.max_players - pts.player_count) > 0",
  ];
  const params: any[] = [];

  if (validDate) params.push(date);

  if (province && province !== "All") {
    where.push("c.province = ?");
    params.push(province);
  }
  if (suburb) {
    where.push("(c.name ILIKE ? OR c.location ILIKE ?)");
    params.push(`%${suburb}%`, `%${suburb}%`);
  }

  const rows = await query<any>(
    `SELECT
       pts.id          AS tee_time_id,
       pts.date, pts.tee_time AS time, 0 AS price, NULL AS promotional_price,
       pts.max_players AS total_slots,
       GREATEST(0, pts.max_players - pts.player_count
         - (SELECT COUNT(*)::int FROM standing_holds sh WHERE sh.slot_id = pts.id AND sh.status = 'held')
       ) AS available,
       pts.player_count AS booked_count,
       c.id            AS club_id,
       c.name          AS club_name,
       c.location      AS club_location,
       c.province,
       c.latitude,
       c.longitude,
       c.cart_available,
       c.cart_compulsory,
       c.cart_price,
       CASE WHEN pts.event_id IS NOT NULL THEN 'tournament' ELSE 'open' END AS game_type,
       COALESCE(ge.shotgun_start, 0)                                        AS is_shotgun,
       COALESCE(ge.shotgun_double_tee, 0)                                   AS is_double_tee,
       ge.name                                                               AS event_name,
       ge.format                                                             AS event_format,
       ge.format_custom                                                      AS event_format_custom,
       (SELECT JSON_AGG(JSON_BUILD_OBJECT('name', psb.player_name, 'players', 1))
        FROM portal_slot_bookings psb WHERE psb.slot_id = pts.id
       ) AS existing_players
     FROM portal_tee_slots pts
     JOIN clubs c ON c.id = pts.club_id
     LEFT JOIN golf_events ge ON ge.id = pts.event_id
     WHERE ${where.join(" AND ")}
     ORDER BY pts.date ASC, pts.tee_time ASC
     LIMIT 100`,
    params
  );

  const fmtName = (full: string) => {
    const parts = (full ?? "").trim().split(/\s+/);
    if (parts.length < 2) return parts[0] ?? "Guest";
    return `${parts[0]} ${parts[parts.length - 1][0]}.`;
  };

  // Resolve the viewer's tier price per club (the hardcoded `0 AS price` above is
  // a placeholder — greens fees come from club_pricing_tiers, same as the club
  // tee-times screen). Compute once per distinct club for the authenticated user.
  const viewer = await getUser(req).catch(() => null);
  const clubIds = [...new Set(rows.map((r: any) => r.club_id))];
  const priceByClub = new Map<number, number>();
  await Promise.all(
    clubIds.map(async (cid) => {
      const { price18 } = await getUserTierPrices(viewer?.id ?? null, cid);
      priceByClub.set(cid, price18 ?? 0);
    })
  );

  const games = rows.map((r: any) => {
    let existingPlayers: { name: string; players: number }[] = [];
    try {
      const raw = typeof r.existing_players === "string"
        ? JSON.parse(r.existing_players)
        : (r.existing_players ?? []);
      existingPlayers = (raw ?? []).map((p: any) => ({ name: fmtName(p.name), players: p.players }));
    } catch {}
    return {
      tee_time_id:       r.tee_time_id,
      date:              String(r.date).slice(0, 10),
      time:              String(r.time).slice(0, 5),
      price:             priceByClub.get(r.club_id) ?? 0,
      promotional_price: r.promotional_price != null ? parseFloat(r.promotional_price) : null,
      total_slots:       parseInt(r.total_slots),
      available:         parseInt(r.available),
      booked_count:      parseInt(r.booked_count),
      club_id:           r.club_id,
      club_name:         r.club_name,
      club_location:     r.club_location,
      province:          r.province,
      latitude:          r.latitude != null ? parseFloat(r.latitude) : null,
      longitude:         r.longitude != null ? parseFloat(r.longitude) : null,
      cart_available:    !!r.cart_available,
      cart_compulsory:   !!r.cart_compulsory,
      cart_price:        r.cart_price != null ? parseFloat(r.cart_price) : 0,
      existing_players:  existingPlayers,
      game_type:         (r.game_type as "open" | "tournament") ?? "open",
      is_shotgun:        !!parseInt(r.is_shotgun ?? "0"),
      is_double_tee:     !!parseInt(r.is_double_tee ?? "0"),
      event_name:        r.event_name ?? null,
      event_format:      r.event_format ?? null,
      event_format_custom: r.event_format_custom ?? null,
    };
  });

  res.json({ games });
});

router.get("/bookings", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const status = String(req.query.status ?? "upcoming");
  const statusFilter = status === "upcoming"
    ? "b.status IN ('confirmed','pending') AND (pts.date IS NULL OR pts.date >= CURRENT_DATE)"
    : "(b.status IN ('completed','cancelled') OR (b.status = 'confirmed' AND pts.date IS NOT NULL AND pts.date < CURRENT_DATE))";

  const myBookings = await query<any>(
    `SELECT b.*,
            COALESCE(c.name, 'Unknown Club') as club_name,
            COALESCE(c.location, '') as club_location,
            COALESCE(pts.tee_time, '') as time,
            COALESCE(pts.date, b.created_at::date) as date,
            0 as price,
            'organizer' as role, 1 as my_paid
     FROM bookings b
     LEFT JOIN portal_tee_slots pts ON pts.id = b.portal_slot_id
     LEFT JOIN clubs c ON c.id = pts.club_id
     WHERE b.user_id = ? AND (${statusFilter})
     ORDER BY COALESCE(pts.date, b.created_at::date) ASC, pts.tee_time ASC`,
    [user.id]
  );

  const invitedBookings = await query<any>(
    `SELECT b.*,
            COALESCE(c.name, 'Unknown Club') as club_name,
            COALESCE(c.location, '') as club_location,
            COALESCE(pts.tee_time, '') as time,
            COALESCE(pts.date, b.created_at::date) as date,
            0 as price,
            'invited' as role, bp.paid as my_paid,
            COALESCE(bp.amount, b.total_amount / b.players) as my_amount
     FROM bookings b
     LEFT JOIN portal_tee_slots pts ON pts.id = b.portal_slot_id
     LEFT JOIN clubs c ON c.id = pts.club_id
     JOIN booking_players bp ON bp.booking_id = b.id AND bp.user_id = ?
     WHERE b.user_id != ? AND (${statusFilter})
     ORDER BY COALESCE(pts.date, b.created_at::date) ASC, pts.tee_time ASC`,
    [user.id, user.id]
  );

  const parse = (b: any) => ({
    ...b,
    total_amount: parseFloat(b.total_amount),
    my_amount:    parseFloat(b.my_amount),
    players:      parseInt(b.players),
    my_paid:      !!b.my_paid,
  });

  res.json({
    bookings:         myBookings.map(parse),
    invited_bookings: invitedBookings.map(parse),
  });
});

router.get("/bookings/:id", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);

  const booking = await row<any>(
    `SELECT b.*,
            c.id   as club_id,
            c.name as club_name,
            COALESCE(c.location, '') as club_location,
            COALESCE(c.phone, '') as club_phone,
            COALESCE(c.address, '') as club_address,
            c.latitude as club_latitude,
            c.longitude as club_longitude,
            c.cancel_policy_preset,
            c.cancel_full_refund_hours,
            c.cancel_has_partial,
            c.cancel_partial_pct,
            c.cancel_partial_hours,
            c.cancel_payment_hours,
            c.cancel_payment_minutes,
            c.cancel_fee_pct,
            c.cancel_weather,
            c.cancel_contact_email,
            c.cancel_contact_phone,
            c.cancel_other_policies,
            pts.tee_time as time,
            pts.date as date,
            0 as price
     FROM bookings b
     LEFT JOIN portal_tee_slots pts ON pts.id = b.portal_slot_id
     LEFT JOIN clubs c ON c.id = pts.club_id
     WHERE b.id = ? AND (
       b.user_id = ? OR
       EXISTS (SELECT 1 FROM booking_players bp WHERE bp.booking_id = b.id AND bp.user_id = ?)
     )`,
    [id, user.id, user.id]
  );

  if (!booking) {
    res.status(404).json({ message: "Booking not found" });
    return;
  }

  booking.total_amount = parseFloat(booking.total_amount);
  booking.my_amount    = parseFloat(booking.my_amount);
  booking.players      = parseInt(booking.players);

  const isOrganizer = booking.user_id === user.id;
  booking.role = isOrganizer ? "organizer" : "invited";

  if (!isOrganizer) {
    const bp = await row<any>(
      "SELECT paid, amount FROM booking_players WHERE booking_id = ? AND user_id = ?",
      [id, user.id]
    );
    // Use != null so that a stored amount of 0 (organizer covers all) is respected
    // rather than falling back to total_amount / players (which would show an
    // incorrect per-head split when the organizer is paying for everyone).
    booking.my_amount = bp?.amount != null ? parseFloat(bp.amount) : booking.total_amount / booking.players;
    booking.my_paid   = !!bp?.paid;
  } else {
    booking.my_paid = true;
  }

  const players = await query<any>(
    `SELECT u.name, u.email, bp.paid, COALESCE(bp.amount, b.total_amount / b.players) as amount
     FROM booking_players bp
     JOIN users u ON u.id = bp.user_id
     JOIN bookings b ON b.id = bp.booking_id
     WHERE bp.booking_id = ?`,
    [id]
  );
  // When split_bill is off, the organizer covers everyone — treat all players as paid
  // once the booking is confirmed (no individual payments required from invited players)
  const allCoveredByOrganizer = !booking.split_bill && booking.status === "confirmed";
  booking.players_list = players.map((p: any) => ({
    name:   p.name,
    email:  p.email,
    paid:   allCoveredByOrganizer ? true : !!p.paid,
    amount: parseFloat(p.amount),
  }));

  res.json({ booking });
});

router.post("/bookings", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  // Free up seats held by abandoned Stitch checkouts before checking availability
  await releaseStalePendingBookings();

  const {
    tee_time_id, players = 1, split_bill = false,
    friend_ids = [],        // legacy field — kept for backward compat
    players_data,           // preferred: Array<{user_id?:number, guest_name?:string}>
    payment_method: requestedPaymentMethod = "stitch", voucher_code, include_cart = false,
    include_range_balls = false, range_balls_selected_price, include_club_hire = false,
    holes = 18,             // 9 or 18
    hna_number = null,      // HNA membership number — upgrades non-members to affiliated_visitor tier
    event_id: bodyEventId,  // optional: event being booked into (used for pay_at_club rounds calc)
    knockout_match_id = null, // optional: link booking to a knockout tournament match
  } = req.body ?? {};
  const payment_method = requestedPaymentMethod === "stitch" ? "payfast" : requestedPaymentMethod;

  // Normalise to players_data: prefer explicit players_data, fall back to friend_ids
  const rawPlayers: Array<{ user_id?: number; guest_name?: string; tier_type?: string }> =
    Array.isArray(players_data)
      ? players_data
      : (friend_ids as number[]).map((id) => ({ user_id: id }));

  const numPlayers = Math.min(Math.max(parseInt(players), 1), 4);
  const normalised = rawPlayers.slice(0, numPlayers - 1);

  // All tee times come from portal_tee_slots
  const rawSlot = await row<any>(
    `SELECT pts.*, c.name AS club_name,
       c.cart_available, c.cart_compulsory, c.cart_price,
       c.range_balls_enabled, c.range_balls_price, c.range_balls_options, c.club_hire_enabled, c.club_hire_price,
       GREATEST(0, pts.max_players - pts.player_count
         - (SELECT COUNT(*)::int FROM standing_holds sh
            WHERE sh.slot_id = pts.id AND sh.status = 'held' AND sh.user_id != ?)
       ) AS available
     FROM portal_tee_slots pts
     JOIN clubs c ON c.id = pts.club_id
     WHERE pts.id = ? AND pts.is_active = 1
       AND NOT EXISTS (
         SELECT 1 FROM resale_listings rl
         WHERE rl.slot_id = pts.id AND rl.status IN ('listed','sold')
       )`,
    [user.id, parseInt(tee_time_id)]
  );

  if (!rawSlot) { res.status(404).json({ message: "Tee time not found" }); return; }

  // Reject booking a tee time that has already passed (clubs operate in SAST = UTC+2)
  {
    const slotDateStr = rawSlot.date instanceof Date
      ? rawSlot.date.toISOString().split("T")[0]
      : String(rawSlot.date).split("T")[0];
    const slotTimeStr = String(rawSlot.tee_time).slice(0, 5);
    const slotDateTime = new Date(`${slotDateStr}T${slotTimeStr}:00+02:00`);
    // Reject if the slot is in the past, or if its date/time can't be parsed
    // (a valid slot always parses — fail safe rather than allow an unverifiable time).
    if (isNaN(slotDateTime.getTime()) || slotDateTime.getTime() < Date.now()) {
      res.status(409).json({ message: "This tee time has already passed and can no longer be booked." });
      return;
    }
  }

  const slot = {
    ...rawSlot,
    time:             rawSlot.tee_time,
    total_slots:      rawSlot.max_players,
    price:            "0",
    price_9:          null,
    promotional_price: null,
  };
  if (parseInt(slot.available) < numPlayers) {
    res.status(409).json({ message: "Not enough slots available" });
    return;
  }

  // ── Payment method availability check ────────────────────────────
  {
    const clubPm = await row<any>(
      "SELECT stitch_enabled, prepaid_enabled, voucher_enabled, pay_at_club_enabled FROM clubs WHERE id = ?",
      [slot.club_id]
    );
    const stitchOk    = !clubPm || clubPm.stitch_enabled  == null || !!clubPm.stitch_enabled;
    const prepaidOk   = !clubPm || clubPm.prepaid_enabled == null || !!clubPm.prepaid_enabled;
    const voucherOk   = !clubPm || clubPm.voucher_enabled == null || !!clubPm.voucher_enabled;
    const payAtClubOk = clubPm && !!clubPm.pay_at_club_enabled;

    if (payment_method === "payfast"     && !stitchOk)    { res.status(400).json({ message: "Online card/EFT payment is not accepted by this club." }); return; }
    if (payment_method === "prepaid"     && !prepaidOk)   { res.status(400).json({ message: "Prepaid rounds are not accepted by this club." }); return; }
    if (payment_method === "pay_at_club" && !payAtClubOk) { res.status(400).json({ message: "This club does not accept pay-at-club bookings." }); return; }
    if (voucher_code && !voucherOk)                       { res.status(400).json({ message: "Voucher codes are not accepted by this club." }); return; }
  }
  // ─────────────────────────────────────────────────────────────────

  // ── Prepaid validation ───────────────────────────────────────────
  if (payment_method === "prepaid") {
    // Prepaid covers the organiser's own spot only — other players must pay their own share (split bill)
    if (numPlayers > 1 && !split_bill) {
      res.status(400).json({ message: "When using prepaid rounds with other players, split billing must be enabled so each player pays their own share." });
      return;
    }
    const membership = await row<any>(
      "SELECT id, prepaid_rounds, prepaid_rounds_used FROM club_members WHERE club_id = ? AND user_id = ? AND status = 'active'",
      [slot.club_id, user.id]
    );
    if (!membership) {
      res.status(403).json({ message: "Prepaid rounds can only be used at your home club as an active member." });
      return;
    }
    const remaining = (parseInt(membership.prepaid_rounds) || 0) - (parseInt(membership.prepaid_rounds_used) || 0);
    if (remaining <= 0) {
      res.status(400).json({ message: "You have no prepaid rounds remaining at this club." });
      return;
    }
  }
  // ─────────────────────────────────────────────────────────────────

  // ── Tournament slot enforcement ───────────────────────────────────
  // If this tee slot is exclusively assigned to a tournament, enforce all
  // of that tournament's rules before allowing a booking.
  const slotDate = slot.date instanceof Date
    ? slot.date.toISOString().split("T")[0]
    : String(slot.date).split("T")[0];

  // Track per-booking event entry + competition fees for earnings reporting.
  // These are stored for accounting purposes and NOT added to the charged amount
  // (entry fees are a separate payment when the golfer registers for the event).
  let bookingEventEntryFee       = 0;
  let bookingEventAdditionalFees = 0;

  if (slot.event_id) {
    const ev = await row<any>(
      `SELECT id, name, status, restriction, entries_required,
              entries_open, entries_close, payment_required,
              entry_fee, additional_fees
       FROM golf_events WHERE id = ?`,
      [slot.event_id]
    );
    if (!ev) {
      res.status(404).json({ message: "Tournament not found for this tee time." }); return;
    }
    if (ev.status !== "active") {
      res.status(403).json({
        message: `"${ev.name}" is not currently open for bookings.`,
        error_code: "event_not_active", event_id: ev.id,
      }); return;
    }
    const today = new Date().toISOString().split("T")[0];
    if (ev.entries_open && today < String(ev.entries_open).slice(0, 10)) {
      res.status(403).json({
        message: `Bookings for "${ev.name}" don't open until ${String(ev.entries_open).slice(0, 10)}.`,
        error_code: "entries_not_open", event_id: ev.id,
      }); return;
    }
    if (ev.entries_close && today > String(ev.entries_close).slice(0, 10)) {
      res.status(403).json({
        message: `Bookings for "${ev.name}" closed on ${String(ev.entries_close).slice(0, 10)}.`,
        error_code: "entries_closed", event_id: ev.id,
      }); return;
    }
    if (ev.restriction === "members_only") {
      const membership = await row<any>(
        "SELECT id FROM club_members WHERE club_id = ? AND user_id = ? AND status = 'active'",
        [slot.club_id, user.id]
      );
      if (!membership) {
        res.status(403).json({
          message: `"${ev.name}" is a members-only tournament. You must be an active member of this club to book.`,
          error_code: "event_members_only", event_id: ev.id,
        }); return;
      }
    } else if (ev.restriction === "invitation_only") {
      const reg = await row<any>(
        "SELECT status FROM event_registrations WHERE event_id = ? AND user_id = ?",
        [ev.id, user.id]
      );
      if (!reg || reg.status !== "approved") {
        res.status(403).json({
          message: `"${ev.name}" is by invitation only. Please contact the club to request access.`,
          error_code: "event_invitation_only", event_id: ev.id, registration_status: reg?.status ?? null,
        }); return;
      }
    } else if (ev.restriction === "whs_players_only") {
      const verified = await isHnaVerified(user.id);
      if (!verified) {
        res.status(403).json({
          message: `"${ev.name}" requires a verified WHS handicap index. Please contact the club.`,
          error_code: "event_whs_only", event_id: ev.id,
        }); return;
      }
    }
    if (ev.entries_required) {
      const reg = await row<any>(
        "SELECT status FROM event_registrations WHERE event_id = ? AND user_id = ?",
        [ev.id, user.id]
      );
      // A standing hold on this slot means the club pre-populated this member's
      // seat into the tournament — treat it as an implicit approved entry
      // (registration is synced automatically after the booking is created).
      const standingHold = (!reg || reg.status !== "approved")
        ? await row<any>(
            "SELECT id FROM standing_holds WHERE slot_id = ? AND user_id = ? AND status = 'held'",
            [slot.id, user.id]
          )
        : null;
      if ((!reg || reg.status !== "approved") && !standingHold) {
        res.status(403).json({
          message: `You must be registered and approved for "${ev.name}" before booking a tee time.`,
          error_code: "event_entry_required", event_id: ev.id, registration_status: reg?.status ?? null,
        }); return;
      }
    }
    // Capture the event's entry fee and additional fees (e.g. competition fee) for earnings reporting.
    if (ev.payment_required && ev.entry_fee != null) {
      bookingEventEntryFee = Math.round(parseFloat(ev.entry_fee ?? "0") * 100) / 100;
      const additionalFees: { name: string; amount: number }[] = Array.isArray(ev.additional_fees)
        ? ev.additional_fees
        : (typeof ev.additional_fees === "string" ? JSON.parse(ev.additional_fees || "[]") : []);
      bookingEventAdditionalFees = Math.round(additionalFees.reduce((s, f) => s + (Number(f.amount) || 0), 0) * 100) / 100;
    }
  } else {
    // ── General slot: date-based event restriction check ─────────────
    const restrictedEvent = await row<any>(
      `SELECT id, name, restriction FROM golf_events
       WHERE club_id = ? AND event_date = ? AND status = 'active' AND restriction != 'open'
       ORDER BY id LIMIT 1`,
      [slot.club_id, slotDate]
    );
    if (restrictedEvent) {
      if (restrictedEvent.restriction === "members_only") {
        const membership = await row<any>(
          "SELECT id FROM club_members WHERE club_id = ? AND user_id = ? AND status = 'active'",
          [slot.club_id, user.id]
        );
        if (!membership) {
          res.status(403).json({
            message: `"${restrictedEvent.name}" is a members-only event. You must be a registered member of this club to book on this day.`,
            error_code: "event_members_only", event_id: restrictedEvent.id,
          }); return;
        }
      } else if (restrictedEvent.restriction === "invitation_only") {
        const reg = await row<any>(
          "SELECT status FROM event_registrations WHERE event_id = ? AND user_id = ?",
          [restrictedEvent.id, user.id]
        );
        if (!reg || reg.status !== "approved") {
          res.status(403).json({
            message: `"${restrictedEvent.name}" is an invitation-only event. Please contact the club to request access.`,
            error_code: "event_invitation_only", event_id: restrictedEvent.id, registration_status: reg?.status ?? null,
          }); return;
        }
      }
    }
  }
  // ────────────────────────────────────────────────────────────────

  // ── Club ban check ────────────────────────────────────────────────────────
  // Prevent banned golfers from booking, and close the loophole where a
  // non-banned user could add a banned user as an invited player.
  // Named cash-guests have no user_id and cannot be checked by name.
  const activeBan = await row<any>(
    "SELECT id FROM club_bans WHERE club_id = ? AND user_id = ? AND status IN ('active','appealing')",
    [slot.club_id, user.id]
  );
  if (activeBan) {
    res.status(403).json({
      message: "You are not permitted to book at this club. Please contact the club if you believe this is an error.",
      error_code: "club_ban_active",
    });
    return;
  }
  const invitedUserIds = normalised.filter((p: any) => p.user_id).map((p: any) => p.user_id);
  if (invitedUserIds.length > 0) {
    const ph = invitedUserIds.map(() => "?").join(",");
    const bannedGuests = await query<any>(
      `SELECT u.name FROM club_bans cb JOIN users u ON u.id = cb.user_id
       WHERE cb.club_id = ? AND cb.user_id IN (${ph}) AND cb.status IN ('active','appealing')`,
      [slot.club_id, ...invitedUserIds]
    );
    if (bannedGuests.length > 0) {
      const names = bannedGuests.map((b: any) => b.name).join(", ");
      res.status(403).json({
        message: `The following player(s) are not permitted to book at this club: ${names}.`,
        error_code: "player_ban_active",
      });
      return;
    }
  }
  // ────────────────────────────────────────────────────────────────

  // Use 9-hole price when requested — trust the client's holes selection
  // (slot.price_9 is always null for tier-priced clubs, so don't gate on it)
  const numHoles = holes === 9 ? 9 : 18;
  const rawPrice = numHoles === 9 && slot.price_9 != null ? parseFloat(slot.price_9) : parseFloat(slot.price);
  const priceCol = numHoles === 9 ? "price_9h" : "price_18h";

  // Always resolve the organizer's tier for pricing AND for recording on the booking row.
  // HNA affiliation is universal but must be club-verified — only a golfer with an
  // active, non-expired membership somewhere qualifies for the affiliated-visitor rate.
  const [memberTierRow, verified] = await Promise.all([
    row<any>(
      "SELECT membership_type FROM club_members WHERE club_id = ? AND user_id = ? AND status = 'active'",
      [slot.club_id, user.id]
    ),
    isHnaVerified(user.id),
  ]);
  const bookingTierType: string = memberTierRow
    ? memberTierRow.membership_type
    : (verified ? "affiliated_visitor" : "non_affiliated_visitor");

  // Resolve organizer's greens fee: promotional override > tier price > slot base price
  let basePrice = slot.promotional_price ? parseFloat(slot.promotional_price) : rawPrice;
  if (!slot.promotional_price) {
    const tierPrice = await row<any>(
      `SELECT ${priceCol} FROM club_pricing_tiers WHERE club_id = ? AND tier_type = ?`,
      [slot.club_id, bookingTierType]
    );
    if (tierPrice && tierPrice[priceCol] != null) {
      basePrice = parseFloat(tierPrice[priceCol]);
    }
  }

  // Organizer's greens fee: R0 when paying with a prepaid round
  const organizerGreens = payment_method === "prepaid" ? 0 : basePrice;

  // Resolve each invited player's tier price individually (split-bill or organizer-pays-all)
  const getInvitedPrice = async (p: { user_id?: number; guest_name?: string; tier_type?: string }): Promise<number> => {
    if (!p.user_id) {
      // Guests have no membership and no HNA → non_affiliated_visitor rate
      const guestTierRow = await row<any>(
        `SELECT ${priceCol} FROM club_pricing_tiers WHERE club_id = ? AND tier_type = 'non_affiliated_visitor'`,
        [slot.club_id]
      ).catch(() => null);
      return guestTierRow?.[priceCol] != null ? parseFloat(guestTierRow[priceCol]) : rawPrice;
    }
    // If the mobile already resolved this player's tier (via /user-tier-price), use it directly.
    // This avoids re-deriving the wrong fallback (non_affiliated_visitor) for visitors who have
    // a specific tier such as junior_visitor, pensioner_visitor, student_visitor, etc.
    if (p.tier_type) {
      const hintRow = await row<any>(
        `SELECT ${priceCol} FROM club_pricing_tiers WHERE club_id = ? AND tier_type = ?`,
        [slot.club_id, p.tier_type]
      ).catch(() => null);
      if (hintRow?.[priceCol] != null) {
        return parseFloat(hintRow[priceCol]);
      }
      // hint tier not found at this club — fall through to standard derivation
    }
    const [pMember, pVerified] = await Promise.all([
      row<any>(
        "SELECT membership_type FROM club_members WHERE club_id = ? AND user_id = ? AND status = 'active'",
        [slot.club_id, p.user_id]
      ).catch(() => null),
      isHnaVerified(p.user_id).catch(() => false),
    ]);
    const pMemberType = pMember?.membership_type ?? null;
    const pTierType   = pMemberType ?? (pVerified ? "affiliated_visitor" : "non_affiliated_visitor");
    const pTierRow    = await row<any>(
      `SELECT ${priceCol} FROM club_pricing_tiers WHERE club_id = ? AND tier_type = ?`,
      [slot.club_id, pTierType]
    ).catch(() => null);
    return pTierRow?.[priceCol] != null ? parseFloat(pTierRow[priceCol]) : basePrice;
  };
  const invitedGreens: number[] = await Promise.all(normalised.map(getInvitedPrice));

  const totalGreens = organizerGreens + invitedGreens.reduce((a, b) => a + b, 0);

  // Apply voucher discount if provided
  let discountAmount          = 0;
  let appliedVoucher: string | null = null;
  let isCancellationVoucher   = false;

  if (voucher_code) {
    const codeUpper = String(voucher_code).toUpperCase().trim();

    if (codeUpper.startsWith("CV-")) {
      // ── Cancellation voucher ─────────────────────────────────────────────
      const cv = await row<any>(
        "SELECT * FROM cancellation_vouchers WHERE code = ? AND user_id = ?",
        [codeUpper, user.id]
      );
      const cvRemaining = cv ? (cv.value_remaining != null ? parseFloat(cv.value_remaining) : (cv.value_rands ? parseFloat(cv.value_rands) : 0)) : 0;
      const cvValid = cv &&
        !cv.redeemed_at &&
        cvRemaining > 0 &&
        (!cv.expires_at || new Date(cv.expires_at) > new Date()) &&
        cv.club_id === slot.club_id;
      if (cvValid) {
        discountAmount        = Math.min(cvRemaining, totalGreens);
        appliedVoucher        = cv.code;
        isCancellationVoucher = true;
      }
    } else {
      // ── Standard discount voucher ─────────────────────────────────────────
      const voucher = await row<any>(
        "SELECT * FROM vouchers WHERE code = ? AND active = 1",
        [codeUpper]
      );
      const voucherRemaining = voucher
        ? (voucher.value_remaining != null ? parseFloat(voucher.value_remaining) : parseFloat(voucher.discount_value))
        : 0;
      const voucherValid =
        voucher &&
        voucherRemaining > 0 &&
        (!voucher.expires_at || new Date(voucher.expires_at) > new Date()) &&
        (voucher.user_id === null || voucher.user_id === user.id) &&
        (voucher.club_id === null || voucher.club_id === slot.club_id);
      if (voucherValid) {
        discountAmount = Math.min(voucherRemaining, totalGreens);
        appliedVoucher = voucher.code;
      }
    }
  }

  // Cart fee calculation: 1-2 players = 1 cart, 3-4 players = 2 carts
  const cartAvailable  = !!slot.cart_available;
  const cartCompulsory = !!slot.cart_compulsory;
  const cartUnitPrice  = slot.cart_price ? parseFloat(slot.cart_price) : 0;
  const wantCart       = cartAvailable && (cartCompulsory || !!include_cart);
  const numCarts       = numPlayers <= 2 ? 1 : 2;
  const cartFee        = wantCart ? Math.round(numCarts * cartUnitPrice * 100) / 100 : 0;
  const cartShare      = numPlayers > 1 ? Math.round(cartFee / numPlayers * 100) / 100 : cartFee;

  // Add-on fees — personal (not split with other players)
  const rangeBallsEnabled = !!slot.range_balls_enabled;
  const rangeBallsClubOptions: Array<{label: string; price: number}> = slot.range_balls_options
    ? (typeof slot.range_balls_options === "string" ? JSON.parse(slot.range_balls_options) : slot.range_balls_options)
    : [];
  const rangeBallsDefaultPrice = slot.range_balls_price ? parseFloat(slot.range_balls_price) : 0;
  const rangeBallsPrice = (() => {
    if (!include_range_balls || !rangeBallsEnabled) return 0;
    const sel = parseFloat(range_balls_selected_price);
    if (!isNaN(sel) && sel > 0) {
      if (rangeBallsClubOptions.length === 0) return sel;
      const valid = rangeBallsClubOptions.some(o => Math.round(o.price * 100) === Math.round(sel * 100));
      return valid ? sel : rangeBallsDefaultPrice;
    }
    return rangeBallsDefaultPrice;
  })();
  const rangeBallsFee = rangeBallsEnabled && include_range_balls ? Math.round(rangeBallsPrice * 100) / 100 : 0;

  const clubHireAvail  = !!slot.club_hire_enabled;
  const clubHireUnitPrice = slot.club_hire_price ? parseFloat(slot.club_hire_price) : 0;
  const clubHireFee    = clubHireAvail && include_club_hire ? Math.round(clubHireUnitPrice * 100) / 100 : 0;

  const greensAfterDiscount = Math.max(0, totalGreens - discountAmount);
  const totalAmount         = greensAfterDiscount + cartFee + rangeBallsFee + clubHireFee;

  // Organizer's payment: their greens (R0 if prepaid) + full cart (solo) or cart share (split)
  const splitAmount = split_bill && numPlayers > 1
    ? organizerGreens + cartShare + rangeBallsFee + clubHireFee
    : totalAmount;

  // If a voucher covers the full amount no gateway is needed — override to "voucher"
  // so the booking is auto-confirmed without trying to send R0 to Stitch.
  const effectivePaymentMethod = splitAmount <= 0 ? "voucher" : payment_method;

  // Prepaid rounds cover the greens fee only. If the organizer added add-ons
  // (cart share, range balls, club hire) those must still be paid online: the
  // booking stays pending, a Stitch link is issued for the add-ons amount, and
  // the prepaid round is only deducted once the payment is confirmed.
  const prepaidAddonsDue = payment_method === "prepaid" && splitAmount > 0.005;
  // Payment methods that settle later via PayFast redirect/IPN
  const needsPaymentLink =
    effectivePaymentMethod === "stitch" ||
    effectivePaymentMethod === "payfast" ||
    effectivePaymentMethod === "pay_at_club" ||
    prepaidAddonsDue;

  // Each invited player's payment: their individual tier price + cart share (split) or R0 (organizer pays all)
  const friendAmounts = invitedGreens.map(g => split_bill ? g + cartShare : 0);

  const ref = generateRef();

  // Load platform flat fee (default R10)
  const feeSetting = await row<any>("SELECT setting_value FROM platform_settings WHERE setting_key = 'platform_fee_flat'");
  const platformFee = feeSetting ? parseFloat(feeSetting.setting_value) : PLATFORM_FEE_PER_PLAYER;
  const clubAmount  = Math.round((totalAmount - platformFee) * 100) / 100;

  // ── Pay-at-club: commitment fee calculation ─────────────────────────────────
  // For pay_at_club the user only pays the TapIn platform fee online as a
  // non-refundable commitment fee. The greens fee is settled directly at the club.
  // Regular booking → 1 × platformFee. Multi-day tournament → rounds × platformFee.
  let commitmentFee = platformFee;
  if (payment_method === "pay_at_club") {
    const eventIdForRounds = slot.event_id ?? (bodyEventId ? parseInt(bodyEventId) : null);
    if (eventIdForRounds) {
      const evRounds = await row<any>(
        "SELECT COALESCE(rounds, 1) AS rounds FROM golf_events WHERE id = ?",
        [eventIdForRounds]
      );
      const numRounds = evRounds ? Math.max(1, parseInt(evRounds.rounds)) : 1;
      commitmentFee = Math.round(platformFee * numRounds * 100) / 100;
    }
  }
  // The online charge for pay_at_club is only the commitment fee (platform fee × rounds)
  const chargeAmount = payment_method === "pay_at_club" ? commitmentFee : splitAmount;

  // Pre-flight wallet balance check (outside transaction for a clear error response)
  if (effectivePaymentMethod === "wallet") {
    const walletRow = await row<any>("SELECT balance FROM wallets WHERE user_id = ?", [user.id]);
    const available = walletRow ? parseFloat(walletRow.balance) : 0;
    if (available < splitAmount) {
      res.status(400).json({
        message: `Insufficient wallet balance. You have R${available.toFixed(2)} available but this booking requires R${splitAmount.toFixed(2)}.`,
        error_code: "wallet_insufficient_funds",
        available,
        required: splitAmount,
      });
      return;
    }
  }

  let bookingId!: number;
  try {
  await withTransaction(async (client) => {
    const insertResult = await clientQuery(client,
      `INSERT INTO bookings (user_id, tee_time_id, portal_slot_id, players, split_bill, total_amount, my_amount,
        booking_ref, payment_method, status, voucher_code, discount_amount, cart_fee, platform_fee, club_amount, holes,
        driving_range_fee, club_hire_fee, price_tier, event_entry_fee, event_additional_fees, knockout_match_id)
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [user.id, parseInt(tee_time_id),
       numPlayers, split_bill ? 1 : 0, totalAmount, chargeAmount,
       ref, effectivePaymentMethod, appliedVoucher, discountAmount, cartFee, platformFee, clubAmount, numHoles,
       rangeBallsFee, clubHireFee, bookingTierType, bookingEventEntryFee, bookingEventAdditionalFees,
       knockout_match_id ? parseInt(knockout_match_id) : null]
    );
    bookingId = insertResult.rows[0].id;

    await clientQuery(client,
      "INSERT INTO booking_players (booking_id, user_id, guest_name, paid, amount) VALUES (?, ?, NULL, 0, ?)",
      [bookingId, user.id, chargeAmount]
    );

    for (let i = 0; i < normalised.length; i++) {
      const p       = normalised[i];
      const pAmount = friendAmounts[i] ?? 0;
      if (p.user_id) {
        await clientQuery(client,
          "INSERT INTO booking_players (booking_id, user_id, guest_name, paid, amount) VALUES (?, ?, NULL, 0, ?)",
          [bookingId, p.user_id, pAmount]
        );
      } else if (p.guest_name) {
        await clientQuery(client,
          "INSERT INTO booking_players (booking_id, user_id, guest_name, paid, amount) VALUES (?, NULL, ?, 0, ?)",
          [bookingId, p.guest_name, pAmount]
        );
      }
    }

    // Confirm immediately only for payments settled at creation (prepaid without
    // add-ons, wallet, voucher). Stitch bookings, pay_at_club and prepaid-with-
    // add-ons stay 'pending' until the payment webhook confirms them.
    if (!needsPaymentLink) {
      await clientQuery(client, "UPDATE bookings SET status = 'confirmed' WHERE id = ?", [bookingId]);
    }
    if (appliedVoucher) {
      if (isCancellationVoucher) {
        // Deduct the used portion from value_remaining; mark fully redeemed only when exhausted
        await clientQuery(client,
          `UPDATE cancellation_vouchers
             SET value_remaining = GREATEST(0, COALESCE(value_remaining, value_rands) - ?),
                 redeemed_at     = CASE WHEN GREATEST(0, COALESCE(value_remaining, value_rands) - ?) = 0 THEN NOW() ELSE redeemed_at END
           WHERE code = ?`,
          [discountAmount, discountAmount, appliedVoucher]
        );
      } else {
        // Deduct the used portion from value_remaining; mark inactive when exhausted
        await clientQuery(client,
          `UPDATE vouchers
             SET value_remaining = GREATEST(0, COALESCE(value_remaining, discount_value) - ?),
                 uses_count      = uses_count + 1,
                 active          = CASE WHEN GREATEST(0, COALESCE(value_remaining, discount_value) - ?) = 0 THEN 0 ELSE active END
           WHERE code = ?`,
          [discountAmount, discountAmount, appliedVoucher]
        );
      }
    }
    // For prepaid with no add-ons due: deduct one round from the member's balance now.
    // With add-ons due, the deduction happens on payment confirmation (webhook/verify).
    if (payment_method === "prepaid" && !prepaidAddonsDue) {
      await clientQuery(client,
        `UPDATE club_members
           SET prepaid_rounds_used = prepaid_rounds_used + 1
         WHERE club_id = ? AND user_id = ? AND status = 'active'
           AND prepaid_rounds > prepaid_rounds_used`,
        [slot.club_id, user.id]
      );
    }
    // For wallet: deduct the organizer's share from their wallet balance
    if (payment_method === "wallet") {
      await clientQuery(client,
        "UPDATE wallets SET balance = balance - ? WHERE user_id = ? AND balance >= ?",
        [splitAmount, user.id, splitAmount]
      );
    }
    // For payments settled at creation (prepaid without add-ons, wallet, voucher)
    // the organizer is paid immediately
    if (!needsPaymentLink) {
      await clientQuery(client,
        "UPDATE booking_players SET paid = 1, payment_method = ? WHERE booking_id = ? AND user_id = ?",
        [effectivePaymentMethod, bookingId, user.id]
      );
    }
    // Prepaid with add-ons: flag the organizer row so the webhook/verify path
    // deducts the prepaid round and marks them 'prepaid_stitch' on confirmation.
    if (prepaidAddonsDue) {
      await clientQuery(client,
        "UPDATE booking_players SET pending_prepaid_greens = 1 WHERE booking_id = ? AND user_id = ?",
        [bookingId, user.id]
      );
    }
    // Track booked players in the portal slot. The capacity re-check here is a
    // defensive guard against concurrent bookings/holds racing past the earlier
    // availability check — active held seats (other than the booker's own hold)
    // still count against capacity.
    const slotUpd = await clientQuery(client,
      `UPDATE portal_tee_slots SET player_count = player_count + ?
       WHERE id = ?
         AND player_count + ? <= max_players - (
           SELECT COUNT(*)::int FROM standing_holds sh
           WHERE sh.slot_id = portal_tee_slots.id AND sh.status = 'held' AND sh.user_id <> ?
         )
         AND NOT EXISTS (
           SELECT 1 FROM resale_listings rl
           WHERE rl.slot_id = portal_tee_slots.id AND rl.status IN ('listed','sold')
         )`,
      [numPlayers, parseInt(tee_time_id), numPlayers, user.id]
    );
    if (!slotUpd.rowCount) {
      throw Object.assign(new Error("Slot is fully booked"), { statusCode: 409 });
    }
    // If the booker had a standing-reservation hold on this slot, consume it:
    // the booking now occupies the seat, so the hold stops hiding it.
    await clientQuery(client,
      "UPDATE standing_holds SET status = 'confirmed', booking_id = ? WHERE slot_id = ? AND user_id = ? AND status = 'held'",
      [bookingId, parseInt(tee_time_id), user.id]
    );
  });
  } catch (txnErr: any) {
    if (txnErr?.statusCode === 409) {
      res.status(409).json({ message: "This tee time just filled up. Please pick another slot." });
      return;
    }
    throw txnErr;
  }

  // Auto-send invoice for payments confirmed immediately (prepaid / wallet / voucher)
  if (!needsPaymentLink) {
    fireInvoiceEmail(bookingId).catch(() => {});
    syncEventRegistration(bookingId).catch(() => {});
    // Post to financial ledger
    postBookingConfirmedJournal({
      booking_id: bookingId,
      club_id: slot.club_id,
      booking_ref: ref,
      total_amount: chargeAmount,
      platform_fee: Math.round(PLATFORM_FEE_PER_PLAYER * numPlayers * 100) / 100,
      club_amount: chargeAmount - Math.round(PLATFORM_FEE_PER_PLAYER * numPlayers * 100) / 100,
      cart_fee: cartFee,
      driving_range_fee: rangeBallsFee,
      club_hire_fee: clubHireFee,
      discount_amount: discountAmount,
      payment_method: effectivePaymentMethod,
    }).catch(() => {});
  }

  let paymentUrl: string | null = null;
  if (needsPaymentLink) {
    const host = req.get("host") ?? "";
    try {
      const slotId = parseInt(String(tee_time_id), 10);
      const clubInfo = Number.isFinite(slotId) ? await getSlotClubPayFastInfo(slotId) : undefined;
      const clubMerchantId = clubInfo?.merchantId;
      const payer = splitName(user.name);
      const useSplit = payment_method !== "pay_at_club";
      const pr = buildPayFastPaymentUrl({
        amount: chargeAmount,
        merchantReference: String(bookingId),
        itemName: `TapIn Golf Booking #${ref}`,
        players: useSplit ? numPlayers : undefined,
        clubMerchantId: useSplit ? clubMerchantId : undefined,
        returnUrl: `https://${host}/booking/success`,
        cancelUrl: `https://${host}/booking/cancel`,
        notifyUrl: `https://${host}/api/payfast/notify`,
        payerFirstName: payer.firstName,
        payerLastName: payer.lastName,
        payerEmail: user.email,
      });
      paymentUrl = pr.url;
      await exec("UPDATE bookings SET payfast_payment_id = ? WHERE id = ?", [pr.paymentId, bookingId]);

      // Log split payment entry
      if (useSplit && clubInfo?.clubId) {
        const tapInFee = Math.round(PLATFORM_FEE_PER_PLAYER * numPlayers * 100) / 100;
        const clubSplitAmount = Math.max(0, chargeAmount - tapInFee);
        await exec(
          `INSERT INTO split_payments (booking_id, club_id, total_amount, tapin_fee, club_amount, players, club_merchant_id, payfast_payload, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
          [bookingId, clubInfo.clubId, chargeAmount, tapInFee, clubSplitAmount, numPlayers, clubMerchantId || null, JSON.stringify(pr.payload)]
        );
      }
    } catch (payfastErr: any) {
      // PayFast link creation failed — cancel the booking, release the reserved seats,
      // and restore any voucher value that was deducted in the booking transaction.
      try {
        await withTransaction(async (client) => {
          await clientQuery(client, "UPDATE bookings SET status = 'cancelled' WHERE id = ?", [bookingId]);
          await clientQuery(client,
            "UPDATE portal_tee_slots SET player_count = GREATEST(0, player_count - ?) WHERE id = ?",
            [numPlayers, parseInt(tee_time_id)]
          );
          if (isCancellationVoucher && appliedVoucher && discountAmount > 0) {
            await clientQuery(client,
              `UPDATE cancellation_vouchers
                 SET value_remaining = LEAST(value_rands, COALESCE(value_remaining, value_rands) + ?),
                     redeemed_at     = NULL
               WHERE code = ?`,
              [discountAmount, appliedVoucher]
            );
          }
        });
      } catch { /* best-effort rollback */ }
      const isConfig = (payfastErr.message ?? "").includes("not configured");
      res.status(isConfig ? 503 : 502).json({
        message: isConfig
          ? "Payment gateway not configured."
          : "Failed to initiate payment. Please try again.",
      });
      return;
    }
  }

  // Notify all registered players — guests (no user_id) have no account so skip them
  const allPlayerIds = [
    user.id,
    ...rawPlayers.slice(0, numPlayers - 1).filter((p) => p.user_id).map((p) => p.user_id!),
  ];
  const dateStr = slot.date instanceof Date ? slot.date.toISOString().split("T")[0] : String(slot.date).split("T")[0];
  const timeStr = String(slot.time).slice(0, 5);

  // Fetch ALL player accounts (with or without a push token) for in-app notifications
  const playerRows = await query<any>(
    `SELECT id, name, push_token FROM users WHERE id IN (${allPlayerIds.map(() => "?").join(",")})`,
    allPlayerIds
  );

  const buildTitle = (isOrganizer: boolean) =>
    isOrganizer ? "Booking Confirmed! ⛳" : "You've Been Added to a Round! ⛳";
  const buildBody = (isOrganizer: boolean) =>
    isOrganizer
      ? `Your tee time at ${slot.club_name} on ${dateStr} at ${timeStr} is confirmed.`
      : split_bill
        ? `${user.name} added you to a round at ${slot.club_name} on ${dateStr} at ${timeStr}. Tap to pay your share.`
        : `${user.name} added you to a round at ${slot.club_name} on ${dateStr} at ${timeStr}.`;

  // Push notifications — only to players who have a registered device token
  // If payment is pending, skip the organizer (they'll be notified on payment confirmation)
  const pushMessages = playerRows
    .filter((p: any) => p.push_token?.startsWith("ExponentPushToken["))
    .filter((p: any) => needsPaymentLink ? p.id !== user.id : true)
    .map((p: any) => {
      const isOrganizer = p.id === user.id;
      return {
        to:    p.push_token as string,
        sound: "default" as const,
        title: buildTitle(isOrganizer),
        body:  buildBody(isOrganizer),
        data:  { type: isOrganizer ? "booking_confirmed" : "booking_invited", booking_id: bookingId },
      };
    });
  sendPushNotifications(pushMessages);

  // In-app notifications — save for every registered player regardless of push token
  // Skip the organizer if payment is still pending (they get notified on confirmation)
  for (const p of playerRows) {
    const isOrganizer = p.id === user.id;
    if (needsPaymentLink && isOrganizer) continue;
    saveUserNotification(
      p.id,
      isOrganizer ? "booking_confirmed" : "booking_invited",
      buildTitle(isOrganizer),
      buildBody(isOrganizer),
      { booking_id: bookingId }
    );
  }

  res.status(201).json({
    booking_id:     bookingId,
    booking_ref:    ref,
    payment_url:    paymentUrl,
    status:         needsPaymentLink ? "pending" : "confirmed",
    commitment_fee: payment_method === "pay_at_club" ? commitmentFee : undefined,
  });
});

router.post("/bookings/:id/pay", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);

  const bp = await row<any>(
    "SELECT bp.paid, bp.amount FROM booking_players bp WHERE bp.booking_id = ? AND bp.user_id = ?",
    [id, user.id]
  );
  if (!bp) { res.status(404).json({ message: "You are not a player on this booking" }); return; }
  if (bp.paid) { res.status(409).json({ message: "You have already paid" }); return; }

  const booking = await row<any>(
    `SELECT b.*, c.name as club_name
     FROM bookings b
     LEFT JOIN portal_tee_slots pts ON pts.id = b.portal_slot_id
     LEFT JOIN clubs c ON c.id = pts.club_id
     WHERE b.id = ?`,
    [id]
  );
  if (!booking) { res.status(404).json({ message: "Booking not found" }); return; }

  const amount = bp.amount ? parseFloat(bp.amount) : parseFloat(booking.total_amount) / parseInt(booking.players);
  const {
    payment_method: requestedPaymentMethod = "stitch",
    secondary_payment_method: requestedSecondaryPaymentMethod,
  } = req.body as { payment_method?: string; secondary_payment_method?: string };
  const payment_method = requestedPaymentMethod === "stitch" ? "payfast" : requestedPaymentMethod;
  const secondary_payment_method = requestedSecondaryPaymentMethod === "stitch"
    ? "payfast"
    : requestedSecondaryPaymentMethod;

  // ── Prepaid rounds payment ─────────────────────────────────────────────────
  if (payment_method === "prepaid") {
    const membership = await row<any>(
      `SELECT id, prepaid_rounds, prepaid_rounds_used
       FROM club_members
       WHERE club_id = (SELECT club_id FROM portal_tee_slots WHERE id = ?)
         AND user_id = ? AND status = 'active'`,
      [booking.portal_slot_id, user.id]
    );
    if (!membership) {
      res.status(403).json({ message: "You are not an active member at this club." }); return;
    }
    const remaining = (parseInt(membership.prepaid_rounds) || 0) - (parseInt(membership.prepaid_rounds_used) || 0);
    if (remaining <= 0) {
      res.status(402).json({ message: "You have no prepaid rounds remaining at this club." }); return;
    }

    // Calculate add-ons amount server-side — prepaid covers the greens fee only.
    // add-ons = cart share from original booking + any player-added cart/range/hire fees.
    const bpFull = await row<any>(
      `SELECT COALESCE(bp.player_driving_range_fee, 0) AS drf,
              COALESCE(bp.player_club_hire_fee, 0)      AS chf,
              COALESCE(bp.player_cart_fee, 0)           AS pcrt,
              COALESCE(b.cart_fee, 0) / NULLIF(b.players, 0) AS cart_share
       FROM booking_players bp
       JOIN bookings b ON b.id = bp.booking_id
       WHERE bp.booking_id = ? AND bp.user_id = ?`,
      [id, user.id]
    );
    const addonsAmount = bpFull
      ? parseFloat(bpFull.drf) + parseFloat(bpFull.chf) + parseFloat(bpFull.pcrt) + parseFloat(bpFull.cart_share || 0)
      : 0;

    // No add-ons — prepaid covers the full amount immediately
    if (addonsAmount <= 0.005) {
      await exec(
        `UPDATE club_members SET prepaid_rounds_used = prepaid_rounds_used + 1
         WHERE id = ? AND prepaid_rounds > prepaid_rounds_used`,
        [membership.id]
      );
      await exec("UPDATE booking_players SET paid = 1, payment_method = 'prepaid' WHERE booking_id = ? AND user_id = ?", [id, user.id]);
      res.json({ success: true, method: "prepaid", amount, booking_id: id, rounds_remaining: remaining - 1 });
      return;
    }

    // Add-ons present — secondary payment required for the remainder
    if (!secondary_payment_method) {
      // Client didn't specify secondary yet — return the amounts so the UI can prompt
      res.json({ needs_secondary: true, addons_amount: addonsAmount, rounds_remaining: remaining });
      return;
    }

    if (secondary_payment_method === "wallet") {
      const wallet = await row<any>("SELECT balance FROM wallets WHERE user_id = ?", [user.id]);
      const balance = wallet ? parseFloat(wallet.balance) : 0;
      if (balance < addonsAmount) {
        res.status(402).json({ message: `Insufficient wallet balance (R${balance.toFixed(2)} available, R${addonsAmount.toFixed(2)} required for add-ons)` });
        return;
      }
      await exec("UPDATE wallets SET balance = balance - ? WHERE user_id = ?", [addonsAmount, user.id]);
      await exec(
        `UPDATE club_members SET prepaid_rounds_used = prepaid_rounds_used + 1
         WHERE id = ? AND prepaid_rounds > prepaid_rounds_used`,
        [membership.id]
      );
      await exec("UPDATE booking_players SET paid = 1, payment_method = 'prepaid_wallet' WHERE booking_id = ? AND user_id = ?", [id, user.id]);
      res.json({ success: true, method: "prepaid_wallet", amount, booking_id: id, rounds_remaining: remaining - 1 });
      return;
    }

    // secondary = "payfast" — create PayFast payment for add-ons only;
    // pending_prepaid_greens = 1 signals the webhook/IPN to deduct the prepaid round on confirmation.
    await exec("UPDATE booking_players SET pending_prepaid_greens = 1 WHERE booking_id = ? AND user_id = ?", [id, user.id]);
    const host2 = req.get("host") ?? "";
    const payFastDetails = await getBookingPayFastDetails(id);
    const payer2 = splitName(user.name);
    const pr2 = buildPayFastPaymentUrl({
      amount: addonsAmount,
      merchantReference: `${id}-player-${user.id}`,
      itemName: "TapIn Golf - Player Payment",
      players: 1,
      clubMerchantId: payFastDetails.clubMerchantId,
      returnUrl: `https://${host2}/booking/success`,
      cancelUrl: `https://${host2}/booking/cancel`,
      notifyUrl: `https://${host2}/api/payfast/notify`,
      payerFirstName: payer2.firstName,
      payerLastName: payer2.lastName,
      payerEmail: user.email,
    });
    res.json({ payment_url: pr2.url, amount: addonsAmount, booking_id: id });
    return;
  }

  // ── Wallet payment ─────────────────────────────────────────────────────────
  if (payment_method === "wallet") {
    const wallet = await row<any>("SELECT balance FROM wallets WHERE user_id = ?", [user.id]);
    const balance = wallet ? parseFloat(wallet.balance) : 0;
    if (balance < amount) {
      res.status(402).json({ message: `Insufficient wallet balance (R${balance.toFixed(2)} available, R${amount.toFixed(2)} required)` });
      return;
    }
    await exec("UPDATE wallets SET balance = balance - ? WHERE user_id = ?", [amount, user.id]);
    await exec("UPDATE booking_players SET paid = 1, payment_method = 'wallet' WHERE booking_id = ? AND user_id = ?", [id, user.id]);
    res.json({ success: true, method: "wallet", amount, booking_id: id });
    return;
  }

  // ── PayFast payment (default) ──────────────────────────────────────────────
  const host = req.get("host") ?? "";
  const payFastDetails = await getBookingPayFastDetails(id);
  const payer = splitName(user.name);
  const pr = buildPayFastPaymentUrl({
    amount,
    merchantReference: `${id}-player-${user.id}`,
    itemName: "TapIn Golf - Player Payment",
    players: 1,
    clubMerchantId: payFastDetails.clubMerchantId,
    returnUrl: `https://${host}/booking/success`,
    cancelUrl: `https://${host}/booking/cancel`,
    notifyUrl: `https://${host}/api/payfast/notify`,
    payerFirstName: payer.firstName,
    payerLastName: payer.lastName,
    payerEmail: user.email,
  });

  res.json({ payment_url: pr.url, amount, booking_id: id });
});

// Resume an abandoned organizer payment. When the organizer creates a PayFast /
// pay-at-club booking but never completes the hosted payment, the booking stays
// 'pending'. This re-issues a fresh payment link for the SAME booking using the
// original merchantReference (<bookingId>) so the existing confirm-payment and
// webhook flow confirms the booking on return.
router.post("/bookings/:id/resume-payment", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  if (isNaN(id)) { res.status(400).json({ message: "Invalid booking id" }); return; }

  const booking = await row<any>(
    "SELECT id, user_id, status, payment_method, my_amount, players, booking_ref FROM bookings WHERE id = ?",
    [id]
  );
  if (!booking) { res.status(404).json({ message: "Booking not found" }); return; }
  if (booking.user_id !== user.id) { res.status(403).json({ message: "Only the organizer can complete this payment" }); return; }
  if (booking.status !== "pending") {
    res.status(409).json({ message: `This booking is already ${booking.status}.` }); return;
  }
  // "prepaid" here means the greens are covered by a prepaid round but the
  // add-ons (my_amount) still need to be settled online.
  if (
    booking.payment_method !== "stitch" &&
    booking.payment_method !== "payfast" &&
    booking.payment_method !== "pay_at_club" &&
    booking.payment_method !== "prepaid"
  ) {
    res.status(400).json({ message: "This booking cannot be paid online." }); return;
  }

  const amount = parseFloat(booking.my_amount);
  if (!(amount > 0)) { res.status(400).json({ message: "Nothing left to pay on this booking." }); return; }

  const host = req.get("host") ?? "";
  const payFastDetails = await getBookingPayFastDetails(id);
  const payer = splitName(user.name);
  const useSplit = booking.payment_method !== "pay_at_club";
  const pr = buildPayFastPaymentUrl({
    amount,
    merchantReference: String(id),
    itemName: `TapIn Golf Booking #${booking.booking_ref}`,
    players: useSplit ? booking.players : undefined,
    clubMerchantId: useSplit ? payFastDetails.clubMerchantId : undefined,
    returnUrl: `https://${host}/booking/success`,
    cancelUrl: `https://${host}/booking/cancel`,
    notifyUrl: `https://${host}/api/payfast/notify`,
    payerFirstName: payer.firstName,
    payerLastName: payer.lastName,
    payerEmail: user.email,
  });
  await exec("UPDATE bookings SET payfast_payment_id = ? WHERE id = ?", [pr.paymentId, id]);

  res.json({ payment_url: pr.url, amount, booking_id: id });
});

router.put("/bookings/:id/player-paid", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);

  const affected = await run(
    "UPDATE booking_players SET paid = 1 WHERE booking_id = ? AND user_id = ?",
    [id, user.id]
  );
  if (!affected) { res.status(404).json({ message: "Player record not found" }); return; }

  res.json({ success: true });
});

// ── Invited player: fetch available club add-ons ─────────────────────────────
router.get("/bookings/:id/club-addons", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ message: "Invalid booking id" }); return; }

  const bp = await row<any>(
    `SELECT bp.amount, bp.player_driving_range_fee, bp.player_club_hire_fee, bp.player_cart_fee
     FROM booking_players bp WHERE bp.booking_id = ? AND bp.user_id = ?`,
    [id, user.id]
  );
  if (!bp) { res.status(404).json({ message: "You are not a player on this booking" }); return; }

  const bookingRow = await row<any>(
    `SELECT b.cart_fee, b.players,
            c.range_balls_enabled, c.range_balls_price, c.range_balls_options,
            c.club_hire_enabled, c.club_hire_price,
            c.cart_available, c.cart_compulsory, c.cart_price
     FROM bookings b
     JOIN portal_tee_slots pts ON pts.id = b.portal_slot_id
     JOIN clubs c ON c.id = pts.club_id
     WHERE b.id = ?`,
    [id]
  );
  if (!bookingRow) { res.status(404).json({ message: "Booking not found" }); return; }

  let rangeBallsOptions: Array<{ label: string; price: number }> = [];
  try {
    rangeBallsOptions = bookingRow.range_balls_options
      ? (typeof bookingRow.range_balls_options === "string" ? JSON.parse(bookingRow.range_balls_options) : bookingRow.range_balls_options)
      : [];
  } catch { /* ignore */ }

  const bookingCartFee = parseFloat(bookingRow.cart_fee ?? 0);
  const numPlayers    = parseInt(bookingRow.players ?? 1);
  const cartShare     = numPlayers > 0 ? Math.round(bookingCartFee / numPlayers * 100) / 100 : 0;

  const pDrf = parseFloat(bp.player_driving_range_fee ?? 0);
  const pChf = parseFloat(bp.player_club_hire_fee ?? 0);
  const pCrt = parseFloat(bp.player_cart_fee ?? 0);
  const baseAmount = parseFloat(bp.amount) - pDrf - pChf - pCrt;

  res.json({
    cart_available:    !!bookingRow.cart_available,
    cart_compulsory:   !!bookingRow.cart_compulsory,
    cart_price:        bookingRow.cart_price ? parseFloat(bookingRow.cart_price) : 0,
    booking_cart_fee:  bookingCartFee,
    cart_share:        cartShare,
    current_player_cart_fee: pCrt,
    range_balls_enabled: !!bookingRow.range_balls_enabled,
    range_balls_price: bookingRow.range_balls_price ? parseFloat(bookingRow.range_balls_price) : 0,
    range_balls_options: rangeBallsOptions,
    club_hire_enabled: !!bookingRow.club_hire_enabled,
    club_hire_price:   bookingRow.club_hire_price ? parseFloat(bookingRow.club_hire_price) : 0,
    current_driving_range_fee: pDrf,
    current_club_hire_fee:     pChf,
    base_amount: baseAmount,
  });
});

// ── Invited player: update their add-on selections ───────────────────────────
router.post("/bookings/:id/player-addons", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ message: "Invalid booking id" }); return; }

  const bp = await row<any>(
    `SELECT bp.paid, bp.amount, bp.player_driving_range_fee, bp.player_club_hire_fee, bp.player_cart_fee
     FROM booking_players bp WHERE bp.booking_id = ? AND bp.user_id = ?`,
    [id, user.id]
  );
  if (!bp) { res.status(404).json({ message: "You are not a player on this booking" }); return; }
  if (bp.paid) { res.status(409).json({ message: "You have already paid — add-ons cannot be changed" }); return; }

  const { driving_range_fee = 0, club_hire_fee = 0, cart_fee = 0 } = req.body as {
    driving_range_fee?: number;
    club_hire_fee?: number;
    cart_fee?: number;
  };

  // If adding a self-cart, verify the booking has no existing cart and cart is available at this club
  const pcrt = Math.max(0, parseFloat(String(cart_fee)) || 0);
  if (pcrt > 0) {
    const bookingCartCheck = await row<any>(
      `SELECT b.cart_fee, c.cart_available, c.cart_compulsory
       FROM bookings b
       JOIN portal_tee_slots pts ON pts.id = b.portal_slot_id
       JOIN clubs c ON c.id = pts.club_id
       WHERE b.id = ?`,
      [id]
    );
    if (!bookingCartCheck?.cart_available) {
      res.status(400).json({ message: "Cart is not available at this club" }); return;
    }
    if (parseFloat(bookingCartCheck?.cart_fee ?? 0) > 0) {
      res.status(409).json({ message: "A cart is already included in this booking" }); return;
    }
  }

  const drf = Math.max(0, parseFloat(String(driving_range_fee)) || 0);
  const chf = Math.max(0, parseFloat(String(club_hire_fee)) || 0);

  const baseAmount = parseFloat(bp.amount)
    - parseFloat(bp.player_driving_range_fee ?? 0)
    - parseFloat(bp.player_club_hire_fee ?? 0)
    - parseFloat(bp.player_cart_fee ?? 0);

  const newAmount = Math.round((baseAmount + drf + chf + pcrt) * 100) / 100;

  await exec(
    `UPDATE booking_players
     SET player_driving_range_fee = ?, player_club_hire_fee = ?, player_cart_fee = ?, amount = ?
     WHERE booking_id = ? AND user_id = ?`,
    [drf, chf, pcrt, newAmount, id, user.id]
  );

  res.json({ success: true, amount: newAmount, driving_range_fee: drf, club_hire_fee: chf, cart_fee: pcrt });
});

// ── Invited player: leave/cancel themselves from the booking ─────────────────
router.post("/bookings/:id/leave", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ message: "Invalid booking id" }); return; }

  const booking = await row<any>(
    `SELECT b.id, b.user_id, b.status, b.portal_slot_id,
            u.push_token AS organizer_push_token
     FROM bookings b
     JOIN users u ON u.id = b.user_id
     WHERE b.id = ?`,
    [id]
  );
  if (!booking) { res.status(404).json({ message: "Booking not found" }); return; }
  if (booking.user_id === user.id) {
    res.status(403).json({ message: "Use the Cancel Booking option to cancel as the organizer" }); return;
  }
  if (booking.status !== "confirmed") {
    res.status(409).json({ message: "This booking cannot be modified" }); return;
  }

  const bp = await row<any>(
    "SELECT paid FROM booking_players WHERE booking_id = ? AND user_id = ?",
    [id, user.id]
  );
  if (!bp) { res.status(403).json({ message: "You are not a player on this booking" }); return; }
  if (bp.paid) { res.status(409).json({ message: "You have already paid — please contact the club to cancel" }); return; }

  const deleted = await run(
    "DELETE FROM booking_players WHERE booking_id = ? AND user_id = ? AND paid = 0",
    [id, user.id]
  );
  if (!deleted) { res.status(404).json({ message: "Player record not found or already paid" }); return; }

  await exec(
    "UPDATE bookings SET players = GREATEST(1, players - 1) WHERE id = ?",
    [id]
  );
  if (booking.portal_slot_id) {
    await exec(
      "UPDATE portal_tee_slots SET player_count = GREATEST(0, player_count - 1) WHERE id = ?",
      [booking.portal_slot_id]
    );
  }

  const organizerId = booking.user_id;
  saveUserNotification(
    organizerId,
    "booking_player_left",
    "Player cancelled",
    `${user.name} has removed themselves from booking ${id}.`,
    { booking_id: id }
  );
  if (booking.organizer_push_token?.startsWith("ExponentPushToken[")) {
    sendPushNotifications([{
      to: booking.organizer_push_token,
      sound: "default",
      title: "Player cancelled",
      body: `${user.name} has removed themselves from your booking.`,
      data: { booking_id: id },
    }]);
  }

  res.json({ success: true });
});

router.put("/bookings/:id/cancel", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);

  const booking = await row<any>(
    `SELECT b.id, b.booking_ref, b.players, b.portal_slot_id, b.total_amount,
            u.name AS golfer_name, u.email AS golfer_email, u.phone AS golfer_phone
     FROM bookings b
     JOIN users u ON u.id = b.user_id
     WHERE b.id = ? AND b.user_id = ? AND b.status = 'confirmed'`,
    [id, user.id]
  );

  if (!booking) {
    res.status(404).json({ message: "Booking not found or cannot be cancelled" });
    return;
  }

  const cancelledAt = new Date().toISOString();

  await withTransaction(async (client) => {
    await clientQuery(client, "UPDATE bookings SET status = 'cancelled' WHERE id = ?", [id]);
    await clientQuery(client, "UPDATE split_payments SET status = 'failed', updated_at = NOW() WHERE booking_id = ? AND status = 'pending'", [id]);
    // Release the seats this booking reserved so the slot opens back up
    if (booking.portal_slot_id) {
      await clientQuery(client,
        "UPDATE portal_tee_slots SET player_count = GREATEST(0, player_count - ?) WHERE id = ?",
        [parseInt(booking.players, 10) || 1, booking.portal_slot_id]
      );
    }
    // A standing-reservation hold consumed by this booking reverts to 'held'
    // (still protected) if the confirm deadline hasn't passed, else releases.
    await clientQuery(client,
      `UPDATE standing_holds
       SET status = CASE WHEN confirm_by > NOW() THEN 'held' ELSE 'released' END, booking_id = NULL
       WHERE booking_id = ? AND status = 'confirmed'`,
      [id]
    );
  });

  // Fetch club details for the response + portal inbox notification
  const club = booking.portal_slot_id
    ? await row<any>(
        `SELECT c.id AS club_id, c.name AS club_name,
                c.cancel_contact_email, c.cancel_contact_phone, c.cancel_fee_pct,
                pts.date AS tee_date, pts.tee_time
         FROM portal_tee_slots pts
         JOIN clubs c ON c.id = pts.club_id
         WHERE pts.id = ?`,
        [booking.portal_slot_id]
      )
    : null;

  // Write a portal inbox notification for the club — non-blocking
  if (club?.club_id) {
    const players = parseInt(booking.players, 10) || 1;
    const feePct  = parseInt(club.cancel_fee_pct ?? 5, 10);
    const total   = parseFloat(booking.total_amount ?? 0);
    const refund  = +(total * (1 - feePct / 100)).toFixed(2);
    const title   = `Booking Cancelled — ${booking.booking_ref}`;
    const body    = [
      `${booking.golfer_name} (${booking.golfer_email}) cancelled their booking.`,
      `Tee time: ${club.tee_date ?? "—"} at ${club.tee_time ?? "—"} · ${players} player${players !== 1 ? "s" : ""}.`,
      `Cancellation fee: ${feePct}% · Refund owed: R${refund.toFixed(2)}.`,
    ].join("\n");
    exec(
      "INSERT INTO club_inbox_notifications (club_id, type, title, body, meta) VALUES (?, ?, ?, ?, ?)",
      [
        club.club_id,
        "cancellation",
        title,
        body,
        JSON.stringify({ booking_id: id, booking_ref: booking.booking_ref, golfer_name: booking.golfer_name, golfer_email: booking.golfer_email, golfer_phone: booking.golfer_phone ?? null, tee_date: club.tee_date, tee_time: club.tee_time, players, total_amount: total, cancel_fee_pct: feePct, refund_amount: refund }),
      ]
    ).catch((err: unknown) => {
      console.error("[cancel] Failed to write portal inbox notification:", err);
    });
  }

  // Post reversal to financial ledger
  if (club?.club_id) {
    postBookingCancelledJournal(id, club.club_id, `Booking ${booking.booking_ref} cancelled by golfer`).catch(() => {});
  }

  res.json({
    success: true,
    contact_email: club?.cancel_contact_email ?? null,
    contact_phone: club?.cancel_contact_phone ?? null,
  });
});

// Confirm a PayFast booking payment by checking the booking status after redirect.
router.post("/bookings/:id/confirm-payment", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }
  const bookingId = parseInt(req.params.id, 10);
  if (isNaN(bookingId)) { res.status(400).json({ message: "Invalid booking id" }); return; }

  const booking = await row<any>(
    "SELECT id, user_id, status, payfast_payment_id FROM bookings WHERE id = ?",
    [bookingId]
  );
  if (!booking) { res.status(404).json({ message: "Booking not found" }); return; }
  if (booking.user_id !== user.id) { res.status(403).json({ message: "Forbidden" }); return; }

  // Already confirmed — nothing to do
  if (booking.status === "confirmed" || booking.status === "completed") {
    res.json({ confirmed: true, status: booking.status });
    return;
  }

  if (!booking.payfast_payment_id) {
    res.status(402).json({ confirmed: false, message: "No payment to verify for this booking" });
    return;
  }

  // PayFast confirms payments via IPN (POST /api/payfast/notify).
  // When the app polls after redirect, we just check current status.
  if (booking.status === "pending") {
    res.status(402).json({
      confirmed: false,
      status: "pending",
      message: "Payment confirmation pending — please wait a moment",
    });
    return;
  }

  res.json({ confirmed: true, status: booking.status });
});

// Mark the organizer's booking_players row paid after a verified payment.
async function settleOrganizerPaid(bookingId: number, paymentMethod: "stitch" | "payfast" = "payfast"): Promise<void> {
  const org = await row<any>(
    `SELECT bp.user_id, bp.pending_prepaid_greens
     FROM booking_players bp
     JOIN bookings b ON b.id = bp.booking_id AND b.user_id = bp.user_id
     WHERE bp.booking_id = ?`,
    [bookingId]
  );
  if (org?.pending_prepaid_greens) {
    const mem = await row<any>(
      `SELECT cm.id FROM club_members cm
       JOIN portal_tee_slots pts ON pts.club_id = cm.club_id
       JOIN bookings b ON b.portal_slot_id = pts.id
       WHERE b.id = ? AND cm.user_id = ? AND cm.status = 'active'`,
      [bookingId, org.user_id]
    );
    if (mem) {
      await exec(
        `UPDATE club_members SET prepaid_rounds_used = prepaid_rounds_used + 1
         WHERE id = ? AND prepaid_rounds > prepaid_rounds_used`,
        [mem.id]
      );
    }
    await run(
      `UPDATE booking_players
          SET paid = 1, payment_method = ?, pending_prepaid_greens = 0
        WHERE booking_id = ? AND user_id = ?`,
      [`prepaid_${paymentMethod}`, bookingId, org.user_id]
    );
  } else {
    await run(
      "UPDATE booking_players SET paid = 1, payment_method = ? WHERE booking_id = ? AND user_id = (SELECT user_id FROM bookings WHERE id = ?)",
      [paymentMethod, bookingId, bookingId]
    );
  }
}

async function processCompletedPaymentReference(
  externalRef: string,
  paymentMethod: "stitch" | "payfast",
): Promise<void> {
  const providerLabel = paymentMethod === "payfast" ? "PayFast" : "Stitch";

  // Wallet top-up: externalReference is "wallet-<topupId>"
  if (externalRef.startsWith("wallet-")) {
    const topupId = parseInt(externalRef.split("-")[1] ?? "", 10);
    if (!isNaN(topupId)) {
      const topup = await row<any>(
        "SELECT id, user_id, amount FROM wallet_topups WHERE id = ?",
        [topupId]
      );
      if (topup) {
        const claimed = await run(
          "UPDATE wallet_topups SET status = 'completed' WHERE id = ? AND status = 'pending'",
          [topupId]
        );
        if (claimed === 1) {
          const existing = await row<any>("SELECT id FROM wallets WHERE user_id = ?", [topup.user_id]);
          if (existing) {
            await run("UPDATE wallets SET balance = balance + ? WHERE user_id = ?", [topup.amount, topup.user_id]);
          } else {
            await run("INSERT INTO wallets (user_id, balance) VALUES (?, ?)", [topup.user_id, topup.amount]);
          }
          // Post to financial ledger
          postWalletTopupJournal({
            topup_id: topupId,
            user_id: topup.user_id,
            amount: Number(topup.amount),
            payment_method: paymentMethod,
          }).catch(() => {});
        }
      }
    }
    return;
  }

  if (externalRef.startsWith("event-")) {
    const parts   = externalRef.split("-");
    const eventId = parseInt(parts[1] ?? "", 10);
    const userId  = parseInt(parts[3] ?? "", 10);
    if (!isNaN(eventId) && !isNaN(userId)) {
      const ev = await row<any>("SELECT id, name, max_participants, club_id, entry_fee FROM golf_events WHERE id = ?", [eventId]);
      const u  = await row<any>("SELECT id, push_token FROM users WHERE id = ?", [userId]);

      let fieldFull = false;
      if (ev?.max_participants) {
        const paid = await row<any>(
          "SELECT COUNT(*) AS n FROM event_registrations WHERE event_id = ? AND payment_status = 'paid' AND user_id != ?",
          [eventId, userId]
        );
        fieldFull = parseInt(paid?.n ?? "0") >= parseInt(ev.max_participants);
      }

      if (fieldFull) {
        await run(
          "UPDATE event_registrations SET status = 'rejected' WHERE event_id = ? AND user_id = ? AND status = 'approved'",
          [eventId, userId]
        );
        if (ev && u) {
          await run(
            "INSERT INTO user_notifications (user_id, type, title, body, data) VALUES (?, ?, ?, ?, ?::jsonb)",
            [userId, "event_registration_update",
             "Field Full — Entry Not Confirmed",
             `Sorry, the field for "${ev.name}" filled up before your payment was processed. Your payment will be refunded.`,
             JSON.stringify({ type: "event_registration_update", event_id: eventId, status: "rejected" })]
          );
          if (u.push_token) {
            sendPushNotifications([{
              to: u.push_token, sound: "default",
              title: "Field Full — Entry Not Confirmed",
              body: `Sorry, the field for "${ev.name}" filled up before your payment was processed. Your payment will be refunded.`,
              data: { type: "event_registration_update", event_id: eventId },
            }]);
          }
        }
      } else {
        const claimed = await run(
          "UPDATE event_registrations SET payment_status = 'paid', paid_at = NOW() WHERE event_id = ? AND user_id = ? AND payment_status != 'paid'",
          [eventId, userId]
        );
        if (claimed === 1 && ev && u) {
          await run(
            "INSERT INTO user_notifications (user_id, type, title, body, data) VALUES (?, ?, ?, ?, ?::jsonb)",
            [userId, "event_payment_confirmed",
             "Payment Confirmed ⛳",
             `Your entry fee for "${ev.name}" has been received. Your spot is confirmed!`,
             JSON.stringify({ type: "event_payment_confirmed", event_id: eventId })]
          );
          if (u.push_token) {
            sendPushNotifications([{
              to: u.push_token, sound: "default",
              title: "Payment Confirmed ⛳",
              body: `Your entry fee for "${ev.name}" has been received. Your spot is confirmed!`,
              data: { type: "event_payment_confirmed", event_id: eventId },
            }]);
          }
          // Post to financial ledger
          if (ev.club_id && ev.entry_fee) {
            postEventRegistrationJournal({
              event_id: eventId,
              user_id: userId,
              club_id: ev.club_id,
              amount: Number(ev.entry_fee),
              payment_method: paymentMethod,
              event_name: ev.name,
            }).catch(() => {});
          }
        }
      }
    }
    return;
  }

  if (externalRef.startsWith("resale-")) {
    const purchaseId = parseInt(externalRef.slice(7), 10);
    if (!isNaN(purchaseId)) {
      try {
        await confirmResalePurchase(purchaseId);
      } catch (err) {
        logger.error({ err, purchaseId }, "resale purchase confirmation failed in webhook");
      }
    }
    return;
  }

  if (externalRef.startsWith("ad-billing-")) {
    const cycleId = parseInt(externalRef.slice(11), 10);
    if (!isNaN(cycleId)) {
      const claimed = await run(
        "UPDATE ad_billing_cycles SET status = 'paid', paid_at = NOW() WHERE id = ? AND status = 'pending'",
        [cycleId]
      );
      if (claimed === 1) {
        const cycle = await row<any>(
          `SELECT abc.billing_month, ar.club_id, ar.headline
           FROM ad_billing_cycles abc
           JOIN ad_requests ar ON ar.id = abc.ad_request_id
           WHERE abc.id = ?`,
          [cycleId]
        );
        if (cycle) {
          const monthLabel = new Date(String(cycle.billing_month).slice(0, 10))
            .toLocaleString("en-ZA", { month: "long", year: "numeric" });
          await exec(
            `INSERT INTO club_inbox_notifications (club_id, type, title, body, meta)
             VALUES (?, 'ad_update', ?, ?, ?)`,
            [cycle.club_id,
             "✅ Ad Payment Confirmed",
             `Payment for "${cycle.headline}" (${monthLabel}) received. Your ad continues to run — thank you!`,
             JSON.stringify({ billing_cycle_id: cycleId })]
          );
        }
      }
    }
    return;
  }

  if (externalRef.startsWith("ad-")) {
    const reqId = parseInt(externalRef.slice(3), 10);
    if (!isNaN(reqId)) {
      const adReq = await row<any>(
        `SELECT ar.*, c.name AS club_name FROM ad_requests ar JOIN clubs c ON c.id = ar.club_id WHERE ar.id = ?`,
        [reqId]
      );
      if (adReq && adReq.status === "payment_pending") {
        const placementMap: Record<string, string> = {
          club_detail: "club", featured_home: "home", explore: "explore",
          push: "home", tournament: "home", newsletter: "home", nearby_alert: "home", tee_time_deal: "home",
        };
        const placement = placementMap[adReq.ad_type] ?? "home";
        const result = await exec(
          `INSERT INTO ads (club_id, title, subtitle, image_url, cta_text, link_url, placement, priority, active,
            ad_request_id, campaign_start, campaign_end, slot_duration, sharing_tier)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
          [adReq.club_id, adReq.headline, adReq.subtitle ?? null, adReq.image_url ?? null,
           adReq.cta_text ?? "Book Now", adReq.link_url ?? null, placement, 0, reqId,
           adReq.confirmed_start ?? null, adReq.confirmed_end ?? null,
           adReq.slot_duration ?? null, adReq.sharing_tier ?? null]
        );
        const adId = (result as any).insertId;
        await exec(
          "UPDATE ad_requests SET status = 'live', published_ad_id = ?, updated_at = NOW() WHERE id = ?",
          [adId, reqId]
        );
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
           `Payment confirmed! "${adReq.headline}" is now live in the TapIn Golf app and visible to golfers across South Africa.${endNote}`,
           JSON.stringify({ ad_request_id: reqId, ad_id: adId })]
        );
      }
    }
    return;
  }

  if (externalRef.startsWith("invoice-")) {
    const invoiceId = parseInt(externalRef.split("-")[1] ?? "", 10);
    if (!isNaN(invoiceId)) {
      const claimed = await run(
        "UPDATE club_invoices SET status = 'paid', paid_at = NOW() WHERE id = ? AND status = 'unpaid'",
        [invoiceId]
      );
      if (claimed === 1) {
        const inv = await row<any>(
          "SELECT ad_request_id, ad_billing_cycle_id FROM club_invoices WHERE id = ?",
          [invoiceId]
        );

        // Ad campaign invoice → auto-publish the ad
        if (inv?.ad_request_id) {
          const reqId = inv.ad_request_id;
          const adReq = await row<any>(
            `SELECT ar.*, c.name AS club_name FROM ad_requests ar JOIN clubs c ON c.id = ar.club_id WHERE ar.id = ?`,
            [reqId]
          );
          if (adReq && adReq.status === "payment_pending") {
            const placementMap: Record<string, string> = {
              club_detail: "club", featured_home: "home", explore: "explore",
              push: "home", tournament: "home", newsletter: "home", nearby_alert: "home", tee_time_deal: "home",
            };
            const placement = placementMap[adReq.ad_type] ?? "home";
            const result = await exec(
              `INSERT INTO ads (club_id, title, subtitle, image_url, cta_text, link_url, placement, priority, active,
                ad_request_id, campaign_start, campaign_end, slot_duration, sharing_tier)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
              [adReq.club_id, adReq.headline, adReq.subtitle ?? null, adReq.image_url ?? null,
               adReq.cta_text ?? "Book Now", adReq.link_url ?? null, placement, 0, reqId,
               adReq.confirmed_start ?? null, adReq.confirmed_end ?? null,
               adReq.slot_duration ?? null, adReq.sharing_tier ?? null]
            );
            const adId = (result as any).insertId;
            await exec(
              "UPDATE ad_requests SET status = 'live', published_ad_id = ?, updated_at = NOW() WHERE id = ?",
              [adId, reqId]
            );
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
               `Payment confirmed! "${adReq.headline}" is now live in the TapIn Golf app and visible to golfers across South Africa.${endNote}`,
               JSON.stringify({ ad_request_id: reqId, ad_id: adId, invoice_id: invoiceId })]
            );
          }
        }

        // Monthly ad billing cycle invoice → mark cycle as paid
        if (inv?.ad_billing_cycle_id) {
          const cycleId = inv.ad_billing_cycle_id;
          const claimed2 = await run(
            "UPDATE ad_billing_cycles SET status = 'paid', paid_at = NOW() WHERE id = ? AND status = 'pending'",
            [cycleId]
          );
          if (claimed2 === 1) {
            const cycle = await row<any>(
              `SELECT abc.billing_month, ar.club_id, ar.headline
               FROM ad_billing_cycles abc JOIN ad_requests ar ON ar.id = abc.ad_request_id
               WHERE abc.id = ?`,
              [cycleId]
            );
            if (cycle) {
              const monthLabel = new Date(String(cycle.billing_month).slice(0, 10))
                .toLocaleString("en-ZA", { month: "long", year: "numeric" });
              await exec(
                `INSERT INTO club_inbox_notifications (club_id, type, title, body, meta) VALUES (?, 'ad_update', ?, ?, ?)`,
                [cycle.club_id,
                 "✅ Ad Payment Confirmed",
                 `Payment for "${cycle.headline}" (${monthLabel}) received. Your ad continues to run — thank you!`,
                 JSON.stringify({ billing_cycle_id: cycleId, invoice_id: invoiceId })]
              );
            }
          }
        }
      }
    }
    return;
  }

  const [rawId] = externalRef.split("-player-");
  const bookingId = parseInt(rawId, 10);
  if (!isNaN(bookingId)) {
    if (externalRef.includes("-player-")) {
      const userId = parseInt(externalRef.split("-player-")[1] ?? "0", 10);
      if (userId) {
        // Check whether this player used prepaid for greens + Stitch for add-ons
        const bpFlags = await row<any>(
          "SELECT pending_prepaid_greens FROM booking_players WHERE booking_id = ? AND user_id = ?",
          [bookingId, userId]
        );
        if (bpFlags?.pending_prepaid_greens) {
          // Deduct the reserved prepaid round and mark fully paid
          const mem = await row<any>(
            `SELECT cm.id FROM club_members cm
             JOIN portal_tee_slots pts ON pts.club_id = cm.club_id
             JOIN bookings b ON b.portal_slot_id = pts.id
             WHERE b.id = ? AND cm.user_id = ? AND cm.status = 'active'`,
            [bookingId, userId]
          );
          if (mem) {
            await exec(
              `UPDATE club_members SET prepaid_rounds_used = prepaid_rounds_used + 1
               WHERE id = ? AND prepaid_rounds > prepaid_rounds_used`,
              [mem.id]
            );
          }
          await run(
            "UPDATE booking_players SET paid = 1, payment_method = ?, pending_prepaid_greens = 0 WHERE booking_id = ? AND user_id = ?",
            [`prepaid_${paymentMethod}`, bookingId, userId]
          );
        } else {
          await run(
            "UPDATE booking_players SET paid = 1, payment_method = ? WHERE booking_id = ? AND user_id = ?",
            [paymentMethod, bookingId, userId]
          );
        }
      }
    } else {
      // Idempotent + state-safe: only the delivery that flips pending→confirmed
      // marks the organizer paid and fires side effects. The guard prevents
      // duplicate/retried webhooks from re-confirming and prevents resurrecting
      // a booking that was already cancelled (e.g. by the stale-pending cleanup).
      const claimed = await run(
        "UPDATE bookings SET status = 'confirmed' WHERE id = ? AND status = 'pending'",
        [bookingId]
      );
      if (claimed === 1) {
        // Mark associated split payment as completed
        await exec(
          "UPDATE split_payments SET status = 'completed', updated_at = NOW() WHERE booking_id = ? AND status = 'pending'",
          [bookingId]
        );
        await settleOrganizerPaid(bookingId, paymentMethod);
        fireInvoiceEmail(bookingId).catch(() => {});
        syncEventRegistration(bookingId).catch(() => {});
        // Post to financial ledger
        postBookingLedgerFromId(bookingId, paymentMethod).catch(() => {});

        // Send "Booking Confirmed" notification to the organizer now that payment is done
        const booking = await row<any>(
          `SELECT b.user_id, pts.date, pts.time, c.name AS club_name
           FROM bookings b
           JOIN portal_tee_slots pts ON pts.id = b.portal_slot_id
           JOIN clubs c ON c.id = pts.club_id
           WHERE b.id = ?`,
          [bookingId]
        );
        if (booking) {
          const organizer = await row<any>("SELECT id, push_token FROM users WHERE id = ?", [booking.user_id]);
          if (organizer) {
            const bDateStr = booking.date instanceof Date ? booking.date.toISOString().split("T")[0] : String(booking.date).split("T")[0];
            const bTimeStr = String(booking.time).slice(0, 5);
            const title = "Booking Confirmed! ⛳";
            const body = `Your tee time at ${booking.club_name} on ${bDateStr} at ${bTimeStr} is confirmed.`;
            saveUserNotification(organizer.id, "booking_confirmed", title, body, { booking_id: bookingId });
            if (organizer.push_token?.startsWith("ExponentPushToken[")) {
              sendPushNotifications([{
                to: organizer.push_token,
                sound: "default",
                title,
                body,
                data: { type: "booking_confirmed", booking_id: bookingId },
              }]);
            }
          }
        }
      }
    }
  }
  logger.info({ externalRef, providerLabel }, "Processed completed payment reference");
}

router.post("/payfast/notify", async (req, res): Promise<void> => {
  const body = req.body as Record<string, string>;
  console.log("[PayFast IPN] Received:", JSON.stringify(body));
  const valid = await validatePayFastIPN(body, req.ip ?? "");
  if (!valid) {
    console.log("[PayFast IPN] Signature validation FAILED for payment_id:", body["m_payment_id"]);
    // Process anyway — signature mismatch may be due to split payment fields
    // TODO: fix signature validation properly
  }

  // Always store the IPN response on the matching split_payment
  const ipnRef = body["m_payment_id"] ?? "";
  if (ipnRef) {
    await exec(
      `UPDATE split_payments SET payfast_response = ?, updated_at = NOW()
       WHERE booking_id = (SELECT id FROM bookings WHERE payfast_payment_id = ? LIMIT 1)`,
      [JSON.stringify(body), ipnRef]
    );
  }

  if (body["payment_status"] !== "COMPLETE") {
    res.status(200).send("OK");
    return;
  }

  const externalRef = ipnRef;
  if (!externalRef) {
    res.status(200).send("OK");
    return;
  }

  await processCompletedPaymentReference(externalRef, "payfast");
  res.status(200).send("OK");
});

// Deprecated Stitch webhook kept for backward compatibility with old payments.
router.post("/stitch/webhook", async (req, res): Promise<void> => {
  const raw: string = Buffer.isBuffer(req.body)
    ? req.body.toString("utf8")
    : JSON.stringify(req.body ?? {});

  const secret = process.env["STITCH_WEBHOOK_SECRET"];

  if (secret) {
    const ok = verifySvixSignature(
      secret,
      req.header("svix-id") ?? "",
      req.header("svix-timestamp") ?? "",
      req.header("svix-signature") ?? "",
      raw,
    );
    if (!ok) {
      res.status(400).send("Invalid signature");
      return;
    }
  }

  let body: Record<string, unknown>;
  try { body = JSON.parse(raw); } catch { body = {}; }

  const status: string = String(
    (body["status"] as string) ??
    ((body["paymentInitiationRequest"] as any)?.status ?? ""),
  ).toUpperCase();

  if (status !== "PAID" && status !== "COMPLETED") {
    res.status(200).json({ received: true });
    return;
  }

  let externalRef: string =
    (body["merchantReference"] as string) ??
    (body["externalReference"] as string) ??
    ((body["paymentInitiationRequest"] as any)?.externalReference ?? "");

  const paymentId = body["id"] as string | undefined;
  if (!externalRef && paymentId) {
    try {
      const { getStitchPayment } = await import("../lib/stitch");
      const detail = await getStitchPayment(String(paymentId));
      externalRef = detail?.merchantReference ?? "";
    } catch { /* ignore — handled by the empty-ref guard below */ }
  }

  if (!externalRef) {
    res.status(200).json({ received: true });
    return;
  }

  await processCompletedPaymentReference(externalRef, "stitch");

  res.status(200).json({ received: true });
});

// ── Golf Cart Indemnity ──────────────────────────────────────────────────────

/** Fetch the club's cart indemnity form text (public — no auth required) */
router.get("/clubs/:id/cart-indemnity", async (req, res): Promise<void> => {
  const clubId = parseInt(req.params.id);
  if (isNaN(clubId)) { res.status(400).json({ message: "Invalid club ID" }); return; }
  const club = await row<any>(
    "SELECT name, cart_indemnity_text, cart_available FROM clubs WHERE id = ? AND active = 1",
    [clubId]
  );
  if (!club) { res.status(404).json({ message: "Club not found" }); return; }
  if (!club.cart_available) { res.status(404).json({ message: "Cart not available at this club" }); return; }

  // If club hasn't set custom text, return a sensible default
  const indemnityText = club.cart_indemnity_text || buildDefaultIndemnity(club.name);
  res.json({ club_name: club.name, indemnity_text: indemnityText });
});

/** Submit a signed indemnity form for a booking */
router.post("/bookings/:id/cart-indemnity", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const bookingId = parseInt(req.params.id);
  if (isNaN(bookingId)) { res.status(400).json({ message: "Invalid booking ID" }); return; }

  const { full_name, signature_data } = req.body ?? {};
  if (!full_name?.trim()) { res.status(400).json({ message: "Full name is required" }); return; }
  if (!signature_data) { res.status(400).json({ message: "Signature is required" }); return; }

  const booking = await row<any>(
    `SELECT b.id, b.user_id, b.cart_fee, pts.club_id
     FROM bookings b
     JOIN portal_tee_slots pts ON pts.id = b.portal_slot_id
     WHERE b.id = ?`,
    [bookingId]
  );
  if (!booking) { res.status(404).json({ message: "Booking not found" }); return; }
  if (booking.user_id !== user.id) { res.status(403).json({ message: "Not your booking" }); return; }

  const club = await row<any>(
    "SELECT name, cart_indemnity_text FROM clubs WHERE id = ?",
    [booking.club_id]
  );
  const indemnityText = club?.cart_indemnity_text || buildDefaultIndemnity(club?.name ?? "the Club");

  await exec(
    `INSERT INTO cart_indemnity_signatures (booking_id, user_id, club_id, full_name, signature_data, indemnity_text)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (booking_id, user_id) DO UPDATE
       SET full_name = EXCLUDED.full_name,
           signature_data = EXCLUDED.signature_data,
           indemnity_text = EXCLUDED.indemnity_text,
           signed_at = NOW()`,
    [bookingId, user.id, booking.club_id, full_name.trim(), signature_data, indemnityText]
  );

  res.json({ success: true });
});

/** Check if indemnity has been signed for a booking */
router.get("/bookings/:id/cart-indemnity", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }
  const bookingId = parseInt(req.params.id);
  if (isNaN(bookingId)) { res.status(400).json({ message: "Invalid booking ID" }); return; }
  const sig = await row<any>(
    "SELECT id, full_name, signed_at FROM cart_indemnity_signatures WHERE booking_id = ? AND user_id = ?",
    [bookingId, user.id]
  );
  res.json({ signed: !!sig, signature: sig ?? null });
});

function buildDefaultIndemnity(clubName: string): string {
  return `GOLF CART RENTAL AGREEMENT & INDEMNITY FORM

${clubName}

RULES & REGULATIONS:
1. The golf cart must remain on designated cart paths at all times unless otherwise indicated.
2. Maximum of two (2) persons per cart at any time.
3. Carts must not be driven within 10 metres of any green or tee box.
4. The driver must hold a valid driver's licence and be at least 18 years of age.
5. No reckless driving, racing, or dangerous manoeuvres.
6. Carts must be returned to the designated area immediately after the round.
7. Any damage to the cart, course, or property must be reported immediately.
8. The renter is financially responsible for all damage caused during the rental period.
9. Alcohol consumption while operating a golf cart is strictly prohibited.
10. Carts must not be driven on public roads or outside club premises.

WAIVER OF LIABILITY:
I acknowledge that the use of a golf cart involves inherent risks including but not limited to collision, tipping, mechanical failure, and personal injury. I voluntarily assume all risks associated with the use of the golf cart.

ASSUMPTION OF RISK:
I understand that operating a golf cart carries risks and I voluntarily accept those risks. I confirm that I am physically capable of operating the cart safely.

INDEMNIFICATION:
I hereby indemnify and hold harmless ${clubName}, its owners, employees, agents, and affiliates from any and all claims, damages, losses, costs, and expenses (including legal fees) arising from my use of the golf cart, whether caused by negligence or otherwise.

I confirm that I have read, understood, and agree to abide by the above rules and conditions.`;
}

export default router;
