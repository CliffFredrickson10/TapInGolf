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
  - `src/lib/stitch.ts` — Stitch Money API client (OAuth token + GraphQL payment initiation)

## Stitch Payment Integration

Stitch replaces PayFast/Google Pay/Apple Pay. Flow:
1. User selects "Stitch" at checkout → app calls `POST /bookings` or `POST /payments/wallet/topup-url`
2. API calls Stitch GraphQL → gets a hosted payment URL
3. App opens URL in WebView; user pays via Instant EFT or card
4. Stitch redirects to `https://{host}/booking/success` → WebView catches it
5. Stitch POSTs webhook to `POST /api/stitch/webhook` → server confirms payment

### Required env vars (set in Secrets)

| Secret | Description |
|---|---|
| `STITCH_CLIENT_ID` | From Stitch dashboard (sandbox or live) |
| `STITCH_CLIENT_SECRET` | From Stitch dashboard |
| `STITCH_BENEFICIARY_ACCOUNT` | Bank account number to receive funds |
| `STITCH_BENEFICIARY_BANK_ID` | e.g. `fnb`, `standard_bank`, `absa`, `nedbank`, `capitec` |
| `STITCH_BENEFICIARY_NAME` | Name on the receiving bank account |
| `STITCH_BENEFICIARY_ACCOUNT_TYPE` | `current` or `savings` (default: `current`) |

### Stitch webhook URL (register in Stitch dashboard)
```
https://{your-domain}/api/stitch/webhook
```

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
- `reviews` — club ratings
- `ads` — sponsored club ads by placement

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
