import { Router, type Request, type Response } from "express";
import { query, row, exec, run } from "../lib/pg";
import { requireClubAuth, getClub } from "../lib/portalAuth";
import { getUser } from "../lib/auth";
import { logger } from "../lib/logger";
import { sendPushNotifications } from "../lib/notifications";
import { saveUserNotification } from "../lib/userNotifications";

const router = Router();

// ── Notify club that bracket is ready to generate ─────────────────────────────
// Sets bracket_ready_notified_at once (idempotent). Called from both the
// pair-confirm endpoint (all members paired) and the pairing-deadline worker.
async function markBracketReady(evId: number, reason: "all_paired" | "deadline_passed"): Promise<void> {
  const ev = await row<any>("SELECT bracket_ready_notified_at FROM golf_events WHERE id = ?", [evId]);
  if (ev?.bracket_ready_notified_at) return;
  await run("UPDATE golf_events SET bracket_ready_notified_at = NOW() WHERE id = ?", [evId]);
  logger.info({ evId, reason }, "Knockout: bracket_ready_notified_at set");
}

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

// ── Auto-advance a match that has exactly one player and all feeders are done ──
// Called after any match completes (walkover or normal). Recurses up the bracket.
async function autoAdvanceIfUnopposed(evId: number, matchId: number): Promise<void> {
  const match = await row<any>("SELECT * FROM knockout_matches WHERE id = ? AND event_id = ?", [matchId, evId]);
  if (!match || match.status === "complete" || match.status === "bye") return;

  const hasP1 = !!match.player1_id;
  const hasP2 = !!match.player2_id;
  if ((hasP1 && hasP2) || (!hasP1 && !hasP2)) return; // normal match or no players yet

  // Check that every feeder match for this slot is already complete (so player2/1 will never arrive)
  const feeders = await query<any>(
    "SELECT status FROM knockout_matches WHERE next_match_id = ? AND event_id = ?",
    [matchId, evId]
  );
  if (!feeders.every((f: any) => f.status === "complete" || f.status === "bye")) return;

  // Lone player — walk them through as automatic winner
  const lonePlayerId = hasP1 ? match.player1_id : match.player2_id;

  await run(
    "UPDATE knockout_matches SET winner_id = ?, status = 'complete', player1_result = NULL, player2_result = NULL WHERE id = ?",
    [lonePlayerId, matchId]
  );

  // Advance into the next match
  if (match.next_match_id) {
    const nxt = await row<any>("SELECT * FROM knockout_matches WHERE id = ?", [match.next_match_id]);
    if (nxt) {
      const field = match.slot_position === "bottom" ? "player2_id" : "player1_id";
      await run(`UPDATE knockout_matches SET ${field} = ? WHERE id = ?`, [lonePlayerId, match.next_match_id]);
      // Recurse — the next match may also now be unopposed
      await autoAdvanceIfUnopposed(evId, match.next_match_id);
    }
  }

  // Mark round complete if all matches in this round are now done
  const roundMatches = await query<any>("SELECT status FROM knockout_matches WHERE round_id = ?", [match.round_id]);
  if (roundMatches.every((m: any) => m.status === "complete" || m.status === "bye")) {
    await run("UPDATE knockout_rounds SET is_complete = 1 WHERE id = ?", [match.round_id]);
  }
}

