---
name: Terms / EULA acceptance gating
description: How TapIn gates Terms-of-Use acceptance for new and legacy users (App Store/Play Store UGC compliance).
---

# Terms of Use acceptance

`users.terms_accepted_at` (nullable TIMESTAMP) is the single source of truth for whether a user has agreed to the Terms of Use & Community Guidelines. NULL = not yet accepted.

- New sign-ups: `/auth/register` sets it to NOW(), AND **rejects the request unless `terms_accepted === true` is in the body** — a client-side checkbox alone is not enough for store compliance (must be server-enforced).
- Legacy users (NULL): shown a one-time launch-time gate (`components/TermsGate.tsx`, mounted in `_layout.tsx`) that calls `POST /profile/accept-terms`. Decline = sign out.
- The mobile gate reads `user.terms_accepted` (boolean). **All three auth surfaces must return it** — `/auth/login`, `/auth/register`, and `/profile` — or the gate won't trigger in some sessions (login doesn't auto-refresh profile in that session).

**Why:** Apple Guideline 1.2 / Google require explicit agreement to a zero-tolerance UGC policy. The gate exists because the checkbox shipped after users already existed.

**How to apply:** If you add a new auth/profile response shape, include `terms_accepted: user.terms_accepted_at != null`. If you change the acceptance flow, keep server-side enforcement in register.
