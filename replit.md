# TapIn Golf

A full-featured golf booking platform for Android and iOS — book tee times, manage friends, split bills, and pay via Stitch (Instant EFT + card).

## Run & Operate

- `pnpm --filter @workspace/tapin-golf run dev` — run the Expo mobile app (port 26107)
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- Expo Go QR code available in the expo workflow console — scan to preview on device

## Stack

- **Mobile**: Expo 54 (React Native), expo-router v6, TypeScript
- **API**: Express 5, Node.js 24, TypeScript
- **DB**: MySQL (remote) via mysql2
- **Auth**: Custom HMAC-SHA256 tokens (AsyncStorage on mobile)
- **Payments**: Stitch Money (WebView redirect — Instant EFT + card)

## Where things live

- `artifacts/tapin-golf/` — Expo mobile app
  - `app/(tabs)/` — 5 main tabs: Home, Explore, Bookings, Friends, Profile
  - `app/(auth)/` — Login and Register screens
  - `app/club/[id].tsx` — Club detail + tee time booking
  - `app/booking/new.tsx` — Booking flow (players, split bill, payment)
  - `app/booking/[id].tsx` — Booking detail + cancel
  - `app/booking/payment.tsx` — Stitch WebView payment
  - `components/` — ClubCard, BookingCard, FriendCard, TeeTimeSlot, AdBanner, SkeletonLoader
  - `context/AuthContext.tsx` — Auth state + token storage
  - `constants/colors.ts` — Golf green theme (light + dark mode)
  - `lib/api.ts` — API base URL + fetch helper
  - `server/` — PHP reference implementation (not active)
- `artifacts/api-server/` — Express API
  - `src/routes/` — auth, clubs, bookings, friends, ads
  - `src/lib/pg.ts` — PostgreSQL adapter
  - `src/lib/auth.ts` — Token generation/verification
  - `src/lib/migrate.ts` — Schema migrations (37 tables) + seed data
  - `src/lib/stitch.ts` — Stitch Express API client (REST: `POST /api/v1/token`, `POST /api/v1/payment-links`, `GET /api/v1/payment/{id}`, `POST /api/v1/webhook`)

## Stitch Payment Integration

Uses the **Stitch Express API** (https://express.stitch.money/api-docs) — a REST payment-gateway API, NOT the older OAuth/GraphQL Payins API. The credentials in Secrets are Express credentials. Stitch replaces PayFast/Google Pay/Apple Pay. Flow:
1. User selects "Stitch" at checkout → app calls `POST /bookings` or `POST /payments/wallet/topup-url`
2. API gets a 15-min Bearer token (`POST /api/v1/token`), then creates a hosted payment link (`POST /api/v1/payment-links`) and appends `?redirect_url=`
3. App opens the link in WebView; user pays via Instant EFT or card
4. Stitch redirects to `https://{host}/booking/success` → WebView catches it
5. Stitch POSTs a Svix-signed `payment.paid` webhook to `POST /api/stitch/webhook` → server verifies the signature, fetches the payment by id to resolve our `merchantReference`, and confirms the booking/top-up

**Amounts are in South African cents** at the Express API boundary (R50.00 = 5000, minimum 100 = R1.00). The app/DB still work in Rand; `createStitchPayment` converts Rand → cents internally.

`merchantReference` scheme: `<bookingId>` | `wallet-<topupId>` | `<bookingId>-player-<userId>`.

### Required env vars (set in Secrets)

| Secret | Description |
|---|---|
| `STITCH_CLIENT_ID` | Stitch Express client id (test or live) |
| `STITCH_CLIENT_SECRET` | Stitch Express client secret |
| `STITCH_WEBHOOK_SECRET` | Svix signing secret returned when the webhook is registered. Optional but recommended — when set, inbound webhook signatures are verified; when unset, webhooks are processed unsigned. |

> Beneficiary secrets (`STITCH_BENEFICIARY_*`) are **no longer used** by the Express integration — Express pays out to the account configured on the Stitch Express dashboard.

### Webhook registration (per environment, one-time)

Webhooks are registered via the API (`POST /api/v1/webhook`), not the dashboard. Registration returns the Svix signing secret **once** — store it as `STITCH_WEBHOOK_SECRET` for that environment. Each endpoint URL gets its own secret, so register the dev URL for on-device dev testing and the production URL after deploying:
```
dev:  https://{REPLIT_DEV_DOMAIN}/api/stitch/webhook
prod: https://{your-domain}/api/stitch/webhook   (e.g. tapingolf.replit.app)
```
The mobile app points at the dev API (`EXPO_PUBLIC_DOMAIN=$REPLIT_DEV_DOMAIN`); the dev domain rotates on Repl restart, so re-register if it changes.

## MySQL — IMPORTANT

The MySQL server at `tapingolf.co.za` must grant access from Replit's outbound IP. Current IP: **`34.61.68.7`** (Replit's IP rotates periodically — if you see `ETIMEDOUT` errors, check the current IP and re-run the grant).

