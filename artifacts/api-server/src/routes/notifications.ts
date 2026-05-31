import { Router, type IRouter } from "express";
import { query, row, exec } from "../lib/pg";
import { getUser, isStaff, effectiveClubId } from "../lib/auth";
import { sendPushNotifications } from "../lib/notifications";
import { saveUserNotification } from "../lib/userNotifications";

const router: IRouter = Router();

const VALID_TYPES = ["course_closed", "lightning", "course_open", "tee_shift", "general"] as const;

// ─────────────────────────────────────────────────────────────────────
// Helper: get users with upcoming bookings at a club
// If affected_date is provided, only bookings on that date
// Otherwise all future bookings (today and beyond)
// ─────────────────────────────────────────────────────────────────────
async function getBookedUsersForClub(clubId: number, affectedDate: string | null): Promise<any[]> {
  const today = new Date().toISOString().split("T")[0];

  if (affectedDate) {
    return query<any>(
      `SELECT DISTINCT u.id, u.name, u.push_token,
              pts.date as date,
              pts.tee_time as time
       FROM bookings b
       LEFT JOIN portal_tee_slots pts ON pts.id = b.portal_slot_id
       LEFT JOIN clubs c ON c.id = pts.club_id
       JOIN users u ON u.id = b.user_id
       WHERE c.id = ?
         AND pts.date = ?
         AND b.status IN ('confirmed', 'pending')
         AND u.push_token IS NOT NULL
       ORDER BY u.id`,
      [clubId, affectedDate]
    );
  }

  return query<any>(
    `SELECT DISTINCT u.id, u.name, u.push_token,
            MIN(pts.date) as date,
            MIN(pts.tee_time) as time
     FROM bookings b
     LEFT JOIN portal_tee_slots pts ON pts.id = b.portal_slot_id
     LEFT JOIN clubs c ON c.id = pts.club_id
     JOIN users u ON u.id = b.user_id
     WHERE c.id = ?
       AND pts.date >= ?
       AND b.status IN ('confirmed', 'pending')
       AND u.push_token IS NOT NULL
     GROUP BY u.id, u.name, u.push_token
     ORDER BY u.id`,
    [clubId, today]
  );
}

// ─────────────────────────────────────────────────────────────────────
// GET /admin/notifications/preview?date=YYYY-MM-DD
// Returns how many users would receive the broadcast
// ─────────────────────────────────────────────────────────────────────
router.get("/admin/notifications/preview", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!isStaff(user)) { res.status(403).json({ message: "Forbidden" }); return; }
  const clubId = effectiveClubId(user, req.query.club_id);
  if (clubId == null) { res.status(400).json({ message: "club_id required" }); return; }

  const date = req.query.date ? String(req.query.date) : null;
  const today = new Date().toISOString().split("T")[0];

  let countRow: any;
  if (date) {
    countRow = await row<any>(
      `SELECT COUNT(DISTINCT u.id) as cnt
       FROM bookings b
       LEFT JOIN portal_tee_slots pts ON pts.id = b.portal_slot_id
       LEFT JOIN clubs c ON c.id = pts.club_id
       JOIN users u ON u.id = b.user_id
       WHERE c.id = ?
         AND pts.date = ?
         AND b.status IN ('confirmed','pending')`,
      [clubId, date]
    );
  } else {
    countRow = await row<any>(
      `SELECT COUNT(DISTINCT u.id) as cnt
       FROM bookings b
       LEFT JOIN portal_tee_slots pts ON pts.id = b.portal_slot_id
       LEFT JOIN clubs c ON c.id = pts.club_id
       JOIN users u ON u.id = b.user_id
       WHERE c.id = ?
         AND pts.date >= ?
         AND b.status IN ('confirmed','pending')`,
      [clubId, today]
    );
  }

  res.json({ count: parseInt(countRow?.cnt ?? "0") });
});

