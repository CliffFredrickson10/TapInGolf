import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { row } from "./pg";

const SECRET = process.env["SESSION_SECRET"] ?? "tapingolf_club_portal_2026";

export function generateClubToken(clubId: number): string {
  const payload = Buffer.from(
    JSON.stringify({ sub: clubId, type: "club", iat: Date.now(), exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifyClubToken(token: string): number | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
  if (!crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(sig, "hex"))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (data.type !== "club") return null;
    if (data.exp < Date.now()) return null;
    return data.sub as number;
  } catch {
    return null;
  }
}

export async function requireClubAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization ?? "";
  if (!header.startsWith("Bearer ")) { res.status(401).json({ message: "Unauthorized" }); return; }
  const clubId = verifyClubToken(header.slice(7));
  if (!clubId) { res.status(401).json({ message: "Invalid or expired token" }); return; }
  const club = await row<any>(
    `SELECT id, name, location, province, image_url, logo_url, holes, price_from,
            facilities, website, description, phone, email, address, featured, active,
            cart_available, cart_compulsory, cart_price, latitude, longitude,
            geofence_enabled, geofence_radius_m, username
     FROM clubs WHERE id = ? AND active = 1`,
    [clubId]
  );
  if (!club) { res.status(401).json({ message: "Club not found" }); return; }
  (req as any).club = club;
  next();
}

export function getClub(req: Request): any {
  return (req as any).club;
}
