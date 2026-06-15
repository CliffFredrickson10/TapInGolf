import { query, run, row } from "../lib/pg";
import { sendPushNotifications } from "../lib/notifications";
import { saveUserNotification } from "../lib/userNotifications";
import { logger } from "../lib/logger";

const POLL_INTERVAL_MS = 60 * 60 * 1000; // check every hour

// ── Result reminder ───────────────────────────────────────────────────────────
async function runReminderCycle(): Promise<void> {
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
      if (r.push_token?.startsWith("ExponentPushToken[")) {
        await sendPushNotifications([{
          to: r.push_token,
          title: "⛳ Submit your knockout result",
          body: `Your ${roundStr} in ${r.event_name} has ended. Tap to submit your result.`,
          data: { type: "knockout_result", match_id: String(r.knockout_match_id) },
          sound: "default",
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

// ── Deadline enforcement ──────────────────────────────────────────────────────
// Runs every cycle. Finds matches whose round deadline has passed and that are
// still unresolved → marks them complete with no winner (walkover). Then
// cascades up the bracket: if the next-round slot now has only one player, that
// player gets a bye; if it has no players, that match is also voided.

async function runExpiredMatchCycle(): Promise<void> {
  const expired = await query<any>(
    `SELECT km.id, km.next_match_id, kr.event_id, ge.name AS event_name
     FROM knockout_matches km
     JOIN knockout_rounds kr ON kr.id = km.round_id
     JOIN golf_events ge ON ge.id = kr.event_id
     WHERE km.status IN ('pending', 'in_progress')
       AND kr.deadline IS NOT NULL
       AND kr.deadline < CURRENT_DATE`,
    []
  );

  if (!expired.length) return;
  logger.info({ count: expired.length }, "Knockout deadline: expiring overdue matches");

  for (const match of expired) {
    try {
      await run(
        `UPDATE knockout_matches
         SET status = 'complete', winner_id = NULL,
             dispute = FALSE, player1_result = NULL, player2_result = NULL
         WHERE id = ?`,
        [match.id]
      );
      logger.info({ match_id: match.id, event: match.event_name }, "Knockout match expired (no result by deadline)");

      if (match.next_match_id) {
        await checkAndProcessBye(match.next_match_id);
      }
    } catch (err: any) {
      logger.error({ err, match_id: match.id }, "Knockout deadline: failed to expire match");
    }
  }
}

// Recursively resolves the bracket upward after an expiry. Three cases:
//   • No players in next match     → void that match too, cascade further
//   • Exactly one player remains   → they advance by bye, cascade further
//   • Both players present         → nothing to do (match plays normally)
async function checkAndProcessBye(matchId: number): Promise<void> {
  const match = await row<any>(
    `SELECT km.*,
            u1.name       AS player1_name, u1.push_token AS p1_token,
            u2.name       AS player2_name, u2.push_token AS p2_token,
            ge.name       AS event_name,   ge.id         AS event_id
     FROM knockout_matches km
     LEFT JOIN users u1 ON u1.id = km.player1_id
     LEFT JOIN users u2 ON u2.id = km.player2_id
     JOIN knockout_rounds kr ON kr.id = km.round_id
     JOIN golf_events ge ON ge.id = kr.event_id
     WHERE km.id = ?`,
    [matchId]
  );
  if (!match || match.status !== "pending") return;

  // Wait until every feeder match for this slot is settled
  const unresolvedFeeders = await query<any>(
    `SELECT id FROM knockout_matches
     WHERE next_match_id = ? AND status IN ('pending', 'in_progress')`,
    [matchId]
  );
  if (unresolvedFeeders.length > 0) return;

  const hasP1 = !!match.player1_id;
  const hasP2 = !!match.player2_id;

  // ── Case 1: Both feeders expired — void this match too ────────────────────
  if (!hasP1 && !hasP2) {
    await run(
      `UPDATE knockout_matches
       SET status = 'complete', winner_id = NULL, dispute = FALSE
       WHERE id = ?`,
      [matchId]
    );
    logger.info({ match_id: matchId }, "Knockout: next-round match also voided (no players)");
    if (match.next_match_id) await checkAndProcessBye(match.next_match_id);
    return;
  }

  // ── Case 2: Both players are present — match plays normally ───────────────
  if (hasP1 && hasP2) return;

  // ── Case 3: Exactly one player — award a bye ──────────────────────────────
  const byeWinnerId   = match.player1_id ?? match.player2_id;
  const byeWinnerName = match.player1_id ? match.player1_name : match.player2_name;
  const pushToken     = match.player1_id ? match.p1_token : match.p2_token;

  await run(
    `UPDATE knockout_matches
     SET status = 'complete', winner_id = ?, dispute = FALSE
     WHERE id = ?`,
    [byeWinnerId, matchId]
  );
  logger.info({ match_id: matchId, winner_id: byeWinnerId }, "Knockout: bye awarded after expiry");

  // Notify the bye winner
  try {
    const title = `${match.event_name} — You advance by bye`;
    const body  = `Your opponent didn't submit a result before the deadline. You advance to the next round automatically.`;
    const data  = { type: "knockout_bye", match_id: String(matchId), event_id: String(match.event_id) };
    await saveUserNotification(byeWinnerId, "knockout_bye", title, body, data);
    if (pushToken?.startsWith("ExponentPushToken[")) {
      await sendPushNotifications([{ to: pushToken, sound: "default", title, body, data }]);
    }
  } catch (err: any) {
    logger.warn({ err, winner_id: byeWinnerId }, "Knockout bye: failed to notify player");
  }

  // Place bye winner into the next round slot (use whichever slot is empty)
  if (match.next_match_id) {
    const nxt = await row<any>("SELECT * FROM knockout_matches WHERE id = ?", [match.next_match_id]);
    if (nxt) {
      const field = nxt.player1_id == null ? "player1_id" : "player2_id";
      await run(`UPDATE knockout_matches SET ${field} = ? WHERE id = ?`, [byeWinnerId, match.next_match_id]);
    }
    await checkAndProcessBye(match.next_match_id);
  }
}

// ── Combined hourly cycle ─────────────────────────────────────────────────────
async function runCycle(): Promise<void> {
  await runExpiredMatchCycle();
  await runReminderCycle();
}

export function startKnockoutResultReminderWorker(): void {
  logger.info("Knockout result reminder worker started");
  runCycle().catch((err) => logger.error({ err }, "Knockout result reminder: startup cycle failed"));
  setInterval(
    () => runCycle().catch((err) => logger.error({ err }, "Knockout result reminder: cycle failed")),
    POLL_INTERVAL_MS
  );
}
