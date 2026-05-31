import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";
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
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, phone: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem("tapin_user");
        if (stored) {
          const storedUser = JSON.parse(stored);
          // Set cached user immediately so UI renders fast
          setUser(storedUser);
          // Then refresh from server to pick up any role/profile changes
          try {
            const res = await fetch(`${API_BASE}/profile`, {
              headers: { Authorization: `Bearer ${storedUser.token}` },
            });
            if (res.ok) {
              const data = await res.json();
              const refreshed = { ...storedUser, ...data.user };
              setUser(refreshed);
              await AsyncStorage.setItem("tapin_user", JSON.stringify(refreshed));
            }
          } catch {}
          registerForPushNotifications(storedUser.token);
          startGeofencing(storedUser.token);
        }
      } catch {}
      setLoading(false);
    })();
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

  const register = async (name: string, email: string, password: string, phone: string) => {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, phone }),
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

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
