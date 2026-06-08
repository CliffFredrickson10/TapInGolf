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
  Plus, Pencil, Trash2, Calendar, Users, Trophy, ChevronRight, Check,
  CheckCircle, XCircle, Clock, CreditCard, ListOrdered, BarChart2, Send, ImageIcon, X,
  AlertTriangle, BookmarkPlus, Loader2, Shuffle, UserPlus,
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
  event_type: string; format: string; format_custom: string | null;
  format2: string | null; format2_custom: string | null;
  image_url: string | null; restriction: string;
  entry_fee: number | null; max_participants: number | null;
  status: string; created_at: string;
  divisions: Division[];
  entries_open: string | null; entries_close: string | null;
  ballot: number; scoring_enabled: number; payment_required: number; entries_required: number;
  use_tiered_pricing: number; allow_wallet: number; allow_prepaid: number; allow_voucher: number;
  rounds: number; holes: number;
  additional_fees: { name: string; amount: number }[];
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
  draw_group: number; starting_tee: number; user_id: number; user_name: string;
  division: string | null; frozen_handicap: number | null; notes: string | null;
  seed_metric: string | null; seed_value: number | null;
}

interface Score {
  id: number; user_id: number; user_name: string; round: number;
  gross: number | null; net: number | null; points: number | null;
  division: string | null; frozen_handicap: number | null;
  hole_scores: Record<string, number> | null; verified: number;
  team_id: number | null; team_name: string | null;
  dq: boolean; dq_reason: string | null;
  original_gross: number | null; original_net: number | null; original_points: number | null;
  corrected_at: string | null;
}

interface TeeSlot {
  id: number; date: string; time: string;
  total_slots: number; active: boolean;
  tee_start_type?: string;
}

function startingHoleFromSlots(slots: TeeSlot[], teeDate: string, teeTime: string): number {
  // Match the tee slot by date+time to derive the starting hole
  const dateStr = String(teeDate).slice(0, 10);
  const timeStr = String(teeTime).slice(0, 5);
  const match = slots.find(s =>
    String(s.date).slice(0, 10) === dateStr &&
    String(s.time).slice(0, 5) === timeStr
  );
  const tst = match?.tee_start_type ?? slots[0]?.tee_start_type ?? "1st Tee";
  if (tst === "10th Tee" || tst === "tenth_tee") return 10;
  return 1;
}

interface ConflictBooking {
  id: number; booking_ref: string; user_name: string; user_id: number;
  tee_date: string; tee_time: string; status: string; players: number;
}

interface ConflictEvent {
  id: number; name: string; event_date: string; end_date: string | null;
  status: string; slot_count: number; registrant_count: number;
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
  open: "Open", members_only: "Members Only", invitation_only: "Invite Only", whs_players_only: "WHS Index Players Only",
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
  format: "gross_stroke_play", format_custom: "", format2: "", format2_custom: "", image_url: "", restriction: "open",
  entry_fee: "" as any, max_participants: "" as any,
  entries_open: "", entries_close: "", rounds_per_day: 1 as 1 | 2,
  holes: 18 as 9 | 18,
  additional_fees: [] as { name: string; amount: number }[],
  ballot: false, scoring_enabled: false, payment_required: false, entries_required: true,
  use_tiered_pricing: false, allow_wallet: false, allow_prepaid: false, allow_voucher: false,
  use_divisions: true,
  divisions: DEFAULT_DIVISIONS,
};

// ─── Main component ────────────────────────────────────────────────────────

