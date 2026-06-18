---
name: Auth token location in mobile app
description: The auth token lives on the User object (user.token), not as a direct field on AuthContextType.
---

## Rule
In the Expo mobile app, the JWT/HMAC token is stored on the `User` object, not directly in the auth context.

**Why:** `AuthContextType` only exposes `{ user, loading, login, register, logout, updateUser, acceptTerms }`. The token field is on the `User` interface.

**How to apply:**
```typescript
// CORRECT
const { user } = useAuth();
const token = user?.token;
apiFetch("/some/path", token, { ... });

// WRONG — TypeScript error
const { token } = useAuth();  // Property 'token' does not exist on AuthContextType
```
