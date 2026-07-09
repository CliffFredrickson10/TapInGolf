import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { row } from "./pg";

const SECRET = process.env["SESSION_SECRET"] ?? "tapingolf_club_portal_2026";

export interface PosTokenPayload {
  staffId: number;
  outletId: number;
  clubId: number;
  role: "manager" | "waiter";
}

export function generatePosToken(staffId: number, outletId: number, clubId: number, role: string, ttlMs?: number): string {
  const payload = Buffer.from(
    JSON.stringify({
      sub: staffId, outlet: outletId, club: clubId, role,
      type: "pos_staff", iat: Date.now(), exp: Date.now() + (ttlMs ?? 7 * 24 * 60 * 60 * 1000),
    })
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifyPosToken(token: string): PosTokenPayload | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
  try {
    if (!crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(sig, "hex"))) return null;
  } catch {
    return null;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    // Strict token-type isolation — only pos_staff tokens are accepted here.
    if (data.type !== "pos_staff") return null;
    if (data.exp < Date.now()) return null;
    if (data.role !== "manager" && data.role !== "waiter") return null;
    return { staffId: data.sub, outletId: data.outlet, clubId: data.club, role: data.role };
  } catch {
    return null;
  }
}

// Loads the staff row + outlet and re-checks both are still active. The
// authoritative role is the DB row (not the token) so demotions apply instantly.
export async function requirePosAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization ?? "";
  if (!header.startsWith("Bearer ")) { res.status(401).json({ message: "Unauthorized" }); return; }
  const payload = verifyPosToken(header.slice(7));
  if (!payload) { res.status(401).json({ message: "Invalid or expired token" }); return; }

  const staff = await row<any>(
    `SELECT s.id, s.outlet_id, s.club_id, s.name, s.email, s.role, s.active,
            o.name AS outlet_name, o.type AS outlet_type, o.active AS outlet_active
     FROM pos_staff s
     JOIN pos_outlets o ON o.id = s.outlet_id
     WHERE s.id = ? AND s.outlet_id = ? AND s.active = 1`,
    [payload.staffId, payload.outletId]
  );
  if (!staff || !staff.outlet_active) { res.status(401).json({ message: "Account not found or inactive" }); return; }
  (req as any).posStaff = staff;
  next();
}

export function requirePosManager(req: Request, res: Response, next: NextFunction): void {
  const staff = (req as any).posStaff;
  if (!staff || staff.role !== "manager") {
    res.status(403).json({ message: "Manager access required" });
    return;
  }
  next();
}

export function getPosStaff(req: Request): any {
  return (req as any).posStaff;
}
