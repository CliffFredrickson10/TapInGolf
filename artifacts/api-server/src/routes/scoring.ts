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
    const user = await getUser(req);
    if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }
    const clubId = parseInt(req.params.clubId);
    if (!clubId) { res.status(400).json({ message: "Invalid club id" }); return; }

    // Only surface tournaments where the requesting user has a confirmed spot:
    //   a) approved event_registrations entry (formal events), OR
    //   b) a confirmed booking on a tee slot exclusive to this event, OR
    //   c) appears as player1_id or player2_id in any knockout_matches for this event
    const tournaments = await query<any>(`
      SELECT id, name, event_date, end_date, format, format2, format_custom,
             knockout_type, knockout_scoring_format
      FROM golf_events ge
      WHERE club_id = ?
        AND COALESCE(end_date, event_date) >= CURRENT_DATE - INTERVAL '1 day'
        AND status NOT IN ('cancelled', 'completed')
        AND (
          EXISTS (
            SELECT 1 FROM event_registrations er
            WHERE er.event_id = ge.id AND er.user_id = ? AND er.status = 'approved'
          )
          OR EXISTS (
            SELECT 1 FROM bookings b
            JOIN booking_players bp ON bp.booking_id = b.id
            JOIN portal_tee_slots pts ON pts.id = b.portal_slot_id
            WHERE pts.event_id = ge.id AND bp.user_id = ? AND b.status = 'confirmed'
          )
          OR EXISTS (
            SELECT 1 FROM knockout_matches km
            WHERE km.event_id = ge.id AND (km.player1_id = ? OR km.player2_id = ?)
          )
        )
      ORDER BY event_date ASC
      LIMIT 20
    `, [clubId, user.id, user.id, user.id, user.id]);

    res.json({ tournaments });
  } catch (err: any) {
    if (err?.message?.includes("Unauthorized")) { res.status(401).json({ message: "Unauthorized" }); return; }
    req.log?.error({ err }, "tournaments error");
    res.status(500).json({ message: "Failed to load tournaments" });
  }
});

// ─── My betterball group (non-knockout betterball events) ────────────────────

router.get("/scoring/tournaments/:tournamentId/my-betterball-group", async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }
    const tournamentId = parseInt(req.params.tournamentId);

    // Partner: other registration in the same team
    const myReg = await row<any>(
      "SELECT team_id FROM event_registrations WHERE user_id = ? AND event_id = ? LIMIT 1",
      [user.id, tournamentId]
    );
    const teamId = myReg?.team_id ?? null;

    let partnerName: string | null = null;
    let partnerHandicap: number | null = null;
    if (teamId) {
      const p = await row<any>(
        `SELECT u.name, u.handicap FROM event_registrations er
         JOIN users u ON u.id = er.user_id
         WHERE er.event_id = ? AND er.team_id = ? AND er.user_id != ? LIMIT 1`,
        [tournamentId, teamId, user.id]
      );
      partnerName     = p?.name ?? null;
      partnerHandicap = p?.handicap != null ? Number(p.handicap) : null;
    }

    // Opponents: other players in the same tee-time slot (draw released)
    const mySlot = await row<any>(`
      SELECT b.portal_slot_id FROM bookings b
      JOIN booking_players bp ON bp.booking_id = b.id
      JOIN portal_tee_slots pts ON pts.id = b.portal_slot_id
      WHERE bp.user_id = ? AND pts.event_id = ? AND b.status = 'confirmed'
      LIMIT 1
    `, [user.id, tournamentId]);

    let opponentName: string | null = null;
    let opponentHandicap: number | null = null;
    let opp2Name: string | null = null;
    let opp2Handicap: number | null = null;
    const drawReleased = !!mySlot?.portal_slot_id;

    if (drawReleased) {
      // All other confirmed players in the same slot who are NOT on the user's team
      const others = await query<any>(`
        SELECT DISTINCT bp.user_id, u.name, u.handicap
        FROM bookings b
        JOIN booking_players bp ON bp.booking_id = b.id
        JOIN users u ON u.id = bp.user_id
        LEFT JOIN event_registrations er ON er.user_id = bp.user_id AND er.event_id = ?
        WHERE b.portal_slot_id = ?
          AND bp.user_id != ?
          AND (er.team_id IS NULL OR er.team_id != ?)
          AND b.status = 'confirmed'
        ORDER BY bp.user_id
        LIMIT 2
      `, [tournamentId, mySlot.portal_slot_id, user.id, teamId ?? -1]);

      if (others[0]) { opponentName = others[0].name; opponentHandicap = others[0].handicap != null ? Number(others[0].handicap) : null; }
      if (others[1]) { opp2Name     = others[1].name; opp2Handicap     = others[1].handicap != null ? Number(others[1].handicap) : null; }
    }

    res.json({
      group: partnerName ? {
        partnerName, partnerHandicap,
        opponentName, opponentHandicap,
        opp2Name, opp2Handicap,
        drawReleased,
      } : null,
    });
  } catch (err: any) {
    if (err?.message?.includes("Unauthorized")) { res.status(401).json({ message: "Unauthorized" }); return; }
    res.status(500).json({ message: "Failed to load betterball group" });
  }
});

