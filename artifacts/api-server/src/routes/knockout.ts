import { Router, type Request, type Response } from "express";
import { query, row, exec, run } from "../lib/pg";
import { requireClubAuth, getClub } from "../lib/portalAuth";
import { getUser } from "../lib/auth";
import { logger } from "../lib/logger";
import { sendPushNotifications } from "../lib/notifications";
import { saveUserNotification } from "../lib/userNotifications";

const router = Router();

function getRoundLabels(totalRounds: number): string[] {
  const labels: string[] = [];
  let roundNum = 1;
  for (let r = 1; r <= totalRounds; r++) {
    const fromEnd = totalRounds - r; // 0 = Final, 1 = SF, 2 = QF
    if (fromEnd === 0)      labels.push("Final");
    else if (fromEnd === 1) labels.push("Semi-Finals");
    else if (fromEnd === 2) labels.push("Quarter-Finals");
    else                    labels.push(`Round ${roundNum++}`);
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
  const { name, event_date, end_date, knockout_type = "individual", draw_method = "random", description, pairing_deadline } = req.body ?? {};

  if (!name?.trim()) { res.status(400).json({ message: "Name is required" }); return; }
  if (!knockout_type) { res.status(400).json({ message: "Format is required" }); return; }
  if (knockout_type === "team" && !pairing_deadline) {
    res.status(400).json({ message: "Partner selection deadline is required for Betterball tournaments" }); return;
  }

  const format = knockout_type === "team" ? "knockout_team" : "knockout_individual";

  const id = await exec(
    `INSERT INTO golf_events
       (club_id, name, description, event_date, end_date, format, knockout_type, knockout_draw_method,
        knockout_pairing_deadline, status, scoring_enabled, entries_required, payment_required, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, 0, 0, ?)`,
    [club.id, name.trim(), description?.trim() ?? null, event_date || null, end_date || null,
     format, knockout_type, draw_method, pairing_deadline || null, club.id]
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
    `SELECT u.id as user_id, u.name, u.handicap
     FROM club_members cm
     JOIN users u ON u.id = cm.user_id
     WHERE cm.club_id = ? AND cm.status = 'active'
     ORDER BY cm.created_at ASC`,
    [club.id]
  );

  if (members.length < 2) { res.status(400).json({ message: "Need at least 2 active members to generate a bracket" }); return; }

  // ── Bracket sizing ────────────────────────────────────────────────────────
  // Round up to the next power of 2. Players without real opponents in R1
  // get status='bye' and auto-advance. e.g. 66 players → size=128,
  // byes=62, R1 has 64 matches (62 bye + 2 real).
  const N = members.length;
  const k = Math.ceil(Math.log2(Math.max(N, 2)));
  const size = Math.pow(2, k);          // e.g. 128 for N=66
  const byes = size - N;               // e.g. 62 for N=66
  const totalRounds = k;

  // ── Order players ─────────────────────────────────────────────────────────
  let players = [...members];
  if (draw_method === "seeded") {
    // Sort by handicap ascending (best first); serpentine-interleave so top
    // seeds end up on opposite halves.
    players.sort((a, b) => (a.handicap ?? 99) - (b.handicap ?? 99));
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

  await run("DELETE FROM knockout_rounds WHERE event_id = ?", [evId]);
  await run("UPDATE golf_events SET knockout_draw_method = ? WHERE id = ?", [draw_method, evId]);

  // ── Create rounds ─────────────────────────────────────────────────────────
  const labels = getRoundLabels(totalRounds);
  const roundIds: number[] = [];
  for (let r = 0; r < totalRounds; r++) {
    const id = await exec(
      "INSERT INTO knockout_rounds (event_id, round_number, label, deadline) VALUES (?, ?, ?, ?)",
      [evId, r + 1, labels[r], round_deadlines[r] ?? null]
    );
    roundIds.push(id);
  }

  // ── Create Round 1 matches ─────────────────────────────────────────────────
  // Seeded: best players get byes (they auto-advance to R2).
  // First `byes` matches are bye matches (1 real player, no opponent).
  const r1RoundId = roundIds[0]!;
  const r1MatchCount = size / 2;
  const r1MatchIds: number[] = [];
  let playerIdx = 0;

  for (let m = 0; m < r1MatchCount; m++) {
    const isBye = m < byes;
    const p1 = players[playerIdx++] ?? null;
    const p2 = isBye ? null : (players[playerIdx++] ?? null);

    const mid = await exec(
      `INSERT INTO knockout_matches (event_id, round_id, match_sequence, player1_id, player2_id, status, slot_position)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [evId, r1RoundId, m, p1?.user_id ?? null, p2?.user_id ?? null,
       isBye ? "bye" : "pending", m % 2 === 0 ? "top" : "bottom"]
    );
    r1MatchIds.push(mid);
  }

  // ── Create subsequent rounds ───────────────────────────────────────────────
  let prevRoundMatchIds = r1MatchIds;
  for (let r = 1; r < totalRounds; r++) {
    const count = size / Math.pow(2, r + 1);
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

  // ── Auto-advance bye matches ───────────────────────────────────────────────
  // Bye players have no opponent — mark them complete immediately and
  // populate their winner into the Round 2 match so the draw is fully visible.
  if (byes > 0) {
    const byeMatches = await query<any>(
      "SELECT * FROM knockout_matches WHERE event_id = ? AND status = 'bye'",
      [evId]
    );
    for (const bm of byeMatches) {
      // Complete the bye match with player1 as automatic winner
      await run(
        "UPDATE knockout_matches SET winner_id = player1_id, status = 'complete' WHERE id = ?",
        [bm.id]
      );
      // Advance winner into the next match (p1 slot if empty, else p2)
      if (bm.next_match_id && bm.player1_id) {
        const nxt = await row<any>("SELECT * FROM knockout_matches WHERE id = ?", [bm.next_match_id]);
        if (nxt) {
          const field = nxt.player1_id == null ? "player1_id" : "player2_id";
          await run(`UPDATE knockout_matches SET ${field} = ? WHERE id = ?`, [bm.player1_id, bm.next_match_id]);
        }
      }
    }
    // Mark Round 1 as complete (all bye + real matches will be complete or pending)
    const r1Matches = await query<any>(
      "SELECT status FROM knockout_matches WHERE round_id = ?",
      [r1RoundId]
    );
    if (r1Matches.every((m: any) => m.status === "complete" || m.status === "bye")) {
      await run("UPDATE knockout_rounds SET is_complete = 1 WHERE id = ?", [r1RoundId]);
    }
  }

  res.json({
    ok: true,
    bracket_size: size,
    bye_count: byes,
    total_rounds: totalRounds,
    member_count: N,
  });
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
            p1.name as player1_name, p1.handicap as player1_handicap,
            p2.name as player2_name, p2.handicap as player2_handicap,
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
      club_name: club.name,
    },
    rounds: rounds.map((r: any) => ({
      ...r,
      deadline: r.deadline ? (r.deadline instanceof Date ? r.deadline.toISOString().slice(0, 10) : String(r.deadline).slice(0, 10)) : null,
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
    "UPDATE knockout_matches SET winner_id = ?, score = ?, status = 'complete', dispute = FALSE, player1_result = NULL, player2_result = NULL WHERE id = ?",
    [winner_id ?? null, score ?? null, matchId]
  );

  if (winner_id && match.next_match_id) {
    const nxt = await row<any>("SELECT * FROM knockout_matches WHERE id = ?", [match.next_match_id]);
    if (nxt) {
      const field = match.slot_position === "bottom" ? "player2_id" : "player1_id";
      await run(`UPDATE knockout_matches SET ${field} = ? WHERE id = ?`, [winner_id, match.next_match_id]);

      // ── Auto-notify when the next match is now fully paired ──────────────────
      // Re-fetch to get the freshly populated next match
      const nxtFresh = await row<any>(
        `SELECT km.*,
                p1.name as player1_name, p1.push_token as p1_token,
                p2.name as player2_name, p2.push_token as p2_token,
                kr.label as round_label, kr.deadline as round_deadline
         FROM knockout_matches km
         LEFT JOIN users p1 ON p1.id = km.player1_id
         LEFT JOIN users p2 ON p2.id = km.player2_id
         JOIN knockout_rounds kr ON kr.id = km.round_id
         WHERE km.id = ?`,
        [match.next_match_id]
      );

      if (nxtFresh?.player1_id && nxtFresh?.player2_id && !nxtFresh.notification_sent_at) {
        const ev2 = await row<any>("SELECT name FROM golf_events WHERE id = ?", [evId]);
        const deadline = nxtFresh.round_deadline
          ? ` by ${nxtFresh.round_deadline instanceof Date ? nxtFresh.round_deadline.toISOString().slice(0, 10) : String(nxtFresh.round_deadline).slice(0, 10)}`
          : "";
        const pushMsgs: Parameters<typeof sendPushNotifications>[0] = [];

        for (const [playerId, opponentName, pushToken] of [
          [nxtFresh.player1_id, nxtFresh.player2_name, nxtFresh.p1_token],
          [nxtFresh.player2_id, nxtFresh.player1_name, nxtFresh.p2_token],
        ] as [number, string, string | null][]) {
          const title = `${ev2?.name ?? "Knockout"} — Your next match is ready`;
          const body  = `You play ${opponentName} in the ${nxtFresh.round_label}${deadline}. Tap to view the bracket.`;
          const data  = { type: "knockout_next_match", eventId: evId, matchId: match.next_match_id };

          await saveUserNotification(playerId, "knockout_next_match", title, body, data);
          if (pushToken?.startsWith("ExponentPushToken[")) {
            pushMsgs.push({ to: pushToken, sound: "default", title, body, data });
          }
        }

        if (pushMsgs.length) sendPushNotifications(pushMsgs);
        await run("UPDATE knockout_matches SET notification_sent_at = NOW() WHERE id = ?", [match.next_match_id]);
      }
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

  // Ensure the event is active so it appears in the member-facing tournament feed
  await run("UPDATE golf_events SET status = 'active' WHERE id = ? AND status != 'active'", [evId]);

  // ── Fetch all approved entrants with their Round 1 opponent ─────────────────
  const entrants = await query<any>(
    `SELECT u.id, u.name, u.push_token,
            -- find their Round 1 match (they may be p1 or p2)
            km.id          as match_id,
            km.status      as match_status,
            p1.name        as p1_name,
            p2.name        as p2_name,
            km.player1_id,
            km.player2_id
     FROM event_registrations er
     JOIN users u ON u.id = er.user_id
     LEFT JOIN knockout_matches km
       ON km.round_id = ? AND km.status != 'bye'
       AND (km.player1_id = u.id OR km.player2_id = u.id)
     LEFT JOIN users p1 ON p1.id = km.player1_id
     LEFT JOIN users p2 ON p2.id = km.player2_id
     WHERE er.event_id = ? AND er.status = 'approved'`,
    [round1.id, evId]
  );

  const deadline  = round1.deadline ? ` by ${round1.deadline instanceof Date ? round1.deadline.toISOString().slice(0, 10) : String(round1.deadline).slice(0, 10)}` : "";
  const pushMsgs: Parameters<typeof sendPushNotifications>[0] = [];
  let   notified  = 0;
  const notifiedMatchIds = new Set<number>();

  for (const e of entrants) {
    // Determine opponent name for personalised message
    let opponentName = "TBD";
    if (e.match_id) {
      opponentName = e.player1_id === e.id
        ? (e.p2_name ?? "TBD")
        : (e.p1_name ?? "TBD");
    }

    const title = `${ev.name} — Draw Published`;
    const body  = e.match_id
      ? `You play ${opponentName} in Round 1${deadline}. Tap to view the bracket.`
      : `The draw has been published${deadline ? ` (Round 1 deadline${deadline})` : ""}. Tap to view the bracket.`;
    const data  = { type: "knockout_draw", eventId: evId };

    // In-app inbox notification (works for everyone, no push token needed)
    await saveUserNotification(e.id, "knockout_draw", title, body, data);

    // Expo push notification (for those with the app installed)
    if (e.push_token?.startsWith("ExponentPushToken[")) {
      pushMsgs.push({ to: e.push_token, sound: "default", title, body, data });
      notified++;
    }

    // Mark match as notified (once per match)
    if (e.match_id && !notifiedMatchIds.has(e.match_id)) {
      notifiedMatchIds.add(e.match_id);
      await run("UPDATE knockout_matches SET notification_sent_at = NOW() WHERE id = ?", [e.match_id]);
    }
  }

  // Send push notifications in batches of 100 (Expo limit)
  for (let i = 0; i < pushMsgs.length; i += 100) {
    sendPushNotifications(pushMsgs.slice(i, i + 100));
  }

  res.json({ ok: true, notified, inbox_count: entrants.length });
});

// ── Player submits their match result ────────────────────────────────────────
router.post("/events/:id/knockout/matches/:matchId/result", async (req: Request, res: Response): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Sign in to submit a result" }); return; }

  const evId    = Number(req.params.id);
  const matchId = Number(req.params.matchId);
  const { result } = req.body ?? {};

  if (result !== "won" && result !== "lost") {
    res.status(400).json({ message: "result must be 'won' or 'lost'" }); return;
  }

  const ev = await row<any>(
    "SELECT * FROM golf_events WHERE id = ? AND (format = 'knockout_individual' OR format = 'knockout_team')",
    [evId]
  );
  if (!ev) { res.status(404).json({ message: "Tournament not found" }); return; }

  const match = await row<any>(
    `SELECT km.*,
            p1.name as player1_name, p1.push_token as p1_token,
            p2.name as player2_name, p2.push_token as p2_token,
            kr.label as round_label, kr.deadline as round_deadline
     FROM knockout_matches km
     LEFT JOIN users p1 ON p1.id = km.player1_id
     LEFT JOIN users p2 ON p2.id = km.player2_id
     JOIN knockout_rounds kr ON kr.id = km.round_id
     WHERE km.id = ? AND km.event_id = ?`,
    [matchId, evId]
  );
  if (!match) { res.status(404).json({ message: "Match not found" }); return; }

  const isP1 = match.player1_id === user.id;
  const isP2 = match.player2_id === user.id;
  if (!isP1 && !isP2) { res.status(403).json({ message: "You are not a player in this match" }); return; }
  if (match.status === "complete" || match.status === "bye") {
    res.status(400).json({ message: "This match is already settled" }); return;
  }

  const myResultField   = isP1 ? "player1_result" : "player2_result";
  const myCurrentResult = isP1 ? match.player1_result : match.player2_result;
  // Block re-submission unless there's an active dispute (player may correct their result)
  if (myCurrentResult && !match.dispute) {
    res.status(400).json({ message: "You have already submitted a result for this match" }); return;
  }

  // Save this player's result; bump to in_progress; clear any existing dispute flag
  await run(
    `UPDATE knockout_matches SET ${myResultField} = ?, dispute = FALSE, status = 'in_progress' WHERE id = ?`,
    [result, matchId]
  );

  const opponentResult = isP1 ? match.player2_result : match.player1_result;

  if (!opponentResult) {
    // Opponent hasn't submitted yet
    res.json({ ok: true, status: "awaiting_opponent" }); return;
  }

  // Both have submitted — do outcomes agree?
  const myWon       = result === "won";
  const opponentWon = opponentResult === "won";

  if (myWon !== opponentWon) {
    // ── Agree: one won, one lost — auto-resolve ──────────────────────────────
    const winnerId = myWon
      ? user.id
      : (isP1 ? match.player2_id : match.player1_id)!;

    await run(
      "UPDATE knockout_matches SET winner_id = ?, status = 'complete', dispute = FALSE WHERE id = ?",
      [winnerId, matchId]
    );

    if (match.next_match_id) {
      const nxt = await row<any>("SELECT * FROM knockout_matches WHERE id = ?", [match.next_match_id]);
      if (nxt) {
        const field = match.slot_position === "bottom" ? "player2_id" : "player1_id";
        await run(`UPDATE knockout_matches SET ${field} = ? WHERE id = ?`, [winnerId, match.next_match_id]);

        const nxtFresh = await row<any>(
          `SELECT km.*, p1.name as player1_name, p1.push_token as p1_token,
                  p2.name as player2_name, p2.push_token as p2_token,
                  kr.label as round_label, kr.deadline as round_deadline
           FROM knockout_matches km
           LEFT JOIN users p1 ON p1.id = km.player1_id
           LEFT JOIN users p2 ON p2.id = km.player2_id
           JOIN knockout_rounds kr ON kr.id = km.round_id
           WHERE km.id = ?`,
          [match.next_match_id]
        );
        if (nxtFresh?.player1_id && nxtFresh?.player2_id && !nxtFresh.notification_sent_at) {
          const deadline = nxtFresh.round_deadline ? ` by ${nxtFresh.round_deadline instanceof Date ? nxtFresh.round_deadline.toISOString().slice(0, 10) : String(nxtFresh.round_deadline).slice(0, 10)}` : "";
          const pushMsgs: Parameters<typeof sendPushNotifications>[0] = [];
          for (const [pid, opp, tok] of [
            [nxtFresh.player1_id, nxtFresh.player2_name, nxtFresh.p1_token],
            [nxtFresh.player2_id, nxtFresh.player1_name, nxtFresh.p2_token],
          ] as [number, string, string | null][]) {
            const title = `${ev.name} — Your next match is ready`;
            const body  = `You play ${opp} in the ${nxtFresh.round_label}${deadline}. Tap to view the bracket.`;
            const data  = { type: "knockout_next_match", eventId: evId, matchId: match.next_match_id };
            await saveUserNotification(pid, "knockout_next_match", title, body, data);
            if (tok?.startsWith("ExponentPushToken[")) pushMsgs.push({ to: tok, sound: "default", title, body, data });
          }
          if (pushMsgs.length) sendPushNotifications(pushMsgs);
          await run("UPDATE knockout_matches SET notification_sent_at = NOW() WHERE id = ?", [match.next_match_id]);
        }
      }
    }

    const roundMatches = await query<any>("SELECT status FROM knockout_matches WHERE round_id = ?", [match.round_id]);
    if (roundMatches.every((m: any) => m.status === "complete" || m.status === "bye")) {
      await run("UPDATE knockout_rounds SET is_complete = 1 WHERE id = ?", [match.round_id]);
    }

    res.json({ ok: true, status: "complete", winner_id: winnerId }); return;
  }

  // ── Conflict: both claimed the same outcome — raise a dispute ─────────────
  await run("UPDATE knockout_matches SET dispute = TRUE WHERE id = ?", [matchId]);

  await exec(
    `INSERT INTO club_inbox_notifications (club_id, type, title, body, meta) VALUES (?, ?, ?, ?, ?)`,
    [
      ev.club_id,
      "knockout_dispute",
      `${ev.name} — Result dispute`,
      `${match.player1_name ?? "Player 1"} and ${match.player2_name ?? "Player 2"} both reported "${result}". Please review and set the correct result.`,
      JSON.stringify({ eventId: evId, matchId }),
    ]
  );

  res.json({ ok: true, status: "dispute" });
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
            km.next_match_id, km.notification_sent_at,
            km.player1_result, km.player2_result, km.dispute
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
      deadline: r.deadline ? (r.deadline instanceof Date ? r.deadline.toISOString().slice(0, 10) : String(r.deadline).slice(0, 10)) : null,
    })),
    matches,
    champion,
  });
});

// ── User's active knockout matches at a club (for linking to a booking) ───────
router.get("/knockout/my-active-matches", async (req: Request, res: Response): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }
  const clubId = parseInt(String(req.query["club_id"] ?? "0"));
  if (!clubId) { res.status(400).json({ message: "club_id required" }); return; }

  const matches = await query<any>(
    `SELECT
       km.id          AS match_id,
       km.round_id,
       kr.round_number,
       kr.label       AS round_label,
       kr.deadline,
       ge.id          AS event_id,
       ge.name        AS event_name,
       km.player1_id,
       km.player2_id,
       u1.name        AS player1_name,
       u2.name        AS player2_name,
       km.status
     FROM knockout_matches km
     JOIN knockout_rounds kr ON kr.id = km.round_id
     JOIN golf_events ge     ON ge.id = kr.event_id
     LEFT JOIN users u1 ON u1.id = km.player1_id
     LEFT JOIN users u2 ON u2.id = km.player2_id
     WHERE ge.club_id = ?
       AND km.status IN ('pending', 'in_progress')
       AND (km.player1_id = ? OR km.player2_id = ?)
       AND ge.status IN ('active', 'published')
     ORDER BY kr.round_number ASC, km.id ASC`,
    [clubId, user.id, user.id]
  );

  const formatted = matches.map((m: any) => {
    const isP1 = m.player1_id === user.id;
    const opponent_name = isP1 ? (m.player2_name ?? "TBD") : (m.player1_name ?? "TBD");
    const dl = m.deadline;
    const deadline = dl ? (dl instanceof Date ? dl.toISOString().slice(0, 10) : String(dl).slice(0, 10)) : null;
    return {
      id:              m.match_id,
      event_name:      m.event_name,
      round_label:     m.round_label ?? `Round ${m.round_number}`,
      round_number:    m.round_number,
      opponent_name,
      deadline,
      player_position: isP1 ? 1 : 2,
    };
  });

  res.json({ matches: formatted });
});

export default router;
