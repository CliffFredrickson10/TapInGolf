import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

// Mock the api layer the context depends on. Token/mode helpers are no-ops backed
// by simple variables so we can assert what staffLogin persisted.
const store: Record<string, string | null> = {};
const apiMock = vi.fn();

vi.mock("@/lib/api", () => ({
  api: (...args: any[]) => apiMock(...args),
  getToken: () => store["token"] ?? null,
  setToken: (t: string) => { store["token"] = t; },
  clearToken: () => { store["token"] = null; store["mode"] = null; },
  getMode: () => store["mode"] ?? null,
  setMode: (m: string) => { store["mode"] = m; },
  getSelectedClubId: () => null,
  setSelectedClubId: (id: number | null) => { store["club"] = id == null ? null : String(id); },
}));

import { AuthProvider, useAuth } from "./AuthContext";

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  apiMock.mockReset();
});

describe("staffLogin (is_super_user verification)", () => {
  it("rejects an account that is not a TapIn super-user", async () => {
    apiMock.mockResolvedValueOnce({ user: { id: 5, name: "Reg", email: "reg@x.co", is_super_user: false, token: "tok" } });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await expect(
      act(async () => { await result.current.staffLogin("reg@x.co", "pw"); }),
    ).rejects.toThrow(/not a TapIn staff account/i);

    expect(result.current.staff).toBeNull();
    expect(store["token"]).toBeUndefined();
    expect(store["mode"]).toBeUndefined();
  });

  it("logs in a super-user, persists the staff session and loads clubs", async () => {
    apiMock
      // /api/auth/login
      .mockResolvedValueOnce({ user: { id: 1, name: "Marco", email: "marco@tapingolf.co.za", is_super_user: true, token: "staff-token" } })
      // loadClubs -> /api/admin/clubs
      .mockResolvedValueOnce({ clubs: [{ id: 9, name: "Royal", province: "WC" }] });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => { await result.current.staffLogin("marco@tapingolf.co.za", "pw"); });

    await waitFor(() => expect(result.current.staff?.email).toBe("marco@tapingolf.co.za"));
    expect(store["token"]).toBe("staff-token");
    expect(store["mode"]).toBe("staff");
    expect(apiMock).toHaveBeenCalledWith("/api/auth/login", expect.objectContaining({ method: "POST" }));
    await waitFor(() => expect(result.current.clubs).toHaveLength(1));
  });
});
