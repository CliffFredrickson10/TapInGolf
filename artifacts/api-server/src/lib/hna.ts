import { row } from "./pg";

// HNA verification model
// ----------------------
// A golfer's HNA number lives in ONE place: users.hna_number.
// "Verified" is NOT stored as a boolean — it is derived at read time from two sources
// so it can never drift and it auto-expires the moment a renewal/validity date passes:
//   1. CLUB membership  — an ACTIVE, non-expired membership at any club (the club roster
//      is the source of truth that they are a paid-up affiliated golfer); OR
//   2. TapIn STAFF card  — an APPROVED, non-expired hna_verifications row reviewed by a
//      TapIn super-user (golfer submitted a photo of their physical SA Player ID card).

const fmtDate = (d: unknown): string | null => {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
};

const normHna = (n: string | null | undefined): string | null =>
  n && String(n).trim() !== "" && String(n) !== "null" ? String(n).trim() : null;

export interface VerifyingMembership {
  club_id: number;
  club_name: string;
  renewal_date: string | null;
}

export interface HnaStatus {
  hna_number: string | null;
  hna_verified: boolean;
  hna_verified_source: "club" | "tapin" | null;
  hna_verified_club_id: number | null;
  hna_verified_club_name: string | null; // club name, or "TapIn" label for staff cards
  hna_valid_until: string | null;        // the renewal/validity date that keeps it valid
  hna_locked: boolean;                   // golfer cannot edit while verified
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

// Returns the current APPROVED, non-expired TapIn staff card verification for this user
// (latest approval), or null if none. valid_until NULL means it never expires.
export async function getApprovedStaffCard(
  userId: number
): Promise<{ valid_until: string | null; hna_number: string | null } | null> {
  const v = await row<any>(
    `SELECT valid_until, hna_number
       FROM hna_verifications
      WHERE user_id = ?
        AND status = 'approved'
        AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
      ORDER BY reviewed_at DESC NULLS LAST, id DESC
      LIMIT 1`,
    [userId]
  ).catch(() => null);
  if (!v) return null;
  return { valid_until: fmtDate(v.valid_until), hna_number: v.hna_number ?? null };
}

// Full HNA status for a user, combining the stored number with derived verification.
// Club membership takes precedence over a staff card when both are present.
export async function getHnaStatus(
  userId: number,
  hnaNumber: string | null | undefined
): Promise<HnaStatus> {
  const num = normHna(hnaNumber);

  const membership = await getVerifyingMembership(userId);
  if (membership && num) {
    return {
      hna_number: num,
      hna_verified: true,
      hna_verified_source: "club",
      hna_verified_club_id: membership.club_id,
      hna_verified_club_name: membership.club_name,
      hna_valid_until: membership.renewal_date,
      hna_locked: true,
    };
  }

  const card = num ? await getApprovedStaffCard(userId) : null;
  if (card && num) {
    return {
      hna_number: num,
      hna_verified: true,
      hna_verified_source: "tapin",
      hna_verified_club_id: null,
      hna_verified_club_name: "TapIn",
      hna_valid_until: card.valid_until,
      hna_locked: true,
    };
  }

  return {
    hna_number: num,
    hna_verified: false,
    hna_verified_source: null,
    hna_verified_club_id: null,
    hna_verified_club_name: null,
    hna_valid_until: null,
    hna_locked: false,
  };
}

// Pricing gate: a golfer qualifies for the affiliated-visitor rate only when their HNA
// is verified — i.e. an active membership somewhere OR an approved TapIn staff card —
// AND they have a non-empty HNA number on file. This MUST stay in lockstep with the
// `hna_verified` flag returned by getHnaStatus(), otherwise a golfer could be charged
// the affiliated rate while their profile shows "not verified".
export async function isHnaVerified(userId: number): Promise<boolean> {
  const u = await row<any>(
    "SELECT hna_number FROM users WHERE id = ?",
    [userId]
  ).catch(() => null);
  if (!normHna(u?.hna_number)) return false;
  const membership = await getVerifyingMembership(userId);
  if (membership) return true;
  const card = await getApprovedStaffCard(userId);
  return !!card;
}
