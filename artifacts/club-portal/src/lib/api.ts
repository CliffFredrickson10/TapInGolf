export type SessionMode = "club" | "staff" | "club_user";

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

export function clearToken(): void {
  localStorage.removeItem("club_token");
  localStorage.removeItem("club_info");
  localStorage.removeItem("portal_mode");
  localStorage.removeItem("staff_club_id");
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
