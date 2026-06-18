import { Router, type IRouter } from "express";
import { query, row, exec, run } from "../lib/pg";
import { getUser } from "../lib/auth";

const router: IRouter = Router();

// ─── Scoring helpers ──────────────────────────────────────────────────────────

function getHA(strokeIndex: number, playingHcp: number): number {
  if (playingHcp <= 0) return 0;
  if (playingHcp <= 18) return strokeIndex <= playingHcp ? 1 : 0;
  return 1 + (strokeIndex <= playingHcp - 18 ? 1 : 0);
}

function calcPoints(gross: number, par: number, ha: number): number {
  return Math.max(0, par + 2 - (gross - ha));
}

function defaultScorecard() {
  return Array.from({ length: 18 }, (_, i) => ({
    number: i + 1,
    par: i % 3 === 0 ? 3 : i % 3 === 1 ? 4 : 5,
    stroke_index: i + 1,
    distance_m: i % 3 === 0 ? 160 : i % 3 === 1 ? 350 : 490,
  }));
}

// ─── Club scorecard ───────────────────────────────────────────────────────────

router.get("/scoring/clubs/:clubId/scorecard", async (req, res) => {
  try {
    const clubId = parseInt(req.params.clubId);
    if (!clubId) { res.status(400).json({ message: "Invalid club id" }); return; }

    const rows = await query<any>(
      "SELECT holes, tee_colors FROM club_scorecards WHERE club_id = ?",
      [clubId]
    );
    if (rows.length === 0) {
      res.json({ holes: defaultScorecard(), tee_colors: [] });
      return;
    }
    res.json({ holes: rows[0].holes, tee_colors: rows[0].tee_colors });
  } catch (err) {
    req.log?.error({ err }, "scorecard error");
    res.status(500).json({ message: "Failed to load scorecard" });
  }
});

// ─── Club tournaments (upcoming) ─────────────────────────────────────────────

router.get("/scoring/clubs/:clubId/tournaments", async (req, res) => {
  try {
    await getUser(req);
    const clubId = parseInt(req.params.clubId);
    if (!clubId) { res.status(400).json({ message: "Invalid club id" }); return; }

    const tournaments = await query<any>(`
      SELECT id, name, event_date, end_date, format, format2, format_custom,
             knockout_type, knockout_scoring_format
      FROM golf_events
      WHERE club_id = ?
        AND event_date >= CURRENT_DATE - INTERVAL '1 day'
      ORDER BY event_date ASC
      LIMIT 20
    `, [clubId]);

    res.json({ tournaments });
  } catch (err: any) {
    if (err?.message?.includes("Unauthorized")) { res.status(401).json({ message: "Unauthorized" }); return; }
    req.log?.error({ err }, "tournaments error");
    res.status(500).json({ message: "Failed to load tournaments" });
  }
});

// ─── List user's rounds ───────────────────────────────────────────────────────

router.get("/scoring/rounds", async (req, res) => {
  try {
    const user = await getUser(req);
    const rounds = await query<any>(`
      SELECT r.id, r.club_id, r.tee_color, r.format, r.course_handicap,
             r.playing_handicap, r.allowance_pct, r.status, r.holes_played,
             r.total_gross, r.total_net, r.total_points,
             r.started_at, r.completed_at, r.tournament_id,
             c.name  AS club_name,
             c.location AS club_location,
             c.logo_url AS club_logo_url,
             e.name  AS tournament_name
      FROM scoring_rounds r
      JOIN clubs c ON r.club_id = c.id
      LEFT JOIN golf_events e ON r.tournament_id = e.id
      WHERE r.user_id = ?
      ORDER BY r.started_at DESC
      LIMIT 30
    `, [user.id]);

    res.json({ rounds });
  } catch (err: any) {
    if (err?.message?.includes("Unauthorized")) { res.status(401).json({ message: "Unauthorized" }); return; }
    res.status(500).json({ message: "Failed to load rounds" });
  }
});

// ─── Start a new round ────────────────────────────────────────────────────────

