import { query, run, withTransaction, clientQuery } from "../lib/pg";
import { logger } from "../lib/logger";
import { saveUserNotification } from "../lib/userNotifications";
import { sendPushNotifications } from "../lib/notifications";

const POLL_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes
const INITIAL_DELAY_MS = 20 * 1000;

const DOW_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function fmtDate(d: any): string {
  return (d instanceof Date ? d.toISOString() : String(d)).slice(0, 10);
}

// Format a UTC timestamp for display in SAST (UTC+2)
function fmtSast(dt: Date): string {
  const sast = new Date(dt.getTime() + 2 * 3600_000);
  const iso = sast.toISOString();
  return `${DOW_NAMES[sast.getUTCDay()].slice(0, 3)} ${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

async function notify(userId: number, pushToken: string | null, type: string, title: string, body: string, data: Record<string, any>): Promise<void> {
  saveUserNotification(userId, type, title, body, data);
  if (pushToken?.startsWith("ExponentPushToken[")) {
    try {
      await sendPushNotifications([{ to: pushToken, sound: "default", title, body, data }]);
    } catch {}
  }
}

// When a tournament with prepopulate_standing = 1 takes over a time that has
// standing holds on a public slot, move those holds onto the tournament slot
// instead of releasing them. The hold's deadline becomes the tournament's
// standing_confirm_by (when set). Members are told their regular time is now
// part of the tournament. Holds that cannot be moved (no capacity on the event
// slot) are left in place and picked up by the orphan release that runs next.
export async function migrateHoldsToPrepopulatingEvents(): Promise<number> {
  const toNotify: Array<{ user_id: number; push_token: string | null; club_id: number; club_name: string; event_id: number; event_name: string; slot_id: number; dateStr: string; timeStr: string; confirmBy: Date }> = [];

  const moved = await withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('standing_holds_materialize'))");

    const { rows } = await clientQuery(client,
      `SELECT sh.id AS hold_id, sh.user_id, sh.confirm_by AS old_confirm_by,
              ev.id AS event_slot_id, ev.date, ev.tee_time,
              ge.id AS event_id, ge.name AS event_name, ge.standing_confirm_by,
              c.id AS club_id, c.name AS club_name, u.push_token
       FROM standing_holds sh
       JOIN portal_tee_slots pts ON pts.id = sh.slot_id AND pts.event_id IS NULL
       JOIN portal_tee_slots ev
         ON ev.club_id = pts.club_id AND ev.date = pts.date AND ev.tee_time = pts.tee_time
        AND ev.event_id IS NOT NULL AND ev.is_active = 1
        AND COALESCE(ev.tee_start_type, 'any') = COALESCE(pts.tee_start_type, 'any')
        AND ev.id = (
          SELECT MIN(e2.id) FROM portal_tee_slots e2
          WHERE e2.club_id = pts.club_id AND e2.date = pts.date AND e2.tee_time = pts.tee_time
            AND e2.event_id = ev.event_id AND e2.is_active = 1
            AND COALESCE(e2.tee_start_type, 'any') = COALESCE(pts.tee_start_type, 'any')
        )
       JOIN golf_events ge
         ON ge.id = ev.event_id
        AND ge.prepopulate_standing = 1
        AND ge.status = 'active'
       JOIN clubs c ON c.id = pts.club_id
       JOIN users u ON u.id = sh.user_id
       WHERE sh.status = 'held'`
    );

    let n = 0;
    for (const r of rows) {
      const confirmBy: Date = r.standing_confirm_by ? new Date(r.standing_confirm_by) : new Date(r.old_confirm_by);
      if (confirmBy.getTime() <= Date.now()) continue; // tournament deadline already passed — orphan release handles it

      // Move the hold only if the member has no hold on the event slot yet and
      // the event slot still has capacity (booked players + held seats).
      const upd = await clientQuery(client,
        `UPDATE standing_holds sh
         SET slot_id = ?, confirm_by = ?
         WHERE sh.id = ? AND sh.status = 'held'
           AND NOT EXISTS (
             SELECT 1 FROM standing_holds x WHERE x.slot_id = ? AND x.user_id = sh.user_id
           )
           AND (SELECT p.max_players - p.player_count FROM portal_tee_slots p WHERE p.id = ?)
             > (SELECT COUNT(*)::int FROM standing_holds h2 WHERE h2.slot_id = ? AND h2.status = 'held')`,
        [r.event_slot_id, confirmBy, r.hold_id, r.event_slot_id, r.event_slot_id, r.event_slot_id]
      );
      if (!upd.rowCount) continue;
      n++;
      toNotify.push({
        user_id: r.user_id, push_token: r.push_token, club_id: r.club_id, club_name: r.club_name,
        event_id: r.event_id, event_name: r.event_name, slot_id: r.event_slot_id,
        dateStr: fmtDate(r.date), timeStr: String(r.tee_time).slice(0, 5), confirmBy,
      });
    }
    return n;
  });

  for (const t of toNotify) {
    await notify(
      t.user_id,
      t.push_token,
      "standing_tee_time_event",
      "🏆 Your standing tee time is now a tournament",
      `${t.club_name} has scheduled ${t.event_name} over your regular tee time (${t.dateStr} at ${t.timeStr}). Your seat is still held for you — confirm by ${fmtSast(t.confirmBy)} or it will be released.`,
      { type: "standing_tee_time_event", slot_id: t.slot_id, club_id: t.club_id, event_id: t.event_id, date: t.dateStr, tee_time: t.timeStr }
    );
  }
  return moved;
}

// Create holds for upcoming slots matching active standing reservations.
// Runs inside a transaction holding an advisory lock so concurrent runs
// (worker tick + portal create/update) serialize, and each insert re-checks
// remaining capacity atomically in the same statement.
export async function materializeStandingHolds(): Promise<number> {
  const toNotify: Array<{ user_id: number; push_token: string | null; club_id: number; club_name: string; slot_id: number; dateStr: string; timeStr: string; confirmBy: Date; event_name: string | null }> = [];

  const created = await withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('standing_holds_materialize'))");

    const { rows } = await clientQuery(client,
      `SELECT sr.id AS reservation_id, sr.club_id, sr.confirm_hours_before,
              srm.user_id, pts.id AS slot_id, pts.date, pts.tee_time,
              c.name AS club_name, u.push_token
       FROM standing_reservations sr
       JOIN standing_reservation_members srm ON srm.reservation_id = sr.id
       JOIN portal_tee_slots pts
         ON pts.club_id  = sr.club_id
        AND pts.tee_time = sr.tee_time
        AND pts.is_active = 1
        AND pts.event_id IS NULL
        AND pts.date >= CURRENT_DATE
        AND EXTRACT(DOW FROM pts.date) = sr.day_of_week
        -- duplicate slot rows can exist for the same date/time — hold only the first
        AND pts.id = (
          SELECT MIN(p2.id) FROM portal_tee_slots p2
          WHERE p2.club_id = pts.club_id AND p2.date = pts.date AND p2.tee_time = pts.tee_time
            AND p2.is_active = 1 AND p2.event_id IS NULL
        )
       JOIN clubs c ON c.id = sr.club_id
       JOIN users u ON u.id = srm.user_id
       WHERE sr.active = 1
         AND NOT EXISTS (
           SELECT 1 FROM standing_holds sh
           WHERE sh.slot_id = pts.id AND sh.user_id = srm.user_id
         )
         -- skip slots superseded by an active tournament slot at the same time
         -- (the public tee sheet hides them, so a hold could never be confirmed)
         AND NOT EXISTS (
           SELECT 1 FROM portal_tee_slots ev
           WHERE ev.club_id = pts.club_id AND ev.date = pts.date AND ev.tee_time = pts.tee_time
             AND ev.event_id IS NOT NULL AND ev.is_active = 1
             AND COALESCE(ev.tee_start_type, 'any') = COALESCE(pts.tee_start_type, 'any')
         )
       ORDER BY pts.date ASC, pts.tee_time ASC`
    );

    // Tournament slots whose event pre-populates standing tee times: standing
    // members get a hold directly on the event slot, with the tournament's
    // standing_confirm_by as the deadline (falls back to the reservation's
    // hours-before rule when the tournament has no explicit deadline).
    const { rows: eventRows } = await clientQuery(client,
      `SELECT sr.id AS reservation_id, sr.club_id, sr.confirm_hours_before,
              srm.user_id, pts.id AS slot_id, pts.date, pts.tee_time,
              ge.id AS event_id, ge.name AS event_name, ge.standing_confirm_by,
              c.name AS club_name, u.push_token
       FROM standing_reservations sr
       JOIN standing_reservation_members srm ON srm.reservation_id = sr.id
       JOIN portal_tee_slots pts
         ON pts.club_id  = sr.club_id
        AND pts.tee_time = sr.tee_time
        AND pts.is_active = 1
        AND pts.event_id IS NOT NULL
        AND pts.date >= CURRENT_DATE
        AND EXTRACT(DOW FROM pts.date) = sr.day_of_week
        AND pts.id = (
          SELECT MIN(p2.id) FROM portal_tee_slots p2
          WHERE p2.club_id = pts.club_id AND p2.date = pts.date AND p2.tee_time = pts.tee_time
            AND p2.is_active = 1 AND p2.event_id = pts.event_id
        )
       JOIN golf_events ge ON ge.id = pts.event_id AND ge.prepopulate_standing = 1 AND ge.status = 'active'
       JOIN clubs c ON c.id = sr.club_id
       JOIN users u ON u.id = srm.user_id
       WHERE sr.active = 1
         AND NOT EXISTS (
           SELECT 1 FROM standing_holds sh
           WHERE sh.slot_id = pts.id AND sh.user_id = srm.user_id
         )
       ORDER BY pts.date ASC, pts.tee_time ASC`
    );

    let n = 0;
    for (const r of [...rows, ...eventRows]) {
      const dateStr = fmtDate(r.date);
      const timeStr = String(r.tee_time).slice(0, 5);
      const teeDt = new Date(`${dateStr}T${timeStr}:00+02:00`);
      if (isNaN(teeDt.getTime())) continue;

      const confirmBy = r.standing_confirm_by
        ? new Date(r.standing_confirm_by)
        : new Date(teeDt.getTime() - Number(r.confirm_hours_before) * 3600_000);
      if (confirmBy.getTime() <= Date.now()) continue; // deadline already passed — leave slot public

      // Atomic insert: capacity (booked players + currently held seats) is
      // re-checked in the same statement that inserts the hold.
      const ins = await clientQuery(client,
        `INSERT INTO standing_holds (reservation_id, slot_id, user_id, status, confirm_by)
         SELECT ?, ?, ?, 'held', ?
         WHERE (SELECT pts.max_players - pts.player_count FROM portal_tee_slots pts WHERE pts.id = ?)
             > (SELECT COUNT(*)::int FROM standing_holds sh WHERE sh.slot_id = ? AND sh.status = 'held')
         ON CONFLICT (slot_id, user_id) DO NOTHING`,
        [r.reservation_id, r.slot_id, r.user_id, confirmBy, r.slot_id, r.slot_id]
      );
      if (!ins.rowCount) continue;
      n++;
      toNotify.push({ user_id: r.user_id, push_token: r.push_token, club_id: r.club_id, club_name: r.club_name, slot_id: r.slot_id, dateStr, timeStr, confirmBy, event_name: r.event_name ?? null });
    }
    return n;
  });

  // Notify only after the transaction committed.
  for (const t of toNotify) {
    await notify(
      t.user_id,
      t.push_token,
      "standing_tee_time",
      t.event_name ? "🏆 Standing tee time reserved for tournament" : "⛳ Standing tee time reserved",
      t.event_name
        ? `Your regular tee time at ${t.club_name} — ${t.dateStr} at ${t.timeStr} — falls in ${t.event_name} and is being held for you. Confirm by ${fmtSast(t.confirmBy)} or it will be released.`
        : `Your regular tee time at ${t.club_name} — ${t.dateStr} at ${t.timeStr} — is being held for you. Confirm by ${fmtSast(t.confirmBy)} or it will be released.`,
      { type: "standing_tee_time", slot_id: t.slot_id, club_id: t.club_id, date: t.dateStr, tee_time: t.timeStr }
    );
  }
  return created;
}

// Release unconfirmed holds past their deadline and notify the members.
// UPDATE ... RETURNING guarantees we only notify rows actually released
// (a hold confirmed between select and update would otherwise be mis-notified).
export async function releaseExpiredStandingHolds(): Promise<number> {
  const expired = await query<any>(
    `UPDATE standing_holds sh
     SET status = 'released'
     FROM portal_tee_slots pts, clubs c, users u
     WHERE sh.status = 'held' AND sh.confirm_by < NOW()
       AND pts.id = sh.slot_id AND c.id = pts.club_id AND u.id = sh.user_id
     RETURNING sh.id, sh.user_id, sh.slot_id, pts.date, pts.tee_time, c.name AS club_name, c.id AS club_id, u.push_token`
  );
  if (!expired.length) return 0;

  for (const e of expired) {
    const dateStr = fmtDate(e.date);
    const timeStr = String(e.tee_time).slice(0, 5);
    await notify(
      e.user_id,
      e.push_token,
      "standing_tee_time_released",
      "Standing tee time released",
      `Your reserved tee time at ${e.club_name} — ${dateStr} at ${timeStr} — was not confirmed in time and has been released.`,
      { type: "standing_tee_time_released", slot_id: e.slot_id, club_id: e.club_id, date: dateStr, tee_time: timeStr }
    );
  }
  return expired.length;
}

// Release holds whose slot is no longer bookable: the club deactivated the
// slot, or a tournament slot now occupies the same time (the public tee sheet
// hides the general slot in favour of the event slot, so the member could
// never confirm). Members get a "released" notice instead of a dead hold.
export async function releaseOrphanedStandingHolds(): Promise<number> {
  const orphaned = await query<any>(
    `UPDATE standing_holds sh
     SET status = 'released'
     FROM portal_tee_slots pts, clubs c, users u
     WHERE sh.status = 'held'
       AND pts.id = sh.slot_id AND c.id = pts.club_id AND u.id = sh.user_id
       AND (
         pts.is_active = 0
         -- public slot superseded by a tournament slot (holds that could move
         -- onto a prepopulating tournament were already migrated before this).
         -- Holds superseded by a prepopulating DRAFT (pending_publish) event are
         -- kept in place — they migrate onto the event slot when it is published.
         OR (pts.event_id IS NULL AND EXISTS (
           SELECT 1 FROM portal_tee_slots ev
           JOIN golf_events ge2 ON ge2.id = ev.event_id
           WHERE ev.club_id = pts.club_id AND ev.date = pts.date AND ev.tee_time = pts.tee_time
             AND ev.is_active = 1
             AND COALESCE(ev.tee_start_type, 'any') = COALESCE(pts.tee_start_type, 'any')
             AND NOT (ge2.prepopulate_standing = 1 AND ge2.status = 'pending_publish')
         ))
         -- hold sits on a tournament slot whose event was cancelled or no
         -- longer pre-populates standing tee times
         OR (pts.event_id IS NOT NULL AND EXISTS (
           SELECT 1 FROM golf_events ge
           WHERE ge.id = pts.event_id
             AND (ge.status = 'cancelled' OR ge.prepopulate_standing = 0)
         ))
       )
     RETURNING sh.id, sh.user_id, sh.slot_id, pts.date, pts.tee_time, c.name AS club_name, c.id AS club_id, u.push_token`
  );
  if (!orphaned.length) return 0;

  for (const e of orphaned) {
    const dateStr = fmtDate(e.date);
    const timeStr = String(e.tee_time).slice(0, 5);
    await notify(
      e.user_id,
      e.push_token,
      "standing_tee_time_released",
      "Standing tee time released",
      `Your reserved tee time at ${e.club_name} — ${dateStr} at ${timeStr} — is no longer available (the club closed this slot or scheduled a tournament) and has been released.`,
      { type: "standing_tee_time_released", slot_id: e.slot_id, club_id: e.club_id, date: dateStr, tee_time: timeStr }
    );
  }
  return orphaned.length;
}

// Holds confirmed against a booking that was later cancelled revert to 'held'
// (if the deadline hasn't passed) so the seat is protected again, or 'released'.
export async function revertHoldsForCancelledBookings(): Promise<void> {
  await run(`
    UPDATE standing_holds sh
    SET status = CASE WHEN sh.confirm_by > NOW() THEN 'held' ELSE 'released' END,
        booking_id = NULL
    WHERE sh.status = 'confirmed'
      AND sh.booking_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM bookings b WHERE b.id = sh.booking_id AND b.status = 'cancelled')
  `);
}

export async function runStandingReservationsOnce(): Promise<{ created: number; released: number }> {
  await revertHoldsForCancelledBookings();
  await migrateHoldsToPrepopulatingEvents();
  const orphaned = await releaseOrphanedStandingHolds();
  const created = await materializeStandingHolds();
  const released = await releaseExpiredStandingHolds();
  return { created, released: released + orphaned };
}

export function startStandingReservationsWorker(): void {
  const tick = async () => {
    try {
      const { created, released } = await runStandingReservationsOnce();
      if (created || released) {
        logger.info({ created, released }, "standing reservations worker tick");
      }
    } catch (err) {
      logger.warn({ err }, "standing reservations worker failed");
    }
  };
  setTimeout(tick, INITIAL_DELAY_MS);
  setInterval(tick, POLL_INTERVAL_MS);
}