// ─── My current match in a knockout tournament ────────────────────────────────

router.get("/scoring/tournaments/:tournamentId/my-match", async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }
    const tournamentId = parseInt(req.params.tournamentId);

    // Look up the user's team (for betterball team events)
    const teamReg = await row<any>(
      "SELECT team_id FROM event_registrations WHERE user_id = ? AND event_id = ? LIMIT 1",
      [user.id, tournamentId]
    );
    const teamId = teamReg?.team_id ?? null;

    // Find the match — either directly (singles) or via team membership (betterball)
    const m = await row<any>(`
      SELECT km.id,
             km.player1_id,
             km.player2_id,
             km.status,
             kr.label  AS round_label,
             CASE WHEN (km.player1_id = ? OR EXISTS (SELECT 1 FROM event_registrations er WHERE er.user_id = km.player1_id AND er.team_id = ?))
                  THEN u2.name     ELSE u1.name     END AS opponent_name,
             CASE WHEN (km.player1_id = ? OR EXISTS (SELECT 1 FROM event_registrations er WHERE er.user_id = km.player1_id AND er.team_id = ?))
                  THEN u2.handicap ELSE u1.handicap END AS opponent_handicap,
             pu.name     AS partner_name,
             pu.handicap AS partner_handicap
      FROM knockout_matches km
      JOIN knockout_rounds  kr ON kr.id = km.round_id
      LEFT JOIN users u1 ON u1.id = km.player1_id
      LEFT JOIN users u2 ON u2.id = km.player2_id
      LEFT JOIN event_registrations ptnr_er
             ON ptnr_er.team_id = ? AND ptnr_er.user_id != ? AND ptnr_er.event_id = ?
      LEFT JOIN users pu ON pu.id = ptnr_er.user_id
      WHERE km.event_id = ?
        AND (km.player1_id = ? OR km.player2_id = ?
             OR EXISTS (SELECT 1 FROM event_registrations er WHERE er.user_id = km.player1_id AND er.team_id = ?)
             OR EXISTS (SELECT 1 FROM event_registrations er WHERE er.user_id = km.player2_id AND er.team_id = ?))
        AND km.status NOT IN ('complete','bye')
      ORDER BY kr.round_number ASC
      LIMIT 1
    `, [user.id, teamId, user.id, teamId, teamId, user.id, tournamentId, tournamentId, user.id, user.id, teamId, teamId]);

    if (!m) { res.json({ match: null }); return; }

    // Find opponent's partner — works for both singles and betterball (no teamId needed)
    let opp2Name: string | null = null;
    let opp2Handicap: number | null = null;
    {
      // Determine which side the user is on: directly player1, or in player1's team
      const onP1Side = user.id === m.player1_id || !!(await row<any>(
        `SELECT 1 FROM event_registrations er1
         JOIN event_registrations er2 ON er2.team_id = er1.team_id AND er2.event_id = er1.event_id
         WHERE er1.user_id = ? AND er2.user_id = ? AND er1.event_id = ? AND er1.team_id IS NOT NULL LIMIT 1`,
        [user.id, m.player1_id, tournamentId]
      ));
      const oppRepId: number = onP1Side ? m.player2_id : m.player1_id;
      if (oppRepId) {
        const oppTeam = await row<any>(
          "SELECT team_id FROM event_registrations WHERE user_id = ? AND event_id = ? AND team_id IS NOT NULL LIMIT 1",
          [oppRepId, tournamentId]
        );
        if (oppTeam?.team_id) {
          const opp2 = await row<any>(
            "SELECT u.name, u.handicap FROM event_registrations er JOIN users u ON u.id = er.user_id WHERE er.team_id = ? AND er.user_id != ? AND er.event_id = ? LIMIT 1",
            [oppTeam.team_id, oppRepId, tournamentId]
          );
          opp2Name = opp2?.name ?? null;
          opp2Handicap = opp2?.handicap != null ? Number(opp2.handicap) : null;
        }
      }
    }

    res.json({
      match: {
        matchId:           m.id,
        opponentName:      m.opponent_name  ?? "TBD",
        opp2Name,
        opponentHandicap:  m.opponent_handicap != null ? Number(m.opponent_handicap) : null,
        opp2Handicap,
        roundLabel:        m.round_label    ?? null,
        status:            m.status,
        partnerName:       m.partner_name   ?? null,
        partnerHandicap:   m.partner_handicap != null ? Number(m.partner_handicap) : null,
      },
    });
  } catch (err: any) {
    if (err?.message?.includes("Unauthorized")) { res.status(401).json({ message: "Unauthorized" }); return; }
    req.log?.error({ err }, "my-match lookup error");
    res.status(500).json({ message: "Failed to load match" });
  }
});

