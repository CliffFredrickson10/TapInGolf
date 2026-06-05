import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useReadOnly } from "@/context/ReadOnlyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Plus, Pencil, Trash2, Calendar, Users, Trophy, ChevronRight,
  CheckCircle, XCircle, Clock, CreditCard, ListOrdered, BarChart2, Send,
} from "lucide-react";
import { format } from "date-fns";
import { GenerateTeeTimesDialog } from "@/components/GenerateTeeTimesDialog";

// ─── Types ─────────────────────────────────────────────────────────────────

interface Division {
  label: string; key: string;
  min_hcp: number; max_hcp: number;
  format: string; tees: string;
}

interface GolfEvent {
  id: number; name: string; description: string | null;
  event_date: string; end_date: string | null;
  start_time: string | null; end_time: string | null;
  event_type: string; format: string; format_custom: string | null; restriction: string;
  entry_fee: number | null; max_participants: number | null;
  status: string; created_at: string;
  divisions: Division[];
  entries_open: string | null; entries_close: string | null;
  ballot: number; scoring_enabled: number; payment_required: number;
  use_tiered_pricing: number; allow_wallet: number; allow_prepaid: number; allow_voucher: number;
  rounds: number;
  total_registrations: number; approved_count: number; pending_count: number;
}

interface Registration {
  id: number; user_id: number; user_name: string; user_email: string;
  handicap: number | null; frozen_handicap: number | null;
  division: string | null; status: string;
  payment_status: string; paid_at: string | null; registered_at: string;
  phone: string | null;
}

interface DrawEntry {
  id: number; round: number; tee_date: string; tee_time: string;
  draw_group: number; user_id: number; user_name: string;
  division: string | null; frozen_handicap: number | null; notes: string | null;
}

interface Score {
  id: number; user_id: number; user_name: string; round: number;
  gross: number | null; net: number | null; points: number | null;
  division: string | null; frozen_handicap: number | null;
  hole_scores: Record<string, number> | null; verified: number;
}

interface TeeSlot {
  id: number; date: string; time: string;
  total_slots: number; active: boolean;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const FORMAT_LABELS: Record<string, string> = {
  // Legacy keys kept for backwards compatibility
  stroke_play: "Stroke Play", stableford: "Stableford", match_play: "Match Play",
  fourball: "Fourball", scramble: "Scramble", alliance: "Alliance", bogey: "Bogey",
  // Individual
  gross_stroke_play: "Gross Stroke Play (Medal Play)",
  net_stroke_play: "Net Stroke Play",
  singles_match_play: "Singles Match Play",
  individual_stableford: "Individual Stableford",
  modified_stableford: "Individual Modified Stableford",
  par_bogey: "Par / Bogey Competition",
  maximum_score: "Maximum Score",
  chairman: "Chairman (The Perch)",
  individual_bonus_bogey: "Individual Bonus Bogey",
  individual_par: "Individual Par Competition",
  individual_bogey: "Individual Bogey Competition",
  eclectic: "Eclectic (Multi-Round)",
  // Betterball / Two-Player Team
  fourball_gross_betterball: "Four-Ball Gross Betterball",
  fourball_net_betterball: "Four-Ball Net Betterball",
  betterball_match_play: "Betterball Match Play",
  fourball_stableford: "Four-Ball Stableford",
  shamble: "Shamble",
  best_ball_aggregate: "Best Ball Aggregate",
  high_low: "High-Low",
  daytona: "Daytona (Las Vegas)",
  low_ball_total: "Low Ball / Total Score",
  the_ghost: "The Ghost",
  betterball_bonus_bogey: "Betterball Bonus Bogey",
  pinehurst_points: "Multiplication Betterball (Pinehurst)",
  // Team
  american_scramble: "American Scramble",
  // Other
  other: "Other",
};

function fmtFormat(ev: { format: string; format_custom?: string | null }) {
  if (ev.format === "other") return ev.format_custom?.trim() || "Other";
  return FORMAT_LABELS[ev.format] ?? ev.format;
}
const TYPE_LABELS: Record<string, string> = {
  competition: "Competition", open_day: "Open Day", corporate: "Corporate",
  social: "Social", other: "Other",
};
const RESTRICT_LABELS: Record<string, string> = {
  open: "Open", members_only: "Members Only", invitation_only: "Invite Only",
};
const STATUS_BADGE: Record<string, string> = {
  pending_publish: "bg-amber-100 text-amber-700",
  active: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
  completed: "bg-blue-100 text-blue-700",
};
const STATUS_LABEL: Record<string, string> = {
  pending_publish: "Pending Publish",
  active: "Published",
  cancelled: "Cancelled",
  completed: "Completed",
};
const PAY_BADGE: Record<string, string> = {
  unpaid: "bg-amber-100 text-amber-700",
  paid:   "bg-green-100 text-green-700",
  refunded: "bg-gray-100 text-gray-600",
};
const REG_BADGE: Record<string, string> = {
  pending:  "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

function fmtDate(d: string | null) {
  if (!d) return "—";
  try { return format(new Date(d.slice(0, 10) + "T00:00:00"), "dd MMM yyyy"); } catch { return d; }
}

function computeDays(start: string, end?: string | null): number {
  if (!start) return 1;
  const [sy, sm, sd] = start.split("-").map(Number);
  if (!sy) return 1;
  const endStr = end || start;
  const [ey, em, ed] = endStr.split("-").map(Number);
  const s = new Date(Date.UTC(sy, sm - 1, sd));
  const e = new Date(Date.UTC(ey || sy, (em || sm) - 1, ed || sd));
  return Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000) + 1);
}

const DEFAULT_DIVISIONS: Division[] = [
  { label: "A Division", key: "A", min_hcp: 0,  max_hcp: 9.9,  format: "stroke_play", tees: "championship" },
  { label: "B Division", key: "B", min_hcp: 10, max_hcp: 17.9, format: "stroke_play", tees: "club" },
  { label: "C Division", key: "C", min_hcp: 18, max_hcp: 36,   format: "stableford",  tees: "club" },
];

