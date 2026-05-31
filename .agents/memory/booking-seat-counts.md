---
name: Tee-slot seat counting (player_count)
description: How portal_tee_slots.player_count works and the Stitch-abandonment seat-leak it caused
---

# Tee-slot seat reservation model

`portal_tee_slots.player_count` is a **denormalized counter** of seats taken on a
slot. Availability = `GREATEST(0, max_players - player_count)`. This same formula
is used in booking create, the open-games list, and clubs.ts slot listings, so any
drift in `player_count` shows up everywhere.

## The seat-leak bug (fixed 2026-05-31)
Booking create set EVERY booking to `status='confirmed'` and incremented
`player_count` at creation time — even Stitch (WebView redirect) bookings whose
payment had not completed. `player_count` was **only ever incremented, never
decremented**. So:
- Cancelling a booking left its seats reserved forever.
- Abandoning a Stitch checkout left a `confirmed` booking with all
  `booking_players.paid = 0` holding the slot permanently → "Not enough slots
  available" on otherwise-empty open slots.

## The model after the fix
- Only **non-Stitch** payments (prepaid, wallet — settled at creation) are
  confirmed at creation. **Stitch bookings stay `pending`** until the payment
  webhook flips them to `confirmed` and marks the organizer `paid=1`.
- Seats are still incremented at creation (holds the slot during checkout).
- Cancel releases seats (decrement by the booking's `players`).
- Stale `pending` Stitch bookings older than a 15-min grace are auto-cancelled and
  their seats released (`releaseStalePendingBookings()` runs at the top of
  `POST /bookings`).
- Startup reconcile in `migrate.ts` recomputes `player_count` from non-cancelled
  bookings and cancels legacy abandoned Stitch holds (confirmed but no paid player).

**Why:** Stitch is an async redirect flow; treating an unpaid redirect as a
confirmed seat is wrong. A paid Stitch booking is recognizable by at least one
`booking_players.paid = 1` (set by the webhook).

**How to apply:** Never decide seat availability or "paid" status from booking
`status` alone for Stitch — check `booking_players.paid`. If you add a new payment
method that settles at creation, confirm it at creation like prepaid/wallet; if it
redirects/settles async, leave it `pending` and confirm via webhook.
