import { Router, type Request, type Response } from "express";
import { query, row, exec, run } from "../lib/pg";
import { requireClubAuth, getClub } from "../lib/portalAuth";
import { logger } from "../lib/logger";

const router = Router();

function getRoundLabels(totalRounds: number): string[] {
  const labels: string[] = [];
  for (let r = 1; r <= totalRounds; r++) {
    const matchesInRound = Math.pow(2, totalRounds - r);
    if (matchesInRound === 1)       labels.push("Final");
    else if (matchesInRound === 2)  labels.push("Semi-Finals");
    else if (matchesInRound === 4)  labels.push("Quarter-Finals");
    else                            labels.push(`Round of ${matchesInRound * 2}`);
  }
  return labels;
}

// ── List knockout tournaments ─────────────────────────────────────────────────
router.get("/portal/knockout", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);

  const events = await query<any>(
    `SELECT ge.*,
            (SELECT COUNT(*) FROM club_members cm WHERE cm.club_id = ge.club_id AND cm.status = 'active') AS member_count,
            (SELECT COUNT(*) FROM knockout_rounds kr WHERE kr.event_id = ge.id) AS round_count,
            (SELECT kr2.label FROM knockout_rounds kr2 WHERE kr2.event_id = ge.id
             AND kr2.is_complete = 0 ORDER BY kr2.round_number ASC LIMIT 1) AS current_round_label
     FROM golf_events ge
     WHERE ge.club_id = ? AND (ge.format = 'knockout_individual' OR ge.format = 'knockout_team')
     ORDER BY ge.event_date DESC NULLS LAST, ge.created_at DESC`,
    [club.id]
  );

  res.json({ events });
});

// ── Create knockout tournament ────────────────────────────────────────────────
router.post("/portal/knockout", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const { name, event_date, end_date, knockout_type = "individual", draw_method = "random", description } = req.body ?? {};

  if (!name?.trim()) { res.status(400).json({ message: "Name is required" }); return; }

  const format = knockout_type === "team" ? "knockout_team" : "knockout_individual";

  const id = await exec(
    `INSERT INTO golf_events
       (club_id, name, description, event_date, end_date, format, knockout_type, knockout_draw_method,
        status, scoring_enabled, entries_required, payment_required)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, 0, 0)`,
    [club.id, name.trim(), description?.trim() ?? null, event_date || null, end_date || null,
     format, knockout_type, draw_method]
  );

  res.json({ id });
});

// ── Delete knockout tournament ────────────────────────────────────────────────
router.delete("/portal/knockout/:id", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const evId = Number(req.params.id);

  const ev = await row<any>(
    "SELECT id FROM golf_events WHERE id = ? AND club_id = ? AND (format = 'knockout_individual' OR format = 'knockout_team')",
    [evId, club.id]
  );
  if (!ev) { res.status(404).json({ message: "Tournament not found" }); return; }

  await run("DELETE FROM golf_events WHERE id = ?", [evId]);
  res.json({ ok: true });
});

