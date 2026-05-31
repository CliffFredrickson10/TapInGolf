import { Router, type IRouter } from "express";
import { query, row, exec } from "../lib/pg";
import { getUser } from "../lib/auth";
import { sendPushNotifications } from "../lib/notifications";
import { saveUserNotification } from "../lib/userNotifications";

const router: IRouter = Router();

// Helper: verify user is a member of a conversation
async function isMember(conversationId: number, userId: number): Promise<boolean> {
  const r = await row(
    "SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?",
    [conversationId, userId]
  );
  return !!r;
}

// Helper: true if either user has blocked the other (block is bidirectional for chat).
async function blockedBetween(a: number, b: number): Promise<boolean> {
  const r = await row(
    `SELECT 1 FROM user_blocks
      WHERE (user_id = ? AND blocked_user_id = ?)
         OR (user_id = ? AND blocked_user_id = ?)
      LIMIT 1`,
    [a, b, b, a]
  );
  return !!r;
}

// Helper: true if the user has been globally banned from chat (e.g. an upheld report).
function chatDisabled(user: any): boolean {
  return !!user && (user.chat_disabled === 1 || user.chat_disabled === true);
}

// Helper: the other member of a 1:1 (DM) conversation, or null for groups/empty.
async function dmPartnerId(conversationId: number, userId: number): Promise<number | null> {
  const convo = await row<any>("SELECT is_group FROM conversations WHERE id = ?", [conversationId]);
  if (!convo || convo.is_group) return null;
  const other = await row<any>(
    "SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id != ? LIMIT 1",
    [conversationId, userId]
  );
  return other ? Number(other.user_id) : null;
}

// GET /conversations — list all conversations the user belongs to
router.get("/conversations", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  // Single query: conversations + last message + sender + member count
  const convos = await query<any>(
    `SELECT c.id, c.name, c.is_group, c.created_by, c.created_at, c.group_picture,
       lm.content  AS last_message,
       lm.created_at AS last_message_at,
       sender.name AS last_sender_name,
       mc.cnt      AS member_count
     FROM conversations c
     JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = ?
     LEFT JOIN messages lm ON lm.id = (
       SELECT id FROM messages WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1
     )
     LEFT JOIN users sender ON sender.id = lm.sender_id
     LEFT JOIN (
       SELECT conversation_id, COUNT(*) AS cnt FROM conversation_members GROUP BY conversation_id
     ) mc ON mc.conversation_id = c.id
     ORDER BY COALESCE(lm.created_at, c.created_at) DESC`,
    [user.id]
  );

  if (convos.length === 0) { res.json({ conversations: [] }); return; }

  const convoIds = convos.map((c: any) => c.id);

  // Batch query 1: other-user info for all DMs in one shot
  const dmPartners = await query<any>(
    `SELECT cm.conversation_id, u.id, u.name, u.profile_picture AS avatar
     FROM conversation_members cm
     JOIN users u ON u.id = cm.user_id
     WHERE cm.conversation_id IN (${convoIds.map(() => "?").join(",")}) AND cm.user_id != ?`,
    [...convoIds, user.id]
  );
  const partnerMap = new Map<number, any>();
  for (const p of dmPartners) {
    if (!partnerMap.has(p.conversation_id)) partnerMap.set(p.conversation_id, p);
  }

  // Batch query 2: group avatar samples for all group chats in one shot
  const groupAvatarRows = await query<any>(
    `SELECT cm.conversation_id, u.profile_picture AS avatar
     FROM conversation_members cm
     JOIN users u ON u.id = cm.user_id
     WHERE cm.conversation_id IN (${convoIds.map(() => "?").join(",")}) AND cm.user_id != ?
     ORDER BY cm.conversation_id, cm.id LIMIT ${convoIds.length * 2}`,
    [...convoIds, user.id]
  );
  const groupAvatarMap = new Map<number, string[]>();
  for (const r of groupAvatarRows) {
    if (!groupAvatarMap.has(r.conversation_id)) groupAvatarMap.set(r.conversation_id, []);
    const arr = groupAvatarMap.get(r.conversation_id)!;
    if (arr.length < 2 && r.avatar) arr.push(r.avatar);
  }

  // Enrich in JS — no more per-conversation round trips
  const seenDmPartner = new Set<number>();
  const deduped: any[] = [];
  for (const c of convos) {
    c.is_group = !!c.is_group;
    if (!c.is_group) {
      const other = partnerMap.get(c.id);
      c.display_name  = other?.name   ?? "Chat";
      c.other_user_id = other?.id     ?? null;
      c.other_avatar  = other?.avatar ?? null;
      if (c.other_user_id != null && seenDmPartner.has(c.other_user_id)) continue;
      if (c.other_user_id != null) seenDmPartner.add(c.other_user_id);
    } else {
      c.display_name  = c.name ?? "Group Chat";
      c.group_avatars = groupAvatarMap.get(c.id) ?? [];
    }
    deduped.push(c);
  }

  res.json({ conversations: deduped });
});

