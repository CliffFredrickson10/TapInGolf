import { Router, type IRouter } from "express";
import crypto from "crypto";
import { query, row, exec, run, withTransaction, clientQuery } from "../lib/pg";
import { getUser } from "../lib/auth";
import { isHnaVerified } from "../lib/hna";
import { sendPushNotifications } from "../lib/notifications";
import { saveUserNotification } from "../lib/userNotifications";
import { createStitchPayment, getStitchPayment } from "../lib/stitch";
import { sendInvoiceEmail } from "../lib/otp";
import { getUserTierPrices } from "../lib/pricing";

const router: IRouter = Router();

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

// Release seats reserved by Stitch checkouts that were never completed.
// Such bookings stay 'pending' (the webhook confirms them on payment); past a
// short grace window they are cancelled so the slot opens back up.
async function releaseStalePendingBookings(): Promise<void> {
  await exec(`
    WITH stale AS (
      UPDATE bookings SET status = 'cancelled'
      WHERE status = 'pending'
        AND payment_method = 'stitch'
        AND created_at < NOW() - INTERVAL '15 minutes'
      RETURNING portal_slot_id, players
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
       GREATEST(0, pts.max_players - pts.player_count) AS available,
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
       (SELECT JSON_AGG(JSON_BUILD_OBJECT('name', psb.player_name, 'players', 1))
        FROM portal_slot_bookings psb WHERE psb.slot_id = pts.id
       ) AS existing_players
     FROM portal_tee_slots pts
     JOIN clubs c ON c.id = pts.club_id
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
    payment_method = "stitch", voucher_code, include_cart = false,
    holes = 18,             // 9 or 18
    hna_number = null,      // HNA membership number — upgrades non-members to affiliated_visitor tier
  } = req.body ?? {};

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
       GREATEST(0, pts.max_players - pts.player_count) AS available
     FROM portal_tee_slots pts
     JOIN clubs c ON c.id = pts.club_id
     WHERE pts.id = ? AND pts.is_active = 1`,
    [parseInt(tee_time_id)]
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

  // ── Event restriction check ──────────────────────────────────────
  // If this date has a restricted event, verify the user is eligible
  const slotDate = slot.date instanceof Date
    ? slot.date.toISOString().split("T")[0]
    : String(slot.date).split("T")[0];

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
          error_code: "event_members_only",
          event_id:   restrictedEvent.id,
        });
        return;
      }
    } else if (restrictedEvent.restriction === "invitation_only") {
      const reg = await row<any>(
        "SELECT status FROM event_registrations WHERE event_id = ? AND user_id = ?",
        [restrictedEvent.id, user.id]
      );
      if (!reg || reg.status !== "approved") {
        res.status(403).json({
          message: `"${restrictedEvent.name}" is an invitation-only event. Please contact the club to request access.`,
          error_code:        "event_invitation_only",
          event_id:          restrictedEvent.id,
          registration_status: reg?.status ?? null,
        });
        return;
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

  // Use 9-hole price when requested and available, else 18-hole
  const numHoles = holes === 9 && slot.price_9 != null ? 9 : 18;
  const rawPrice = numHoles === 9 ? parseFloat(slot.price_9) : parseFloat(slot.price);
  const priceCol = numHoles === 9 ? "price_9h" : "price_18h";

  // Resolve organizer's tier price: member tier > HNA affiliated > non-affiliated visitor
  let basePrice = slot.promotional_price ? parseFloat(slot.promotional_price) : rawPrice;
  if (!slot.promotional_price) {
    const memberTierRow = await row<any>(
      "SELECT membership_type FROM club_members WHERE club_id = ? AND user_id = ? AND status = 'active'",
      [slot.club_id, user.id]
    );
    // HNA affiliation is universal but must be CLUB-VERIFIED: only a golfer with an
    // active, non-expired membership somewhere qualifies for the affiliated-visitor
    // rate. A self-typed number (the legacy hna_number param) no longer grants it.
    const verified = await isHnaVerified(user.id);
    const tierType = memberTierRow
      ? memberTierRow.membership_type
      : (verified ? "affiliated_visitor" : "non_affiliated_visitor");
    const tierPrice = await row<any>(
      `SELECT ${priceCol} FROM club_pricing_tiers WHERE club_id = ? AND tier_type = ?`,
      [slot.club_id, tierType]
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
      const voucherValid =
        voucher &&
        (!voucher.expires_at || new Date(voucher.expires_at) > new Date()) &&
        (voucher.max_uses === null || voucher.uses_count < voucher.max_uses) &&
        (voucher.club_id === null || voucher.club_id === slot.club_id);
      if (voucherValid) {
        if (voucher.discount_type === "percentage") {
          discountAmount = Math.round(totalGreens * parseFloat(voucher.discount_value) / 100 * 100) / 100;
        } else {
          discountAmount = Math.min(parseFloat(voucher.discount_value), totalGreens);
        }
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

  const greensAfterDiscount = Math.max(0, totalGreens - discountAmount);
  const totalAmount         = greensAfterDiscount + cartFee;

  // Organizer's payment: their greens (R0 if prepaid) + full cart (solo) or cart share (split)
  const splitAmount = split_bill && numPlayers > 1
    ? organizerGreens + cartShare
    : totalAmount;

  // If a voucher covers the full amount no gateway is needed — override to "voucher"
  // so the booking is auto-confirmed without trying to send R0 to Stitch.
  const effectivePaymentMethod = splitAmount <= 0 ? "voucher" : payment_method;

  // Each invited player's payment: their individual tier price + cart share (split) or R0 (organizer pays all)
  const friendAmounts = invitedGreens.map(g => split_bill ? g + cartShare : 0);

  const ref = generateRef();

  // Load platform flat fee (default R10)
  const feeSetting = await row<any>("SELECT setting_value FROM platform_settings WHERE setting_key = 'platform_fee_flat'");
  const platformFee = feeSetting ? parseFloat(feeSetting.setting_value) : 10;
  const clubAmount  = Math.round((totalAmount - platformFee) * 100) / 100;

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
  await withTransaction(async (client) => {
    const insertResult = await clientQuery(client,
      `INSERT INTO bookings (user_id, tee_time_id, portal_slot_id, players, split_bill, total_amount, my_amount,
        booking_ref, payment_method, status, voucher_code, discount_amount, cart_fee, platform_fee, club_amount, holes)
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?) RETURNING id`,
      [user.id, parseInt(tee_time_id),
       numPlayers, split_bill ? 1 : 0, totalAmount, splitAmount,
       ref, effectivePaymentMethod, appliedVoucher, discountAmount, cartFee, platformFee, clubAmount, numHoles]
    );
    bookingId = insertResult.rows[0].id;

    await clientQuery(client,
      "INSERT INTO booking_players (booking_id, user_id, guest_name, paid, amount) VALUES (?, ?, NULL, 0, ?)",
      [bookingId, user.id, splitAmount]
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

    // Confirm immediately only for payments settled at creation (prepaid, wallet, voucher).
    // Stitch bookings stay 'pending' until the payment webhook confirms them, so
    // an abandoned checkout never permanently holds the slot.
    if (effectivePaymentMethod !== "stitch") {
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
        await clientQuery(client, "UPDATE vouchers SET uses_count = uses_count + 1 WHERE code = ?", [appliedVoucher]);
      }
    }
    // For prepaid: deduct one round from the member's balance
    if (payment_method === "prepaid") {
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
    // For non-Stitch payments (prepaid, wallet, voucher) the organizer is paid immediately
    if (effectivePaymentMethod !== "stitch") {
      await clientQuery(client,
        "UPDATE booking_players SET paid = 1, payment_method = ? WHERE booking_id = ? AND user_id = ?",
        [effectivePaymentMethod, bookingId, user.id]
      );
    }
    // Track booked players in the portal slot
    await clientQuery(client,
      "UPDATE portal_tee_slots SET player_count = player_count + ? WHERE id = ?",
      [numPlayers, parseInt(tee_time_id)]
    );
  });

  // Auto-send invoice for payments confirmed immediately (prepaid / wallet / voucher)
  if (effectivePaymentMethod !== "stitch") {
    fireInvoiceEmail(bookingId).catch(() => {});
  }

  let paymentUrl: string | null = null;
  if (effectivePaymentMethod === "stitch") {
    const host = req.get("host") ?? "";
    try {
      const pr = await createStitchPayment({
        amount:            splitAmount,
        payerName:         user.name,
        payerEmail:        user.email,
        merchantReference: String(bookingId),
        redirectUrl:       `https://${host}/booking/success`,
      });
      paymentUrl = pr.url;
    } catch (stitchErr: any) {
      // Stitch call failed — cancel the booking, release the reserved seats,
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
      const isConfig = (stitchErr.message ?? "").includes("not configured");
      res.status(isConfig ? 503 : 502).json({
        message: isConfig
          ? "Payment gateway not configured. Set STITCH_CLIENT_ID and STITCH_CLIENT_SECRET."
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
  const pushMessages = playerRows
    .filter((p: any) => p.push_token?.startsWith("ExponentPushToken["))
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
  for (const p of playerRows) {
    const isOrganizer = p.id === user.id;
    saveUserNotification(
      p.id,
      isOrganizer ? "booking_confirmed" : "booking_invited",
      buildTitle(isOrganizer),
      buildBody(isOrganizer),
      { booking_id: bookingId }
    );
  }

  res.status(201).json({
    booking_id:  bookingId,
    booking_ref: ref,
    payment_url: paymentUrl,
    status:      "confirmed",
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
  const { payment_method = "stitch" } = req.body as { payment_method?: string };

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
    await exec(
      `UPDATE club_members SET prepaid_rounds_used = prepaid_rounds_used + 1
       WHERE id = ? AND prepaid_rounds > prepaid_rounds_used`,
      [membership.id]
    );
    await exec("UPDATE booking_players SET paid = 1, payment_method = 'prepaid' WHERE booking_id = ? AND user_id = ?", [id, user.id]);
    res.json({ success: true, method: "prepaid", amount, booking_id: id, rounds_remaining: remaining - 1 });
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

  // ── Stitch payment (default) ───────────────────────────────────────────────
  const host = req.get("host") ?? "";
  const pr = await createStitchPayment({
    amount,
    payerName:         user.name,
    payerEmail:        user.email,
    merchantReference: `${id}-player-${user.id}`,
    redirectUrl:       `https://${host}/booking/success`,
  });

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
    // Release the seats this booking reserved so the slot opens back up
    if (booking.portal_slot_id) {
      await clientQuery(client,
        "UPDATE portal_tee_slots SET player_count = GREATEST(0, player_count - ?) WHERE id = ?",
        [parseInt(booking.players, 10) || 1, booking.portal_slot_id]
      );
    }
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
        JSON.stringify({ booking_ref: booking.booking_ref, golfer_name: booking.golfer_name, golfer_email: booking.golfer_email, golfer_phone: booking.golfer_phone ?? null, tee_date: club.tee_date, tee_time: club.tee_time, players, total_amount: total, cancel_fee_pct: feePct, refund_amount: refund }),
      ]
    ).catch((err: unknown) => {
      console.error("[cancel] Failed to write portal inbox notification:", err);
    });
  }

  res.json({
    success: true,
    contact_email: club?.cancel_contact_email ?? null,
    contact_phone: club?.cancel_contact_phone ?? null,
  });
});

// Stitch Express webhook — server-to-server payment notification (via Svix).
// Payload: { amount, id (payment id), status:"PAID", type, linkId, ... }. The
// merchantReference (our identifier) is NOT in the payload, so we fetch the
// payment by its id to resolve it. The raw-body parser for this route is mounted
// in app.ts so Svix signature verification works.
router.post("/stitch/webhook", async (req, res): Promise<void> => {
  const raw: string = Buffer.isBuffer(req.body)
    ? req.body.toString("utf8")
    : JSON.stringify(req.body ?? {});

  const secret = process.env["STITCH_WEBHOOK_SECRET"];

  if (secret) {
    // Verify the Svix signature over the raw body before trusting the payload.
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

  // Status: Express sends "PAID"; tolerate the legacy "completed" too.
  const status: string = String(
    (body["status"] as string) ??
    ((body["paymentInitiationRequest"] as any)?.status ?? ""),
  ).toUpperCase();

  if (status !== "PAID" && status !== "COMPLETED") {
    res.status(200).json({ received: true });
    return;
  }

  // Resolve our merchantReference. Express omits it from the event, so look it
  // up by the payment id; fall back to any inline reference for safety.
  let externalRef: string =
    (body["merchantReference"] as string) ??
    (body["externalReference"] as string) ??
    ((body["paymentInitiationRequest"] as any)?.externalReference ?? "");

  const paymentId = body["id"] as string | undefined;
  if (!externalRef && paymentId) {
    try {
      const detail = await getStitchPayment(String(paymentId));
      externalRef = detail?.merchantReference ?? "";
    } catch { /* ignore — handled by the empty-ref guard below */ }
  }

  if (!externalRef) {
    res.status(200).json({ received: true });
    return;
  }

  // Wallet top-up: externalReference is "wallet-<topupId>"
  if (externalRef.startsWith("wallet-")) {
    const topupId = parseInt(externalRef.split("-")[1] ?? "", 10);
    if (!isNaN(topupId)) {
      const topup = await row<any>(
        "SELECT id, user_id, amount FROM wallet_topups WHERE id = ?",
        [topupId]
      );
      if (topup) {
        // Idempotent: only the delivery that actually flips pending→completed
        // credits the wallet, so duplicate/retried webhooks can't double-credit.
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
        }
      }
    }
    res.status(200).json({ received: true });
    return;
  }

  // Booking payment: externalReference is "<bookingId>" or "<bookingId>-player-<userId>"
  const [rawId] = externalRef.split("-player-");
  const bookingId = parseInt(rawId, 10);
  if (!isNaN(bookingId)) {
    if (externalRef.includes("-player-")) {
      const userId = parseInt(externalRef.split("-player-")[1] ?? "0", 10);
      if (userId) {
        await run(
          "UPDATE booking_players SET paid = 1, payment_method = 'stitch' WHERE booking_id = ? AND user_id = ?",
          [bookingId, userId]
        );
      }
    } else {
      await run("UPDATE bookings SET status = 'confirmed' WHERE id = ?", [bookingId]);
      await run(
        "UPDATE booking_players SET paid = 1, payment_method = 'stitch' WHERE booking_id = ? AND user_id = (SELECT user_id FROM bookings WHERE id = ?)",
        [bookingId, bookingId]
      );
      // Auto-send invoice after Stitch payment confirmation (fire-and-forget)
      fireInvoiceEmail(bookingId).catch(() => {});
    }
  }

  res.status(200).json({ received: true });
});

export default router;
