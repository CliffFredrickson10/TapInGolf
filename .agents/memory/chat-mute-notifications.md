---
name: Chat mute & message-notification fan-out
description: Per-member mute flag and the rule that all message-notification paths must honor it
---

# Per-conversation mute

`conversation_members.is_muted` (SMALLINT) is a per-member flag. A muted member receives
NO push notification and NO in-app notification for new messages in that conversation,
but can still open the chat and load/send messages normally (the messages endpoints are
never mute-filtered).

**Why:** Users asked to mute chats — muting must suppress *delivery of notifications*,
not access to the conversation.

**How to apply:** When sending a message (`POST /conversations/:id/messages`) there are
TWO independent notification fan-out queries — the Expo push query and the in-app
`saveUserNotification` recipient query. ANY new message-notification path must add
`cm.is_muted = 0` to its recipient selection, or muted users will leak notifications.
This mirrors the existing `chat_disabled` gating rule: notification/enforcement logic
tends to live in multiple parallel spots, so audit every fan-out site, not just one.
