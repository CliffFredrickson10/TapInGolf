---
name: Standing holds concurrency
description: Concurrency rules for standing tee-time hold materialization and slot capacity
---
- portal_tee_slots can contain DUPLICATE rows for the same club/date/tee_time — any per-slot seat logic must dedupe (hold materialization picks MIN(id) among active non-event duplicates).
- Hold materialization runs both from the 5-min worker and synchronously from portal create/update — runs must serialize via pg_advisory_xact_lock inside withTransaction, and capacity must be re-checked inside the same INSERT ... SELECT statement.
- **Why:** check-then-insert across separate statements let overlapping runs over-hold a slot; notify only after commit and only for rows actually changed (UPDATE ... RETURNING), or users get false "released" notices.
- **How to apply:** any new writer that consumes slot seats (bookings, holds) must make its capacity check part of the mutating statement; the booking player_count increment is conditional and throws statusCode 409 on zero rows.
