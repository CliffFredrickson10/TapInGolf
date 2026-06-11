import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Clock, CalendarCheck, Star, Users, Calendar, TrendingUp, Banknote, Building2, PersonStanding, Smartphone } from "lucide-react";
import { format } from "date-fns";

interface DashboardData {
  tee_times_today: number;
  active_tee_times_today: number;
  bookings_today: number;
  confirmed_bookings_today: number;
  pending_bookings_today: number;
  total_reviews: number;
  avg_rating: number | null;
  active_members: number;
  active_events: number;
  recent_bookings: any[];
  total_revenue: number;
  club_earnings: number;
  platform_fees: number;
  walkin_bookings: number;
  app_bookings: number;
}

type PeriodKey = "today" | "week" | "month" | "quarter" | "year" | "custom";

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "today",   label: "Today" },
  { key: "week",    label: "This Week" },
  { key: "month",   label: "This Month" },
  { key: "quarter", label: "This Quarter" },
  { key: "year",    label: "This Year" },
  { key: "custom",  label: "Custom" },
];

function fmt(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getFiscalYearStart(now: Date, fiscalStartMonth: number): Date {
  const fsm = fiscalStartMonth - 1; // 0-indexed
  const fyStartYear = now.getMonth() >= fsm ? now.getFullYear() : now.getFullYear() - 1;
  return new Date(fyStartYear, fsm, 1);
}

function getDateRange(period: PeriodKey, customFrom: string, customTo: string, fiscalStartMonth = 1): { from: string; to: string } {
  const now = new Date();
  const todayStr = fmt(now);

  switch (period) {
    case "today":
      return { from: todayStr, to: todayStr };

    case "week": {
      const day = now.getDay(); // 0=Sun
      const diff = day === 0 ? 6 : day - 1; // days since Monday
      const mon = new Date(now);
      mon.setDate(now.getDate() - diff);
      return { from: fmt(mon), to: todayStr };
    }

    case "month":
      return { from: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), to: todayStr };

    case "quarter": {
      const fyStart = getFiscalYearStart(now, fiscalStartMonth);
      const monthsFromFy = (now.getMonth() - fyStart.getMonth() + 12) % 12;
      const qOffset = Math.floor(monthsFromFy / 3) * 3;
      const qStart = new Date(fyStart);
      qStart.setMonth(fyStart.getMonth() + qOffset);
      return { from: fmt(qStart), to: todayStr };
    }

    case "year":
      return { from: fmt(getFiscalYearStart(now, fiscalStartMonth)), to: todayStr };

    case "custom":
      return { from: customFrom || todayStr, to: customTo || todayStr };

    default:
      return { from: todayStr, to: todayStr };
  }
}

function periodLabel(period: PeriodKey, from: string, to: string): string {
  if (period === "today") return "today's overview";
  if (period === "custom") return `${from} to ${to}`;
  return PERIODS.find(p => p.key === period)?.label.toLowerCase() + "'s overview";
}

