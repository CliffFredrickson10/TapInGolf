import { createContext, useContext, useCallback, useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";

interface ReportsPendingValue {
  pending: number;
  refresh: () => Promise<void>;
}

const ReportsPendingContext = createContext<ReportsPendingValue>({
  pending: 0,
  refresh: async () => {},
});

const POLL_MS = 60_000;

export function ReportsPendingProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const data = await api<{ pending: number }>("/api/admin/reports/count");
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
    <ReportsPendingContext.Provider value={{ pending, refresh }}>
      {children}
    </ReportsPendingContext.Provider>
  );
}

export function useReportsPending() {
  return useContext(ReportsPendingContext);
}
