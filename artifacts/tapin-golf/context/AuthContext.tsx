import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { API_BASE } from "@/lib/api";
import { registerForPushNotifications } from "@/hooks/usePushNotifications";
import { startGeofencing, stopGeofencing } from "@/lib/geofencing";

export interface User {
  id: number;
  name: string;
  email: string;
  phone?: string;
  avatar?: string;
  handicap?: number;
  role: "golfer" | "club_admin";
  club_id: number | null;
  token: string;
  gender?: "male" | "female" | "prefer_not_to_say" | null;
  date_of_birth?: string | null;
  home_province?: string | null;
  hna_number?: string | null;
  student_number?: string | null;
  hna_locked?: boolean;
  hna_verified?: boolean;
  hna_verified_club_name?: string | null;
  hna_valid_until?: string | null;
  student_number_locked?: boolean;
  ad_free_until?: string | null;
  is_super_user?: boolean;
  terms_accepted?: boolean;
  chat_disabled?: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  socialLogin: (provider: string, email: string, name?: string, providerUserId?: string) => Promise<void>;
  register: (name: string, email: string, password: string, phone: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
  acceptTerms: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

// How often the mobile pings /api/health to keep the server warm (ms)
const KEEP_ALIVE_INTERVAL_MS = 4 * 60 * 1000;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  // Use a ref so AppState listener always sees the latest user without re-subscribing
  const userRef = useRef<User | null>(null);
  userRef.current = user;

  // Silently refresh the profile from the server and merge into stored state
  const refreshProfile = useCallback(async (token: string) => {
    try {
      const res = await fetch(`${API_BASE}/profile`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      } as RequestInit);
      if (res.ok) {
        const data = await res.json();
        setUser((prev) => {
          if (!prev) return prev;
          const refreshed = { ...prev, ...data.user };
          AsyncStorage.setItem("tapin_user", JSON.stringify(refreshed));
          return refreshed;
        });
      }
    } catch {
      // Network offline — keep using cached user
    }
  }, []);

  // Boot: restore session from storage then refresh from server
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem("tapin_user");
        if (stored) {
          const storedUser: User = JSON.parse(stored);
          setUser(storedUser);
          // Refresh from server in the background
          refreshProfile(storedUser.token);
          registerForPushNotifications(storedUser.token);
          startGeofencing(storedUser.token);
        }
      } catch {}
      setLoading(false);
    })();
  }, [refreshProfile]);

  // Foreground refresh: when the app comes back from background, silently
  // re-fetch the profile so stale data (wallet, HNA status, etc.) is updated
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === "active" && userRef.current) {
        refreshProfile(userRef.current.token);
      }
    };
    const sub = AppState.addEventListener("change", handleAppStateChange);
    return () => sub.remove();
  }, [refreshProfile]);

  // Keep-alive ping: hit /api/health every 4 minutes so the server stays
  // warm and the DB connection pool doesn't go idle
  useEffect(() => {
    const interval = setInterval(async () => {
      if (!userRef.current) return; // only ping when a user is logged in
      try {
        await fetch(`${API_BASE}/health`, { cache: "no-store" } as RequestInit);
      } catch {
        // Offline — no-op; next ping or user action will reconnect
      }
    }, KEEP_ALIVE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const login = async (email: string, password: string) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Login failed");
    setUser(data.user);
    await AsyncStorage.setItem("tapin_user", JSON.stringify(data.user));
    registerForPushNotifications(data.user.token);
    startGeofencing(data.user.token);
  };

  const socialLogin = async (provider: string, email: string, name?: string, providerUserId?: string) => {
    const res = await fetch(`${API_BASE}/auth/social`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, email, name, provider_user_id: providerUserId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Social login failed");
    setUser(data.user);
    await AsyncStorage.setItem("tapin_user", JSON.stringify(data.user));
    registerForPushNotifications(data.user.token);
    startGeofencing(data.user.token);
  };

  const register = async (name: string, email: string, password: string, phone: string) => {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, phone, terms_accepted: true }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Registration failed");
    setUser(data.user);
    await AsyncStorage.setItem("tapin_user", JSON.stringify(data.user));
    registerForPushNotifications(data.user.token);
    startGeofencing(data.user.token);
  };

  const logout = async () => {
    stopGeofencing();
    setUser(null);
    await AsyncStorage.removeItem("tapin_user");
  };

  const updateUser = (updates: Partial<User>) => {
    if (!user) return;
    const updated = { ...user, ...updates };
    setUser(updated);
    AsyncStorage.setItem("tapin_user", JSON.stringify(updated));
  };

  const acceptTerms = async () => {
    const current = userRef.current;
    if (!current) return;
    const res = await fetch(`${API_BASE}/profile/accept-terms`, {
      method: "POST",
      headers: { Authorization: `Bearer ${current.token}` },
    });
    if (!res.ok) throw new Error("Could not record acceptance");
    setUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, terms_accepted: true };
      AsyncStorage.setItem("tapin_user", JSON.stringify(updated));
      return updated;
    });
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, socialLogin, register, logout, updateUser, acceptTerms }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