// ── List knockout tournaments ─────────────────────────────────────────────────
router.get("/portal/knockout", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);

  const events = await query<any>(
    `SELECT ge.*,
            ge.bracket_ready_notified_at,
            (SELECT COUNT(*) FROM club_members cm WHERE cm.club_id = ge.club_id AND cm.status = 'active') AS member_count,
            (SELECT COUNT(*) FROM knockout_rounds kr WHERE kr.event_id = ge.id) AS round_count,
            (SELECT kr2.label FROM knockout_rounds kr2 WHERE kr2.event_id = ge.id
             AND EXISTS (SELECT 1 FROM knockout_matches km2 WHERE km2.round_id = kr2.id AND km2.status NOT IN ('complete','bye'))
             ORDER BY kr2.round_number ASC LIMIT 1) AS current_round_label,
            (SELECT COUNT(*) FROM event_teams et WHERE et.event_id = ge.id AND et.status = 'confirmed'
             AND (SELECT COUNT(*) FROM event_registrations er WHERE er.team_id = et.id AND er.event_id = ge.id) = 2) AS pair_count
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
  const { name, event_date, end_date, knockout_type = "individual", draw_method = "random", description, pairing_deadline, singles_entry_deadline } = req.body ?? {};

  if (!name?.trim()) { res.status(400).json({ message: "Name is required" }); return; }
  if (!knockout_type) { res.status(400).json({ message: "Format is required" }); return; }
  if (knockout_type === "team" && !pairing_deadline) {
    res.status(400).json({ message: "Partner selection deadline is required for Betterball tournaments" }); return;
  }

  const format = knockout_type === "team" ? "knockout_team" : "knockout_individual";

  const id = await exec(
    `INSERT INTO golf_events
       (club_id, name, description, event_date, end_date, format, knockout_type, knockout_draw_method,
        knockout_pairing_deadline, singles_entry_deadline, status, scoring_enabled, entries_required, payment_required, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, 0, 0, ?)`,
    [club.id, name.trim(), description?.trim() ?? null, event_date || null, end_date || null,
     format, knockout_type, draw_method, pairing_deadline || null, singles_entry_deadline || null, club.id]
  );

  // For singles with entry deadline: create pending registrations for all active members now
  if (knockout_type !== "team" && singles_entry_deadline) {
    const members = await query<any>(
      `SELECT u.id FROM club_members cm JOIN users u ON u.id = cm.user_id WHERE cm.club_id = ? AND cm.status = 'active'`,
      [club.id]
    );
    for (const m of members) {
      await exec(
        `INSERT INTO event_registrations (event_id, user_id, status) VALUES (?, ?, 'pending') ON CONFLICT DO NOTHING`,
        [id, m.id]
      );
    }
  }

  // Notify all active club members — knockouts go straight to 'active' so there
  // is no separate publish step. Mirror the same logic as the regular publish route.
  try {
    const audience = await query<any>(
      `SELECT DISTINCT u.id, u.push_token
       FROM users u
       JOIN club_members cm ON cm.user_id = u.id AND cm.club_id = ? AND cm.status = 'active'
       LIMIT 500`,
      [club.id]
    );
    if (audience.length > 0) {
      const evDate = event_date ? new Date(event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }) : "";
      const notifTitle = `⛳ Tournament Now Open — ${club.name}`;
      const isBetterball = knockout_type === "team";
      const deadlineStr  = pairing_deadline
        ? ` before ${new Date(pairing_deadline).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}`
        : "";
      const entryDeadlineStr = singles_entry_deadline
        ? ` by ${new Date(singles_entry_deadline).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}`
        : "";
      const notifBody = isBetterball
        ? `${name.trim()}${evDate ? ` · ${evDate}` : ""}. Betterball Knockout — open the app to choose your partner${deadlineStr}.`
        : singles_entry_deadline
          ? `${name.trim()}${evDate ? ` · ${evDate}` : ""}. Singles Knockout — accept your spot or opt out${entryDeadlineStr}.`
          : `${name.trim()}${evDate ? ` · ${evDate}` : ""}. Tap to view & enter.`;
      const notifType = isBetterball ? "knockout_pair_request" : "event_published";
      const pushAudience = audience.filter((u: any) => u.push_token);
      if (pushAudience.length > 0) {
        sendPushNotifications(pushAudience.map((u: any) => ({
          to: u.push_token, sound: "default", title: notifTitle, body: notifBody,
          data: { type: notifType, event_id: id, club_id: club.id },
        })));
      }
      for (const u of audience) {
        saveUserNotification(u.id, notifType, notifTitle, notifBody, { event_id: id, club_id: club.id });
      }
    }
  } catch (err) {
    logger.warn({ err }, "Knockout creation: failed to send member notifications");
  }

  res.json({ id });
});

// ── Member: singles knockout entry status ─────────────────────────────────────
router.get("/knockout/:id/entry-status", async (req: Request, res: Response): Promise<void> => {
  const evId = Number(req.params.id);
  const ev = await row<any>(
    "SELECT id, singles_entry_deadline FROM golf_events WHERE id = ? AND format = 'knockout_individual' AND status = 'active'",
    [evId]
  );
  if (!ev) { res.status(404).json({ message: "Tournament not found" }); return; }

  if (!ev.singles_entry_deadline) {
    res.json({ enrolled: false, status: "none", entry_deadline: null });
    return;
  }

  let user: any = null;
  try { user = await getUser(req); } catch { /* unauthenticated */ }
  if (!user) { res.json({ enrolled: false, status: "none", entry_deadline: ev.singles_entry_deadline }); return; }

  const reg = await row<any>(
    "SELECT status FROM event_registrations WHERE event_id = ? AND user_id = ? AND team_id IS NULL",
    [evId, user.id]
  );

  res.json({
    enrolled: !!reg,
    status: reg ? (reg.status === "approved" ? "accepted" : "pending") : "none",
    entry_deadline: ev.singles_entry_deadline,
  });
});

// ── Member: accept singles knockout entry ──────────────────────────────────────
router.post("/knockout/:id/accept", async (req: Request, res: Response): Promise<void> => {
  const evId = Number(req.params.id);
  let user: any;
  try { user = await getUser(req); } catch { res.status(401).json({ message: "Unauthorised" }); return; }

  const ev = await row<any>(
    "SELECT id, name, singles_entry_deadline FROM golf_events WHERE id = ? AND format = 'knockout_individual' AND status = 'active'",
    [evId]
  );
  if (!ev) { res.status(404).json({ message: "Tournament not found" }); return; }

  const reg = await row<any>(
    "SELECT id, status FROM event_registrations WHERE event_id = ? AND user_id = ? AND team_id IS NULL",
    [evId, user.id]
  );
  if (!reg) { res.status(404).json({ message: "You are not entered in this tournament" }); return; }
  if (reg.status === "approved") { res.json({ ok: true, status: "accepted" }); return; }

  await run(
    "UPDATE event_registrations SET status = 'approved' WHERE event_id = ? AND user_id = ? AND team_id IS NULL",
    [evId, user.id]
  );
  res.json({ ok: true, status: "accepted" });
});

// ── Member: opt out of singles knockout ───────────────────────────────────────
router.delete("/knockout/:id/entry", async (req: Request, res: Response): Promise<void> => {
  const evId = Number(req.params.id);
  let user: any;
  try { user = await getUser(req); } catch { res.status(401).json({ message: "Unauthorised" }); return; }

  await run(
    "DELETE FROM event_registrations WHERE event_id = ? AND user_id = ? AND team_id IS NULL",
    [evId, user.id]
  );
  res.json({ ok: true });
});

// ── Member: opt out of betterball knockout ────────────────────────────────────
router.post("/knockout/:id/betterball-optout", async (req: Request, res: Response): Promise<void> => {
  const evId = Number(req.params.id);
  let user: any;
  try { user = await getUser(req); } catch { res.status(401).json({ message: "Unauthorised" }); return; }

  const ev = await row<any>(
    "SELECT id FROM golf_events WHERE id = ? AND format = 'knockout_team' AND status = 'active'",
    [evId]
  );
  if (!ev) { res.status(404).json({ message: "Tournament not found" }); return; }

  // Must not already be in a pair (team-linked registration)
  const teamReg = await row<any>(
    "SELECT id FROM event_registrations WHERE event_id = ? AND user_id = ? AND team_id IS NOT NULL",
    [evId, user.id]
  );
  if (teamReg) { res.status(400).json({ message: "Remove your current pairing before opting out" }); return; }

  // Upsert opted_out record (idempotent)
  await run(
    "DELETE FROM event_registrations WHERE event_id = ? AND user_id = ? AND team_id IS NULL",
    [evId, user.id]
  );
  await exec(
    "INSERT INTO event_registrations (event_id, user_id, status) VALUES (?, ?, 'opted_out')",
    [evId, user.id]
  );
  res.json({ ok: true });
});

// ── Member: undo betterball opt-out ───────────────────────────────────────────
router.delete("/knockout/:id/betterball-optout", async (req: Request, res: Response): Promise<void> => {
  const evId = Number(req.params.id);
  let user: any;
  try { user = await getUser(req); } catch { res.status(401).json({ message: "Unauthorised" }); return; }

  await run(
    "DELETE FROM event_registrations WHERE event_id = ? AND user_id = ? AND team_id IS NULL AND status = 'opted_out'",
    [evId, user.id]
  );
  res.json({ ok: true });
});

// ── Delete knockout tournament ────────────────────────────────────────────────
router.patch("/portal/knockout/:id", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const evId = Number(req.params.id);

  const ev = await row<any>(
    "SELECT id, knockout_type FROM golf_events WHERE id = ? AND club_id = ? AND (format = 'knockout_individual' OR format = 'knockout_team')",
    [evId, club.id]
  );
  if (!ev) { res.status(404).json({ message: "Tournament not found" }); return; }

  const { name, description, event_date, end_date, draw_method, pairing_deadline, singles_entry_deadline } = req.body ?? {};

  if (!name?.trim()) { res.status(400).json({ message: "Name is required" }); return; }
  if (ev.knockout_type === "team" && pairing_deadline === "") {
    res.status(400).json({ message: "Partner selection deadline is required for Betterball tournaments" }); return;
  }

  await run(
    `UPDATE golf_events SET
       name = ?, description = ?, event_date = ?, end_date = ?,
       knockout_draw_method = ?, knockout_pairing_deadline = ?,
       singles_entry_deadline = ?
     WHERE id = ?`,
    [
      name.trim(),
      description?.trim() || null,
      event_date || null,
      end_date || null,
      draw_method || "random",
      ev.knockout_type === "team" ? (pairing_deadline || null) : null,
      ev.knockout_type !== "team" ? (singles_entry_deadline || null) : null,
      evId,
    ]
  );

  const updated = await row<any>(
    `SELECT ge.id, ge.name, ge.description, ge.event_date, ge.end_date, ge.format,
            ge.knockout_type, ge.knockout_draw_method, ge.knockout_pairing_deadline,
            ge.singles_entry_deadline, ge.bracket_ready_notified_at, ge.status,
            ge.created_at,
            COUNT(DISTINCT CASE WHEN cm.status = 'active' THEN cm.user_id END) AS member_count,
            (SELECT COUNT(DISTINCT et.id) FROM event_teams et
             JOIN event_registrations er1 ON er1.team_id = et.id AND er1.event_id = ge.id
             WHERE et.status = 'confirmed') AS pair_count,
            (SELECT COUNT(*) FROM knockout_rounds kr WHERE kr.event_id = ge.id) AS round_count,
            NULL AS current_round_label
     FROM golf_events ge
     LEFT JOIN club_members cm ON cm.club_id = ge.club_id
     WHERE ge.id = ?
     GROUP BY ge.id`,
    [evId]
  );

  res.json(updated);
});

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

// ── Portal: list pairs for a betterball tournament ────────────────────────────
router.get("/portal/knockout/:id/pairs", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const evId = Number(req.params.id);
  const ev = await row<any>("SELECT id, knockout_type, knockout_pairing_deadline FROM golf_events WHERE id = ? AND club_id = ?", [evId, club.id]);
  if (!ev) { res.status(404).json({ message: "Tournament not found" }); return; }

  const allPairs = await query<any>(
    `SELECT et.id as team_id, et.status as team_status,
            u1.id as p1_id, u1.name as p1_name,
            u2.id as p2_id, u2.name as p2_name
     FROM event_teams et
     JOIN event_registrations er1 ON er1.team_id = et.id AND er1.event_id = ?
     JOIN event_registrations er2 ON er2.team_id = et.id AND er2.event_id = ? AND er2.user_id != er1.user_id
     JOIN users u1 ON u1.id = er1.user_id
     JOIN users u2 ON u2.id = er2.user_id
     WHERE et.event_id = ? AND er1.user_id < er2.user_id
     ORDER BY et.status ASC, et.id ASC`,
    [evId, evId, evId]
  );

  const confirmedPairs = allPairs.filter((p: any) => p.team_status === "confirmed");
  const pendingPairs   = allPairs.filter((p: any) => p.team_status === "pending");
  const pairedIds = new Set(allPairs.flatMap((p: any) => [p.p1_id, p.p2_id]));

  const allMembers = await query<any>(
    `SELECT u.id, u.name FROM club_members cm JOIN users u ON u.id = cm.user_id
     WHERE cm.club_id = ? AND cm.status = 'active' ORDER BY u.name ASC`,
    [club.id]
  );

  // Members who explicitly opted out of this betterball tournament
  const optedOutRows = await query<any>(
    `SELECT u.id, u.name FROM event_registrations er
     JOIN users u ON u.id = er.user_id
     WHERE er.event_id = ? AND er.team_id IS NULL AND er.status = 'opted_out'
     ORDER BY u.name ASC`,
    [evId]
  );
  const optedOutIds = new Set(optedOutRows.map((m: any) => m.id));

  // Unpaired = active members not in a pair AND not opted out
  const unpaired = allMembers.filter((m: any) => !pairedIds.has(m.id) && !optedOutIds.has(m.id));

  res.json({ pairs: confirmedPairs, pending_requests: pendingPairs, unpaired, opted_out: optedOutRows, pairing_deadline: ev.knockout_pairing_deadline ?? null });
});

// ── Portal: singles entry phase status ────────────────────────────────────────
router.get("/portal/knockout/:id/entries", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const evId = Number(req.params.id);
  const ev = await row<any>(
    "SELECT id, singles_entry_deadline FROM golf_events WHERE id = ? AND club_id = ? AND format = 'knockout_individual'",
    [evId, club.id]
  );
  if (!ev) { res.status(404).json({ message: "Tournament not found" }); return; }

  const registrations = await query<any>(
    `SELECT er.status, u.id, u.name
     FROM event_registrations er
     JOIN users u ON u.id = er.user_id
     WHERE er.event_id = ? AND er.team_id IS NULL
     ORDER BY u.name ASC`,
    [evId]
  );

  const registeredIds = new Set(registrations.map((r: any) => r.id));
  const allMembers = await query<any>(
    `SELECT u.id, u.name FROM club_members cm JOIN users u ON u.id = cm.user_id
     WHERE cm.club_id = ? AND cm.status = 'active' ORDER BY u.name ASC`,
    [club.id]
  );

  const accepted  = registrations.filter((r: any) => r.status === "approved");
  const pending   = registrations.filter((r: any) => r.status === "pending");
  const opted_out = allMembers.filter((m: any) => !registeredIds.has(m.id));

  res.json({ accepted, pending, opted_out, entry_deadline: ev.singles_entry_deadline });
});

// ── Member: get own pair status ────────────────────────────────────────────────
router.get("/knockout/:id/pair-status", async (req: Request, res: Response): Promise<void> => {
  const evId = Number(req.params.id);
  const user = await getUser(req).catch(() => null);
  if (!user) { res.status(401).json({ message: "Unauthorised" }); return; }

  const ev = await row<any>("SELECT id, knockout_type, knockout_pairing_deadline FROM golf_events WHERE id = ?", [evId]);
  if (!ev) { res.status(404).json({ message: "Tournament not found" }); return; }

  const reg = await row<any>(
    `SELECT er.team_id, et.status as team_status, et.requested_by, et.club_assigned,
            u.id as partner_id, u.name as partner_name
     FROM event_registrations er
     JOIN event_teams et ON et.id = er.team_id
     LEFT JOIN event_registrations er2 ON er2.team_id = er.team_id AND er2.event_id = er.event_id AND er2.user_id != er.user_id
     LEFT JOIN users u ON u.id = er2.user_id
     WHERE er.event_id = ? AND er.user_id = ?`,
    [evId, user.id]
  );

  if (!reg) {
    // Check if member has opted out
    const optout = await row<any>(
      "SELECT id FROM event_registrations WHERE event_id = ? AND user_id = ? AND team_id IS NULL AND status = 'opted_out'",
      [evId, user.id]
    );
    res.json({ paired: false, request_state: "none", team_id: null, partner: null, pairing_deadline: ev.knockout_pairing_deadline ?? null, club_assigned: false, opted_out: !!optout });
    return;
  }

  const request_state = reg.team_status === "confirmed"
    ? "confirmed"
    : reg.requested_by === user.id
      ? "pending_sent"
      : "pending_received";

  res.json({
    paired: reg.team_status === "confirmed",
    request_state,
    team_id: reg.team_id,
    partner: reg.partner_id ? { id: reg.partner_id, name: reg.partner_name } : null,
    pairing_deadline: ev.knockout_pairing_deadline ?? null,
    club_assigned: reg.club_assigned === 1 || reg.club_assigned === true,
    opted_out: false,
  });
});

// ── Member: send a partner request (creates a pending pair) ───────────────────
router.post("/knockout/:id/pair", async (req: Request, res: Response): Promise<void> => {
  const evId = Number(req.params.id);
  const user = await getUser(req).catch(() => null);
  if (!user) { res.status(401).json({ message: "Unauthorised" }); return; }

  const { partner_id } = req.body ?? {};
  if (!partner_id || partner_id === user.id) { res.status(400).json({ message: "Valid partner_id required" }); return; }

  const ev = await row<any>(
    "SELECT id, club_id, name, knockout_pairing_deadline FROM golf_events WHERE id = ? AND format = 'knockout_team'",
    [evId]
  );
  if (!ev) { res.status(404).json({ message: "Tournament not found" }); return; }

  const userMember    = await row<any>("SELECT id FROM club_members WHERE user_id = ? AND club_id = ? AND status = 'active'", [user.id, ev.club_id]);
  const partnerMember = await row<any>("SELECT id FROM club_members WHERE user_id = ? AND club_id = ? AND status = 'active'", [partner_id, ev.club_id]);
  if (!userMember || !partnerMember) { res.status(400).json({ message: "Both players must be active members of this club" }); return; }

  const existingUser    = await row<any>("SELECT id FROM event_registrations WHERE event_id = ? AND user_id = ? AND team_id IS NOT NULL", [evId, user.id]);
  const existingPartner = await row<any>("SELECT id FROM event_registrations WHERE event_id = ? AND user_id = ? AND team_id IS NOT NULL", [evId, partner_id]);
  if (existingUser)    { res.status(400).json({ message: "You already have a pairing in this tournament" }); return; }
  if (existingPartner) { res.status(400).json({ message: "That player already has a pairing request in this tournament" }); return; }

  // Clear any existing opt-out records for both players before creating the pair
  await run("DELETE FROM event_registrations WHERE event_id = ? AND user_id = ? AND team_id IS NULL", [evId, user.id]);
  await run("DELETE FROM event_registrations WHERE event_id = ? AND user_id = ? AND team_id IS NULL", [evId, partner_id]);

  const partnerUser = await row<any>("SELECT id, name, push_token FROM users WHERE id = ?", [partner_id]);
  if (!partnerUser) { res.status(404).json({ message: "Partner not found" }); return; }

  // Create team as PENDING — partner must confirm before it becomes 'confirmed'
  const teamId = await exec(
    "INSERT INTO event_teams (event_id, status, requested_by) VALUES (?, 'pending', ?)",
    [evId, user.id]
  );
  await exec("INSERT INTO event_registrations (event_id, user_id, status, team_id) VALUES (?, ?, 'approved', ?)", [evId, user.id, teamId]);
  await exec("INSERT INTO event_registrations (event_id, user_id, status, team_id) VALUES (?, ?, 'approved', ?)", [evId, partner_id, teamId]);

  // Notify partner: confirm or deny
  try {
    const title = `🤝 Partner Request — ${ev.name}`;
    const body  = `${user.name} wants to be your Betterball partner. Open the app to confirm or deny.`;
    const data  = { type: "knockout_pair_request", event_id: evId };
    if (partnerUser.push_token?.startsWith("ExponentPushToken[")) {
      sendPushNotifications([{ to: partnerUser.push_token, sound: "default", title, body, data }]);
    }
    saveUserNotification(partner_id, "knockout_pair_request", title, body, data);
  } catch (err) { logger.warn({ err }, "Knockout pair: failed to notify partner"); }

  res.status(201).json({ ok: true, team_id: teamId, request_state: "pending_sent" });
});

// ── Member: confirm a received partner request ─────────────────────────────────
router.post("/knockout/:id/pair/confirm", async (req: Request, res: Response): Promise<void> => {
  const evId = Number(req.params.id);
  const user = await getUser(req).catch(() => null);
  if (!user) { res.status(401).json({ message: "Unauthorised" }); return; }

  const reg = await row<any>(
    `SELECT er.team_id, et.status as team_status, et.requested_by,
            req_u.id as requester_id, req_u.name as requester_name, req_u.push_token as requester_token
     FROM event_registrations er
     JOIN event_teams et ON et.id = er.team_id
     JOIN users req_u ON req_u.id = et.requested_by
     WHERE er.event_id = ? AND er.user_id = ?`,
    [evId, user.id]
  );
  if (!reg) { res.status(404).json({ message: "No pending partner request found" }); return; }
  if (reg.team_status === "confirmed") { res.status(400).json({ message: "Pair already confirmed" }); return; }
  if (reg.requested_by === user.id) { res.status(400).json({ message: "You cannot confirm your own request" }); return; }

  await run("UPDATE event_teams SET status = 'confirmed' WHERE id = ?", [reg.team_id]);

  const ev = await row<any>("SELECT name, club_id FROM golf_events WHERE id = ?", [evId]);
  try {
    const title = `🏌️ You're in the draw! — ${ev?.name ?? "Betterball Knockout"}`;
    const body  = `You and ${reg.requester_name} are confirmed Betterball partners!`;
    const data  = { type: "event_published", event_id: evId };
    if (reg.requester_token?.startsWith("ExponentPushToken[")) {
      sendPushNotifications([{ to: reg.requester_token, sound: "default", title, body, data }]);
    }
    saveUserNotification(reg.requester_id, "event_published", title, body, data);
    saveUserNotification(user.id, "event_published", title, body, data);
  } catch (err) { logger.warn({ err }, "Knockout pair confirm: failed to notify"); }

  // Check if all active club members are now paired — if so, flag bracket as ready
  try {
    const unpaired = await row<any>(
      `SELECT COUNT(*) AS n
       FROM club_members cm
       WHERE cm.club_id = ? AND cm.status = 'active'
         AND cm.user_id NOT IN (
           SELECT er.user_id FROM event_registrations er WHERE er.event_id = ?
         )`,
      [ev?.club_id, evId]
    );
    if (parseInt(unpaired?.n ?? "1") === 0) {
      await markBracketReady(evId, "all_paired");
    }
  } catch (err) { logger.warn({ err }, "Knockout pair confirm: bracket-ready check failed"); }

  res.json({ ok: true, request_state: "confirmed" });
});

