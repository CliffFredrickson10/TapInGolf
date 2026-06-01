import { Router, type IRouter } from "express";
import { query, row, exec } from "../lib/pg";
import { getUser, isSuper } from "../lib/auth";
import { getHnaStatus } from "../lib/hna";
import { sendPushNotifications } from "../lib/notifications";

const router: IRouter = Router();

const cleanHna = (v: unknown): string => String(v ?? "").trim().replace(/\D/g, "");

// ─────────────────────────────────────────────────────────────────────────────
// GOLFER: GET /hna/verification
// Returns the golfer's latest card submission (if any) plus their derived HNA status.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/hna/verification", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const fresh = await row<any>("SELECT hna_number FROM users WHERE id = ?", [user.id]);
  const status = await getHnaStatus(user.id, fresh?.hna_number ?? null);

  const submission = await row<any>(
    `SELECT id, hna_number, status, review_note, valid_until, created_at, reviewed_at
       FROM hna_verifications
      WHERE user_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT 1`,
    [user.id]
  );

  const rejectedRow = await row<any>(
    "SELECT COUNT(*) AS cnt FROM hna_verifications WHERE user_id = ? AND status = 'rejected'",
    [user.id]
  );

  res.json({
    hna_number:    status.hna_number,
    hna_verified:  status.hna_verified,
    hna_verified_source: status.hna_verified_source,
    hna_verified_club_name: status.hna_verified_club_name,
    hna_valid_until: status.hna_valid_until,
    hna_locked:    status.hna_locked,
    submission:    submission ?? null,
    rejected_count: Number(rejectedRow?.cnt ?? 0),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GOLFER: POST /hna/verification
// Submit a photo of the physical SA Player ID (HNA) card for TapIn staff review.
// body: { hna_number, card_image (base64 data URI) }
// ─────────────────────────────────────────────────────────────────────────────
router.post("/hna/verification", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const { hna_number, card_image, home_club } = req.body ?? {};

  const num = cleanHna(hna_number);
  if (num.length !== 10) {
    res.status(400).json({ message: "HNA number must be exactly 10 digits" });
    return;
  }
  if (!home_club || typeof home_club !== "string" || !home_club.trim()) {
    res.status(400).json({ message: "Please select your home club" });
    return;
  }
  if (!card_image || typeof card_image !== "string" || !card_image.startsWith("data:image/")) {
    res.status(400).json({ message: "A photo of your HNA card is required" });
    return;
  }
  if (card_image.length > 2_800_000) {
    res.status(413).json({ message: "Image too large (max ~2 MB)" });
    return;
  }

  // Already verified (by a club membership or an approved card)? Nothing to do.
  const fresh = await row<any>("SELECT hna_number FROM users WHERE id = ?", [user.id]);
  const status = await getHnaStatus(user.id, fresh?.hna_number ?? null);
  if (status.hna_verified) {
    res.status(400).json({ message: "Your HNA is already verified" });
    return;
  }

  // Enforce 2-attempt cap: count prior rejections.
  const rejectedRow = await row<any>(
    "SELECT COUNT(*) AS cnt FROM hna_verifications WHERE user_id = ? AND status = 'rejected'",
    [user.id]
  );
  if (Number(rejectedRow?.cnt ?? 0) >= 2) {
    res.status(403).json({
      message: "Maximum verification attempts reached. Please email support@tapingolf.co.za for assistance.",
    });
    return;
  }

  // Keep the HNA number on the profile so status reads consistently while pending.
  await exec("UPDATE users SET hna_number = ? WHERE id = ?", [num, user.id]);

  // Only one open (pending) submission at a time — supersede any earlier pending one.
  await exec("DELETE FROM hna_verifications WHERE user_id = ? AND status = 'pending'", [user.id]);

  const clubNameVal = String(home_club).trim().slice(0, 255);
  const result = await exec(
    `INSERT INTO hna_verifications (user_id, hna_number, card_image, status, club_name)
     VALUES (?, ?, ?, 'pending', ?)`,
    [user.id, num, card_image, clubNameVal]
  );

  res.status(201).json({ success: true, id: (result as any).insertId, status: "pending" });
});

// ─────────────────────────────────────────────────────────────────────────────
// STAFF (super-user): GET /admin/hna-verifications?status=pending
// Review queue — metadata only (card image fetched per-row via the detail endpoint).
// ─────────────────────────────────────────────────────────────────────────────
router.get("/admin/hna-verifications", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!isSuper(user)) { res.status(403).json({ message: "Forbidden" }); return; }

  const status = String(req.query.status ?? "pending");
  const valid = ["pending", "approved", "rejected", "all"];
  if (!valid.includes(status)) {
    res.status(400).json({ message: `status must be one of: ${valid.join(", ")}` });
    return;
  }

  const where = status === "all" ? "" : "WHERE v.status = ?";
  const params = status === "all" ? [] : [status];

  const rows = await query<any>(
    `SELECT v.id, v.user_id, v.hna_number, v.status, v.review_note,
            v.valid_until, v.created_at, v.reviewed_at, v.club_name,
            u.name AS user_name, u.email AS user_email,
            r.name AS reviewer_name
       FROM hna_verifications v
       JOIN users u ON u.id = v.user_id
       LEFT JOIN users r ON r.id = v.reviewed_by
       ${where}
      ORDER BY
        CASE WHEN v.status = 'pending' THEN 0 ELSE 1 END,
        v.created_at DESC, v.id DESC`,
    params
  );

  res.json({ verifications: rows });
});