```sql
GRANT ALL PRIVILEGES ON tapingr7e9e4_tapingolf.* TO 'tapingr7e9e4_tapinadmin'@'%' IDENTIFIED BY 'your_password';
FLUSH PRIVILEGES;
```

Run this via cPanel phpMyAdmin or SSH. Using `'%'` avoids needing to update the grant each time Replit's IP changes. Once done, the API auto-migrates and seeds on startup.

## DB Schema

- `users` — golfers with HMAC-token auth
- `clubs` — golf clubs with facilities, pricing, province
- `tee_times` — available slots per club per date/time
- `bookings` — booking records with split-bill support
- `booking_players` — per-player join table for split billing
- `friendships` — friend requests/accepted pairs
- `standing_reservations` / `standing_reservation_members` / `standing_holds` — recurring weekly tee-time reservations: portal creates per day-of-week reservations for ≤4 members; a 5-min worker materializes per-seat holds that hide seats from public booking; members confirm in-app via normal booking/payment before the club-set deadline (`confirm_hours_before`) or the seat auto-releases
- `reviews` — club ratings
- `ads` — sponsored club ads by placement
- POS (club portal): `pos_outlets` (pro_shop/bar/restaurant per club), `pos_staff` (manager/waiter; managers have email logins, waiters have name + PIN only with email NULL; bcrypt + HMAC token type `pos_staff`), `pos_webauthn_credentials` (fingerprint/WebAuthn credentials per staff member for terminal unlock), `pos_categories`, `pos_products` + `pos_product_variants` (size/colour/barcode/SKU/stock per variant), `pos_suppliers`, `pos_stock_orders` + items (receive increments stock in a transaction), `pos_stock_movements` (audit trail), `pos_promotions` (percentage/amount, day-of-week + SA-time windows, best discount per line wins), `pos_orders` + `pos_order_items` (table/takeaway/counter; stock decrements at pay)

## POS (Pro Shop / Bar / Restaurant)