// ── Member: deny a received partner request ────────────────────────────────────
router.post("/knockout/:id/pair/deny", async (req: Request, res: Response): Promise<void> => {
  const evId = Number(req.params.id);
  const user = await getUser(req).catch(() => null);
  if (!user) { res.status(401).json({ message: "Unauthorised" }); return; }

  const reg = await row<any>(
    `SELECT er.team_id, et.status as team_status, et.requested_by,
            req_u.id as requester_id, req_u.name as requester_name, req_u.push_token as requester_token
     FROM event_registrations er
     JOIN event_teams et ON et.id = er.team_id
     JOIN users req_u ON req_u.id = et.requested_by
     WHERE er.event_id = ? AND er.user_id = ?`,
    [evId, user.id]
  );
  if (!reg) { res.status(404).json({ message: "No pending partner request found" }); return; }
  if (reg.team_status === "confirmed") { res.status(400).json({ message: "Cannot deny an already-confirmed pair" }); return; }
  if (reg.requested_by === user.id) { res.status(400).json({ message: "You cannot deny your own request — use DELETE to cancel" }); return; }

  await run("DELETE FROM event_registrations WHERE team_id = ? AND event_id = ?", [reg.team_id, evId]);
  await run("DELETE FROM event_teams WHERE id = ?", [reg.team_id]);

  const ev = await row<any>("SELECT name FROM golf_events WHERE id = ?", [evId]);
  try {
    const title = `Partner request declined — ${ev?.name ?? "Betterball Knockout"}`;
    const body  = `${user.name} declined your partner request. Open the app to choose a new partner.`;
    const data  = { type: "knockout_pair_request", event_id: evId };
    if (reg.requester_token?.startsWith("ExponentPushToken[")) {
      sendPushNotifications([{ to: reg.requester_token, sound: "default", title, body, data }]);
    }
    saveUserNotification(reg.requester_id, "knockout_pair_request", title, body, data);
  } catch (err) { logger.warn({ err }, "Knockout pair deny: failed to notify requester"); }

  res.json({ ok: true, request_state: "none" });
});

