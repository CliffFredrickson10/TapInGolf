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

// Create holds for upcoming slots matching active standing reservations.
// Runs inside a transaction holding an advisory lock so concurrent runs
// (worker tick + portal create/update) serialize, and each insert re-checks
// remaining capacity atomically in the same statement.
export async function materializeStandingHolds(): Promise<number> {
  const toNotify: Array<{ user_id: number; push_token: string | null; club_id: number; club_name: string; slot_id: number; dateStr: string; timeStr: string; confirmBy: Date }> = [];

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
       ORDER BY pts.date ASC, pts.tee_time ASC`
    );

    let n = 0;
    for (const r of rows) {
      const dateStr = fmtDate(r.date);
      const timeStr = String(r.tee_time).slice(0, 5);
      const teeDt = new Date(`${dateStr}T${timeStr}:00+02:00`);
      if (isNaN(teeDt.getTime())) continue;

      const confirmBy = new Date(teeDt.getTime() - Number(r.confirm_hours_before) * 3600_000);
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
      toNotify.push({ user_id: r.user_id, push_token: r.push_token, club_id: r.club_id, club_name: r.club_name, slot_id: r.slot_id, dateStr, timeStr, confirmBy });
    }
    return n;
  });

  // Notify only after the transaction committed.
  for (const t of toNotify) {
    await notify(
      t.user_id,
      t.push_token,
      "standing_tee_time",
      "⛳ Standing tee time reserved",
      `Your regular tee time at ${t.club_name} — ${t.dateStr} at ${t.timeStr} — is being held for you. Confirm by ${fmtSast(t.confirmBy)} or it will be released.`,
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
  const created = await materializeStandingHolds();
  const released = await releaseExpiredStandingHolds();
  return { created, released };
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
