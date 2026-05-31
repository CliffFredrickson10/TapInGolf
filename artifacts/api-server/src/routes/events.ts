import { Router, type IRouter } from "express";
import { query, row, exec } from "../lib/pg";
import { getUser, isStaff, effectiveClubId } from "../lib/auth";
import { sendPushNotifications } from "../lib/notifications";

const router: IRouter = Router();

const VALID_TYPES = ["open_day", "competition", "corporate", "social", "other"] as const;
const VALID_RESTRICTIONS = ["open", "members_only", "invitation_only"] as const;
const VALID_MEMBERSHIP_TYPES = ["standard", "premium", "honorary"] as const;

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: GET /clubs/:id/events
// List upcoming active events for a club (with user's eligibility status)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/clubs/:id/events", async (req, res): Promise<void> => {
  const clubId = parseInt(req.params.id, 10);
  const caller  = await getUser(req);
  const today   = new Date().toISOString().split("T")[0];

  const events = await query<any>(
    `SELECT e.id, e.name, e.description, e.event_date, e.start_time, e.end_time,
            e.event_type, e.restriction, e.entry_fee, e.max_participants, e.status,
            (SELECT COUNT(*) FROM event_registrations er WHERE er.event_id = e.id AND er.status = 'approved') as approved_count
     FROM golf_events e
     WHERE e.club_id = ? AND e.status = 'active' AND e.event_date >= ?
     ORDER BY e.event_date ASC, e.start_time ASC`,
    [clubId, today]
  );

  // Attach user eligibility for each event
  const enriched = await Promise.all(events.map(async (ev: any) => {
    let user_eligible: boolean | null = null;
    let user_registration_status: string | null = null;

    if (caller) {
      if (ev.restriction === "open") {
        user_eligible = true;
      } else if (ev.restriction === "members_only") {
        const m = await row<any>(
          "SELECT id FROM club_members WHERE club_id = ? AND user_id = ? AND status = 'active'",
          [clubId, caller.id]
        );
        user_eligible = !!m;
      } else if (ev.restriction === "invitation_only") {
        const r = await row<any>(
          "SELECT status FROM event_registrations WHERE event_id = ? AND user_id = ?",
          [ev.id, caller.id]
        );
        user_registration_status = r?.status ?? null;
        user_eligible = r?.status === "approved";
      }
    }

    return {
      ...ev,
      entry_fee:    ev.entry_fee != null ? parseFloat(ev.entry_fee) : null,
      approved_count: parseInt(ev.approved_count ?? "0"),
      user_eligible,
      user_registration_status,
    };
  }));

  res.json({ events: enriched });
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: POST /events/:id/register
// User registers interest for an invitation_only event
// ─────────────────────────────────────────────────────────────────────────────
router.post("/events/:id/register", async (req, res): Promise<void> => {
  const caller = await getUser(req);
  if (!caller) { res.status(401).json({ message: "Unauthorized" }); return; }

  const eventId = parseInt(req.params.id, 10);
  const event   = await row<any>("SELECT * FROM golf_events WHERE id = ? AND status = 'active'", [eventId]);
  if (!event) { res.status(404).json({ message: "Event not found" }); return; }

  if (event.restriction !== "invitation_only") {
    res.status(400).json({ message: "This event does not require registration" });
    return;
  }

  const existing = await row<any>(
    "SELECT id, status FROM event_registrations WHERE event_id = ? AND user_id = ?",
    [eventId, caller.id]
  );
  if (existing) {
    res.json({ message: "Already registered", status: existing.status });
    return;
  }

  await exec(
    "INSERT INTO event_registrations (event_id, user_id, status) VALUES (?, ?, 'pending')",
    [eventId, caller.id]
  );

  res.status(201).json({ success: true, status: "pending" });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: GET /admin/events
// List all events for the admin's club
// ─────────────────────────────────────────────────────────────────────────────
router.get("/admin/events", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!isStaff(user)) { res.status(403).json({ message: "Forbidden" }); return; }
  const clubId = effectiveClubId(user, req.query.club_id ?? req.body?.club_id);
  if (clubId == null) { res.status(400).json({ message: "club_id required" }); return; }

  const upcoming = req.query.upcoming !== "false";
  const today    = new Date().toISOString().split("T")[0];
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
    })),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: POST /admin/events
