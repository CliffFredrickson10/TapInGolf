import { query, run } from "../lib/pg";
import { logger } from "../lib/logger";

const POLL_INTERVAL_MS = 60 * 60 * 1000; // hourly

async function runCycle(): Promise<void> {
  const due = await query<any>(
    `SELECT ge.id, ge.name
     FROM golf_events ge
     WHERE ge.format = 'knockout_team'
       AND ge.status = 'active'
       AND ge.knockout_pairing_deadline IS NOT NULL
       AND ge.knockout_pairing_deadline < CURRENT_DATE
       AND ge.bracket_ready_notified_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM knockout_rounds kr WHERE kr.event_id = ge.id)`,
    []
  );

  if (!due.length) return;
  logger.info({ count: due.length }, "Knockout pairing deadline: flagging events ready to generate");

  for (const ev of due) {
    try {
      await run(
        "UPDATE golf_events SET bracket_ready_notified_at = NOW() WHERE id = ?",
        [ev.id]
      );
      logger.info({ evId: ev.id, name: ev.name }, "Knockout: pairing deadline passed — bracket ready to generate");
    } catch (err: any) {
      logger.error({ err, evId: ev.id }, "Knockout pairing deadline: failed to flag event");
    }
  }
}

export function startKnockoutPairingDeadlineWorker(): void {
  logger.info("Knockout pairing deadline worker started");
  runCycle().catch((err) => logger.error({ err }, "Knockout pairing deadline: startup cycle failed"));
  setInterval(
    () => runCycle().catch((err) => logger.error({ err }, "Knockout pairing deadline: cycle failed")),
    POLL_INTERVAL_MS
  );
}
