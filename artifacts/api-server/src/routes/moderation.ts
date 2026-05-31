import { Router, type IRouter } from "express";
import { query, row, exec } from "../lib/pg";
import { getUser, isSuper } from "../lib/auth";

const router: IRouter = Router();

// Allowed report reasons — kept in sync with the mobile report sheet.
const REASONS = [
  "spam",
  "harassment",
  "hate_speech",
  "inappropriate",
  "threat",
  "impersonation",
  "other",
];

// ─────────────────────────────────────────────────────────────────────────────
// GOLFER: POST /reports
// Report a user (optionally a specific conversation/message) for objectionable
// content. The reported message text is snapshotted so it survives deletion.
// body: { reported_user_id, conversation_id?, message_id?, reason, note? }
// ─────────────────────────────────────────────────────────────────────────────
router.post("/reports", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const { reported_user_id, conversation_id, message_id, reason, note } = req.body ?? {};

  const reportedId = Number(reported_user_id);
  if (!reportedId || reportedId === user.id) {
    res.status(400).json({ message: "Invalid user to report" });
    return;
  }
  if (!REASONS.includes(String(reason))) {
    res.status(400).json({ message: `reason must be one of: ${REASONS.join(", ")}` });
    return;
  }

  const target = await row("SELECT id FROM users WHERE id = ?", [reportedId]);
  if (!target) { res.status(404).json({ message: "User not found" }); return; }

  // Validate the optional conversation reference: it must exist and the reporter
  // must be a participant (you can only report conversations you're part of).
  let convId: number | null = null;
  if (conversation_id != null) {
    const cid = Number(conversation_id);
    if (!cid) { res.status(400).json({ message: "Invalid conversation" }); return; }
    const member = await row(
      "SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?",
      [cid, user.id]
    );
    if (!member) { res.status(400).json({ message: "Invalid conversation" }); return; }
    convId = cid;
  }

  // Validate the optional message reference: it must exist and live in a
  // conversation the reporter belongs to. Snapshot its content so the report
  // survives deletion. Never insert an unvalidated id (would trip an FK error).
  let excerpt: string | null = null;
  let msgId: number | null = null;
  if (message_id != null) {
    const mid = Number(message_id);
    if (!mid) { res.status(400).json({ message: "Invalid message" }); return; }
    const m = await row<any>("SELECT content, conversation_id FROM messages WHERE id = ?", [mid]);
    if (!m) { res.status(400).json({ message: "Invalid message" }); return; }
    const member = await row(
      "SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?",
      [m.conversation_id, user.id]
    );
    if (!member) { res.status(403).json({ message: "You don't have access to that message" }); return; }
    excerpt = String(m.content).slice(0, 500);
    msgId = mid;
    if (convId == null) convId = Number(m.conversation_id);
  }

  // Collapse duplicate open reports from the same reporter against the same user.
  const dup = await row<any>(
    "SELECT id FROM message_reports WHERE reporter_id = ? AND reported_user_id = ? AND status = 'pending'",
    [user.id, reportedId]
  );
  if (dup) {
    res.status(200).json({ success: true, id: dup.id, duplicate: true });
    return;
  }

  const cleanNote = note ? String(note).trim().slice(0, 1000) : null;

  const id = await exec(
    `INSERT INTO message_reports
       (reporter_id, reported_user_id, conversation_id, message_id, reported_excerpt, reason, note)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [user.id, reportedId, convId, msgId, excerpt, String(reason), cleanNote]
  );

  res.status(201).json({ success: true, id, status: "pending" });
});

// ─────────────────────────────────────────────────────────────────────────────
// STAFF (super-user): GET /admin/reports?status=pending
// ─────────────────────────────────────────────────────────────────────────────
router.get("/admin/reports", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!isSuper(user)) { res.status(403).json({ message: "Forbidden" }); return; }

  const status = String(req.query.status ?? "pending");
  const valid = ["pending", "reviewed", "dismissed", "actioned", "all"];
  if (!valid.includes(status)) {
    res.status(400).json({ message: `status must be one of: ${valid.join(", ")}` });
    return;
  }

  const where = status === "all" ? "" : "WHERE r.status = ?";
  const params = status === "all" ? [] : [status];

  const rows = await query<any>(
    `SELECT r.id, r.reporter_id, r.reported_user_id, r.conversation_id, r.message_id,
            r.reported_excerpt, r.reason, r.note, r.status, r.review_note,
            r.created_at, r.reviewed_at,
            reporter.name AS reporter_name, reporter.email AS reporter_email,
            reported.name AS reported_name, reported.email AS reported_email,
            reviewer.name AS reviewer_name
       FROM message_reports r
       JOIN users reporter ON reporter.id = r.reporter_id
       JOIN users reported ON reported.id = r.reported_user_id
       LEFT JOIN users reviewer ON reviewer.id = r.reviewed_by
       ${where}
      ORDER BY
        CASE WHEN r.status = 'pending' THEN 0 ELSE 1 END,
        r.created_at DESC, r.id DESC`,
    params
  );

  res.json({ reports: rows });
});

// ─────────────────────────────────────────────────────────────────────────────
// STAFF (super-user): GET /admin/reports/count  → { pending }
// Declared before /:id so "count" isn't captured as an id.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/admin/reports/count", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!isSuper(user)) { res.status(403).json({ message: "Forbidden" }); return; }

  const result = await row<any>(
    "SELECT COUNT(*) AS pending FROM message_reports WHERE status = 'pending'"
  );
  res.json({ pending: Number(result?.pending ?? 0) });
});

// ─────────────────────────────────────────────────────────────────────────────
// STAFF (super-user): GET /admin/reports/:id
// Includes the reported message snapshot plus recent conversation context.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/admin/reports/:id", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!isSuper(user)) { res.status(403).json({ message: "Forbidden" }); return; }

  const id = parseInt(req.params.id, 10);
  const report = await row<any>(
    `SELECT r.id, r.reporter_id, r.reported_user_id, r.conversation_id, r.message_id,
            r.reported_excerpt, r.reason, r.note, r.status, r.review_note,
            r.created_at, r.reviewed_at,
            reporter.name AS reporter_name, reporter.email AS reporter_email,
            reported.name AS reported_name, reported.email AS reported_email,
            reviewer.name AS reviewer_name
       FROM message_reports r
       JOIN users reporter ON reporter.id = r.reporter_id
       JOIN users reported ON reported.id = r.reported_user_id
       LEFT JOIN users reviewer ON reviewer.id = r.reviewed_by
      WHERE r.id = ?`,
    [id]
  );
  if (!report) { res.status(404).json({ message: "Report not found" }); return; }

  // Pull the last 30 messages from the reported conversation for context.
  let context: any[] = [];
  if (report.conversation_id) {
    context = await query<any>(
      `SELECT m.id, m.sender_id, m.content, m.created_at, u.name AS sender_name
         FROM messages m
         JOIN users u ON u.id = m.sender_id
        WHERE m.conversation_id = ?
        ORDER BY m.id DESC
        LIMIT 30`,
      [report.conversation_id]
    );
    context.reverse();
  }

  res.json({ report, context });
});

// ─────────────────────────────────────────────────────────────────────────────
// STAFF (super-user): POST /admin/reports/:id/resolve
// body: { action: 'dismiss' | 'uphold', review_note? }
//   dismiss → status 'dismissed'   (no policy violation found)
//   uphold  → status 'actioned'    (violation confirmed / acted on)
// ─────────────────────────────────────────────────────────────────────────────
router.post("/admin/reports/:id/resolve", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!isSuper(user)) { res.status(403).json({ message: "Forbidden" }); return; }

  const id = parseInt(req.params.id, 10);
  const report = await row<any>(
    "SELECT id, status, reporter_id, reported_user_id FROM message_reports WHERE id = ?",
    [id]
  );
  if (!report) { res.status(404).json({ message: "Report not found" }); return; }

  const action = String(req.body?.action ?? "");
  if (action !== "dismiss" && action !== "uphold") {
    res.status(400).json({ message: "action must be 'dismiss' or 'uphold'" });
    return;
  }
  const newStatus = action === "uphold" ? "actioned" : "dismissed";
  const reviewNote = req.body?.review_note ? String(req.body.review_note).trim().slice(0, 1000) : null;

  await exec(
    `UPDATE message_reports
        SET status = ?, review_note = ?, reviewed_by = ?, reviewed_at = NOW()
      WHERE id = ?`,
    [newStatus, reviewNote, user.id, id]
  );

  // Upholding a report enforces two things on the reported user:
  //  1. A block between the two users (blockedBetween() is bidirectional, so a
  //     single row severs the DM either way). ON CONFLICT keeps it idempotent.
  //  2. A global chat ban — chat_disabled blocks them from starting conversations
  //     or sending messages anywhere in the app.
  let blocked = false;
  if (action === "uphold") {
    await exec(
      `INSERT INTO user_blocks (user_id, blocked_user_id)
       VALUES (?, ?)
       ON CONFLICT (user_id, blocked_user_id) DO NOTHING`,
      [report.reporter_id, report.reported_user_id]
    );
    await exec("UPDATE users SET chat_disabled = 1 WHERE id = ?", [report.reported_user_id]);
    blocked = true;
  }

  res.json({ success: true, status: newStatus, blocked });
});

export default router;