// Create a new event
// ─────────────────────────────────────────────────────────────────────────────
router.post("/admin/events", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!isStaff(user)) { res.status(403).json({ message: "Forbidden" }); return; }
  const clubId = effectiveClubId(user, req.query.club_id ?? req.body?.club_id);
  if (clubId == null) { res.status(400).json({ message: "club_id required" }); return; }

  const { name, description, event_date, start_time, end_time, event_type, restriction, entry_fee, max_participants } = req.body ?? {};

  if (!name || !event_date) {
    res.status(400).json({ message: "name and event_date are required" }); return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(event_date)) {
    res.status(400).json({ message: "event_date must be YYYY-MM-DD" }); return;
  }
  if (event_type && !VALID_TYPES.includes(event_type)) {
    res.status(400).json({ message: `event_type must be one of: ${VALID_TYPES.join(", ")}` }); return;
  }
  if (restriction && !VALID_RESTRICTIONS.includes(restriction)) {
    res.status(400).json({ message: `restriction must be one of: ${VALID_RESTRICTIONS.join(", ")}` }); return;
  }

  const result = await exec(
    `INSERT INTO golf_events
       (club_id, name, description, event_date, start_time, end_time, event_type, restriction, entry_fee, max_participants, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      clubId,
      String(name),
      description ?? null,
      event_date,
      start_time ?? null,
      end_time ?? null,
      event_type ?? "other",
      restriction ?? "open",
      entry_fee != null ? parseFloat(entry_fee) : null,
      max_participants != null ? parseInt(max_participants) : null,
      user.id,
    ]
  );

  res.status(201).json({ event_id: (result as any).insertId });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: PUT /admin/events/:id
// Update an event
// ─────────────────────────────────────────────────────────────────────────────
router.put("/admin/events/:id", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!isStaff(user)) { res.status(403).json({ message: "Forbidden" }); return; }
  const clubId = effectiveClubId(user, req.query.club_id ?? req.body?.club_id);
  if (clubId == null) { res.status(400).json({ message: "club_id required" }); return; }

  const eventId = parseInt(req.params.id, 10);
  const event   = await row<any>("SELECT id FROM golf_events WHERE id = ? AND club_id = ?", [eventId, clubId]);
  if (!event) { res.status(404).json({ message: "Event not found" }); return; }

  const { name, description, event_date, start_time, end_time, event_type, restriction, entry_fee, max_participants, status } = req.body ?? {};

  const updates: string[] = [];
  const vals:    any[]    = [];

  if (name)            { updates.push("name = ?");             vals.push(String(name)); }
  if (description !== undefined) { updates.push("description = ?"); vals.push(description ?? null); }
  if (event_date)      { updates.push("event_date = ?");       vals.push(event_date); }
  if (start_time !== undefined) { updates.push("start_time = ?"); vals.push(start_time ?? null); }
  if (end_time !== undefined)   { updates.push("end_time = ?");   vals.push(end_time ?? null); }
  if (event_type)      { updates.push("event_type = ?");       vals.push(event_type); }
  if (restriction)     { updates.push("restriction = ?");      vals.push(restriction); }
  if (entry_fee !== undefined)  { updates.push("entry_fee = ?");  vals.push(entry_fee != null ? parseFloat(entry_fee) : null); }
  if (max_participants !== undefined) { updates.push("max_participants = ?"); vals.push(max_participants != null ? parseInt(max_participants) : null); }
  if (status)          { updates.push("status = ?");           vals.push(status); }

  if (!updates.length) { res.json({ success: true }); return; }

  vals.push(eventId, clubId);
  await exec(`UPDATE golf_events SET ${updates.join(", ")} WHERE id = ? AND club_id = ?`, vals);

  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: DELETE /admin/events/:id   → set status = 'cancelled'
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/admin/events/:id", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!isStaff(user)) { res.status(403).json({ message: "Forbidden" }); return; }
  const clubId = effectiveClubId(user, req.query.club_id ?? req.body?.club_id);
  if (clubId == null) { res.status(400).json({ message: "club_id required" }); return; }

  const eventId = parseInt(req.params.id, 10);
  await exec(
    "UPDATE golf_events SET status = 'cancelled' WHERE id = ? AND club_id = ?",
    [eventId, clubId]
  );
  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: GET /admin/events/:id/registrations
// List pending + decided registrations for an invitation_only event
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
    `SELECT er.id, er.status, er.registered_at,
            u.id as user_id, u.name as user_name, u.email as user_email
     FROM event_registrations er
     JOIN users u ON u.id = er.user_id
     WHERE er.event_id = ?
     ORDER BY er.registered_at ASC`,
    [eventId]
  );

  res.json({ registrations: regs });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: PUT /admin/events/:id/registrations/:userId
// Approve or reject a registration request
// ─────────────────────────────────────────────────────────────────────────────
router.put("/admin/events/:id/registrations/:userId", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!isStaff(user)) { res.status(403).json({ message: "Forbidden" }); return; }
  const clubId = effectiveClubId(user, req.query.club_id ?? req.body?.club_id);
  if (clubId == null) { res.status(400).json({ message: "club_id required" }); return; }

  const eventId = parseInt(req.params.id, 10);
  const targetId = parseInt(req.params.userId, 10);
  const { status } = req.body ?? {};

  if (!["approved", "rejected"].includes(status)) {
    res.status(400).json({ message: "status must be 'approved' or 'rejected'" }); return;
  }

  const event = await row<any>(
    "SELECT e.id, e.name, c.name as club_name FROM golf_events e JOIN clubs c ON c.id = e.club_id WHERE e.id = ? AND e.club_id = ?",
    [eventId, clubId]
  );
  if (!event) { res.status(404).json({ message: "Event not found" }); return; }

  await exec(
    "UPDATE event_registrations SET status = ? WHERE event_id = ? AND user_id = ?",
    [status, eventId, targetId]
  );

  // Notify the user
  const target = await row<any>("SELECT push_token FROM users WHERE id = ?", [targetId]);
  if (target?.push_token) {
    sendPushNotifications([{
      to:    target.push_token,
      sound: "default",
      title: status === "approved" ? `You're In! ⛳` : `Registration Update`,
      body:  status === "approved"
        ? `Your registration for "${event.name}" at ${event.club_name} has been approved. You can now book your tee time.`
        : `Your registration request for "${event.name}" at ${event.club_name} was not approved at this time.`,
      data:  { type: "event_registration_update", event_id: eventId, status },
    }]);
  }

  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: GET /admin/members
