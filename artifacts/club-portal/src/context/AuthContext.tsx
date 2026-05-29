import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { api, getToken, setToken, clearToken } from "@/lib/api";

interface ClubInfo {
  id: number;
  name: string;
  location: string;
  province: string;
}

interface AuthContextValue {
  club: ClubInfo | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  club: null,
  loading: true,
  login: async () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [club, setClub] = useState<ClubInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) { setLoading(false); return; }
    api("/api/portal/auth/me")
      .then((data) => setClub({ id: data.id, name: data.name, location: data.location, province: data.province }))
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const data = await api("/api/portal/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    setToken(data.token);
    setClub(data.club);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setClub(null);
  }, []);

  return (
    <AuthContext.Provider value={{ club, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