// POST /conversations — create DM or group chat
router.post("/conversations", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  // Globally chat-banned users (upheld report) cannot start conversations.
  if (chatDisabled(user)) {
    res.status(403).json({ message: "Your chat access has been disabled." });
    return;
  }

  const { member_ids, name, is_group = false } = req.body ?? {};
  if (!Array.isArray(member_ids) || member_ids.length === 0) {
    res.status(400).json({ message: "member_ids is required" });
    return;
  }

  const allMemberIds: number[] = [...new Set([user.id, ...member_ids.map(Number)])];

  // Shape invariant: a non-group conversation is a 1:1 DM — exactly two members.
  // Enforcing this stops a blocked user being smuggled into a "DM" with 3+ members
  // to dodge the block check below.
  if (!is_group && allMemberIds.length !== 2) {
    res.status(400).json({ message: "A direct message must have exactly one other member." });
    return;
  }

  // Block enforcement: you cannot start a DM with someone you've blocked or who blocked you.
  if (!is_group) {
    const otherId = allMemberIds.find(id => id !== user.id)!;
    if (await blockedBetween(user.id, otherId)) {
      res.status(403).json({ message: "You can't message this user." });
      return;
    }
  }

  // For DMs, always reuse the most recently active existing conversation
  if (!is_group && allMemberIds.length === 2) {
    const otherId = allMemberIds.find(id => id !== user.id)!;
    const existing = await row<any>(
      `SELECT c.id FROM conversations c
       JOIN conversation_members cm1 ON cm1.conversation_id = c.id AND cm1.user_id = ?
       JOIN conversation_members cm2 ON cm2.conversation_id = c.id AND cm2.user_id = ?
       WHERE c.is_group = 0
       ORDER BY (SELECT MAX(created_at) FROM messages WHERE conversation_id = c.id) DESC, c.created_at DESC
       LIMIT 1`,
      [user.id, otherId]
    );
    if (existing) {
      res.json({ conversation_id: existing.id, existing: true });
      return;
    }
  }

  const conversationId = await exec(
    "INSERT INTO conversations (name, is_group, created_by) VALUES (?, ?, ?)",
    [is_group ? (name ?? "Group Chat") : null, is_group ? 1 : 0, user.id]
  );

  for (const memberId of allMemberIds) {
    await exec(
      "INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?) ON CONFLICT (conversation_id, user_id) DO NOTHING",
      [conversationId, memberId]
    );
  }

  // Notify members (excluding creator)
  const memberRows = await query<any>(
    `SELECT id, name, push_token FROM users WHERE id IN (${allMemberIds.map(() => "?").join(",")}) AND push_token IS NOT NULL`,
    allMemberIds
  );
  const msgs = memberRows
    .filter((m: any) => m.id !== user.id && m.push_token)
    .map((m: any) => ({
      to: m.push_token as string,
      sound: "default" as const,
      title: is_group ? `Added to "${name ?? "Group Chat"}"` : `New message from ${user.name}`,
      body: is_group
        ? `${user.name} added you to a group chat.`
        : `${user.name} started a conversation with you.`,
      data: { type: "new_conversation", conversation_id: conversationId },
    }));
  sendPushNotifications(msgs);

  res.status(201).json({ conversation_id: conversationId, existing: false });
});

// GET /conversations/:id — details + members
router.get("/conversations/:id", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const id = parseInt(req.params.id, 10);
  if (!await isMember(id, user.id)) { res.status(403).json({ message: "Forbidden" }); return; }

  const convo = await row<any>("SELECT * FROM conversations WHERE id = ?", [id]);
  if (!convo) { res.status(404).json({ message: "Not found" }); return; }

  const members = await query<any>(
    `SELECT u.id, u.name, u.email, u.profile_picture as avatar FROM users u
     JOIN conversation_members cm ON cm.user_id = u.id
     WHERE cm.conversation_id = ?`,
    [id]
  );

  convo.is_group = !!convo.is_group;
  if (!convo.is_group) {
    const other = members.find((m: any) => m.id !== user.id);
    convo.display_name = other?.name ?? "Chat";
  } else {
    convo.display_name = convo.name ?? "Group Chat";
  }

  res.json({ conversation: convo, members });
});

