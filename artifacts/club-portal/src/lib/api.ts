export type SessionMode = "club" | "staff" | "club_user" | "reseller" | "pos";

export function getToken(): string | null {
  return localStorage.getItem("club_token");
}

export function setToken(token: string): void {
  localStorage.setItem("club_token", token);
}

export function getMode(): SessionMode | null {
  return localStorage.getItem("portal_mode") as SessionMode | null;
}

export function setMode(mode: SessionMode): void {
  localStorage.setItem("portal_mode", mode);
}

export function getSelectedClubId(): number | null {
  const v = localStorage.getItem("staff_club_id");
  return v ? parseInt(v, 10) : null;
}

export function setSelectedClubId(id: number | null): void {
  if (id == null) localStorage.removeItem("staff_club_id");
  else localStorage.setItem("staff_club_id", String(id));
}

// ── POS active-waiter token ──────────────────────────────────────────────────
// The POS terminal stays signed in with the manager's outlet session, but each
// waiter unlocks with their own PIN/fingerprint and receives a personal
// short-lived token. Order/sale requests use this token (via posApi) so the
// server records who actually performed the action.

export function getWaiterToken(): string | null {
  return localStorage.getItem("pos_waiter_token");
}

export function getWaiterInfo(): { id: number; name: string; role: string } | null {
  const raw = localStorage.getItem("pos_waiter");
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function setWaiterSession(token: string, staff: { id: number; name: string; role: string }): void {
  localStorage.setItem("pos_waiter_token", token);
  localStorage.setItem("pos_waiter", JSON.stringify(staff));
}

export function clearWaiterSession(): void {
  localStorage.removeItem("pos_waiter_token");
  localStorage.removeItem("pos_waiter");
}

export function clearToken(): void {
  localStorage.removeItem("club_token");
  localStorage.removeItem("club_info");
  localStorage.removeItem("portal_mode");
  localStorage.removeItem("staff_club_id");
  clearWaiterSession();
}

export async function api<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({ message: res.statusText }));
  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
  return data as T;
}

// Same as api(), but authenticates as the currently unlocked waiter when one
// is active (falls back to the terminal session token otherwise).
export async function posApi<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getWaiterToken() ?? getToken();
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({ message: res.statusText }));
  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
  return data as T;
}
