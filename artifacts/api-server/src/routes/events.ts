import { Router, type IRouter } from "express";
import { query, row, exec, run } from "../lib/pg";
import { getUser, isStaff, effectiveClubId } from "../lib/auth";
import { sendPushNotifications } from "../lib/notifications";
import { getUserTierPrices } from "../lib/pricing";

const router: IRouter = Router();

const VALID_FORMATS      = ["stroke_play","stableford","match_play","fourball","scramble","alliance","bogey","other"] as const;
const VALID_RESTRICTIONS = ["open","members_only","invitation_only"] as const;
const VALID_MEMBERSHIP_TYPES = ["standard","premium","honorary"] as const;

// Default division config — SA standard
const DEFAULT_DIVISIONS = [
  { label: "A Division", key: "A", min_hcp: 0,    max_hcp: 9.9,  format: "stroke_play",  tees: "championship" },
  { label: "B Division", key: "B", min_hcp: 10,   max_hcp: 17.9, format: "stroke_play",  tees: "club" },
  { label: "C Division", key: "C", min_hcp: 18,   max_hcp: 36,   format: "stableford",   tees: "club" },
];

function assignDivision(handicap: number | null, divisions: typeof DEFAULT_DIVISIONS): string | null {
  if (handicap == null) return null;
  for (const d of divisions) {
    if (handicap >= d.min_hcp && handicap <= d.max_hcp) return d.key;
  }
  return divisions[divisions.length - 1]?.key ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: GET /admin/events
// ─────────────────────────────────────────────────────────────────────────────
router.get("/admin/events", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!isStaff(user)) { res.status(403).json({ message: "Forbidden" }); return; }
  const clubId = effectiveClubId(user, req.query.club_id ?? req.body?.club_id);
  if (clubId == null) { res.status(400).json({ message: "club_id required" }); return; }

  const upcoming   = req.query.upcoming !== "false";
  const today      = new Date().toISOString().split("T")[0];
  const dateFilter = upcoming ? `AND e.event_date >= '${today}'` : `AND e.event_date < '${today}'`;

  const events = await query<any>(
    `SELECT e.*,
            (SELECT COUNT(*) FROM event_registrations er WHERE er.event_id = e.id) as total_registrations,
            (SELECT COUNT(*) FROM event_registrations er WHERE er.event_id = e.id AND er.status = 'approved') as approved_count,
            (SELECT COUNT(*) FROM event_registrations er WHERE er.event_id = e.id AND er.status = 'pending') as pending_count
     FROM golf_events e
     WHERE e.club_id = ? ${dateFilter}
     ORDER BY e.event_date ASC, e.start_time ASC`,
    [clubId]
  );

  res.json({
    events: events.map((e: any) => ({
      ...e,
      entry_fee:           e.entry_fee != null ? parseFloat(e.entry_fee) : null,
      total_registrations: parseInt(e.total_registrations ?? "0"),
      approved_count:      parseInt(e.approved_count ?? "0"),
      pending_count:       parseInt(e.pending_count ?? "0"),
      divisions:           e.divisions ?? DEFAULT_DIVISIONS,
    })),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: POST /admin/events
// ─────────────────────────────────────────────────────────────────────────────
router.post("/admin/events", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!isStaff(user)) { res.status(403).json({ message: "Forbidden" }); return; }
  const clubId = effectiveClubId(user, req.query.club_id ?? req.body?.club_id);
  if (clubId == null) { res.status(400).json({ message: "club_id required" }); return; }

  const {
    name, description, event_date, end_date, start_time, end_time, event_type,
    format, restriction, entry_fee, max_participants,
    divisions, entries_open, entries_close, ballot, scoring_enabled, payment_required, rounds,
  } = req.body ?? {};

  if (!name || !event_date) { res.status(400).json({ message: "name and event_date are required" }); return; }

  const eventId = await exec(
    `INSERT INTO golf_events
       (club_id, name, description, event_date, end_date, start_time, end_time, event_type, format,
        restriction, entry_fee, max_participants, divisions, entries_open, entries_close,
        ballot, scoring_enabled, payment_required, rounds, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
    [
      clubId, String(name), description ?? null,
      event_date, end_date ?? null, start_time ?? null, end_time ?? null,
      event_type ?? "competition",
      format ?? "stroke_play",
      restriction ?? "open",
      entry_fee != null ? parseFloat(entry_fee) : null,
      max_participants != null ? parseInt(max_participants) : null,
      divisions ? JSON.stringify(divisions) : JSON.stringify(DEFAULT_DIVISIONS),
      entries_open ?? null, entries_close ?? null,
      ballot ? 1 : 0, scoring_enabled ? 1 : 0, payment_required ? 1 : 0,
      rounds ?? 1,
      user.id,
    ]
  );

  // Notify club members + past bookers about the new event (fire-and-forget)
  const [clubRow, audience] = await Promise.all([
    row<any>("SELECT name FROM clubs WHERE id = ?", [clubId]),
    query<any>(
      `SELECT DISTINCT u.push_token
       FROM users u
       WHERE u.push_token IS NOT NULL
         AND (
           EXISTS (SELECT 1 FROM club_members cm WHERE cm.club_id = ? AND cm.user_id = u.id AND cm.status = 'active')
           OR EXISTS (
             SELECT 1 FROM bookings b
             JOIN tee_times tt ON tt.id = b.tee_time_id
             WHERE tt.club_id = ? AND b.user_id = u.id
           )
         )
       LIMIT 500`,
      [clubId, clubId]
    ),
  ]);
  if (audience.length > 0 && clubRow) {
    const fmtDate = (d: string) => {
      try { return new Date(String(d).slice(0, 10) + "T00:00:00").toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }); }
      catch { return d; }
    };
    sendPushNotifications(audience.map((u: any) => ({
      to: u.push_token, sound: "default",
      title: `⛳ New Event — ${clubRow.name}`,
      body:  `${String(name)} · ${fmtDate(event_date)}. Tap to view & enter.`,
      data:  { type: "event_created", event_id: eventId, club_id: clubId },
    })));
  }

  res.status(201).json({ event_id: eventId });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: PUT /admin/events/:id
// ─────────────────────────────────────────────────────────────────────────────
router.put("/admin/events/:id", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!isStaff(user)) { res.status(403).json({ message: "Forbidden" }); return; }
  const clubId = effectiveClubId(user, req.query.club_id ?? req.body?.club_id);
  if (clubId == null) { res.status(400).json({ message: "club_id required" }); return; }

  const eventId = parseInt(req.params.id, 10);
  const event   = await row<any>("SELECT id FROM golf_events WHERE id = ? AND club_id = ?", [eventId, clubId]);
  if (!event) { res.status(404).json({ message: "Event not found" }); return; }

  const {
    name, description, event_date, end_date, start_time, end_time, event_type, format,
    restriction, entry_fee, max_participants, status,
    divisions, entries_open, entries_close, ballot, scoring_enabled, payment_required, rounds,
  } = req.body ?? {};

  const updates: string[] = [];
  const vals:    any[]    = [];

  if (name)                   { updates.push("name = ?");              vals.push(String(name)); }
  if (description !== undefined){ updates.push("description = ?");     vals.push(description ?? null); }
  if (event_date)             { updates.push("event_date = ?");        vals.push(event_date); }
  if (end_date !== undefined) { updates.push("end_date = ?");          vals.push(end_date ?? null); }
  if (start_time !== undefined){ updates.push("start_time = ?");       vals.push(start_time ?? null); }
  if (end_time !== undefined) { updates.push("end_time = ?");          vals.push(end_time ?? null); }
  if (event_type)             { updates.push("event_type = ?");        vals.push(event_type); }
  if (format)                 { updates.push("format = ?");            vals.push(format); }
  if (restriction)            { updates.push("restriction = ?");       vals.push(restriction); }
  if (entry_fee !== undefined){ updates.push("entry_fee = ?");         vals.push(entry_fee != null ? parseFloat(entry_fee) : null); }
  if (max_participants !== undefined){ updates.push("max_participants = ?"); vals.push(max_participants != null ? parseInt(max_participants) : null); }
  if (status)                 { updates.push("status = ?");            vals.push(status); }
  if (divisions !== undefined){ updates.push("divisions = ?");         vals.push(JSON.stringify(divisions)); }
  if (entries_open !== undefined){ updates.push("entries_open = ?");   vals.push(entries_open ?? null); }
  if (entries_close !== undefined){ updates.push("entries_close = ?"); vals.push(entries_close ?? null); }
  if (ballot !== undefined)   { updates.push("ballot = ?");            vals.push(ballot ? 1 : 0); }
  if (scoring_enabled !== undefined){ updates.push("scoring_enabled = ?"); vals.push(scoring_enabled ? 1 : 0); }
  if (payment_required !== undefined){ updates.push("payment_required = ?"); vals.push(payment_required ? 1 : 0); }
  if (rounds !== undefined)   { updates.push("rounds = ?");            vals.push(Number(rounds)); }

  if (!updates.length) { res.json({ success: true }); return; }

  vals.push(eventId, clubId);
  await exec(`UPDATE golf_events SET ${updates.join(", ")} WHERE id = ? AND club_id = ?`, vals);
  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: DELETE /admin/events/:id
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/admin/events/:id", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!isStaff(user)) { res.status(403).json({ message: "Forbidden" }); return; }
  const clubId = effectiveClubId(user, req.query.club_id ?? req.body?.club_id);
  if (clubId == null) { res.status(400).json({ message: "club_id required" }); return; }
  const eventId = parseInt(req.params.id, 10);
  await exec("UPDATE golf_events SET status = 'cancelled' WHERE id = ? AND club_id = ?", [eventId, clubId]);
  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: GET /admin/events/:id/registrations
// ─────────────────────────────────────────────────────────────────────────────
router.get("/admin/events/:id/registrations", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!isStaff(user)) { res.status(403).json({ message: "Forbidden" }); return; }
  const clubId = effectiveClubId(user, req.query.club_id ?? req.body?.club_id);
  if (clubId == null) { res.status(400).json({ message: "club_id required" }); return; }

  const eventId = parseInt(req.params.id, 10);
  const event   = await row<any>("SELECT id FROM golf_events WHERE id = ? AND club_id = ?", [eventId, clubId]);
  if (!event) { res.status(404).json({ message: "Event not found" }); return; }

  const regs = await query<any>(
    `SELECT er.id, er.status, er.registered_at, er.division, er.frozen_handicap,
            er.payment_status, er.paid_at,
            u.id as user_id, u.name as user_name, u.email as user_email, u.handicap, u.phone
     FROM event_registrations er
     JOIN users u ON u.id = er.user_id
     WHERE er.event_id = ?
     ORDER BY er.division ASC, er.registered_at ASC`,
    [eventId]
  );

  res.json({ registrations: regs.map(r => ({ ...r, frozen_handicap: r.frozen_handicap != null ? parseFloat(r.frozen_handicap) : null })) });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: PUT /admin/events/:id/registrations/:userId — approve/reject
// ─────────────────────────────────────────────────────────────────────────────
router.put("/admin/events/:id/registrations/:userId", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!isStaff(user)) { res.status(403).json({ message: "Forbidden" }); return; }
  const clubId = effectiveClubId(user, req.query.club_id ?? req.body?.club_id);
  if (clubId == null) { res.status(400).json({ message: "club_id required" }); return; }

  const eventId  = parseInt(req.params.id, 10);
  const targetId = parseInt(req.params.userId, 10);
  const { status } = req.body ?? {};

  if (!["approved", "rejected"].includes(status)) {
    res.status(400).json({ message: "status must be 'approved' or 'rejected'" }); return;
  }

  const event = await row<any>(
    "SELECT e.id, e.name, e.payment_required, e.entry_fee, c.name as club_name FROM golf_events e JOIN clubs c ON c.id = e.club_id WHERE e.id = ? AND e.club_id = ?",
    [eventId, clubId]
  );
  if (!event) { res.status(404).json({ message: "Event not found" }); return; }

  await exec("UPDATE event_registrations SET status = ? WHERE event_id = ? AND user_id = ?", [status, eventId, targetId]);

  const target = await row<any>("SELECT push_token FROM users WHERE id = ?", [targetId]);
  if (target?.push_token) {
    const needsPayment = status === "approved" && event.payment_required && event.entry_fee;
    sendPushNotifications([{
      to:    target.push_token,
      sound: "default",
      title: status === "approved" ? `Spot Confirmed ⛳` : `Registration Update`,
      body:  status === "approved"
        ? needsPayment
          ? `Your entry for "${event.name}" at ${event.club_name} is approved. Open the app to complete payment (R${parseFloat(event.entry_fee).toFixed(2)}).`
          : `Your entry for "${event.name}" at ${event.club_name} is confirmed.`
        : `Your entry for "${event.name}" at ${event.club_name} was not accepted at this time.`,
      data: { type: "event_registration_update", event_id: eventId, status },
    }]);
  }

  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: GET /admin/events/:id/draw
// ─────────────────────────────────────────────────────────────────────────────
router.get("/admin/events/:id/draw", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!isStaff(user)) { res.status(403).json({ message: "Forbidden" }); return; }
  const clubId = effectiveClubId(user, req.query.club_id ?? req.body?.club_id);
  if (clubId == null) { res.status(400).json({ message: "club_id required" }); return; }

  const eventId = parseInt(req.params.id, 10);
  const round   = req.query.round ? parseInt(String(req.query.round), 10) : 1;

  const event = await row<any>("SELECT id FROM golf_events WHERE id = ? AND club_id = ?", [eventId, clubId]);
  if (!event) { res.status(404).json({ message: "Event not found" }); return; }

  const draws = await query<any>(
    `SELECT d.id, d.round, d.tee_date, d.tee_time, d.draw_group, d.notes,
            u.id as user_id, u.name as user_name, u.email as user_email,
            r.division, r.frozen_handicap
     FROM event_draws d
     JOIN users u ON u.id = d.user_id
     JOIN event_registrations r ON r.event_id = d.event_id AND r.user_id = d.user_id
     WHERE d.event_id = ? AND d.round = ?
     ORDER BY d.draw_group ASC, d.tee_time ASC`,
    [eventId, round]
  );

  res.json({ draws });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: PUT /admin/events/:id/draw — upsert draw (replace round's draw)
// Body: { round, entries: [{ user_id, tee_date, tee_time, draw_group, notes }] }
// ─────────────────────────────────────────────────────────────────────────────
router.put("/admin/events/:id/draw", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!isStaff(user)) { res.status(403).json({ message: "Forbidden" }); return; }
  const clubId = effectiveClubId(user, req.query.club_id ?? req.body?.club_id);
  if (clubId == null) { res.status(400).json({ message: "club_id required" }); return; }

  const eventId  = parseInt(req.params.id, 10);
  const { round = 1, entries = [] } = req.body ?? {};

  const event = await row<any>("SELECT id FROM golf_events WHERE id = ? AND club_id = ?", [eventId, clubId]);
  if (!event) { res.status(404).json({ message: "Event not found" }); return; }

  // Replace entire round draw
  await exec("DELETE FROM event_draws WHERE event_id = ? AND round = ?", [eventId, round]);

  for (const entry of entries) {
    if (!entry.user_id || !entry.tee_date || !entry.tee_time) continue;
    await exec(
      "INSERT INTO event_draws (event_id, round, tee_date, tee_time, draw_group, user_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [eventId, round, entry.tee_date, entry.tee_time, entry.draw_group ?? 1, entry.user_id, entry.notes ?? null]
    );
  }

  // Notify approved registrants
  const registrants = await query<any>(
    "SELECT u.push_token, u.name FROM event_registrations er JOIN users u ON u.id = er.user_id WHERE er.event_id = ? AND er.status = 'approved' AND u.push_token IS NOT NULL",
    [eventId]
  );
  const ev = await row<any>("SELECT name FROM golf_events WHERE id = ?", [eventId]);
  if (registrants.length > 0 && ev) {
    sendPushNotifications(registrants.map((r: any) => ({
      to: r.push_token, sound: "default",
      title: `Draw Published ⛳`,
      body:  `The tee-time draw for "${ev.name}" Round ${round} is now available.`,
      data:  { type: "event_draw_published", event_id: eventId, round },
    })));
  }

  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: GET /admin/events/:id/scores
// ─────────────────────────────────────────────────────────────────────────────
router.get("/admin/events/:id/scores", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!isStaff(user)) { res.status(403).json({ message: "Forbidden" }); return; }
  const clubId = effectiveClubId(user, req.query.club_id ?? req.body?.club_id);
  if (clubId == null) { res.status(400).json({ message: "club_id required" }); return; }

  const eventId = parseInt(req.params.id, 10);
  const round   = req.query.round ? parseInt(String(req.query.round), 10) : null;

  const event = await row<any>("SELECT id FROM golf_events WHERE id = ? AND club_id = ?", [eventId, clubId]);
  if (!event) { res.status(404).json({ message: "Event not found" }); return; }

  const roundFilter = round != null ? "AND s.round = ?" : "";
  const params: any[] = round != null ? [eventId, round] : [eventId];

  const scores = await query<any>(
    `SELECT s.id, s.round, s.gross, s.net, s.points, s.hole_scores, s.submitted_at,
            s.verified, s.verified_at, s.marker_disputed,
            u.id as user_id, u.name as user_name, u.handicap,
            r.division, r.frozen_handicap,
            sr.id AS round_id, sr.marker_user_id,
            mu.name AS marker_name, sr.marker_submitted_at
     FROM event_scores s
     JOIN users u ON u.id = s.user_id
     JOIN event_registrations r ON r.event_id = s.event_id AND r.user_id = s.user_id
     LEFT JOIN scoring_rounds sr ON sr.user_id = s.user_id AND sr.tournament_id = s.event_id
                                 AND sr.score_submitted = 1
     LEFT JOIN users mu ON mu.id = sr.marker_user_id
     WHERE s.event_id = ? ${roundFilter}
     ORDER BY r.division ASC, s.gross ASC NULLS LAST`,
    params
  );

  res.json({ scores });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: POST /admin/events/:id/scores/verify — club adjudicates a disputed score
// Body: { userId, round? }
// ─────────────────────────────────────────────────────────────────────────────
router.post("/admin/events/:id/scores/verify", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!isStaff(user)) { res.status(403).json({ message: "Forbidden" }); return; }
  const clubId = effectiveClubId(user, req.query.club_id ?? req.body?.club_id);
  if (clubId == null) { res.status(400).json({ message: "club_id required" }); return; }

  const eventId = parseInt(req.params.id, 10);
  const { userId, round = 1 } = req.body ?? {};
  if (!userId) { res.status(400).json({ message: "userId required" }); return; }

  const event = await row<any>("SELECT id FROM golf_events WHERE id = ? AND club_id = ?", [eventId, clubId]);
  if (!event) { res.status(404).json({ message: "Event not found" }); return; }

  await run(
    "UPDATE event_scores SET verified = 1, marker_disputed = 0 WHERE event_id = ? AND user_id = ? AND round = ?",
    [eventId, userId, round]
  );

  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: POST /admin/events/:id/scores — bulk score entry (staff entering physical scorecards)
// Body: { round, scores: [{ user_id, gross, net, points, hole_scores }] }
// ─────────────────────────────────────────────────────────────────────────────
router.post("/admin/events/:id/scores", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!isStaff(user)) { res.status(403).json({ message: "Forbidden" }); return; }
  const clubId = effectiveClubId(user, req.query.club_id ?? req.body?.club_id);
  if (clubId == null) { res.status(400).json({ message: "club_id required" }); return; }

  const eventId       = parseInt(req.params.id, 10);
  const { round = 1, scores = [] } = req.body ?? {};

  const event = await row<any>("SELECT id FROM golf_events WHERE id = ? AND club_id = ?", [eventId, clubId]);
  if (!event) { res.status(404).json({ message: "Event not found" }); return; }

  for (const s of scores) {
    if (!s.user_id) continue;
    await exec(
      `INSERT INTO event_scores (event_id, user_id, round, hole_scores, gross, net, points, verified, verified_by, verified_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, NOW())
       ON CONFLICT (event_id, user_id, round) DO UPDATE
         SET hole_scores = EXCLUDED.hole_scores, gross = EXCLUDED.gross, net = EXCLUDED.net,
             points = EXCLUDED.points, verified = 1, verified_by = EXCLUDED.verified_by, verified_at = EXCLUDED.verified_at`,
      [eventId, s.user_id, round, s.hole_scores ? JSON.stringify(s.hole_scores) : null,
       s.gross ?? null, s.net ?? null, s.points ?? null, user.id]
    );
  }

  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: GET/POST/PUT/DELETE /admin/members  (unchanged from original)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/admin/members", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!isStaff(user)) { res.status(403).json({ message: "Forbidden" }); return; }
  const clubId = effectiveClubId(user, req.query.club_id ?? req.body?.club_id);
  if (clubId == null) { res.status(400).json({ message: "club_id required" }); return; }

  const members = await query<any>(
    `SELECT cm.id, cm.membership_type, cm.status, cm.created_at,
            u.id as user_id, u.name as user_name, u.email as user_email, u.handicap
     FROM club_members cm
     JOIN users u ON u.id = cm.user_id
     WHERE cm.club_id = ?
     ORDER BY u.name ASC`,
    [clubId]
  );
  res.json({ members });
});

router.get("/admin/members/search", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!isStaff(user)) { res.status(403).json({ message: "Forbidden" }); return; }
  const clubId = effectiveClubId(user, req.query.club_id ?? req.body?.club_id);
  if (clubId == null) { res.status(400).json({ message: "club_id required" }); return; }

  const q = String(req.query.q ?? "").trim();
  if (q.length < 2) { res.json({ users: [] }); return; }

  const users = await query<any>(
    `SELECT u.id, u.name, u.email, u.handicap,
            (SELECT 1 FROM club_members cm WHERE cm.club_id = ? AND cm.user_id = u.id LIMIT 1) as already_member
     FROM users u
     WHERE (u.name ILIKE ? OR u.email ILIKE ?)
       AND u.id != ?
     LIMIT 10`,
    [clubId, `%${q}%`, `%${q}%`, user.id]
  );
  res.json({ users: users.map((u: any) => ({ ...u, already_member: !!u.already_member })) });
});

router.post("/admin/members", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!isStaff(user)) { res.status(403).json({ message: "Forbidden" }); return; }
  const clubId = effectiveClubId(user, req.query.club_id ?? req.body?.club_id);
  if (clubId == null) { res.status(400).json({ message: "club_id required" }); return; }

  const { user_id, membership_type = "standard" } = req.body ?? {};
  if (!user_id) { res.status(400).json({ message: "user_id is required" }); return; }
  if (!VALID_MEMBERSHIP_TYPES.includes(membership_type)) {
    res.status(400).json({ message: `membership_type must be one of: ${VALID_MEMBERSHIP_TYPES.join(", ")}` }); return;
  }

  const target = await row<any>("SELECT id, name FROM users WHERE id = ?", [user_id]);
  if (!target) { res.status(404).json({ message: "User not found" }); return; }
  const club = await row<any>("SELECT name FROM clubs WHERE id = ?", [clubId]);

  try {
    await exec("INSERT INTO club_members (club_id, user_id, membership_type, added_by) VALUES (?, ?, ?, ?)", [clubId, user_id, membership_type, user.id]);
  } catch (err: any) {
    if (err.code === "23505" || err.code === "ER_DUP_ENTRY") {
      await exec("UPDATE club_members SET status = 'active', membership_type = ? WHERE club_id = ? AND user_id = ?", [membership_type, clubId, user_id]);
    } else throw err;
  }
  await exec("UPDATE users SET club_id = ? WHERE id = ? AND club_id IS NULL", [clubId, user_id]);

  const targetUser = await row<any>("SELECT push_token FROM users WHERE id = ?", [user_id]);
  if (targetUser?.push_token) {
    sendPushNotifications([{
      to: targetUser.push_token, sound: "default",
      title: "Club Membership ⛳",
      body:  `You have been added as a ${membership_type} member of ${club?.name ?? "the club"}.`,
      data:  { type: "club_membership_added", club_id: clubId },
    }]);
  }
  res.status(201).json({ success: true });
});

router.put("/admin/members/:userId", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!isStaff(user)) { res.status(403).json({ message: "Forbidden" }); return; }
  const clubId = effectiveClubId(user, req.query.club_id ?? req.body?.club_id);
  if (clubId == null) { res.status(400).json({ message: "club_id required" }); return; }

  const targetId = parseInt(req.params.userId, 10);
  const { membership_type, status } = req.body ?? {};
  const updates: string[] = [];
  const vals:    any[]    = [];

  if (membership_type && VALID_MEMBERSHIP_TYPES.includes(membership_type)) { updates.push("membership_type = ?"); vals.push(membership_type); }
  if (status && ["active","suspended"].includes(status)) { updates.push("status = ?"); vals.push(status); }
  if (!updates.length) { res.json({ success: true }); return; }

  vals.push(clubId, targetId);
  await exec(`UPDATE club_members SET ${updates.join(", ")} WHERE club_id = ? AND user_id = ?`, vals);
  res.json({ success: true });
});

router.delete("/admin/members/:userId", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!isStaff(user)) { res.status(403).json({ message: "Forbidden" }); return; }
  const clubId = effectiveClubId(user, req.query.club_id ?? req.body?.club_id);
  if (clubId == null) { res.status(400).json({ message: "club_id required" }); return; }

  await exec("DELETE FROM club_members WHERE club_id = ? AND user_id = ?", [clubId, parseInt(req.params.userId, 10)]);
  res.json({ success: true });
});

export default router;