// ─────────────────────────────────────────────────────────────────────────────
// STAFF (super-user): GET /admin/hna-verifications/count  → { pending }
// Lightweight badge count for the staff nav. Declared before /:id so "count"
// isn't captured as an id.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/admin/hna-verifications/count", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!isSuper(user)) { res.status(403).json({ message: "Forbidden" }); return; }

  const result = await row<any>(
    "SELECT COUNT(*) AS pending FROM hna_verifications WHERE status = 'pending'"
  );
  res.json({ pending: Number(result?.pending ?? 0) });
});

// ─────────────────────────────────────────────────────────────────────────────
// STAFF (super-user): GET /admin/hna-verifications/:id  (includes the card image)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/admin/hna-verifications/:id", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!isSuper(user)) { res.status(403).json({ message: "Forbidden" }); return; }

  const id = parseInt(req.params.id, 10);
  const v = await row<any>(
    `SELECT v.id, v.user_id, v.hna_number, v.card_image, v.status, v.review_note,
            v.valid_until, v.created_at, v.reviewed_at, v.club_name,
            u.name AS user_name, u.email AS user_email, u.handicap,
            r.name AS reviewer_name
       FROM hna_verifications v
       JOIN users u ON u.id = v.user_id
       LEFT JOIN users r ON r.id = v.reviewed_by
      WHERE v.id = ?`,
    [id]
  );
  if (!v) { res.status(404).json({ message: "Verification not found" }); return; }
  res.json({ verification: v });
});

// ─────────────────────────────────────────────────────────────────────────────
// STAFF (super-user): POST /admin/hna-verifications/:id/approve  { valid_until? }
// ─────────────────────────────────────────────────────────────────────────────
router.post("/admin/hna-verifications/:id/approve", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!isSuper(user)) { res.status(403).json({ message: "Forbidden" }); return; }

  const id = parseInt(req.params.id, 10);
  const v = await row<any>("SELECT id, user_id, hna_number, status, club_name FROM hna_verifications WHERE id = ?", [id]);
  if (!v) { res.status(404).json({ message: "Verification not found" }); return; }

  const validUntil = req.body?.valid_until ? String(req.body.valid_until) : null;
  if (validUntil && !/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) {
    res.status(400).json({ message: "valid_until must be YYYY-MM-DD" });
    return;
  }

  // club_name is supplied by the reviewer from the portal's club search.
  // It is optional: some HNA numbers may belong to clubs not yet in the DB.
  const clubName: string | null = req.body?.club_name
    ? String(req.body.club_name).trim().slice(0, 255) || null
    : (v.club_name ?? null);

  await exec(
    `UPDATE hna_verifications
        SET status = 'approved', review_note = NULL, valid_until = ?,
            reviewed_by = ?, reviewed_at = NOW(), club_name = ?
      WHERE id = ?`,
    [validUntil, user.id, clubName, id]
  );

  // Lock the approved number onto the golfer's profile so their HNA reads verified.
  await exec("UPDATE users SET hna_number = ? WHERE id = ?", [v.hna_number, v.user_id]);

  const target = await row<any>("SELECT push_token FROM users WHERE id = ?", [v.user_id]);
  if (target?.push_token) {
    sendPushNotifications([{
      to:    target.push_token,
      sound: "default",
      title: "HNA Verified ✅",
      body:  validUntil
        ? `Your SA Player ID has been verified by TapIn (valid until ${validUntil}). You now get affiliated-visitor rates.`
        : `Your SA Player ID has been verified by TapIn. You now get affiliated-visitor rates.`,
      data:  { type: "hna_verification_update", status: "approved" },
    }]);
  }

  res.json({ success: true, status: "approved" });
});

