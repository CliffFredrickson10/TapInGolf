---
name: Chat-ban (chat_disabled) gating
description: How TapIn disables in-app chat for moderation-banned users across server + every client entry point.
---

# Chat access suspension

`users.chat_disabled` (SMALLINT, 0/1) is the single source of truth for whether a user is chat-banned (set when a moderation report is upheld).

- Server enforcement lives in `messages.ts` (`chatDisabled(user)` → 403 on DM conversation create + message send). This is the security boundary.
- Client must gate **every** chat entry point too, or banned users hit silent server 403s (bad UX). The entry points are not just the obvious one:
  - `friends.tsx` Messages sub-tab (compose icon, conversation load, per-friend chat button)
  - `chat/[id].tsx` composer (reachable via push-notification deep links even when the tab is hidden)
  - `chat/new.tsx` (reachable independently; block on mount + guard create actions)
- The flag reaches the client via the auth responses: `chat_disabled` must be returned from `/auth/login`, `/auth/register` (false), and `/profile`.

**Why:** Server 403 alone is enough for policy/security but produces silent failures in the UI; deep links and secondary screens bypass a single tab-level guard. App Store/Play Store UGC compliance wants the user told why chat is unavailable.

**How to apply:** Same rule as terms-acceptance — any new gating flag must be returned on all three auth surfaces (login/register/profile), and any new chat entry point must read `user.chat_disabled` and show a suspension notice instead of failing silently.
