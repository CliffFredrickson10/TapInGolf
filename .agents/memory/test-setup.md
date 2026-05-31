---
name: Test setup for artifacts (vitest)
description: How tests are wired in api-server and club-portal, and the config gotcha.
---

# Vitest test setup per artifact

Both `artifacts/api-server` and `artifacts/club-portal` use vitest with a
`pnpm --filter <pkg> run test` (`vitest run`) script.

- **api-server**: node env, supertest for HTTP. Route tests mount a single
  router on a bare express app and `vi.mock` the `../lib/pg` layer plus
  `getUser` (keeping the real pure auth helpers via `vi.importActual`) and
  `../lib/notifications`. No DB needed.
- **club-portal**: jsdom + @testing-library/react. Context/component tests
  `vi.mock("@/lib/api")`.

**Gotcha — separate vitest.config.ts is required for club-portal.** Its
`vite.config.ts` throws at load time unless `PORT` and `BASE_PATH` env vars are
set, so tests use a dedicated `vitest.config.ts` (with `@vitejs/plugin-react`
for JSX and the `@` → `./src` alias). Don't point vitest at vite.config.ts.

**Why:** keeps the test run independent of the dev-server env contract.

**Also:** `tsc` typecheck currently has pre-existing, unrelated failures in
several non-test files; don't assume a failing typecheck means the tests broke
it — check whether the error file is one of yours first.
