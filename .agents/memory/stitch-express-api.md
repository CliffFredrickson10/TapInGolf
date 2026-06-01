---
name: Stitch Express API (not Payins)
description: The Stitch credentials in this repl are for Stitch Express (REST), not the OAuth/GraphQL Payins API; how payments + webhooks work.
---

# Stitch = Stitch Express, NOT the OAuth/GraphQL Payins API

The `STITCH_CLIENT_ID`/`STITCH_CLIENT_SECRET` secrets are **Stitch Express**
credentials (https://express.stitch.money/api-docs), a REST payment-gateway API.
They are NOT for the older Payins API (`secure.stitch.money/connect/token` +
GraphQL) — that path returns `invalid_client` on every scope with these creds.

**Why:** Easy to waste hours debugging auth against the wrong Stitch product. The
two Stitch APIs share branding but are completely separate; the credentials only
work against one of them.

**How to apply:**
- Token: `POST /api/v1/token` JSON `{clientId, clientSecret, scope:"client_paymentrequest"}` → 15-min Bearer.
- Payment link: `POST /api/v1/payment-links`. **Amounts are in cents** (R50 = 5000, min 100). Convert Rand→cents at the boundary.
- Resolve our merchantReference on a webhook by fetching `GET /api/v1/payment/{paymentId}` — that endpoint takes the PAYMENT id (from the webhook), NOT the payment-link id (link id → 404).
- Beneficiary (`STITCH_BENEFICIARY_*`) is unused by Express — payout account is set on the Stitch Express dashboard.

## Webhooks are Svix-signed
- Register via API: `POST /api/v1/webhook {url}` → returns a **Svix signing secret once** (store as `STITCH_WEBHOOK_SECRET`). No list endpoint (GET → 405); each endpoint URL gets its own secret.
- Verify with the standard Svix scheme: signed content `{svix-id}.{svix-timestamp}.{rawBody}`, HMAC-SHA256 keyed on base64-decode(secret without optional `whsec_` prefix), output base64, header `svix-signature` is space-separated `v1,<sig>`. Needs the **raw request body** (mount `express.raw` before `express.json` on the webhook route).
- Per-environment: the mobile app targets the dev API (`EXPO_PUBLIC_DOMAIN=$REPLIT_DEV_DOMAIN`), and the dev domain rotates on Repl restart, so the dev webhook must be re-registered when it changes. Prod needs its own registration + its own secret after deploy.
