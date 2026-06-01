---
name: POPIA consent versioning & phone normalization
description: Cross-file couplings for privacy-consent records and SA phone storage in TapIn
---

# Privacy policy version coupling

`PRIVACY_POLICY_VERSION` in `artifacts/api-server/src/routes/auth.ts` is stored against
each user at registration (`privacy_accepted_at` + `privacy_policy_version` columns).
It MUST stay in sync with the `EFFECTIVE_DATE` shown in the mobile Privacy Policy screen
(`artifacts/tapin-golf/app/legal/privacy.tsx`).

**Why:** POPIA requires an auditable record of *which* privacy notice a user consented to.
If the displayed policy changes materially, bump both the screen's effective date and the
server constant together, otherwise the stored version no longer matches what users saw.

**How to apply:** When editing the privacy policy text, update `EFFECTIVE_DATE` in
privacy.tsx and `PRIVACY_POLICY_VERSION` in auth.ts in the same change.

# SA phone storage

Phone numbers are normalized to E.164 (+27…) on both register and profile-update via the
shared `normalizePhone` helper in `lib/otp.ts` (returns null for malformed). Phone is
optional, but if supplied and invalid the endpoint returns 400. Store and echo the
normalized value, never the raw input.
