import { Router, type IRouter } from "express";
import { query, row, exec, run } from "../lib/pg";
import { getUser } from "../lib/auth";
import { sendPushNotifications } from "../lib/notifications";
import { saveUserNotification } from "../lib/userNotifications";
import { sendInvitationEmail } from "../lib/otp";

const router: IRouter = Router();

router.get("/friends", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const friends = await query<any>(
    `SELECT u.id, u.name, u.email, u.handicap, u.profile_picture as avatar, 'accepted' as status
     FROM friendships f
     JOIN users u ON u.id = CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END
     WHERE (f.requester_id = ? OR f.addressee_id = ?) AND f.status = 'accepted'
     ORDER BY u.name ASC`,
    [user.id, user.id, user.id]
  );

  // Incoming: others sent to me — newest first so fresh requests are always at the top
  const pending = await query<any>(
    `SELECT f.id as friendship_id, u.id, u.name, u.email, u.handicap, u.profile_picture as avatar, 'pending' as status, 'incoming' as direction
     FROM friendships f
     JOIN users u ON u.id = f.requester_id
     WHERE f.addressee_id = ? AND f.status = 'pending'
     ORDER BY f.created_at DESC`,
    [user.id]
  );

  // Outgoing: I sent to others, awaiting response
  const requested = await query<any>(
    `SELECT f.id as friendship_id, u.id, u.name, u.email, u.handicap, u.profile_picture as avatar, 'pending' as status, 'outgoing' as direction
     FROM friendships f
     JOIN users u ON u.id = f.addressee_id
     WHERE f.requester_id = ? AND f.status = 'pending'
     ORDER BY u.name ASC`,
    [user.id]
  );

  friends.forEach((f: any) => { f.handicap = f.handicap ? parseFloat(f.handicap) : null; });
  pending.forEach((p: any) => { p.handicap = p.handicap ? parseFloat(p.handicap) : null; });
  requested.forEach((r: any) => { r.handicap = r.handicap ? parseFloat(r.handicap) : null; });

  const invited = await query<any>(
    `SELECT id, invitee_email as email, created_at FROM pending_invitations WHERE inviter_id = ? ORDER BY created_at DESC`,
    [user.id]
  );

  res.json({ friends, pending, requested, invited });
});

router.get("/users/search", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const q = String(req.query.q ?? "").trim();
  if (q.length < 2) { res.json({ users: [] }); return; }

  const pattern = `%${q}%`;
  const results = await query<any>(
    `SELECT u.id, u.name, u.email, u.profile_picture as avatar
     FROM users u
     WHERE u.id != ?
       AND u.active = 1
       AND (u.email ILIKE ? OR u.name ILIKE ?)
       AND u.id NOT IN (
         SELECT CASE WHEN requester_id = ? THEN addressee_id ELSE requester_id END
         FROM friendships
         WHERE (requester_id = ? OR addressee_id = ?) AND status IN ('accepted','pending')
       )
     ORDER BY
       CASE WHEN u.email ILIKE ? THEN 0 ELSE 1 END,
       u.name ASC
     LIMIT 6`,
    [user.id, pattern, pattern, user.id, user.id, user.id, `${q}%`]
  );

  res.json({ users: results });
});

router.post("/friends/request", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const email = String(req.body?.email ?? "").trim().toLowerCase();
  if (!email) { res.status(400).json({ message: "Email is required" }); return; }
  if (email === user.email) { res.status(400).json({ message: "You cannot add yourself" }); return; }

  const target = await row<any>("SELECT id, name FROM users WHERE email = ?", [email]);
  if (!target) {
    // User not found — store pending invitation and send email
    await exec(
      `INSERT INTO pending_invitations (inviter_id, invitee_email) VALUES (?, ?) ON CONFLICT (inviter_id, invitee_email) DO NOTHING`,
      [user.id, email]
    );
    try {
      await sendInvitationEmail(email, user.name);
    } catch (err) {
      req.log.warn({ err, email }, "Failed to send invitation email");
    }
    res.json({ invited: true, message: `Invitation sent to ${email}` });
    return;
  }

  const existing = await row(
    `SELECT id FROM friendships WHERE
     (requester_id = ? AND addressee_id = ?) OR
     (requester_id = ? AND addressee_id = ?)`,
    [user.id, target.id, target.id, user.id]
  );

  if (existing) {
    res.status(409).json({ message: "Friend request already exists" });
    return;
  }

  const { insertId: friendshipId } = await exec(
    "INSERT INTO friendships (requester_id, addressee_id, status) VALUES (?, ?, 'pending')",
    [user.id, target.id]
  );

  // Notify the target user
  const targetRow = await row<any>("SELECT push_token FROM users WHERE id = ?", [target.id]);
  if (targetRow?.push_token) {
    sendPushNotifications([{
      to: targetRow.push_token,
      sound: "default",
      title: "New Friend Request 🤝",
      body: `${user.name} wants to connect with you on TapIn Golf.`,
      data: { type: "friend_request", friendship_id: friendshipId },
    }]);
  }
  saveUserNotification(target.id, "friend_request", "New Friend Request 🤝", `${user.name} wants to connect with you on TapIn Golf.`, { friendship_id: friendshipId });

  res.json({ success: true, message: `Request sent to ${target.name}` });
});

router.put("/friends/:id/accept", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);

  const affected = await run(
    "UPDATE friendships SET status = 'accepted' WHERE id = ? AND addressee_id = ? AND status = 'pending'",
    [id, user.id]
  );

  if (!affected) {
    res.status(404).json({ message: "Friend request not found" });
    return;
  }

  // Notify the original requester that their request was accepted
  const friendship = await row<any>(
    "SELECT requester_id FROM friendships WHERE id = ?",
    [id]
  );
  if (friendship) {
    const requesterRow = await row<any>(
      "SELECT push_token FROM users WHERE id = ?",
      [friendship.requester_id]
    );
    if (requesterRow?.push_token) {
      sendPushNotifications([{
        to: requesterRow.push_token,
        sound: "default",
        title: "Friend Request Accepted! 🎉",
        body: `${user.name} accepted your friend request. You can now add them to a round.`,
        data: { type: "friend_accepted" },
      }]);
    }
    saveUserNotification(friendship.requester_id, "friend_accepted", "Friend Request Accepted! 🎉", `${user.name} accepted your friend request. You can now add them to a round.`);
  }

  res.json({ success: true });
});

router.delete("/friends/:id", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);

  await run(
    `DELETE FROM friendships WHERE
     (requester_id = ? AND addressee_id = ?) OR
     (requester_id = ? AND addressee_id = ?)`,
    [user.id, id, id, user.id]
  );

  res.json({ success: true });
});

router.delete("/friends/invitation/:id", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  if (isNaN(id)) { res.status(400).json({ message: "Invalid id" }); return; }

  await run(
    `DELETE FROM pending_invitations WHERE id = ? AND inviter_id = ?`,
    [id, user.id]
  );

  res.json({ success: true });
});

export default router;
