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
  return row("SELECT id, name, email, phone, handicap, role, club_id FROM users WHERE id = ?", [userId]);
}
