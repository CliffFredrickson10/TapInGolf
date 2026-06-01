import { row } from "./pg";
import { isHnaVerified } from "./hna";

// ── Age-based tier helpers (shared across endpoints) ─────────────────────────
// pg returns DATE columns as JS Date objects; handle both Date and string safely.
export const calcAge = (dob: unknown): number | null => {
  if (!dob) return null;
  const birth = dob instanceof Date ? dob : new Date(String(dob));
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
};
export const ageIsJunior    = (dob: unknown) => { const a = calcAge(dob); return a !== null && a <= 18; };
export const ageIsStudent   = (dob: unknown) => { const a = calcAge(dob); return a !== null && a >= 18 && a <= 24; };
export const ageIsPensioner = (dob: unknown) => { const a = calcAge(dob); return a !== null && a >= 65; };

export const pensionerMemberTierType = (membershipType: string): string => {
  if (membershipType.includes("six_day")) return "pensioner_six_day";
  if (membershipType.includes("week_day") || membershipType.includes("weekday")) return "pensioner_week_day";
  return "pensioner_full";
};

export interface TierPricing {
  /** 18-hole tier price (lowest tier the user qualifies for), or null if no tier configured. */
  price18: number | null;
  /** 9-hole tier price, or null. */
  price9: number | null;
  /** The user's primary tier type for this club (e.g. "full_member", "non_affiliated_visitor"). */
  tierType: string | null;
}

/**
 * Resolve the greens-fee price a specific user pays at a specific club.
 * Mirrors the tier resolution used by the club tee-times endpoint: determine
 * every tier the user qualifies for (member tier, age-based, affiliation) and
 * take the LOWEST configured price. Anonymous users fall back to the
 * non-affiliated visitor rate.
 */
export async function getUserTierPrices(userId: number | null, clubId: number): Promise<TierPricing> {
  let tierType: string = "non_affiliated_visitor";
  const tierCandidates: string[] = [];

  if (userId) {
    const [memberRow, userRow] = await Promise.all([
      row<any>(
        "SELECT membership_type FROM club_members WHERE club_id = ? AND user_id = ? AND status = 'active'",
        [clubId, userId]
      ).catch(() => null),
      row<any>("SELECT date_of_birth, hna_number FROM users WHERE id = ?", [userId]).catch(() => null),
    ]);
    const dob    = userRow?.date_of_birth ?? null;
    // Affiliated rate requires a CLUB-VERIFIED HNA (active, non-expired membership
    // somewhere) — a number typed by the golfer alone no longer qualifies.
    const hasHna = await isHnaVerified(userId);
    const memberType  = memberRow?.membership_type ?? null;
    const isHonorary  = memberType === "honorary";
    const isJunior    = !isHonorary && ageIsJunior(dob);
    const isStudent   = !isHonorary && !isJunior && ageIsStudent(dob);
    const isPensioner = ageIsPensioner(dob);
    if (isHonorary) {
      tierType = "honorary";
      tierCandidates.push("honorary");
      if (isPensioner) tierCandidates.push("pensioner_full");
    } else if (isJunior) {
      tierType = memberRow ? "junior_member" : "junior_visitor";
      tierCandidates.push(tierType);
      if (!memberRow && hasHna) tierCandidates.push("affiliated_visitor");
    } else if (isStudent) {
      tierType = memberRow ? "student_member" : "student_visitor";
      tierCandidates.push(tierType);
      if (!memberRow && hasHna) tierCandidates.push("affiliated_visitor");
    } else if (isPensioner) {
      if (memberRow) {
        tierType = pensionerMemberTierType(memberType ?? "");
      } else {
        tierType = hasHna ? "affiliated_pensioner" : "non_affiliated_pensioner";
      }
      tierCandidates.push(tierType);
    } else {
      tierType = memberType ?? (hasHna ? "affiliated_visitor" : "non_affiliated_visitor");
      tierCandidates.push(tierType);
    }
  } else {
    tierType = "non_affiliated_visitor";
    tierCandidates.push(tierType);
  }

  // Fetch all candidate tier prices in parallel and take the lowest.
  const candidateRows = await Promise.all(
    tierCandidates.map(t =>
      row<any>(
        "SELECT price_18h, price_9h FROM club_pricing_tiers WHERE club_id = ? AND tier_type = ?",
        [clubId, t]
      ).catch(() => null)
    )
  );
  let price18: number | null = null;
  let price9:  number | null = null;
  for (const tr of candidateRows) {
    if (!tr) continue;
    const p18 = tr.price_18h != null ? parseFloat(tr.price_18h) : null;
    const p9  = tr.price_9h  != null ? parseFloat(tr.price_9h)  : null;
    if (p18 !== null && (price18 === null || p18 < price18)) price18 = p18;
    if (p9  !== null && (price9  === null || p9  < price9))  price9  = p9;
  }

  return { price18, price9, tierType };
}
