import { Router, type IRouter } from "express";
import { query, row, exec, run } from "../lib/pg";
import { getUser } from "../lib/auth";

const router: IRouter = Router();

// ─── Scoring helpers ──────────────────────────────────────────────────────────

function getHA(strokeIndex: number, playingHcp: number): number {
  if (playingHcp === 0) return 0;
  if (playingHcp > 0) {
    if (playingHcp <= 18) return strokeIndex <= playingHcp ? 1 : 0;
    return 1 + (strokeIndex <= playingHcp - 18 ? 1 : 0);
  }
  // Plus handicapper (playingHcp < 0): give strokes back from SI 18 downward
  const abs = -playingHcp;
  if (abs <= 18) return strokeIndex >= (19 - abs) ? -1 : 0;
  return -1 + (strokeIndex >= (19 - (abs - 18)) ? -1 : 0);
}

function calcPoints(gross: number, par: number, ha: number): number {
  return Math.max(0, par + 2 - (gross - ha));
}

// Returns the gross score at which a player earns 0 points and should pick up,
// or null for formats with no stableford-style maximum (stroke play, par/bogey, gross).
function getStablefordMax(fmt: string, par: number, ha: number): number | null {
  switch (fmt) {
    // No cap — stroke play has no forced pickup without Model Local Rule E-3
    case "net_stroke_play":
    case "chairman":
    // No cap — gross match play pickup is hole-concession, not a fixed formula
    case "singles_gross_match_play":
    case "betterball_gross_match_play":
    // No cap — modified stableford accumulates negative pts so there is no neutral pickup point
    case "modified_stableford":
    // No cap — scramble/alternate-shot formats use team stroke totals, not per-hole points
    case "texas_scramble":
    case "american_scramble":
    case "chapman":
      return null;
    // Par/bogey: pickup once the hole is definitively lost (R&A Rule 21.2)
    case "par_bogey":
    case "individual_par":
      return par + 1 + ha; // net bogey = worst outcome in par game (-1 pt)
    case "individual_bogey":
      return par + 2 + ha; // net double bogey = worst outcome in bogey game (-1 pt)
    // Bonus bogey: double bogey or worse = -2 (worst score); nothing to gain by continuing
    case "individual_bonus_bogey":
      return par + 2 + ha;
    // All standard stableford formats: net double bogey = 0 pts (R&A Rule 21.1b(2))
    default:
      return par + 2 + ha;
  }
}
function calcFormatPts(fmt: string, gross: number, par: number, ha: number): number {
  const netVsPar = (gross - ha) - par;
  switch (fmt) {
    case "modified_stableford":
      if (netVsPar <= -2) return 4;
      if (netVsPar === -1) return 2;
      if (netVsPar === 0) return 0;
      if (netVsPar === 1) return -1;
      return -3;
    case "individual_bonus_bogey":
      if (netVsPar <= -2) return 2;   // eagle or better = +2
      if (netVsPar === -1) return 1;  // birdie = +1
      if (netVsPar === 0) return 0;   // par = 0 (level)
      if (netVsPar === 1) return -1;  // bogey = -1
      return -2;                       // double bogey or worse = -2
    case "par_bogey":
    case "individual_par":
      return netVsPar < 0 ? 1 : netVsPar === 0 ? 0 : -1;
    case "individual_bogey":
      return netVsPar <= 0 ? 1 : netVsPar === 1 ? 0 : -1;
    case "net_stroke_play":
    case "chairman":
    case "texas_scramble":
    case "american_scramble":
    case "chapman":
      return 0;
    default:
      return Math.max(0, par + 2 - (gross - ha));
  }
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

    // Surface tournaments where the requesting user has a confirmed spot:
    //   a) approved event_registrations entry (formal events), OR
    //   b) a confirmed booking on a tee slot exclusive to this event, OR
    //   c) appears as player1_id or player2_id in any knockout_matches
    const tournaments = await query<any>(`
      SELECT id, name, event_date, end_date, format, format2, format_custom,
             knockout_type, knockout_scoring_format, restriction, event_type
      FROM golf_events ge
      WHERE club_id = ?
        AND COALESCE(end_date, event_date) >= CURRENT_DATE - INTERVAL '1 day'
        AND status NOT IN ('cancelled', 'completed')
        AND event_type != 'eclectic'
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

// ─── My marker for an individual tournament ──────────────────────────────────

router.get("/scoring/tournaments/:tournamentId/my-marker", async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }
    const tournamentId = parseInt(req.params.tournamentId);

    const mySlot = await row<any>(`
      SELECT b.portal_slot_id FROM bookings b
      JOIN booking_players bp ON bp.booking_id = b.id
      JOIN portal_tee_slots pts ON pts.id = b.portal_slot_id
      WHERE bp.user_id = ? AND pts.event_id = ? AND b.status = 'confirmed'
      LIMIT 1
    `, [user.id, tournamentId]);

    if (!mySlot?.portal_slot_id) { res.json({ marker: null }); return; }

    // All players in this slot, sorted by user_id for stable pairing
    const all = await query<any>(`
      SELECT DISTINCT bp.user_id, u.name, u.handicap
      FROM bookings b
      JOIN booking_players bp ON bp.booking_id = b.id
      JOIN users u ON u.id = bp.user_id
      WHERE b.portal_slot_id = ? AND b.status = 'confirmed'
      ORDER BY bp.user_id
    `, [mySlot.portal_slot_id]);

    const myIdx = all.findIndex((p: any) => p.user_id === user.id);
    if (myIdx < 0) { res.json({ marker: null }); return; }

    const n = all.length;
    let markerName: string | null = null;
    let markerHandicap: number | null = null;
    let marker2Name: string | null = null;
    let marker2Handicap: number | null = null;

    if (n === 2) {
      const m = all[1 - myIdx];
      markerName = m.name; markerHandicap = m.handicap != null ? Number(m.handicap) : null;
    } else if (n === 3) {
      if (myIdx === 0) {
        // Player A marks for both B and C
        markerName = all[1].name; markerHandicap = all[1].handicap != null ? Number(all[1].handicap) : null;
        marker2Name = all[2].name; marker2Handicap = all[2].handicap != null ? Number(all[2].handicap) : null;
      } else {
        // B or C marks for A
        markerName = all[0].name; markerHandicap = all[0].handicap != null ? Number(all[0].handicap) : null;
      }
    } else if (n >= 4) {
      // Pairs: (0,1) and (2,3)
      const pairIdx = myIdx % 2 === 0 ? myIdx + 1 : myIdx - 1;
      const m = all[Math.min(pairIdx, n - 1)];
      if (m && m.user_id !== user.id) {
        markerName = m.name; markerHandicap = m.handicap != null ? Number(m.handicap) : null;
      }
    }

    res.json({ marker: markerName ? { markerName, markerHandicap, marker2Name, marker2Handicap, drawReleased: true } : null });
  } catch (err: any) {
    if (err?.message?.includes("Unauthorized")) { res.status(401).json({ message: "Unauthorized" }); return; }
    res.status(500).json({ message: "Failed to load marker" });
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

    if (tournamentId && (format === "singles_match_play" || format === "betterball_match_play" || format === "singles_stableford_match_play")) {
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
      "texas_scramble", "american_scramble", "chapman",
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

    // For individual tournament formats, look up the player's marker from the tee slot
    let markerUserId: number | null = null;
    const BETTERBALL_ALL = new Set([
      "betterball_match_play","fourball_stableford","fourball_gross_betterball",
      "fourball_net_betterball","shamble","best_ball_aggregate","high_low","daytona",
      "low_ball_total","the_ghost","betterball_bonus_bogey","pinehurst_points",
      "alliance","american_scramble","texas_scramble","chapman",
    ]);
    const isIndividualTournamentRound = tournamentId &&
      format !== "singles_match_play" && !BETTERBALL_ALL.has(format);
    if (isIndividualTournamentRound) {
      const mySlot = await row<any>(`
        SELECT b.portal_slot_id FROM bookings b
        JOIN booking_players bp ON bp.booking_id = b.id
        JOIN portal_tee_slots pts ON pts.id = b.portal_slot_id
        WHERE bp.user_id = ? AND pts.event_id = ? AND b.status = 'confirmed'
        LIMIT 1
      `, [user.id, tournamentId]);
      if (mySlot?.portal_slot_id) {
        const all = await query<any>(`
          SELECT DISTINCT bp.user_id, u.name, u.handicap
          FROM bookings b
          JOIN booking_players bp ON bp.booking_id = b.id
          JOIN users u ON u.id = bp.user_id
          WHERE b.portal_slot_id = ? AND b.status = 'confirmed'
          ORDER BY bp.user_id
        `, [mySlot.portal_slot_id]);
        const myIdx = all.findIndex((p: any) => p.user_id === user.id);
        if (myIdx >= 0) {
          const n = all.length;
          let m1: any = null, m2: any = null;
          if (n === 2) {
            m1 = all[1 - myIdx];
          } else if (n === 3) {
            if (myIdx === 0) { m1 = all[1]; m2 = all[2]; }
            else             { m1 = all[0]; }
          } else if (n >= 4) {
            const pairIdx = myIdx % 2 === 0 ? myIdx + 1 : myIdx - 1;
            const candidate = all[Math.min(pairIdx, n - 1)];
            if (candidate && candidate.user_id !== user.id) m1 = candidate;
          }
          if (m1) {
            markerUserId = m1.user_id ?? null;
            opponentName = m1.name;
            opponentPlayingHcp = req.body.opponentPlayingHcp != null
              ? Number(req.body.opponentPlayingHcp)
              : (m1.handicap != null ? Math.round(Number(m1.handicap) * (Number(allowancePct) / 100)) : 0);
          }
          if (m2) {
            opponent2Name = m2.name;
            opponent2PlayingHcp = req.body.opponent2PlayingHcp != null
              ? Number(req.body.opponent2PlayingHcp)
              : (m2.handicap != null ? Math.round(Number(m2.handicap) * (Number(allowancePct) / 100)) : 0);
          }
        }
      }
    }

    // Body overrides — for casual play (no tournament) names and HCPs come directly from the body
    if (req.body.partnerName         != null) partnerName         = String(req.body.partnerName);
    if (req.body.partnerPlayingHcp   != null) partnerPlayingHcp   = Number(req.body.partnerPlayingHcp);
    if (req.body.opponentName        != null) opponentName        = String(req.body.opponentName);
    if (req.body.opponentPlayingHcp  != null) opponentPlayingHcp  = Number(req.body.opponentPlayingHcp);
    if (req.body.opponent2Name       != null) opponent2Name       = String(req.body.opponent2Name);
    if (req.body.opponent2PlayingHcp != null) opponent2PlayingHcp = Number(req.body.opponent2PlayingHcp);

    // Abandon any existing active round
    await run(
      "UPDATE scoring_rounds SET status = 'abandoned' WHERE user_id = ? AND status = 'active'",
      [user.id]
    );

    const opponentTeeColor  = req.body.opponentTeeColor  ?? "white";
    const partnerTeeColor   = req.body.partnerTeeColor   ?? "white";
    const opponent2TeeColor = req.body.opponent2TeeColor ?? "white";

    const [{ id }] = await query<{ id: number }>(`
      INSERT INTO scoring_rounds
        (user_id, club_id, tee_color, format, course_handicap, playing_handicap, allowance_pct,
         tournament_id, match_id, opponent_name, opponent_playing_hcp, opponent_tee_color,
         partner_name, partner_playing_hcp, partner_tee_color,
         opponent2_name, opponent2_playing_hcp, opponent2_tee_color, marker_user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `, [user.id, clubId, teeColor, format, courseHandicap, playingHandicap, allowancePct,
        tournamentId, matchId, opponentName, opponentPlayingHcp, opponentTeeColor,
        partnerName, partnerPlayingHcp, partnerTeeColor,
        opponent2Name, opponent2PlayingHcp, opponent2TeeColor, markerUserId]);

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
             u.name AS player_name,
             km.status      AS match_status,
             km.dispute     AS match_dispute,
             km.winner_id   AS match_winner_id,
             es.verified    AS score_verified,
             es.marker_disputed AS score_disputed
      FROM scoring_rounds r
      JOIN clubs c ON r.club_id = c.id
      JOIN users u ON u.id = r.user_id
      LEFT JOIN golf_events e ON r.tournament_id = e.id
      LEFT JOIN knockout_matches km ON km.id = r.match_id
      LEFT JOIN event_scores es ON es.event_id = r.tournament_id AND es.user_id = r.user_id
      WHERE r.id = ? AND (r.user_id = ? OR r.marker_user_id = ?)
    `, [roundId, user.id, user.id]);

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
      "SELECT playing_handicap, format FROM scoring_rounds WHERE id = ? AND user_id = ? AND status = 'active'",
      [roundId, user.id]
    );
    if (rounds.length === 0) { res.status(404).json({ message: "Active round not found" }); return; }
    const { playing_handicap, format: roundFormat } = rounds[0];

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
      const stablefordMax = getStablefordMax(roundFormat ?? "individual_stableford", par, ha);
      const effectiveGross = stablefordMax != null ? Math.min(grossScore, stablefordMax) : grossScore;
      const netScore = effectiveGross - ha;
      const pts = calcFormatPts(roundFormat ?? "individual_stableford", effectiveGross, par, ha);

      await exec(`
        INSERT INTO scoring_holes (round_id, hole_number, par, stroke_index, gross_score, net_score, stableford_points, is_nr)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0)
        ON CONFLICT (round_id, hole_number) DO UPDATE
          SET gross_score = EXCLUDED.gross_score,
              net_score = EXCLUDED.net_score,
              stableford_points = EXCLUDED.stableford_points,
              is_nr = 0
      `, [roundId, holeNum, par, strokeIndex, effectiveGross, netScore, pts]);
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

// ─── Edit handicaps mid-round ─────────────────────────────────────────────────

router.patch("/scoring/rounds/:id/handicaps", async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }
    const roundId = parseInt(req.params.id);

    const rounds = await query<any>(
      "SELECT id, format, playing_handicap, opponent_playing_hcp, partner_playing_hcp, opponent2_playing_hcp FROM scoring_rounds WHERE id = ? AND user_id = ? AND status != 'abandoned'",
      [roundId, user.id]
    );
    if (rounds.length === 0) { res.status(404).json({ message: "Round not found" }); return; }
    const round = rounds[0];

    const { playingHandicap, opponentPlayingHcp, partnerPlayingHcp, opponent2PlayingHcp } = req.body;

    const newPlayingHcp = playingHandicap  != null ? Math.round(Number(playingHandicap))  : round.playing_handicap;
    const newOppHcp     = opponentPlayingHcp  != null ? Math.round(Number(opponentPlayingHcp))  : round.opponent_playing_hcp;
    const newPartnerHcp = partnerPlayingHcp   != null ? Math.round(Number(partnerPlayingHcp))   : round.partner_playing_hcp;
    const newOpp2Hcp    = opponent2PlayingHcp != null ? Math.round(Number(opponent2PlayingHcp)) : round.opponent2_playing_hcp;

    await exec(
      "UPDATE scoring_rounds SET playing_handicap = ?, course_handicap = ?, opponent_playing_hcp = ?, partner_playing_hcp = ?, opponent2_playing_hcp = ? WHERE id = ?",
      [newPlayingHcp, newPlayingHcp, newOppHcp, newPartnerHcp, newOpp2Hcp, roundId]
    );

    // Recalculate all stored hole scores whenever the primary player's handicap changes
    if (newPlayingHcp !== Number(round.playing_handicap)) {
      const holeRows = await query<any>(
        "SELECT hole_number, par, stroke_index, gross_score FROM scoring_holes WHERE round_id = ? AND is_nr = 0 AND gross_score IS NOT NULL",
        [roundId]
      );
      for (const h of holeRows) {
        const ha = getHA(h.stroke_index, newPlayingHcp);
        const fmt = round.format ?? "individual_stableford";
        const stablefordMax = getStablefordMax(fmt, h.par, ha);
        const effectiveGross = stablefordMax != null ? Math.min(h.gross_score, stablefordMax) : h.gross_score;
        const netScore = effectiveGross - ha;
        const pts = calcFormatPts(fmt, effectiveGross, h.par, ha);
        await exec(
          "UPDATE scoring_holes SET gross_score = ?, net_score = ?, stableford_points = ? WHERE round_id = ? AND hole_number = ?",
          [effectiveGross, netScore, pts, roundId, h.hole_number]
        );
      }
    }

    res.json({ ok: true });
  } catch (err: any) {
    if (err?.message?.includes("Unauthorized")) { res.status(401).json({ message: "Unauthorized" }); return; }
    req.log?.error({ err }, "edit handicap error");
    res.status(500).json({ message: "Failed to update handicap" });
  }
});