// ── Generate bracket (uses all active club members) ───────────────────────────
router.post("/portal/knockout/:id/generate", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const evId = Number(req.params.id);

  const ev = await row<any>(
    "SELECT * FROM golf_events WHERE id = ? AND club_id = ? AND (format = 'knockout_individual' OR format = 'knockout_team')",
    [evId, club.id]
  );
  if (!ev) { res.status(404).json({ message: "Tournament not found" }); return; }

  const { draw_method = ev.knockout_draw_method ?? "random", round_deadlines = [] } = req.body ?? {};

  // Pull ALL active club members for the draw
  const members = await query<any>(
    `SELECT u.id as user_id, u.name, u.handicap_index
     FROM club_members cm
     JOIN users u ON u.id = cm.user_id
     WHERE cm.club_id = ? AND cm.status = 'active'
     ORDER BY cm.created_at ASC`,
    [club.id]
  );

  if (members.length < 2) { res.status(400).json({ message: "Need at least 2 active members to generate a bracket" }); return; }

  const bracketSize   = Math.pow(2, Math.ceil(Math.log2(Math.max(members.length, 2))));
  const totalRounds   = Math.log2(bracketSize);
  const byeCount      = bracketSize - members.length;

  let players = [...members];
  if (draw_method === "seeded") {
    players.sort((a, b) => (a.handicap_index ?? 99) - (b.handicap_index ?? 99));
    const seeded: typeof players = [];
    let lo = 0, hi = players.length - 1;
    while (lo <= hi) { seeded.push(players[lo++]!); if (lo <= hi) seeded.push(players[hi--]!); }
    players = seeded;
  } else {
    for (let i = players.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [players[i], players[j]] = [players[j]!, players[i]!];
    }
  }

  const slots: (typeof players[number] | null)[] = [...players, ...Array(byeCount).fill(null)];

  await run("DELETE FROM knockout_rounds WHERE event_id = ?", [evId]);
  await run("UPDATE golf_events SET knockout_draw_method = ? WHERE id = ?", [draw_method, evId]);

  const roundLabels = getRoundLabels(totalRounds);
  const roundIds: number[] = [];
  for (let r = 0; r < totalRounds; r++) {
    const deadline = round_deadlines[r] ?? null;
    const roundId  = await exec(
      "INSERT INTO knockout_rounds (event_id, round_number, label, deadline) VALUES (?, ?, ?, ?)",
      [evId, r + 1, roundLabels[r], deadline]
    );
    roundIds.push(roundId);
  }

  const r1MatchIds: number[] = [];
  const matchCount = bracketSize / 2;
  for (let m = 0; m < matchCount; m++) {
    const p1    = slots[m * 2] ?? null;
    const p2    = slots[m * 2 + 1] ?? null;
    const isBye = !p1 || !p2;
    const status = isBye ? "bye" : "pending";
    const winner = isBye ? (p1?.user_id ?? p2?.user_id ?? null) : null;
    const mid   = await exec(
      `INSERT INTO knockout_matches (event_id, round_id, match_sequence, player1_id, player2_id, winner_id, status, slot_position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [evId, roundIds[0], m, p1?.user_id ?? null, p2?.user_id ?? null, winner, status, m % 2 === 0 ? "top" : "bottom"]
    );
    r1MatchIds.push(mid);
  }

  let prevRoundMatchIds = r1MatchIds;
  for (let r = 1; r < totalRounds; r++) {
    const count = bracketSize / Math.pow(2, r + 1);
    const thisIds: number[] = [];
    for (let m = 0; m < count; m++) {
      const mid = await exec(
        `INSERT INTO knockout_matches (event_id, round_id, match_sequence, status, slot_position)
         VALUES (?, ?, ?, 'pending', ?)`,
        [evId, roundIds[r], m, m % 2 === 0 ? "top" : "bottom"]
      );
      thisIds.push(mid);
      const f1 = prevRoundMatchIds[m * 2];
      const f2 = prevRoundMatchIds[m * 2 + 1];
      if (f1 != null) await run("UPDATE knockout_matches SET next_match_id = ? WHERE id = ?", [mid, f1]);
      if (f2 != null) await run("UPDATE knockout_matches SET next_match_id = ? WHERE id = ?", [mid, f2]);
    }
    prevRoundMatchIds = thisIds;
  }

  // Auto-advance byes into round 2
  const byeMatches = await query<any>(
    "SELECT * FROM knockout_matches WHERE event_id = ? AND status = 'bye' AND winner_id IS NOT NULL AND next_match_id IS NOT NULL",
    [evId]
  );
  for (const bm of byeMatches) {
    const nxt = await row<any>("SELECT * FROM knockout_matches WHERE id = ?", [bm.next_match_id]);
    if (nxt) {
      const field = nxt.player1_id == null ? "player1_id" : "player2_id";
      await run(`UPDATE knockout_matches SET ${field} = ? WHERE id = ?`, [bm.winner_id, bm.next_match_id]);
    }
  }

  res.json({ ok: true, bracket_size: bracketSize, total_rounds: totalRounds, bye_count: byeCount, member_count: members.length });
});

// ── Get bracket (staff portal) ────────────────────────────────────────────────
router.get("/portal/knockout/:id/bracket", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const evId = Number(req.params.id);

  const ev = await row<any>(
    "SELECT * FROM golf_events WHERE id = ? AND club_id = ? AND (format = 'knockout_individual' OR format = 'knockout_team')",
    [evId, club.id]
  );
  if (!ev) { res.status(404).json({ message: "Tournament not found" }); return; }

  const rounds  = await query<any>("SELECT * FROM knockout_rounds WHERE event_id = ? ORDER BY round_number ASC", [evId]);
  const matches = await query<any>(
    `SELECT km.*,
            p1.name as player1_name, p1.handicap_index as player1_handicap,
            p2.name as player2_name, p2.handicap_index as player2_handicap,
            w.name as winner_name
     FROM knockout_matches km
     LEFT JOIN users p1 ON p1.id = km.player1_id
     LEFT JOIN users p2 ON p2.id = km.player2_id
     LEFT JOIN users w  ON w.id  = km.winner_id
     WHERE km.event_id = ?
     ORDER BY km.round_id ASC, km.match_sequence ASC`,
    [evId]
  );

  // Find champion: winner of the final match
  const finalMatch = matches[matches.length - 1];
  const champion = finalMatch?.status === "complete" ? (finalMatch.winner_name ?? null) : null;

  res.json({
    event: {
      id: ev.id, name: ev.name, format: ev.format,
      knockout_type: ev.knockout_type, knockout_draw_method: ev.knockout_draw_method,
    },
    rounds: rounds.map((r: any) => ({
      ...r,
      deadline: r.deadline ? String(r.deadline).slice(0, 10) : null,
      matches: matches.filter((m: any) => m.round_id === r.id),
    })),
    champion,
  });
});

// ── Update match result ───────────────────────────────────────────────────────
router.put("/portal/knockout/:id/matches/:matchId", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club    = getClub(req);
  const evId    = Number(req.params.id);
  const matchId = Number(req.params.matchId);

  const ev = await row<any>(
    "SELECT id FROM golf_events WHERE id = ? AND club_id = ? AND (format = 'knockout_individual' OR format = 'knockout_team')",
    [evId, club.id]
  );
  if (!ev) { res.status(404).json({ message: "Tournament not found" }); return; }

  const match = await row<any>("SELECT * FROM knockout_matches WHERE id = ? AND event_id = ?", [matchId, evId]);
  if (!match) { res.status(404).json({ message: "Match not found" }); return; }

  const { winner_id, score } = req.body ?? {};

  await run(
    "UPDATE knockout_matches SET winner_id = ?, score = ?, status = 'complete' WHERE id = ?",
    [winner_id ?? null, score ?? null, matchId]
  );

  if (winner_id && match.next_match_id) {
    const nxt = await row<any>("SELECT * FROM knockout_matches WHERE id = ?", [match.next_match_id]);
    if (nxt) {
      const field = nxt.player1_id == null ? "player1_id" : "player2_id";
      await run(`UPDATE knockout_matches SET ${field} = ? WHERE id = ?`, [winner_id, match.next_match_id]);
    }
  }

  const roundMatches = await query<any>("SELECT status FROM knockout_matches WHERE round_id = ?", [match.round_id]);
  if (roundMatches.every((m: any) => m.status === "complete" || m.status === "bye")) {
    await run("UPDATE knockout_rounds SET is_complete = 1 WHERE id = ?", [match.round_id]);
  }

  res.json({ ok: true });
});

// ── Update round deadline ─────────────────────────────────────────────────────
router.put("/portal/knockout/:id/rounds/:roundId", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club    = getClub(req);
  const evId    = Number(req.params.id);
  const roundId = Number(req.params.roundId);

  const ev = await row<any>(
    "SELECT id FROM golf_events WHERE id = ? AND club_id = ? AND (format = 'knockout_individual' OR format = 'knockout_team')",
    [evId, club.id]
  );
  if (!ev) { res.status(404).json({ message: "Tournament not found" }); return; }

  const { deadline } = req.body ?? {};
  await run("UPDATE knockout_rounds SET deadline = ? WHERE id = ? AND event_id = ?", [deadline ?? null, roundId, evId]);
  res.json({ ok: true });
});

// ── Publish draw + notify players ─────────────────────────────────────────────
router.post("/portal/knockout/:id/publish", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const evId = Number(req.params.id);

  const ev = await row<any>(
    "SELECT * FROM golf_events WHERE id = ? AND club_id = ? AND (format = 'knockout_individual' OR format = 'knockout_team')",
    [evId, club.id]
  );
  if (!ev) { res.status(404).json({ message: "Tournament not found" }); return; }

  const round1 = await row<any>("SELECT * FROM knockout_rounds WHERE event_id = ? AND round_number = 1", [evId]);
  if (!round1) { res.status(400).json({ message: "Bracket not generated yet" }); return; }

  const matches = await query<any>(
    `SELECT km.*,
            p1.name as player1_name, p1.push_token as player1_push,
            p2.name as player2_name, p2.push_token as player2_push
     FROM knockout_matches km
     LEFT JOIN users p1 ON p1.id = km.player1_id
     LEFT JOIN users p2 ON p2.id = km.player2_id
     WHERE km.round_id = ? AND km.status != 'bye'`,
    [round1.id]
  );

  let notified = 0;
  const deadline = round1.deadline ? ` by ${String(round1.deadline).slice(0, 10)}` : "";
  for (const m of matches) {
    const pairs: [string | null, string][] = [
      [m.player1_push, m.player2_name ?? "TBD"],
      [m.player2_push, m.player1_name ?? "TBD"],
    ];
    for (const [token, opponent] of pairs) {
      if (token) {
        try {
          await fetch("https://exp.host/--/api/v2/push/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: token,
              title: `${ev.name} — Draw Published`,
              body: `You play ${opponent} in Round 1${deadline}. Tap to view your bracket.`,
              data: { eventId: evId, tab: "bracket" },
            }),
          });
          notified++;
        } catch (e) {
          logger.warn({ err: e }, "Knockout push notification failed");
        }
      }
    }
    await run("UPDATE knockout_matches SET notification_sent_at = NOW() WHERE id = ?", [m.id]);
  }

  res.json({ ok: true, notified });
});

// ── Public bracket (mobile) ───────────────────────────────────────────────────
router.get("/events/:id/knockout/bracket", async (req: Request, res: Response): Promise<void> => {
  const evId = Number(req.params.id);

  const rounds  = await query<any>("SELECT * FROM knockout_rounds WHERE event_id = ? ORDER BY round_number ASC", [evId]);
  const matches = await query<any>(
    `SELECT km.id, km.round_id, km.match_sequence, km.slot_position, km.status, km.score,
            km.player1_id, p1.name as player1_name,
            km.player2_id, p2.name as player2_name,
            km.winner_id, w.name as winner_name,
            km.next_match_id, km.notification_sent_at
     FROM knockout_matches km
     LEFT JOIN users p1 ON p1.id = km.player1_id
     LEFT JOIN users p2 ON p2.id = km.player2_id
     LEFT JOIN users w  ON w.id  = km.winner_id
     WHERE km.event_id = ?
     ORDER BY km.round_id ASC, km.match_sequence ASC`,
    [evId]
  );

  const finalMatch = matches[matches.length - 1];
  const champion = finalMatch?.status === "complete" ? (finalMatch.winner_name ?? null) : null;

  res.json({
    rounds: rounds.map((r: any) => ({
      ...r,
      deadline: r.deadline ? String(r.deadline).slice(0, 10) : null,
    })),
    matches,
    champion,
  });
});

export default router;
