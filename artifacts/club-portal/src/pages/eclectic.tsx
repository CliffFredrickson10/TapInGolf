import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Trophy, Calendar, Users, ChevronDown, ChevronRight } from "lucide-react";
import { format } from "date-fns";

interface EclecticEvent {
  id: number;
  name: string;
  description: string | null;
  event_date: string;
  end_date: string | null;
  status: string;
  approved_count: number;
  total_registrations: number;
}

interface RingerEntry {
  user_id: number;
  player_name: string;
  division: string | null;
  total_gross: number | null;
  total_net: number | null;
  rounds_counted: number;
  holes: Record<string, number> | null;
  holes_net: Record<string, number> | null;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    upcoming: "bg-blue-100 text-blue-700",
    active: "bg-green-100 text-green-700",
    completed: "bg-gray-100 text-gray-600",
    cancelled: "bg-red-100 text-red-600",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${map[status] ?? "bg-gray-100 text-gray-600"}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function RingerBoard({ eventId }: { eventId: number }) {
  const [boards, setBoards] = useState<RingerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    api<{ boards: RingerEntry[] }>(`/api/events/${eventId}/eclectic-board`)
      .then(d => setBoards(d.boards ?? []))
      .catch(() => setBoards([]))
      .finally(() => setLoading(false));
  }, [eventId]);

  if (loading) return <Skeleton className="h-20 w-full mt-3" />;
  if (boards.length === 0) return (
    <p className="text-sm text-muted-foreground py-4 text-center">No rounds submitted yet.</p>
  );

  return (
    <div className="mt-3 space-y-1.5">
      <p className="text-[11px] text-muted-foreground mb-2">Best score per hole across all submitted rounds · ordered by total gross</p>
      {boards.map((b, i) => {
        const holesBest: Record<string, number> = b.holes
          ? (typeof b.holes === "string" ? JSON.parse(b.holes) : b.holes)
          : {};
        const filled = Object.keys(holesBest).length;
        const isOpen = expanded === b.user_id;
        return (
          <div key={b.user_id} className="border rounded-lg overflow-hidden">
            <button
              type="button"
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/40 transition-colors"
              onClick={() => setExpanded(isOpen ? null : b.user_id)}
            >
              <span className="text-xs font-bold text-muted-foreground w-5 text-center shrink-0">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{b.player_name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {b.division ? `${b.division} Div · ` : ""}
                  {b.rounds_counted} round{b.rounds_counted !== 1 ? "s" : ""} · {filled}/18 holes
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs text-right shrink-0">
                <div>
                  <p className="font-bold text-sm">{b.total_gross ?? "—"}</p>
                  <p className="text-muted-foreground text-[10px]">Gross</p>
                </div>
                <div>
                  <p className="font-semibold text-sm">{b.total_net ?? "—"}</p>
                  <p className="text-muted-foreground text-[10px]">Nett</p>
                </div>
                {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
              </div>
            </button>
            {isOpen && (
              <div className="px-3 pb-3 pt-1 border-t bg-muted/20">
                <div className="grid grid-cols-9 gap-1">
                  {Array.from({ length: 18 }, (_, j) => j + 1).map(h => {
                    const score = holesBest[String(h)];
                    return (
                      <div
                        key={h}
                        className={`flex flex-col items-center rounded p-1 text-center text-[11px] ${score != null ? "bg-green-50 border border-green-200" : "bg-background border border-border"}`}
                      >
                        <span className="text-muted-foreground text-[9px]">{h}</span>
                        <span className={`font-bold ${score != null ? "text-foreground" : "text-muted-foreground/30"}`}>{score ?? "·"}</span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">{filled}/18 holes recorded</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function EclecticPage() {
  const [events, setEvents] = useState<EclecticEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [openEvent, setOpenEvent] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<any[]>(`/api/portal/events?upcoming=all`);
      setEvents(data.filter((e: any) => e.event_type === "eclectic"));
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Eclectic</h1>
        <p className="text-muted-foreground mt-1">Year-long ringer boards — each player's best score per hole across all submitted rounds.</p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : events.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Trophy className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="font-semibold text-muted-foreground">No eclectic competitions yet</p>
            <p className="text-sm text-muted-foreground mt-1">Create a new tournament on the <span className="font-medium text-foreground">Tournaments</span> tab and set the type to <span className="font-medium text-foreground">Eclectic</span>.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {events.map(ev => {
            const isOpen = openEvent === ev.id;
            return (
              <Card key={ev.id} className="overflow-hidden">
                <CardContent className="p-0">
                  <button
                    type="button"
                    className="w-full flex items-start gap-4 p-4 text-left hover:bg-muted/30 transition-colors"
                    onClick={() => setOpenEvent(isOpen ? null : ev.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-base">{ev.name}</p>
                        <StatusBadge status={ev.status} />
                      </div>
                      <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {format(new Date(ev.event_date), "d MMM yyyy")}
                          {ev.end_date ? ` – ${format(new Date(ev.end_date), "d MMM yyyy")}` : ""}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" />
                          {ev.approved_count} player{ev.approved_count !== 1 ? "s" : ""}
                        </span>
                      </div>
                      {ev.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{ev.description}</p>
                      )}
                    </div>
                    <div className="shrink-0 pt-0.5">
                      {isOpen
                        ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 border-t">
                      <RingerBoard eventId={ev.id} />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
