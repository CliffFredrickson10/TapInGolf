import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, CalendarCheck, Star, Users, Calendar, TrendingUp } from "lucide-react";
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
}

export default function Dashboard() {
  const { club } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<DashboardData>("/api/portal/dashboard")
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-8 space-y-6">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-4">Dashboard</h1>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
      </div>
    );
  }

  if (!data) return null;

  const stats = [
    { label: "Tee Times Today", value: `${data.active_tee_times_today} / ${data.tee_times_today}`, sub: "active slots", icon: Clock, color: "text-blue-600" },
    { label: "Bookings Today", value: data.bookings_today, sub: `${data.confirmed_bookings_today} confirmed`, icon: CalendarCheck, color: "text-green-600" },
    { label: "Avg Rating", value: data.avg_rating ? `${data.avg_rating} ★` : "—", sub: `${data.total_reviews} reviews`, icon: Star, color: "text-yellow-600" },
    { label: "Active Members", value: data.active_members, sub: "registered golfers", icon: Users, color: "text-purple-600" },
    { label: "Active Events", value: data.active_events, sub: "upcoming events", icon: Calendar, color: "text-orange-600" },
    { label: "Pending Bookings", value: data.pending_bookings_today, sub: "awaiting confirmation", icon: TrendingUp, color: "text-red-600" },
  ];

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Welcome back, {club?.name}. Here's today's overview.
        </p>
      </div>

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

      {data.recent_bookings.length > 0 && (
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
                      b.status === "pending" ? "bg-yellow-100 text-yellow-700" :
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
