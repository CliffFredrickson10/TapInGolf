---
name: Staff admin endpoint authorization (isStaff vs isSuper)
description: Why shared /admin/* staff endpoints gate on isStaff (club_admin OR super-user), not isSuper-only.
---

# Shared /admin/* staff endpoints gate on isStaff, not isSuper

Revenue (admin.ts), broadcast (notifications.ts), events/members (events.ts), and
geofencing (geofencing.ts) gate on `isStaff(user)` — which is club_admin OR
is_super_user — NOT `isSuper(user)`.

The HNA verification review endpoints (hnaVerification.ts `/admin/hna-verifications*`)
are the exception: those ARE `isSuper`-only, because card review is a TapIn-staff-only
responsibility.

**Why:** The web club portal's existing platform admin is a `club_admin` golfer with a
null club_id. Those endpoints already allowed club_admin before super-users were added;
the TapIn-staff feature only *added* super-users to the allowed set. Restricting these
to super-only (as a code review once suggested) would break existing platform/club_admin
access. Super-users supply an explicit `club_id` for the club-scoped ones (broadcast,
events, members) via the web club selector; revenue + geofence are cross-club.

**How to apply:** Do not "tighten" these shared endpoints to isSuper-only. If a future
endpoint is genuinely TapIn-staff-only (like card review), use isSuper and document it.