export default function Events() {
  const { toast } = useToast();
  const readOnly  = useReadOnly();

  const [events, setEvents]     = useState<GolfEvent[]>([]);
  const [loading, setLoading]   = useState(true);
  const [eventsTab, setEventsTab] = useState<"upcoming" | "past" | "cancelled">("upcoming");

  // Detail sheet
  const [detail, setDetail]     = useState<GolfEvent | null>(null);
  const [detailTab, setDetailTab] = useState("registrations");

  // Registrations
  const [regs, setRegs]         = useState<Registration[]>([]);
  const [regsLoading, setRegsLoading] = useState(false);

  // Detail tee schedule
  const [detailTeeSlots, setDetailTeeSlots]           = useState<TeeSlot[]>([]);
  const [detailTeeSlotsLoading, setDetailTeeSlotsLoading] = useState(false);

  // Draw
  const [draw, setDraw]           = useState<DrawEntry[]>([]);
  const [drawLoading, setDrawLoading]     = useState(false);
  const [drawRound, setDrawRound]         = useState(1);
  const [drawIsPublished, setDrawIsPublished] = useState(false);
  const [savingDraw, setSavingDraw] = useState(false);
  // Draw generation dialog
  const [genDlg, setGenDlg]               = useState(false);
  const [genMode, setGenMode]             = useState<"random"|"seeded">("random");
  const [genMetric, setGenMetric]         = useState<"gross"|"net"|"points">("points");
  const [genSeedRound, setGenSeedRound]   = useState(1);
  const [genPerGroup, setGenPerGroup]     = useState(4);
  const [genAllRounds, setGenAllRounds]   = useState(false);
  const [genGroupByDiv, setGenGroupByDiv] = useState(false);
  const [generating, setGenerating]       = useState(false);

  // Scores
  const [scores, setScores]     = useState<Score[]>([]);
  const [scoresLoading, setScoresLoading] = useState(false);
  const [scoreRound, setScoreRound] = useState(1);
  const [editScores, setEditScores] = useState<Record<number, { gross: string; net: string; points: string }>>({});
  const [savingScores, setSavingScores] = useState(false);

  // DQ dialog
  const [dqDialog, setDqDialog] = useState<{ userId: number; userName: string; submitted: Score | null } | null>(null);
  const [dqReason, setDqReason] = useState("");
  const [dqGross, setDqGross]   = useState("");
  const [dqNet, setDqNet]       = useState("");
  const [dqPoints, setDqPoints] = useState("");
  const [dqSaving, setDqSaving] = useState(false);

  // Invite list (invitation_only events)
  const [invites, setInvites]               = useState<{ id: number; user_id: number; name: string; email: string; handicap_index: number | null }[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [inviteQuery, setInviteQuery]       = useState("");
  const [inviteResults, setInviteResults]   = useState<{ id: number; name: string; email: string; handicap_index: number | null }[]>([]);
  const [inviteSearching, setInviteSearching] = useState(false);
  const [inviteAdding, setInviteAdding]     = useState<number | null>(null);
  const [inviteRemoving, setInviteRemoving] = useState<number | null>(null);

  // Conflict resolution dialog
  const [conflictDialog, setConflictDialog] = useState<{
    open: boolean;
    eventId: number | null;
    bookings: ConflictBooking[];
    events: ConflictEvent[];
    resolving: boolean;
  }>({ open: false, eventId: null, bookings: [], events: [], resolving: false });

  // Cancel tournament dialog
  const [cancelDlg, setCancelDlg] = useState<{ open: boolean; eventId: number | null; eventName: string; cancelling: boolean }>({
    open: false, eventId: null, eventName: "", cancelling: false,
  });
  const [cancelSlotsChoice, setCancelSlotsChoice] = useState<"delete" | "open">("open");

  // Description textarea ref (auto-resize on open — useEffect placed after dlgOpen state)
  const descRef = useRef<HTMLTextAreaElement>(null);

  // Image upload
  const imgInputRef = useRef<HTMLInputElement>(null);
  const [imgUploading, setImgUploading] = useState(false);

  const handleImgSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImgUploading(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch("/api/portal/events/image/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("club_token") ?? ""}` },
        body: fd,
      });
      if (!res.ok) throw new Error((await res.json()).message ?? "Upload failed");
      const { url } = await res.json();
      setForm(f => ({ ...f, image_url: url }));
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setImgUploading(false);
      if (imgInputRef.current) imgInputRef.current.value = "";
    }
  };

  // Create/Edit dialog
  const [dlgOpen, setDlgOpen]   = useState(false);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [editId, setEditId]     = useState<number | null>(null);
  const [saving, setSaving]     = useState(false);

  // Tournament templates
  const [templates, setTemplates]         = useState<Array<{ id: number; name: string; template_data: any }>>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [showTplSave, setShowTplSave]     = useState(false);
  const [tplSaveName, setTplSaveName]     = useState("");
  const [savingTpl, setSavingTpl]         = useState(false);
  const [renamingTplId, setRenamingTplId] = useState<number | null>(null);
  const [renameTplVal, setRenameTplVal]   = useState("");
  const [teeConfigSnapshot, setTeeConfigSnapshot] = useState<{ config_type: "A" | "B"; config_data: any } | null>(null);
  const [pendingTeeConfig, setPendingTeeConfig]   = useState<{ config_type: "A" | "B"; config_data: any } | null>(null);

  // Auto-resize description textarea when dialog opens with existing content.
  // Radix Dialog animates in, so the ref isn't attached until after the first frame.
  useEffect(() => {
    if (!dlgOpen) return;
    const timer = setTimeout(() => {
      if (descRef.current) {
        const el = descRef.current;
        el.style.height = "auto";
        el.style.height = el.scrollHeight + "px";
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [dlgOpen]);

  // Tournament-exclusive tee slot management
  const [eventSlots, setEventSlots]           = useState<TeeSlot[]>([]);
  const [deletedSlotIds, setDeletedSlotIds]   = useState<number[]>([]);
  const [slotsLoading, setSlotsLoading]       = useState(false);
  const [genDialogOpen, setGenDialogOpen]     = useState(false);
  const [genDialogDate, setGenDialogDate]     = useState("");
  const tempSlotCounter                       = useRef(-1);
  const [newSlotDate, setNewSlotDate]         = useState("");
  const [newSlotTime, setNewSlotTime]         = useState("");
  const [newSlotPlayers, setNewSlotPlayers]   = useState(4);
  // Inline slot editing
  const [editingSlotId, setEditingSlotId]     = useState<number | null>(null);
  const [editSlotTime, setEditSlotTime]       = useState("");
  const [editSlotPlayers, setEditSlotPlayers] = useState(4);
  const [slotSaving, setSlotSaving]           = useState(false);
  // Existing-slots import banner (new tournament only)
  const [existingGeneralSlots, setExistingGeneralSlots] = useState<TeeSlot[]>([]);
  const [checkingExistingSlots, setCheckingExistingSlots] = useState(false);
  const [importBannerDismissed, setImportBannerDismissed] = useState(false);

  // ── Loaders ──────────────────────────────────────────────────────────────

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<GolfEvent[]>(`/api/portal/events?upcoming=all`);
      setEvents(data);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  // ── Derived lists ──────────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);

  const upcomingEvents = events
    .filter(ev => ev.status !== "cancelled" && ev.event_date >= today)
    .sort((a, b) => a.event_date.localeCompare(b.event_date) || (a.start_time ?? "").localeCompare(b.start_time ?? ""));

  const pastEvents = events
    .filter(ev => ev.status !== "cancelled" && ev.event_date < today)
    .sort((a, b) => b.event_date.localeCompare(a.event_date) || (b.start_time ?? "").localeCompare(a.start_time ?? ""));

  const cancelledEvents = events
    .filter(ev => ev.status === "cancelled")
    .sort((a, b) => b.event_date.localeCompare(a.event_date));

  const activeList = eventsTab === "upcoming" ? upcomingEvents : eventsTab === "past" ? pastEvents : cancelledEvents;

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
      if (data.length > 0 || round === 1) {
        setDraw(data);
        setDrawIsPublished(data.length > 0);
      } else {
        // Round 2+ with no draw yet — carry over the player roster from Round 1
        const r1 = await api<DrawEntry[]>(`/api/portal/events/${ev.id}/draw?round=1`);
        if (r1.length === 0) {
          setDraw([]);
          setDrawIsPublished(false);
        } else {
          // Compute this round's date (event_date + round - 1 days)
          const base = new Date(ev.event_date);
          base.setDate(base.getDate() + (round - 1));
          const teeDate = base.toISOString().split("T")[0]!;
          // Copy players — reset tee times so staff can generate/arrange
          setDraw(r1.map((d, idx) => ({
            ...d,
            id: Date.now() + idx,
            round,
            tee_date: teeDate,
            tee_time: "08:00",
            draw_group: idx + 1,
            starting_tee: 1,
          })));
          setDrawIsPublished(false);
        }
      }
    } catch {} finally { setDrawLoading(false); }
  }, []);

  const loadEventSlots = useCallback(async (eventId: number) => {
    setSlotsLoading(true);
    try {
      const data = await api<TeeSlot[]>(`/api/portal/events/${eventId}/tee-slots`);
      setEventSlots(data);
    } catch {} finally { setSlotsLoading(false); }
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

  const loadInvites = useCallback(async (ev: GolfEvent) => {
    setInvitesLoading(true);
    try {
      const data = await api<{ invites: typeof invites }>(`/api/portal/events/${ev.id}/invites`);
      setInvites(data.invites ?? []);
    } catch {} finally { setInvitesLoading(false); }
  }, []);

  const searchInviteUsers = useCallback(async (q: string) => {
    if (!q || q.length < 2) { setInviteResults([]); return; }
    setInviteSearching(true);
    try {
      const data = await api<{ users: typeof inviteResults }>(`/api/portal/users/search?q=${encodeURIComponent(q)}`);
      setInviteResults(data.users ?? []);
    } catch {} finally { setInviteSearching(false); }
  }, []);

  const addInvite = async (userId: number) => {
    if (!detail) return;
    setInviteAdding(userId);
    try {
      const data = await api<{ invites: typeof invites }>(`/api/portal/events/${detail.id}/invites`, {
        method: "POST", body: JSON.stringify({ user_id: userId }),
      });
      setInvites(data.invites ?? []);
      setInviteResults(prev => prev.filter(u => u.id !== userId));
    } catch {} finally { setInviteAdding(null); }
  };

  const removeInvite = async (userId: number) => {
    if (!detail) return;
    setInviteRemoving(userId);
    try {
      await api(`/api/portal/events/${detail.id}/invites/${userId}`, { method: "DELETE" });
      setInvites(prev => prev.filter(i => i.user_id !== userId));
    } catch {} finally { setInviteRemoving(null); }
  };

  const openDetail = (ev: GolfEvent) => {
    setDetail(ev);
    setDetailTab("registrations");
    setDrawRound(1);
    setScoreRound(1);
    setInvites([]);
    setInviteQuery("");
    setInviteResults([]);
    loadRegs(ev);
  };

  useEffect(() => {
    if (detail && detailTab === "draw")    loadDraw(detail, drawRound);
    if (detail && detailTab === "scores")  loadScores(detail, scoreRound);
    if (detail && detailTab === "invites") loadInvites(detail);
    if (detail && detailTab === "schedule") {
      setDetailTeeSlotsLoading(true);
      api<TeeSlot[]>(`/api/portal/events/${detail.id}/tee-slots`)
        .then(data => setDetailTeeSlots(data))
        .catch(() => {})
        .finally(() => setDetailTeeSlotsLoading(false));
    }
  }, [detailTab, drawRound, scoreRound, detail]);

  // ── CRUD ──────────────────────────────────────────────────────────────────

  const handleSlotUpdate = async (slot: TeeSlot) => {
    if (slot.id < 0) {
      // Staged (new) slot — update state only
      setEventSlots(prev => prev.map(s => s.id === slot.id
        ? { ...s, time: editSlotTime, total_slots: editSlotPlayers }
        : s
      ));
      setEditingSlotId(null);
      return;
    }
    if (!editId) return;
    setSlotSaving(true);
    try {
      const updated = await api<TeeSlot>(`/api/portal/events/${editId}/tee-times/${slot.id}`, {
        method: "PUT",
        body: JSON.stringify({ time: editSlotTime, total_slots: editSlotPlayers }),
      });
      setEventSlots(prev => prev.map(s => s.id === slot.id
        ? { ...s, time: updated.time, total_slots: updated.total_slots }
        : s
      ));
      setEditingSlotId(null);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setSlotSaving(false); }
  };

  // ── Detect existing general tee slots for the chosen date (new tournament only) ──

  useEffect(() => {
    if (editId || !dlgOpen || !form.event_date) {
      setExistingGeneralSlots([]);
      return;
    }
    const from = form.event_date;
    const to   = form.end_date || form.event_date;
    setCheckingExistingSlots(true);
    setImportBannerDismissed(false);
    api<TeeSlot[]>(`/api/portal/tee-times?from=${from}&to=${to}`)
      .then(slots => {
        const general = (slots as any[]).filter(s => !s.event_id).map(s => ({
          id:          s.id,
          date:        String(s.date).slice(0, 10),
          time:        String(s.time).slice(0, 5),
          total_slots: s.total_slots,
          active:      !!s.active,
          tee_start_type: s.tee_start_type ?? "first_tee",
        }));
        setExistingGeneralSlots(general);
      })
      .catch(() => setExistingGeneralSlots([]))
      .finally(() => setCheckingExistingSlots(false));
  }, [editId, dlgOpen, form.event_date, form.end_date]);

  const handleImportExistingSlots = () => {
    const staged = existingGeneralSlots.map(s => ({
      ...s,
      id: tempSlotCounter.current--,
    }));
    const importedDates = new Set(staged.map(s => s.date));
    setEventSlots(prev => [
      ...prev.filter(s => !importedDates.has(String(s.date).slice(0, 10))),
      ...staged,
    ]);
    setImportBannerDismissed(true);
    toast({
      title: "Tee times imported",
      description: `${staged.length} slot${staged.length !== 1 ? "s" : ""} loaded from the existing schedule — they'll become exclusive to this tournament on save.`,
    });
  };

  // ── Tournament template handlers ──────────────────────────────────────────

  useEffect(() => {
    if (!dlgOpen) { setShowTplSave(false); setTplSaveName(""); return; }
    setTemplatesLoading(true);
    api<Array<{ id: number; name: string; template_data: any }>>("/api/portal/tournament-templates")
      .then(setTemplates)
      .catch(() => {})
      .finally(() => setTemplatesLoading(false));
  }, [dlgOpen]);

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = tplSaveName.trim();
    if (!name) return;
    setSavingTpl(true);
    try {
      const { event_date, end_date, entries_open, entries_close, ...rest } = form;
      const template_data = { ...rest, ...(teeConfigSnapshot ? { tee_config: teeConfigSnapshot } : {}) };
      const saved = await api<{ id: number; name: string; template_data: any }>("/api/portal/tournament-templates", {
        method: "POST",
        body: JSON.stringify({ name, template_data }),
      });
      setTemplates(prev => [...prev, saved]);
      setTplSaveName("");
      setShowTplSave(false);
      toast({ title: "Template saved", description: `"${name}" saved${teeConfigSnapshot ? " (includes tee schedule config)" : ""}.` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSavingTpl(false); }
  };

  const handleLoadTemplate = (tpl: { id: number; name: string; template_data: any }) => {
    const { tee_config, ...fields } = tpl.template_data;
    setForm(f => ({ ...EMPTY_FORM, ...f, ...fields, event_date: f.event_date, end_date: f.end_date, entries_open: f.entries_open, entries_close: f.entries_close }));
    if (tee_config) { setPendingTeeConfig(tee_config); setTeeConfigSnapshot(tee_config); }
    toast({ title: `Template "${tpl.name}" loaded`, description: tee_config ? "Tee schedule config ready in the generator." : "Form pre-filled — set the dates to continue." });
  };

  const handleRenameTpl = async (id: number) => {
    const name = renameTplVal.trim();
    if (!name) return;
    try {
      await api(`/api/portal/tournament-templates/${id}`, { method: "PUT", body: JSON.stringify({ name }) });
      setTemplates(prev => prev.map(t => t.id === id ? { ...t, name } : t));
      setRenamingTplId(null);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDeleteTemplate = async (id: number, name: string) => {
    if (!confirm(`Delete template "${name}"?`)) return;
    try {
      await api(`/api/portal/tournament-templates/${id}`, { method: "DELETE" });
      setTemplates(prev => prev.filter(t => t.id !== id));
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setEditId(null);
    setEventSlots([]);
    setDeletedSlotIds([]);
    tempSlotCounter.current = -1;
    setNewSlotDate("");
    setNewSlotTime("");
    setNewSlotPlayers(4);
    setTeeConfigSnapshot(null);
    setPendingTeeConfig(null);
    setExistingGeneralSlots([]);
    setImportBannerDismissed(false);
    setDlgOpen(true);
  };

  const openEdit = async (ev: GolfEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    const d = (v: any) => (v ? String(v).slice(0, 10) : "");
    const startDate = d(ev.event_date);
    const endDate   = d(ev.end_date);

    setForm({
      name: ev.name, description: ev.description ?? "",
      event_date: startDate, end_date: endDate,
      start_time: ev.start_time ?? "", end_time: ev.end_time ?? "",
      event_type: ev.event_type, format: ev.format ?? "gross_stroke_play",
      format_custom: ev.format_custom ?? "",
      format2: ev.format2 ?? "", format2_custom: ev.format2_custom ?? "",
      image_url: ev.image_url ?? "",
      restriction: ev.restriction,
      entry_fee: ev.entry_fee ?? "",
      max_participants: ev.max_participants ?? "",
      entries_open: d(ev.entries_open), entries_close: d(ev.entries_close),
      rounds_per_day: (() => {
        const days = computeDays(startDate, endDate);
        const rpd = Math.round((ev.rounds ?? 1) / days);
        return (rpd >= 2 ? 2 : 1) as 1 | 2;
      })(),
      holes: (ev.holes === 9 ? 9 : 18) as 9 | 18,
      additional_fees: Array.isArray(ev.additional_fees) ? ev.additional_fees : [],
      ballot: !!ev.ballot, scoring_enabled: !!ev.scoring_enabled,
      payment_required: !!ev.payment_required,
      entries_required: ev.entries_required !== 0,
      use_tiered_pricing: !!ev.use_tiered_pricing,
      allow_wallet: !!ev.allow_wallet, allow_prepaid: !!ev.allow_prepaid, allow_voucher: !!ev.allow_voucher,
      use_divisions: Array.isArray(ev.divisions) ? ev.divisions.length > 0 : true,
      divisions: (Array.isArray(ev.divisions) && ev.divisions.length > 0) ? ev.divisions : DEFAULT_DIVISIONS,
    });
    setEditId(ev.id);
    setDeletedSlotIds([]);
    tempSlotCounter.current = -1;
    setNewSlotDate("");
    setNewSlotTime("");
    setNewSlotPlayers(4);
    setDlgOpen(true);
    // Load exclusive event slots after opening (existing events only)
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
        additional_fees:  (form.additional_fees ?? []).filter(f => f.name.trim() && f.amount > 0),
        max_participants: null,   // auto-computed server-side from tee slots
        rounds:           numDays * form.rounds_per_day,
        divisions:        form.use_divisions ? form.divisions : [],
      };
      let evId: number;
      if (editId) {
        await api(`/api/portal/events/${editId}`, { method: "PUT", body: JSON.stringify(body) });
        evId = editId;
      } else {
        const saved = await api<{ id: number }>("/api/portal/events", { method: "POST", body: JSON.stringify(body) });
        evId = saved.id;
      }
      // For new events: persist any staged tee slots (temp ids < 0) as exclusive event slots.
      // First, clear any general (non-event) slots on those same dates so there are no
      // orphaned public slots sitting alongside the tournament-exclusive ones.
      const newSlots = eventSlots.filter(s => s.id < 0);
      if (newSlots.length > 0) {
        const dateSet = [...new Set(newSlots.map(s => String(s.date).slice(0, 10)))].sort();
        const clearFrom = dateSet[0];
        const clearTo   = dateSet[dateSet.length - 1];
        await api(`/api/portal/tee-times/clear?from=${clearFrom}&to=${clearTo}`, { method: "DELETE" }).catch(() => {});
        await Promise.all(newSlots.map(s =>
          api("/api/portal/tee-times", {
            method: "POST",
            body: JSON.stringify({ date: String(s.date).slice(0, 10), time: String(s.time).slice(0, 5), total_slots: s.total_slots, active: true, event_id: evId }),
          }).catch(() => {})
        ));
      }
      // For existing events: delete removed slots via the event-scoped endpoint
      if (deletedSlotIds.length > 0) {
        await Promise.all(deletedSlotIds.map(id =>
          api(`/api/portal/events/${evId}/tee-times/${id}`, { method: "DELETE" }).catch(() => {})
        ));
      }
      const wasPublished = editId && events.find(e => e.id === editId)?.status === "active";
      toast({
        title: editId ? "Tournament updated" : "Tournament created",
        description: wasPublished
          ? "Changes saved. Tap 'Publish Changes' to notify registered golfers."
          : undefined,
      });
      setDlgOpen(false);
      loadEvents();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handlePublish = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    // Check for date-range conflicts before asking to publish
    try {
      const data = await api(`/api/portal/events/${id}/conflicts`);
      if ((data.conflicting_bookings?.length ?? 0) > 0 || (data.conflicting_events?.length ?? 0) > 0) {
        setConflictDialog({ open: true, eventId: id, bookings: data.conflicting_bookings, events: data.conflicting_events, resolving: false });
        return;
      }
    } catch { /* if conflict check fails, fall through to normal publish */ }

    const ev = events.find(e => e.id === id);
    const isRepublish = (ev?.total_registrations ?? 0) > 0;
    const confirmMsg = isRepublish
      ? "Publish changes? All registered golfers will be notified of the update."
      : "Publish this tournament? Notifications will be sent to club members.";
    if (!confirm(confirmMsg)) return;
    try {
      const updated = await api(`/api/portal/events/${id}/publish`, { method: "POST" });
      setEvents(prev => prev.map(e => e.id === id ? { ...e, ...updated, status: "active" } : e));
      toast({
        title: isRepublish ? "Changes published" : "Tournament published",
        description: isRepublish ? "Registered golfers have been notified of the update." : "Club members have been notified.",
      });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const handleResolveAndPublish = async () => {
    if (!conflictDialog.eventId) return;
    setConflictDialog(prev => ({ ...prev, resolving: true }));
    try {
      const updated = await api(`/api/portal/events/${conflictDialog.eventId}/resolve-and-publish`, {
        method: "POST",
        body: JSON.stringify({
          cancel_booking_ids: conflictDialog.bookings.map(b => b.id),
          cancel_event_ids:   conflictDialog.events.map(ev => ev.id),
        }),
      });
      setEvents(prev => prev.map(ev =>
        ev.id === conflictDialog.eventId ? { ...ev, ...updated, status: "active" } :
        conflictDialog.events.some(ce => ce.id === ev.id) ? { ...ev, status: "cancelled" } : ev
      ));
      setConflictDialog({ open: false, eventId: null, bookings: [], events: [], resolving: false });
      toast({ title: "Tournament published", description: "Conflicts resolved. Golfers have been notified." });
    } catch (e: any) {
      setConflictDialog(prev => ({ ...prev, resolving: false }));
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleCancel = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const ev = events.find(ev => ev.id === id);
    setCancelDlg({ open: true, eventId: id, eventName: ev?.name ?? "this tournament", cancelling: false });
    setCancelSlotsChoice("delete");
  };

  const executeCancelTournament = async () => {
    if (!cancelDlg.eventId) return;
    setCancelDlg(prev => ({ ...prev, cancelling: true }));
    try {
      await api(`/api/portal/events/${cancelDlg.eventId}?slots=${cancelSlotsChoice}`, { method: "DELETE" });
      setEvents(prev => prev.map(ev => ev.id === cancelDlg.eventId ? { ...ev, status: "cancelled" } : ev));
      setCancelDlg({ open: false, eventId: null, eventName: "", cancelling: false });
      toast({ title: "Tournament cancelled", description: "Registered golfers have been notified." });
    } catch (e: any) {
      setCancelDlg(prev => ({ ...prev, cancelling: false }));
      toast({ title: "Error", description: (e as any).message, variant: "destructive" });
    }
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

  const [approvingAll, setApprovingAll] = useState(false);
  const approveAll = async () => {
    if (!detail) return;
    const pendingCount = regs.filter(r => r.status === "pending").length;
    if (pendingCount === 0) { toast({ title: "No pending registrations" }); return; }
    setApprovingAll(true);
    try {
      const result = await api<{ approved: number; rejected: number; message?: string }>(
        `/api/portal/events/${detail.id}/registrations/approve-all`,
        { method: "POST" }
      );
      // Reload registrations to reflect new statuses
      await loadRegs(detail);
      if (result.rejected > 0) {
        toast({
          title: `${result.approved} approved, ${result.rejected} rejected`,
          description: "Field is full — latest registrants were removed from the ballot.",
        });
      } else {
        toast({ title: `${result.approved} player${result.approved !== 1 ? "s" : ""} approved` });
      }
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setApprovingAll(false); }
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
      setDrawIsPublished(true);
      toast({ title: "Draw published — players notified" });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setSavingDraw(false); }
  };

  // Add all approved players not yet in the draw (ungrouped, staff arranges groups)
  const handleAddAll = () => {
    if (!detail) return;
    const inDraw = new Set(draw.map(d => d.user_id));
    const eligible = regs.filter(r => r.status === "approved" && !inDraw.has(r.user_id));
    if (!eligible.length) { toast({ title: "All approved players are already in the draw" }); return; }
    const teeDate = detail.event_date ?? new Date().toISOString().split("T")[0];
    const lastGroup = draw.length > 0 ? Math.max(...draw.map(d => d.draw_group)) : 0;
    const newEntries: DrawEntry[] = eligible.map((p, idx) => ({
      id: Date.now() + idx, round: drawRound, tee_date: teeDate,
      tee_time: "08:00", draw_group: lastGroup + idx + 1, starting_tee: 1,
      user_id: p.user_id, user_name: p.user_name,
      division: p.division, frozen_handicap: p.frozen_handicap, notes: null,
      seed_metric: null, seed_value: null,
    }));
    setDraw(prev => [...prev, ...newEntries]);
    toast({ title: `${eligible.length} players added to draw` });
  };

  // Generate draw via API (random or seeded), optionally all rounds
  const handleGenerateDraw = async () => {
    if (!detail) return;
    setGenerating(true);
    const baseDate = new Date(detail.event_date);
    try {
      if (genAllRounds && genMode === "random") {
        const totalRounds = detail.rounds ?? 1;
        for (let r = 1; r <= totalRounds; r++) {
          const d = new Date(baseDate);
          d.setDate(d.getDate() + (r - 1));
          const date = d.toISOString().split("T")[0];
          const data = await api<{ entries: DrawEntry[] }>(`/api/portal/events/${detail.id}/draw/generate`, {
            method: "POST",
            body: JSON.stringify({ round: r, date, mode: "random", players_per_group: genPerGroup, group_by_division: genGroupByDiv }),
          });
          await api(`/api/portal/events/${detail.id}/draw`, {
            method: "PUT",
            body: JSON.stringify({ round: r, entries: data.entries }),
          });
        }
        setGenDlg(false);
        toast({ title: `All ${detail.rounds ?? 1} rounds randomized and published` });
        loadDraw(detail, drawRound);
      } else {
        const d = new Date(baseDate);
        d.setDate(d.getDate() + (drawRound - 1));
        const date = d.toISOString().split("T")[0];
        const data = await api<{ entries: DrawEntry[] }>(`/api/portal/events/${detail.id}/draw/generate`, {
          method: "POST",
          body: JSON.stringify({
            round: drawRound, date, mode: genMode,
            players_per_group: genPerGroup,
            seed_metric: genMetric,
            seed_round: genSeedRound,
            group_by_division: genGroupByDiv,
          }),
        });
        setDraw(data.entries);
        setDrawIsPublished(false);
        setGenDlg(false);
        toast({ title: `Draw generated — review and click Publish when ready` });
      }
    } catch (e: any) {
      toast({ title: "Error generating draw", description: e.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
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
      tee_time: "08:00", draw_group: lastGroup + 1, starting_tee: startingHoleFromSlots(detailTeeSlots, today, "08:00"),
      user_id: player.user_id, user_name: player.user_name,
      division: player.division, frozen_handicap: player.frozen_handicap, notes: null,
      seed_metric: null, seed_value: null,
    }]);
  };

  // ── Scores ────────────────────────────────────────────────────────────────

  const openDqDialog = (userId: number, userName: string) => {
    const submitted = scores.find(s => s.user_id === userId && s.round === scoreRound) ?? null;
    setDqGross(submitted?.gross != null ? String(submitted.gross) : "");
    setDqNet(submitted?.net != null ? String(submitted.net) : "");
    setDqPoints(submitted?.points != null ? String(submitted.points) : "");
    setDqReason("");
    setDqDialog({ userId, userName, submitted });
  };

  const confirmDq = async () => {
    if (!detail || !dqDialog) return;
    setDqSaving(true);
    try {
      await api(`/api/portal/events/${detail.id}/scores/${dqDialog.userId}/dq`, {
        method: "POST",
        body: JSON.stringify({
          round: scoreRound,
          reason: dqReason || undefined,
          corrected_gross:  dqGross  ? Number(dqGross)  : undefined,
          corrected_net:    dqNet    ? Number(dqNet)    : undefined,
          corrected_points: dqPoints ? Number(dqPoints) : undefined,
        }),
      });
      toast({ title: `${dqDialog.userName} disqualified`, description: "Player notified." });
      setDqDialog(null);
      loadScores(detail, scoreRound);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setDqSaving(false); }
  };

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
        <Button className="bg-[#1a5c38] hover:bg-[#164d30] gap-2" onClick={openAdd} disabled={readOnly}>
          <Plus className="h-4 w-4" />New Tournament
        </Button>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b mb-4">
        {(["upcoming", "past", "cancelled"] as const).map(tab => {
          const count = tab === "upcoming" ? upcomingEvents.length : tab === "past" ? pastEvents.length : cancelledEvents.length;
          const active = eventsTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setEventsTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 capitalize ${active ? "border-[#1a5c38] text-[#1a5c38]" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {tab}
              {!loading && count > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${tab === "cancelled" ? "bg-red-100 text-red-600" : tab === "upcoming" ? "bg-[#1a5c38]/10 text-[#1a5c38]" : "bg-gray-100 text-gray-600"}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* List */}
      {loading ? (
        <Skeleton className="h-48 w-full" />
      ) : activeList.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center text-muted-foreground">
            {eventsTab === "upcoming" ? "No upcoming tournaments. Create your first one." : eventsTab === "past" ? "No past tournaments." : "No cancelled tournaments."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {activeList.map(ev => (
            <Card
              key={ev.id}
              className={`cursor-pointer hover:border-[#1a5c38]/40 hover:bg-green-50/20 transition-colors ${ev.status === "cancelled" ? "opacity-70" : ""}`}
              onClick={() => openDetail(ev)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex gap-3">
                    <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 mt-0.5">
                      {ev.image_url
                        ? <img src={ev.image_url} alt={ev.name} className="w-full h-full object-cover" />
                        : <div className="w-full h-full bg-[#1a5c38]/10 flex items-center justify-center"><Trophy className="h-5 w-5 text-[#1a5c38]" /></div>
                      }
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
                        {fmtFormat(ev)}{ev.format2 ? ` + ${fmtFormat({ format: ev.format2, format_custom: ev.format2_custom })}` : ""} · {RESTRICT_LABELS[ev.restriction] ?? ev.restriction}
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
                      <Button
                        variant="ghost" size="sm"
                        className="h-7 px-2 text-xs text-green-700 hover:bg-green-50 gap-1"
                        title={ev.total_registrations > 0 ? "Publish changes & notify registrants" : "Publish tournament"}
                        onClick={e => handlePublish(ev.id, e)}
                        disabled={readOnly}
                      >
                        <Send className="h-3 w-3" />
                        {ev.total_registrations > 0 ? "Publish Changes" : "Publish"}
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
              {detail.image_url && (
                <div className="w-full h-48 overflow-hidden flex-shrink-0">
                  <img src={detail.image_url} alt={detail.name} className="w-full h-full object-cover" />
                </div>
              )}
              <SheetHeader className="px-6 pt-6 pb-4 border-b">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <SheetTitle className="text-lg">{detail.name}</SheetTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      {fmtDate(detail.event_date)}{detail.end_date ? ` – ${fmtDate(detail.end_date)}` : ""}
                      {" · "}{fmtFormat(detail)}{detail.format2 ? ` + ${fmtFormat({ format: detail.format2, format_custom: detail.format2_custom })}` : ""}
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
                <TabsList className={`w-full grid mb-4 h-10 ${detail.restriction === "invitation_only" ? "grid-cols-6" : "grid-cols-5"}`}>
                  <TabsTrigger value="registrations" className="text-xs gap-1">
                    <Users className="h-3.5 w-3.5" />Entries
                    {detail.pending_count > 0 && <span className="ml-0.5 bg-amber-500 text-white text-[10px] rounded-full px-1 py-0.5 font-bold">{detail.pending_count}</span>}
                  </TabsTrigger>
                  <TabsTrigger value="schedule" className="text-xs gap-1"><Clock className="h-3.5 w-3.5" />Schedule</TabsTrigger>
                  <TabsTrigger value="divisions" className="text-xs gap-1"><Trophy className="h-3.5 w-3.5" />Divisions</TabsTrigger>
                  <TabsTrigger value="draw" className="text-xs gap-1"><ListOrdered className="h-3.5 w-3.5" />Draw</TabsTrigger>
                  <TabsTrigger value="scores" className="text-xs gap-1"><BarChart2 className="h-3.5 w-3.5" />Scores</TabsTrigger>
                  {detail.restriction === "invitation_only" && (
                    <TabsTrigger value="invites" className="text-xs gap-1">
                      <Send className="h-3.5 w-3.5" />Invites
                      {invites.length > 0 && <span className="ml-0.5 bg-blue-500 text-white text-[10px] rounded-full px-1 py-0.5 font-bold">{invites.length}</span>}
                    </TabsTrigger>
                  )}
                </TabsList>

                {/* REGISTRATIONS TAB */}
                <TabsContent value="registrations" className="pb-8">
                  {/* Summary bar */}
                  {regs.length > 0 && (
                    <div className="flex items-center gap-4 mb-3 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{regs.length} registered</span>
                      {detail.max_participants ? <span>· {detail.max_participants} spot field</span> : null}
                      {detail.payment_required && (
                        <>
                          <span className="text-green-700 font-medium">· {regs.filter(r => r.payment_status === "paid").length} paid</span>
                          <span>· {regs.filter(r => r.status === "approved" && r.payment_status !== "paid").length} awaiting payment</span>
                        </>
                      )}
                      {regs.some(r => r.status === "rejected") && (
                        <span className="text-red-600">· {regs.filter(r => r.status === "rejected").length} rejected</span>
                      )}
                    </div>
                  )}
                  {regsLoading ? (
                    <Skeleton className="h-32 w-full" />
                  ) : regs.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">No registrations yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {regs.map(r => {
                        // Derive a single human-readable entry state
                        const entryState: "confirmed" | "awaiting_payment" | "registered" | "rejected" =
                          r.status === "rejected" ? "rejected"
                          : r.payment_status === "paid" ? "confirmed"
                          : detail.payment_required ? "awaiting_payment"
                          : "registered";
                        const stateBadge: Record<string, string> = {
                          confirmed:        "bg-green-100 text-green-700",
                          awaiting_payment: "bg-amber-100 text-amber-700",
                          registered:       "bg-blue-100 text-blue-700",
                          rejected:         "bg-red-100 text-red-700",
                        };
                        const stateLabel: Record<string, string> = {
                          confirmed:        "Confirmed",
                          awaiting_payment: "Awaiting Payment",
                          registered:       "Registered",
                          rejected:         "Rejected",
                        };
                        return (
                          <Card key={r.id} className={entryState === "rejected" ? "opacity-60" : ""}>
                            <CardContent className="p-3">
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-medium text-sm">{r.user_name}</span>
                                    {r.division && <span className="text-xs bg-[#1a5c38]/10 text-[#1a5c38] px-2 py-0.5 rounded-full font-medium">{r.division} Div</span>}
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${stateBadge[entryState]}`}>
                                      {entryState === "confirmed" && <CheckCircle className="h-3 w-3 inline mr-1" />}
                                      {stateLabel[entryState]}
                                    </span>
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    {r.user_email}
                                    {r.frozen_handicap != null ? ` · HCP ${r.frozen_handicap}` : ""}
                                    {r.registered_at ? ` · Entered ${new Date(r.registered_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}
                                  </p>
                                </div>
                                {/* Staff can manually remove an entry if needed */}
                                {!readOnly && r.status !== "rejected" && (
                                  <Button
                                    size="sm" variant="ghost"
                                    className="h-7 gap-1 text-xs text-red-600 hover:bg-red-50 hover:text-red-700 flex-shrink-0"
                                    onClick={() => updateReg(r.user_id, "rejected")}
                                  >
                                    <XCircle className="h-3.5 w-3.5" />Remove
                                  </Button>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>

                {/* TEE SCHEDULE TAB */}
                <TabsContent value="schedule" className="pb-8">
                  {detailTeeSlotsLoading ? (
                    <div className="space-y-2">
                      {[1,2,3].map(i => <div key={i} className="h-16 rounded-lg border bg-muted/20 animate-pulse" />)}
                    </div>
                  ) : detailTeeSlots.length === 0 ? (
                    <div className="text-center py-10 space-y-2">
                      <Clock className="h-8 w-8 mx-auto text-muted-foreground/40" />
                      <p className="text-sm text-muted-foreground">No tee slots created yet.</p>
                      <p className="text-xs text-muted-foreground">Open Edit to generate a tee schedule for this tournament.</p>
                    </div>
                  ) : (() => {
                    const slotsByDate = detailTeeSlots.reduce((acc, s) => {
                      const key = String(s.date).slice(0, 10);
                      (acc[key] ||= []).push(s);
                      return acc;
                    }, {} as Record<string, TeeSlot[]>);
                    const dates = Object.keys(slotsByDate).sort();
                    const totalSlots = detailTeeSlots.length;
                    const totalSpots = detailTeeSlots.reduce((sum, s) => sum + s.total_slots, 0);
                    return (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-xs text-muted-foreground pb-1 border-b">
                          <span>{totalSlots} tee slot{totalSlots !== 1 ? "s" : ""} across {dates.length} day{dates.length !== 1 ? "s" : ""}</span>
                          <span className="font-medium text-[#1a5c38]">{totalSpots} total spots</span>
                        </div>
                        {dates.map((date, idx) => {
                          const slots = slotsByDate[date];
                          const daySpots = slots.reduce((sum, s) => sum + s.total_slots, 0);
                          return (
                            <div key={date} className="space-y-1">
                              <div className="flex items-center gap-2">
                                {dates.length > 1 && (
                                  <span className="text-[10px] font-bold text-white bg-[#1a5c38] rounded px-1.5 py-0.5">Day {idx + 1}</span>
                                )}
                                <span className="text-sm font-semibold">{fmtDate(date)}</span>
                                <span className="text-xs text-muted-foreground ml-auto">{slots.length} slots · {daySpots} spots</span>
                              </div>
                              <Card className="border bg-card">
                                <CardContent className="p-2">
                                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                                    {slots.map(slot => (
                                      <div key={slot.id} className="flex items-center gap-2 py-1 px-1.5 rounded hover:bg-muted">
                                        <span className="text-sm font-medium tabular-nums">{String(slot.time).slice(0,5)}</span>
                                        <span className="text-xs text-muted-foreground">{slot.total_slots} players</span>
                                        {!slot.active && <span className="text-[10px] text-amber-600 bg-amber-50 px-1 py-0.5 rounded ml-auto">inactive</span>}
                                      </div>
                                    ))}
                                  </div>
                                </CardContent>
                              </Card>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </TabsContent>

                {/* DIVISIONS TAB */}
                <TabsContent value="divisions" className="pb-8">
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">Divisions are auto-assigned from the golfer's HNA handicap at time of registration.</p>
                    {(() => {
                      const divList = (detail.divisions && detail.divisions.length > 0) ? detail.divisions : DEFAULT_DIVISIONS;
                      return (
                        <>
                          {divList.map(d => {
                            const players = regs.filter(r => r.division === d.key);
                            return (
                              <Card key={d.key}>
                                <CardContent className="p-4">
                                  <div className="flex items-center justify-between mb-2">
                                    <div>
                                      <p className="font-semibold text-sm">{d.label}</p>
                                      <p className="text-xs text-muted-foreground mt-0.5">
                                        HCP {d.min_hcp} – {d.max_hcp} · {fmtFormat(d)} · {d.tees} tees
                                      </p>
                                    </div>
                                    <div className="text-right">
                                      <p className="text-lg font-bold text-[#1a5c38]">{players.filter(r => r.status === "approved").length}</p>
                                      <p className="text-xs text-muted-foreground">confirmed</p>
                                    </div>
                                  </div>
                                  {players.length === 0 ? (
                                    <p className="text-xs text-muted-foreground italic pt-1">No players in this division yet.</p>
                                  ) : (
                                    <div className="divide-y border-t mt-2">
                                      {players.map(r => (
                                        <div key={r.user_id} className="flex items-center justify-between py-1.5">
                                          <div>
                                            <p className="text-sm font-medium">{r.user_name}</p>
                                            <p className="text-xs text-muted-foreground">
                                              HCP {r.frozen_handicap ?? r.handicap ?? "—"}
                                              {r.phone ? ` · ${r.phone}` : ""}
                                            </p>
                                          </div>
                                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                            r.status === "approved"
                                              ? "bg-green-100 text-green-700"
                                              : r.status === "rejected"
                                              ? "bg-red-100 text-red-700"
                                              : "bg-yellow-100 text-yellow-700"
                                          }`}>{r.status}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </CardContent>
                              </Card>
                            );
                          })}
                        </>
                      );
                    })()}
                  </div>
                </TabsContent>

                {/* DRAW TAB */}
                <TabsContent value="draw" className="pb-8">
                  {/* Toolbar */}
                  <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
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
                      <span className="text-xs text-muted-foreground">{draw.length} player{draw.length !== 1 ? "s" : ""}</span>
                      {!drawLoading && draw.length > 0 && (
                        drawIsPublished ? (
                          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />Published
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 inline-block" />Unpublished
                          </span>
                        )
                      )}
                    </div>
                    <div className="flex gap-1.5 flex-wrap justify-end">
                      <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={handleAddAll} disabled={readOnly}><UserPlus className="h-3.5 w-3.5" />Add All</Button>
                      <Button size="sm" variant="outline" className="h-8 gap-1 text-xs border-amber-300 text-amber-700 hover:bg-amber-50" onClick={() => { setGenMode("random"); setGenAllRounds(false); setGenSeedRound(Math.max(1, drawRound - 1)); setGenDlg(true); }} disabled={readOnly}><Shuffle className="h-3.5 w-3.5" />Generate Draw</Button>
                      <Button size="sm" className="h-8 bg-[#1a5c38] hover:bg-[#164d30] text-xs" onClick={saveDraw} disabled={savingDraw || readOnly || draw.length === 0}>{savingDraw ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />Saving…</> : "Publish Draw"}</Button>
                    </div>
                  </div>

                  {/* Draw type label */}
                  {!drawLoading && draw.length > 0 && (() => {
                    const metric = draw.find(d => d.seed_metric)?.seed_metric ?? null;
                    const label = !metric ? "Random Draw"
                      : metric === "handicap" ? "Seeded Draw · Handicap"
                      : metric === "points"   ? "Seeded Draw · Stableford Points"
                      : metric === "gross"    ? "Seeded Draw · Gross Score"
                      :                        "Seeded Draw · Net Score";
                    return (
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5 mb-2">
                        <Shuffle className="h-3 w-3 opacity-60" />{label}
                      </p>
                    );
                  })()}

                  {/* Draw list — grouped by four-ball */}
                  {drawLoading ? <Skeleton className="h-32 w-full" /> : draw.length === 0 ? (
                    <div className="text-center py-10 space-y-3">
                      <Shuffle className="h-8 w-8 text-muted-foreground mx-auto opacity-40" />
                      <p className="text-sm text-muted-foreground">No draw yet for Round {drawRound}.</p>
                      <div className="flex gap-2 justify-center">
                        <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={handleAddAll} disabled={readOnly}><UserPlus className="h-3.5 w-3.5" />Add All Players</Button>
                        <Button size="sm" variant="outline" className="gap-1 text-xs border-amber-300 text-amber-700 hover:bg-amber-50" onClick={() => { setGenMode("random"); setGenAllRounds(false); setGenSeedRound(Math.max(1, drawRound - 1)); setGenDlg(true); }} disabled={readOnly}><Shuffle className="h-3.5 w-3.5" />Generate Draw</Button>
                      </div>
                    </div>
                  ) : (() => {
                    // Group entries by draw_group for four-ball display
                    const groups: Record<number, DrawEntry[]> = {};
                    for (const d of draw) { (groups[d.draw_group] ??= []).push(d); }
                    const groupKeys = Object.keys(groups).map(Number).sort((a, b) => a - b);
                    return (
                      <div className="space-y-2">
                        {groupKeys.map(gk => {
                          const grp = groups[gk]!;
                          const rep = grp[0]!;
                          return (
                            <Card key={gk} className="border-l-4 border-l-[#1a5c38]">
                              <CardContent className="p-3">
                                {/* Group header — tee time + starting hole editable for whole group */}
                                <div className="flex items-center gap-3 mb-2">
                                  <span className="text-xs font-bold text-[#1a5c38] w-16 shrink-0">Group {gk}</span>
                                  <div className="flex items-center gap-1.5">
                                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                                    <Input
                                      type="time"
                                      value={String(rep.tee_time).slice(0, 5)}
                                      className="h-7 w-28 text-xs font-mono"
                                      disabled={readOnly}
                                      onChange={e => setDraw(prev => prev.map(x =>
                                        x.draw_group === gk
                                          ? { ...x, tee_time: e.target.value, starting_tee: startingHoleFromSlots(detailTeeSlots, x.tee_date, e.target.value) }
                                          : x
                                      ))}
                                    />
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs text-muted-foreground whitespace-nowrap">Tee</span>
                                    <Input
                                      type="number" min="1" max="18"
                                      value={rep.starting_tee ?? 1}
                                      className="h-7 w-14 text-xs"
                                      disabled={readOnly}
                                      onChange={e => setDraw(prev => prev.map(x =>
                                        x.draw_group === gk ? { ...x, starting_tee: Number(e.target.value) } : x
                                      ))}
                                    />
                                  </div>
                                  <span className="text-xs text-muted-foreground ml-auto">{grp.length} player{grp.length !== 1 ? "s" : ""}</span>
                                </div>
                                {/* Players in this group */}
                                <div className="divide-y divide-gray-100">
                                  {grp.map((d) => {
                                    const globalIdx = draw.indexOf(d);
                                    return (
                                      <div key={d.id ?? d.user_id} className="flex items-center gap-2 py-1.5 text-sm">
                                        <span className="flex-1 font-medium">{d.user_name}</span>
                                        <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                                          {d.division ? `${d.division}` : "—"}
                                          {d.frozen_handicap != null ? ` · HCP ${d.frozen_handicap}` : ""}
                                          {d.seed_metric && d.seed_value != null && d.seed_metric !== "handicap" && (
                                            <span className="inline-flex items-center rounded px-1.5 py-0.5 bg-amber-50 border border-amber-200 text-amber-700 font-mono text-[10px] leading-none ml-1">
                                              {d.seed_metric === "points" ? `${d.seed_value} pts` : d.seed_metric === "gross" ? `${d.seed_value} gross` : `${d.seed_value} net`}
                                            </span>
                                          )}
                                        </span>
                                        {!readOnly && (
                                          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive flex-shrink-0"
                                            onClick={() => setDraw(prev => prev.filter((_, j) => j !== globalIdx))}>
                                            <XCircle className="h-3.5 w-3.5" />
                                          </Button>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    );
                  })()}

                  {/* Generate Draw dialog */}
                  <Dialog open={genDlg} onOpenChange={setGenDlg}>
                    <DialogContent className="max-w-md">
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-2"><Shuffle className="h-4 w-4 text-amber-600" />Generate Draw</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 pt-2">
                        {/* Mode toggle */}
                        <div>
                          <Label className="text-xs text-muted-foreground mb-2 block">Draw Type</Label>
                          <div className="flex gap-2">
                            <Button size="sm" variant={genMode === "random" ? "default" : "outline"}
                              className={genMode === "random" ? "bg-[#1a5c38] hover:bg-[#164d30] flex-1" : "flex-1"}
                              onClick={() => setGenMode("random")}>
                              <Shuffle className="h-3.5 w-3.5 mr-1.5" />Random Draw
                            </Button>
                            <Button size="sm" variant={genMode === "seeded" ? "default" : "outline"}
                              className={genMode === "seeded" ? "bg-[#1a5c38] hover:bg-[#164d30] flex-1" : "flex-1"}
                              onClick={() => { setGenMode("seeded"); if (drawRound <= 1) setGenMetric("handicap"); }}>
                              <Trophy className="h-3.5 w-3.5 mr-1.5" />Seeded Draw
                            </Button>
                          </div>
                        </div>

                        {/* Players per group */}
                        <div>
                          <Label className="text-xs text-muted-foreground mb-2 block">Players per Group</Label>
                          <div className="flex gap-2">
                            {[2, 3, 4].map(n => (
                              <Button key={n} size="sm" variant={genPerGroup === n ? "default" : "outline"}
                                className={genPerGroup === n ? "bg-[#1a5c38] hover:bg-[#164d30] flex-1" : "flex-1"}
                                onClick={() => setGenPerGroup(n)}>
                                {n}-Ball
                              </Button>
                            ))}
                          </div>
                        </div>

                        {/* Group by Division toggle */}
                        <div className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-gray-50">
                          <Switch checked={genGroupByDiv} onCheckedChange={setGenGroupByDiv} />
                          <div>
                            <p className="text-sm font-medium">Group by Division</p>
                            <p className="text-xs text-muted-foreground">Keep players from the same division together in groups.</p>
                          </div>
                        </div>

                        {/* Seeded options */}
                        {genMode === "seeded" && (
                          <>
                            <div>
                              <Label className="text-xs text-muted-foreground mb-1.5 block">Seed Metric <span className="text-[10px]">(best = last group)</span></Label>
                              <div className="flex gap-2 flex-wrap">
                                {([
                                  { value: "handicap", label: "Handicap" },
                                  { value: "points",   label: "Stableford Pts" },
                                  { value: "gross",    label: "Gross Score" },
                                  { value: "net",      label: "Nett Score" },
                                ] as const).map(({ value, label }) => (
                                  <Button key={value} size="sm"
                                    variant={genMetric === value ? "default" : "outline"}
                                    className={genMetric === value ? "bg-[#1a5c38] hover:bg-[#164d30] flex-1" : "flex-1"}
                                    onClick={() => setGenMetric(value)}>
                                    {label}
                                  </Button>
                                ))}
                              </div>
                              {genMetric === "handicap" && (
                                <p className="text-[11px] text-muted-foreground mt-1">Highest handicap (weakest) → first groups. Scratch/plus → last group.</p>
                              )}
                            </div>
                            {genMetric !== "handicap" && (
                              <div>
                                <Label className="text-xs text-muted-foreground mb-1.5 block">Use Scores from Round</Label>
                                <Select value={String(genSeedRound)} onValueChange={v => setGenSeedRound(Number(v))}>
                                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {Array.from({ length: Math.max(1, drawRound - 1) }, (_, i) => (
                                      <SelectItem key={i + 1} value={String(i + 1)}>Round {i + 1}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {drawRound <= 1 ? (
                                  <p className="text-[11px] text-amber-600 mt-1">No previous round scores yet — switch to Handicap or Random.</p>
                                ) : (
                                  <p className="text-[11px] text-muted-foreground mt-1">Players without a score are placed in the first groups.</p>
                                )}
                              </div>
                            )}
                          </>
                        )}

                        {/* All rounds option (random only, multi-round tournaments) */}
                        {genMode === "random" && (detail.rounds ?? 1) > 1 && (
                          <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
                            <Switch checked={genAllRounds} onCheckedChange={setGenAllRounds} />
                            <div>
                              <p className="text-sm font-medium">Randomize All {detail.rounds} Rounds</p>
                              <p className="text-xs text-muted-foreground">Generates and immediately publishes draws for every day before the tournament starts.</p>
                            </div>
                          </div>
                        )}

                        <div className="flex gap-2 pt-1">
                          <Button variant="outline" className="flex-1" onClick={() => setGenDlg(false)} disabled={generating}>Cancel</Button>
                          <Button
                            className="flex-1 bg-[#1a5c38] hover:bg-[#164d30]"
                            onClick={handleGenerateDraw}
                            disabled={generating || (genMode === "seeded" && genMetric !== "handicap" && drawRound <= 1)}>
                            {generating ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Generating…</> : genAllRounds ? `Generate & Publish All ${detail.rounds} Rounds` : "Generate"}
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
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
                      ) : (() => {
                        // Check if this event has any team scores submitted
                        const hasTeamScores = scores.some(s => s.team_id);
                        const hasIndividualScores = scores.some(s => !s.team_id);

                        if (hasTeamScores) {
                          // Group scores by team for team-format events
                          const teamMap = new Map<number, Score>();
                          scores.filter(s => s.team_id).forEach(s => {
                            if (!teamMap.has(s.team_id!)) teamMap.set(s.team_id!, s);
                          });
                          const teams = Array.from(teamMap.values());
                          return (
                            <>
                              <p className="text-xs text-muted-foreground mb-2">Team scores — one submission per partnership/group.</p>
                              <div className="grid grid-cols-5 gap-2 text-xs text-muted-foreground font-medium px-3 py-1.5 bg-muted/40 rounded-md">
                                <span className="col-span-2">Team</span>
                                <span className="text-center">Gross</span>
                                <span className="text-center">Nett</span>
                                <span className="text-center">Stableford Pts</span>
                              </div>
                              {teams.map(s => (
                                <Card key={s.team_id}>
                                  <CardContent className="p-2.5">
                                    <div className="grid grid-cols-5 gap-2 items-center text-sm">
                                      <div className="col-span-2">
                                        <p className="font-medium text-xs">{s.team_name ?? "Team"}</p>
                                        <p className="text-[11px] text-muted-foreground">{s.division ? `${s.division} Div` : "—"} {s.verified ? "· ✓ Verified" : "· Unverified"}</p>
                                      </div>
                                      {(["gross","net","points"] as const).map(field => (
                                        <Input
                                          key={field} type="number" min="0"
                                          className="h-7 text-xs text-center"
                                          placeholder="—"
                                          value={editScores[s.user_id]?.[field] ?? (s[field] != null ? String(s[field]) : "")}
                                          onChange={e => setEditScores(prev => ({
                                            ...prev,
                                            [s.user_id]: { ...(prev[s.user_id] ?? { gross: "", net: "", points: "" }), [field]: e.target.value },
                                          }))}
                                        />
                                      ))}
                                    </div>
                                  </CardContent>
                                </Card>
                              ))}
                              {/* Players without a team score */}
                              {regs.filter(r => r.status === "approved" && !scores.find(s => s.user_id === r.user_id && s.team_id)).length > 0 && (
                                <>
                                  <p className="text-xs text-amber-600 mt-3 mb-1">Players without a team score yet:</p>
                                  {regs.filter(r => r.status === "approved" && !scores.find(s => s.user_id === r.user_id && s.team_id)).map(r => (
                                    <Card key={r.user_id} className="border-amber-200">
                                      <CardContent className="p-2.5">
                                        <div className="grid grid-cols-5 gap-2 items-center text-sm">
                                          <div className="col-span-2">
                                            <p className="font-medium text-xs">{r.user_name}</p>
                                            <p className="text-[11px] text-muted-foreground">{r.division ? `${r.division} Div` : "—"} · No team</p>
                                          </div>
                                          {(["gross","net","points"] as const).map(field => (
                                            <Input key={field} type="number" min="0" className="h-7 text-xs text-center" placeholder="—"
                                              value={editScores[r.user_id]?.[field] ?? ""}
                                              onChange={e => setEditScores(prev => ({ ...prev, [r.user_id]: { ...(prev[r.user_id] ?? { gross: "", net: "", points: "" }), [field]: e.target.value } }))}
                                            />
                                          ))}
                                        </div>
                                      </CardContent>
                                    </Card>
                                  ))}
                                </>
                              )}
                            </>
                          );
                        }

                        // Individual scoring (default)
                        return (
                          <>
                            {/* DQ Dialog */}
                            {dqDialog && (
                              <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                                <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-sm p-5 space-y-4">
                                  <div>
                                    <h3 className="font-semibold text-base">Disqualify — {dqDialog.userName}</h3>
                                    <p className="text-xs text-muted-foreground mt-0.5">Round {scoreRound}. You can correct the score before disqualifying.</p>
                                  </div>
                                  <div className="grid grid-cols-3 gap-2">
                                    {([["Gross", dqGross, setDqGross], ["Nett", dqNet, setDqNet], ["Stableford Pts", dqPoints, setDqPoints]] as const).map(([label, val, setter]) => (
                                      <div key={label}>
                                        <Label className="text-[11px] text-muted-foreground">{label}</Label>
                                        <Input type="number" min="0" className="h-8 text-xs text-center mt-0.5" placeholder="—"
                                          value={val} onChange={e => (setter as any)(e.target.value)} />
                                      </div>
                                    ))}
                                  </div>
                                  <div>
                                    <Label className="text-[11px] text-muted-foreground">Reason (optional)</Label>
                                    <Input className="mt-0.5 text-xs h-8" placeholder="e.g. Incorrect scorecard, wrong ball…"
                                      value={dqReason} onChange={e => setDqReason(e.target.value)} />
                                  </div>
                                  <p className="text-[11px] text-amber-600 bg-amber-50 rounded p-2">The player will be notified immediately and removed from the leaderboard standings.</p>
                                  <div className="flex gap-2">
                                    <Button variant="outline" size="sm" className="flex-1" onClick={() => setDqDialog(null)}>Cancel</Button>
                                    <Button size="sm" className="flex-1 bg-red-600 hover:bg-red-700 text-white" onClick={confirmDq} disabled={dqSaving}>
                                      {dqSaving ? "Saving…" : "Confirm DQ"}
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            )}

                            <div className="grid grid-cols-6 gap-2 text-xs text-muted-foreground font-medium px-3 py-1.5 bg-muted/40 rounded-md">
                              <span className="col-span-2">Player</span>
                              <span className="text-center">Gross</span>
                              <span className="text-center">Nett</span>
                              <span className="text-center">Stableford Pts</span>
                              <span></span>
                            </div>
                            {regs.filter(r => r.status === "approved").map(r => {
                              const submitted = scores.find(s => s.user_id === r.user_id && s.round === scoreRound);
                              const isDQ = submitted?.dq;
                              return (
                                <Card key={r.user_id} className={isDQ ? "border-red-300 bg-red-50/30" : ""}>
                                  <CardContent className="p-2.5">
                                    <div className="grid grid-cols-6 gap-2 items-center text-sm">
                                      <div className="col-span-2">
                                        <div className="flex items-center gap-1.5">
                                          <p className="font-medium text-xs">{r.user_name}</p>
                                          {isDQ && <span className="text-[10px] font-bold text-red-600 bg-red-100 px-1 py-0.5 rounded">DQ</span>}
                                        </div>
                                        <p className="text-[11px] text-muted-foreground">
                                          {r.division ? `${r.division} Div` : "—"}
                                          {submitted && !isDQ ? (submitted.verified ? " · ✓ Verified" : " · Submitted") : ""}
                                          {isDQ && submitted?.dq_reason ? ` · ${submitted.dq_reason}` : ""}
                                        </p>
                                        {isDQ && submitted?.original_gross != null && (
                                          <p className="text-[10px] text-muted-foreground">Was: {submitted.original_gross}{submitted.original_net != null ? ` / ${submitted.original_net}` : ""}{submitted.original_points != null ? ` / ${submitted.original_points}pts` : ""}</p>
                                        )}
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
                                      <Button size="sm" variant="ghost"
                                        className="h-7 w-7 p-0 text-red-500 hover:bg-red-50 hover:text-red-700"
                                        title="Disqualify player"
                                        disabled={readOnly}
                                        onClick={() => openDqDialog(r.user_id, r.user_name)}>
                                        <span className="text-xs font-bold">DQ</span>
                                      </Button>
                                    </div>
                                  </CardContent>
                                </Card>
                              );
                            })}
                          </>
                        );
                      })()}
                    </div>
                  )}
                </TabsContent>

                {/* INVITES TAB — invitation_only events only */}
                {detail.restriction === "invitation_only" && (
                  <TabsContent value="invites" className="pb-8">
                    <div className="space-y-4">
                      <p className="text-xs text-muted-foreground">
                        Only users on this list can register. On publish, each invited user receives a push notification.
                      </p>

                      {/* Search */}
                      {!readOnly && (
                        <div className="space-y-2">
                          <div className="flex gap-2">
                            <Input
                              placeholder="Search by name or email…"
                              value={inviteQuery}
                              onChange={e => {
                                setInviteQuery(e.target.value);
                                searchInviteUsers(e.target.value);
                              }}
                              className="h-8 text-sm"
                            />
                          </div>
                          {inviteSearching && (
                            <p className="text-xs text-muted-foreground pl-1">Searching…</p>
                          )}
                          {inviteResults.length > 0 && (
                            <Card className="border shadow-sm">
                              <CardContent className="p-2 space-y-1">
                                {inviteResults.map(u => {
                                  const alreadyInvited = invites.some(i => i.user_id === u.id);
                                  return (
                                    <div key={u.id} className="flex items-center justify-between gap-2 py-1 px-1.5 rounded hover:bg-muted">
                                      <div className="min-w-0">
                                        <p className="text-sm font-medium truncate">{u.name}</p>
                                        <p className="text-xs text-muted-foreground truncate">{u.email}{u.handicap_index != null ? ` · HCP ${u.handicap_index}` : ""}</p>
                                      </div>
                                      <Button
                                        size="sm" className="h-7 text-xs flex-shrink-0 bg-[#1a5c38] hover:bg-[#164d30] gap-1"
                                        disabled={alreadyInvited || inviteAdding === u.id}
                                        onClick={() => addInvite(u.id)}
                                      >
                                        {alreadyInvited ? <><Check className="h-3 w-3" />Added</> : inviteAdding === u.id ? "Adding…" : <><Plus className="h-3 w-3" />Invite</>}
                                      </Button>
                                    </div>
                                  );
                                })}
                              </CardContent>
                            </Card>
                          )}
                        </div>
                      )}

                      {/* Current invite list */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium">Invite List ({invites.length})</p>
                        </div>
                        {invitesLoading ? (
                          <Skeleton className="h-24 w-full" />
                        ) : invites.length === 0 ? (
                          <p className="text-sm text-muted-foreground py-6 text-center">No invites yet. Search above to add golfers.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {invites.map(inv => (
                              <Card key={inv.user_id}>
                                <CardContent className="p-3">
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium truncate">{inv.name}</p>
                                      <p className="text-xs text-muted-foreground truncate">{inv.email}{inv.handicap_index != null ? ` · HCP ${inv.handicap_index}` : ""}</p>
                                    </div>
                                    {!readOnly && (
                                      <Button
                                        variant="ghost" size="icon" className="h-7 w-7 text-destructive flex-shrink-0"
                                        disabled={inviteRemoving === inv.user_id}
                                        onClick={() => removeInvite(inv.user_id)}
                                        title="Remove invite"
                                      >
                                        <X className="h-3.5 w-3.5" />
                                      </Button>
                                    )}
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </TabsContent>
                )}
              </Tabs>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Create / Edit Dialog ───────────────────────────────────────────────── */}
      <Dialog open={dlgOpen} onOpenChange={setDlgOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? "Edit" : "New"} Tournament</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">

            {/* ── Templates ────────────────────────────────────────────────── */}
            <div className="rounded-xl border border-[#1a5c38]/25 bg-[#1a5c38]/5 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BookmarkPlus className="h-4 w-4 text-[#1a5c38]" />
                  <span className="text-sm font-semibold text-[#1a5c38]">Templates</span>
                  {teeConfigSnapshot && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[#1a5c38]/15 text-[#1a5c38]">tee config captured</span>
                  )}
                </div>
                {!readOnly && !showTplSave && (
                  <Button size="sm" variant="outline"
                    className="h-6 px-2 text-xs border-[#1a5c38]/40 text-[#1a5c38] hover:bg-[#1a5c38]/10"
                    onClick={() => setShowTplSave(true)}>
                    <BookmarkPlus className="h-3 w-3 mr-1" />Save as Template
                  </Button>
                )}
              </div>

              {showTplSave && (
                <form className="flex gap-2" onSubmit={handleSaveTemplate}>
                  <Input
                    className="h-7 text-xs flex-1"
                    placeholder="Template name e.g. Club Championship Setup…"
                    value={tplSaveName}
                    onChange={e => setTplSaveName(e.target.value)}
                    autoFocus
                  />
                  <Button type="submit" size="sm" className="h-7 px-3 text-xs bg-[#1a5c38] hover:bg-[#164d30]" disabled={savingTpl}>
                    {savingTpl ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0"
                    onClick={() => { setShowTplSave(false); setTplSaveName(""); }}>
                    <X className="h-3 w-3" />
                  </Button>
                </form>
              )}

              {templatesLoading ? (
                <p className="text-xs text-muted-foreground italic">Loading templates…</p>
              ) : templates.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No templates yet — configure below and save for quick reuse.</p>
              ) : (
                <div className="space-y-1.5">
                  {templates.map(tpl => (
                    <div key={tpl.id} className="flex items-center gap-2 bg-white rounded-lg border border-gray-200 px-3 py-1.5">
                      {tpl.template_data?.tee_config && (
                        <span className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700" title="Includes tee schedule config">tee</span>
                      )}
                      {renamingTplId === tpl.id ? (
                        <form className="flex items-center gap-1.5 flex-1 min-w-0" onSubmit={e => { e.preventDefault(); handleRenameTpl(tpl.id); }}>
                          <Input className="h-6 text-xs flex-1 min-w-0" value={renameTplVal}
                            onChange={e => setRenameTplVal(e.target.value)} autoFocus onBlur={() => setRenamingTplId(null)} />
                          <Button type="submit" size="sm" className="h-6 px-2 text-xs bg-[#1a5c38] hover:bg-[#164d30]">Save</Button>
                        </form>
                      ) : (
                        <>
                          <span
                            className="flex-1 text-sm font-medium truncate cursor-pointer hover:text-[#1a5c38]"
                            title="Double-click to rename"
                            onDoubleClick={() => { setRenamingTplId(tpl.id); setRenameTplVal(tpl.name); }}>
                            {tpl.name}
                          </span>
                          <Button size="sm" variant="outline"
                            className="h-6 px-2 text-xs flex-shrink-0 border-[#1a5c38]/30 text-[#1a5c38] hover:bg-[#1a5c38]/10"
                            onClick={() => handleLoadTemplate(tpl)}>Load</Button>
                          <Button size="sm" variant="ghost"
                            className="h-6 w-6 p-0 flex-shrink-0 text-destructive/50 hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleDeleteTemplate(tpl.id, tpl.name)}>
                            <X className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Basic info */}
            <div className="space-y-1.5">
              <Label>Tournament Name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Club Championship 2026" />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <textarea
                ref={descRef}
                className="w-full border rounded-md px-3 py-2 text-sm min-h-[100px] bg-background resize-none overflow-hidden"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                onInput={e => { const t = e.currentTarget; t.style.height = "auto"; t.style.height = t.scrollHeight + "px"; }}
                placeholder="Tournament details, rules, conditions…"
              />
            </div>

            {/* Tournament image */}
            <div className="space-y-1.5">
              <Label>Tournament Image <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
              <input ref={imgInputRef} type="file" accept="image/*" className="hidden" onChange={handleImgSelect} />
              {form.image_url ? (
                <div className="relative w-full h-40 rounded-lg overflow-hidden border">
                  <img src={form.image_url} alt="Tournament" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white rounded-full p-1"
                    onClick={() => setForm(f => ({ ...f, image_url: "" }))}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="w-full h-32 rounded-lg border-2 border-dashed border-border hover:border-[#1a5c38]/50 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-[#1a5c38] transition-colors"
                  onClick={() => imgInputRef.current?.click()}
                  disabled={imgUploading}
                >
                  {imgUploading
                    ? <span className="text-xs">Uploading…</span>
                    : (<><ImageIcon className="h-6 w-6" /><span className="text-xs">Click to upload tournament image</span></>)
                  }
                </button>
              )}
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
              <div className="space-y-1.5">
                <Label>Holes</Label>
                <div className="flex gap-2">
                  {([9, 18] as const).map(h => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, holes: h }))}
                      className={`flex-1 py-2 rounded-md border text-sm font-semibold transition-colors ${
                        form.holes === h
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-foreground border-border hover:border-primary/50"
                      }`}
                    >
                      {h} holes
                    </button>
                  ))}
                </div>
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
              const getDatesInRange = (start: string, end?: string): string[] => {
                const dates: string[] = [];
                const [sy, sm, sd] = start.split("-").map(Number);
                if (!sy || !sm || !sd) return [start];
                const [ey, em, ed] = (end || start).split("-").map(Number);
                const cur = new Date(Date.UTC(sy, sm - 1, sd));
                const last = new Date(Date.UTC(ey || sy, (em || sm) - 1, ed || sd));
                const cap = new Date(Date.UTC(sy, sm - 1, sd));
                cap.setUTCDate(cap.getUTCDate() + 30);
                while (cur <= last && cur <= cap) {
                  dates.push(cur.toISOString().split("T")[0]);
                  cur.setUTCDate(cur.getUTCDate() + 1);
                }
                return dates;
              };

              const tournamentDates = getDatesInRange(form.event_date, form.end_date || undefined);
              const isMultiDay = tournamentDates.length > 1;

              const slotsByDate = eventSlots.reduce((acc, s) => {
                const key = String(s.date).slice(0, 10);
                (acc[key] ||= []).push(s);
                return acc;
              }, {} as Record<string, TeeSlot[]>);

              const totalSpots = eventSlots.reduce((sum, s) => sum + s.total_slots, 0);

              return (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />Tee Schedule
                        {isMultiDay && <span className="text-xs font-normal text-muted-foreground">({tournamentDates.length} days)</span>}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        These tee slots are exclusive to this tournament.
                      </p>
                    </div>
                    {eventSlots.length > 0 && (
                      <span className="text-xs font-medium text-[#1a5c38] bg-[#1a5c38]/10 px-2 py-1 rounded-full whitespace-nowrap">
                        {eventSlots.length} slot{eventSlots.length !== 1 ? "s" : ""} · {totalSpots} spots
                      </span>
                    )}
                  </div>

                  {/* Existing-slots import banner */}
                  {!editId && !importBannerDismissed && (checkingExistingSlots || existingGeneralSlots.length > 0) && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 flex items-start gap-2.5">
                      <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        {checkingExistingSlots ? (
                          <p className="text-xs text-amber-700 flex items-center gap-1.5">
                            <Loader2 className="h-3 w-3 animate-spin" />Checking for existing tee slots on this date…
                          </p>
                        ) : (
                          <>
                            <p className="text-xs font-semibold text-amber-800">
                              {existingGeneralSlots.length} existing tee slot{existingGeneralSlots.length !== 1 ? "s" : ""} found across{" "}
                              {[...new Set(existingGeneralSlots.map(s => s.date))].length} date{[...new Set(existingGeneralSlots.map(s => s.date))].length !== 1 ? "s" : ""}
                            </p>
                            <p className="text-xs text-amber-700 mt-0.5">
                              These are public tee slots already on the schedule. Import them as this tournament's exclusive tee times, or leave them as-is.
                            </p>
                            <div className="flex gap-2 mt-2">
                              <Button
                                type="button"
                                size="sm"
                                className="h-6 px-2.5 text-xs bg-amber-600 hover:bg-amber-700 text-white"
                                onClick={handleImportExistingSlots}
                              >
                                Import as tournament tee times
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-xs text-amber-700 hover:bg-amber-100"
                                onClick={() => setImportBannerDismissed(true)}
                              >
                                Leave as public slots
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}

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
                        return (
                          <Card key={date} className="border bg-card">
                            <CardContent className="p-3 space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  {isMultiDay && (
                                    <span className="text-[10px] font-bold text-white bg-[#1a5c38] rounded px-1.5 py-0.5 shrink-0">
                                      Day {idx + 1}
                                    </span>
                                  )}
                                  <span className="text-sm font-semibold">{fmtDate(date)}</span>
                                  <span className="text-[10px] text-muted-foreground">{daySlots.length} slot{daySlots.length !== 1 ? "s" : ""}</span>
                                </div>
                                <button
                                  type="button"
                                  className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                                  onClick={() => { setGenDialogDate(date); setGenDialogOpen(true); }}
                                >
                                  <Plus className="h-3 w-3" />Generate
                                </button>
                              </div>


                              {daySlots.length === 0 ? (
                                <p className="text-[11px] text-amber-600 py-1">
                                  No tee times yet — click Generate to build a schedule for this day.
                                </p>
                              ) : (
                                <div className="space-y-0.5 max-h-48 overflow-y-auto">
                                  {daySlots.map(slot => {
                                    const isEditing = editingSlotId === slot.id;
                                    if (isEditing) {
                                      return (
                                        <div key={slot.id} className="flex items-center gap-2 py-1.5 px-2 rounded-md bg-muted/60 border border-dashed">
                                          <Input
                                            type="time"
                                            className="h-6 text-xs w-24 shrink-0"
                                            value={editSlotTime}
                                            onChange={e => setEditSlotTime(e.target.value)}
                                            autoFocus
                                          />
                                          <Input
                                            type="number" min={1} max={4}
                                            className="h-6 text-xs w-12 shrink-0"
                                            value={editSlotPlayers}
                                            onChange={e => setEditSlotPlayers(Number(e.target.value))}
                                          />
                                          <span className="text-xs text-muted-foreground shrink-0">players</span>
                                          <button
                                            type="button"
                                            disabled={slotSaving}
                                            className="ml-auto h-5 w-5 rounded flex items-center justify-center text-white bg-[#1a5c38] hover:bg-[#164d30] disabled:opacity-50"
                                            onClick={() => handleSlotUpdate(slot)}
                                          ><Check className="h-3 w-3" /></button>
                                          <button
                                            type="button"
                                            className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground"
                                            onClick={() => setEditingSlotId(null)}
                                          ><X className="h-3 w-3" /></button>
                                        </div>
                                      );
                                    }
                                    return (
                                      <div key={slot.id} className="flex items-center gap-2.5 py-1.5 px-2 rounded-md hover:bg-muted group">
                                        <span className="text-sm font-medium tabular-nums">{String(slot.time).slice(0, 5)}</span>
                                        <span className="text-xs text-muted-foreground">{slot.total_slots} players</span>
                                        {slot.id < 0 && <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">new</span>}
                                        {!slot.active && slot.id > 0 && <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">inactive</span>}
                                        <button
                                          type="button"
                                          className="ml-auto h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity"
                                          onClick={() => { setEditingSlotId(slot.id); setEditSlotTime(String(slot.time).slice(0, 5)); setEditSlotPlayers(slot.total_slots); }}
                                          title="Edit slot"
                                        ><Pencil className="h-3 w-3" /></button>
                                        <button
                                          type="button"
                                          className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                                          onClick={() => {
                                            if (slot.id > 0) setDeletedSlotIds(prev => [...prev, slot.id]);
                                            setEventSlots(prev => prev.filter(s => s.id !== slot.id));
                                          }}
                                          title="Remove slot"
                                        ><X className="h-3 w-3" /></button>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  )}

                  {!editId && (
                    <p className="text-[11px] text-muted-foreground">
                      After saving, use the Generate button on each day to quickly build a full tee schedule.
                    </p>
                  )}
                </div>
              );
            })() : (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />Set a start date to configure the tee schedule.
              </p>
            )}

            {/* Format selectors */}
            <div className="grid grid-cols-2 gap-3">
              {/* Format 1 */}
              <div className="space-y-1.5">
                <Label>Format 1</Label>
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

              {/* Format 2 — optional */}
              <div className="space-y-1.5">
                <Label>Format 2 <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
                <Select value={form.format2 || "none"} onValueChange={v => setForm(f => ({ ...f, format2: v === "none" ? "" : v, format2_custom: v !== "other" ? "" : f.format2_custom }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-80">
                    <SelectItem value="none">— No second format —</SelectItem>
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
                {form.format2 === "other" && (
                  <Input
                    placeholder="Describe the format…"
                    value={form.format2_custom}
                    onChange={e => setForm(f => ({ ...f, format2_custom: e.target.value }))}
                  />
                )}
              </div>
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
              <div className={`space-y-1.5 transition-opacity ${!form.entries_required ? "opacity-40 pointer-events-none" : ""}`}>
                <Label>Entries Open</Label>
                <Input type="date" value={form.entries_open} disabled={!form.entries_required}
                  onChange={e => setForm(f => ({ ...f, entries_open: e.target.value }))} />
              </div>
              <div className={`space-y-1.5 transition-opacity ${!form.entries_required ? "opacity-40 pointer-events-none" : ""}`}>
                <Label>Entries Close</Label>
                <Input type="date" value={form.entries_close} disabled={!form.entries_required}
                  onChange={e => setForm(f => ({ ...f, entries_close: e.target.value }))} />
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
                  {eventSlots.length > 0
                    ? `${eventSlots.reduce((sum, s) => sum + s.total_slots, 0)} spots (${eventSlots.length} tee slot${eventSlots.length !== 1 ? "s" : ""})`
                    : "Auto-calculated from tee schedule"}
                </div>
              </div>
            </div>

            {/* ── Additional Fees ──────────────────────────────────────────────────── */}
            {form.payment_required && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-semibold">Additional Fees</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Charged on top of greens fee / entry fee. Each golfer pays these.</p>
                  </div>
                  <Button
                    type="button" variant="outline" size="sm"
                    onClick={() => setForm(f => ({ ...f, additional_fees: [...(f.additional_fees ?? []), { name: "", amount: 0 }] }))}
                  >
                    + Add Fee
                  </Button>
                </div>

                {/* Quick-add presets */}
                {(form.additional_fees ?? []).length === 0 && (
                  <div className="flex flex-wrap gap-2">
                    {["Competition Fee", "Two-Club Fee", "Longest Drive Fee", "Nearest the Pin Fee", "Hole-in-One Pool"].map(preset => (
                      <button
                        key={preset} type="button"
                        onClick={() => setForm(f => ({ ...f, additional_fees: [...(f.additional_fees ?? []), { name: preset, amount: 0 }] }))}
                        className="px-3 py-1.5 rounded-full border text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                      >
                        + {preset}
                      </button>
                    ))}
                  </div>
                )}

                {(form.additional_fees ?? []).map((fee, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      className="flex-1"
                      placeholder="Fee name (e.g. Competition Fee)"
                      value={fee.name}
                      onChange={e => setForm(f => {
                        const fees = [...(f.additional_fees ?? [])];
                        fees[idx] = { ...fees[idx], name: e.target.value };
                        return { ...f, additional_fees: fees };
                      })}
                    />
                    <div className="relative w-32">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R</span>
                      <Input
                        type="number" min="0" step="0.01"
                        className="pl-7"
                        placeholder="0.00"
                        value={fee.amount || ""}
                        onChange={e => setForm(f => {
                          const fees = [...(f.additional_fees ?? [])];
                          fees[idx] = { ...fees[idx], amount: parseFloat(e.target.value) || 0 };
                          return { ...f, additional_fees: fees };
                        })}
                      />
                    </div>
                    <Button
                      type="button" variant="ghost" size="icon"
                      className="text-muted-foreground hover:text-destructive flex-shrink-0"
                      onClick={() => setForm(f => ({ ...f, additional_fees: (f.additional_fees ?? []).filter((_, i) => i !== idx) }))}
                    >
                      ×
                    </Button>
                  </div>
                ))}

                {(form.additional_fees ?? []).length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Total additional: R{(form.additional_fees ?? []).reduce((s, f) => s + (f.amount || 0), 0).toFixed(2)} per golfer
                  </p>
                )}
              </div>
            )}

            {/* Toggles */}
            <Card className="bg-muted/30">
              <CardContent className="p-4 space-y-3">
                {[
                  { key: "entries_required", label: "Entries required (ballot if oversubscribed)", desc: "Golfers must formally enter — entries open/close dates apply, and a ballot is used if the field is full. When off, a normal tee time booking is all that's needed." },
                  { key: "payment_required", label: "Payment required", desc: "Golfers must pay before their spot is confirmed" },
                  { key: "scoring_enabled",  label: "Live scoring",     desc: "Enable score submission and leaderboard in the mobile app" },
                ].map(opt => (
                  <div key={opt.key} className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">{opt.label}</p>
                      <p className="text-xs text-muted-foreground">{opt.desc}</p>
                    </div>
                    <Switch
                      checked={!!(form as any)[opt.key]}
                      onCheckedChange={v => {
                        setForm(f => ({
                          ...f,
                          [opt.key]: v,
                          // ballot always mirrors entries_required
                          ...(opt.key === "entries_required" ? { ballot: v } : {}),
                        }));
                      }}
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
              <div className="flex items-center justify-between">
                <Label>Divisions (auto-assigned from HNA handicap)</Label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{form.use_divisions ? "Enabled" : "Disabled"}</span>
                  <Switch checked={form.use_divisions} onCheckedChange={v => setForm(f => ({ ...f, use_divisions: v }))} />
                </div>
              </div>
              {!form.use_divisions && (
                <p className="text-xs text-muted-foreground">Divisions are disabled — all golfers compete in a single field.</p>
              )}
              {form.use_divisions && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-medium">
                    <span className="w-20 shrink-0">Division</span>
                    <span style={{ width: 70 }} className="shrink-0">WHS Index From</span>
                    <span className="shrink-0 invisible">–</span>
                    <span style={{ width: 70 }} className="shrink-0">WHS Index To</span>
                    <span style={{ width: 340 }} className="shrink-0">Format</span>
                    <span className="flex-1 min-w-0">Tees</span>
                  </div>
                  {form.divisions.map((d, i) => (
                    <div key={d.key} className="flex items-center gap-2 text-xs">
                      <span className="font-medium w-20 shrink-0">{d.label}</span>
                      <Input type="number" className="h-7 text-xs shrink-0" style={{ width: 70 }} value={d.min_hcp}
                        onChange={e => setForm(f => ({ ...f, divisions: f.divisions.map((x, j) => j === i ? { ...x, min_hcp: Number(e.target.value) } : x) }))} />
                      <span className="text-muted-foreground shrink-0">–</span>
                      <Input type="number" className="h-7 text-xs shrink-0" style={{ width: 70 }} value={d.max_hcp}
                        onChange={e => setForm(f => ({ ...f, divisions: f.divisions.map((x, j) => j === i ? { ...x, max_hcp: Number(e.target.value) } : x) }))} />
                      <Select value={d.format} onValueChange={v => setForm(f => ({ ...f, divisions: f.divisions.map((x, j) => j === i ? { ...x, format: v } : x) }))}>
                        <SelectTrigger className="h-7 text-xs shrink-0" style={{ width: 340 }}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(FORMAT_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Input className="h-7 text-xs flex-1 min-w-0" placeholder="club" value={d.tees}
                        onChange={e => setForm(f => ({ ...f, divisions: f.divisions.map((x, j) => j === i ? { ...x, tees: e.target.value } : x) }))} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Button className="w-full bg-[#1a5c38] hover:bg-[#164d30]" onClick={handleSave} disabled={saving || readOnly}>
              {saving ? "Saving…" : editId ? "Update Tournament" : "Create Tournament"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Tee schedule generation dialog — works for both new and existing events */}
      <GenerateTeeTimesDialog
        open={genDialogOpen}
        onOpenChange={setGenDialogOpen}
        initialDate={genDialogDate}
        eventId={editId ?? undefined}
        initialConfig={pendingTeeConfig}
        onConfigSnapshot={cfg => setTeeConfigSnapshot(cfg)}
        onComplete={() => { if (editId) loadEventSlots(editId); }}
        onStagedSlots={!editId ? (slots) => {
          const newDates = new Set(slots.map(s => s.date));
          setEventSlots(prev => [
            ...prev.filter(s => !newDates.has(String(s.date).slice(0, 10))),
            ...slots.map(s => {
              const id = tempSlotCounter.current--;
              return { id, date: s.date, time: s.time, total_slots: s.total_slots, active: true };
            }),
          ]);
        } : undefined}
      />

      {/* ── Cancel Tournament Dialog ──────────────────────────────────────────── */}
      <Dialog open={cancelDlg.open} onOpenChange={o => { if (!o && !cancelDlg.cancelling) setCancelDlg(prev => ({ ...prev, open: false })); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <XCircle className="h-5 w-5" />
              Cancel Tournament
            </DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{cancelDlg.eventName}</span> will be cancelled and all registered golfers will be notified. Their draw slots will be cleared.
          </p>

          <p className="text-sm font-medium">What should happen to the scheduled tee times?</p>

          <div className="space-y-2">
            {/* Option: Keep as open tee times */}
            <button
              type="button"
              onClick={() => setCancelSlotsChoice("open")}
              className={`w-full text-left rounded-lg border p-3 transition-colors ${cancelSlotsChoice === "open" ? "border-[#1a5c38] bg-[#1a5c38]/5 ring-1 ring-[#1a5c38]" : "border-border hover:border-muted-foreground/50"}`}
            >
              <div className="flex items-start gap-2.5">
                <div className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center ${cancelSlotsChoice === "open" ? "border-[#1a5c38]" : "border-muted-foreground/40"}`}>
                  {cancelSlotsChoice === "open" && <div className="h-2 w-2 rounded-full bg-[#1a5c38]" />}
                </div>
                <div>
                  <p className="text-sm font-medium">Keep as open tee times</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Tee slots stay on the schedule as regular public slots — golfers can still book them.</p>
                </div>
              </div>
            </button>

            {/* Option: Delete tee times */}
            <button
              type="button"
              onClick={() => setCancelSlotsChoice("delete")}
              className={`w-full text-left rounded-lg border p-3 transition-colors ${cancelSlotsChoice === "delete" ? "border-red-500 bg-red-50 ring-1 ring-red-500" : "border-border hover:border-muted-foreground/50"}`}
            >
              <div className="flex items-start gap-2.5">
                <div className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center ${cancelSlotsChoice === "delete" ? "border-red-500" : "border-muted-foreground/40"}`}>
                  {cancelSlotsChoice === "delete" && <div className="h-2 w-2 rounded-full bg-red-500" />}
                </div>
                <div>
                  <p className="text-sm font-medium">Delete tee times</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Remove all tee slots from the schedule entirely — no bookings will be possible for these times.</p>
                </div>
              </div>
            </button>
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              className="flex-1"
              disabled={cancelDlg.cancelling}
              onClick={() => setCancelDlg(prev => ({ ...prev, open: false }))}
            >
              Go Back
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={cancelDlg.cancelling}
              onClick={executeCancelTournament}
            >
              {cancelDlg.cancelling ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Cancelling…</> : "Cancel Tournament"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Conflict Resolution Dialog ──────────────────────────────────────── */}
      <Dialog open={conflictDialog.open} onOpenChange={o => { if (!o && !conflictDialog.resolving) setConflictDialog(prev => ({ ...prev, open: false })); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="h-5 w-5" />
              Scheduling Conflicts Detected
            </DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">
            This tournament's dates overlap with the following existing items. You must resolve all
            conflicts before publishing. Affected golfers will be notified automatically.
          </p>

          {/* Conflicting regular bookings */}
          {conflictDialog.bookings.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
              <p className="text-sm font-semibold text-amber-800 flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                {conflictDialog.bookings.length} Regular Booking{conflictDialog.bookings.length !== 1 ? "s" : ""} Will Be Cancelled
              </p>
              <div className="max-h-36 overflow-y-auto space-y-1">
                {conflictDialog.bookings.map(b => (
                  <div key={b.id} className="flex items-center justify-between text-xs bg-white rounded px-2 py-1 border border-amber-100">
                    <span className="font-medium truncate max-w-[140px]">{b.user_name}</span>
                    <span className="text-muted-foreground">{fmtDate(b.tee_date)} · {b.tee_time}</span>
                    <span className="text-muted-foreground">{b.players} {b.players === 1 ? "player" : "players"}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-amber-700">
                These bookings will be cancelled and each golfer will receive a notification.
              </p>
            </div>
          )}

          {/* Conflicting other tournaments */}
          {conflictDialog.events.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-2">
              <p className="text-sm font-semibold text-red-800 flex items-center gap-1.5">
                <Trophy className="h-4 w-4" />
                {conflictDialog.events.length} Tournament{conflictDialog.events.length !== 1 ? "s" : ""} Will Be Cancelled
              </p>
              <div className="max-h-36 overflow-y-auto space-y-1">
                {conflictDialog.events.map(ev => (
                  <div key={ev.id} className="flex items-center justify-between text-xs bg-white rounded px-2 py-1 border border-red-100">
                    <span className="font-medium truncate max-w-[160px]">{ev.name}</span>
                    <span className="text-muted-foreground">
                      {fmtDate(ev.event_date)}{ev.end_date ? ` – ${fmtDate(ev.end_date)}` : ""}
                    </span>
                    <span className="text-muted-foreground">{ev.registrant_count} registered</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-red-700">
                These tournaments will be cancelled and all registrants will be notified.
              </p>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              className="flex-1"
              disabled={conflictDialog.resolving}
              onClick={() => setConflictDialog(prev => ({ ...prev, open: false }))}
            >
              Go Back
            </Button>
            <Button
              className="flex-1 bg-[#1a5c38] hover:bg-[#164d30]"
              disabled={conflictDialog.resolving}
              onClick={handleResolveAndPublish}
            >
              {conflictDialog.resolving ? "Resolving…" : "Resolve & Publish"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
