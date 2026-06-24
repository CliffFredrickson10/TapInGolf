import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Trophy, Calendar, Users, ChevronDown, ChevronRight, Plus, Send,
} from "lucide-react";
import { format } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

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

const EMPTY_FORM = {
  name: "",
  description: "",
  event_date: "",
  end_date: "",
  restriction: "members_only",
  scoring_enabled: true,
};

const RESTRICT_LABELS: Record<string, string> = {
  open: "Open (anyone)",
  members_only: "Members Only",
  invitation_only: "Invite Only",
  whs_players_only: "WHS Index Players Only",
};

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending_publish: "bg-amber-100 text-amber-700",
    upcoming: "bg-blue-100 text-blue-700",
    active: "bg-green-100 text-green-700",
    completed: "bg-gray-100 text-gray-600",
    cancelled: "bg-red-100 text-red-600",
  };
  const label: Record<string, string> = {
    pending_publish: "Draft",
    upcoming: "Upcoming",
    active: "Active",
    completed: "Completed",
    cancelled: "Cancelled",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${map[status] ?? "bg-gray-100 text-gray-600"}`}>
      {label[status] ?? status}
    </span>
  );
}

// ─── Ringer Board ─────────────────────────────────────────────────────────────

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
      <p className="text-[11px] text-muted-foreground mb-2">
        Best score per hole across all submitted rounds · ordered by total gross
      </p>
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
                {isOpen
                  ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
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
                        <span className={`font-bold ${score != null ? "text-foreground" : "text-muted-foreground/30"}`}>
                          {score ?? "·"}
                        </span>
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

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EclecticPage() {
  const { toast } = useToast();
  const [events, setEvents] = useState<EclecticEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [openEvent, setOpenEvent] = useState<number | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [publishing, setPublishing] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<any[]>(`/api/portal/events?upcoming=all`);
      setEvents(data.filter((e: any) => e.event_type === "eclectic"));
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!form.name.trim() || !form.event_date) {
      toast({ title: "Name and start date are required", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      await api("/api/portal/events", {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || null,
          event_date: form.event_date,
          end_date: form.end_date || null,
          restriction: form.restriction,
          scoring_enabled: form.scoring_enabled ? 1 : 0,
          event_type: "eclectic",
          format: "net_stroke_play",
          entries_required: 0,
        }),
      });
      toast({ title: "Eclectic tournament created", description: "Publish it when you're ready for players to see it." });
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      load();
    } catch (e: any) {
      toast({ title: "Error creating tournament", description: e.message, variant: "destructive" });
    } finally { setCreating(false); }
  };

  const handlePublish = async (ev: EclecticEvent) => {
    setPublishing(ev.id);
    try {
      await api(`/api/portal/events/${ev.id}/publish`, { method: "POST" });
      toast({ title: `"${ev.name}" is now live`, description: "Club members can see it and submit scores." });
      load();
    } catch (e: any) {
      toast({ title: "Publish failed", description: e.message, variant: "destructive" });
    } finally { setPublishing(null); }
  };

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Eclectic</h1>
          <p className="text-muted-foreground mt-1">
            Year-long ringer boards — each player's best score per hole across all submitted rounds.
          </p>
        </div>
        <Button
          className="bg-[#1a5c38] hover:bg-[#164d30] gap-2"
          onClick={() => { setForm(EMPTY_FORM); setCreateOpen(true); }}
        >
          <Plus className="h-4 w-4" />New Eclectic Tournament
        </Button>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : events.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Trophy className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="font-semibold text-muted-foreground">No eclectic competitions yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Click <span className="font-medium text-foreground">New Eclectic Tournament</span> above to create one.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {events.map(ev => {
            const isOpen = openEvent === ev.id;
            const isPendingPublish = ev.status === "pending_publish";
            return (
              <Card key={ev.id} className="overflow-hidden">
                <CardContent className="p-0">
                  <div
                    role="button"
                    tabIndex={0}
                    className="w-full flex items-start gap-4 p-4 text-left hover:bg-muted/30 transition-colors cursor-pointer select-none"
                    onClick={() => setOpenEvent(isOpen ? null : ev.id)}
                    onKeyDown={e => e.key === "Enter" && setOpenEvent(isOpen ? null : ev.id)}
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
                    <div className="flex items-center gap-2 shrink-0 pt-0.5">
                      {isPendingPublish && (
                        <Button
                          size="sm"
                          className="bg-[#1a5c38] hover:bg-[#164d30] gap-1.5 h-7 text-xs"
                          disabled={publishing === ev.id}
                          onClick={e => { e.stopPropagation(); handlePublish(ev); }}
                        >
                          <Send className="h-3 w-3" />
                          {publishing === ev.id ? "Publishing…" : "Publish"}
                        </Button>
                      )}
                      {isOpen
                        ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </div>
                  {isOpen && (
                    <div className="px-4 pb-4 border-t">
                      {isPendingPublish && (
                        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 mt-3">
                          This competition is a draft. Publish it so club members can see it and submit scores via the mobile app.
                        </p>
                      )}
                      <RingerBoard eventId={ev.id} />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Eclectic Tournament</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-xs text-muted-foreground">
              Format is always <span className="font-medium text-foreground">Nett Stroke Play</span>. Players submit rounds via the mobile app and their best score per hole builds the ringer board automatically.
            </p>
            <div className="space-y-1.5">
              <Label>Tournament Name *</Label>
              <Input
                placeholder="e.g. 2025 Eclectic Championship"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input
                placeholder="Optional description"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start Date *</Label>
                <Input
                  type="date"
                  value={form.event_date}
                  onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={form.end_date}
                  onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Participation</Label>
              <Select value={form.restriction} onValueChange={v => setForm(f => ({ ...f, restriction: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(RESTRICT_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Live Scoring</p>
                <p className="text-xs text-muted-foreground">Players submit scores via the mobile app</p>
              </div>
              <Switch
                checked={form.scoring_enabled}
                onCheckedChange={v => setForm(f => ({ ...f, scoring_enabled: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              className="bg-[#1a5c38] hover:bg-[#164d30]"
              onClick={handleCreate}
              disabled={creating}
            >
              {creating ? "Creating…" : "Create Tournament"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
