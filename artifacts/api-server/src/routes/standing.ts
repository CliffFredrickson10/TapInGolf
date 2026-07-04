import { Router, type IRouter } from "express";
import { query, run } from "../lib/pg";
import { getUser } from "../lib/auth";

const router: IRouter = Router();

function fmtDate(d: any): string {
  return (d instanceof Date ? d.toISOString() : String(d)).slice(0, 10);
}

// ── My upcoming standing tee time holds ──────────────────────────────────────
router.get("/standing/mine", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const rows = await query<any>(
    `SELECT sh.id, sh.status, sh.confirm_by, sh.slot_id, sh.booking_id,
            pts.date, pts.tee_time, pts.event_id,
            ge.name AS event_name,
            c.id AS club_id, c.name AS club_name, c.location AS club_location
     FROM standing_holds sh
     JOIN portal_tee_slots pts ON pts.id = sh.slot_id
     LEFT JOIN golf_events ge ON ge.id = pts.event_id
     JOIN clubs c ON c.id = pts.club_id
     WHERE sh.user_id = ? AND sh.status IN ('held', 'confirmed')
       AND pts.date >= CURRENT_DATE
     ORDER BY pts.date ASC, pts.tee_time ASC`,
    [user.id]
  );

  res.json(rows.map((r: any) => ({
    id:            r.id,
    status:        r.status,
    confirm_by:    r.confirm_by instanceof Date ? r.confirm_by.toISOString() : r.confirm_by,
    slot_id:       r.slot_id,
    booking_id:    r.booking_id,
    date:          fmtDate(r.date),
    tee_time:      String(r.tee_time).slice(0, 5),
    club_id:       r.club_id,
    club_name:     r.club_name,
    club_location: r.club_location,
    event_id:      r.event_id ?? null,
    event_name:    r.event_name ?? null,
  })));
});

// ── Decline a hold (release my seat early) ───────────────────────────────────
router.post("/standing/holds/:id/decline", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ message: "Invalid hold id" }); return; }

  const updated = await run(
    "UPDATE standing_holds SET status = 'declined' WHERE id = ? AND user_id = ? AND status = 'held'",
    [id, user.id]
  );
  if (!updated) { res.status(404).json({ message: "Hold not found or already confirmed" }); return; }
  res.json({ success: true });
});

export default router;
