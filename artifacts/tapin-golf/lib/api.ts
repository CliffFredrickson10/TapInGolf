import { Platform } from "react-native";

const domain = process.env.EXPO_PUBLIC_DOMAIN;
export const API_BASE = domain
  ? `https://${domain}/api`
  : Platform.OS === "web"
  ? "/api"
  : "http://localhost/api";

const API_ORIGIN = domain
  ? `https://${domain}`
  : Platform.OS === "web"
  ? ""
  : "http://localhost";

/** Converts a relative /api/... path returned by the server into a full URL. */
export function toAbsoluteUrl(path: string): string {
  if (!path) return path;
  if (path.startsWith("http")) return path;
  return `${API_ORIGIN}${path}`;
}

export async function apiFetch(
  path: string,
  token?: string,
  options: RequestInit = {}
): Promise<any> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Request failed");
  return data;
}