// ─── Complete round ───────────────────────────────────────────────────────────

function getHALocal(si: number, ph: number): number {
  if (ph === 0) return 0;
  if (ph > 0) {
    if (ph <= 18) return si <= ph ? 1 : 0;
    return 1 + (si <= ph - 18 ? 1 : 0);
  }
  const abs = -ph;
  if (abs <= 18) return si >= (19 - abs) ? -1 : 0;
  return -1 + (si >= (19 - (abs - 18)) ? -1 : 0);
}
function getStablefordPts(gross: number, par: number, ha: number): number {
  return Math.max(0, par + 2 - (gross - ha));
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
    if (round.match_id && (round.format === "singles_match_play" || round.format === "betterball_match_play" || round.format === "singles_stableford_match_play" || round.format === "singles_gross_match_play" || round.format === "betterball_gross_match_play" || round.format === "fourball_stableford_match_play")) {
      try {
        const match = await row<any>("SELECT * FROM knockout_matches WHERE id = ?", [round.match_id]);
        if (match && match.status !== "complete" && match.status !== "bye") {

          // ── Step 1: calculate this player's result from their own scores ──
          let won = 0, lost = 0, halved = 0;

          if (round.format === "singles_match_play" || round.format === "singles_stableford_match_play" || round.format === "singles_gross_match_play") {
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
              if (round.format === "singles_stableford_match_play") {
                // WHS standard: only handicap DIFFERENCE is applied
                const myHcp  = round.playing_handicap;
                const oppHcp = round.opponent_playing_hcp ?? 0;
                const myPts  = getStablefordPts(h.gross_score,  h.par, getHALocal(h.stroke_index, Math.max(0, myHcp  - oppHcp)));
                const oppPts = getStablefordPts(opp.gross_score, h.par, getHALocal(h.stroke_index, Math.max(0, oppHcp - myHcp)));
                if      (myPts > oppPts) won++;
                else if (myPts < oppPts) lost++;
                else                     halved++;
              } else if (round.format === "singles_gross_match_play") {
                // Gross comparison — lower raw gross wins the hole, no handicap strokes
                if      (h.gross_score < opp.gross_score) won++;
                else if (h.gross_score > opp.gross_score) lost++;
                else                                      halved++;
              } else {
                // WHS standard: only handicap DIFFERENCE is applied
                const myHcp  = round.playing_handicap;
                const oppHcp = round.opponent_playing_hcp ?? 0;
                const myNet  = h.gross_score  - getHALocal(h.stroke_index, Math.max(0, myHcp  - oppHcp));
                const oppNet = opp.gross_score - getHALocal(h.stroke_index, Math.max(0, oppHcp - myHcp));
                if      (myNet < oppNet) won++;
                else if (myNet > oppNet) lost++;
                else                     halved++;
              }
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
            for (const h of holeRows) {
              if (h.is_nr || h.gross_score == null) continue;
              const opp1 = opp1Map[h.hole_number];
              const opp2 = opp2Map[h.hole_number];
              if (!opp1 && !opp2) continue;
              const partner = partnerMap[h.hole_number];
              if (round.format === "betterball_gross_match_play") {
                // Gross best-ball — lower raw gross per team wins, no handicap strokes
                const myGross   = h.gross_score;
                const partGross = partner?.gross_score != null && !partner.is_nr ? partner.gross_score : null;
                const teamBest  = partGross != null ? Math.min(myGross, partGross) : myGross;
                const opp1Gross = opp1?.gross_score != null && !opp1.is_nr ? opp1.gross_score : null;
                const opp2Gross = opp2?.gross_score != null && !opp2.is_nr ? opp2.gross_score : null;
                const oppBest   = opp1Gross != null && opp2Gross != null ? Math.min(opp1Gross, opp2Gross) : (opp1Gross ?? opp2Gross);
                if (oppBest == null) continue;
                if      (teamBest < oppBest) won++;
                else if (teamBest > oppBest) lost++;
                else                         halved++;
              } else if (round.format === "fourball_stableford_match_play") {
                // Stableford best-ball — higher pts per team wins the hole
                const partnerHcp  = round.partner_playing_hcp  ?? 0;
                const opp1Hcp     = round.opponent_playing_hcp ?? 0;
                const opp2Hcp     = round.opponent2_playing_hcp ?? opp1Hcp;
                const myPts    = getStablefordPts(h.gross_score, h.par, getHALocal(h.stroke_index, round.playing_handicap));
                const partPts  = partner?.gross_score != null && !partner.is_nr
                  ? getStablefordPts(partner.gross_score, h.par, getHALocal(h.stroke_index, partnerHcp)) : null;
                const teamBest = partPts != null ? Math.max(myPts, partPts) : myPts;
                const opp1Pts  = opp1?.gross_score != null && !opp1.is_nr
                  ? getStablefordPts(opp1.gross_score, h.par, getHALocal(h.stroke_index, opp1Hcp)) : null;
                const opp2Pts  = opp2?.gross_score != null && !opp2.is_nr
                  ? getStablefordPts(opp2.gross_score, h.par, getHALocal(h.stroke_index, opp2Hcp)) : null;
                const oppBest  = opp1Pts != null && opp2Pts != null ? Math.max(opp1Pts, opp2Pts) : (opp1Pts ?? opp2Pts);
                if (oppBest == null) continue;
                if      (teamBest > oppBest) won++;
                else if (teamBest < oppBest) lost++;
                else                         halved++;
              } else {
                // Net betterball (betterball_match_play) — handicap-adjusted best-ball
                const partnerHcp  = round.partner_playing_hcp  ?? 0;
                const opp1Hcp     = round.opponent_playing_hcp ?? 0;
                const opp2Hcp     = round.opponent2_playing_hcp ?? opp1Hcp;
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

// ─── Event-score auto-computation helpers ────────────────────────────────────

// Formats where the competitive score requires per-hole computation (team/pair)
const SCRAMBLE_FMTS    = new Set(["texas_scramble","american_scramble","scramble"]);
const SHAMBLE_FMTS     = new Set(["shamble"]);
const ALLIANCE_FMTS    = new Set(["alliance"]);
const PAIR_BEST_PTS    = new Set([
  "fourball_stableford","betterball","best_ball_aggregate","high_low","daytona",
  "low_ball_total","betterball_bonus_bogey","pinehurst_points","the_ghost",
  "fourball_stableford_match_play",
]);
const PAIR_BEST_NET    = new Set(["fourball_net_betterball","betterball_match_play"]);
const PAIR_BEST_GROSS  = new Set(["fourball_gross_betterball","betterball_gross_match_play"]);
const GROSS_ONLY_FMTS  = new Set(["gross_stroke_play","singles_gross_match_play",
                                   "chairman","chapman"]);
const NET_PRIMARY_FMTS = new Set(["net_stroke_play","singles_match_play",
                                   "singles_stableford_match_play"]);

const PAIR_TEAM_FMTS  = new Set([
  ...SHAMBLE_FMTS, ...PAIR_BEST_PTS, ...PAIR_BEST_NET, ...PAIR_BEST_GROSS,
  "chapman",
]);
const GROUP_TEAM_FMTS = new Set([...SCRAMBLE_FMTS, ...ALLIANCE_FMTS]);

function isTeamFmtSR(fmt: string): boolean {
  return PAIR_TEAM_FMTS.has(fmt) || GROUP_TEAM_FMTS.has(fmt);
}

function computeEventScore(
  fmt: string,
  round: any,
  holeRows: any[],
  playerRows: any[],
): { gross: number|null; net: number|null; points: number|null; holeScores: Record<string,number> } {

  // Index player holes: player_index → hole_number → row
  const ph: Record<number, Record<number, any>> = {};
  for (const p of playerRows) {
    if (!ph[p.player_index]) ph[p.player_index] = {};
    ph[p.player_index][p.hole_number] = p;
  }

  const partnerHcp  = round.partner_playing_hcp  ?? 0;
  const opp1Hcp     = round.opponent_playing_hcp  ?? 0;
  const opp2Hcp     = round.opponent2_playing_hcp ?? 0;

  let totalGross = 0, totalNet = 0, totalPoints = 0;
  const holeScores: Record<string, number> = {};

  for (const h of holeRows) {
    if (h.is_nr || h.gross_score == null) continue;
    const par = h.par ?? 4;
    const si  = h.stroke_index ?? h.hole_number;

    // Helper: stableford pts for any player at this hole
    const ptsFor = (gross: number, hcp: number) =>
      Math.max(0, par + 2 - (gross - getHA(si, hcp)));

    if (SCRAMBLE_FMTS.has(fmt)) {
      // Min gross from any player in the group
      let best = h.gross_score;
      for (let i = 0; i <= 2; i++) {
        const p = ph[i]?.[h.hole_number];
        if (p && !p.is_nr && p.gross_score != null && p.gross_score < best) best = p.gross_score;
      }
      totalGross += best;
      holeScores[h.hole_number] = best;

    } else if (SHAMBLE_FMTS.has(fmt)) {
      // Max stableford from any player in the group
      let best = h.stableford_points ?? 0;
      const companions = [
        { idx: 0, hcp: partnerHcp }, { idx: 1, hcp: opp1Hcp }, { idx: 2, hcp: opp2Hcp },
      ];
      for (const { idx, hcp } of companions) {
        const p = ph[idx]?.[h.hole_number];
        if (p && !p.is_nr && p.gross_score != null) {
          const pts = ptsFor(p.gross_score, hcp);
          if (pts > best) best = pts;
        }
      }
      totalPoints += best;
      holeScores[h.hole_number] = best;

    } else if (ALLIANCE_FMTS.has(fmt)) {
      // Sum top-N stableford per hole (N = 1/par3, 2/par4, 3/par5)
      const n = par <= 3 ? 1 : par === 4 ? 2 : 3;
      const allPts: number[] = [h.stableford_points ?? 0];
      for (const [idx, hcp] of [[0, partnerHcp],[1, opp1Hcp],[2, opp2Hcp]] as [number,number][]) {
        const p = ph[idx]?.[h.hole_number];
        if (p && !p.is_nr && p.gross_score != null) allPts.push(ptsFor(p.gross_score, hcp));
      }
      allPts.sort((a, b) => b - a);
      const holePts = allPts.slice(0, n).reduce((s, x) => s + x, 0);
      totalPoints += holePts;
      holeScores[h.hole_number] = holePts;

    } else if (PAIR_BEST_PTS.has(fmt)) {
      // Best stableford from me or partner
      const myPts = h.stableford_points ?? 0;
      const partnerRow = ph[0]?.[h.hole_number];
      const partnerPts = (partnerRow && !partnerRow.is_nr && partnerRow.gross_score != null)
        ? ptsFor(partnerRow.gross_score, partnerHcp) : 0;
      let holePts: number;
      if (fmt === "the_ghost")         holePts = Math.max(myPts, 2);
      else if (fmt === "pinehurst_points") holePts = myPts * partnerPts;
      else                              holePts = Math.max(myPts, partnerPts);
      totalPoints += holePts;
      totalGross  += h.gross_score;
      holeScores[h.hole_number] = holePts;

    } else if (PAIR_BEST_NET.has(fmt)) {
      // Best net from me or partner
      const myNet = h.net_score ?? (h.gross_score - getHA(si, round.playing_handicap ?? 0));
      const partnerRow = ph[0]?.[h.hole_number];
      const partnerNet = (partnerRow && !partnerRow.is_nr && partnerRow.gross_score != null)
        ? partnerRow.gross_score - getHA(si, partnerHcp) : myNet;
      const best = Math.min(myNet, partnerNet);
      totalNet   += best;
      totalGross += h.gross_score;
      holeScores[h.hole_number] = best;

    } else if (PAIR_BEST_GROSS.has(fmt)) {
      // Best gross from me or partner
      const partnerRow = ph[0]?.[h.hole_number];
      const partnerGross = (partnerRow && !partnerRow.is_nr && partnerRow.gross_score != null)
        ? partnerRow.gross_score : null;
      const best = partnerGross != null ? Math.min(h.gross_score, partnerGross) : h.gross_score;
      totalGross += best;
      holeScores[h.hole_number] = best;

    } else if (GROSS_ONLY_FMTS.has(fmt)) {
      totalGross += h.gross_score;
      holeScores[h.hole_number] = h.gross_score;

    } else if (NET_PRIMARY_FMTS.has(fmt)) {
      totalNet   += h.net_score ?? 0;
      totalGross += h.gross_score;
      holeScores[h.hole_number] = h.net_score ?? 0;

    } else {
      // Default: stableford
      totalPoints += h.stableford_points ?? 0;
      totalGross  += h.gross_score;
      totalNet    += h.net_score ?? 0;
      holeScores[h.hole_number] = h.stableford_points ?? 0;
    }
  }

  // Pack into result — only populate fields meaningful for this format
  if (SCRAMBLE_FMTS.has(fmt) || PAIR_BEST_GROSS.has(fmt)) {
    return { gross: totalGross || null, net: null, points: null, holeScores };
  }
  if (PAIR_BEST_NET.has(fmt)) {
    return { gross: totalGross || null, net: totalNet || null, points: null, holeScores };
  }
  if (SHAMBLE_FMTS.has(fmt) || ALLIANCE_FMTS.has(fmt) || PAIR_BEST_PTS.has(fmt)) {
    return { gross: null, net: null, points: totalPoints !== 0 ? totalPoints : null, holeScores };
  }
  if (GROSS_ONLY_FMTS.has(fmt)) {
    return { gross: totalGross || null, net: null, points: null, holeScores };
  }
  if (NET_PRIMARY_FMTS.has(fmt)) {
    return { gross: totalGross || null, net: totalNet || null, points: null, holeScores };
  }
  // Stableford / all others
  return {
    gross:  totalGross  ? totalGross  : null,
    net:    totalNet    ? totalNet    : null,
    points: totalPoints !== 0 ? totalPoints : null,
    holeScores,
  };
}

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
    // Eclectic events allow re-submission (each round updates the ringer board)
    const evInfo = round.tournament_id
      ? await row<any>("SELECT event_type FROM golf_events WHERE id = ?", [round.tournament_id])
      : null;
    const isEclectic = evInfo?.event_type === 'eclectic';
    if (round.score_submitted && !isEclectic) { res.json({ ok: true, alreadySubmitted: true }); return; }

    await run(
      "UPDATE scoring_rounds SET score_submitted = 1 WHERE id = ?",
      [roundId]
    );

    // ── Auto-write to event_scores / eclectic ringer board ───────────────────
    const eclecticImprovements: Array<{ hole: number; oldGross: number | null; newGross: number }> = [];
    let eclecticEventName: string | null = null;
    try {
      const fullRound = await row<any>("SELECT * FROM scoring_rounds WHERE id = ?", [roundId]);
      const ev = await row<any>(
        "SELECT id, club_id, format, event_type, restriction, scoring_enabled FROM golf_events WHERE id = ? AND status = 'active'",
        [round.tournament_id]
      );
      if (ev && ev.scoring_enabled && fullRound) {
        let reg = await row<any>(
          "SELECT id, division, frozen_handicap, team_id, status FROM event_registrations WHERE event_id = ? AND user_id = ? AND status = 'approved'",
          [round.tournament_id, user.id]
        );
        // Auto-register player for open / members-only events (e.g. monthly medal)
        // so their scores feed event_scores and the eclectic ringer board.
        if (!reg && ev.restriction && ['open', 'members_only'].includes(ev.restriction) && ev.knockout_type == null) {
          await exec(
            `INSERT INTO event_registrations (event_id, user_id, status, frozen_handicap)
             VALUES (?, ?, 'approved', ?)
             ON CONFLICT (event_id, user_id) DO UPDATE SET status = 'approved'`,
            [round.tournament_id, user.id, user.handicap ?? null]
          );
          reg = await row<any>(
            "SELECT id, division, frozen_handicap, team_id, status FROM event_registrations WHERE event_id = ? AND user_id = ? AND status = 'approved'",
            [round.tournament_id, user.id]
          );
        }
        if (reg) {
          const holeRows = await query<any>(
            "SELECT hole_number, par, stroke_index, gross_score, net_score, stableford_points, is_nr FROM scoring_holes WHERE round_id = ?",
            [roundId]
          );
          const playerRows = await query<any>(
            "SELECT hole_number, player_index, gross_score, is_nr FROM scoring_player_holes WHERE round_id = ?",
            [roundId]
          );

          if (ev.event_type === 'eclectic') {
            // ── Eclectic: update hole-by-hole ringer board ─────────────────
            const existing = await row<any>(
              "SELECT id, holes, holes_net, rounds_counted FROM eclectic_ringer_board WHERE event_id = ? AND user_id = ?",
              [ev.id, user.id]
            );
            const curHoles: Record<string, number> = existing?.holes
              ? (typeof existing.holes === 'string' ? JSON.parse(existing.holes) : existing.holes)
              : {};
            const curHolesNet: Record<string, number> = existing?.holes_net
              ? (typeof existing.holes_net === 'string' ? JSON.parse(existing.holes_net) : existing.holes_net)
              : {};
            const newHoles = { ...curHoles };
            const newHolesNet = { ...curHolesNet };

            for (const h of holeRows) {
              if (h.is_nr || h.gross_score == null) continue;
              const k = String(h.hole_number);
              const oldG = curHoles[k] != null ? Number(curHoles[k]) : null;
              const newG = Number(h.gross_score);
              if (oldG === null || newG < oldG) {
                eclecticImprovements.push({ hole: h.hole_number, oldGross: oldG, newGross: newG });
                newHoles[k] = newG;
              }
              if (h.net_score != null) {
                const oldN = curHolesNet[k] != null ? Number(curHolesNet[k]) : null;
                const newN = Number(h.net_score);
                if (oldN === null || newN < oldN) newHolesNet[k] = newN;
              }
            }

            const totalGross = Object.keys(newHoles).length > 0
              ? Object.values(newHoles).reduce((s, v) => s + Number(v), 0)
              : null;
            const totalNet = Object.keys(newHolesNet).length > 0
              ? Object.values(newHolesNet).reduce((s, v) => s + Number(v), 0)
              : null;
            const roundsNow = (existing?.rounds_counted ?? 0) + 1;

            const hcForBoard = fullRound.playing_handicap ?? reg.frozen_handicap ?? null;
            if (!existing) {
              await exec(
                `INSERT INTO eclectic_ringer_board
                   (event_id, user_id, holes, holes_net, total_gross, total_net,
                    rounds_counted, division, frozen_handicap)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [ev.id, user.id,
                 JSON.stringify(newHoles), JSON.stringify(newHolesNet),
                 totalGross, totalNet, roundsNow,
                 reg.division, hcForBoard]
              );
            } else {
              await exec(
                `UPDATE eclectic_ringer_board
                   SET holes = ?, holes_net = ?, total_gross = ?, total_net = ?,
                       rounds_counted = ?, frozen_handicap = ?, updated_at = NOW()
                 WHERE event_id = ? AND user_id = ?`,
                [JSON.stringify(newHoles), JSON.stringify(newHolesNet),
                 totalGross, totalNet, roundsNow, hcForBoard,
                 ev.id, user.id]
              );
            }
          } else {
            // ── Standard: write aggregated totals to event_scores ──────────
            const { gross, net, points, holeScores } = computeEventScore(
              ev.format ?? "gross_stroke_play", fullRound, holeRows, playerRows
            );

            const isTeam = isTeamFmtSR(ev.format ?? "");
            if (isTeam && reg.team_id) {
              const existing = await row<any>(
                "SELECT id FROM event_scores WHERE event_id = ? AND team_id = ? AND round = 1",
                [round.tournament_id, reg.team_id]
              );
              if (!existing) {
                await exec(
                  `INSERT INTO event_scores
                     (event_id, team_id, user_id, round,
                      gross, net, points, hole_scores, verified)
                   VALUES (?, ?, ?, 1, ?, ?, ?, ?, 0)`,
                  [round.tournament_id, reg.team_id, user.id,
                   gross, net, points, JSON.stringify(holeScores)]
                );
              }
            } else if (!isTeam) {
              const existing = await row<any>(
                "SELECT id FROM event_scores WHERE event_id = ? AND user_id = ? AND round = 1 AND team_id IS NULL",
                [round.tournament_id, user.id]
              );
              if (!existing) {
                await exec(
                  `INSERT INTO event_scores
                     (event_id, user_id, round,
                      gross, net, points, hole_scores, verified)
                   VALUES (?, ?, 1, ?, ?, ?, ?, 0)`,
                  [round.tournament_id, user.id,
                   gross, net, points, JSON.stringify(holeScores)]
                );
              }
            }

            // ── Auto-feed active eclectic ringer board ─────────────────────
            // Monthly medal (and any qualifying club tournament) automatically
            // updates the club's active eclectic competition — the best score
            // per hole from all submitted rounds builds the ringer board.
            if (ev.club_id) {
              const activeEclectic = await row<any>(
                `SELECT id, name FROM golf_events
                 WHERE club_id = ? AND event_type = 'eclectic' AND status = 'active'
                   AND scoring_enabled = 1 AND event_date <= CURRENT_DATE
                   AND COALESCE(end_date, event_date + INTERVAL '365 days') >= CURRENT_DATE
                 LIMIT 1`,
                [ev.club_id]
              );
              if (activeEclectic) {
                const existingRinger = await row<any>(
                  "SELECT id, holes, holes_net, rounds_counted FROM eclectic_ringer_board WHERE event_id = ? AND user_id = ?",
                  [activeEclectic.id, user.id]
                );
                const curHolesE: Record<string, number> = existingRinger?.holes
                  ? (typeof existingRinger.holes === 'string' ? JSON.parse(existingRinger.holes) : existingRinger.holes)
                  : {};
                const curHolesNetE: Record<string, number> = existingRinger?.holes_net
                  ? (typeof existingRinger.holes_net === 'string' ? JSON.parse(existingRinger.holes_net) : existingRinger.holes_net)
                  : {};
                const newHolesE = { ...curHolesE };
                const newHolesNetE = { ...curHolesNetE };
                for (const h of holeRows) {
                  if (h.is_nr || h.gross_score == null) continue;
                  const k = String(h.hole_number);
                  const oldG = curHolesE[k] != null ? Number(curHolesE[k]) : null;
                  const newG = Number(h.gross_score);
                  if (oldG === null || newG < oldG) {
                    eclecticImprovements.push({ hole: h.hole_number, oldGross: oldG, newGross: newG });
                    newHolesE[k] = newG;
                  }
                  if (h.net_score != null) {
                    const oldN = curHolesNetE[k] != null ? Number(curHolesNetE[k]) : null;
                    const newN = Number(h.net_score);
                    if (oldN === null || newN < oldN) newHolesNetE[k] = newN;
                  }
                }
                const totalGrossE = Object.keys(newHolesE).length > 0
                  ? Object.values(newHolesE).reduce((s, v) => s + Number(v), 0) : null;
                const totalNetE = Object.keys(newHolesNetE).length > 0
                  ? Object.values(newHolesNetE).reduce((s, v) => s + Number(v), 0) : null;
                const roundsNowE = (existingRinger?.rounds_counted ?? 0) + 1;
                const hcForEclectic = fullRound.playing_handicap ?? reg.frozen_handicap ?? null;
                if (!existingRinger) {
                  await exec(
                    `INSERT INTO eclectic_ringer_board
                       (event_id, user_id, holes, holes_net, total_gross, total_net,
                        rounds_counted, division, frozen_handicap)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [activeEclectic.id, user.id,
                     JSON.stringify(newHolesE), JSON.stringify(newHolesNetE),
                     totalGrossE, totalNetE, roundsNowE,
                     reg.division, hcForEclectic]
                  );
                } else {
                  await exec(
                    `UPDATE eclectic_ringer_board
                       SET holes = ?, holes_net = ?, total_gross = ?, total_net = ?,
                           rounds_counted = ?, frozen_handicap = ?, updated_at = NOW()
                     WHERE event_id = ? AND user_id = ?`,
                    [JSON.stringify(newHolesE), JSON.stringify(newHolesNetE),
                     totalGrossE, totalNetE, roundsNowE, hcForEclectic,
                     activeEclectic.id, user.id]
                  );
                }
                eclecticEventName = activeEclectic.name;
              }
            }
          }
        }
      }
    } catch (autoErr: any) {
      req.log?.warn({ err: autoErr }, "auto-submit to event_scores failed (non-fatal)");
    }

    res.json({ ok: true, eclecticImprovements, eclecticEventName });
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

// ─── GET /scoring/pending-marks ───────────────────────────────────────────────
// Rounds where the current user is the assigned marker but hasn't yet countersigned

router.get("/scoring/pending-marks", async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

    const marks = await query<any>(`
      SELECT sr.id, sr.tournament_id, sr.club_id, sr.total_gross, sr.holes_played,
             sr.completed_at, sr.format,
             u.name AS player_name,
             ge.name AS tournament_name,
             c.name  AS club_name
      FROM scoring_rounds sr
      JOIN users u ON u.id = sr.user_id
      LEFT JOIN golf_events ge ON ge.id = sr.tournament_id
      LEFT JOIN clubs c ON c.id = sr.club_id
      WHERE sr.marker_user_id = ?
        AND sr.score_submitted = 1
        AND sr.marker_submitted_at IS NULL
      ORDER BY sr.completed_at DESC
    `, [user.id]);

    res.json({ marks });
  } catch (err: any) {
    if (err?.message?.includes("Unauthorized")) { res.status(401).json({ message: "Unauthorized" }); return; }
    res.status(500).json({ message: "Failed to fetch pending marks" });
  }
});

// ─── POST /scoring/rounds/:roundId/marker-scores ───────────────────────────────
// Marker submits their independently recorded version of the player's hole scores.
// If all holes match the player's submitted scores → auto-verifies event_scores.verified = 1.
// If any hole differs → sets event_scores.marker_disputed = 1 for portal adjudication.

router.post("/scoring/rounds/:roundId/marker-scores", async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

    const roundId = parseInt(req.params.roundId, 10);
    if (isNaN(roundId)) { res.status(400).json({ message: "Invalid round" }); return; }

    const round = await row<any>(
      "SELECT * FROM scoring_rounds WHERE id = ? AND marker_user_id = ?",
      [roundId, user.id]
    );
    if (!round) {
      res.status(404).json({ message: "Round not found or you are not the assigned marker" }); return;
    }
    if (!round.score_submitted) {
      res.status(400).json({ message: "Player has not submitted their score yet" }); return;
    }
    if (round.marker_submitted_at) {
      res.status(400).json({ message: "Marker scores already submitted for this round" }); return;
    }

    const { holeScores } = req.body; // { "1": 4, "2": 5, … }
    if (!holeScores || typeof holeScores !== "object") {
      res.status(400).json({ message: "holeScores is required" }); return;
    }

    // Compute marker's total gross
    const markerGross = Object.values(holeScores).reduce(
      (sum: number, s: any) => sum + Number(s), 0
    );

    // Get player's submitted hole scores
    const playerHoles = await query<any>(
      "SELECT hole_number, gross_score FROM scoring_holes WHERE round_id = ? AND is_nr = 0 AND gross_score IS NOT NULL",
      [roundId]
    );

    // Compare hole-by-hole
    const mismatches: Array<{ hole: number; playerScore: number; markerScore: number }> = [];
    for (const ph of playerHoles) {
      const ms = holeScores[String(ph.hole_number)];
      if (ms !== undefined && ph.gross_score != null && Number(ms) !== Number(ph.gross_score)) {
        mismatches.push({ hole: ph.hole_number, playerScore: ph.gross_score, markerScore: Number(ms) });
      }
    }

    const verified = mismatches.length === 0;

    // Persist marker's card
    await run(
      "UPDATE scoring_rounds SET marker_hole_scores = ?, marker_gross = ?, marker_submitted_at = NOW() WHERE id = ?",
      [JSON.stringify(holeScores), markerGross, roundId]
    );

    // Update event_scores
    if (round.tournament_id) {
      if (verified) {
        await run(
          "UPDATE event_scores SET verified = 1, marker_disputed = 0 WHERE event_id = ? AND user_id = ? AND round = 1",
          [round.tournament_id, round.user_id]
        );
      } else {
        await run(
          "UPDATE event_scores SET marker_disputed = 1 WHERE event_id = ? AND user_id = ? AND round = 1",
          [round.tournament_id, round.user_id]
        );
      }
    }

    res.json({ ok: true, verified, disputed: !verified, mismatches });
  } catch (err: any) {
    if (err?.message?.includes("Unauthorized")) { res.status(401).json({ message: "Unauthorized" }); return; }
    req.log?.error({ err }, "marker scores error");
    res.status(500).json({ message: "Failed to submit marker scores" });
  }
});

// ─── Player search — used by casual-play player picker in the mobile app ─────

router.get("/scoring/players/search", async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }
    const q = String(req.query.q ?? "").trim();
    if (q.length < 2) { res.json({ players: [] }); return; }
    const players = await query<any>(
      "SELECT id, name, handicap FROM users WHERE name ILIKE ? ORDER BY name LIMIT 10",
      [`%${q}%`]
    );
    res.json({
      players: players.map((p: any) => ({
        id: p.id,
        name: p.name,
        handicap: p.handicap != null ? Number(p.handicap) : null,
        isMe: p.id === user.id,
      })),
    });
  } catch (err: any) {
    if (err?.message?.includes("Unauthorized")) { res.status(401).json({ message: "Unauthorized" }); return; }
    res.status(500).json({ message: "Failed to search players" });
  }
});

export default router;
