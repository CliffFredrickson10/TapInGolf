import { Router } from "express";
import { query, row, run, exec } from "../lib/pg";
import { getUser } from "../lib/auth";
import { saveUserNotification } from "../lib/userNotifications";

const router = Router();

// GET /bans/me — list all club bans for the authenticated user (all statuses)
router.get("/bans/me", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const bans = await query<any>(
    `SELECT cb.id, cb.status, cb.reason, cb.appeal_message, cb.appealed_at,
            cb.appeal_response, cb.lift_note, cb.lifted_at, cb.created_at,
            c.id AS club_id, c.name AS club_name, c.location, c.logo_url
     FROM club_bans cb
     JOIN clubs c ON c.id = cb.club_id
     WHERE cb.user_id = ?
     ORDER BY CASE cb.status WHEN 'active' THEN 0 WHEN 'appealing' THEN 1 ELSE 2 END, cb.created_at DESC`,
    [user.id]
  );
  res.json(bans);
});

// POST /bans/:id/appeal — submit an appeal against an active ban
router.post("/bans/:id/appeal", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const id = parseInt(req.params.id, 10);
  const { message } = req.body ?? {};
  if (!message || String(message).trim().length < 10) {
    res.status(400).json({ message: "Please provide a meaningful appeal message (at least 10 characters)." });
    return;
  }

  const ban = await row<any>(
    `SELECT cb.id, cb.club_id, cb.status,
            c.name AS club_name
     FROM club_bans cb
     JOIN clubs c ON c.id = cb.club_id
     WHERE cb.id = ? AND cb.user_id = ?`,
    [id, user.id]
  );
  if (!ban) { res.status(404).json({ message: "Ban not found" }); return; }
  if (ban.status === "appealing") {
    res.status(409).json({ message: "You have already submitted an appeal. Please wait for the club to respond." });
    return;
  }
  if (ban.status === "lifted") {
    res.status(409).json({ message: "This ban has already been lifted." });
    return;
  }

  const appealText = String(message).trim();
  await run(
    "UPDATE club_bans SET status = 'appealing', appeal_message = ?, appealed_at = NOW() WHERE id = ?",
    [appealText, id]
  );

  // Notify the club via their portal inbox
  const clubTitle = `Appeal received — ${user.name}`;
  const clubBody = `${user.name} has submitted an appeal against their ban. Tap to review.`;
  await exec(
    `INSERT INTO club_inbox_notifications (club_id, type, title, body, meta) VALUES (?, ?, ?, ?, ?)`,
    [ban.club_id, "ban_appeal", clubTitle, clubBody, JSON.stringify({ ban_id: id, user_id: user.id, user_name: user.name })]
  ).catch(() => {});

  // Confirm receipt to the golfer (in-app notification)
  const userTitle = "Appeal Submitted";
  const userBody = `Your appeal to ${ban.club_name} has been received. The club will review it and respond.`;
  await saveUserNotification(user.id, "club_ban_appeal_sent", userTitle, userBody, { club_id: ban.club_id, ban_id: id });

  res.json({ success: true });
});

export default router;
