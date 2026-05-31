import crypto from "crypto";
import { type Request } from "express";
import { row } from "./pg";

export function generateToken(userId: number): string {
  const payload = Buffer.from(
    JSON.stringify({ sub: userId, iat: Date.now(), exp: Date.now() + 30 * 24 * 60 * 60 * 1000 })
  ).toString("base64url");
  const secret = process.env["SESSION_SECRET"] ?? "tapingolf_secret_2026";
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifyToken(token: string): number | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const secret = process.env["SESSION_SECRET"] ?? "tapingolf_secret_2026";
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  if (!crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(sig, "hex"))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (data.exp < Date.now()) return null;
    return data.sub as number;
  } catch {
    return null;
  }
}

export async function getUser(req: Request): Promise<any | null> {
  const header = req.headers.authorization ?? "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7);
  const userId = verifyToken(token);
  if (!userId) return null;
  return row("SELECT id, name, email, phone, handicap, role, club_id, is_super_user FROM users WHERE id = ?", [userId]);
}

// ── Staff authorization helpers ──────────────────────────────────────────────
// TapIn super-users are platform-level staff. A club_admin manages a single club.
export function isSuper(user: any): boolean {
  return !!user && (user.is_super_user === 1 || user.is_super_user === true);
}

// Anyone allowed into the /admin/* tooling: a club_admin (their club) or a super-user
// (platform-wide). Used to gate revenue, geofence, broadcast, events and members.
export function isStaff(user: any): boolean {
  return !!user && (user.role === "club_admin" || isSuper(user));
}

// Platform-level reach: a club_admin with no club assigned, or any super-user.
// These can see/act across all clubs.
export function isPlatform(user: any): boolean {
  return isSuper(user) || (user?.role === "club_admin" && user?.club_id == null);
}

// The club a staff request should act on for a CLUB-SCOPED endpoint. A club_admin is
// pinned to their own club; a platform/super staff member supplies the target club_id.
export function effectiveClubId(user: any, requested: unknown): number | null {
  if (user?.club_id != null) return Number(user.club_id);
  const n = parseInt(String(requested ?? ""), 10);
  return Number.isNaN(n) ? null : n;
}
