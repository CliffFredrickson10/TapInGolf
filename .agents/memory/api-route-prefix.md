---
name: API route prefix convention
description: Express routes must NOT include the /api prefix — the router is mounted at /api by the app init.
---

## Rule
All routes in `artifacts/api-server/src/routes/*.ts` use paths **without** the `/api` prefix.

**Why:** The main router (index.ts) is mounted at `/api` by the Express app init. If you write `router.get("/api/scoring/rounds", ...)` the actual URL becomes `/api/api/scoring/rounds` — which returns 404.

**How to apply:**
- Correct: `router.get("/scoring/rounds", ...)`
- Wrong: `router.get("/api/scoring/rounds", ...)`
- Mobile client calls `apiFetch("/scoring/rounds", token)` which prepends the `API_BASE` (`https://{domain}/api`), so the final URL is `/api/scoring/rounds` ✓
