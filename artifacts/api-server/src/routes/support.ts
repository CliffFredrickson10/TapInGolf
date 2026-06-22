import { Router } from "express";
import { exec, query } from "../lib/pg";
import { getUser } from "../lib/auth";

const router = Router();

// POST /support/contact — submit a support message to TapIn Golf staff
router.post("/support/contact", async (req, res) => {
  const user = await getUser(req);

  const { name, email, subject, message } = req.body as {
    name?: string;
    email?: string;
    subject?: string;
    message?: string;
  };

  const resolvedName  = name?.trim()    || user?.name  || null;
  const resolvedEmail = email?.trim()   || user?.email || null;
  const resolvedSubj  = subject?.trim() || "General enquiry";
  const resolvedMsg   = message?.trim();

  if (!resolvedMsg) {
    return res.status(400).json({ error: "Message is required" });
  }
  if (!resolvedEmail) {
    return res.status(400).json({ error: "Email is required" });
  }

  const [row] = await query<{ id: number }>(
    `INSERT INTO support_messages (user_id, name, email, subject, message)
     VALUES (?, ?, ?, ?, ?)
     RETURNING id`,
    [user?.id ?? null, resolvedName, resolvedEmail, resolvedSubj, resolvedMsg]
  );

  return res.status(201).json({ id: row.id, message: "Your message has been received. We'll be in touch shortly." });
});

// GET /support/messages — staff only: list all support messages
router.get("/support/messages", async (req, res) => {
  const user = await getUser(req);
  if (!user || !(user.is_super_user || user.role === "club_admin")) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const rows = await query(
    `SELECT id, user_id, name, email, subject, message, status, created_at
       FROM support_messages
      ORDER BY created_at DESC
      LIMIT 200`,
    []
  );
  return res.json(rows);
});

export default router;