const fmtRand = (n: number) => `R ${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Dashboard() {
  const { club } = useAuth();
  const [data, setData]             = useState<DashboardData | null>(null);
  const [error, setError]           = useState("");
  const [loading, setLoading]       = useState(true);
  const [period, setPeriod]         = useState<PeriodKey>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo]     = useState("");

  const { from, to } = getDateRange(period, customFrom, customTo, club?.fiscal_year_start_month ?? 1);

  const load = useCallback(async (f: string, t: string) => {
    setLoading(true);
    setError("");
    try {
      const result = await api<DashboardData>(`/api/portal/dashboard?from=${f}&to=${t}`);
      setData(result);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (period === "custom" && (!customFrom || !customTo)) return;
    load(from, to);
  }, [period, from, to]);

  const periodSuffix = period === "today" ? " Today" : "";

  const stats = data ? [
    {
      label: `Tee Times${periodSuffix}`,
      value: `${data.active_tee_times_today} / ${data.tee_times_today}`,
      sub: "active / total slots",
      icon: Clock,
      color: "text-blue-600",
    },
    {
      label: `Bookings${periodSuffix}`,
      value: data.bookings_today,
      sub: `${data.confirmed_bookings_today} confirmed`,
      icon: CalendarCheck,
      color: "text-green-600",
    },
    {
      label: "Avg Rating",
      value: data.avg_rating ? `${data.avg_rating} ★` : "—",
      sub: `${data.total_reviews} reviews (all time)`,
      icon: Star,
      color: "text-yellow-600",
    },
    {
      label: "Active Members",
      value: data.active_members,
      sub: "registered golfers",
      icon: Users,
      color: "text-purple-600",
    },
    {
      label: "Active Events",
      value: data.active_events,
      sub: "upcoming events",
      icon: Calendar,
      color: "text-orange-600",
    },
    {
      label: `Pending Bookings${periodSuffix}`,
      value: data.pending_bookings_today,
      sub: "awaiting confirmation",
      icon: TrendingUp,
      color: "text-red-600",
    },
    {
      label: `Club Earnings${periodSuffix}`,
      value: fmtRand(data.club_earnings ?? 0),
      sub: `of ${fmtRand(data.total_revenue ?? 0)} total collected`,
      icon: Building2,
      color: "text-[#1a5c38]",
    },
    {
      label: `Platform Fees${periodSuffix}`,
      value: fmtRand(data.platform_fees ?? 0),
      sub: "flat fee per booking",
      icon: Banknote,
      color: "text-amber-600",
    },
    {
      label: `Walk-in Bookings${periodSuffix}`,
      value: data.walkin_bookings ?? 0,
      sub: "counter / walk-in",
      icon: PersonStanding,
      color: "text-orange-600",
    },
    {
      label: `App Bookings${periodSuffix}`,
      value: data.app_bookings ?? 0,
      sub: "booked via TapIn app",
      icon: Smartphone,
      color: "text-blue-600",
    },
  ] : [];

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Welcome back, {club?.name}. Here's {periodLabel(period, from, to)}.
          </p>
        </div>
      </div>

      {/* Period selector */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex bg-muted rounded-lg p-1 gap-0.5">
          {PERIODS.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                period === p.key
                  ? "bg-white text-[#1a5c38] shadow-sm font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {period === "custom" && (
          <div className="flex items-center gap-2 ml-2">
            <Input
              type="date"
              value={customFrom}
              max={customTo || undefined}
              onChange={e => setCustomFrom(e.target.value)}
              className="h-8 w-36 text-sm"
            />
            <span className="text-muted-foreground text-sm">to</span>
            <Input
              type="date"
              value={customTo}
              min={customFrom || undefined}
              onChange={e => setCustomTo(e.target.value)}
              className="h-8 w-36 text-sm"
            />
          </div>
        )}

        {period !== "today" && (
          <span className="text-xs text-muted-foreground ml-1">
            {from === to ? from : `${from} — ${to}`}
          </span>
        )}
      </div>

      {/* Stats grid */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
      ) : data && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.label}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle>
                  <Icon className={`h-5 w-5 ${stat.color}`} />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stat.value}</div>
                  <p className="text-xs text-muted-foreground mt-1">{stat.sub}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Recent bookings */}
      {!loading && !error && data && data.recent_bookings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Bookings{period !== "today" ? ` — ${PERIODS.find(p => p.key === period)?.label ?? ""}` : ""}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.recent_bookings.map((b: any) => (
                <div key={b.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="font-medium text-sm">{b.guest_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {b.date} at {String(b.time).slice(0, 5)} · {b.players} player{b.players !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      b.status === "confirmed"  ? "bg-green-100 text-green-700" :
                      b.status === "pending"    ? "bg-yellow-100 text-yellow-700" :
                      b.status === "cancelled"  ? "bg-red-100 text-red-700" :
                      "bg-gray-100 text-gray-700"
                    }`}>{b.status}</span>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {format(new Date(b.created_at), "dd MMM HH:mm")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