// PUT /conversations/:id — update group name / picture (admin/creator only)
router.put("/conversations/:id", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const id = parseInt(req.params.id, 10);
  if (!await isMember(id, user.id)) { res.status(403).json({ message: "Forbidden" }); return; }

  const convo = await row<any>("SELECT * FROM conversations WHERE id = ?", [id]);
  if (!convo) { res.status(404).json({ message: "Not found" }); return; }
  if (!convo.is_group) { res.status(400).json({ message: "Not a group conversation" }); return; }
  if (convo.created_by !== user.id) { res.status(403).json({ message: "Only the group admin can edit group settings" }); return; }

  const { name, group_picture } = req.body ?? {};
  const updates: string[] = [];
  const params: any[] = [];

  if (name !== undefined) { updates.push("name = ?"); params.push(String(name).trim() || "Group Chat"); }
  if (group_picture !== undefined) { updates.push("group_picture = ?"); params.push(group_picture || null); }

  if (updates.length === 0) { res.status(400).json({ message: "Nothing to update" }); return; }

  params.push(id);
  await exec(`UPDATE conversations SET ${updates.join(", ")} WHERE id = ?`, params);

  const updated = await row<any>("SELECT * FROM conversations WHERE id = ?", [id]);
  res.json({ success: true, conversation: updated });
});

// DELETE /conversations/:id — delete a group and all its content (admin only)
router.delete("/conversations/:id", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const id = parseInt(req.params.id, 10);

  const convo = await row<any>("SELECT * FROM conversations WHERE id = ?", [id]);
  if (!convo) { res.status(404).json({ message: "Not found" }); return; }
  if (!convo.is_group) { res.status(400).json({ message: "Can only delete group conversations" }); return; }
  if (convo.created_by !== user.id) { res.status(403).json({ message: "Only the group admin can delete this group" }); return; }

  // conversation_members and messages both CASCADE on conversations.id
  await exec("DELETE FROM conversations WHERE id = ?", [id]);

  res.json({ success: true });
});

// POST /conversations/:id/members — add a member (admin only)
router.post("/conversations/:id/members", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const id = parseInt(req.params.id, 10);
  if (!await isMember(id, user.id)) { res.status(403).json({ message: "Forbidden" }); return; }

  const convo = await row<any>("SELECT * FROM conversations WHERE id = ?", [id]);
  if (!convo) { res.status(404).json({ message: "Not found" }); return; }
  if (!convo.is_group) { res.status(400).json({ message: "Not a group conversation" }); return; }
  if (convo.created_by !== user.id) { res.status(403).json({ message: "Only the group admin can add members" }); return; }

  const { user_id } = req.body ?? {};
  if (!user_id) { res.status(400).json({ message: "user_id is required" }); return; }

  const targetUser = await row<any>("SELECT id, name FROM users WHERE id = ?", [Number(user_id)]);
  if (!targetUser) { res.status(404).json({ message: "User not found" }); return; }

  await exec(
    "INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?) ON CONFLICT (conversation_id, user_id) DO NOTHING",
    [id, Number(user_id)]
  );

  res.status(201).json({ success: true, message: `${targetUser.name} added to group` });
});

// DELETE /conversations/:id/members/:userId — remove a member (admin) OR leave (self)
router.delete("/conversations/:id/members/:userId", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const id = parseInt(req.params.id, 10);
  if (!await isMember(id, user.id)) { res.status(403).json({ message: "Forbidden" }); return; }

  const convo = await row<any>("SELECT * FROM conversations WHERE id = ?", [id]);
  if (!convo) { res.status(404).json({ message: "Not found" }); return; }
  if (!convo.is_group) { res.status(400).json({ message: "Not a group conversation" }); return; }

  const targetId = parseInt(req.params.userId, 10);
  const isSelf  = targetId === user.id;
  const isAdmin = convo.created_by === user.id;

  // A member may only remove themselves or (if admin) someone else.
  if (!isSelf && !isAdmin) {
    res.status(403).json({ message: "Only the group admin can remove other members" }); return;
  }
  // The admin cannot leave — they must delete the group instead.
  if (isSelf && isAdmin) {
    res.status(400).json({ message: "As the group admin you cannot leave. Delete the group instead." }); return;
  }
  // Nobody can remove the admin.
  if (!isSelf && targetId === convo.created_by) {
    res.status(400).json({ message: "Cannot remove the group admin" }); return;
  }

  await exec(
    "DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?",
    [id, targetId]
  );

  res.json({ success: true });
});

