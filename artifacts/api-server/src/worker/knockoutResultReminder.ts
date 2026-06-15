import { query, run } from "../lib/pg";
import { sendPushNotifications } from "../lib/notifications";
import { saveUserNotification } from "../lib/userNotifications";
import { logger } from "../lib/logger";

const POLL_INTERVAL_MS = 60 * 60 * 1000; // check every hour

async function runCycle(): Promise<void> {
  const due = await query<any>(
    `SELECT
       b.id                AS booking_id,
       b.user_id,
       b.knockout_match_id,
       u.name              AS user_name,
       u.push_token,
       ge.name             AS event_name,
       kr.label            AS round_label,
       km.player1_id,
       km.player2_id,
       km.player1_result,
       km.player2_result,
       km.status           AS match_status
     FROM bookings b
     JOIN portal_tee_slots pts ON pts.id = b.portal_slot_id
     JOIN users u ON u.id = b.user_id
     JOIN knockout_matches km ON km.id = b.knockout_match_id
     JOIN knockout_rounds kr ON kr.id = km.round_id
     JOIN golf_events ge ON ge.id = kr.event_id
     WHERE b.knockout_match_id IS NOT NULL
       AND b.knockout_reminder_sent = 0
       AND b.status IN ('confirmed', 'pending')
       AND km.status NOT IN ('complete')
       AND (pts.date + pts.tee_time::time + INTERVAL '6 hours') < NOW()`,
    []
  );

  if (!due.length) return;
  logger.info({ count: due.length }, "Knockout result reminder: sending notifications");

  for (const r of due) {
    const isP1      = r.player1_id === r.user_id;
    const hasResult = isP1 ? !!r.player1_result : !!r.player2_result;

    if (hasResult || r.match_status === "complete") {
      await run("UPDATE bookings SET knockout_reminder_sent = 1 WHERE id = ?", [r.booking_id]);
      continue;
    }

    try {
      const roundStr = r.round_label ?? "match";
      if (r.push_token) {
        await sendPushNotifications([{
          token: r.push_token,
          title: "⛳ Submit your knockout result",
          body: `Your ${roundStr} in ${r.event_name} has ended. Tap to submit your result.`,
          data: { type: "knockout_result", match_id: String(r.knockout_match_id) },
        }]);
      }
      await saveUserNotification(
        r.user_id,
        "knockout_result",
        "Submit your knockout result",
        `Your ${roundStr} in ${r.event_name} has ended. Please submit your match result now.`,
        { match_id: r.knockout_match_id }
      );
      await run("UPDATE bookings SET knockout_reminder_sent = 1 WHERE id = ?", [r.booking_id]);
      logger.info({ booking_id: r.booking_id, user_id: r.user_id }, "Knockout result reminder sent");
    } catch (err: any) {
      logger.error({ err, booking_id: r.booking_id }, "Knockout result reminder: failed to notify");
    }
  }
}

export function startKnockoutResultReminderWorker(): void {
  logger.info("Knockout result reminder worker started");
  runCycle().catch((err) => logger.error({ err }, "Knockout result reminder: startup cycle failed"));
  setInterval(
    () => runCycle().catch((err) => logger.error({ err }, "Knockout result reminder: cycle failed")),
    POLL_INTERVAL_MS
  );
}