// ─────────────────────────────────────────────────────────────────────
// POST /admin/notifications/broadcast
// Send a targeted notification to all booked golfers at the club
// ─────────────────────────────────────────────────────────────────────
router.post("/admin/notifications/broadcast", async (req, res): Promise<void> => {
  const caller = await getUser(req);
  if (!isStaff(caller)) { res.status(403).json({ message: "Forbidden" }); return; }
  const clubId = effectiveClubId(caller, req.body?.club_id);
  if (clubId == null) { res.status(400).json({ message: "club_id required" }); return; }

  const { type, title, body, tee_shift_minutes, affected_date } = req.body ?? {};

  if (!type || !VALID_TYPES.includes(type)) {
    res.status(400).json({ message: `type must be one of: ${VALID_TYPES.join(", ")}` });
    return;
  }
  if (!title || !body) {
    res.status(400).json({ message: "title and body are required" });
    return;
  }
  if (type === "tee_shift" && tee_shift_minutes == null) {
    res.status(400).json({ message: "tee_shift_minutes is required for tee_shift type" });
    return;
  }

  // Validate date if provided
  const dateParam: string | null = affected_date || null;
  if (dateParam && !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    res.status(400).json({ message: "affected_date must be YYYY-MM-DD" });
    return;
  }

  // Fetch club name for notification context
  const club = await row<any>("SELECT id, name FROM clubs WHERE id = ?", [clubId]);
  if (!club) { res.status(404).json({ message: "Club not found" }); return; }

  // Find all booked users
  const recipients = await getBookedUsersForClub(clubId, dateParam);
  const withTokens = recipients.filter((u: any) => u.push_token?.startsWith("ExponentPushToken["));

  // Build push messages
  const shiftLabel =
    type === "tee_shift" && tee_shift_minutes != null
      ? tee_shift_minutes > 0
        ? ` (pushed out by ${tee_shift_minutes} min)`
        : ` (brought forward by ${Math.abs(tee_shift_minutes)} min)`
      : "";

  const messages = withTokens.map((u: any) => ({
    to:    u.push_token as string,
    sound: "default" as const,
    title: `${club.name}: ${title}`,
    body:  `${body}${shiftLabel}`,
    data:  {
      type:            "club_broadcast",
      broadcast_type:  type,
      club_id:         clubId,
      affected_date:   dateParam,
      tee_shift_minutes: tee_shift_minutes ?? null,
    },
  }));

  // Send in batches of 100 (Expo push limit)
  for (let i = 0; i < messages.length; i += 100) {
    sendPushNotifications(messages.slice(i, i + 100));
  }

  // Persist notification record
  await exec(
    `INSERT INTO club_notifications
       (club_id, sent_by, type, title, body, tee_shift_minutes, affected_date, recipient_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      clubId,
      caller.id,
      type,
      String(title),
      String(body),
      tee_shift_minutes ?? null,
      dateParam,
      withTokens.length,
    ]
  );

  // Save per-user in-app notifications for all recipients (with or without push token)
  const fullTitle = `${club.name}: ${title}`;
  const fullBody  = `${body}${type === "tee_shift" && tee_shift_minutes != null ? (tee_shift_minutes > 0 ? ` (pushed out by ${tee_shift_minutes} min)` : ` (brought forward by ${Math.abs(tee_shift_minutes)} min)`) : ""}`;
  for (const u of recipients) {
    saveUserNotification(u.id, "club_broadcast", fullTitle, fullBody, { club_id: clubId, broadcast_type: type, affected_date: dateParam });
  }

  res.json({ success: true, recipient_count: withTokens.length, total_booked: recipients.length });
});

// ─────────────────────────────────────────────────────────────────────
// GET /admin/notifications
// Recent broadcast history for this club
// ─────────────────────────────────────────────────────────────────────
router.get("/admin/notifications", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!isStaff(user)) { res.status(403).json({ message: "Forbidden" }); return; }
  const clubId = effectiveClubId(user, req.query.club_id);
  if (clubId == null) { res.status(400).json({ message: "club_id required" }); return; }

  const limit  = Math.min(parseInt(String(req.query.limit ?? "30"), 10), 100);
  const offset = parseInt(String(req.query.offset ?? "0"), 10);

  const notifications = await query<any>(
    `SELECT n.id, n.type, n.title, n.body, n.tee_shift_minutes,
            n.affected_date, n.recipient_count, n.sent_at,
            u.name as sent_by_name
     FROM club_notifications n
     JOIN users u ON u.id = n.sent_by
     WHERE n.club_id = ?
     ORDER BY n.sent_at DESC
     LIMIT ${limit} OFFSET ${offset}`,
    [clubId]
  );

  res.json({ notifications });
});

// ─────────────────────────────────────────────────────────────────────
// GET /notifications — user's in-app notification inbox
// ─────────────────────────────────────────────────────────────────────
router.get("/notifications", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const limit  = Math.min(parseInt(String(req.query.limit  ?? "50"), 10), 100);
  const offset = parseInt(String(req.query.offset ?? "0"), 10);

  const rows = await query<any>(
    `SELECT id, type, title, body, data, is_read, created_at
     FROM user_notifications
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT ${limit} OFFSET ${offset}`,
    [user.id]
  );

  const notifications = rows.map((r: any) => ({
    ...r,
    data:    typeof r.data === "string" ? JSON.parse(r.data) : (r.data ?? {}),
    is_read: !!r.is_read,
  }));

  res.json({ notifications });
});

// ─────────────────────────────────────────────────────────────────────
// GET /notifications/unread-count
// ─────────────────────────────────────────────────────────────────────
router.get("/notifications/unread-count", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const r = await row<any>(
    "SELECT COUNT(*) as cnt FROM user_notifications WHERE user_id = ? AND is_read = 0",
    [user.id]
  );
  res.json({ count: parseInt(r?.cnt ?? "0") });
});

// ─────────────────────────────────────────────────────────────────────
// PATCH /notifications/read-all — mark all as read
// ─────────────────────────────────────────────────────────────────────
router.patch("/notifications/read-all", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  await exec("UPDATE user_notifications SET is_read = 1 WHERE user_id = ?", [user.id]);
  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────────────
// PATCH /notifications/:id/read — mark one notification as read
// ─────────────────────────────────────────────────────────────────────
router.patch("/notifications/:id/read", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const id = parseInt(req.params.id, 10);
  await exec(
    "UPDATE user_notifications SET is_read = 1 WHERE id = ? AND user_id = ?",
    [id, user.id]
  );
  res.json({ success: true });
});

export default router;
