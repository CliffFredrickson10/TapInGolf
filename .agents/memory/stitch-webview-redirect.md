---
name: Stitch WebView redirect matching
description: Why the in-app Stitch payment WebView must match the redirect URL by path, not substring
---

# Stitch payment WebView redirect detection

The Stitch hosted payment URL embeds our return URL as a query param:
`https://express.stitch.money/pay/<id>?redirect_url=<encoded https://host/booking/success>`.

**Rule:** when intercepting WebView navigation (`onShouldStartLoadWithRequest` /
`onNavigationStateChange`) to detect payment completion, match on the URL's
**pathname only** (e.g. `new URL(u).pathname.endsWith("/booking/success")`),
never a substring check like `url.includes("/booking/success")`.

**Why:** react-native-webview frequently reports `request.url` with the query
string decoded. A naive `includes("/booking/success")` then matches the
`redirect_url=...` query param on the *initial* page load, so the WebView
immediately fires the success handler and navigates to the booking detail
(status still `pending`) — the Stitch page never visibly renders. This presented
as "paying with Stitch goes straight to booking details and never shows the
payment page."

**How to apply:** the shared screen is
`artifacts/tapin-golf/app/booking/payment.tsx` (used by new booking, player-pay,
and wallet top-up). Use the `matchRedirect()` helper there. The server appends
the redirect via `encodeURIComponent` in `stitch.ts`; the booking stays `pending`
in the DB until the `payment.paid` webhook confirms it (this is expected, not a bug).
