---
name: Stitch payment confirmation integrity
description: How Stitch booking payments must be confirmed safely (verify-before-confirm, idempotent state transitions)
---

# Stitch payment confirmation integrity

Stitch booking payments confirm through two paths that must BOTH be safe:
the app's `POST /bookings/:id/confirm-payment` (called on WebView success redirect
+ background poll) and the Svix webhook `POST /stitch/webhook`.

## Rules

- **Never confirm on the success redirect alone.** A user can navigate to the
  success URL without paying. `confirm-payment` must call `getStitchPayment(stitch_payment_id)`
  and require `status` PAID/COMPLETED AND `merchantReference === String(bookingId)`
  before any status transition. This also works in dev (queries Stitch directly,
  not dependent on the webhook).
- **All confirmations must be idempotent + state-safe.** Use
  `UPDATE bookings SET status='confirmed' WHERE id=? AND status='pending'` and gate
  side effects (mark organizer paid, invoice email, event sync) on the affected-row
  count being 1. `run()` returns the affected-row count (same pattern as wallet top-ups).
- **Never resurrect a cancelled booking.** `releaseStalePendingBookings()` auto-cancels
  pending stitch/pay_at_club bookings after a 15-min grace window and releases the seat.
  The status guard prevents a late webhook from flipping a cancelled (possibly re-booked)
  booking back to confirmed → would double-book the slot.

**Why:** organizer Stitch bookings start `pending`; without verify-before-confirm the
booking could be confirmed without payment, and without status guards duplicate webhooks
or a late payment after stale-cleanup could double-confirm or double-book.

**How to apply:** any new payment-confirmation path (resume-payment, new payment methods)
must reuse the verified `confirm-payment` flow and keep the `WHERE ... status='pending'`
guard. The frontend poll loop should re-attempt `confirm-payment` for the organizer
(non-player) path so a brief PAID-reporting lag self-heals instead of the user retrying
(a manual retry mints a second payment link → double charge).
