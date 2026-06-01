import { createContext, useContext, useCallback, useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";

interface ReviewReportsPendingValue {
  pending: number;
  refresh: () => Promise<void>;
}

const ReviewReportsPendingContext = createContext<ReviewReportsPendingValue>({
  pending: 0,
  refresh: async () => {},
});

const POLL_MS = 60_000;

export function ReviewReportsPendingProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const data = await api<{ pending: number }>("/api/admin/review-reports/count");
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
    <ReviewReportsPendingContext.Provider value={{ pending, refresh }}>
      {children}
    </ReviewReportsPendingContext.Provider>
  );
}

export function useReviewReportsPending() {
  return useContext(ReviewReportsPendingContext);
}
