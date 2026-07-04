import { row } from "./pg";

// Next sequential member number for a club. The sequence spans both real
// members (club_members) and staged members (pending_memberships) so numbers
// stay unique within the club and survive pending → member promotion.
// Respects the club's configured "continue from" floor (clubs.member_no_next)
// so a club can pick up where its previous numbering convention left off.
export async function nextMemberNumber(clubId: number): Promise<number> {
  const r = await row<any>(
    `SELECT GREATEST(
       COALESCE((SELECT MAX(member_number) FROM club_members WHERE club_id = ?), 0) + 1,
       COALESCE((SELECT MAX(member_number) FROM pending_memberships WHERE club_id = ?), 0) + 1,
       COALESCE((SELECT member_no_next FROM clubs WHERE id = ?), 1)
     ) AS nxt`,
    [clubId, clubId, clubId]
  );
  return Number(r?.nxt || 1);
}

// True if a member number is already used within the club by someone other
// than the given email (pending) / the member with that email (real member).
export async function memberNumberTaken(clubId: number, memberNumber: number, excludeEmail: string): Promise<boolean> {
  const r = await row<any>(
    `SELECT 1 AS x FROM (
       SELECT u.email FROM club_members cm JOIN users u ON u.id = cm.user_id
        WHERE cm.club_id = ? AND cm.member_number = ?
       UNION ALL
       SELECT pm.email FROM pending_memberships pm
        WHERE pm.club_id = ? AND pm.member_number = ?
     ) t WHERE LOWER(t.email) != LOWER(?) LIMIT 1`,
    [clubId, memberNumber, clubId, memberNumber, excludeEmail]
  );
  return !!r;
}
