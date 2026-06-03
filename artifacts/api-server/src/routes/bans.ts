import { Router } from "express";
import { query, row, run } from "../lib/pg";
import { getUser } from "../lib/auth";

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
    "SELECT id, club_id, status FROM club_bans WHERE id = ? AND user_id = ?",
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

  await run(
    "UPDATE club_bans SET status = 'appealing', appeal_message = ?, appealed_at = NOW() WHERE id = ?",
    [String(message).trim(), id]
  );

  res.json({ success: true });
});

export default router;