// ─── List user's rounds ───────────────────────────────────────────────────────

router.get("/scoring/rounds", async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }
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
    if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }
    const {
      clubId, teeColor = "white", format = "individual_stableford",
      courseHandicap = 0, playingHandicap = 0, allowancePct = 100,
      tournamentId = null,
    } = req.body;

    if (!clubId) { res.status(400).json({ message: "clubId is required" }); return; }

    // Block scoring unless the user has a confirmed spot in this tournament.
    // A spot is confirmed via either:
    //   a) an approved event_registrations entry (formal / knockout events), OR
    //   b) a confirmed booking on a tee slot exclusive to this event
    if (tournamentId) {
      const hasReg = await row<{ 1: number }>(
        "SELECT 1 FROM event_registrations WHERE user_id = ? AND event_id = ? AND status = 'approved' LIMIT 1",
        [user.id, tournamentId]
      );
      const hasBooking = !hasReg && await row<{ 1: number }>(`
        SELECT 1 FROM bookings b
        JOIN booking_players bp ON bp.booking_id = b.id
        JOIN portal_tee_slots pts ON pts.id = b.portal_slot_id
        WHERE pts.event_id = ? AND bp.user_id = ? AND b.status = 'confirmed'
        LIMIT 1
      `, [tournamentId, user.id]);
      const hasKoMatch = !hasReg && !hasBooking && await row<{ 1: number }>(
        "SELECT 1 FROM knockout_matches WHERE event_id = ? AND (player1_id = ? OR player2_id = ?) LIMIT 1",
        [tournamentId, user.id, user.id]
      );
      if (!hasReg && !hasBooking && !hasKoMatch) {
        // Distinguish: pending reg vs completely absent
        const pendingReg = await row<{ status: string }>(
          "SELECT status FROM event_registrations WHERE user_id = ? AND event_id = ? LIMIT 1",
          [user.id, tournamentId]
        );
        const msg = pendingReg
          ? "Your registration for this tournament has not been confirmed yet."
          : "You don't have a confirmed booking for this tournament.";
        res.status(403).json({ message: msg });
        return;
      }
    }

    // For matchplay formats, auto-lookup the user's current knockout match
    let matchId: number | null = req.body.matchId ?? null;
    let opponentName: string | null = req.body.opponentName ?? null;
    // DB auto-lookup sets these; body values override when explicitly provided (not null)
    let opponentPlayingHcp = 0;
    let partnerName: string | null = null;
    let partnerPlayingHcp = 0;
    let opponent2Name: string | null = null;
    let opponent2PlayingHcp = 0;

    if (tournamentId && (format === "singles_match_play" || format === "betterball_match_play")) {
      // For betterball, also look up the user's team and partner
      const teamReg = await row<any>(
        "SELECT team_id FROM event_registrations WHERE user_id = ? AND event_id = ? LIMIT 1",
        [user.id, tournamentId]
      );
      const teamId = teamReg?.team_id ?? null;

      if (teamId) {
        const ptnr = await row<any>(
          "SELECT u.name, u.handicap FROM event_registrations er JOIN users u ON u.id = er.user_id WHERE er.team_id = ? AND er.user_id != ? AND er.event_id = ? LIMIT 1",
          [teamId, user.id, tournamentId]
        );
        partnerName = ptnr?.name ?? null;
        partnerPlayingHcp = req.body.partnerPlayingHcp != null
          ? Number(req.body.partnerPlayingHcp)
          : (ptnr?.handicap != null ? Math.round(Number(ptnr.handicap) * (Number(allowancePct) / 100)) : 0);
      }

      const m = await row<any>(`
        SELECT km.id, km.player1_id, km.player2_id,
          CASE WHEN (km.player1_id = ? OR EXISTS (SELECT 1 FROM event_registrations er WHERE er.user_id = km.player1_id AND er.team_id = ?))
               THEN u2.name  ELSE u1.name  END AS opp_name,
          CASE WHEN (km.player1_id = ? OR EXISTS (SELECT 1 FROM event_registrations er WHERE er.user_id = km.player1_id AND er.team_id = ?))
               THEN u2.handicap ELSE u1.handicap END AS opp_hcp
        FROM knockout_matches km
        JOIN knockout_rounds  kr ON kr.id = km.round_id
        LEFT JOIN users u1 ON u1.id = km.player1_id
        LEFT JOIN users u2 ON u2.id = km.player2_id
        WHERE km.event_id = ?
          AND (km.player1_id = ? OR km.player2_id = ?
               OR EXISTS (SELECT 1 FROM event_registrations er WHERE er.user_id = km.player1_id AND er.team_id = ?)
               OR EXISTS (SELECT 1 FROM event_registrations er WHERE er.user_id = km.player2_id AND er.team_id = ?))
          AND km.status NOT IN ('complete','bye')
        ORDER BY kr.round_number ASC
        LIMIT 1
      `, [user.id, teamId, user.id, teamId, tournamentId, user.id, user.id, teamId, teamId]);
      if (m) {
        matchId          = m.id;
        opponentName     = m.opp_name ?? null;
        // Use body override if explicitly provided; otherwise fall back to DB profile handicap
        opponentPlayingHcp = req.body.opponentPlayingHcp != null
          ? Number(req.body.opponentPlayingHcp)
          : (m.opp_hcp ? Math.round(Number(m.opp_hcp) * (Number(allowancePct) / 100)) : 0);
        // Find opponent's partner (team-agnostic — works whether teamId is set or not)
        {
          const onP1Side = user.id === m.player1_id || !!(await row<any>(
            `SELECT 1 FROM event_registrations er1
             JOIN event_registrations er2 ON er2.team_id = er1.team_id AND er2.event_id = er1.event_id
             WHERE er1.user_id = ? AND er2.user_id = ? AND er1.event_id = ? AND er1.team_id IS NOT NULL LIMIT 1`,
            [user.id, m.player1_id, tournamentId]
          ));
          const oppRepId: number = onP1Side ? m.player2_id : m.player1_id;
          if (oppRepId) {
            const oppTeam = await row<any>(
              "SELECT team_id FROM event_registrations WHERE user_id = ? AND event_id = ? AND team_id IS NOT NULL LIMIT 1",
              [oppRepId, tournamentId]
            );
            if (oppTeam?.team_id) {
              const opp2 = await row<any>(
                "SELECT u.name, u.handicap FROM event_registrations er JOIN users u ON u.id = er.user_id WHERE er.team_id = ? AND er.user_id != ? AND er.event_id = ? LIMIT 1",
                [oppTeam.team_id, oppRepId, tournamentId]
              );
              opponent2Name = opp2?.name ?? null;
              opponent2PlayingHcp = req.body.opponent2PlayingHcp != null
                ? Number(req.body.opponent2PlayingHcp)
                : (opp2?.handicap != null ? Math.round(Number(opp2.handicap) * (Number(allowancePct) / 100)) : 0);
            }
          }
        }
      }
    }

    // For non-knockout betterball formats, look up betterball group (partner + tee-slot opponents)
    const BETTERBALL_FORMATS_SET = new Set([
      "fourball_stableford", "fourball_gross_betterball", "fourball_net_betterball",
      "shamble", "best_ball_aggregate", "high_low", "daytona", "low_ball_total",
      "the_ghost", "betterball_bonus_bogey", "pinehurst_points",
    ]);
    if (tournamentId && BETTERBALL_FORMATS_SET.has(format)) {
      const myReg = await row<any>(
        "SELECT team_id FROM event_registrations WHERE user_id = ? AND event_id = ? LIMIT 1",
        [user.id, tournamentId]
      );
      const teamId = myReg?.team_id ?? null;
      if (teamId) {
        const ptnr = await row<any>(
          `SELECT u.name, u.handicap FROM event_registrations er
           JOIN users u ON u.id = er.user_id
           WHERE er.team_id = ? AND er.user_id != ? AND er.event_id = ? LIMIT 1`,
          [teamId, user.id, tournamentId]
        );
        if (ptnr) {
          partnerName = ptnr.name ?? null;
          partnerPlayingHcp = req.body.partnerPlayingHcp != null
            ? Number(req.body.partnerPlayingHcp)
            : (ptnr.handicap != null ? Math.round(Number(ptnr.handicap) * (Number(allowancePct) / 100)) : 0);
        }
        // Opponents: other confirmed players in the same tee-slot who are NOT on the user's team
        const mySlot = await row<any>(`
          SELECT b.portal_slot_id FROM bookings b
          JOIN booking_players bp ON bp.booking_id = b.id
          JOIN portal_tee_slots pts ON pts.id = b.portal_slot_id
          WHERE bp.user_id = ? AND pts.event_id = ? AND b.status = 'confirmed'
          LIMIT 1
        `, [user.id, tournamentId]);
        if (mySlot?.portal_slot_id) {
          const others = await query<any>(`
            SELECT DISTINCT bp.user_id, u.name, u.handicap
            FROM bookings b
            JOIN booking_players bp ON bp.booking_id = b.id
            JOIN users u ON u.id = bp.user_id
            LEFT JOIN event_registrations er ON er.user_id = bp.user_id AND er.event_id = ?
            WHERE b.portal_slot_id = ?
              AND bp.user_id != ?
              AND (er.team_id IS NULL OR er.team_id != ?)
              AND b.status = 'confirmed'
            ORDER BY bp.user_id
            LIMIT 2
          `, [tournamentId, mySlot.portal_slot_id, user.id, teamId]);
          if (others[0]) {
            opponentName = others[0].name;
            opponentPlayingHcp = req.body.opponentPlayingHcp != null
              ? Number(req.body.opponentPlayingHcp)
              : (others[0].handicap != null ? Math.round(Number(others[0].handicap) * (Number(allowancePct) / 100)) : 0);
          }
          if (others[1]) {
            opponent2Name = others[1].name;
            opponent2PlayingHcp = req.body.opponent2PlayingHcp != null
              ? Number(req.body.opponent2PlayingHcp)
              : (others[1].handicap != null ? Math.round(Number(others[1].handicap) * (Number(allowancePct) / 100)) : 0);
          }
        }
      }
    }

    // Abandon any existing active round
    await run(
      "UPDATE scoring_rounds SET status = 'abandoned' WHERE user_id = ? AND status = 'active'",
      [user.id]
    );

    const [{ id }] = await query<{ id: number }>(`
      INSERT INTO scoring_rounds
        (user_id, club_id, tee_color, format, course_handicap, playing_handicap, allowance_pct,
         tournament_id, match_id, opponent_name, opponent_playing_hcp,
         partner_name, partner_playing_hcp, opponent2_name, opponent2_playing_hcp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `, [user.id, clubId, teeColor, format, courseHandicap, playingHandicap, allowancePct,
        tournamentId, matchId, opponentName, opponentPlayingHcp,
        partnerName, partnerPlayingHcp, opponent2Name, opponent2PlayingHcp]);

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
    if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }
    const roundId = parseInt(req.params.id);

    const rounds = await query<any>(`
      SELECT r.*, c.name AS club_name, c.location AS club_location, c.logo_url AS club_logo_url,
             e.name AS tournament_name,
             km.status      AS match_status,
             km.dispute     AS match_dispute,
             km.winner_id   AS match_winner_id
      FROM scoring_rounds r
      JOIN clubs c ON r.club_id = c.id
      LEFT JOIN golf_events e ON r.tournament_id = e.id
      LEFT JOIN knockout_matches km ON km.id = r.match_id
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
    if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }
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

function getHALocal(si: number, ph: number): number {
  if (ph <= 0) return 0;
  if (ph <= 18) return si <= ph ? 1 : 0;
  return 1 + (si <= ph - 18 ? 1 : 0);
}

router.post("/scoring/rounds/:id/complete", async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }
    const roundId = parseInt(req.params.id);

    const rounds = await query<any>(
      "SELECT * FROM scoring_rounds WHERE id = ? AND user_id = ? AND status = 'active'",
      [roundId, user.id]
    );
    if (rounds.length === 0) { res.status(404).json({ message: "Active round not found" }); return; }
    const round = rounds[0];

    const holeRows = await query<any>(
      "SELECT hole_number, gross_score, net_score, stableford_points, stroke_index, is_nr FROM scoring_holes WHERE round_id = ?",
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

    // ─── Matchplay two-phase score verification ──────────────────────────────
    if (round.match_id && (round.format === "singles_match_play" || round.format === "betterball_match_play")) {
      try {
        const match = await row<any>("SELECT * FROM knockout_matches WHERE id = ?", [round.match_id]);
        if (match && match.status !== "complete" && match.status !== "bye") {

          // ── Step 1: calculate this player's result from their own scores ──
          let won = 0, lost = 0, halved = 0;

          if (round.format === "singles_match_play") {
            // Opponent scores live in scoring_player_holes at player_index = 0
            const oppRows = await query<any>(
              "SELECT hole_number, gross_score, is_nr FROM scoring_player_holes WHERE round_id = ? AND player_index = 0",
              [roundId]
            );
            const oppMap: Record<number, any> = {};
            for (const p of oppRows) oppMap[p.hole_number] = p;
            for (const h of holeRows) {
              const opp = oppMap[h.hole_number];
              if (!opp || h.is_nr || opp.is_nr || h.gross_score == null || opp.gross_score == null) continue;
              const myNet  = h.gross_score  - getHALocal(h.stroke_index, round.playing_handicap);
              const oppNet = opp.gross_score - getHALocal(h.stroke_index, round.opponent_playing_hcp ?? 0);
              if      (myNet < oppNet) won++;
              else if (myNet > oppNet) lost++;
              else                     halved++;
            }
          } else {
            // betterball: partner = index 0, opp1 = index 1, opp2 = index 2
            const pRows = await query<any>(
              "SELECT hole_number, gross_score, is_nr, player_index FROM scoring_player_holes WHERE round_id = ?",
              [roundId]
            );
            const partnerMap: Record<number, any> = {};
            const opp1Map: Record<number, any> = {};
            const opp2Map: Record<number, any> = {};
            for (const p of pRows) {
              if      (p.player_index === 0) partnerMap[p.hole_number] = p;
              else if (p.player_index === 1) opp1Map[p.hole_number]    = p;
              else if (p.player_index === 2) opp2Map[p.hole_number]    = p;
            }
            // Use stored per-player playing handicaps (stored at round start from users.handicap)
            const partnerHcp  = round.partner_playing_hcp  ?? 0;
            const opp1Hcp     = round.opponent_playing_hcp ?? 0;
            const opp2Hcp     = round.opponent2_playing_hcp ?? opp1Hcp; // fallback for old rounds
            for (const h of holeRows) {
              if (h.is_nr || h.gross_score == null) continue;
              const opp1 = opp1Map[h.hole_number];
              const opp2 = opp2Map[h.hole_number];
              if (!opp1 && !opp2) continue;
              const partner  = partnerMap[h.hole_number];
              const myNet    = h.gross_score - getHALocal(h.stroke_index, round.playing_handicap);
              const partNet  = partner?.gross_score != null && !partner.is_nr
                ? partner.gross_score - getHALocal(h.stroke_index, partnerHcp) : null;
              const teamBest = partNet != null ? Math.min(myNet, partNet) : myNet;
              const opp1Net  = opp1?.gross_score != null && !opp1.is_nr
                ? opp1.gross_score - getHALocal(h.stroke_index, opp1Hcp) : null;
              const opp2Net  = opp2?.gross_score != null && !opp2.is_nr
                ? opp2.gross_score - getHALocal(h.stroke_index, opp2Hcp) : null;
              const oppBest  = opp1Net != null && opp2Net != null ? Math.min(opp1Net, opp2Net) : (opp1Net ?? opp2Net);
              if (oppBest == null) continue;
              if      (teamBest < oppBest) won++;
              else if (teamBest > oppBest) lost++;
              else                         halved++;
            }
          }

          const holesUp  = won - lost;
          const holesRem = 18 - holeRows.length;
          const myResult: "won" | "lost" | "halved" | null =
            (won + lost + halved) === 0 ? null :
            holesUp > 0 ? "won" :
            holesUp < 0 ? "lost" :
                          "halved";

          // ── Step 2: persist this player's result ─────────────────────────
          if (myResult) {
            await run("UPDATE scoring_rounds SET match_result = ? WHERE id = ?", [myResult, roundId]);
          }

          // ── Step 3: check if opponent has also finished ───────────────────
          const oppRound = myResult ? await row<any>(
            `SELECT id, match_result FROM scoring_rounds
             WHERE match_id = ? AND user_id != ? AND status = 'complete' AND match_result IS NOT NULL
             ORDER BY completed_at DESC LIMIT 1`,
            [round.match_id, user.id]
          ) : null;

          if (oppRound && myResult) {
            const theirResult = oppRound.match_result as string;

            // Results agree when they're complementary (I won + they lost, or both halved)
            const agree =
              (myResult === "won"    && theirResult === "lost")   ||
              (myResult === "lost"   && theirResult === "won")    ||
              (myResult === "halved" && theirResult === "halved");

            if (agree) {
              if (myResult === "halved") {
                // Halved — no winner
                await run(
                  `UPDATE knockout_matches
                   SET winner_id = NULL, score = 'Halved', status = 'complete', dispute = FALSE
                   WHERE id = ?`,
                  [match.id]
                );
              } else {
                // Determine winner — figure out which side of the match this user is on
                let isPlayer1 = match.player1_id === user.id;
                if (!isPlayer1 && match.player2_id !== user.id && round.tournament_id) {
                  // Betterball: user may be the non-representative team member
                  const myTeam = await row<any>(
                    "SELECT team_id FROM event_registrations WHERE user_id = ? AND event_id = ? LIMIT 1",
                    [user.id, round.tournament_id]
                  );
                  if (myTeam?.team_id) {
                    const p1Same = await row<any>(
                      "SELECT 1 FROM event_registrations WHERE user_id = ? AND team_id = ? LIMIT 1",
                      [match.player1_id, myTeam.team_id]
                    );
                    isPlayer1 = !!p1Same;
                  }
                }
                const winnerId  = myResult === "won"
                  ? (isPlayer1 ? match.player1_id : match.player2_id)
                  : (isPlayer1 ? match.player2_id : match.player1_id);
                const margin    = Math.abs(holesUp);
                const scoreStr  = (holesRem > 0 && margin > holesRem) ? `${margin}&${holesRem}` : `${margin} UP`;
                const p1Result  = match.player1_id === winnerId ? "won" : "lost";
                const p2Result  = p1Result === "won" ? "lost" : "won";

                await run(
                  `UPDATE knockout_matches
                   SET winner_id = ?, score = ?, status = 'complete',
                       player1_result = ?, player2_result = ?, dispute = FALSE
                   WHERE id = ?`,
                  [winnerId, scoreStr, p1Result, p2Result, match.id]
                );

                // Advance winner into next match
                if (match.next_match_id) {
                  const field = match.slot_position === "bottom" ? "player2_id" : "player1_id";
                  await run(`UPDATE knockout_matches SET ${field} = ? WHERE id = ?`, [winnerId, match.next_match_id]);
                }

                // Mark knockout round complete if all matches are done
                const roundMatches = await query<any>("SELECT status FROM knockout_matches WHERE round_id = ?", [match.round_id]);
                if (roundMatches.every((m: any) => m.status === "complete" || m.status === "bye")) {
                  await run("UPDATE knockout_rounds SET is_complete = 1 WHERE id = ?", [match.round_id]);
                }
              }
            } else {
              // Dispute — store both results and flag for club adjudication
              const p1Result = match.player1_id === user.id ? myResult       : theirResult;
              const p2Result = match.player1_id === user.id ? theirResult    : myResult;
              await run(
                `UPDATE knockout_matches
                 SET dispute = TRUE,
                     player1_result = NULLIF(?, 'halved'),
                     player2_result = NULLIF(?, 'halved')
                 WHERE id = ?`,
                [p1Result, p2Result, match.id]
              );
            }
          }
        }
      } catch (matchErr: any) {
        req.log?.error({ matchErr }, "matchplay verify error (non-fatal)");
      }
    }

    res.json({ ok: true, totalGross, totalNet, totalPoints, holesPlayed: holeRows.length });
  } catch (err: any) {
    if (err?.message?.includes("Unauthorized")) { res.status(401).json({ message: "Unauthorized" }); return; }
    req.log?.error({ err }, "complete round error");
    res.status(500).json({ message: "Failed to complete round" });
  }
});

// ─── Submit score to club tournament ─────────────────────────────────────────

router.post("/scoring/rounds/:id/submit", async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }
    const roundId = parseInt(req.params.id);

    const rounds = await query<any>(
      "SELECT id, status, tournament_id, score_submitted FROM scoring_rounds WHERE id = ? AND user_id = ?",
      [roundId, user.id]
    );
    if (rounds.length === 0) { res.status(404).json({ message: "Round not found" }); return; }
    const round = rounds[0];
    if (round.status !== "complete") { res.status(400).json({ message: "Round must be completed before submitting" }); return; }
    if (!round.tournament_id) { res.status(400).json({ message: "Round is not linked to a tournament" }); return; }
    if (round.score_submitted) { res.json({ ok: true, alreadySubmitted: true }); return; }

    await run(
      "UPDATE scoring_rounds SET score_submitted = 1 WHERE id = ?",
      [roundId]
    );

    res.json({ ok: true });
  } catch (err: any) {
    if (err?.message?.includes("Unauthorized")) { res.status(401).json({ message: "Unauthorized" }); return; }
    req.log?.error({ err }, "submit score error");
    res.status(500).json({ message: "Failed to submit score" });
  }
});

// ─── Abandon / delete round ───────────────────────────────────────────────────

router.post("/scoring/rounds/:id/abandon", async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }
    const roundId = parseInt(req.params.id);
    const result = await run(
      "UPDATE scoring_rounds SET status = 'abandoned' WHERE id = ? AND user_id = ? AND status = 'active'",
      [roundId, user.id]
    );
    if ((result as any).affectedRows === 0) {
      res.status(404).json({ message: "Round not found or already finished" }); return;
    }
    res.json({ ok: true });
  } catch (err: any) {
    if (err?.message?.includes("Unauthorized")) { res.status(401).json({ message: "Unauthorized" }); return; }
    res.status(500).json({ message: "Failed to abandon round" });
  }
});

router.delete("/scoring/rounds/:id", async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }
    const roundId = parseInt(req.params.id);
    await run("DELETE FROM scoring_rounds WHERE id = ? AND user_id = ?", [roundId, user.id]);
    res.json({ ok: true });
  } catch (err: any) {
    if (err?.message?.includes("Unauthorized")) { res.status(401).json({ message: "Unauthorized" }); return; }
    res.status(500).json({ message: "Failed to delete round" });
  }
});

export default router;
