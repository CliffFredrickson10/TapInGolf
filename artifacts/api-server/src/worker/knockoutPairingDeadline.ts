import { query, run } from "../lib/pg";
import { logger } from "../lib/logger";

const POLL_INTERVAL_MS = 60 * 60 * 1000; // hourly

async function runCycle(): Promise<void> {
  // Betterball: pairing deadline passed
  const dueBetterball = await query<any>(
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

  // Singles: entry deadline passed
  const dueSingles = await query<any>(
    `SELECT ge.id, ge.name
     FROM golf_events ge
     WHERE ge.format = 'knockout_individual'
       AND ge.status = 'active'
       AND ge.singles_entry_deadline IS NOT NULL
       AND ge.singles_entry_deadline < CURRENT_DATE
       AND ge.bracket_ready_notified_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM knockout_rounds kr WHERE kr.event_id = ge.id)`,
    []
  );

  const due = [...dueBetterball, ...dueSingles];
  if (!due.length) return;
  logger.info({ count: due.length }, "Knockout deadline worker: flagging events ready to generate");

  for (const ev of due) {
    try {
      await run(
        "UPDATE golf_events SET bracket_ready_notified_at = NOW() WHERE id = ?",
        [ev.id]
      );
      logger.info({ evId: ev.id, name: ev.name }, "Knockout: deadline passed — bracket ready to generate");
    } catch (err: any) {
      logger.error({ err, evId: ev.id }, "Knockout deadline worker: failed to flag event");
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
