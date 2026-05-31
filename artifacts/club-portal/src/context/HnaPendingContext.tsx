import { createContext, useContext, useCallback, useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";

interface HnaPendingValue {
  pending: number;
  refresh: () => Promise<void>;
}

const HnaPendingContext = createContext<HnaPendingValue>({
  pending: 0,
  refresh: async () => {},
});

const POLL_MS = 60_000;

export function HnaPendingProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const data = await api<{ pending: number }>("/api/admin/hna-verifications/count");
      setPending(data.pending);
    } catch {
      // Non-fatal — leave the last known count in place.
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  return (
    <HnaPendingContext.Provider value={{ pending, refresh }}>
      {children}
    </HnaPendingContext.Provider>
  );
}

export function useHnaPending() {
  return useContext(HnaPendingContext);
}
