import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import {
  api, getToken, setToken, clearToken,
  getMode, setMode, getSelectedClubId, setSelectedClubId as persistSelectedClubId,
} from "@/lib/api";

export type Permission = "none" | "view" | "edit";
export type Permissions = Record<string, Permission>;

interface ClubInfo {
  id: number;
  name: string;
  location: string;
  province: string;
}

export interface ClubUserInfo {
  id: number;
  name: string;
  email: string;
  role: "admin" | "member";
  permissions: Permissions;
}

export interface StaffInfo {
  id: number;
  name: string;
  email: string;
}

export interface StaffClub {
  id: number;
  name: string;
  province: string | null;
  location?: string | null;
}

interface AuthContextValue {
  club: ClubInfo | null;
  clubUser: ClubUserInfo | null;
  staff: StaffInfo | null;
  clubs: StaffClub[];
  selectedClubId: number | null;
  setSelectedClubId: (id: number | null) => void;
  loading: boolean;
  isClubAdmin: boolean;
  canView: (section: string) => boolean;
  canEdit: (section: string) => boolean;
  login: (username: string, password: string) => Promise<void>;
  clubUserLogin: (email: string, password: string) => Promise<void>;
  staffLogin: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  club: null,
  clubUser: null,
  staff: null,
  clubs: [],
  selectedClubId: null,
  setSelectedClubId: () => {},
  loading: true,
  isClubAdmin: false,
  canView: () => true,
  canEdit: () => true,
  login: async () => {},
  clubUserLogin: async () => {},
  staffLogin: async () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [club, setClub] = useState<ClubInfo | null>(null);
  const [clubUser, setClubUser] = useState<ClubUserInfo | null>(null);
  const [staff, setStaff] = useState<StaffInfo | null>(null);
  const [clubs, setClubs] = useState<StaffClub[]>([]);
  const [selectedClubId, setSelectedClubIdState] = useState<number | null>(getSelectedClubId());
  const [loading, setLoading] = useState(true);

  const setSelectedClubId = useCallback((id: number | null) => {
    setSelectedClubIdState(id);
    persistSelectedClubId(id);
  }, []);

  const loadClubs = useCallback(async () => {
    const data = await api<{ clubs: StaffClub[] }>("/api/admin/clubs");
    setClubs(data.clubs);
    const stored = getSelectedClubId();
    if (data.clubs.length > 0 && (stored == null || !data.clubs.some(c => c.id === stored))) {
      setSelectedClubId(data.clubs[0].id);
    }
    return data.clubs;
  }, [setSelectedClubId]);

  useEffect(() => {
    const token = getToken();
    if (!token) { setLoading(false); return; }
    const mode = getMode();

    if (mode === "staff") {
      api<{ user: any }>("/api/profile")
        .then(async (data) => {
          if (!data.user?.is_super_user) { clearToken(); return; }
          setStaff({ id: data.user.id, name: data.user.name, email: data.user.email });
          await loadClubs().catch(() => {});
        })
        .catch(() => clearToken())
        .finally(() => setLoading(false));
    } else if (mode === "club_user") {
      api<{ club: ClubInfo; clubUser: ClubUserInfo | null }>("/api/portal/users/me-user")
        .then((data) => {
          setClub(data.club);
          setClubUser(data.clubUser);
        })
        .catch(() => clearToken())
        .finally(() => setLoading(false));
    } else {
      api("/api/portal/auth/me")
        .then((data) => setClub({ id: data.id, name: data.name, location: data.location, province: data.province }))
        .catch(() => clearToken())
        .finally(() => setLoading(false));
    }
  }, [loadClubs]);

  const login = useCallback(async (username: string, password: string) => {
    const data = await api("/api/portal/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    setToken(data.token);
    setMode("club");
    setClub(data.club);
    setClubUser(null);
  }, []);

  const clubUserLogin = useCallback(async (email: string, password: string) => {
    const data = await api("/api/portal/users/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setToken(data.token);
    setMode("club_user");
    setClub(data.club);
    setClubUser(data.clubUser);
  }, []);

  const staffLogin = useCallback(async (email: string, password: string) => {
    const data = await api<{ user: any }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (!data.user?.is_super_user) {
      throw new Error("This account is not a TapIn staff account.");
    }
    setToken(data.user.token);
    setMode("staff");
    setStaff({ id: data.user.id, name: data.user.name, email: data.user.email });
    await loadClubs().catch(() => {});
  }, [loadClubs]);

  const logout = useCallback(() => {
    clearToken();
    setClub(null);
    setClubUser(null);
    setStaff(null);
    setClubs([]);
    setSelectedClubIdState(null);
  }, []);

  const isClubAdmin = !clubUser || clubUser.role === "admin";

  const canView = useCallback((section: string): boolean => {
    if (!clubUser) return true;
    const level = clubUser.permissions[section];
    return level === "view" || level === "edit";
  }, [clubUser]);

  const canEdit = useCallback((section: string): boolean => {
    if (!clubUser) return true;
    const level = clubUser.permissions[section];
    return level === "edit";
  }, [clubUser]);

  return (
    <AuthContext.Provider value={{
      club, clubUser, staff, clubs, selectedClubId, setSelectedClubId,
      loading, isClubAdmin, canView, canEdit,
      login, clubUserLogin, staffLogin, logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