// List all members of the admin's club
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

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: GET /admin/members/search?q=email_or_name
// Search for users to add as members (not yet a member of this club)
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: POST /admin/members
// Add a user as a club member
// ─────────────────────────────────────────────────────────────────────────────
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
    await exec(
      "INSERT INTO club_members (club_id, user_id, membership_type, added_by) VALUES (?, ?, ?, ?)",
      [clubId, user_id, membership_type, user.id]
    );
  } catch (err: any) {
    if (err.code === "ER_DUP_ENTRY") {
      // Already a member — update status to active if suspended
      await exec(
        "UPDATE club_members SET status = 'active', membership_type = ? WHERE club_id = ? AND user_id = ?",
        [membership_type, clubId, user_id]
      );
    } else throw err;
  }

  // Notify the new member
  const targetUser = await row<any>("SELECT push_token FROM users WHERE id = ?", [user_id]);
  if (targetUser?.push_token) {
    sendPushNotifications([{
      to:    targetUser.push_token,
      sound: "default",
      title: "Club Membership ⛳",
      body:  `You have been added as a ${membership_type} member of ${club?.name ?? "the club"}. You now have access to members-only events.`,
      data:  { type: "club_membership_added", club_id: clubId },
    }]);
  }

  res.status(201).json({ success: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: PUT /admin/members/:userId
// Update membership type or status
// ─────────────────────────────────────────────────────────────────────────────
router.put("/admin/members/:userId", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!isStaff(user)) { res.status(403).json({ message: "Forbidden" }); return; }
  const clubId = effectiveClubId(user, req.query.club_id ?? req.body?.club_id);
  if (clubId == null) { res.status(400).json({ message: "club_id required" }); return; }

  const targetId = parseInt(req.params.userId, 10);
  const { membership_type, status } = req.body ?? {};

  const updates: string[] = [];
  const vals:    any[]    = [];

  if (membership_type && VALID_MEMBERSHIP_TYPES.includes(membership_type)) {
    updates.push("membership_type = ?"); vals.push(membership_type);
  }
  if (status && ["active", "suspended"].includes(status)) {
    updates.push("status = ?"); vals.push(status);
  }

  if (!updates.length) { res.json({ success: true }); return; }

  vals.push(clubId, targetId);
  await exec(`UPDATE club_members SET ${updates.join(", ")} WHERE club_id = ? AND user_id = ?`, vals);

  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: DELETE /admin/members/:userId
// Remove a user from club membership
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/admin/members/:userId", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!isStaff(user)) { res.status(403).json({ message: "Forbidden" }); return; }
  const clubId = effectiveClubId(user, req.query.club_id ?? req.body?.club_id);
  if (clubId == null) { res.status(400).json({ message: "club_id required" }); return; }

  const targetId = parseInt(req.params.userId, 10);
  await exec(
    "DELETE FROM club_members WHERE club_id = ? AND user_id = ?",
    [clubId, targetId]
  );

  res.json({ success: true });
});

export default router;
