---
name: app_preview screenshot port
description: Why app_preview screenshots fail for the Expo app, and how to verify instead
---

The `screenshot` tool with `type=app_preview` navigates to `http://localhost:5000<path>`, but the Expo web dev server runs on port **26107** (api-server on 8080, club-portal/Vite separate). So `app_preview` screenshots of the Expo mobile app fail with `ERR_CONNECTION_REFUSED` / `PAGE_UNREACHABLE`.

**Why:** the preview pane / screenshot service is pinned to port 5000, which nothing in this repo serves.

**How to apply:** to visually verify Expo UI changes, don't rely on `app_preview`. Instead restart the `artifacts/tapin-golf: expo` workflow and inspect the freshly-captured browser console logs via `refresh_all_logs` (check that bundling succeeds and there are no new errors). Compare log timestamps — stale error lines from before a restart can reappear in grep output.
