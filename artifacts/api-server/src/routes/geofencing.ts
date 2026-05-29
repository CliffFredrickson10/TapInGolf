import { Router, type IRouter } from "express";
import { query, exec, row } from "../lib/pg";
import { getUser } from "../lib/auth";

const router: IRouter = Router();

// Helper: platform admin = club_admin with no club assigned
function isPlatformAdmin(user: any) {
  return user?.role === "club_admin" && user?.club_id == null;
}

// ─────────────────────────────────────────────────────────────────────
// GET /clubs/geofences
// Public — returns clubs with geofencing on, used by mobile at startup
// ─────────────────────────────────────────────────────────────────────
router.get("/clubs/geofences", async (req, res): Promise<void> => {
  const clubs = await query<any>(
    `SELECT id, name, latitude, longitude,
            geofence_radius_m, ninth_tee_lat, ninth_tee_lng, ninth_tee_radius_m
     FROM clubs
     WHERE geofence_enabled = 1 AND active = 1`
  );
  res.json({ clubs });
});

// ─────────────────────────────────────────────────────────────────────
// GET /admin/clubs
// Club admin: returns only their club
// Platform admin: returns all clubs
// ─────────────────────────────────────────────────────────────────────
router.get("/admin/clubs", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user || user.role !== "club_admin") {
    res.status(403).json({ message: "Forbidden" });
    return;
  }

  const where  = user.club_id != null ? "WHERE active = 1 AND id = ?" : "WHERE active = 1";
  const params = user.club_id != null ? [user.club_id] : [];

  const clubs = await query<any>(
    `SELECT id, name, location, province, latitude, longitude,
            geofence_enabled, geofence_radius_m,
            ninth_tee_lat, ninth_tee_lng, ninth_tee_radius_m
     FROM clubs ${where} ORDER BY name ASC`,
    params
  );

  res.json({
    clubs: clubs.map((c: any) => ({
      ...c,
      geofence_enabled:   !!c.geofence_enabled,
      geofence_radius_m:  parseInt(c.geofence_radius_m  ?? 200),
      ninth_tee_radius_m: parseInt(c.ninth_tee_radius_m ?? 50),
      ninth_tee_lat: c.ninth_tee_lat ? parseFloat(c.ninth_tee_lat) : null,
      ninth_tee_lng: c.ninth_tee_lng ? parseFloat(c.ninth_tee_lng) : null,
    })),
  });
});

// ─────────────────────────────────────────────────────────────────────
// PATCH /admin/clubs/:id/geofence
// Club admin: only allowed for their own club
// Platform admin: any club
// ─────────────────────────────────────────────────────────────────────
router.patch("/admin/clubs/:id/geofence", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user || user.role !== "club_admin") {
    res.status(403).json({ message: "Forbidden" });
    return;
  }

  const clubId = parseInt(req.params.id, 10);
  if (isNaN(clubId)) { res.status(400).json({ message: "Invalid club id" }); return; }

  // Club-scoped admins can only update their own club
  if (user.club_id != null && user.club_id !== clubId) {
    res.status(403).json({ message: "You can only configure your own club's geofence" });
    return;
  }

  const {
    geofence_enabled,
    geofence_radius_m,
    ninth_tee_lat,
    ninth_tee_lng,
    ninth_tee_radius_m,
  } = req.body ?? {};

  await exec(
    `UPDATE clubs SET
       geofence_enabled   = ?,
       geofence_radius_m  = ?,
       ninth_tee_lat      = ?,
       ninth_tee_lng      = ?,
       ninth_tee_radius_m = ?
     WHERE id = ?`,
    [
      geofence_enabled ? 1 : 0,
      Math.max(50, Math.min(2000, parseInt(geofence_radius_m ?? 200, 10))),
      ninth_tee_lat  != null ? parseFloat(ninth_tee_lat)  : null,
      ninth_tee_lng  != null ? parseFloat(ninth_tee_lng)  : null,
      Math.max(10, Math.min(500, parseInt(ninth_tee_radius_m ?? 50, 10))),
      clubId,
    ]
  );

  const updated = await row<any>(
    `SELECT id, name, geofence_enabled, geofence_radius_m,
            ninth_tee_lat, ninth_tee_lng, ninth_tee_radius_m
     FROM clubs WHERE id = ?`,
    [clubId]
  );

  res.json({
    club: {
      ...updated,
      geofence_enabled:   !!updated?.geofence_enabled,
      geofence_radius_m:  parseInt(updated?.geofence_radius_m  ?? 200),
      ninth_tee_radius_m: parseInt(updated?.ninth_tee_radius_m ?? 50),
      ninth_tee_lat: updated?.ninth_tee_lat ? parseFloat(updated.ninth_tee_lat) : null,
      ninth_tee_lng: updated?.ninth_tee_lng ? parseFloat(updated.ninth_tee_lng) : null,
    },
  });
});

export default router;
