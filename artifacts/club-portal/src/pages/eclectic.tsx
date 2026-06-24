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
  Trophy, Calendar, Users, ChevronDown, ChevronRight, Plus, Send, Printer,
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
  frozen_handicap: number | null;
  holes: Record<string, number> | string | null;
  holes_net: Record<string, number> | string | null;
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

// ─── Eclectic Board (2 tabs) ──────────────────────────────────────────────────

function EclecticBoard({ event }: { event: EclecticEvent }) {
  const [boards, setBoards]           = useState<RingerEntry[]>([]);
  const [loading, setLoading]         = useState(true);
  const [activeTab, setActiveTab]     = useState<"leaderboard" | "rounds">("leaderboard");
  const [selectedPlayer, setSelectedPlayer] = useState<number | null>(null);
  const [rounds, setRounds]           = useState<any[]>([]);
  const [roundsLoading, setRoundsLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api<{ boards: RingerEntry[] }>(`/api/events/${event.id}/eclectic-board`)
      .then(d => setBoards(d.boards ?? []))
      .catch(() => setBoards([]))
      .finally(() => setLoading(false));
  }, [event.id]);

  const loadRounds = useCallback(async (userId: number) => {
    setRoundsLoading(true);
    try {
      const data = await api<{ rounds: any[] }>(`/api/events/${event.id}/eclectic-rounds?userId=${userId}`);
      setRounds(data.rounds ?? []);
    } catch { setRounds([]); } finally { setRoundsLoading(false); }
  }, [event.id]);

  const handlePrint = useCallback(() => {
    const hdrCells = Array.from({length: 18}, (_, j) => j + 1).map(h => `<th>${h}</th>`).join('');
    const rows = boards.map((b, i) => {
      const holes = typeof b.holes_net === 'string' ? JSON.parse(b.holes_net) : (b.holes_net ?? {});
      const holeCells = Array.from({length: 18}, (_, j) => j + 1).map(h => `<td>${(holes as Record<string,number>)[String(h)] ?? '·'}</td>`).join('');
      const hc = b.frozen_handicap != null ? parseFloat(String(b.frozen_handicap)).toFixed(1) : '—';
      return `<tr><td>${i + 1}</td><td class="name">${b.player_name}</td>${holeCells}<td>${hc}</td><td><strong>${b.total_net ?? '—'}</strong></td></tr>`;
    }).join('');
    const start = format(new Date(event.event_date), 'd MMM yyyy');
    const end = event.end_date ? format(new Date(event.end_date), 'd MMM yyyy') : '';
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${event.name} — Eclectic Leaderboard</title><style>body{font-family:Arial,sans-serif;font-size:10px;margin:24px;color:#111}h2{font-size:15px;text-align:center;margin:0 0 12px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:6px 40px;margin-bottom:14px;font-size:10px}.ml{font-weight:bold}table{border-collapse:collapse;width:100%}th{background:#1a5c38;color:#fff;padding:4px 3px;font-size:9px;border:1px solid #0f3d24}td{border:1px solid #ccc;padding:3px;text-align:center;font-size:9px}td.name{text-align:left;padding-left:6px;min-width:110px;font-size:10px}tr:nth-child(even){background:#f0f7f3}</style></head><body><h2>Eclectic Leaderboard</h2><div class="meta"><div><span class="ml">Eclectic Name:</span> ${event.name}</div><div><span class="ml">Start:</span> ${start}</div><div><span class="ml">Description:</span> ${event.description ?? ''}</div><div><span class="ml">End:</span> ${end}</div></div><table><thead><tr><th>Rank</th><th style="text-align:left;padding-left:6px">Name</th>${hdrCells}<th>HC</th><th>Gross</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
    const w = window.open('', '_blank', 'width=1300,height=800');
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 500); }
  }, [boards, event]);

  if (loading) return <Skeleton className="h-20 w-full mt-3" />;

  return (
    <div className="mt-3 space-y-3">
      {/* ── Tab bar ─────────────────────────────────────────────────────── */}
      <div className="flex gap-0 border-b">
        {(["leaderboard", "rounds"] as const).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setActiveTab(t)}
            className={`px-4 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors ${activeTab === t ? "border-[#1a5c38] text-[#1a5c38] font-semibold" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {t === "leaderboard" ? "Leaderboard" : "Player Rounds"}
          </button>
        ))}
      </div>

      {/* ── Leaderboard tab ─────────────────────────────────────────────── */}
      {activeTab === "leaderboard" && (
        boards.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No rounds submitted yet.</p>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] text-muted-foreground">Best nett score per hole across all submitted rounds · ordered by nett</p>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={handlePrint}>
                <Printer className="h-3 w-3" />Print
              </Button>
            </div>
            <div className="overflow-x-auto rounded border">
              <table className="border-collapse text-xs" style={{minWidth: "max-content", width: "100%"}}>
                <thead>
                  <tr className="bg-[#1a5c38] text-white">
                    <th className="px-2 py-2 font-semibold text-center w-8 sticky left-0 bg-[#1a5c38] z-10">#</th>
                    <th className="px-3 py-2 font-semibold text-left min-w-[130px] sticky left-8 bg-[#1a5c38] z-10">Name</th>
                    {Array.from({length: 18}, (_, j) => j + 1).map(h => (
                      <th key={h} className="px-1 py-2 font-semibold text-center w-7">{h}</th>
                    ))}
                    <th className="px-2 py-2 font-semibold text-center w-10">HC</th>
                    <th className="px-2 py-2 font-semibold text-center w-12">Nett</th>
                  </tr>
                </thead>
                <tbody>
                  {boards.map((b, i) => {
                    const holes = typeof b.holes_net === 'string' ? JSON.parse(b.holes_net) : (b.holes_net ?? {}) as Record<string, number>;
                    const hc = b.frozen_handicap != null ? parseFloat(String(b.frozen_handicap)).toFixed(1) : '—';
                    return (
                      <tr key={b.user_id} className={i % 2 === 0 ? "bg-white" : "bg-green-50/40"}>
                        <td className="px-2 py-1.5 text-center font-bold text-muted-foreground sticky left-0 bg-inherit z-[5]">{i + 1}</td>
                        <td className="px-3 py-1.5 font-medium whitespace-nowrap sticky left-8 bg-inherit z-[5]">{b.player_name}</td>
                        {Array.from({length: 18}, (_, j) => j + 1).map(h => {
                          const s = (holes as Record<string,number>)[String(h)];
                          return <td key={h} className={`px-1 py-1.5 text-center ${s != null ? "font-semibold" : "text-muted-foreground/30"}`}>{s ?? '·'}</td>;
                        })}
                        <td className="px-2 py-1.5 text-center text-muted-foreground">{hc}</td>
                        <td className="px-2 py-1.5 text-center font-bold">{b.total_net ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* ── Player Rounds tab ───────────────────────────────────────────── */}
      {activeTab === "rounds" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground shrink-0">Player</Label>
            <Select
              value={selectedPlayer ? String(selectedPlayer) : ""}
              onValueChange={v => {
                const uid = parseInt(v, 10);
                setSelectedPlayer(uid);
                loadRounds(uid);
              }}
            >
              <SelectTrigger className="h-8 w-56"><SelectValue placeholder="Select player…" /></SelectTrigger>
              <SelectContent>
                {boards.map(b => (
                  <SelectItem key={b.user_id} value={String(b.user_id)}>{b.player_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!selectedPlayer ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Select a player to view their submitted rounds.</p>
          ) : roundsLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : rounds.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No rounds found for this player.</p>
          ) : (
            <div className="overflow-x-auto rounded border">
              <table className="border-collapse text-xs" style={{minWidth: "max-content", width: "100%"}}>
                <thead>
                  <tr className="bg-[#1a5c38] text-white">
                    <th className="px-3 py-2 font-semibold text-left min-w-[160px] sticky left-0 bg-[#1a5c38] z-10">Tournament</th>
                    <th className="px-2 py-2 font-semibold text-center min-w-[80px] whitespace-nowrap">Date</th>
                    {Array.from({length: 18}, (_, j) => j + 1).map(h => (
                      <th key={h} className="px-1 py-2 font-semibold text-center w-7">{h}</th>
                    ))}
                    <th className="px-2 py-2 font-semibold text-center w-12">Gross</th>
                  </tr>
                </thead>
                <tbody>
                  {rounds.map((r, i) => {
                    const hs: Record<string, number> = typeof r.hole_scores === 'string' ? JSON.parse(r.hole_scores) : (r.hole_scores ?? {});
                    const d = r.completed_at
                      ? format(new Date(r.completed_at), 'd MMM yyyy')
                      : '—';
                    return (
                      <tr key={r.round_id} className={i % 2 === 0 ? "bg-white" : "bg-green-50/40"}>
                        <td className="px-3 py-1.5 font-medium whitespace-nowrap sticky left-0 bg-inherit z-[5]">{r.tournament_name}</td>
                        <td className="px-2 py-1.5 text-center text-muted-foreground whitespace-nowrap">{d}</td>
                        {Array.from({length: 18}, (_, j) => j + 1).map(h => {
                          const s = hs[String(h)];
                          return <td key={h} className={`px-1 py-1.5 text-center ${s != null ? "font-semibold" : "text-muted-foreground/30"}`}>{s ?? '·'}</td>;
                        })}
                        <td className="px-2 py-1.5 text-center font-bold">{r.total_gross ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
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
                      <EclecticBoard event={ev} />
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
