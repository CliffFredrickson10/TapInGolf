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

const TEE_START_MAP: Record<string, string> = {
  first_tee:        "1st Tee",
  tenth_tee:        "10th Tee",
  two_tee:          "Two-Tee Start",
  "1st Tee":        "1st Tee",
  "10th Tee":       "10th Tee",
  "Two-Tee Start":  "Two-Tee Start",
};
function normTeeStart(v: string | undefined | null): string {
  return TEE_START_MAP[v ?? ""] ?? "1st Tee";
}

type SlotEntry = { time: string; tee_start_type: string; session_type: string };

function buildSlotsForDay(configType: string, configData: any): SlotEntry[] {
  const slots: SlotEntry[] = [];

  const addBlock = (b: any, sessionType: string) => {
    if (!b?.start || !b?.end || !b?.interval) return;
    const times = generateBlockTimes(b.start, b.end, b.interval);
    if (b.tee_start_type === "two_tee") {
      times.forEach(t => {
        slots.push({ time: t, tee_start_type: "first_tee",  session_type: sessionType });
        slots.push({ time: t, tee_start_type: "tenth_tee", session_type: sessionType });
      });
    } else {
      times.forEach(t => slots.push({ time: t, tee_start_type: normTeeStart(b.tee_start_type), session_type: sessionType }));
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

export async function runAutoRuleNow(rule: any): Promise<{ datesProcessed: number; slotsCreated: number; no_config?: boolean; out_of_season?: boolean; season_start?: string; season_end?: string }> {
  const { club_id, season_start, season_end, lookahead_days, players_per_slot, config_type } = rule;
  const configData = typeof rule.config_data === "string" ? JSON.parse(rule.config_data) : (rule.config_data ?? {});
  const slotTemplate = buildSlotsForDay(config_type, configData);
  const blockedDays: number[] = typeof rule.blocked_days === "string" ? JSON.parse(rule.blocked_days) : (rule.blocked_days ?? []);

  if (!slotTemplate.length) return { datesProcessed: 0, slotsCreated: 0, no_config: true };

  // Build list of dates in the window (lookback_days before today through lookahead_days ahead)
  const lookback = Number(rule.lookback_days ?? 0);
  const lookahead = Number(lookahead_days ?? 14);
  const dates: string[] = [];
  for (let i = -lookback; i < lookahead; i++) {
    const d = formatDate(addDaysToDate(new Date(), i));
    if (!dateInSeason(d, String(season_start), String(season_end))) continue;
    // Skip blocked days-of-week (0=Sun … 6=Sat)
    const dow = new Date(d + "T12:00:00").getDay();
    if (blockedDays.includes(dow)) continue;
    dates.push(d);
  }

  if (!dates.length) {
    return { datesProcessed: 0, slotsCreated: 0, out_of_season: true, season_start: String(season_start), season_end: String(season_end) };
  }

  let datesProcessed = 0;
  let slotsCreated   = 0;

  for (const date of dates) {
    // Fetch active tournament slots for this day (with shotgun/holes info)
    const tournamentRows = await query<any>(
      `SELECT pts.tee_time, ge.shotgun_start, COALESCE(ge.holes, 18) AS holes, COALESCE(ge.block_full_day, 0) AS block_full_day
       FROM portal_tee_slots pts
       JOIN golf_events ge ON ge.id = pts.event_id
       WHERE pts.club_id = ? AND pts.date = ? AND ge.status NOT IN ('cancelled')`,
      [club_id, date]
    );

    if (tournamentRows.length === 0) {
      // No tournament on this day — generate all slots normally
    } else {
      const hasNonShotgun = tournamentRows.some((r: any) => !r.shotgun_start);
      if (hasNonShotgun) {
        // Interval-start tournament occupies the whole day — skip entirely
        continue;
      }

      // If any shotgun event has block_full_day set, treat the whole day as blocked
      const hasBlockFullDay = tournamentRows.some((r: any) => r.block_full_day);
      if (hasBlockFullDay) continue;

      // Shotgun-only: build blocked windows and skip slots that fall inside them
      const windows: Array<{ start: number; end: number }> = [];
      for (const r of tournamentRows) {
        const shotgunMin  = toMin(String(r.tee_time).slice(0, 5));
        const durationMin = Number(r.holes) >= 18 ? 270 : 150;
        windows.push({
          start: Math.max(0, shotgunMin - durationMin),
          end:   shotgunMin + durationMin,
        });
      }

      const isBlocked = (time: string) => {
        const m = toMin(time);
        return windows.some(w => m >= w.start && m <= w.end);
      };

      let newForDay = 0;
      for (const s of slotTemplate) {
        if (isBlocked(s.time)) continue;
        try {
          const inserted = await run(
            "INSERT INTO portal_tee_slots (club_id, date, tee_time, max_players, is_active, session_type, tee_start_type) VALUES (?, ?, ?, ?, 1, ?, ?) ON CONFLICT DO NOTHING",
            [club_id, date, s.time, Number(players_per_slot ?? 4), s.session_type, s.tee_start_type]
          );
          if (inserted > 0) newForDay++;
        } catch { /* skip constraint errors */ }
      }
      if (newForDay > 0) { datesProcessed++; slotsCreated += newForDay; }
      continue; // handled above — don't fall through to the normal insert block
    }

    let newForDay = 0;
    for (const s of slotTemplate) {
      try {
        const inserted = await run(
          "INSERT INTO portal_tee_slots (club_id, date, tee_time, max_players, is_active, session_type, tee_start_type) VALUES (?, ?, ?, ?, 1, ?, ?) ON CONFLICT DO NOTHING",
          [club_id, date, s.time, Number(players_per_slot ?? 4), s.session_type, s.tee_start_type]
        );
        if (inserted > 0) newForDay++;
      } catch {
        // skip constraint errors silently
      }
    }
    if (newForDay > 0) {
      datesProcessed++;
      slotsCreated += newForDay;
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
