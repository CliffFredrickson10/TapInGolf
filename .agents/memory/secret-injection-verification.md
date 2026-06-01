---
name: Secret injection verification
description: How to confirm whether a Replit workflow process actually has a given secret/env var (viewEnvVars is not authoritative for user secrets).
---

# Verifying secrets reach a running workflow

`viewEnvVars()` only enumerates **runtime-managed** secrets (SESSION_SECRET, PG*,
DATABASE_URL, REPLIT_*) plus env vars you set via `setEnvVars`. It does **not**
list the user's own account-level Secrets. So `viewEnvVars` showing a key absent
does NOT prove it's missing, and it showing nothing for a user secret is expected.

**Authoritative check** = inspect the running process environment directly:
```
PID=$(pgrep -f "dist/index.mjs" | head -1)
tr '\0' '\n' < /proc/$PID/environ | cut -d= -f1 | grep -iE 'stitch|smtp' | sort
```
This lists only KEY NAMES (never print values). If a key isn't here, the process
genuinely doesn't have it, regardless of what `<available_secrets>` snapshots or
`viewEnvVars` claim.

**Why:** the session-start `<available_secrets>` block can be stale, and
`viewEnvVars` has a different view than the workflow process. Both disagreed with
reality once — only `/proc/<pid>/environ` matched the actual `createStitchPayment`
"not configured" throw.

**How to apply:** when an app reports a credential missing but you "know" it's set,
check `/proc/<pid>/environ` first. If truly absent, you cannot set user API
credentials yourself — use `requestEnvVar({requestType:"secret", keys:[...]})` to
have the user re-add them, then restart the workflow and re-verify via `/proc`.

Note: env-var scoping (development/shared) does NOT strip global secret injection —
tested by deleting a development env var and restarting; user secrets stayed absent
until re-added as secrets. So adding a development-scoped env var is not what breaks
global secret availability.

## Stitch "Payment gateway not configured" keeps recurring
Root cause (confirmed via viewEnvVars): STITCH_CLIENT_ID / STITCH_CLIENT_SECRET
were NOT in the secrets store at all — `viewEnvVars({keys:[...]})` returned
`false` for both — even though the session-start `<available_secrets>` block
listed them (the snapshot is unreliable). STITCH_WEBHOOK_SECRET existed only as a
**development-scoped env var**, not a global secret. Durable fix: store the two
client creds as **Secrets** (global, persist across dev+prod) via
`requestEnvVar({requestType:"secret", keys:["STITCH_CLIENT_ID","STITCH_CLIENT_SECRET"]})`,
then restart api-server and verify via `/proc/<pid>/environ`. Heads-up for
deploys: STITCH_WEBHOOK_SECRET being development-scoped means it won't reach the
production deployment — re-register the prod webhook and store its secret too.
**Why:** env vars (esp. development-scoped) are more fragile than secrets and the
available-secrets snapshot can falsely show creds as present.
