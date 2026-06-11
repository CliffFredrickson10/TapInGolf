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
  { key: "week",    label: "Week" },
  { key: "month",   label: "Month" },
  { key: "quarter", label: "Quarter" },
  { key: "year",    label: "Year" },
  { key: "custom",  label: "Custom" },
];

const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTH_FULL  = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getFiscalYearStart(now: Date, fiscalStartMonth: number): Date {
  const fsm = fiscalStartMonth - 1;
  const fyStartYear = now.getMonth() >= fsm ? now.getFullYear() : now.getFullYear() - 1;
  return new Date(fyStartYear, fsm, 1);
}

function currentFiscalQuarter(now: Date, fiscalStartMonth: number): { fq: number; fyYear: number } {
  const fyStart = getFiscalYearStart(now, fiscalStartMonth);
  const monthsFrom = (now.getMonth() - fyStart.getMonth() + 12) % 12;
  return { fq: Math.floor(monthsFrom / 3), fyYear: fyStart.getFullYear() };
}

function getDateRange(
  period: PeriodKey,
  weekPickDate: string,
  selectedMonth: number,
  selectedMonthYear: number,
  selectedFQ: number,
  selectedFQYear: number,
  selectedFYear: number,
  customFrom: string,
  customTo: string,
  fiscalStartMonth = 1
): { from: string; to: string } {
  const now = new Date();
  const todayStr = fmt(now);

  switch (period) {
    case "today":
      return { from: todayStr, to: todayStr };

    case "week": {
      const pick = weekPickDate ? new Date(weekPickDate + "T00:00:00") : now;
      if (isNaN(pick.getTime())) return { from: todayStr, to: todayStr };
      const day = pick.getDay();
      const diff = day === 0 ? 6 : day - 1;
      const mon = new Date(pick);
      mon.setDate(pick.getDate() - diff);
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      return { from: fmt(mon), to: fmt(sun) };
    }

    case "month": {
      const isCurrentMonth = selectedMonthYear === now.getFullYear() && selectedMonth === now.getMonth();
      return {
        from: fmt(new Date(selectedMonthYear, selectedMonth, 1)),
        to:   isCurrentMonth ? todayStr : fmt(new Date(selectedMonthYear, selectedMonth + 1, 0)),
      };
    }

    case "quarter": {
      const fsm = fiscalStartMonth - 1;
      const qStartMonth = (fsm + selectedFQ * 3) % 12;
      const qEndMonth   = (fsm + selectedFQ * 3 + 2) % 12;
      const qStartYear  = qStartMonth < fsm ? selectedFQYear + 1 : selectedFQYear;
      const qEndYear    = qEndMonth < qStartMonth ? qStartYear + 1 : qStartYear;
      return {
        from: fmt(new Date(qStartYear, qStartMonth, 1)),
        to:   fmt(new Date(qEndYear, qEndMonth + 1, 0)),
      };
    }

    case "year": {
      const fsm = fiscalStartMonth - 1;
      return {
        from: fmt(new Date(selectedFYear, fsm, 1)),
        to:   fmt(new Date(selectedFYear + 1, fsm, 0)),
      };
    }

    case "custom":
      return { from: customFrom || todayStr, to: customTo || todayStr };

    default:
      return { from: todayStr, to: todayStr };
  }
}

function periodLabel(
  period: PeriodKey,
  selectedMonth: number,
  selectedMonthYear: number,
  selectedFQ: number,
  selectedFQYear: number,
  selectedFYear: number,
  from: string,
  to: string,
  fiscalStartMonth = 1
): string {
  switch (period) {
    case "today":   return "today";
    case "week":    return `${from} — ${to}`;
    case "month":   return `${MONTH_FULL[selectedMonth]} ${selectedMonthYear}`;
    case "quarter": {
      const fsm = fiscalStartMonth - 1;
      const qStartMonth = (fsm + selectedFQ * 3) % 12;
      const qStartYear  = qStartMonth < fsm ? selectedFQYear + 1 : selectedFQYear;
      return `Q${selectedFQ + 1} ${qStartYear} (${from} — ${to})`;
    }
    case "year": {
      const fsm = fiscalStartMonth - 1;
      const label = fsm === 0 ? String(selectedFYear) : `FY${selectedFYear}`;
      return `${label} (${from} — ${to})`;
    }
    case "custom":  return `${from} — ${to}`;
    default:        return "";
  }
}

