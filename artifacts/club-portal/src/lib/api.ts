export function getToken(): string | null {
  return localStorage.getItem("club_token");
}

export function setToken(token: string): void {
  localStorage.setItem("club_token", token);
}

export function clearToken(): void {
  localStorage.removeItem("club_token");
  localStorage.removeItem("club_info");
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
