---
name: Scoring format keys and metrics
description: Each round format key maps to a fixed metric driver; some formats are only set programmatically by linkTournament, not chosen manually.
---

## Format key → metric mapping

| Format key | Branch in complete.tsx | Metric driver | Set by |
|---|---|---|---|
| `singles_match_play` | `isMatchPlay` | net (lower wins) | Manual or individual knockout + non-stableford |
| `singles_stableford_match_play` | `isMatchPlay` | stableford pts (higher wins) | Individual knockout + stableford only |
| `betterball_match_play` | `isFourball` | net (lower best-ball wins) | Manual or team knockout + non-stableford |
| `fourball_stableford` | `isFourballNonMatch` | stableford pts (higher best-ball wins) | Manual or team knockout + stableford |

## singleMetric variable

In `complete.tsx` and `hole.tsx`, `singleMetric = round.format === "singles_stableford_match_play" ? "stableford" : "net"` gates which value is displayed and used for W/L/H in the isMatchPlay branch.

## `linkTournament` mapping (start.tsx)

- `knockout_type === "individual"` + `knockout_scoring_format === "stableford"` → `singles_stableford_match_play`
- `knockout_type === "individual"` + other → `singles_match_play`
- `knockout_type === "team"` + `knockout_scoring_format === "stableford"` → `fourball_stableford`
- `knockout_type === "team"` + other → `betterball_match_play`

**Why:** In real golf, some knockout clubs use stableford points to determine who wins each hole (higher pts wins), rather than net score (lower wins). The format key encodes the driver so scorecard/hole-entry code can use the right comparison.

**How to apply:** Any new place that checks `format === "singles_match_play"` should also check `format === "singles_stableford_match_play"` if it's about match play detection. The metric within those branches should branch on `singleMetric`. `isKnockoutMatch` in start.tsx must include `singles_stableford_match_play` for opponent lookup to trigger.

## API server (scoring.ts)

- `getHALocal` and `getStablefordPts` helpers are defined just before the `/scoring/rounds/:id/complete` route handler.
- Match verification at round-complete time also branches on format to use pts vs net per-hole comparison.