// ── Member: cancel own pair request, remove confirmed pair, or opt out of club-assigned pair ──
router.delete("/knockout/:id/pair", async (req: Request, res: Response): Promise<void> => {
  const evId = Number(req.params.id);
  const user = await getUser(req).catch(() => null);
  if (!user) { res.status(401).json({ message: "Unauthorised" }); return; }

  const reg = await row<any>(
    `SELECT er.team_id, et.club_assigned, et.status AS team_status,
            er2.user_id AS partner_id, u2.name AS partner_name, u2.push_token AS partner_token,
            ge.name AS event_name
     FROM event_registrations er
     JOIN event_teams et ON et.id = er.team_id
     JOIN golf_events ge ON ge.id = er.event_id
     LEFT JOIN event_registrations er2 ON er2.team_id = er.team_id AND er2.event_id = er.event_id AND er2.user_id != er.user_id
     LEFT JOIN users u2 ON u2.id = er2.user_id
     WHERE er.event_id = ? AND er.user_id = ?`,
    [evId, user.id]
  );
  if (!reg) { res.status(404).json({ message: "No pairing found" }); return; }

  await run("DELETE FROM event_registrations WHERE team_id = ? AND event_id = ?", [reg.team_id, evId]);
  await run("DELETE FROM event_teams WHERE id = ?", [reg.team_id]);

  // Notify partner if this was a club-assigned confirmed pair being opted out of
  if ((reg.club_assigned === 1 || reg.club_assigned === true) && reg.team_status === "confirmed" && reg.partner_id) {
    try {
      const title = `Pairing dissolved — ${reg.event_name}`;
      const body  = `${user.name} has opted out of your club-assigned Betterball pairing. You are currently unpaired for this tournament.`;
      const data  = { type: "knockout_pair_request", event_id: evId };
      saveUserNotification(reg.partner_id, "knockout_pair_request", title, body, data);
      if (reg.partner_token?.startsWith("ExponentPushToken[")) {
        sendPushNotifications([{ to: reg.partner_token, sound: "default", title, body, data }]);
      }
    } catch (err) { logger.warn({ err }, "Knockout opt-out: failed to notify partner"); }
  }

  res.json({ ok: true });
});

