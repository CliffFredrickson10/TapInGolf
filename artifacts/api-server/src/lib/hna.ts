import { row } from "./pg";

// HNA verification model
// ----------------------
// A golfer's HNA number lives in ONE place: users.hna_number.
// "Verified" is NOT stored — it is derived from club membership at read time, so it
// can never drift and it auto-expires the moment a membership renewal date passes.
//
// A golfer's HNA is verified while they hold an ACTIVE, non-expired membership at any
// club (the club roster is the source of truth that they are a paid-up affiliated golfer).

const fmtDate = (d: unknown): string | null => {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
};

export interface VerifyingMembership {
  club_id: number;
  club_name: string;
  renewal_date: string | null;
}

export interface HnaStatus {
  hna_number: string | null;
  hna_verified: boolean;
  hna_verified_club_id: number | null;
  hna_verified_club_name: string | null;
  hna_valid_until: string | null; // YYYY-MM-DD — the renewal date that keeps it valid
  hna_locked: boolean;            // golfer cannot edit while club-verified (= hna_verified)
}

// Returns the active, non-expired membership (latest renewal) that currently verifies
// this golfer's HNA, or null if none.
export async function getVerifyingMembership(
  userId: number
): Promise<VerifyingMembership | null> {
  const m = await row<any>(
    `SELECT cm.club_id, cm.renewal_date, c.name AS club_name
       FROM club_members cm
       JOIN clubs c ON c.id = cm.club_id
      WHERE cm.user_id = ?
        AND cm.status = 'active'
        AND (cm.renewal_date IS NULL OR cm.renewal_date >= CURRENT_DATE)
      ORDER BY cm.renewal_date DESC NULLS LAST
      LIMIT 1`,
    [userId]
  ).catch(() => null);
  if (!m) return null;
  return {
    club_id: m.club_id,
    club_name: m.club_name,
    renewal_date: fmtDate(m.renewal_date),
  };
}

// Full HNA status for a user, combining the stored number with derived verification.
export async function getHnaStatus(
  userId: number,
  hnaNumber: string | null | undefined
): Promise<HnaStatus> {
  const num =
    hnaNumber && String(hnaNumber).trim() !== "" && String(hnaNumber) !== "null"
      ? String(hnaNumber).trim()
      : null;
  const m = await getVerifyingMembership(userId);
  const verified = !!m && !!num;
  return {
    hna_number: num,
    hna_verified: verified,
    hna_verified_club_id: verified ? m!.club_id : null,
    hna_verified_club_name: verified ? m!.club_name : null,
    hna_valid_until: verified ? m!.renewal_date : null,
    hna_locked: verified,
  };
}

// Pricing gate: a golfer qualifies for the affiliated-visitor rate only when their HNA
// is club-verified — i.e. they hold an active, non-expired membership somewhere AND
// have a non-empty HNA number on file. This MUST stay in lockstep with the
// `hna_verified` flag returned by getHnaStatus(), otherwise a golfer could be charged
// the affiliated rate while their profile shows "not verified".
export async function isHnaVerified(userId: number): Promise<boolean> {
  const u = await row<any>(
    "SELECT hna_number FROM users WHERE id = ?",
    [userId]
  ).catch(() => null);
  const num =
    u && u.hna_number && String(u.hna_number).trim() !== "" && String(u.hna_number) !== "null";
  if (!num) return false;
  const m = await getVerifyingMembership(userId);
  return !!m;
}