// ─────────────────────────────────────────────────────────────────────────────
// STAFF (super-user): POST /admin/hna-verifications/:id/reject  { note? }
// ─────────────────────────────────────────────────────────────────────────────
router.post("/admin/hna-verifications/:id/reject", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!isSuper(user)) { res.status(403).json({ message: "Forbidden" }); return; }

  const id = parseInt(req.params.id, 10);
  const v = await row<any>("SELECT id, user_id, status FROM hna_verifications WHERE id = ?", [id]);
  if (!v) { res.status(404).json({ message: "Verification not found" }); return; }

  const note = req.body?.note ? String(req.body.note).trim().slice(0, 500) : null;
  if (!note) {
    res.status(400).json({ message: "A rejection note is required" });
    return;
  }

  await exec(
    `UPDATE hna_verifications
        SET status = 'rejected', review_note = ?, valid_until = NULL,
            reviewed_by = ?, reviewed_at = NOW()
      WHERE id = ?`,
    [note, user.id, id]
  );

  const target = await row<any>("SELECT push_token FROM users WHERE id = ?", [v.user_id]);
  if (target?.push_token) {
    sendPushNotifications([{
      to:    target.push_token,
      sound: "default",
      title: "HNA Verification Update",
      body:  note
        ? `Your HNA card could not be verified: ${note}. You can submit a clearer photo.`
        : `Your HNA card could not be verified. Please submit a clearer photo of your SA Player ID.`,
      data:  { type: "hna_verification_update", status: "rejected" },
    }]);
  }

  res.json({ success: true, status: "rejected" });
});

// ─────────────────────────────────────────────────────────────────────────────
// STAFF (super-user): POST /admin/hna-verifications/:id/reset
// Revert an approved or rejected verification back to pending so it can be
// re-reviewed. Clears all review data (note, reviewer, timestamp, valid_until).
// club_name is preserved so the submission retains its original club context.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/admin/hna-verifications/:id/reset", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!isSuper(user)) { res.status(403).json({ message: "Forbidden" }); return; }

  const id = parseInt(req.params.id, 10);
  const v = await row<any>("SELECT id, user_id, status FROM hna_verifications WHERE id = ?", [id]);
  if (!v) { res.status(404).json({ message: "Verification not found" }); return; }
  if (v.status === "pending") {
    res.status(400).json({ message: "Verification is already pending" });
    return;
  }

  await exec(
    `UPDATE hna_verifications
        SET status = 'pending', review_note = NULL, valid_until = NULL,
            reviewed_by = NULL, reviewed_at = NULL
      WHERE id = ?`,
    [id]
  );

  const target = await row<any>("SELECT push_token FROM users WHERE id = ?", [v.user_id]);
  if (target?.push_token) {
    sendPushNotifications([{
      to:    target.push_token,
      sound: "default",
      title: "HNA Verification Update",
      body:  "Your HNA card is under review again. You'll be notified once it's finalised.",
      data:  { type: "hna_verification_update", status: "pending" },
    }]);
  }

  res.json({ success: true, status: "pending" });
});

// ─────────────────────────────────────────────────────────────────────────────
// STAFF (super-user): DELETE /admin/hna-verifications/:id
// Completely wipes all HNA verification records for the golfer associated with
// this verification ID, and clears their hna_number so they can start fresh.
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/admin/hna-verifications/:id", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!isSuper(user)) { res.status(403).json({ message: "Forbidden" }); return; }

  const id = parseInt(req.params.id, 10);
  const v = await row<any>("SELECT id, user_id FROM hna_verifications WHERE id = ?", [id]);
  if (!v) { res.status(404).json({ message: "Verification not found" }); return; }

  // Delete every verification row for this golfer (full reset — clears attempt history).
  await exec("DELETE FROM hna_verifications WHERE user_id = ?", [v.user_id]);

  // Clear the HNA number from their profile so they can submit fresh.
  await exec("UPDATE users SET hna_number = NULL WHERE id = ?", [v.user_id]);

  const target = await row<any>("SELECT push_token FROM users WHERE id = ?", [v.user_id]);
  if (target?.push_token) {
    sendPushNotifications([{
      to:    target.push_token,
      sound: "default",
      title: "HNA Verification Reset",
      body:  "Your HNA verification has been reset by TapIn. You can submit a new card photo from your profile.",
      data:  { type: "hna_verification_update", status: "deleted" },
    }]);
  }

  res.json({ success: true, deleted: true });
});

export default router;
