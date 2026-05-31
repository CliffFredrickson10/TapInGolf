---
name: Booking tier_type passthrough
description: Mobile must include tier_type in players_data payload; server getInvitedPrice re-derivation misses specific visitor tiers (junior, pensioner, student, etc.)
---

# Booking tier_type passthrough

## The rule
When submitting a booking, the mobile must include each invited player's `tier_type` in `players_data`. The server's `getInvitedPrice()` independently re-derives the tier, but it only has three paths: `club_members` (member rate), `isHnaVerified` (affiliated_visitor), or fallback `non_affiliated_visitor`. Specific sub-tiers like `junior_visitor`, `pensioner_visitor`, `student_visitor` are NEVER re-derived server-side — they only come from the mobile's `/user-tier-price` lookup.

**Why:** The mobile fetches per-player tier via `/clubs/:id/user-tier-price?user_id=`, which returns the exact `tier_type`. Without passing this forward, all non-member, non-HNA players get `non_affiliated_visitor` pricing regardless of their actual tier, producing a wrong per-player amount and wrong total.

**How to apply:**
- `app/booking/new.tsx` `handleBook`: spread `tier_type` from `addedPlayerPrices[i]` into each `players_data` entry.
- `routes/bookings.ts` `getInvitedPrice`: if `p.tier_type` is provided, do a direct DB lookup for that tier first; fall through to standard derivation only if the tier row is missing.
- The hint is validated against `club_pricing_tiers` — a spoofed tier simply won't match a row and falls through, so there's no security exposure.
