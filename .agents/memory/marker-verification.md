---
name: Marker verification system
description: How marker/countersign verification works for individual tournament scoring — where data lives and which endpoints to use
---

## DB columns added
- `scoring_rounds.marker_user_id INT` — the player assigned to countersign this round (resolved from tee draw at round start)
- `scoring_rounds.marker_hole_scores JSONB` — marker's version of player's gross scores per hole
- `scoring_rounds.marker_gross INT` — computed total from marker's scores
- `scoring_rounds.marker_submitted_at TIMESTAMP` — when marker submitted
- `event_scores.marker_disputed SMALLINT DEFAULT 0` — 1 when marker submitted but scores differ

## Verification states
- `verified=0, marker_disputed=0, marker_submitted_at IS NULL` → awaiting marker countersign
- `verified=1` → auto-verified (all holes matched) or club approved
- `marker_disputed=1` → marker submitted but at least one hole differs from player's card

## API endpoints
- `GET /scoring/pending-marks` — player token; returns rounds where current user is marker and hasn't yet submitted
- `POST /scoring/rounds/:roundId/marker-scores` — player token; body `{ holeScores: { "1": 4, ... } }`; compares, sets verified or marker_disputed
- `POST /portal/events/:id/scores/verify` — club portal token (requireClubAuth); body `{ userId, round? }`; sets verified=1, marker_disputed=0

## Portal scores endpoint
Always use `/api/portal/events/:id/scores` for the portal (NOT `/api/admin/events/:id/scores`). The portal route is in portal.ts and uses requireClubAuth. The admin route is a separate endpoint in events.ts.

## Mobile UX
- `app/scoring/[id]/mark.tsx` — mark screen; pre-fills with player's submitted scores; marker can confirm or change
- `complete.tsx` — after submitting own round, calls GET /scoring/pending-marks; shows "Mark [Name]'s Card" banner in footer if any pending

**Why:** Golf rules require the marker to independently record and countersign the player's scores. Without cross-checking, players could self-report any score unchallenged.

**How to apply:** Only applies to individual tournament formats (isIndividualTournamentRound — formats NOT in BETTERBALL_ALL set, and not singles_match_play). Team/betterball formats don't use this system.
