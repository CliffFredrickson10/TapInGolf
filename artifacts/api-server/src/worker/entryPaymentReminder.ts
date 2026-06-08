import { query, run } from "../lib/pg";
import { sendPushNotifications } from "../lib/notifications";
import { saveUserNotification } from "../lib/userNotifications";
import { logger } from "../lib/logger";

const POLL_INTERVAL_MS = 60 * 60 * 1000; // check every hour

async function runEntryPaymentReminderCycle(): Promise<void> {
  // Find all approved-but-unpaid entries for upcoming events that:
  //  - have not already received a reminder today
  //  - the event hasn't started yet
  const due = await query<any>(
    `SELECT
       er.event_id,
       er.user_id,
       ge.name        AS event_name,
       ge.event_date,
       ge.entry_fee,
       c.name         AS club_name,
       u.name         AS user_name,
       u.push_token
     FROM event_registrations er
     JOIN golf_events ge ON ge.id = er.event_id
     JOIN clubs c        ON c.id  = ge.club_id
     JOIN users u        ON u.id  = er.user_id
     WHERE er.status           = 'approved'
       AND er.payment_status  != 'paid'
       AND ge.payment_required = 1
       AND ge.status           = 'active'
       AND ge.event_date       > NOW()
       AND NOT EXISTS (
         SELECT 1 FROM event_payment_reminders_sent s
         WHERE s.event_id = er.event_id
           AND s.user_id  = er.user_id
           AND s.sent_date = CURRENT_DATE
       )`
  );

  if (!due.length) return;

  logger.info({ count: due.length }, "Sending event entry payment reminders");

  const pushMessages = due
    .filter((r: any) => r.push_token?.startsWith("ExponentPushToken["))
    .map((r: any) => {
      const eventDate = new Date(r.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "long" });
      return {
        to:    r.push_token as string,
        sound: "default" as const,
        title: "Entry fee outstanding ⛳",
        body:  `Your spot in "${r.event_name}" at ${r.club_name} on ${eventDate} is reserved but not yet paid. Complete payment to secure your place — spots go to the first players to pay.`,
        data:  { type: "entry_payment_reminder", event_id: r.event_id },
      };
    });

  for (let i = 0; i < pushMessages.length; i += 100) {
    await sendPushNotifications(pushMessages.slice(i, i + 100));
  }

  for (const r of due) {
    const eventDate = new Date(r.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "long" });

    saveUserNotification(
      r.user_id,
      "entry_payment_reminder",
      "Entry fee outstanding ⛳",
      `Your spot in "${r.event_name}" at ${r.club_name} on ${eventDate} is reserved but not yet paid. Complete payment to secure your place — spots go to the first players to pay.`,
      { type: "entry_payment_reminder", event_id: r.event_id }
    );

    try {
      await run(
        "INSERT INTO event_payment_reminders_sent (event_id, user_id, sent_date) VALUES (?, ?, CURRENT_DATE) ON CONFLICT DO NOTHING",
        [r.event_id, r.user_id]
      );
    } catch (err) {
      logger.warn({ err, event_id: r.event_id, user_id: r.user_id }, "Could not mark entry payment reminder as sent");
    }
  }
}

export function startEntryPaymentReminderWorker(): void {
  logger.info("Entry payment reminder worker started");

  runEntryPaymentReminderCycle().catch((err) =>
    logger.warn({ err }, "Entry payment reminder cycle error")
  );

  setInterval(() => {
    runEntryPaymentReminderCycle().catch((err) =>
      logger.warn({ err }, "Entry payment reminder cycle error")
    );
  }, POLL_INTERVAL_MS);
}