const fmtRand = (n: number) =>
  `R ${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Dashboard() {
  const { club } = useAuth();
  const fiscalStartMonth = club?.fiscal_year_start_month ?? 1;

  const now = new Date();
  const currentYear = now.getFullYear();
  const yearOptions = [currentYear - 2, currentYear - 1, currentYear];

  const initFQ = currentFiscalQuarter(now, fiscalStartMonth);

  const [data, setData]                     = useState<DashboardData | null>(null);
  const [error, setError]                   = useState("");
  const [loading, setLoading]               = useState(true);
  const [period, setPeriod]                 = useState<PeriodKey>("month");
  const [weekPickDate, setWeekPickDate]     = useState(() => fmt(now));
  const [selectedMonth, setSelectedMonth]   = useState(now.getMonth());
  const [selectedMonthYear, setSelectedMonthYear] = useState(currentYear);
  const [selectedFQ, setSelectedFQ]         = useState(initFQ.fq);
  const [selectedFQYear, setSelectedFQYear] = useState(initFQ.fyYear);
  const [selectedFYear, setSelectedFYear]   = useState(initFQ.fyYear);
  const [customFrom, setCustomFrom]         = useState("");
  const [customTo, setCustomTo]             = useState("");

  const { from, to } = getDateRange(
    period, weekPickDate, selectedMonth, selectedMonthYear,
    selectedFQ, selectedFQYear, selectedFYear,
    customFrom, customTo, fiscalStartMonth
  );

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

  const pill = (active: boolean) =>
    `px-3 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer select-none ${
      active
        ? "bg-[#1a5c38] text-white shadow-sm"
        : "bg-muted text-muted-foreground hover:text-foreground"
    }`;

  const stats = data ? [
    { label: "Tee Times",        value: `${data.active_tee_times_today} / ${data.tee_times_today}`, sub: "active / total slots",            icon: Clock,          color: "text-blue-600" },
    { label: "Bookings",         value: data.bookings_today,             sub: `${data.confirmed_bookings_today} confirmed`,                     icon: CalendarCheck,  color: "text-green-600" },
    { label: "Avg Rating",       value: data.avg_rating ? `${data.avg_rating} ★` : "—", sub: `${data.total_reviews} reviews (all time)`,  icon: Star,           color: "text-yellow-600" },
    { label: "Active Members",   value: data.active_members,             sub: "registered golfers",                                            icon: Users,          color: "text-purple-600" },
    { label: "Active Events",    value: data.active_events,              sub: "upcoming events",                                               icon: Calendar,       color: "text-orange-600" },
    { label: "Pending Bookings", value: data.pending_bookings_today,     sub: "awaiting confirmation",                                         icon: TrendingUp,     color: "text-red-600" },
    { label: "Club Earnings",    value: fmtRand(data.club_earnings ?? 0), sub: `of ${fmtRand(data.total_revenue ?? 0)} total collected`,       icon: Building2,      color: "text-[#1a5c38]" },
    { label: "Platform Fees",    value: fmtRand(data.platform_fees ?? 0), sub: "flat fee per booking",                                         icon: Banknote,       color: "text-amber-600" },
    { label: "Walk-in Bookings", value: data.walkin_bookings ?? 0,       sub: "counter / walk-in",                                             icon: PersonStanding, color: "text-orange-600" },
    { label: "App Bookings",     value: data.app_bookings ?? 0,          sub: "booked via TapIn app",                                          icon: Smartphone,     color: "text-blue-600" },
  ] : [];

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Welcome back, {club?.name}. Showing{" "}
          {periodLabel(period, selectedMonth, selectedMonthYear, selectedFQ, selectedFQYear, selectedFYear, from, to, fiscalStartMonth)}.
        </p>
      </div>

      {/* Period selector */}
      <div className="space-y-3">
        {/* Main period tabs */}
        <div className="flex bg-muted rounded-lg p-1 gap-0.5 w-fit">
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

        {/* Week picker */}
        {period === "week" && (
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm text-muted-foreground">Any date in the week:</span>
            <Input
              type="date"
              value={weekPickDate}
              onChange={e => setWeekPickDate(e.target.value)}
              className="h-8 w-36 text-sm"
            />
            {from && to && (
              <span className="text-xs text-muted-foreground">{from} — {to}</span>
            )}
          </div>
        )}

        {/* Month picker */}
        {period === "month" && (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex gap-1 flex-wrap">
              {MONTH_SHORT.map((m, i) => (
                <button key={i} onClick={() => setSelectedMonth(i)} className={pill(selectedMonth === i)}>
                  {m}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              {yearOptions.map(y => (
                <button key={y} onClick={() => setSelectedMonthYear(y)} className={pill(selectedMonthYear === y)}>
                  {y}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Quarter picker */}
        {period === "quarter" && (
          <div className="flex items-center gap-4 flex-wrap">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quarter</p>
              <div className="flex gap-1">
                {[0, 1, 2, 3].map(q => (
                  <button key={q} onClick={() => setSelectedFQ(q)} className={pill(selectedFQ === q)}>
                    Q{q + 1}
                  </button>
                ))}
              </div>
            </div>
            <div className="w-px h-10 bg-border self-end" />
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Year</p>
              <div className="flex gap-1">
                {yearOptions.map(y => (
                  <button key={y} onClick={() => setSelectedFQYear(y)} className={pill(selectedFQYear === y)}>
                    {y}
                  </button>
                ))}
              </div>
            </div>
            <span className="text-xs text-muted-foreground self-end pb-0.5">{from} — {to}</span>
          </div>
        )}

        {/* Year picker */}
        {period === "year" && (
          <div className="flex items-center gap-1 flex-wrap">
            {yearOptions.map(y => (
              <button key={y} onClick={() => setSelectedFYear(y)} className={pill(selectedFYear === y)}>
                {y}
              </button>
            ))}
          </div>
        )}

        {/* Custom picker */}
        {period === "custom" && (
          <div className="flex items-center gap-2 flex-wrap">
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
            <CardTitle>Recent Bookings</CardTitle>
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
                      b.status === "confirmed" ? "bg-green-100 text-green-700" :
                      b.status === "pending"   ? "bg-yellow-100 text-yellow-700" :
                      b.status === "cancelled" ? "bg-red-100 text-red-700" :
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