// ── Club: randomly pair all remaining unpaired members ────────────────────────
router.post("/portal/knockout/:id/auto-pair", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const evId = Number(req.params.id);

  const ev = await row<any>(
    "SELECT id, name, club_id FROM golf_events WHERE id = ? AND club_id = ? AND format = 'knockout_team'",
    [evId, club.id]
  );
  if (!ev) { res.status(404).json({ message: "Tournament not found" }); return; }

  // Fetch all unpaired active club members in random order
  const unpaired = await query<any>(
    `SELECT u.id, u.name, u.push_token
     FROM club_members cm
     JOIN users u ON u.id = cm.user_id
     WHERE cm.club_id = ? AND cm.status = 'active'
       AND u.id NOT IN (SELECT er.user_id FROM event_registrations er WHERE er.event_id = ?)
     ORDER BY RANDOM()`,
    [club.id, evId]
  );

  if (unpaired.length < 2) {
    res.json({ pairs_created: 0, left_out: unpaired.length });
    return;
  }

  let pairsCreated = 0;
  const errors: string[] = [];

  for (let i = 0; i + 1 < unpaired.length; i += 2) {
    const playerA = unpaired[i];
    const playerB = unpaired[i + 1];
    try {
      const teamId = await exec(
        "INSERT INTO event_teams (event_id, status, requested_by, club_assigned) VALUES (?, 'confirmed', NULL, 1)",
        [evId]
      );
      await exec(
        "INSERT INTO event_registrations (event_id, user_id, status, team_id) VALUES (?, ?, 'approved', ?)",
        [evId, playerA.id, teamId]
      );
      await exec(
        "INSERT INTO event_registrations (event_id, user_id, status, team_id) VALUES (?, ?, 'approved', ?)",
        [evId, playerB.id, teamId]
      );

      // Notify both players of their assigned partner
      const title = `🤝 Partner Assigned — ${ev.name}`;
      const data  = { type: "knockout_pair_request", event_id: evId };
      const bodyA = `${playerB.name} has been assigned as your Betterball partner by the club. Open the app to view your pairing or opt out.`;
      const bodyB = `${playerA.name} has been assigned as your Betterball partner by the club. Open the app to view your pairing or opt out.`;

      saveUserNotification(playerA.id, "knockout_pair_request", title, bodyA, data);
      saveUserNotification(playerB.id, "knockout_pair_request", title, bodyB, data);
      if (playerA.push_token?.startsWith("ExponentPushToken[")) {
        sendPushNotifications([{ to: playerA.push_token, sound: "default", title, body: bodyA, data }]);
      }
      if (playerB.push_token?.startsWith("ExponentPushToken[")) {
        sendPushNotifications([{ to: playerB.push_token, sound: "default", title, body: bodyB, data }]);
      }

      pairsCreated++;
    } catch (err: any) {
      logger.error({ err, a: playerA.id, b: playerB.id }, "Auto-pair: failed to create pair");
      errors.push(`${playerA.name} + ${playerB.name}`);
    }
  }

  const leftOut = unpaired.length % 2 !== 0 ? 1 : 0;
  res.json({ pairs_created: pairsCreated, left_out: leftOut, errors });
});

