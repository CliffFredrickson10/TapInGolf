import { query, row, run, exec } from "../lib/pg";
import { logger } from "../lib/logger";

const POLL_INTERVAL_MS = 24 * 60 * 60 * 1000; // every 24 hours

function addDaysToDate(base: Date, n: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}
function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function fromMin(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
function generateBlockTimes(start: string, end: string, intervalMin: number): string[] {
  if (!start || !end || intervalMin < 1) return [];
  let cur = toMin(start);
  const endMin = toMin(end);
  const times: string[] = [];
  while (cur <= endMin) { times.push(fromMin(cur)); cur += intervalMin; }
  return times;
}

function dateInSeason(dateStr: string, seasonStart: string, seasonEnd: string): boolean {
  const mmdd = dateStr.slice(5); // extract 'MM-DD' from 'YYYY-MM-DD'
  if (seasonStart <= seasonEnd) {
    return mmdd >= seasonStart && mmdd <= seasonEnd;
  }
  // Season crosses year boundary (e.g., "09-01" → "01-31" = Sep through Jan)
  return mmdd >= seasonStart || mmdd <= seasonEnd;
}

type SlotEntry = { time: string; tee_start_type: string; crossover_enabled: boolean; session_type: string };

function buildSlotsForDay(configType: string, configData: any): SlotEntry[] {
  const slots: SlotEntry[] = [];

  const addBlock = (b: any, sessionType: string) => {
    if (!b?.start || !b?.end || !b?.interval) return;
    const times = generateBlockTimes(b.start, b.end, b.interval);
    if (b.tee_start_type === "two_tee") {
      times.forEach(t => {
        slots.push({ time: t, tee_start_type: "first_tee", crossover_enabled: !!b.crossover_enabled, session_type: sessionType });
        slots.push({ time: t, tee_start_type: "tenth_tee", crossover_enabled: !!b.crossover_enabled, session_type: sessionType });
      });
    } else {
      times.forEach(t => slots.push({ time: t, tee_start_type: b.tee_start_type ?? "first_tee", crossover_enabled: !!b.crossover_enabled, session_type: sessionType }));
    }
  };

  if (configType === "A") {
    addBlock(configData.morning, "AM");
    addBlock(configData.midday, "PM");
    addBlock(configData.twilight, "PM");
  } else {
    addBlock(configData.morning, "AM");
    addBlock(configData.midday, "PM");
  }

  return slots;
}

// ── Run a single rule ─────────────────────────────────────────────────────────

export async function runAutoRuleNow(rule: any): Promise<{ datesProcessed: number; slotsCreated: number }> {
  const { club_id, season_start, season_end, lookahead_days, players_per_slot, config_type } = rule;
  const configData = typeof rule.config_data === "string" ? JSON.parse(rule.config_data) : (rule.config_data ?? {});
  const slotTemplate = buildSlotsForDay(config_type, configData);

  if (!slotTemplate.length) return { datesProcessed: 0, slotsCreated: 0 };

  // Build list of dates in the lookahead window that fall within the season
  const dates: string[] = [];
  for (let i = 0; i < Number(lookahead_days ?? 14); i++) {
    const d = formatDate(addDaysToDate(new Date(), i));
    if (dateInSeason(d, String(season_start), String(season_end))) dates.push(d);
  }

  let datesProcessed = 0;
  let slotsCreated   = 0;

  for (const date of dates) {
    // Skip this date if general tee slots already exist for it
    const existing = await row<{ cnt: string }>(
      "SELECT COUNT(*) AS cnt FROM portal_tee_slots WHERE club_id = ? AND date = ? AND event_id IS NULL",
      [club_id, date]
    );
    if (Number(existing?.cnt ?? 0) > 0) continue;

    // Also skip if there are tournament-exclusive slots on this date (tournament owns the day)
    const tournamentSlots = await row<{ cnt: string }>(
      "SELECT COUNT(*) AS cnt FROM portal_tee_slots pts JOIN golf_events ge ON ge.id = pts.event_id WHERE pts.club_id = ? AND pts.date = ? AND ge.status NOT IN ('cancelled')",
      [club_id, date]
    );
    if (Number(tournamentSlots?.cnt ?? 0) > 0) continue;

    datesProcessed++;
    for (const s of slotTemplate) {
      try {
        await exec(
          "INSERT INTO portal_tee_slots (club_id, date, tee_time, max_players, is_active, session_type, tee_start_type, crossover_enabled) VALUES (?, ?, ?, ?, 1, ?, ?, ?) ON CONFLICT DO NOTHING",
          [club_id, date, s.time, Number(players_per_slot ?? 4), s.session_type, s.tee_start_type, s.crossover_enabled ? 1 : 0]
        );
        slotsCreated++;
      } catch {
        // skip duplicate or constraint error silently
      }
    }
  }

  return { datesProcessed, slotsCreated };
}

// ── Worker loop ───────────────────────────────────────────────────────────────

async function runAllActiveRules(): Promise<void> {
  const rules = await query<any>("SELECT * FROM tee_auto_rules WHERE active = TRUE");
  if (!rules.length) return;
  logger.info({ count: rules.length }, "Auto tee-gen: running active rules");
  for (const rule of rules) {
    try {
      const { datesProcessed, slotsCreated } = await runAutoRuleNow(rule);
      if (datesProcessed > 0 || slotsCreated > 0) {
        logger.info({ rule_id: rule.id, club_id: rule.club_id, datesProcessed, slotsCreated }, "Auto tee-gen: generated slots");
      }
      await run("UPDATE tee_auto_rules SET last_run_at = NOW() WHERE id = ?", [rule.id]);
    } catch (err) {
      logger.warn({ err, rule_id: rule.id }, "Auto tee-gen: rule error");
    }
  }
}

export function startAutoTeeGenWorker(): void {
  logger.info("Auto tee-gen worker started");
  // Short delay on startup to let migrations finish
  setTimeout(() => {
    runAllActiveRules().catch(err => logger.warn({ err }, "Auto tee-gen: initial run error"));
  }, 8_000);
  // Then run once every 24 hours
  setInterval(() => {
    runAllActiveRules().catch(err => logger.warn({ err }, "Auto tee-gen: interval run error"));
  }, POLL_INTERVAL_MS);
}
