---
name: Token type isolation across auth realms
description: All HMAC token verifiers must check the `type` field; user tokens must reject any token that carries a `type`.
---

The API has four HMAC token realms signed with the same `SESSION_SECRET` when it is set: user tokens (no `type` field, lib/auth.ts), club tokens (`type:"club"`), club_user tokens (`type:"club_user"`), and reseller tokens (`type:"reseller"`).

**Rule:** every verifier must positively check the token's `type`. The user-token verifier (`verifyToken` in lib/auth.ts) must reject any payload that has a `type` field at all.

**Why:** with a shared `SESSION_SECRET`, a portal/reseller token with `sub:N` would otherwise verify as user N — a reseller token passed staff-only `/api/admin/*` checks during testing because user 1 happened to exist. Fixed by rejecting typed payloads in `verifyToken`.

**How to apply:** when adding any new token realm, give it a unique `type` value, check it in its verifier, and confirm cross-realm tokens are rejected (401/403) on user, club, staff, and the new realm's routes.
