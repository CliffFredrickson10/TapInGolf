import { Router, type IRouter } from "express";
import { query } from "../lib/pg";

const router: IRouter = Router();

router.get("/ads", async (req, res): Promise<void> => {
  const placement = String(req.query.placement ?? "home");
  const clubId    = req.query.club_id ? parseInt(String(req.query.club_id)) : null;

  const where: string[] = ["a.active = 1", "a.placement = ?"];
  const params: any[]   = [placement];

  if (clubId) {
    where.push("(a.club_id IS NULL OR a.club_id = ?)");
    params.push(clubId);
  }

  const ads = await query<any>(
    `SELECT a.*, u.name as advertiser_name
     FROM ads a
     LEFT JOIN users u ON u.id = a.user_id
     WHERE ${where.join(" AND ")}
     ORDER BY a.priority DESC
     LIMIT 3`,
    params
  );

  res.json({ ads });
});

export default router;