// GET /conversations/:id/messages — paginated message history
router.get("/conversations/:id/messages", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const id = parseInt(req.params.id, 10);
  if (!await isMember(id, user.id)) { res.status(403).json({ message: "Forbidden" }); return; }

  const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10), 100);
  const before = req.query.before ? parseInt(String(req.query.before), 10) : null;
  const after  = req.query.after  ? parseInt(String(req.query.after),  10) : null;

  let whereExtra = "";
  const params: any[] = [id];
  if (after !== null) {
    // Poll mode: only return messages newer than the given id (cheap, index-covered)
    whereExtra = "AND m.id > ?";
    params.push(after);
  } else if (before !== null) {
    whereExtra = "AND m.id < ?";
    params.push(before);
  }
  params.push(limit);

  const msgs = await query<any>(
    `SELECT m.id, m.content, m.created_at, u.id as sender_id, u.name as sender_name, u.profile_picture as sender_avatar
     FROM messages m
     JOIN users u ON u.id = m.sender_id
     WHERE m.conversation_id = ? ${whereExtra}
     ORDER BY m.id ${after !== null ? "ASC" : "DESC"}
     LIMIT ${Number(limit)}`,
    params.slice(0, -1)
  );

  res.json({ messages: after !== null ? msgs : msgs.reverse() });
});

// POST /conversations/:id/messages — send a message
router.post("/conversations/:id/messages", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  // Globally chat-banned users (upheld report) cannot send any messages.
  if (chatDisabled(user)) {
    res.status(403).json({ message: "Your chat access has been disabled." });
    return;
  }

  const id = parseInt(req.params.id, 10);
  if (!await isMember(id, user.id)) { res.status(403).json({ message: "Forbidden" }); return; }

  const content = String(req.body?.content ?? "").trim();
  if (!content) { res.status(400).json({ message: "content is required" }); return; }

  // Block enforcement: in a DM, neither party may send if a block exists either way.
  const partnerId = await dmPartnerId(id, user.id);
  if (partnerId != null && await blockedBetween(user.id, partnerId)) {
    res.status(403).json({ message: "You can't message this user." });
    return;
  }

  const messageId = await exec(
    "INSERT INTO messages (conversation_id, sender_id, content) VALUES (?, ?, ?)",
    [id, user.id, content]
  );

  // Push notify other members (non-blocking)
  const others = await query<any>(
    `SELECT u.id, u.push_token FROM users u
     JOIN conversation_members cm ON cm.user_id = u.id
     WHERE cm.conversation_id = ? AND cm.user_id != ? AND u.push_token IS NOT NULL`,
    [id, user.id]
  );

  const convo = await row<any>("SELECT name, is_group FROM conversations WHERE id = ?", [id]);
  const chatName = convo?.is_group ? (convo.name ?? "Group Chat") : user.name;

  const pushTitle = `${user.name}${convo?.is_group ? ` in ${chatName}` : ""}`;
  const pushBody = content.length > 80 ? content.slice(0, 80) + "…" : content;

  sendPushNotifications(
    others
      .filter((o: any) => o.push_token)
      .map((o: any) => ({
        to: o.push_token as string,
        sound: "default" as const,
        title: pushTitle,
        body: pushBody,
        data: { type: "new_message", conversation_id: id },
      }))
  );

  // Save in-app notifications for all other members (regardless of push token)
  const allOthers = await query<any>(
    `SELECT u.id FROM users u
     JOIN conversation_members cm ON cm.user_id = u.id
     WHERE cm.conversation_id = ? AND cm.user_id != ?`,
    [id, user.id]
  );
  for (const o of allOthers) {
    saveUserNotification(o.id, "new_message", pushTitle, pushBody, { conversation_id: id });
  }

  res.status(201).json({
    id: messageId,
    conversation_id: id,
    sender_id: user.id,
    sender_name: user.name,
    content,
    created_at: new Date().toISOString(),
  });
});

export default router;