router.post("/scoring/rounds", async (req, res) => {
  try {
    const user = await getUser(req);
    const {
      clubId, teeColor = "white", format = "individual_stableford",
      courseHandicap = 0, playingHandicap = 0, allowancePct = 100,
      tournamentId = null,
    } = req.body;

    if (!clubId) { res.status(400).json({ message: "clubId is required" }); return; }

    // Abandon any existing active round
    await run(
      "UPDATE scoring_rounds SET status = 'abandoned' WHERE user_id = ? AND status = 'active'",
      [user.id]
    );

    const [{ id }] = await query<{ id: number }>(`
      INSERT INTO scoring_rounds
        (user_id, club_id, tee_color, format, course_handicap, playing_handicap, allowance_pct, tournament_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `, [user.id, clubId, teeColor, format, courseHandicap, playingHandicap, allowancePct, tournamentId]);

    res.json({ id });
  } catch (err: any) {
    if (err?.message?.includes("Unauthorized")) { res.status(401).json({ message: "Unauthorized" }); return; }
    req.log?.error({ err }, "start round error");
    res.status(500).json({ message: "Failed to start round" });
  }
});

// ─── Get round detail ─────────────────────────────────────────────────────────

router.get("/scoring/rounds/:id", async (req, res) => {
  try {
    const user = await getUser(req);
    const roundId = parseInt(req.params.id);

    const rounds = await query<any>(`
      SELECT r.*, c.name AS club_name, c.location AS club_location, c.logo_url AS club_logo_url,
             e.name AS tournament_name
      FROM scoring_rounds r
      JOIN clubs c ON r.club_id = c.id
      LEFT JOIN golf_events e ON r.tournament_id = e.id
      WHERE r.id = ? AND r.user_id = ?
    `, [roundId, user.id]);

    if (rounds.length === 0) { res.status(404).json({ message: "Round not found" }); return; }
    const round = rounds[0];

    // Scorecard — map per-tee-colour distances from the portal format to distance_m
    const scRows = await query<any>(
      "SELECT holes, tee_colors FROM club_scorecards WHERE club_id = ?",
      [round.club_id]
    );
    const rawHoles: any[] = scRows.length > 0 ? scRows[0].holes : defaultScorecard();
    const tee = round.tee_color ?? "white";
    const scorecard: any[] = rawHoles.map((h: any) => ({
      number:       h.number,
      par:          h.par ?? 4,
      stroke_index: h.stroke_index ?? h.number,
      // Use the distance for the player's tee colour, fall back through other tees
      distance_m:   h[tee] ?? h.white ?? h.yellow ?? h.blue ?? h.red ?? h.distance_m ?? null,
    }));

    // Saved hole scores
    const holeRows = await query<any>(
      "SELECT * FROM scoring_holes WHERE round_id = ? ORDER BY hole_number",
      [roundId]
    );
    const holes: Record<number, any> = {};
    for (const h of holeRows) holes[h.hole_number] = h;

    // Betterball player holes (if any)
    const playerRows = await query<any>(
      "SELECT * FROM scoring_player_holes WHERE round_id = ? ORDER BY player_index, hole_number",
      [roundId]
    );
    const playerHoles: Record<string, any> = {};
    for (const p of playerRows) playerHoles[`${p.player_index}_${p.hole_number}`] = p;

    res.json({ ...round, scorecard, holes, playerHoles });
  } catch (err: any) {
    if (err?.message?.includes("Unauthorized")) { res.status(401).json({ message: "Unauthorized" }); return; }
    req.log?.error({ err }, "get round error");
    res.status(500).json({ message: "Failed to load round" });
  }
});

// ─── Save hole score ──────────────────────────────────────────────────────────

