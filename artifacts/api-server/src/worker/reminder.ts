import { query, row, run } from "../lib/pg";
import { sendPushNotifications } from "../lib/notifications";
import { saveUserNotification } from "../lib/userNotifications";
import { logger } from "../lib/logger";

const POLL_INTERVAL_MS = 60_000; // check every 60 seconds
const WINDOW_MINUTES   = 3;      // ±window around target — covers a missed tick

async function getLeadMinutes(): Promise<number> {
  try {
    const setting = await row<{ value: string }>(
      "SELECT value FROM app_settings WHERE `key` = 'notify_minutes_before'"
    );
    const parsed = parseInt(setting?.value ?? "120", 10);
    return isNaN(parsed) || parsed < 1 ? 120 : parsed;
  } catch {
    return 120;
  }
}

async function runReminderCycle(): Promise<void> {
  const leadMinutes = await getLeadMinutes();

  // Find all upcoming bookings whose tee time is exactly `leadMinutes` away
  // (within a ±WINDOW_MINUTES tolerance) and haven't been reminded yet.
  // We also respect the user's notif_bookings preference.
  const due = await query<any>(
    `SELECT
       b.id          AS booking_id,
       b.user_id,
       u.name        AS user_name,
       u.push_token,
       c.name        AS club_name,
       pts.date      AS tee_date,
       pts.tee_time  AS tee_time
     FROM bookings b
     JOIN portal_tee_slots pts ON pts.id = b.portal_slot_id
     JOIN clubs c ON c.id = pts.club_id
     JOIN users u ON u.id = b.user_id
     LEFT JOIN user_notification_prefs p ON p.user_id = u.id
     WHERE b.status IN ('confirmed', 'pending')
       AND EXTRACT(EPOCH FROM ((pts.date + pts.tee_time::time) - NOW())) / 60 BETWEEN ? AND ?
       AND (p.notif_bookings IS NULL OR p.notif_bookings = 1)
       AND NOT EXISTS (
         SELECT 1 FROM tee_time_reminders_sent r
         WHERE r.booking_id = b.id AND r.user_id = b.user_id
       )`,
    [leadMinutes - WINDOW_MINUTES, leadMinutes + WINDOW_MINUTES]
  );

  if (!due.length) return;

  logger.info({ count: due.length, leadMinutes }, "Sending tee-time reminders");

  const hours   = Math.floor(leadMinutes / 60);
  const mins    = leadMinutes % 60;
  const timeStr = hours > 0
    ? (mins > 0 ? `${hours}h ${mins}m` : `${hours} hour${hours > 1 ? "s" : ""}`)
    : `${mins} minutes`;

  const pushMessages = due
    .filter((r: any) => r.push_token?.startsWith("ExponentPushToken["))
    .map((r: any) => ({
      to:    r.push_token as string,
      sound: "default" as const,
      title: `⛳ Tee time in ${timeStr}`,
      body:  `Your round at ${r.club_name} is at ${r.tee_time}. Get ready!`,
      data:  {
        type:       "tee_time_reminder",
        booking_id: r.booking_id,
        club_name:  r.club_name,
      },
    }));

  // Send push (batches of 100)
  for (let i = 0; i < pushMessages.length; i += 100) {
    await sendPushNotifications(pushMessages.slice(i, i + 100));
  }

  // Persist in-app notification + mark as sent for every user
  for (const r of due) {
    saveUserNotification(
      r.user_id,
      "tee_time_reminder",
      `⛳ Tee time in ${timeStr}`,
      `Your round at ${r.club_name} is at ${r.tee_time}. Get ready!`,
      { booking_id: r.booking_id, club_name: r.club_name }
    );

    try {
      await run(
        "INSERT INTO tee_time_reminders_sent (booking_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING",
        [r.booking_id, r.user_id]
      );
    } catch (err) {
      logger.warn({ err, booking_id: r.booking_id, user_id: r.user_id }, "Could not mark reminder as sent");
    }
  }
}

export function startReminderWorker(): void {
  logger.info("Tee-time reminder worker started");

  // Run once at startup then every POLL_INTERVAL_MS
  runReminderCycle().catch((err) => logger.warn({ err }, "Reminder cycle error"));

  setInterval(() => {
    runReminderCycle().catch((err) => logger.warn({ err }, "Reminder cycle error"));
  }, POLL_INTERVAL_MS);
}