// ── Generate bracket (singles: all active members · betterball: from pairs) ───
router.post("/portal/knockout/:id/generate", requireClubAuth, async (req: Request, res: Response): Promise<void> => {
  const club = getClub(req);
  const evId = Number(req.params.id);

  const ev = await row<any>(
    "SELECT * FROM golf_events WHERE id = ? AND club_id = ? AND (format = 'knockout_individual' OR format = 'knockout_team')",
    [evId, club.id]
  );
  if (!ev) { res.status(404).json({ message: "Tournament not found" }); return; }

  const { draw_method = ev.knockout_draw_method ?? "random", round_deadlines = [] } = req.body ?? {};

  // ── Participant list: betterball uses paired teams; singles uses all members ─
  let members: Array<{ user_id: number; name: string; handicap: number | null }>;

  if (ev.knockout_type === "team") {
    // For betterball, only complete pairs (2 registrations per team) enter the draw.
    // The "participant" is the team captain (first-registered member); partner info
    // is resolved at query time via event_registrations JOINs in the bracket GET.
    const teams = await query<any>(
      `SELECT DISTINCT ON (et.id) et.id as team_id, er.user_id as user_id, u.name, u.handicap
       FROM event_teams et
       JOIN event_registrations er ON er.team_id = et.id AND er.event_id = ?
       JOIN users u ON u.id = er.user_id
       WHERE et.event_id = ? AND et.status = 'confirmed'
         AND (SELECT COUNT(*) FROM event_registrations er2 WHERE er2.team_id = et.id AND er2.event_id = ?) = 2
       ORDER BY et.id ASC, er.id ASC`,
      [evId, evId, evId]
    );
    if (teams.length < 2) {
      res.status(400).json({ message: "Need at least 2 confirmed pairs to generate a betterball bracket. Make sure members have chosen and confirmed their partners first." });
      return;
    }
    members = teams;
  } else {
    // Singles: if entry deadline configured, use only registered (non-opted-out) members
    if (ev.singles_entry_deadline) {
      members = await query<any>(
        `SELECT u.id as user_id, u.name, u.handicap
         FROM event_registrations er
         JOIN users u ON u.id = er.user_id
         WHERE er.event_id = ? AND er.status IN ('pending', 'approved') AND er.team_id IS NULL
         ORDER BY er.created_at ASC`,
        [evId]
      );
    } else {
      // No entry phase: all active club members are in the draw
      members = await query<any>(
        `SELECT u.id as user_id, u.name, u.handicap
         FROM club_members cm
         JOIN users u ON u.id = cm.user_id
         WHERE cm.club_id = ? AND cm.status = 'active'
         ORDER BY cm.created_at ASC`,
        [club.id]
      );
    }
    if (members.length < 2) {
      res.status(400).json({ message: "Need at least 2 members entered to generate a bracket" });
      return;
    }
  }

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
            w.name as winner_name,
            p1partner.id   as player1_partner_id,   p1partner.name as player1_partner_name,
            p2partner.id   as player2_partner_id,   p2partner.name as player2_partner_name,
            p1t.name       as player1_team_name,
            p2t.name       as player2_team_name
     FROM knockout_matches km
     LEFT JOIN users p1 ON p1.id = km.player1_id
     LEFT JOIN users p2 ON p2.id = km.player2_id
     LEFT JOIN users w  ON w.id  = km.winner_id
     LEFT JOIN event_registrations p1reg ON p1reg.user_id = km.player1_id AND p1reg.event_id = km.event_id
     LEFT JOIN event_teams p1t ON p1t.id = p1reg.team_id
     LEFT JOIN event_registrations p1pr ON p1pr.team_id = p1reg.team_id AND p1pr.user_id != km.player1_id AND p1pr.event_id = km.event_id
     LEFT JOIN users p1partner ON p1partner.id = p1pr.user_id
     LEFT JOIN event_registrations p2reg ON p2reg.user_id = km.player2_id AND p2reg.event_id = km.event_id
     LEFT JOIN event_teams p2t ON p2t.id = p2reg.team_id
     LEFT JOIN event_registrations p2pr ON p2pr.team_id = p2reg.team_id AND p2pr.user_id != km.player2_id AND p2pr.event_id = km.event_id
     LEFT JOIN users p2partner ON p2partner.id = p2pr.user_id
     WHERE km.event_id = ?
     ORDER BY km.round_id ASC, km.match_sequence ASC`,
    [evId]
  );

  // ── Retroactive sweep: fix any match that became unopposed mid-tournament ────
  // (e.g. a walkover voided the opposing feeder, leaving one player with no opponent)
  const pendingUnopposed = matches.filter((m: any) =>
    m.status !== "complete" && m.status !== "bye" &&
    ((m.player1_id && !m.player2_id) || (!m.player1_id && m.player2_id))
  );
  for (const m of pendingUnopposed) {
    await autoAdvanceIfUnopposed(evId, m.id);
  }
  // Re-fetch matches if any were auto-advanced
  const finalMatches = pendingUnopposed.length > 0
    ? await query<any>(
        `SELECT km.*,
                p1.name as player1_name, p1.handicap as player1_handicap,
                p2.name as player2_name, p2.handicap as player2_handicap,
                w.name as winner_name,
                p1partner.id   as player1_partner_id,   p1partner.name as player1_partner_name,
                p2partner.id   as player2_partner_id,   p2partner.name as player2_partner_name,
                p1t.name       as player1_team_name,
                p2t.name       as player2_team_name
         FROM knockout_matches km
         LEFT JOIN users p1 ON p1.id = km.player1_id
         LEFT JOIN users p2 ON p2.id = km.player2_id
         LEFT JOIN users w  ON w.id  = km.winner_id
         LEFT JOIN event_registrations p1reg ON p1reg.user_id = km.player1_id AND p1reg.event_id = km.event_id
         LEFT JOIN event_teams p1t ON p1t.id = p1reg.team_id
         LEFT JOIN event_registrations p1pr ON p1pr.team_id = p1reg.team_id AND p1pr.user_id != km.player1_id AND p1pr.event_id = km.event_id
         LEFT JOIN users p1partner ON p1partner.id = p1pr.user_id
         LEFT JOIN event_registrations p2reg ON p2reg.user_id = km.player2_id AND p2reg.event_id = km.event_id
         LEFT JOIN event_teams p2t ON p2t.id = p2reg.team_id
         LEFT JOIN event_registrations p2pr ON p2pr.team_id = p2reg.team_id AND p2pr.user_id != km.player2_id AND p2pr.event_id = km.event_id
         LEFT JOIN users p2partner ON p2partner.id = p2pr.user_id
         WHERE km.event_id = ?
         ORDER BY km.round_id ASC, km.match_sequence ASC`,
        [evId]
      )
    : matches;

  // Find champion: winner of the final match
  const finalMatch = finalMatches[finalMatches.length - 1];
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
      matches: finalMatches.filter((m: any) => m.round_id === r.id),
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

  // Auto-advance the next match if the walkover (no winner) left it with only one player
  if (match.next_match_id) {
    await autoAdvanceIfUnopposed(evId, match.next_match_id);
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

  let isP1 = match.player1_id === user.id;
  let isP2 = match.player2_id === user.id;
  if (!isP1 && !isP2) {
    // Check if user is a team partner of either side
    if (match.player1_id) {
      const p1pr = await row<any>(
        `SELECT er2.user_id FROM event_registrations er1
         JOIN event_registrations er2 ON er2.team_id = er1.team_id AND er2.user_id != er1.user_id AND er2.event_id = er1.event_id
         WHERE er1.user_id = ? AND er1.event_id = ?`,
        [match.player1_id, evId]
      );
      if (p1pr && p1pr.user_id === user.id) isP1 = true;
    }
    if (!isP1 && match.player2_id) {
      const p2pr = await row<any>(
        `SELECT er2.user_id FROM event_registrations er1
         JOIN event_registrations er2 ON er2.team_id = er1.team_id AND er2.user_id != er1.user_id AND er2.event_id = er1.event_id
         WHERE er1.user_id = ? AND er1.event_id = ?`,
        [match.player2_id, evId]
      );
      if (p2pr && p2pr.user_id === user.id) isP2 = true;
    }
  }
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

    // Auto-advance next match if winner is now unopposed (no opponent will ever arrive)
    if (match.next_match_id) {
      await autoAdvanceIfUnopposed(evId, match.next_match_id);
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
            km.player1_result, km.player2_result, km.dispute,
            p1partner.id   as player1_partner_id,   p1partner.name as player1_partner_name,
            p2partner.id   as player2_partner_id,   p2partner.name as player2_partner_name,
            p1t.name       as player1_team_name,
            p2t.name       as player2_team_name
     FROM knockout_matches km
     LEFT JOIN users p1 ON p1.id = km.player1_id
     LEFT JOIN users p2 ON p2.id = km.player2_id
     LEFT JOIN users w  ON w.id  = km.winner_id
     LEFT JOIN event_registrations p1reg ON p1reg.user_id = km.player1_id AND p1reg.event_id = km.event_id
     LEFT JOIN event_teams p1t ON p1t.id = p1reg.team_id
     LEFT JOIN event_registrations p1pr ON p1pr.team_id = p1reg.team_id AND p1pr.user_id != km.player1_id AND p1pr.event_id = km.event_id
     LEFT JOIN users p1partner ON p1partner.id = p1pr.user_id
     LEFT JOIN event_registrations p2reg ON p2reg.user_id = km.player2_id AND p2reg.event_id = km.event_id
     LEFT JOIN event_teams p2t ON p2t.id = p2reg.team_id
     LEFT JOIN event_registrations p2pr ON p2pr.team_id = p2reg.team_id AND p2pr.user_id != km.player2_id AND p2pr.event_id = km.event_id
     LEFT JOIN users p2partner ON p2partner.id = p2pr.user_id
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
  const user = await getUser(req);
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
       AND (
         km.player1_id = ? OR km.player2_id = ?
         OR km.player1_id IN (
           SELECT er_cap.user_id FROM event_registrations er_cap
           JOIN event_registrations er_me ON er_me.team_id = er_cap.team_id AND er_me.user_id = ? AND er_me.event_id = er_cap.event_id
           WHERE er_cap.event_id = ge.id
         )
         OR km.player2_id IN (
           SELECT er_cap.user_id FROM event_registrations er_cap
           JOIN event_registrations er_me ON er_me.team_id = er_cap.team_id AND er_me.user_id = ? AND er_me.event_id = er_cap.event_id
           WHERE er_cap.event_id = ge.id
         )
       )
       AND ge.status IN ('active', 'published')
     ORDER BY kr.round_number ASC, km.id ASC`,
    [clubId, user.id, user.id, user.id, user.id]
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
