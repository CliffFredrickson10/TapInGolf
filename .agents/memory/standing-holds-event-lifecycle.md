---
name: Standing holds × event lifecycle
description: How standing tee-time holds must behave across golf_event statuses (draft vs active vs cancelled)
---

Rule: draft (`pending_publish`) tournaments must never migrate or release standing holds. Hold migration onto prepopulating event slots requires `golf_events.status = 'active'`; orphan release keeps public-slot holds superseded by a prepopulating draft event in place.

**Why:** event-slot bookings 403 unless the event is active, so migrating a hold onto a draft event slot strands the member on an unbookable seat (architect-flagged blocker). Releasing during draft causes churn — the draft may never publish, and the hold migrates cleanly at publish anyway.

**How to apply:** any new worker branch or portal flow touching standing_holds and golf_events must gate on `status='active'` for anything that moves/creates event-slot holds; publish handlers call `runStandingReservationsOnce()` synchronously so migration happens exactly at publish. Worker run order matters: revertCancelled → migrate → orphanRelease → materialize (orphan release assumes migration already ran, so leftovers on active prepopulating events are capacity failures and release correctly).

Testing tip: portal PUT /standing-reservations/:id deletes that reservation's held holds before re-running the worker — to run the worker without destroying an existing hold, create a throwaway reservation via POST (it triggers a global worker run).