- Club admins manage outlets + manager logins at `/outlets` in the portal (routes `/api/portal/pos/*`, club or club_user-admin token).
- Only **managers** sign in on the portal login "Outlet" tab (`POST /api/pos/auth/login`, role='manager' enforced); all POS routes (`/api/pos/*`) are outlet- and club-scoped via the `pos_staff` token.
- **Waiters/cashiers have no logins.** The terminal stays signed in with the manager session; the till/tables/order screens are wrapped in a "Who's serving?" gate (`pos-waiter-gate.tsx`) listing active staff (`GET /api/pos/waiters`). Each person unlocks with their personal PIN (`POST /api/pos/waiters/:id/unlock`, min 4 chars) or a registered fingerprint (WebAuthn: `POST /api/pos/waiters/webauthn/register/options|verify` self-register, `POST /api/pos/waiters/:id/webauthn/options|verify` unlock). Unlock returns a 12-hour `pos_staff` token stored as `pos_waiter_token`; `posApi()` in the portal prefers it so orders/sales are attributed to the active waiter. Auto-locks after 2 min idle. Managers can reset PINs and remove fingerprints (`DELETE /api/pos/staff/:id/fingerprints`) on the Staff page. WebAuthn requires an https origin (rpID/origin derived from request Origin header — works on rotating dev domain and prod).
- Pro shop UI = barcode till (keyboard-wedge scan → `/api/pos/products/lookup?barcode=`, variant picker when needed, one-shot `POST /api/pos/sales`). Bar/restaurant UI = tables & takeaway orders with mark-as-paid (cash/card).
- **Walk-in golf bookings at the till** (pro-shop outlets only, 403 elsewhere): "Golf booking" button on the till → dialog (date → tee-time grid with availability → players 1–4 → lead name/phone → green fee per player → Cash/Card). `GET /api/pos/tee-times?date=` lists bookable slots (DISTINCT ON time+tee_start_type, lowest id, active, non-event). `POST /api/pos/walk-in-bookings` books inside a transaction: per-slot advisory lock + atomic capacity check in the mutating UPDATE (`player_count + n <= max_players`), inserts `bookings` (booking_source `club_counter`, ref `POS-XXXXXXXX`, status confirmed, payment_method cash/card, total_amount = fee×players) + `booking_players` rows, so it appears on the portal schedule and rolls into the monthly counter-booking invoice like portal walk-ins.
- **Tips & service fees**: club admins set `service_fee_percent` (0–100) per outlet on `/outlets` (stored on `pos_outlets`); the fee is added live to open bar/restaurant order totals and frozen onto `pos_orders.service_fee` at pay. Paying an order accepts optional `amount_paid` — tip = max(0, paid − total), stored on `pos_orders.tip_amount`/`amount_paid`. Tips + fees surface on the manager Floor Overview ("Tips today" + per-waiter cards), Transactions (Tip column + detail dialog), and Reports (`tips_by_staff` in `/api/pos/reports/summary`, attributed to COALESCE(opened_by, closed_by)). Pro-shop one-shot sales (`/pos/sales`) are unaffected — leave fee at 0 for pro shops. Waiters see their own tips for the day via `GET /api/pos/my-tips` (any unlocked `pos_staff` token, self-scoped) — shown as a "My tips today" chip on the Tables & Orders screen.
- Sidebar nav is driven by the **unlocked** person (`activeWaiter`), not the manager login — locked terminal shows no nav items ("Terminal locked"). At bar/restaurant outlets the `/` route is role-split (`PosHome` in App.tsx): waiters get the working Tables & Orders screen; a manager who unlocks gets the read-focused **Floor Overview** (`pos/overview.tsx` — open orders grouped per waiter with open-value stats, click-through to assist). Managers unlock with their login password (no separate PIN).
- Managers additionally get Products (variants), Suppliers, Stock Orders, Promotions, Staff (waiters only), Transactions, Reports. Waiters/cashiers see only the till/tables.
- Demo logins (club 1): `proshop.demo@tapingolf.co.za`, `bar.demo@tapingolf.co.za` (managers) — password `PosDemo2026!`. Demo waiter "Demo Waiter" (bar outlet) unlocks on the terminal with PIN `1234`.
- Card terminals, kitchen routing, and member charge-to-account are intentionally out of scope; payment recording is method-only (cash/card) so a terminal can slot in later.

## Architecture decisions

- Vanilla Express + PostgreSQL (migrated from MySQL at tapingolf.co.za — 100k+ rows imported)
- Custom HMAC tokens instead of JWT (no extra library needed)
- Migration runs on startup (non-fatal if DB unreachable)
- Stitch uses WebView redirect flow — same pattern as old PayFast
- Colors defined per light/dark mode in `constants/colors.ts`, consumed via `useColors()` hook

## Product

Golf booking app for South Africa — discover clubs, book tee times (1-4 ball), add friends, split the bill, pay via Stitch. Supports club advertising.

## User preferences

- Stack: Expo mobile + vanilla API + PostgreSQL (Replit built-in)
- Color scheme: Deep golf green (#1a5c38) primary, gold accent (#c8a84b), dark mode supported
- Target: South African golf clubs (506 real clubs imported from production MySQL DB)
- Stitch Money for payments (ZAR, Instant EFT + card)

## Gotchas

- MySQL remote access must be whitelisted for Replit's IP to work
- `react-native-webview` has minor version mismatch with Expo (harmless warning)
- The PHP files in `server/` are reference only — the active API is the TypeScript Express server