const EMPTY_FORM = {
  name: "", description: "", event_date: "", end_date: "",
  start_time: "", end_time: "", event_type: "competition",
  format: "gross_stroke_play", format_custom: "", restriction: "open",
  entry_fee: "" as any, max_participants: "" as any,
  entries_open: "", entries_close: "", rounds_per_day: 1 as 1 | 2,
  ballot: false, scoring_enabled: false, payment_required: false,
  use_tiered_pricing: false, allow_wallet: false, allow_prepaid: false, allow_voucher: false,
  divisions: DEFAULT_DIVISIONS,
};

// ─── Main component ────────────────────────────────────────────────────────

export default function Events() {
  const { toast } = useToast();
  const readOnly  = useReadOnly();

  const [events, setEvents]     = useState<GolfEvent[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showPast, setShowPast] = useState(false);

  // Detail sheet
  const [detail, setDetail]     = useState<GolfEvent | null>(null);
  const [detailTab, setDetailTab] = useState("registrations");

  // Registrations
  const [regs, setRegs]         = useState<Registration[]>([]);
  const [regsLoading, setRegsLoading] = useState(false);

  // Draw
  const [draw, setDraw]         = useState<DrawEntry[]>([]);
  const [drawLoading, setDrawLoading] = useState(false);
  const [drawRound, setDrawRound] = useState(1);
  const [savingDraw, setSavingDraw] = useState(false);

  // Scores
  const [scores, setScores]     = useState<Score[]>([]);
  const [scoresLoading, setScoresLoading] = useState(false);
  const [scoreRound, setScoreRound] = useState(1);
  const [editScores, setEditScores] = useState<Record<number, { gross: string; net: string; points: string }>>({});
  const [savingScores, setSavingScores] = useState(false);

  // Create/Edit dialog
  const [dlgOpen, setDlgOpen]   = useState(false);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [editId, setEditId]     = useState<number | null>(null);
  const [saving, setSaving]     = useState(false);

  // Tee slot linking
  const [selectedSlotIds, setSelectedSlotIds] = useState<number[]>([]);
  const [availableSlots, setAvailableSlots]   = useState<TeeSlot[]>([]);
  const [slotsLoading, setSlotsLoading]       = useState(false);
  const [genDialogOpen, setGenDialogOpen]     = useState(false);
  const [genDialogDate, setGenDialogDate]     = useState("");
  const [showAddSlot, setShowAddSlot]         = useState(false);
  const [newSlotDate, setNewSlotDate]         = useState("");
  const [newSlotTime, setNewSlotTime]         = useState("");
  const [newSlotPlayers, setNewSlotPlayers]   = useState(4);

  // ── Loaders ──────────────────────────────────────────────────────────────

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<GolfEvent[]>(`/api/portal/events?upcoming=${!showPast}`);
      setEvents(data);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [showPast]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  const loadRegs = useCallback(async (ev: GolfEvent) => {
    setRegsLoading(true);
    try {
      const data = await api<Registration[]>(`/api/portal/events/${ev.id}/registrations`);
      setRegs(data);
    } catch {} finally { setRegsLoading(false); }
  }, []);

  const loadDraw = useCallback(async (ev: GolfEvent, round: number) => {
    setDrawLoading(true);
    try {
      const data = await api<DrawEntry[]>(`/api/portal/events/${ev.id}/draw?round=${round}`);
      setDraw(data);
    } catch {} finally { setDrawLoading(false); }
  }, []);

  const slotAbortRef = useRef<AbortController | null>(null);

  const loadAvailableSlots = useCallback(async (date: string, endDate?: string) => {
    if (!date) { setAvailableSlots([]); return; }
    // Cancel any in-flight request so stale day-1-only results don't overwrite day-range results
    slotAbortRef.current?.abort();
    const controller = new AbortController();
    slotAbortRef.current = controller;
    setSlotsLoading(true);
    try {
      const params = endDate ? `from=${date}&to=${endDate}` : `date=${date}`;
      const data = await api<TeeSlot[]>(`/api/portal/tee-times?${params}&_t=${Date.now()}`, { signal: controller.signal });
      if (!controller.signal.aborted) setAvailableSlots(data);
    } catch (e: any) {
      if (e?.name !== "AbortError") { /* ignore cancellation */ }
    } finally {
      if (!controller.signal.aborted) setSlotsLoading(false);
    }
  }, []);

  const loadEventSlots = useCallback(async (eventId: number) => {
    try {
      const data = await api<TeeSlot[]>(`/api/portal/events/${eventId}/tee-slots`);
      setSelectedSlotIds(data.map(s => s.id));
    } catch {}
  }, []);

  const loadScores = useCallback(async (ev: GolfEvent, round: number) => {
    setScoresLoading(true);
    try {
      const data = await api<Score[]>(`/api/portal/events/${ev.id}/scores?round=${round}`);
      setScores(data);
      const init: Record<number, { gross: string; net: string; points: string }> = {};
      for (const s of data) {
        init[s.user_id] = { gross: String(s.gross ?? ""), net: String(s.net ?? ""), points: String(s.points ?? "") };
      }
      setEditScores(init);
    } catch {} finally { setScoresLoading(false); }
  }, []);

  const openDetail = (ev: GolfEvent) => {
    setDetail(ev);
    setDetailTab("registrations");
    setDrawRound(1);
    setScoreRound(1);
    loadRegs(ev);
  };

  useEffect(() => {
    if (detail && detailTab === "draw")        loadDraw(detail, drawRound);
    if (detail && detailTab === "scores")      loadScores(detail, scoreRound);
  }, [detailTab, drawRound, scoreRound, detail]);

  // Load available tee slots whenever the dialog is open and the event date changes
  useEffect(() => {
    if (!dlgOpen || !form.event_date) { setAvailableSlots([]); return; }
    loadAvailableSlots(form.event_date, form.end_date || undefined);
  }, [dlgOpen, form.event_date, form.end_date, loadAvailableSlots]);

  // ── CRUD ──────────────────────────────────────────────────────────────────

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setEditId(null);
    setSelectedSlotIds([]);
    setAvailableSlots([]);
    setDlgOpen(true);
  };

  const openEdit = (ev: GolfEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    setForm({
      name: ev.name, description: ev.description ?? "",
      event_date: ev.event_date, end_date: ev.end_date ?? "",
      start_time: ev.start_time ?? "", end_time: ev.end_time ?? "",
      event_type: ev.event_type, format: ev.format ?? "gross_stroke_play",
      format_custom: ev.format_custom ?? "",
      restriction: ev.restriction,
      entry_fee: ev.entry_fee ?? "",
      max_participants: ev.max_participants ?? "",
      entries_open: ev.entries_open ?? "", entries_close: ev.entries_close ?? "",
      rounds_per_day: (() => {
        const days = computeDays(ev.event_date, ev.end_date);
        const rpd = Math.round((ev.rounds ?? 1) / days);
        return (rpd >= 2 ? 2 : 1) as 1 | 2;
      })(),
      ballot: !!ev.ballot, scoring_enabled: !!ev.scoring_enabled,
      payment_required: !!ev.payment_required,
      use_tiered_pricing: !!ev.use_tiered_pricing,
      allow_wallet: !!ev.allow_wallet, allow_prepaid: !!ev.allow_prepaid, allow_voucher: !!ev.allow_voucher,
      divisions: ev.divisions ?? DEFAULT_DIVISIONS,
    });
    setEditId(ev.id);
    setSelectedSlotIds([]);
    setAvailableSlots([]);
    setShowAddSlot(false);
    setNewSlotDate(ev.event_date);
    setNewSlotTime("");
    setNewSlotPlayers(4);
    setDlgOpen(true);
    loadEventSlots(ev.id);
  };

  const handleSave = async () => {
    if (!form.name || !form.event_date) {
      toast({ title: "Name and start date are required", variant: "destructive" }); return;
    }
    if (form.payment_required && !form.use_tiered_pricing && (!form.entry_fee || Number(form.entry_fee) <= 0)) {
      toast({ title: "Entry fee required", description: "Set an entry fee or enable tiered pricing.", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const numDays = computeDays(form.event_date, form.end_date);
      const body = {
        ...form,
        description:      form.description || null,
        end_date:         form.end_date || null,
        start_time:       null,   // derived from tee schedule
        end_time:         null,
        entries_open:     form.entries_open || null,
        entries_close:    form.entries_close || null,
        entry_fee:        form.entry_fee === "" ? null : Number(form.entry_fee),
        max_participants: null,   // auto-computed from tee slots
        rounds:           numDays * form.rounds_per_day,
      };
      let evId: number;
      if (editId) {
        await api(`/api/portal/events/${editId}`, { method: "PUT", body: JSON.stringify(body) });
        evId = editId;
      } else {
        const saved = await api<{ id: number }>("/api/portal/events", { method: "POST", body: JSON.stringify(body) });
        evId = saved.id;
      }
      // Link the selected tee slots (server recalculates max_participants)
      await api(`/api/portal/events/${evId}/tee-slots`, {
        method: "PUT",
        body: JSON.stringify({ slot_ids: selectedSlotIds }),
      });
      toast({ title: editId ? "Tournament updated" : "Tournament created" });
      setDlgOpen(false);
      loadEvents();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handlePublish = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Publish this tournament? Notifications will be sent to club members and past golfers.")) return;
    try {
      await api(`/api/portal/events/${id}/publish`, { method: "POST" });
      setEvents(prev => prev.map(ev => ev.id === id ? { ...ev, status: "active" } : ev));
      toast({ title: "Tournament published", description: "Golfers have been notified." });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const handleCancel = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Cancel this tournament? Registered golfers will be notified and their draw slots cleared.")) return;
    try {
      await api(`/api/portal/events/${id}`, { method: "DELETE" });
      setEvents(prev => prev.map(ev => ev.id === id ? { ...ev, status: "cancelled" } : ev));
      toast({ title: "Tournament cancelled", description: "Registered golfers have been notified." });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  // ── Registrations ─────────────────────────────────────────────────────────

  const updateReg = async (userId: number, status: "approved" | "rejected") => {
    if (!detail) return;
    try {
      await api(`/api/portal/events/${detail.id}/registrations/${userId}`, {
        method: "PUT", body: JSON.stringify({ status }),
      });
      setRegs(prev => prev.map(r => r.user_id === userId ? { ...r, status } : r));
      setEvents(prev => prev.map(ev => {
        if (ev.id !== detail.id) return ev;
        const delta = status === "approved" ? 1 : (status === "rejected" ? 0 : 0);
        return { ...ev, approved_count: ev.approved_count + delta, pending_count: Math.max(0, ev.pending_count - 1) };
      }));
      toast({ title: status === "approved" ? "Spot confirmed" : "Registration rejected" });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  // ── Draw ──────────────────────────────────────────────────────────────────

  const saveDraw = async () => {
    if (!detail) return;
    setSavingDraw(true);
    try {
      await api(`/api/portal/events/${detail.id}/draw`, {
        method: "PUT",
        body: JSON.stringify({ round: drawRound, entries: draw }),
      });
      toast({ title: "Draw published — players notified" });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setSavingDraw(false); }
  };

  const addDrawSlot = () => {
    const approvedInDraw = new Set(draw.map(d => d.user_id));
    const eligible = regs.filter(r => r.status === "approved" && !approvedInDraw.has(r.user_id));
    if (!eligible.length) { toast({ title: "All approved players are already in the draw" }); return; }
    const player = eligible[0]!;
    const lastGroup = draw.length > 0 ? Math.max(...draw.map(d => d.draw_group)) : 0;
    const today = detail?.event_date ?? new Date().toISOString().split("T")[0];
    setDraw(prev => [...prev, {
      id: Date.now(), round: drawRound, tee_date: today,
      tee_time: "08:00", draw_group: lastGroup + 1,
      user_id: player.user_id, user_name: player.user_name,
      division: player.division, frozen_handicap: player.frozen_handicap, notes: null,
    }]);
  };

  // ── Scores ────────────────────────────────────────────────────────────────

  const saveScores = async () => {
    if (!detail) return;
    setSavingScores(true);
    try {
      const approvedRegs = regs.filter(r => r.status === "approved");
      const entries = approvedRegs.map(r => ({
        user_id: r.user_id,
        gross:   editScores[r.user_id]?.gross ? Number(editScores[r.user_id]!.gross) : null,
        net:     editScores[r.user_id]?.net   ? Number(editScores[r.user_id]!.net)   : null,
        points:  editScores[r.user_id]?.points ? Number(editScores[r.user_id]!.points) : null,
      })).filter(e => e.gross != null || e.net != null || e.points != null);
      await api(`/api/portal/events/${detail.id}/scores`, {
        method: "POST", body: JSON.stringify({ round: scoreRound, scores: entries }),
      });
      toast({ title: "Scores saved" });
      loadScores(detail, scoreRound);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setSavingScores(false); }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tournaments</h1>
          <p className="text-muted-foreground mt-1">Manage club tournaments and competitions.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Switch checked={showPast} onCheckedChange={setShowPast} id="past-toggle" />
            <Label htmlFor="past-toggle">Show past</Label>
          </div>
          <Button className="bg-[#1a5c38] hover:bg-[#164d30] gap-2" onClick={openAdd} disabled={readOnly}>
            <Plus className="h-4 w-4" />New Tournament
          </Button>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <Skeleton className="h-48 w-full" />
      ) : events.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center text-muted-foreground">
            {showPast ? "No past tournaments." : "No upcoming tournaments. Create your first one."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {events.map(ev => (
            <Card
              key={ev.id}
              className="cursor-pointer hover:border-[#1a5c38]/40 hover:bg-green-50/20 transition-colors"
              onClick={() => openDetail(ev)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[#1a5c38]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Trophy className="h-5 w-5 text-[#1a5c38]" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{ev.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[ev.status] ?? "bg-gray-100 text-gray-700"}`}>{STATUS_LABEL[ev.status] ?? ev.status}</span>
                        {ev.pending_count > 0 && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">
                            {ev.pending_count} pending
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {fmtDate(ev.event_date)}{ev.end_date ? ` – ${fmtDate(ev.end_date)}` : ""}
                        {ev.start_time ? ` · ${String(ev.start_time).slice(0, 5)}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {fmtFormat(ev)} · {RESTRICT_LABELS[ev.restriction] ?? ev.restriction}
                        {ev.entry_fee ? ` · R${ev.entry_fee.toFixed(2)} entry` : ""}
                        {ev.max_participants ? ` · Max ${ev.max_participants}` : ""}
                        {ev.rounds > 1 ? ` · ${ev.rounds} rounds` : ""}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground pt-0.5">
                        <span className="flex items-center gap-1"><Users className="h-3 w-3" />{ev.approved_count} confirmed</span>
                        <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />
                          {ev.entries_close ? `Entries close ${fmtDate(ev.entries_close)}` : "No entry deadline"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={e => openEdit(ev, e)} disabled={readOnly}><Pencil className="h-3.5 w-3.5" /></Button>
                    {ev.status === "pending_publish" && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-green-700" title="Publish tournament" onClick={e => handlePublish(ev.id, e)} disabled={readOnly}>
                        <Send className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Cancel tournament" onClick={e => handleCancel(ev.id, e)} disabled={readOnly || ev.status === "cancelled"}><Trash2 className="h-3.5 w-3.5" /></Button>
                    <ChevronRight className="h-4 w-4 text-muted-foreground ml-1" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Detail Sheet ─────────────────────────────────────────────────────── */}
      <Sheet open={!!detail} onOpenChange={o => { if (!o) setDetail(null); }}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto p-0">
          {detail && (
            <>
              <SheetHeader className="px-6 pt-6 pb-4 border-b">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <SheetTitle className="text-lg">{detail.name}</SheetTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      {fmtDate(detail.event_date)}{detail.end_date ? ` – ${fmtDate(detail.end_date)}` : ""}
                      {" · "}{fmtFormat(detail)}
                      {" · "}{RESTRICT_LABELS[detail.restriction] ?? detail.restriction}
                    </p>
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 ${STATUS_BADGE[detail.status] ?? "bg-gray-100 text-gray-600"}`}>{STATUS_LABEL[detail.status] ?? detail.status}</span>
                </div>

                {/* Quick stats */}
                <div className="grid grid-cols-3 gap-3 mt-3">
                  {[
                    { label: "Confirmed", val: detail.approved_count, color: "text-green-700" },
                    { label: "Pending",   val: detail.pending_count,  color: "text-amber-700" },
                    { label: "Total",     val: detail.total_registrations, color: "text-[#1a5c38]" },
                  ].map(s => (
                    <div key={s.label} className="text-center rounded-lg border py-2">
                      <p className={`text-xl font-bold ${s.color}`}>{s.val}</p>
                      <p className="text-xs text-muted-foreground">{s.label}</p>
                    </div>
                  ))}
                </div>
              </SheetHeader>

              <Tabs value={detailTab} onValueChange={setDetailTab} className="px-6 pt-4">
                <TabsList className="w-full grid grid-cols-4 mb-4 h-10">
                  <TabsTrigger value="registrations" className="text-xs gap-1.5">
                    <Users className="h-3.5 w-3.5" />Entries
                    {detail.pending_count > 0 && <span className="ml-1 bg-amber-500 text-white text-[10px] rounded-full px-1.5 py-0.5 font-bold">{detail.pending_count}</span>}
                  </TabsTrigger>
                  <TabsTrigger value="divisions" className="text-xs gap-1.5"><Trophy className="h-3.5 w-3.5" />Divisions</TabsTrigger>
                  <TabsTrigger value="draw" className="text-xs gap-1.5"><ListOrdered className="h-3.5 w-3.5" />Draw</TabsTrigger>
                  <TabsTrigger value="scores" className="text-xs gap-1.5"><BarChart2 className="h-3.5 w-3.5" />Scores</TabsTrigger>
                </TabsList>

                {/* REGISTRATIONS TAB */}
                <TabsContent value="registrations" className="pb-8">
                  {regsLoading ? (
                    <Skeleton className="h-32 w-full" />
                  ) : regs.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">No registrations yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {regs.map(r => (
                        <Card key={r.id}>
                          <CardContent className="p-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium text-sm">{r.user_name}</span>
                                  {r.division && <span className="text-xs bg-[#1a5c38]/10 text-[#1a5c38] px-2 py-0.5 rounded-full font-medium">{r.division} Div</span>}
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${REG_BADGE[r.status] ?? "bg-gray-100 text-gray-600"}`}>{r.status}</span>
                                  {detail.payment_required && (
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PAY_BADGE[r.payment_status] ?? "bg-gray-100"}`}>
                                      <CreditCard className="h-3 w-3 inline mr-1" />{r.payment_status}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {r.user_email}
                                  {r.frozen_handicap != null ? ` · HCP ${r.frozen_handicap}` : ""}
                                </p>
                              </div>
                              {r.status === "pending" && !readOnly && (
                                <div className="flex gap-1.5 flex-shrink-0">
                                  <Button size="sm" className="h-7 bg-green-600 hover:bg-green-700 gap-1 text-xs" onClick={() => updateReg(r.user_id, "approved")}>
                                    <CheckCircle className="h-3.5 w-3.5" />Approve
                                  </Button>
                                  <Button size="sm" variant="outline" className="h-7 gap-1 text-xs border-red-300 text-red-700 hover:bg-red-50" onClick={() => updateReg(r.user_id, "rejected")}>
                                    <XCircle className="h-3.5 w-3.5" />Reject
                                  </Button>
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* DIVISIONS TAB */}
                <TabsContent value="divisions" className="pb-8">
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">Divisions are auto-assigned from the golfer's HNA handicap at time of registration.</p>
                    {(detail.divisions ?? DEFAULT_DIVISIONS).map(d => (
                      <Card key={d.key}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-semibold text-sm">{d.label}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                HCP {d.min_hcp} – {d.max_hcp} · {fmtFormat(d)} · {d.tees} tees
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-bold text-[#1a5c38]">
                                {regs.filter(r => r.division === d.key && r.status === "approved").length}
                              </p>
                              <p className="text-xs text-muted-foreground">confirmed</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </TabsContent>

                {/* DRAW TAB */}
                <TabsContent value="draw" className="pb-8">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Label className="text-sm">Round</Label>
                      <Select value={String(drawRound)} onValueChange={v => setDrawRound(Number(v))}>
                        <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: detail.rounds ?? 1 }, (_, i) => (
                            <SelectItem key={i + 1} value={String(i + 1)}>Round {i + 1}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={addDrawSlot} disabled={readOnly}><Plus className="h-3.5 w-3.5" />Add player</Button>
                      <Button size="sm" className="h-8 bg-[#1a5c38] hover:bg-[#164d30] text-xs" onClick={saveDraw} disabled={savingDraw || readOnly}>{savingDraw ? "Saving…" : "Publish Draw"}</Button>
                    </div>
                  </div>
                  {drawLoading ? <Skeleton className="h-32 w-full" /> : draw.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">No draw yet. Add approved players to build the draw.</p>
                  ) : (
                    <div className="space-y-2">
                      {draw.map((d, i) => (
                        <Card key={d.id ?? i}>
                          <CardContent className="p-3">
                            <div className="grid grid-cols-4 gap-2 items-center text-sm">
                              <span className="font-medium">{d.user_name}</span>
                              <span className="text-muted-foreground text-xs">{d.division ? `${d.division} Div` : "—"}{d.frozen_handicap != null ? ` · ${d.frozen_handicap}` : ""}</span>
                              <div className="flex items-center gap-1.5">
                                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                                <Input
                                  type="time" value={d.tee_time} className="h-7 text-xs"
                                  onChange={e => setDraw(prev => prev.map((x, j) => j === i ? { ...x, tee_time: e.target.value } : x))}
                                />
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs text-muted-foreground">Grp</span>
                                <Input
                                  type="number" min="1" value={d.draw_group} className="h-7 w-16 text-xs"
                                  onChange={e => setDraw(prev => prev.map((x, j) => j === i ? { ...x, draw_group: Number(e.target.value) } : x))}
                                />
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive flex-shrink-0"
                                  onClick={() => setDraw(prev => prev.filter((_, j) => j !== i))}>
                                  <XCircle className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* SCORES TAB */}
                <TabsContent value="scores" className="pb-8">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Label className="text-sm">Round</Label>
                      <Select value={String(scoreRound)} onValueChange={v => setScoreRound(Number(v))}>
                        <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: detail.rounds ?? 1 }, (_, i) => (
                            <SelectItem key={i + 1} value={String(i + 1)}>Round {i + 1}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button size="sm" className="h-8 bg-[#1a5c38] hover:bg-[#164d30] text-xs" onClick={saveScores} disabled={savingScores || readOnly}>{savingScores ? "Saving…" : "Save Scores"}</Button>
                  </div>
                  {scoresLoading ? <Skeleton className="h-32 w-full" /> : (
                    <div className="space-y-2">
                      {regs.filter(r => r.status === "approved").length === 0 ? (
                        <p className="text-sm text-muted-foreground py-6 text-center">No confirmed players yet.</p>
                      ) : (
                        <>
                          {/* header */}
                          <div className="grid grid-cols-5 gap-2 text-xs text-muted-foreground font-medium px-3 py-1.5 bg-muted/40 rounded-md">
                            <span className="col-span-2">Player</span>
                            <span className="text-center">Gross</span>
                            <span className="text-center">Net</span>
                            <span className="text-center">Points</span>
                          </div>
                          {regs.filter(r => r.status === "approved").map(r => (
                            <Card key={r.user_id}>
                              <CardContent className="p-2.5">
                                <div className="grid grid-cols-5 gap-2 items-center text-sm">
                                  <div className="col-span-2">
                                    <p className="font-medium text-xs">{r.user_name}</p>
                                    <p className="text-[11px] text-muted-foreground">{r.division ? `${r.division} Div` : "—"}</p>
                                  </div>
                                  {(["gross","net","points"] as const).map(field => (
                                    <Input
                                      key={field} type="number" min="0"
                                      className="h-7 text-xs text-center"
                                      placeholder="—"
                                      value={editScores[r.user_id]?.[field] ?? ""}
                                      onChange={e => setEditScores(prev => ({
                                        ...prev,
                                        [r.user_id]: { ...(prev[r.user_id] ?? { gross: "", net: "", points: "" }), [field]: e.target.value },
                                      }))}
                                    />
                                  ))}
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Create / Edit Dialog ───────────────────────────────────────────────── */}
      <Dialog open={dlgOpen} onOpenChange={setDlgOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? "Edit" : "New"} Tournament</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">

            {/* Basic info */}
            <div className="space-y-1.5">
              <Label>Tournament Name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Club Championship 2026" />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <textarea className="w-full border rounded-md px-3 py-2 text-sm min-h-[60px] bg-background resize-none" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Tournament details, rules, conditions…" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start Date *</Label>
                <Input type="date" value={form.event_date} onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>End Date (multi-day)</Label>
                <Input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Rounds per Day</Label>
                <div className="flex items-center gap-3">
                  <Select
                    value={String(form.rounds_per_day)}
                    onValueChange={v => setForm(f => ({ ...f, rounds_per_day: Number(v) as 1 | 2 }))}
                  >
                    <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 round per day</SelectItem>
                      <SelectItem value="2">2 rounds per day</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground bg-muted/40 rounded-md border px-3 py-2 h-10 flex-1">
                    {(() => {
                      const days = computeDays(form.event_date, form.end_date);
                      const total = days * form.rounds_per_day;
                      return (
                        <>
                          {days} {days === 1 ? "day" : "days"} × {form.rounds_per_day} = <span className="font-semibold text-foreground ml-1">{total} {total === 1 ? "round" : "rounds"} total</span>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Tee Schedule ──────────────────────────────────────────────────────── */}
            {form.event_date ? (() => {
              // Build the ordered list of dates for this tournament
              const getDatesInRange = (start: string, end?: string): string[] => {
                const dates: string[] = [];
                const [sy, sm, sd] = start.split("-").map(Number);
                if (!sy || !sm || !sd) return [start];
                const [ey, em, ed] = (end || start).split("-").map(Number);
                const cur = new Date(Date.UTC(sy, sm - 1, sd));
                const last = new Date(Date.UTC(ey || sy, (em || sm) - 1, ed || sd));
                const cap = new Date(Date.UTC(sy, sm - 1, sd));
                cap.setUTCDate(cap.getUTCDate() + 30); // safety cap 31 days
                while (cur <= last && cur <= cap) {
                  dates.push(cur.toISOString().split("T")[0]);
                  cur.setUTCDate(cur.getUTCDate() + 1);
                }
                return dates;
              };

              const tournamentDates = getDatesInRange(form.event_date, form.end_date || undefined);
              const isMultiDay = tournamentDates.length > 1;

              // Group loaded slots by date
              const slotsByDate = availableSlots.reduce((acc, s) => {
                const key = String(s.date).slice(0, 10);
                (acc[key] ||= []).push(s);
                return acc;
              }, {} as Record<string, TeeSlot[]>);

              const computedMax = availableSlots
                .filter(s => selectedSlotIds.includes(s.id))
                .reduce((sum, s) => sum + s.total_slots, 0);

              const allSelected = availableSlots.length > 0 && availableSlots.every(s => selectedSlotIds.includes(s.id));

              return (
                <div className="space-y-3">
                  {/* Header row */}
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />Tee Schedule
                        {isMultiDay && <span className="text-xs font-normal text-muted-foreground">({tournamentDates.length} days)</span>}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Select tee slots for each day of the tournament. Max participants is calculated automatically.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {availableSlots.length > 0 && (
                        <button
                          type="button"
                          className="text-xs text-[#1a5c38] hover:underline font-medium"
                          onClick={() => allSelected ? setSelectedSlotIds([]) : setSelectedSlotIds(availableSlots.map(s => s.id))}
                        >
                          {allSelected ? "Deselect all" : "Select all"}
                        </button>
                      )}
                      {selectedSlotIds.length > 0 && (
                        <span className="text-xs font-medium text-[#1a5c38] bg-[#1a5c38]/10 px-2 py-1 rounded-full whitespace-nowrap">
                          {selectedSlotIds.length} slot{selectedSlotIds.length !== 1 ? "s" : ""} · {computedMax} spots
                        </span>
                      )}
                    </div>
                  </div>

                  {slotsLoading ? (
                    <div className="space-y-2">
                      {tournamentDates.map(d => (
                        <div key={d} className="h-20 rounded-lg border bg-muted/20 animate-pulse" />
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {tournamentDates.map((date, idx) => {
                        const daySlots = slotsByDate[date] ?? [];
                        const allDaySelected = daySlots.length > 0 && daySlots.every(s => selectedSlotIds.includes(s.id));
                        const daySelectedCount = daySlots.filter(s => selectedSlotIds.includes(s.id)).length;
                        return (
                          <Card key={date} className="border bg-card">
                            <CardContent className="p-3 space-y-2">
                              {/* Day header */}
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  {isMultiDay && (
                                    <span className="text-[10px] font-bold text-white bg-[#1a5c38] rounded px-1.5 py-0.5 shrink-0">
                                      Day {idx + 1}
                                    </span>
                                  )}
                                  <span className="text-sm font-semibold">{fmtDate(date)}</span>
                                  {daySlots.length > 0 && (
                                    <span className="text-[10px] text-muted-foreground">
                                      {daySelectedCount}/{daySlots.length} selected
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  {daySlots.length > 0 && (
                                    <button
                                      type="button"
                                      className="text-[11px] text-[#1a5c38] hover:underline font-medium"
                                      onClick={() =>
                                        allDaySelected
                                          ? setSelectedSlotIds(prev => prev.filter(id => !daySlots.map(s => s.id).includes(id)))
                                          : setSelectedSlotIds(prev => [...new Set([...prev, ...daySlots.map(s => s.id)])])
                                      }
                                    >
                                      {allDaySelected ? "Deselect all" : "Select all"}
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                                    onClick={() => { setGenDialogDate(date); setGenDialogOpen(true); }}
                                  >
                                    <Plus className="h-3 w-3" />Add
                                  </button>
                                </div>
                              </div>

                              {/* Slot list */}
                              {daySlots.length === 0 ? (
                                <p className="text-[11px] text-amber-600 py-1">
                                  No tee times scheduled — click Add to generate a schedule.
                                </p>
                              ) : (
                                <div className="space-y-0.5 max-h-40 overflow-y-auto">
                                  {daySlots.map(slot => (
                                    <label key={slot.id} className="flex items-center gap-2.5 py-1.5 px-2 rounded-md hover:bg-muted cursor-pointer select-none">
                                      <input
                                        type="checkbox"
                                        className="h-3.5 w-3.5 accent-[#1a5c38]"
                                        checked={selectedSlotIds.includes(slot.id)}
                                        onChange={e =>
                                          setSelectedSlotIds(prev =>
                                            e.target.checked ? [...prev, slot.id] : prev.filter(id => id !== slot.id)
                                          )
                                        }
                                      />
                                      <span className="text-sm font-medium tabular-nums">{String(slot.time).slice(0, 5)}</span>
                                      <span className="text-xs text-muted-foreground">{slot.total_slots} players</span>
                                      {!slot.active && <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">inactive</span>}
                                    </label>
                                  ))}
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
            })() : (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />Set a start date to link tee times from your schedule.
              </p>
            )}

            {/* Format — full-width with grouped options */}
            <div className="space-y-1.5">
              <Label>Format</Label>
              <Select value={form.format} onValueChange={v => setForm(f => ({ ...f, format: v, format_custom: v !== "other" ? f.format_custom : "" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-80">
                  <SelectGroup>
                    <SelectLabel>Individual</SelectLabel>
                    <SelectItem value="gross_stroke_play">Gross Stroke Play (Medal Play)</SelectItem>
                    <SelectItem value="net_stroke_play">Net Stroke Play</SelectItem>
                    <SelectItem value="singles_match_play">Singles Match Play</SelectItem>
                    <SelectItem value="individual_stableford">Individual Stableford</SelectItem>
                    <SelectItem value="modified_stableford">Individual Modified Stableford</SelectItem>
                    <SelectItem value="par_bogey">Par / Bogey Competition</SelectItem>
                    <SelectItem value="maximum_score">Maximum Score</SelectItem>
                    <SelectItem value="chairman">Chairman (The Perch)</SelectItem>
                    <SelectItem value="individual_bonus_bogey">Individual Bonus Bogey</SelectItem>
                    <SelectItem value="individual_par">Individual Par Competition</SelectItem>
                    <SelectItem value="individual_bogey">Individual Bogey Competition</SelectItem>
                    <SelectItem value="eclectic">Eclectic (Multi-Round)</SelectItem>
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>Betterball / Two-Player Team</SelectLabel>
                    <SelectItem value="fourball_gross_betterball">Four-Ball Gross Betterball</SelectItem>
                    <SelectItem value="fourball_net_betterball">Four-Ball Net Betterball</SelectItem>
                    <SelectItem value="betterball_match_play">Betterball Match Play</SelectItem>
                    <SelectItem value="fourball_stableford">Four-Ball Stableford</SelectItem>
                    <SelectItem value="shamble">Shamble</SelectItem>
                    <SelectItem value="best_ball_aggregate">Best Ball Aggregate</SelectItem>
                    <SelectItem value="high_low">High-Low</SelectItem>
                    <SelectItem value="daytona">Daytona (Las Vegas)</SelectItem>
                    <SelectItem value="low_ball_total">Low Ball / Total Score</SelectItem>
                    <SelectItem value="the_ghost">The Ghost</SelectItem>
                    <SelectItem value="betterball_bonus_bogey">Betterball Bonus Bogey</SelectItem>
                    <SelectItem value="pinehurst_points">Multiplication Betterball (Pinehurst)</SelectItem>
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>Team</SelectLabel>
                    <SelectItem value="american_scramble">American Scramble</SelectItem>
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>Other</SelectLabel>
                    <SelectItem value="other">Other (specify below)</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              {form.format === "other" && (
                <Input
                  placeholder="Describe the format…"
                  value={form.format_custom}
                  onChange={e => setForm(f => ({ ...f, format_custom: e.target.value }))}
                />
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tournament Type</Label>
                <Select value={form.event_type} onValueChange={v => setForm(f => ({ ...f, event_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Access</Label>
                <Select value={form.restriction} onValueChange={v => setForm(f => ({ ...f, restriction: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(RESTRICT_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Entry window */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Entries Open</Label>
                <Input type="date" value={form.entries_open} onChange={e => setForm(f => ({ ...f, entries_open: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Entries Close</Label>
                <Input type="date" value={form.entries_close} onChange={e => setForm(f => ({ ...f, entries_close: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>
                  Entry Fee (ZAR)
                  {form.payment_required && !form.use_tiered_pricing ? <span className="text-destructive ml-1">*</span> : ""}
                </Label>
                <Input
                  type="number" value={form.entry_fee}
                  onChange={e => setForm(f => ({ ...f, entry_fee: e.target.value }))}
                  placeholder={form.use_tiered_pricing ? "Not used (tiered pricing)" : form.payment_required ? "Required" : "Optional"}
                  disabled={!!form.use_tiered_pricing}
                />
                {form.payment_required && !form.use_tiered_pricing && (!form.entry_fee || Number(form.entry_fee) <= 0) && (
                  <p className="text-xs text-destructive">Required unless tiered pricing is enabled</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Max Participants</Label>
                <div className="flex items-center gap-2 rounded-md border px-3 py-2 bg-muted/40 text-sm text-muted-foreground h-10">
                  <Users className="h-3.5 w-3.5 flex-shrink-0" />
                  {selectedSlotIds.length > 0
                    ? `${availableSlots.filter(s => selectedSlotIds.includes(s.id)).reduce((sum, s) => sum + s.total_slots, 0)} spots (${selectedSlotIds.length} tee slot${selectedSlotIds.length !== 1 ? "s" : ""})`
                    : "Auto-calculated from tee schedule"}
                </div>
              </div>
            </div>

            {/* Toggles */}
            <Card className="bg-muted/30">
              <CardContent className="p-4 space-y-3">
                {[
                  { key: "payment_required", label: "Payment required", desc: "Golfers must pay before their spot is confirmed" },
                  { key: "scoring_enabled",  label: "Live scoring",     desc: "Enable score submission and leaderboard in the mobile app" },
                  { key: "ballot",           label: "Ballot if oversubscribed", desc: "When field is full, a ballot determines who gets a spot" },
                ].map(opt => (
                  <div key={opt.key} className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">{opt.label}</p>
                      <p className="text-xs text-muted-foreground">{opt.desc}</p>
                    </div>
                    <Switch
                      checked={!!(form as any)[opt.key]}
                      onCheckedChange={v => setForm(f => ({ ...f, [opt.key]: v }))}
                    />
                  </div>
                ))}

                {/* Payment method options — shown when payment is required */}
                {form.payment_required && (
                  <div className="pt-3 mt-1 border-t space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pricing &amp; payment methods</p>
                    {[
                      { key: "use_tiered_pricing", label: "Use tiered pricing",  desc: "Charge each golfer their standard club rate (member, visitor, junior…). Ignores the entry fee above." },
                      { key: "allow_wallet",       label: "Allow wallet",         desc: "Golfers can pay from their TapIn wallet balance" },
                      { key: "allow_prepaid",      label: "Allow prepaid rounds", desc: "Members can redeem one prepaid round credit to cover the entry" },
                      { key: "allow_voucher",      label: "Allow vouchers",       desc: "Golfers can apply a discount or cancellation voucher" },
                    ].map(opt => (
                      <div key={opt.key} className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium">{opt.label}</p>
                          <p className="text-xs text-muted-foreground">{opt.desc}</p>
                        </div>
                        <Switch
                          checked={!!(form as any)[opt.key]}
                          onCheckedChange={v => setForm(f => ({ ...f, [opt.key]: v }))}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Divisions */}
            <div className="space-y-2">
              <Label>Divisions (auto-assigned from HNA handicap)</Label>
              <div className="space-y-2">
                {form.divisions.map((d, i) => (
                  <div key={d.key} className="grid grid-cols-6 gap-2 items-center text-xs">
                    <span className="font-medium col-span-1">{d.label}</span>
                    <div className="col-span-1 flex items-center gap-1">
                      <span className="text-muted-foreground">HCP</span>
                      <Input type="number" className="h-7 text-xs w-16" value={d.min_hcp}
                        onChange={e => setForm(f => ({ ...f, divisions: f.divisions.map((x, j) => j === i ? { ...x, min_hcp: Number(e.target.value) } : x) }))} />
                      <span className="text-muted-foreground">–</span>
                      <Input type="number" className="h-7 text-xs w-16" value={d.max_hcp}
                        onChange={e => setForm(f => ({ ...f, divisions: f.divisions.map((x, j) => j === i ? { ...x, max_hcp: Number(e.target.value) } : x) }))} />
                    </div>
                    <div className="col-span-2">
                      <Select value={d.format} onValueChange={v => setForm(f => ({ ...f, divisions: f.divisions.map((x, j) => j === i ? { ...x, format: v } : x) }))}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(FORMAT_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2">
                      <Input className="h-7 text-xs" placeholder="Tees (e.g. championship)" value={d.tees}
                        onChange={e => setForm(f => ({ ...f, divisions: f.divisions.map((x, j) => j === i ? { ...x, tees: e.target.value } : x) }))} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Button className="w-full bg-[#1a5c38] hover:bg-[#164d30]" onClick={handleSave} disabled={saving || readOnly}>
              {saving ? "Saving…" : editId ? "Update Tournament" : "Create Tournament"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Full schedule-generation dialog — opened from each day card's Add button */}
      <GenerateTeeTimesDialog
        open={genDialogOpen}
        onOpenChange={setGenDialogOpen}
        initialDate={genDialogDate}
        onComplete={() => loadAvailableSlots(form.event_date, form.end_date || undefined)}
      />
    </div>
  );
}