router.put("/scoring/rounds/:id/holes/:holeNum", async (req, res) => {
  try {
    const user = await getUser(req);
    const roundId = parseInt(req.params.id);
    const holeNum = parseInt(req.params.holeNum);

    const rounds = await query<any>(
      "SELECT playing_handicap FROM scoring_rounds WHERE id = ? AND user_id = ? AND status = 'active'",
      [roundId, user.id]
    );
    if (rounds.length === 0) { res.status(404).json({ message: "Active round not found" }); return; }
    const { playing_handicap } = rounds[0];

    const { par, strokeIndex, grossScore, isNr = false, players } = req.body;
    if (!par || !strokeIndex) { res.status(400).json({ message: "par and strokeIndex required" }); return; }

    if (isNr || grossScore == null) {
      await exec(`
        INSERT INTO scoring_holes (round_id, hole_number, par, stroke_index, gross_score, net_score, stableford_points, is_nr)
        VALUES (?, ?, ?, ?, NULL, NULL, 0, 1)
        ON CONFLICT (round_id, hole_number) DO UPDATE
          SET gross_score = NULL, net_score = NULL, stableford_points = 0, is_nr = 1
      `, [roundId, holeNum, par, strokeIndex]);
    } else {
      const ha = getHA(strokeIndex, playing_handicap);
      const netScore = grossScore - ha;
      const pts = calcPoints(grossScore, par, ha);

      await exec(`
        INSERT INTO scoring_holes (round_id, hole_number, par, stroke_index, gross_score, net_score, stableford_points, is_nr)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0)
        ON CONFLICT (round_id, hole_number) DO UPDATE
          SET gross_score = EXCLUDED.gross_score,
              net_score = EXCLUDED.net_score,
              stableford_points = EXCLUDED.stableford_points,
              is_nr = 0
      `, [roundId, holeNum, par, strokeIndex, grossScore, netScore, pts]);
    }

    // Betterball player scores
    if (Array.isArray(players)) {
      for (let i = 0; i < players.length; i++) {
        const p = players[i];
        await exec(`
          INSERT INTO scoring_player_holes (round_id, player_index, player_name, hole_number, gross_score, is_nr)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT (round_id, player_index, hole_number) DO UPDATE
            SET gross_score = EXCLUDED.gross_score, is_nr = EXCLUDED.is_nr, player_name = EXCLUDED.player_name
        `, [roundId, i, p.name ?? null, holeNum, p.grossScore ?? null, p.isNr ? 1 : 0]);
      }
    }

    // Sync holes_played
    await run(`
      UPDATE scoring_rounds
      SET holes_played = (SELECT COUNT(*) FROM scoring_holes WHERE round_id = ?)
      WHERE id = ?
    `, [roundId, roundId]);

    res.json({ ok: true });
  } catch (err: any) {
    if (err?.message?.includes("Unauthorized")) { res.status(401).json({ message: "Unauthorized" }); return; }
    req.log?.error({ err }, "save hole error");
    res.status(500).json({ message: "Failed to save hole score" });
  }
});

// ─── Complete round ───────────────────────────────────────────────────────────

router.post("/scoring/rounds/:id/complete", async (req, res) => {
  try {
    const user = await getUser(req);
    const roundId = parseInt(req.params.id);

    const rounds = await query<any>(
      "SELECT id FROM scoring_rounds WHERE id = ? AND user_id = ? AND status = 'active'",
      [roundId, user.id]
    );
    if (rounds.length === 0) { res.status(404).json({ message: "Active round not found" }); return; }

    const holeRows = await query<any>(
      "SELECT gross_score, net_score, stableford_points, is_nr FROM scoring_holes WHERE round_id = ?",
      [roundId]
    );

    let totalGross = 0, totalNet = 0, totalPoints = 0;
    for (const h of holeRows) {
      if (!h.is_nr && h.gross_score != null) {
        totalGross += h.gross_score;
        totalNet += h.net_score ?? 0;
        totalPoints += h.stableford_points ?? 0;
      }
    }

    await run(`
      UPDATE scoring_rounds
      SET status = 'complete', completed_at = NOW(),
          total_gross = ?, total_net = ?, total_points = ?,
          holes_played = ?
      WHERE id = ?
    `, [totalGross, totalNet, totalPoints, holeRows.length, roundId]);

    res.json({ ok: true, totalGross, totalNet, totalPoints, holesPlayed: holeRows.length });
  } catch (err: any) {
    if (err?.message?.includes("Unauthorized")) { res.status(401).json({ message: "Unauthorized" }); return; }
    req.log?.error({ err }, "complete round error");
    res.status(500).json({ message: "Failed to complete round" });
  }
});

// ─── Abandon / delete round ───────────────────────────────────────────────────

router.delete("/scoring/rounds/:id", async (req, res) => {
  try {
    const user = await getUser(req);
    const roundId = parseInt(req.params.id);
    await run("DELETE FROM scoring_rounds WHERE id = ? AND user_id = ?", [roundId, user.id]);
    res.json({ ok: true });
  } catch (err: any) {
    if (err?.message?.includes("Unauthorized")) { res.status(401).json({ message: "Unauthorized" }); return; }
    res.status(500).json({ message: "Failed to delete round" });
  }
});

export default router;
