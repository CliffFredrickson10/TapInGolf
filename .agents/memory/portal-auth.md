---
name: Portal auth vs user auth
description: The club portal uses its own token system separate from the mobile app user tokens
---

## Rule
Any route called by the club portal (Authorization: Bearer <club-token>) must use `requireClubAuth` / `getClub` from `lib/portalAuth.ts`, NOT `getUser` / `isStaff` / `effectiveClubId` from `lib/auth.ts`.

**Why:** The portal sends club JWT tokens (signed with SESSION_SECRET, payload `{sub: clubId, type: "club"}`). `getUser` reads HMAC user tokens and returns null for club tokens, causing 400/403 errors.

**How to apply:**
- Mobile app endpoints → `getUser` from `lib/auth.ts`
- Portal admin endpoints (`/admin/*`, `/portal/*`) → `requireClubAuth` + `getClub` from `lib/portalAuth.ts`
- `issued_by` column in `cancellation_voucher_batches` is nullable (portal has no user ID)
- `lib/portalAuth.ts` is the shared module; `portal.ts` still has its own local copy of the token functions (refactor deferred)
