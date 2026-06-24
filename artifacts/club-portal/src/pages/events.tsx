import { Fragment, useEffect, useState, useCallback, useRef } from "react";
import { useSearch } from "wouter";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useReadOnly } from "@/context/ReadOnlyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Plus, Pencil, Trash2, Calendar, Users, Trophy, ChevronRight, Check,
  CheckCircle, XCircle, Clock, CreditCard, ListOrdered, BarChart2, Send, ImageIcon, X,
  AlertTriangle, BookmarkPlus, Loader2, Shuffle, UserPlus, Printer, Swords,
} from "lucide-react";
import { format } from "date-fns";
import { GenerateTeeTimesDialog } from "@/components/GenerateTeeTimesDialog";
import KnockoutPage from "@/pages/knockout";

// ─── Official DQ Rules ─────────────────────────────────────────────────────

const DQ_RULES: { category: string; rules: string[] }[] = [
  {
    category: "Misconduct & Sportsmanship",
    rules: [
      "Substance Use — consuming alcohol or banned substances during a competitive round",
      "Vandalism / Safety Risk — deliberate damage to the green, throwing clubs, or endangering others",
      "Cheating — deliberately ignoring a rule to gain an advantage, or agreeing to waive a rule",
      "Disruptive Behaviour — vulgar language, intentionally distracting competitors, or altering course setup without permission",
    ],
  },
  {
    category: "Scoring & Eligibility",
    rules: [
      "Handicap Manipulation — using an inaccurate or manipulated handicap index in a net-score event",
      "Incorrect Scorecard — scorecard returned with handicap too high, or hole score lower than actually taken",
      "Ineligible Entry — does not meet entry criteria or club affiliation requirements for this event",
    ],
  },
  {
    category: "Equipment & Transport",
    rules: [
      "Non-Conforming Club — stroke made with a club that does not meet official equipment specifications",
      "Non-Conforming Ball — ball played is not on the official list of approved conforming balls",
      "Unauthorised Transport — motorised cart used without prior written authorisation or medical dispensation",
    ],
  },
  {
    category: "Timeliness & Weather",
    rules: [
      "Late Start — failed to start at the scheduled tee time (more than 5 minutes late = automatic DQ)",
      "Ignoring Emergency Siren — failed to stop play immediately when suspension siren sounded",
      "Refused Official Test — refused to submit to a required administrative or wellness screening",
    ],
  },
];

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
  shotgun_start: number; shotgun_double_tee?: number; shotgun_par3_holes?: number[] | null;
  block_full_day: number;
  rounds: number; holes: number;
  additional_fees: { name: string; amount: number }[];
  total_registrations: number; approved_count: number; pending_count: number;
  club_name?: string | null;
}

interface Registration {
  id: number; user_id: number; user_name: string; user_email: string;
  handicap: number | null; frozen_handicap: number | null;
  division: string | null; status: string;
  payment_status: string; paid_at: string | null; registered_at: string;
  phone: string | null;
  team_id?: number | null; team_name?: string | null;
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
  const tst = match?.tee_start_type ?? slots[0]?.tee_start_type ?? "first_tee";
  if (tst === "tenth_tee") return 10;
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
interface ConflictTeeSlot {
  id: number; date: string; tee_time: string; booking_count: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const PAIR_FORMATS_FE = new Set([
  "betterball", "fourball", "fourball_gross_betterball", "fourball_net_betterball",
  "betterball_match_play", "fourball_stableford", "shamble", "best_ball_aggregate",
  "high_low", "daytona", "low_ball_total", "the_ghost", "betterball_bonus_bogey",
  "pinehurst_points", "chapman",
]);
const GROUP_FORMATS_FE = new Set(["american_scramble", "scramble", "alliance", "texas_scramble"]);
function isTeamFormatFE(f1: string, f2?: string | null) {
  return PAIR_FORMATS_FE.has(f1) || GROUP_FORMATS_FE.has(f1) || PAIR_FORMATS_FE.has(f2 ?? "") || GROUP_FORMATS_FE.has(f2 ?? "");
}
function isGroupFormatFE(f1: string, f2?: string | null) {
  return GROUP_FORMATS_FE.has(f1) || GROUP_FORMATS_FE.has(f2 ?? "");
}

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
  fourball_stableford: "Betterball Stableford (4BBB)",
  shamble: "Shamble",
  best_ball_aggregate: "Best Ball Aggregate",
  high_low: "High-Low",
  daytona: "Daytona (Las Vegas)",
  low_ball_total: "Low Ball / Total Score",
  the_ghost: "The Ghost",
  betterball_bonus_bogey: "Betterball Bonus Bogey",
  pinehurst_points: "Multiplication Betterball (Pinehurst)",
  chapman: "Greensomes (Chapman/Pinehurst)",
  texas_scramble: "Texas Scramble",
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
  ballot: false, scoring_enabled: true, payment_required: true, entries_required: false,
  use_tiered_pricing: false, allow_wallet: true, allow_prepaid: false, allow_voucher: false,
  shotgun_start: null as boolean | null,
  block_full_day: false,
  use_divisions: false,
  divisions: DEFAULT_DIVISIONS,
};

// ─── Main component ────────────────────────────────────────────────────────

export default function Events() {
  const { toast } = useToast();
  const readOnly  = useReadOnly();
  const search    = useSearch();

  const [events, setEvents]     = useState<GolfEvent[]>([]);
  const [loading, setLoading]   = useState(true);
  const [pageTab, setPageTab] = useState<"tournaments" | "knockout">("tournaments");
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
  const [regenWarnDlg, setRegenWarnDlg]   = useState(false);
  const [genMode, setGenMode]             = useState<"random"|"seeded">("random");
  const [genMetric, setGenMetric]         = useState<"gross"|"net"|"points"|"handicap">("points");
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
  const [dqNotes, setDqNotes]   = useState("");
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

  // Pairings tab (team events)
  const [pairings, setPairings] = useState<Array<{
    id: number; name: string | null;
    players: Array<{ user_id: number; user_name: string; reg_status: string }>;
  }>>([]);
  const [pairingsLoading, setPairingsLoading] = useState(false);
  const [addPairingOpen, setAddPairingOpen] = useState(false);
  const [addPairingDraft, setAddPairingDraft] = useState<Array<{ user_id: number; user_name: string }>>([]);
  const [pairingSaving, setPairingSaving] = useState(false);

  // Conflict resolution dialog
  const [conflictDialog, setConflictDialog] = useState<{
    open: boolean;
    eventId: number | null;
    bookings: ConflictBooking[];
    events: ConflictEvent[];
    teeSlots: ConflictTeeSlot[];
    resolving: boolean;
  }>({ open: false, eventId: null, bookings: [], events: [], teeSlots: [], resolving: false });

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
  const [dlgOpen, setDlgOpen]       = useState(false);
  const [templateMode, setTemplateMode] = useState(false);
  const [wizardStep, setWizardStep]  = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(search);
    if (params.get("action") === "new") { setWizardStep(0); setDlgOpen(true); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Deep-link: ?event=<id>&tab=<tab> — wait for events list to be ready
  useEffect(() => {
    if (loading || events.length === 0) return;
    const params = new URLSearchParams(search);
    const eventId = params.get("event");
    const tab     = params.get("tab");
    if (!eventId) return;
    const ev = events.find(e => String(e.id) === eventId);
    if (!ev) return;
    openDetail(ev);
    if (tab) setDetailTab(tab);
  }, [loading, events]); // eslint-disable-line react-hooks/exhaustive-deps
  const [form, setForm]         = useState(EMPTY_FORM);
  const [editId, setEditId]     = useState<number | null>(null);
  const [saving, setSaving]     = useState(false);

  // Tournament templates
  const [templates, setTemplates]         = useState<Array<{ id: number; name: string; template_data: any }>>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [savingTpl, setSavingTpl]         = useState(false);
  const [renamingTplId, setRenamingTplId] = useState<number | null>(null);
  const [renameTplVal, setRenameTplVal]   = useState("");
  const [selectedTplId, setSelectedTplId] = useState<number | null>(null);
  const [deleteTplDlg, setDeleteTplDlg]   = useState<{ open: boolean; id: number; name: string } | null>(null);
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
  const [genDialogDateTo, setGenDialogDateTo] = useState("");
  const [shotgunDlgOpen, setShotgunDlgOpen]   = useState(false);
  const [shotgunDlgDate, setShotgunDlgDate]   = useState("");
  const [shotgunTime, setShotgunTime]         = useState("07:30");
  const [shotgunHoles, setShotgunHoles]       = useState<9 | 18>(18);
  const [shotgunPPG, setShotgunPPG]           = useState(4);
  const [shotgunTwoSessions, setShotgunTwoSessions] = useState(false);
  const [shotgunAmTime, setShotgunAmTime]     = useState("07:30");
  const [shotgunPmTime, setShotgunPmTime]     = useState("13:00");
  const [shotgunDoubleTee, setShotgunDoubleTee] = useState(false);
  const [shotgunDoubleTeeMode, setShotgunDoubleTeeMode] = useState<"all" | "exclude_par3">("exclude_par3");
  const DEFAULT_PAR3: Record<9 | 18, number[]> = { 9: [3, 7], 18: [3, 7, 12, 16] };
  const [shotgunPar3Holes, setShotgunPar3Holes] = useState<Set<number>>(new Set(DEFAULT_PAR3[18]));
  // Generate draw — shotgun config state
  const [genShotgunDoubleTee, setGenShotgunDoubleTee]       = useState(false);
  const [genShotgunExcludePar3, setGenShotgunExcludePar3]   = useState(true);
  const [genShotgunPar3Holes, setGenShotgunPar3Holes]       = useState<number[]>(DEFAULT_PAR3[18]);
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

  const loadPairings = useCallback(async (evId: number) => {
    setPairingsLoading(true);
    try {
      const data = await api<{ teams: typeof pairings }>(`/api/portal/events/${evId}/pairings`);
      setPairings(data.teams ?? []);
    } catch {} finally { setPairingsLoading(false); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (detailTab === "pairings" && detail) loadPairings(detail.id);
  }, [detailTab, detail?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreatePairing = async () => {
    if (!detail || addPairingDraft.length < 2) return;
    setPairingSaving(true);
    try {
      await api(`/api/portal/events/${detail.id}/pairings`, {
        method: "POST",
        body: JSON.stringify({ player_ids: addPairingDraft.map(p => p.user_id) }),
      });
      setAddPairingDraft([]);
      setAddPairingOpen(false);
      loadPairings(detail.id);
      toast({ title: "Pairing created" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setPairingSaving(false); }
  };

  const handleDeletePairing = async (teamId: number) => {
    if (!detail || !confirm("Remove this pairing?")) return;
    try {
      await api(`/api/portal/events/${detail.id}/pairings/${teamId}`, { method: "DELETE" });
      setPairings(prev => prev.filter(t => t.id !== teamId));
      toast({ title: "Pairing removed" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
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

  // ── Auto-open shotgun dialog when shotgun start is explicitly selected with no slots yet ──
  useEffect(() => {
    if (form.shotgun_start !== true || wizardStep !== 4 || !form.event_date || editId) return;
    if (eventSlots.length > 0) return;
    setShotgunDlgDate(form.event_date);
    setShotgunDlgOpen(true);
  }, [form.shotgun_start, wizardStep]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-open interval tee-gen dialog when interval start is explicitly selected with no slots yet ──
  useEffect(() => {
    if (form.shotgun_start !== false || wizardStep !== 4 || !form.event_date || editId) return;
    if (eventSlots.length > 0) return;
    setGenDialogDate(form.event_date);
    setGenDialogDateTo(form.end_date || form.event_date);
    setGenDialogOpen(true);
  }, [form.shotgun_start, wizardStep]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!dlgOpen) { return; }
    setTemplatesLoading(true);
    api<Array<{ id: number; name: string; template_data: any }>>("/api/portal/tournament-templates")
      .then(setTemplates)
      .catch(() => {})
      .finally(() => setTemplatesLoading(false));
  }, [dlgOpen]);

  const doSaveTemplate = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSavingTpl(true);
    try {
      const { event_date, end_date, entries_open, entries_close, ...rest } = form;
      const template_data = { ...rest, ...(teeConfigSnapshot ? { tee_config: teeConfigSnapshot } : {}) };
      if (templateMode && selectedTplId !== null) {
        // UPDATE existing template
        const updated = await api<{ id: number; name: string; template_data: any }>(
          `/api/portal/tournament-templates/${selectedTplId}`,
          { method: "PUT", body: JSON.stringify({ name: trimmed, template_data }) }
        );
        setTemplates(prev => prev.map(t => t.id === selectedTplId
          ? { ...t, name: updated.name ?? trimmed, template_data }
          : t
        ));
        toast({ title: "Template updated", description: `"${trimmed}" has been updated.` });
      } else {
        // CREATE new template
        const saved = await api<{ id: number; name: string; template_data: any }>("/api/portal/tournament-templates", {
          method: "POST",
          body: JSON.stringify({ name: trimmed, template_data }),
        });
        setTemplates(prev => [...prev, saved]);
        toast({ title: "Template saved", description: `"${trimmed}" saved${teeConfigSnapshot ? " (includes tee schedule config)" : ""}.` });
      }
      if (templateMode) { setDlgOpen(false); setTemplateMode(false); }
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

  const handleDeleteTemplate = async () => {
    if (!deleteTplDlg) return;
    const { id, name } = deleteTplDlg;
    try {
      await api(`/api/portal/tournament-templates/${id}`, { method: "DELETE" });
      setTemplates(prev => prev.filter(t => t.id !== id));
      if (selectedTplId === id) setSelectedTplId(null);
      setDeleteTplDlg(null);
      toast({ title: "Template deleted", description: `"${name}" has been removed.` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleUpdateTemplate = async () => {
    const tpl = templates.find(t => t.id === selectedTplId);
    if (!tpl) return;
    setSavingTpl(true);
    try {
      const { event_date, end_date, entries_open, entries_close, ...rest } = form;
      const template_data = { ...rest, ...(teeConfigSnapshot ? { tee_config: teeConfigSnapshot } : {}) };
      const name = renameTplVal.trim() || tpl.name;
      const updated = await api<{ id: number; name: string; template_data: any }>(
        `/api/portal/tournament-templates/${tpl.id}`,
        { method: "PUT", body: JSON.stringify({ name, template_data }) }
      );
      setTemplates(prev => prev.map(t => t.id === tpl.id ? { ...t, name: updated.name ?? name, template_data } : t));
      setRenamingTplId(null);
      setRenameTplVal("");
      toast({ title: "Template updated", description: `"${name}" has been updated with the current settings.` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSavingTpl(false); }
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
    setTemplateMode(false);
    setSelectedTplId(null);
    setRenamingTplId(null);
    setRenameTplVal("");
    setWizardStep(0);
    setDlgOpen(true);
  };

  const openNewTemplate = () => {
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
    setTemplateMode(true);
    setSelectedTplId(null);
    setRenamingTplId(null);
    setRenameTplVal("");
    setWizardStep(0);
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
      allow_wallet: true, allow_prepaid: !!ev.allow_prepaid, allow_voucher: !!ev.allow_voucher,
      shotgun_start: !!ev.shotgun_start,
      block_full_day: !!ev.block_full_day,
      use_divisions: Array.isArray(ev.divisions) ? ev.divisions.length > 0 : true,
      divisions: (Array.isArray(ev.divisions) && ev.divisions.length > 0) ? ev.divisions : DEFAULT_DIVISIONS,
    });
    setEditId(ev.id);
    setDeletedSlotIds([]);
    tempSlotCounter.current = -1;
    setNewSlotDate("");
    setNewSlotTime("");
    setNewSlotPlayers(4);
    setTeeConfigSnapshot(null);
    setPendingTeeConfig(null);
    setSelectedTplId(null);
    setRenamingTplId(null);
    setRenameTplVal("");
    setTemplateMode(false);
    setWizardStep(0);
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
      if ((data.conflicting_bookings?.length ?? 0) > 0 || (data.conflicting_events?.length ?? 0) > 0 || (data.conflicting_tee_slots?.length ?? 0) > 0) {
        setConflictDialog({ open: true, eventId: id, bookings: data.conflicting_bookings ?? [], events: data.conflicting_events ?? [], teeSlots: data.conflicting_tee_slots ?? [], resolving: false });
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
          clear_slot_ids:     conflictDialog.teeSlots.map(s => s.id),
        }),
      });
      setEvents(prev => prev.map(ev =>
        ev.id === conflictDialog.eventId ? { ...ev, ...updated, status: "active" } :
        conflictDialog.events.some(ce => ce.id === ev.id) ? { ...ev, status: "cancelled" } : ev
      ));
      setConflictDialog({ open: false, eventId: null, bookings: [], events: [], teeSlots: [], resolving: false });
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

  const openGenDlg = () => {
    setGenMode("random");
    setGenAllRounds(false);
    setGenSeedRound(Math.max(1, drawRound - 1));
    if (detail?.shotgun_start) {
      setGenShotgunDoubleTee(!!detail.shotgun_double_tee);
      setGenShotgunExcludePar3(Array.isArray(detail.shotgun_par3_holes) && detail.shotgun_par3_holes.length > 0);
      setGenShotgunPar3Holes(Array.isArray(detail.shotgun_par3_holes) ? detail.shotgun_par3_holes.map(Number) : DEFAULT_PAR3[18]);
    }
    setGenDlg(true);
  };

  const handleGenerateDrawClick = () => {
    if (drawIsPublished) { setRegenWarnDlg(true); return; }
    openGenDlg();
  };

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

  const printDraw = () => {
    if (!detail || draw.length === 0) return;
    const esc = (s: string) => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    const fmtD = (d: string) => { try { return new Date(String(d).slice(0,10)+"T00:00:00").toLocaleDateString("en-ZA",{day:"numeric",month:"long",year:"numeric"}); } catch { return d; } };
    const roundDraw = draw.filter(d => d.round === drawRound);
    const metric = roundDraw.find(d => d.seed_metric)?.seed_metric ?? null;
    const drawTypeLabel = !metric ? "Random Draw" : metric === "handicap" ? "Seeded by Handicap" : metric === "points" ? "Seeded by Stableford Points" : metric === "gross" ? "Seeded by Gross Score" : "Seeded by Net Score";

    // Build groups
    const groups: Record<number, DrawEntry[]> = {};
    for (const d of roundDraw) { (groups[d.draw_group] ??= []).push(d); }
    const groupKeys = Object.keys(groups).map(Number).sort((a,b)=>a-b);

    let bodyHtml = "";

    if (detail.shotgun_start) {
      // Shotgun: group by hole
      const byHole: Record<number, number[]> = {};
      for (const gk of groupKeys) {
        const hole = groups[gk]![0]!.starting_tee ?? 1;
        (byHole[hole] ??= []).push(gk);
      }
      const holeKeys = Object.keys(byHole).map(Number).sort((a,b)=>a-b);
      for (const hole of holeKeys) {
        const holeGks = (byHole[hole]??[]).sort((a,b)=>a-b);
        bodyHtml += `<div class="hole-section">
          <div class="hole-header">&#9975; Hole ${hole}</div>
          <div class="groups">`;
        holeGks.forEach((gk, posIdx) => {
          const grp = groups[gk]!;
          const rep = grp[0]!;
          const posLabel = posIdx === 0 ? "1st off" : "2nd off";
          const labelClass = posIdx === 0 ? "first" : "second";
          const players = grp.map(p =>
            `<div class="player"><span class="player-name">${esc(p.user_name)}</span><span class="player-meta">${p.division ? esc(p.division)+" Div" : ""}${p.frozen_handicap != null ? " · HCP "+p.frozen_handicap : ""}</span></div>`
          ).join("");
          bodyHtml += `<div class="group">
            <div class="group-header">
              <span class="group-label ${labelClass}">${posLabel}</span>
              <span class="group-time">${String(rep.tee_time).slice(0,5)}</span>
              <span class="group-count">${grp.length} player${grp.length!==1?"s":""}</span>
            </div>
            ${players}
          </div>`;
        });
        bodyHtml += `</div></div>`;
      }
    } else {
      // Regular: group by draw_group
      for (const gk of groupKeys) {
        const grp = groups[gk]!;
        const rep = grp[0]!;
        const players = grp.map(p =>
          `<div class="player"><span class="player-name">${esc(p.user_name)}</span><span class="player-meta">${p.division ? esc(p.division)+" Div" : ""}${p.frozen_handicap != null ? " · HCP "+p.frozen_handicap : ""}</span></div>`
        ).join("");
        bodyHtml += `<div class="tee-group">
          <div class="tee-label">Group ${gk} &nbsp;·&nbsp; ${String(rep.tee_time).slice(0,5)} &nbsp;·&nbsp; Tee ${rep.starting_tee ?? 1}</div>
          ${players}
        </div>`;
      }
    }

    const shotgunBadge = detail.shotgun_start ? `<span class="badge-shotgun">&#128296; Shotgun Start</span>` : "";
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>Draw — ${esc(detail.name)} — Round ${drawRound}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;color:#111;background:#fff;padding:28px 32px;font-size:13px}
.header{display:flex;align-items:flex-start;justify-content:space-between;border-bottom:2.5px solid #1a5c38;padding-bottom:14px;margin-bottom:20px}
.logo{font-size:21px;font-weight:800;color:#1a5c38;letter-spacing:-0.5px}.logo span{color:#c8a84b}
.logo-sub{font-size:10px;color:#6b7c72;letter-spacing:1px;text-transform:uppercase;margin-top:2px}
.event-block{text-align:right}
.club-name{font-size:13px;font-weight:600;color:#1a5c38;letter-spacing:0.2px;margin-bottom:3px}
.event-name{font-size:18px;font-weight:700;color:#111}
.meta{font-size:11px;color:#6b7c72;margin-top:3px}
.draw-type{font-size:10px;color:#6b7c72;margin-top:12px;margin-bottom:16px;letter-spacing:0.5px;text-transform:uppercase}
.badge-shotgun{background:#1a5c38;color:#fff;border-radius:12px;padding:2px 10px;font-size:10px;font-weight:700;margin-left:6px}
/* Shotgun */
.hole-section{margin-bottom:18px;break-inside:avoid}
.hole-header{background:#1a5c38;color:#fff;padding:5px 14px;border-radius:20px;display:inline-block;font-size:12px;font-weight:700;margin-bottom:8px}
.groups{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-left:6px}
.group{border:1px solid #e5e7eb;border-radius:8px;padding:9px 12px}
.group-header{display:flex;align-items:center;gap:8px;margin-bottom:7px;padding-bottom:5px;border-bottom:1px solid #f3f4f6}
.group-label{font-size:11px;font-weight:700}
.group-label.first{color:#1a5c38}.group-label.second{color:#c8a84b}
.group-time{font-size:11px;color:#666;font-family:monospace}
.group-count{font-size:10px;color:#999;margin-left:auto}
/* Regular */
.tee-group{border:1px solid #e5e7eb;border-radius:8px;padding:9px 12px;margin-bottom:10px;break-inside:avoid}
.tee-label{font-size:12px;font-weight:700;color:#1a5c38;margin-bottom:7px;padding-bottom:5px;border-bottom:1px solid #f3f4f6}
/* Players */
.player{display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid #f9fafb;font-size:12px}
.player:last-child{border-bottom:none}
.player-name{font-weight:500}
.player-meta{color:#999;font-size:11px}
/* Footer */
.footer{margin-top:24px;padding-top:10px;border-top:1px solid #e5e7eb;font-size:10px;color:#aaa;text-align:center}
@media print{
  body{padding:16px 20px}
  @page{margin:15mm}
  .no-print{display:none}
  .hole-section{break-inside:avoid}
  .group{break-inside:avoid}
  .tee-group{break-inside:avoid}
}
</style></head><body>
<div class="header">
  <div>
    <div class="logo">TapIn<span> Golf</span></div>
    <div class="logo-sub">Official Draw Sheet</div>
  </div>
  <div class="event-block">
    ${detail.club_name ? `<div class="club-name">${esc(detail.club_name)}</div>` : ""}
    <div class="event-name">${esc(detail.name)}</div>
    <div class="meta">${fmtD(detail.event_date)} &nbsp;·&nbsp; Round ${drawRound} &nbsp;·&nbsp; ${roundDraw.length} player${roundDraw.length!==1?"s":""}</div>
  </div>
</div>
<div class="draw-type">${esc(drawTypeLabel)}${shotgunBadge}</div>
${bodyHtml}
<div class="footer">Generated by TapIn Golf &nbsp;·&nbsp; www.tapingolfza.co.za &nbsp;·&nbsp; ${new Date().toLocaleDateString("en-ZA",{day:"numeric",month:"long",year:"numeric"})}</div>
<script>window.onload=function(){window.print();}<\/script>
</body></html>`;

    const win = window.open("","_blank","width=900,height=700");
    if (win) { win.document.write(html); win.document.close(); }
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
            body: JSON.stringify({ round: r, date, mode: "random", players_per_group: genPerGroup, group_by_division: genGroupByDiv,
            ...(detail.shotgun_start ? { double_tee: genShotgunDoubleTee, par3_holes: genShotgunExcludePar3 ? genShotgunPar3Holes : [] } : {}) }),
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
            ...(detail.shotgun_start ? { double_tee: genShotgunDoubleTee, par3_holes: genShotgunExcludePar3 ? genShotgunPar3Holes : [] } : {}),
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
    setDqNotes("");
    setDqDialog({ userId, userName, submitted });
  };

  const confirmDq = async () => {
    if (!detail || !dqDialog) return;
    setDqSaving(true);
    const fullReason = [dqReason, dqNotes].filter(Boolean).join(" — ") || undefined;
    try {
      await api(`/api/portal/events/${detail.id}/scores/${dqDialog.userId}/dq`, {
        method: "POST",
        body: JSON.stringify({
          round: scoreRound,
          reason: fullReason,
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
    <div>
      {/* Page-level tab switcher */}
      <div className="px-8 pt-6 flex gap-1 border-b">
        {(["tournaments", "knockout"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setPageTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${pageTab === tab ? "border-[#1a5c38] text-[#1a5c38]" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {tab === "tournaments" ? (
              <><Calendar className="h-3.5 w-3.5" />Tournaments</>
            ) : (
              <><Swords className="h-3.5 w-3.5" />Knockout</>
            )}
          </button>
        ))}
      </div>

      {pageTab === "knockout" ? (
        <KnockoutPage />
      ) : (
      <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tournaments</h1>
          <p className="text-muted-foreground mt-1">Manage club tournaments and competitions.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2 border-[#1a5c38]/40 text-[#1a5c38] hover:bg-[#1a5c38]/5" onClick={openNewTemplate} disabled={readOnly}>
            <BookmarkPlus className="h-4 w-4" />Manage Templates
          </Button>
          <Button className="bg-[#1a5c38] hover:bg-[#164d30] gap-2" onClick={openAdd} disabled={readOnly}>
            <Plus className="h-4 w-4" />New Tournament
          </Button>
        </div>
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
                        {ev.entry_fee ? ` · R${Number(ev.entry_fee).toFixed(2)} entry` : ""}
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
                {(() => {
                  const isTeamDtl    = isTeamFormatFE(detail.format, detail.format2);
                  const cols = 5 + (isTeamDtl ? 1 : 0) + (detail.restriction === "invitation_only" ? 1 : 0);
                  return (
                    <TabsList className={`w-full grid mb-4 h-10 grid-cols-${cols}`}>
                      <TabsTrigger value="registrations" className="text-xs gap-1">
                        <Users className="h-3.5 w-3.5" />Entries
                        {detail.pending_count > 0 && <span className="ml-0.5 bg-amber-500 text-white text-[10px] rounded-full px-1 py-0.5 font-bold">{detail.pending_count}</span>}
                      </TabsTrigger>
                      <TabsTrigger value="schedule" className="text-xs gap-1"><Clock className="h-3.5 w-3.5" />Schedule</TabsTrigger>
                      <TabsTrigger value="divisions" className="text-xs gap-1"><Trophy className="h-3.5 w-3.5" />Divisions</TabsTrigger>
                      <TabsTrigger value="draw" className="text-xs gap-1"><ListOrdered className="h-3.5 w-3.5" />Draw</TabsTrigger>
                      <TabsTrigger value="scores" className="text-xs gap-1"><BarChart2 className="h-3.5 w-3.5" />Scores</TabsTrigger>
                      {isTeamDtl && (
                        <TabsTrigger value="pairings" className="text-xs gap-1">
                          <Users className="h-3.5 w-3.5" />Pairings
                          {pairings.length > 0 && <span className="ml-0.5 bg-[#1a5c38] text-white text-[10px] rounded-full px-1 py-0.5 font-bold">{pairings.length}</span>}
                        </TabsTrigger>
                      )}
                      {detail.restriction === "invitation_only" && (
                        <TabsTrigger value="invites" className="text-xs gap-1">
                          <Send className="h-3.5 w-3.5" />Invites
                          {invites.length > 0 && <span className="ml-0.5 bg-blue-500 text-white text-[10px] rounded-full px-1 py-0.5 font-bold">{invites.length}</span>}
                        </TabsTrigger>
                      )}
                    </TabsList>
                  );
                })()}

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
                      {(() => {
                        // Build team_id → partner names map for team-format events
                        const isTeamFmt = isTeamFormatFE(detail.format, detail.format2);
                        const teamPartners = new Map<number, string[]>();
                        if (isTeamFmt) {
                          for (const reg of regs) {
                            if (reg.team_id == null) continue;
                            if (!teamPartners.has(reg.team_id)) teamPartners.set(reg.team_id, []);
                            teamPartners.get(reg.team_id)!.push(reg.user_name);
                          }
                        }
                        return regs.map(r => {
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
                          const partners = isTeamFmt && r.team_id != null
                            ? (teamPartners.get(r.team_id) ?? []).filter((n: string) => n !== r.user_name)
                            : [];
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
                                      {isTeamFmt && (
                                        partners.length > 0
                                          ? <span className="text-xs bg-[#c8a84b]/15 text-[#8a6e20] px-2 py-0.5 rounded-full font-medium">
                                              🤝 {partners.join(" & ")}
                                            </span>
                                          : <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                                              No partner
                                            </span>
                                      )}
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                      {r.user_email}
                                      {r.frozen_handicap != null ? ` · HCP ${r.frozen_handicap}` : ""}
                                      {r.registered_at ? ` · Entered ${new Date(r.registered_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}
                                    </p>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        });
                      })()}
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
                      <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={printDraw} disabled={draw.length === 0}><Printer className="h-3.5 w-3.5" />Print Draw</Button>
                      <Button size="sm" variant="outline" className="h-8 gap-1 text-xs border-amber-300 text-amber-700 hover:bg-amber-50" onClick={handleGenerateDrawClick} disabled={readOnly}><Shuffle className="h-3.5 w-3.5" />Generate Draw</Button>
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
                        <Button size="sm" variant="outline" className="gap-1 text-xs border-amber-300 text-amber-700 hover:bg-amber-50" onClick={handleGenerateDrawClick} disabled={readOnly}><Shuffle className="h-3.5 w-3.5" />Generate Draw</Button>
                      </div>
                    </div>
                  ) : (() => {
                    // Group entries by draw_group
                    const groups: Record<number, DrawEntry[]> = {};
                    for (const d of draw) { (groups[d.draw_group] ??= []).push(d); }
                    const groupKeys = Object.keys(groups).map(Number).sort((a, b) => a - b);

                    // Shared player row renderer
                    const renderPlayers = (grp: DrawEntry[]) => (
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
                    );

                    if (detail.shotgun_start) {
                      // ── Shotgun view: cards grouped by starting hole ────────────────────
                      const byHole: Record<number, number[]> = {};
                      for (const gk of groupKeys) {
                        const hole = groups[gk]![0]!.starting_tee ?? 1;
                        (byHole[hole] ??= []).push(gk);
                      }
                      const holeKeys = Object.keys(byHole).map(Number).sort((a, b) => a - b);

                      return (
                        <div className="space-y-5">
                          {holeKeys.map(hole => {
                            const holeGroupKeys = (byHole[hole] ?? []).sort((a, b) => a - b);
                            return (
                              <div key={hole}>
                                {/* Hole section header */}
                                <div className="flex items-center gap-3 mb-2">
                                  <div className="flex items-center gap-1.5 bg-[#1a5c38] text-white px-3 py-1.5 rounded-full text-sm font-bold shrink-0">
                                    🕳️ Hole {hole}
                                  </div>
                                  <div className="h-px flex-1 bg-[#1a5c38] opacity-20" />
                                  <span className="text-xs text-muted-foreground shrink-0">{holeGroupKeys.length} group{holeGroupKeys.length !== 1 ? "s" : ""}</span>
                                </div>
                                {/* Groups on this hole */}
                                <div className="space-y-2 pl-2">
                                  {holeGroupKeys.map((gk, posIdx) => {
                                    const grp = groups[gk]!;
                                    const rep = grp[0]!;
                                    const isFirst = posIdx === 0;
                                    const posLabel = isFirst ? "1st off" : "2nd off";
                                    const borderColor = isFirst ? "border-l-[#1a5c38]" : "border-l-[#c8a84b]";
                                    const labelColor = isFirst ? "text-[#1a5c38]" : "text-[#c8a84b]";
                                    return (
                                      <Card key={gk} className={`border-l-4 ${borderColor}`}>
                                        <CardContent className="p-3">
                                          <div className="flex items-center gap-3 mb-2">
                                            <span className={`text-xs font-bold w-14 shrink-0 ${labelColor}`}>{posLabel}</span>
                                            <div className="flex items-center gap-1.5">
                                              <span className="text-xs text-muted-foreground whitespace-nowrap">🕳️ Hole</span>
                                              <Input
                                                type="number" min="1" max="18"
                                                value={rep.starting_tee ?? 1}
                                                className="h-7 w-14 text-xs font-bold text-[#1a5c38]"
                                                disabled={readOnly}
                                                onChange={e => setDraw(prev => prev.map(x =>
                                                  x.draw_group === gk ? { ...x, starting_tee: Number(e.target.value) } : x
                                                ))}
                                              />
                                            </div>
                                            <span className="text-xs text-muted-foreground font-mono">{String(rep.tee_time).slice(0, 5)}</span>
                                            <span className="text-xs text-muted-foreground ml-auto">{grp.length} player{grp.length !== 1 ? "s" : ""}</span>
                                          </div>
                                          {renderPlayers(grp)}
                                        </CardContent>
                                      </Card>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    }

                    // ── Regular (non-shotgun) view ──────────────────────────────────────────
                    return (
                      <div className="space-y-2">
                        {groupKeys.map(gk => {
                          const grp = groups[gk]!;
                          const rep = grp[0]!;
                          return (
                            <Card key={gk} className="border-l-4 border-l-[#1a5c38]">
                              <CardContent className="p-3">
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
                                {renderPlayers(grp)}
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    );
                  })()}

                  {/* Re-generate warning dialog */}
                  <Dialog open={regenWarnDlg} onOpenChange={setRegenWarnDlg}>
                    <DialogContent className="max-w-sm">
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                          <AlertTriangle className="h-5 w-5 text-amber-500" />
                          Draw Already Published
                        </DialogTitle>
                        <DialogDescription asChild>
                          <div className="text-sm text-muted-foreground space-y-2 pt-1">
                            <p>The Round {drawRound} draw has already been published — players have been notified of their tee times and groups.</p>
                            <p>Generating a new draw will <strong>overwrite the existing one</strong>. You'll need to re-publish it, and players will receive an updated notification.</p>
                            <p>Are you sure you want to continue?</p>
                          </div>
                        </DialogDescription>
                      </DialogHeader>
                      <DialogFooter className="gap-2 sm:gap-0">
                        <Button variant="outline" onClick={() => setRegenWarnDlg(false)}>Cancel</Button>
                        <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={() => { setRegenWarnDlg(false); openGenDlg(); }}>
                          Yes, Generate New Draw
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

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

                        {/* Shotgun hole assignment */}
                        {!!detail?.shotgun_start && (
                          <div className="rounded-lg border border-[#1a5c38]/30 bg-[#1a5c38]/5 p-3 space-y-3">
                            <p className="text-sm font-semibold text-[#1a5c38]">🔫 Shotgun Hole Assignment</p>
                            <div className="flex items-center gap-3">
                              <Switch checked={genShotgunDoubleTee} onCheckedChange={setGenShotgunDoubleTee} />
                              <div>
                                <p className="text-sm font-medium">Double Teeing</p>
                                <p className="text-xs text-muted-foreground">2 groups per hole — doubles capacity</p>
                              </div>
                            </div>
                            {genShotgunDoubleTee && (
                              <div className="flex items-center gap-3 pl-1">
                                <Switch checked={genShotgunExcludePar3} onCheckedChange={setGenShotgunExcludePar3} />
                                <div>
                                  <p className="text-sm font-medium">Exclude Par 3s</p>
                                  <p className="text-xs text-muted-foreground">1 group on par 3 holes, 2 on all others</p>
                                </div>
                              </div>
                            )}
                            {genShotgunDoubleTee && genShotgunExcludePar3 && (
                              <div>
                                <p className="text-xs text-muted-foreground mb-1.5">Par 3 holes (tap to toggle)</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {Array.from({ length: detail.holes ?? 18 }, (_, i) => i + 1).map(h => (
                                    <button key={h} type="button"
                                      onClick={() => setGenShotgunPar3Holes(prev =>
                                        prev.includes(h) ? prev.filter(x => x !== h) : [...prev, h].sort((a, b) => a - b)
                                      )}
                                      className={`w-8 h-8 rounded text-xs font-medium border transition-all ${
                                        genShotgunPar3Holes.includes(h)
                                          ? "bg-[#1a5c38] text-white border-[#1a5c38]"
                                          : "border-border bg-white text-foreground hover:border-[#1a5c38]/40"
                                      }`}>
                                      {h}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

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
                                <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
                                  {/* Header */}
                                  <div className="p-5 pb-3 border-b flex-shrink-0">
                                    <h3 className="font-semibold text-base">Disqualify — {dqDialog.userName}</h3>
                                    <p className="text-xs text-muted-foreground mt-0.5">Round {scoreRound}. Select the applicable DQ rule and optionally correct scores.</p>
                                  </div>

                                  {/* Scrollable body */}
                                  <div className="overflow-y-auto flex-1 p-5 space-y-5">
                                    {/* Rule picker */}
                                    <div>
                                      <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">DQ Rule</Label>
                                      <div className="mt-2 space-y-3">
                                        {DQ_RULES.map(cat => (
                                          <div key={cat.category}>
                                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{cat.category}</p>
                                            <div className="space-y-1">
                                              {cat.rules.map(rule => {
                                                const selected = dqReason === rule;
                                                return (
                                                  <button
                                                    key={rule}
                                                    type="button"
                                                    onClick={() => setDqReason(selected ? "" : rule)}
                                                    className={`w-full text-left text-xs px-3 py-2 rounded-lg border transition-colors ${
                                                      selected
                                                        ? "bg-red-50 border-red-400 text-red-700 font-medium"
                                                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-700"
                                                    }`}
                                                  >
                                                    <span className="font-semibold">{rule.split(" — ")[0]}</span>
                                                    <span className="text-[11px] font-normal"> — {rule.split(" — ").slice(1).join(" — ")}</span>
                                                  </button>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>

                                    {/* Additional notes */}
                                    <div>
                                      <Label className="text-[11px] text-muted-foreground">Additional notes (optional)</Label>
                                      <Input className="mt-1 text-xs h-8" placeholder="Any specifics for the record…"
                                        value={dqNotes} onChange={e => setDqNotes(e.target.value)} />
                                    </div>

                                    {/* Corrected scores */}
                                    <div>
                                      <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Corrected Scores (optional)</Label>
                                      <div className="grid grid-cols-3 gap-2 mt-2">
                                        {([["Gross", dqGross, setDqGross], ["Nett", dqNet, setDqNet], ["Stableford Pts", dqPoints, setDqPoints]] as const).map(([label, val, setter]) => (
                                          <div key={label}>
                                            <Label className="text-[11px] text-muted-foreground">{label}</Label>
                                            <Input type="number" min="0" className="h-8 text-xs text-center mt-0.5" placeholder="—"
                                              value={val} onChange={e => (setter as any)(e.target.value)} />
                                          </div>
                                        ))}
                                      </div>
                                    </div>

                                    <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                                      The player will be notified immediately and removed from the leaderboard standings.
                                    </p>
                                  </div>

                                  {/* Footer */}
                                  <div className="p-4 border-t flex gap-2 flex-shrink-0">
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
                                      </div>
                                      {isDQ ? (
                                        <>
                                          {(["gross","net","points"] as const).map(field => {
                                            const origKey = `original_${field}` as keyof Score;
                                            const orig = submitted?.[origKey] as number | null;
                                            const corrected = submitted?.[field] as number | null;
                                            const changed = orig != null && corrected != null && orig !== corrected;
                                            return (
                                              <div key={field} className="flex flex-col items-center justify-center gap-0.5">
                                                {changed ? (
                                                  <>
                                                    <span className="text-xs text-red-500 line-through font-medium">{orig}</span>
                                                    <span className="text-xs font-bold text-gray-700">{corrected}</span>
                                                  </>
                                                ) : (
                                                  <span className="text-xs text-red-400">{orig ?? corrected ?? "—"}</span>
                                                )}
                                              </div>
                                            );
                                          })}
                                        </>
                                      ) : (
                                        (["gross","net","points"] as const).map(field => (
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
                                        ))
                                      )}
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

                {/* PAIRINGS TAB — team-format events only */}
                {isTeamFormatFE(detail.format, detail.format2) && (
                  <TabsContent value="pairings" className="pb-8">
                    <div className="space-y-4">
                      <div>
                        <p className="text-sm font-semibold">Team Pairings</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {isGroupFormatFE(detail.format, detail.format2) ? "Groups compete together as a team." : "Each pair competes together."}
                          {" "}Pairings are set when players register together.
                        </p>
                      </div>

                      {pairingsLoading ? (
                        <div className="space-y-2">
                          {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-lg border bg-muted/20 animate-pulse" />)}
                        </div>
                      ) : pairings.length === 0 ? (
                        <div className="py-8 text-center space-y-2">
                          <Users className="h-8 w-8 text-muted-foreground/40 mx-auto" />
                          <p className="text-sm text-muted-foreground">No pairs formed yet.</p>
                          <p className="text-xs text-muted-foreground">Golfers who selected a playing partner when registering will appear here automatically. You can also create pairs manually above.</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {pairings.map((team, idx) => {
                            const colors = [
                              "border-blue-200 bg-blue-50",
                              "border-purple-200 bg-purple-50",
                              "border-rose-200 bg-rose-50",
                              "border-orange-200 bg-orange-50",
                              "border-teal-200 bg-teal-50",
                              "border-indigo-200 bg-indigo-50",
                            ];
                            const badgeColors = [
                              "bg-blue-100 text-blue-700",
                              "bg-purple-100 text-purple-700",
                              "bg-rose-100 text-rose-700",
                              "bg-orange-100 text-orange-700",
                              "bg-teal-100 text-teal-700",
                              "bg-indigo-100 text-indigo-700",
                            ];
                            const colorClass = colors[idx % colors.length]!;
                            const badgeClass = badgeColors[idx % badgeColors.length]!;
                            return (
                              <Card key={team.id} className={`border ${colorClass}`}>
                                <CardContent className="p-3">
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeClass}`}>
                                      Team {idx + 1}
                                    </span>
                                    {team.name && <span className="text-sm font-semibold">{team.name}</span>}
                                  </div>
                                  <div className="space-y-1">
                                    {team.players.map(p => (
                                      <div key={p.user_id} className="flex items-center gap-2 text-sm">
                                        <div className="h-2 w-2 rounded-full bg-current opacity-40" />
                                        <span className="font-medium">{p.user_name}</span>
                                        <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                          p.reg_status === "approved" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                                          {p.reg_status}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </CardContent>
                              </Card>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </TabsContent>
                )}

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
      <Dialog open={dlgOpen} onOpenChange={o => { setDlgOpen(o); if (!o) setTemplateMode(false); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {templateMode ? <><BookmarkPlus className="h-4 w-4 text-[#1a5c38]" />New Tournament Template</> : editId ? "Edit Tournament" : "New Tournament"}
            </DialogTitle>
            {templateMode && <DialogDescription>Configure settings to reuse across future tournaments. No date needed — just set up the format, pricing, and schedule.</DialogDescription>}
          </DialogHeader>
          {(() => {
            const isTeamFmt  = isTeamFormatFE(form.format, form.format2);
            const isGroupFmt = isGroupFormatFE(form.format, form.format2);
            const STEPS = ["Details", "Format", "Pricing", "Teams", "Schedule", "Review"];
            return (
              <>
                {/* ── Step progress ────────────────────────────────────────────── */}
                <div className="flex items-center gap-0 py-3">
                  {STEPS.map((label, i) => (
                    <Fragment key={i}>
                      <button type="button"
                        onClick={() => { if (i < wizardStep) setWizardStep(i); }}
                        className={`flex items-center gap-1 px-1 py-0.5 rounded text-xs font-medium transition-colors ${
                          i === wizardStep ? "text-[#1a5c38] font-semibold"
                          : i < wizardStep ? "text-muted-foreground hover:text-foreground cursor-pointer"
                          : "text-muted-foreground/40 cursor-default"}`}>
                        <span className={`h-5 w-5 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold ${
                          i === wizardStep ? "bg-[#1a5c38] text-white"
                          : i < wizardStep ? "bg-[#1a5c38]/20 text-[#1a5c38]"
                          : "bg-muted text-muted-foreground/40"}`}>
                          {i < wizardStep ? "✓" : i + 1}
                        </span>
                        <span className="hidden lg:inline">{label}</span>
                      </button>
                      {i < STEPS.length - 1 && (
                        <div className={`flex-1 h-px mx-0.5 ${i < wizardStep ? "bg-[#1a5c38]/35" : "bg-border"}`} />
                      )}
                    </Fragment>
                  ))}
                </div>

                {/* ── Step content ─────────────────────────────────────────────── */}
                <div key={wizardStep} className="space-y-4 py-1 min-h-[320px]">

                  {/* ━━━ STEP 0: DETAILS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
                  {wizardStep === 0 && (<>
                    {/* Saved templates list — templateMode: management; new tournament: load dropdown; editing: hidden */}
                    {templateMode ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold flex items-center gap-1.5">
                            <BookmarkPlus className="h-4 w-4 text-[#1a5c38]" />Saved Templates
                          </p>
                          {templatesLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                        </div>
                        {!templatesLoading && templates.length === 0 && (
                          <p className="text-xs text-muted-foreground italic py-2 text-center border border-dashed border-border rounded-lg">
                            No templates saved yet — create one below.
                          </p>
                        )}
                        {templates.map(tpl => (
                          <div key={tpl.id}
                            className={`rounded-lg border bg-card transition-colors ${selectedTplId === tpl.id ? "border-[#1a5c38]/60 bg-[#1a5c38]/5" : ""}`}>
                            <div className="flex items-center gap-2 px-3 py-2">
                              <BookmarkPlus className={`h-3.5 w-3.5 shrink-0 ${selectedTplId === tpl.id ? "text-[#1a5c38]" : "text-muted-foreground"}`} />
                              <span className="text-sm font-medium flex-1 truncate">{tpl.name}</span>
                              {tpl.template_data?.tee_config && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 shrink-0">tee</span>
                              )}
                              {selectedTplId === tpl.id && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#1a5c38]/15 text-[#1a5c38] shrink-0">editing</span>
                              )}
                              {!readOnly && (
                                <>
                                  <Button size="sm" variant="ghost"
                                    className="h-7 px-2 gap-1 text-xs shrink-0 text-muted-foreground hover:text-[#1a5c38] hover:bg-[#1a5c38]/10"
                                    onClick={() => {
                                      handleLoadTemplate(tpl);
                                      setSelectedTplId(tpl.id);
                                      setWizardStep(0);
                                    }}
                                    title="Edit this template">
                                    <Pencil className="h-3 w-3" />Edit
                                  </Button>
                                  <Button size="sm" variant="ghost"
                                    className="h-7 w-7 p-0 shrink-0 text-destructive/50 hover:text-destructive hover:bg-destructive/10"
                                    onClick={() => setDeleteTplDlg({ open: true, id: tpl.id, name: tpl.name })}
                                    title="Delete">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                        <div className="border-t border-dashed border-border pt-3">
                          {selectedTplId !== null ? (
                            <p className="text-xs font-semibold text-[#1a5c38] mb-2 flex items-center gap-1.5">
                              <Pencil className="h-3 w-3" />
                              Editing — change name or proceed through steps
                            </p>
                          ) : (
                            <p className="text-xs font-semibold text-muted-foreground mb-2">Create new template</p>
                          )}
                        </div>
                      </div>
                    ) : !editId && (
                    <div className="rounded-xl border border-[#1a5c38]/25 bg-[#1a5c38]/5 p-3 space-y-2.5">
                      <div className="flex items-center gap-2">
                        <BookmarkPlus className="h-4 w-4 text-[#1a5c38] shrink-0" />
                        <span className="text-sm font-semibold text-[#1a5c38]">Templates</span>
                        {teeConfigSnapshot && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[#1a5c38]/15 text-[#1a5c38]">tee config captured</span>
                        )}
                      </div>
                      {/* Load-only dropdown */}
                      <Select
                        value={selectedTplId ? String(selectedTplId) : ""}
                        onValueChange={val => {
                          const tpl = templates.find(t => t.id === Number(val));
                          if (!tpl) return;
                          setSelectedTplId(tpl.id);
                          handleLoadTemplate(tpl);
                        }}
                        disabled={templatesLoading || templates.length === 0}
                      >
                        <SelectTrigger className="h-8 text-xs bg-white">
                          <SelectValue placeholder={
                            templatesLoading ? "Loading…" :
                            templates.length === 0 ? "No templates saved yet" :
                            "Select a template to load…"
                          } />
                        </SelectTrigger>
                        <SelectContent>
                          {templates.map(tpl => (
                            <SelectItem key={tpl.id} value={String(tpl.id)}>
                              <span className="flex items-center gap-2">
                                {tpl.name}
                                {tpl.template_data?.tee_config && (
                                  <span className="text-[10px] font-bold px-1 py-0.5 rounded bg-blue-100 text-blue-700">tee</span>
                                )}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    )}
                    {/* Name */}
                    <div className="space-y-1.5">
                      <Label>{templateMode ? "Template Name *" : "Tournament Name *"}</Label>
                      <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={templateMode ? "e.g. Club Championship Setup" : "Club Championship 2026"} />
                    </div>
                    {/* Description */}
                    <div className="space-y-1.5">
                      <Label>Description</Label>
                      <textarea ref={descRef}
                        className="w-full border rounded-md px-3 py-2 text-sm min-h-[80px] bg-background resize-none overflow-hidden"
                        value={form.description}
                        onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                        onInput={e => { const t = e.currentTarget; t.style.height = "auto"; t.style.height = t.scrollHeight + "px"; }}
                        placeholder="Tournament details, rules, conditions…" />
                    </div>
                    {/* Image */}
                    <div className="space-y-1.5">
                      <Label>Tournament Image <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
                      <input ref={imgInputRef} type="file" accept="image/*" className="hidden" onChange={handleImgSelect} />
                      {form.image_url ? (
                        <div className="relative w-full h-36 rounded-lg overflow-hidden border">
                          <img src={form.image_url} alt="Tournament" className="w-full h-full object-cover" />
                          <button type="button"
                            className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white rounded-full p-1"
                            onClick={() => setForm(f => ({ ...f, image_url: "" }))}>
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button type="button"
                          className="w-full h-28 rounded-lg border-2 border-dashed border-border hover:border-[#1a5c38]/50 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-[#1a5c38] transition-colors"
                          onClick={() => imgInputRef.current?.click()} disabled={imgUploading}>
                          {imgUploading ? <span className="text-xs">Uploading…</span> : (<><ImageIcon className="h-6 w-6" /><span className="text-xs">Click to upload tournament image</span></>)}
                        </button>
                      )}
                    </div>
                    {/* Dates + Holes + Rounds */}
                    <div className="grid grid-cols-2 gap-3">
                      {!templateMode && (<>
                        <div className="space-y-1.5">
                          <Label>Start Date *</Label>
                          <Input type="date" value={form.event_date} onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))} />
                        </div>
                        <div className="space-y-1.5">
                          <Label>End Date <span className="text-muted-foreground font-normal text-xs">(multi-day)</span></Label>
                          <Input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
                        </div>
                      </>)}
                      <div className="space-y-1.5">
                        <Label>Holes</Label>
                        <div className="flex gap-2">
                          {([9, 18] as const).map(h => (
                            <button key={h} type="button" onClick={() => setForm(f => ({ ...f, holes: h }))}
                              className={`flex-1 py-2 rounded-md border text-sm font-semibold transition-colors ${
                                form.holes === h ? "bg-primary text-primary-foreground border-primary" : "bg-background text-foreground border-border hover:border-primary/50"}`}>
                              {h} holes
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Rounds per Day</Label>
                        <Select value={String(form.rounds_per_day)} onValueChange={v => setForm(f => ({ ...f, rounds_per_day: Number(v) as 1 | 2 }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">1 round per day</SelectItem>
                            <SelectItem value="2">2 rounds per day</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    {/* Type + Restriction */}
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
                  </>)}

                  {/* ━━━ STEP 1: FORMAT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
                  {wizardStep === 1 && (<>
                    <p className="text-sm text-muted-foreground">Choose the playing format(s) for this tournament.</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Format 1 *</Label>
                        <Select value={form.format} onValueChange={v => setForm(f => ({ ...f, format: v, format_custom: v !== "other" ? f.format_custom : "" }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent className="max-h-80">
                            <SelectGroup><SelectLabel>Individual</SelectLabel>
                              <SelectItem value="gross_stroke_play">Gross Stroke Play (Medal Play)</SelectItem>
                              <SelectItem value="net_stroke_play">Net Stroke Play</SelectItem>
                              <SelectItem value="singles_match_play">Singles Match Play</SelectItem>
                              <SelectItem value="individual_stableford">Individual Stableford</SelectItem>
                              <SelectItem value="modified_stableford">Individual Modified Stableford</SelectItem>
                              <SelectItem value="maximum_score">Maximum Score</SelectItem>
                              <SelectItem value="chairman">Chairman (The Perch)</SelectItem>
                              <SelectItem value="individual_bonus_bogey">Individual Bonus Bogey</SelectItem>
                              <SelectItem value="individual_par">Individual Par Competition</SelectItem>
                              <SelectItem value="individual_bogey">Individual Bogey Competition</SelectItem>
                              <SelectItem value="eclectic">Eclectic (Multi-Round)</SelectItem>
                            </SelectGroup>
                            <SelectGroup><SelectLabel>Betterball / Two-Player Team</SelectLabel>
                              <SelectItem value="fourball_gross_betterball">Four-Ball Gross Betterball</SelectItem>
                              <SelectItem value="fourball_net_betterball">Four-Ball Net Betterball</SelectItem>
                              <SelectItem value="betterball_match_play">Betterball Match Play</SelectItem>
                              <SelectItem value="fourball_stableford">Betterball Stableford (4BBB)</SelectItem>
                              <SelectItem value="shamble">Shamble</SelectItem>
                              <SelectItem value="best_ball_aggregate">Best Ball Aggregate</SelectItem>
                              <SelectItem value="high_low">High-Low</SelectItem>
                              <SelectItem value="daytona">Daytona (Las Vegas)</SelectItem>
                              <SelectItem value="low_ball_total">Low Ball / Total Score</SelectItem>
                              <SelectItem value="the_ghost">The Ghost</SelectItem>
                              <SelectItem value="betterball_bonus_bogey">Betterball Bonus Bogey</SelectItem>
                              <SelectItem value="pinehurst_points">Multiplication Betterball (Pinehurst)</SelectItem>
                              <SelectItem value="chapman">Greensomes (Chapman/Pinehurst)</SelectItem>
                            </SelectGroup>
                            <SelectGroup><SelectLabel>Full-Group Team</SelectLabel>
                              <SelectItem value="alliance">Alliance</SelectItem>
                              <SelectItem value="texas_scramble">Texas Scramble</SelectItem>
                              <SelectItem value="american_scramble">American Scramble</SelectItem>
                            </SelectGroup>
                            <SelectGroup><SelectLabel>Other</SelectLabel>
                              <SelectItem value="other">Other (specify below)</SelectItem>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                        {form.format === "other" && (
                          <Input placeholder="Describe the format…" value={form.format_custom}
                            onChange={e => setForm(f => ({ ...f, format_custom: e.target.value }))} />
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label>Format 2 <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
                        <Select value={form.format2 || "none"} onValueChange={v => setForm(f => ({ ...f, format2: v === "none" ? "" : v, format2_custom: v !== "other" ? "" : f.format2_custom }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent className="max-h-80">
                            <SelectItem value="none">— No second format —</SelectItem>
                            <SelectGroup><SelectLabel>Individual</SelectLabel>
                              <SelectItem value="gross_stroke_play">Gross Stroke Play (Medal Play)</SelectItem>
                              <SelectItem value="net_stroke_play">Net Stroke Play</SelectItem>
                              <SelectItem value="singles_match_play">Singles Match Play</SelectItem>
                              <SelectItem value="individual_stableford">Individual Stableford</SelectItem>
                              <SelectItem value="modified_stableford">Individual Modified Stableford</SelectItem>
                              <SelectItem value="maximum_score">Maximum Score</SelectItem>
                              <SelectItem value="chairman">Chairman (The Perch)</SelectItem>
                              <SelectItem value="individual_bonus_bogey">Individual Bonus Bogey</SelectItem>
                              <SelectItem value="individual_par">Individual Par Competition</SelectItem>
                              <SelectItem value="individual_bogey">Individual Bogey Competition</SelectItem>
                              <SelectItem value="eclectic">Eclectic (Multi-Round)</SelectItem>
                            </SelectGroup>
                            <SelectGroup><SelectLabel>Betterball / Two-Player Team</SelectLabel>
                              <SelectItem value="fourball_gross_betterball">Four-Ball Gross Betterball</SelectItem>
                              <SelectItem value="fourball_net_betterball">Four-Ball Net Betterball</SelectItem>
                              <SelectItem value="betterball_match_play">Betterball Match Play</SelectItem>
                              <SelectItem value="fourball_stableford">Betterball Stableford (4BBB)</SelectItem>
                              <SelectItem value="shamble">Shamble</SelectItem>
                              <SelectItem value="best_ball_aggregate">Best Ball Aggregate</SelectItem>
                              <SelectItem value="high_low">High-Low</SelectItem>
                              <SelectItem value="daytona">Daytona (Las Vegas)</SelectItem>
                              <SelectItem value="low_ball_total">Low Ball / Total Score</SelectItem>
                              <SelectItem value="the_ghost">The Ghost</SelectItem>
                              <SelectItem value="betterball_bonus_bogey">Betterball Bonus Bogey</SelectItem>
                              <SelectItem value="pinehurst_points">Multiplication Betterball (Pinehurst)</SelectItem>
                              <SelectItem value="chapman">Greensomes (Chapman/Pinehurst)</SelectItem>
                            </SelectGroup>
                            <SelectGroup><SelectLabel>Full-Group Team</SelectLabel>
                              <SelectItem value="alliance">Alliance</SelectItem>
                              <SelectItem value="texas_scramble">Texas Scramble</SelectItem>
                              <SelectItem value="american_scramble">American Scramble</SelectItem>
                            </SelectGroup>
                            <SelectGroup><SelectLabel>Other</SelectLabel>
                              <SelectItem value="other">Other (specify below)</SelectItem>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                        {form.format2 === "other" && (
                          <Input placeholder="Describe the format…" value={form.format2_custom}
                            onChange={e => setForm(f => ({ ...f, format2_custom: e.target.value }))} />
                        )}
                      </div>
                    </div>
                    {isTeamFmt && (
                      <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 flex items-start gap-2">
                        <Users className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                        <p className="text-xs text-blue-800">
                          <span className="font-semibold">Team format detected.</span>{" "}
                          {isGroupFmt ? "Groups of 2–4 players compete together." : "Players compete in pairs."}{" "}
                          Golfers select a partner when registering. Manage pairings from the Pairings tab after publishing.
                        </p>
                      </div>
                    )}
                    <Card className="bg-muted/30">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="text-sm font-medium">Live scoring</p>
                            <p className="text-xs text-muted-foreground">Enable score submission and leaderboard in the mobile app</p>
                          </div>
                          <Switch checked={!!form.scoring_enabled} onCheckedChange={v => setForm(f => ({ ...f, scoring_enabled: v }))} />
                        </div>
                      </CardContent>
                    </Card>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Divisions (auto-assigned from WHS handicap)</Label>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{form.use_divisions ? "Enabled" : "Disabled"}</span>
                          <Switch checked={form.use_divisions} onCheckedChange={v => setForm(f => ({ ...f, use_divisions: v }))} />
                        </div>
                      </div>
                      {!form.use_divisions ? (
                        <p className="text-xs text-muted-foreground">All golfers compete in a single field.</p>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-medium">
                            <span className="w-20 shrink-0">Division</span>
                            <span style={{ width: 70 }} className="shrink-0">WHS From</span>
                            <span className="shrink-0 invisible">–</span>
                            <span style={{ width: 70 }} className="shrink-0">WHS To</span>
                            <span style={{ width: 260 }} className="shrink-0">Format</span>
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
                                <SelectTrigger className="h-7 text-xs shrink-0" style={{ width: 260 }}><SelectValue /></SelectTrigger>
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
                  </>)}

                  {/* ━━━ STEP 2: PRICING ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
                  {wizardStep === 2 && (<>
                    <Card className="bg-muted/30">
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="text-sm font-medium">Entries required</p>
                            <p className="text-xs text-muted-foreground">Golfers must formally enter — open/close dates apply, and a ballot is used if the field is full.</p>
                          </div>
                          <Switch checked={!!form.entries_required}
                            onCheckedChange={v => setForm(f => ({ ...f, entries_required: v, ballot: v }))} />
                        </div>
                        {!!form.entries_required && (
                          <div className="grid grid-cols-2 gap-3 pt-1">
                            <div className="space-y-1.5">
                              <Label className="text-xs">Entries Open</Label>
                              <Input type="date" className="h-8 text-sm" value={form.entries_open}
                                onChange={e => setForm(f => ({ ...f, entries_open: e.target.value }))} />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs">Entries Close</Label>
                              <Input type="date" className="h-8 text-sm" value={form.entries_close}
                                onChange={e => setForm(f => ({ ...f, entries_close: e.target.value }))} />
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                    <Card className="bg-muted/30">
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="text-sm font-medium">Payment required</p>
                            <p className="text-xs text-muted-foreground">Golfers must pay before their spot is confirmed</p>
                          </div>
                          <Switch checked={!!form.payment_required}
                            onCheckedChange={v => setForm(f => ({ ...f, payment_required: v }))} />
                        </div>
                        {!!form.payment_required && (<>
                          <div className="grid grid-cols-2 gap-3 pt-1">
                            <div className="space-y-1.5">
                              <Label className="text-xs">
                                Entry Fee (ZAR){!form.use_tiered_pricing ? <span className="text-destructive ml-1">*</span> : ""}
                              </Label>
                              <Input type="number" value={form.entry_fee}
                                onChange={e => setForm(f => ({ ...f, entry_fee: e.target.value }))}
                                placeholder={form.use_tiered_pricing ? "Not used (tiered)" : "Required"}
                                disabled={!!form.use_tiered_pricing} />
                              {!form.use_tiered_pricing && (!form.entry_fee || Number(form.entry_fee) <= 0) && (
                                <p className="text-xs text-destructive">Required unless tiered pricing is enabled</p>
                              )}
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs">Max Participants</Label>
                              <div className="flex items-center gap-2 rounded-md border px-3 py-2 bg-muted/40 text-sm text-muted-foreground h-10">
                                <Users className="h-3.5 w-3.5 flex-shrink-0" />
                                {eventSlots.length > 0
                                  ? `${eventSlots.reduce((s, sl) => s + sl.total_slots, 0)} spots`
                                  : "From tee schedule"}
                              </div>
                            </div>
                          </div>
                          <div className="pt-1 border-t space-y-3">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Payment methods</p>
                            {/* Wallet — always enabled, locked */}
                            <div className="flex items-center justify-between gap-4">
                              <div>
                                <p className="text-sm font-medium">Allow wallet</p>
                                <p className="text-xs text-muted-foreground">Golfers can pay from their TapIn wallet balance — always enabled</p>
                              </div>
                              <Switch checked={true} disabled className="opacity-70" />
                            </div>
                            {[
                              { key: "use_tiered_pricing", label: "Tiered pricing",  desc: "Each golfer pays their standard club rate (member, visitor, junior…)" },
                              { key: "allow_prepaid",      label: "Allow prepaid",    desc: "Members can redeem a prepaid round credit" },
                              { key: "allow_voucher",      label: "Allow vouchers",   desc: "Golfers can apply a discount or cancellation voucher" },
                            ].map(opt => (
                              <div key={opt.key} className="flex items-center justify-between gap-4">
                                <div>
                                  <p className="text-sm font-medium">{opt.label}</p>
                                  <p className="text-xs text-muted-foreground">{opt.desc}</p>
                                </div>
                                <Switch checked={!!(form as any)[opt.key]}
                                  onCheckedChange={v => setForm(f => ({ ...f, [opt.key]: v }))} />
                              </div>
                            ))}
                          </div>
                        </>)}
                      </CardContent>
                    </Card>
                    {!!form.payment_required && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <Label className="text-sm font-semibold">Additional Fees</Label>
                            <p className="text-xs text-muted-foreground mt-0.5">Charged on top of the entry fee. Each golfer pays these.</p>
                          </div>
                          <Button type="button" variant="outline" size="sm"
                            onClick={() => setForm(f => ({ ...f, additional_fees: [...(f.additional_fees ?? []), { name: "", amount: 0 }] }))}>
                            + Add Fee
                          </Button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {["Competition Fee", "Two-Club Fee", "Longest Drive Fee", "Nearest the Pin Fee", "Hole-in-One Pool"].map(preset => {
                            const already = (form.additional_fees ?? []).some(f => f.name === preset);
                            return (
                              <button key={preset} type="button" disabled={already}
                                onClick={() => setForm(f => ({ ...f, additional_fees: [...(f.additional_fees ?? []), { name: preset, amount: 0 }] }))}
                                className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                                  already
                                    ? "border-[#1a5c38]/40 text-[#1a5c38] bg-[#1a5c38]/8 cursor-default opacity-50"
                                    : "text-muted-foreground hover:border-primary hover:text-primary"
                                }`}>
                                {already ? "✓" : "+"} {preset}
                              </button>
                            );
                          })}
                        </div>
                        {(form.additional_fees ?? []).map((fee, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <Input className="flex-1" placeholder="Fee name (e.g. Competition Fee)" value={fee.name}
                              onChange={e => setForm(f => { const fees = [...(f.additional_fees ?? [])]; fees[idx] = { ...fees[idx]!, name: e.target.value }; return { ...f, additional_fees: fees }; })} />
                            <div className="relative w-32">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R</span>
                              <Input type="number" min="0" step="0.01" className="pl-7" placeholder="0.00" value={fee.amount || ""}
                                onChange={e => setForm(f => { const fees = [...(f.additional_fees ?? [])]; fees[idx] = { ...fees[idx]!, amount: parseFloat(e.target.value) || 0 }; return { ...f, additional_fees: fees }; })} />
                            </div>
                            <Button type="button" variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive"
                              onClick={() => setForm(f => ({ ...f, additional_fees: (f.additional_fees ?? []).filter((_, i) => i !== idx) }))}>
                              ×
                            </Button>
                          </div>
                        ))}
                        {(form.additional_fees ?? []).length > 0 && (
                          <p className="text-xs text-muted-foreground">Total: R{(form.additional_fees ?? []).reduce((s, f) => s + (f.amount || 0), 0).toFixed(2)} per golfer</p>
                        )}
                      </div>
                    )}
                  </>)}

                  {/* ━━━ STEP 3: TEAMS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
                  {wizardStep === 3 && (<>
                    {isTeamFmt ? (<>
                      <div className="rounded-lg border border-[#1a5c38]/20 bg-[#1a5c38]/5 p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <Users className="h-5 w-5 text-[#1a5c38]" />
                          <span className="text-sm font-semibold text-[#1a5c38]">
                            {isGroupFmt ? "Full-Group Format" : "Two-Player Pair Format"}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {isGroupFmt
                            ? "Groups of 2–4 players compete as a single team. Players select their group when registering, or you can assign pairings from the Pairings tab."
                            : "Players compete in pairs. Each golfer must nominate a partner when registering for this tournament."}
                        </p>
                        <p className="text-xs text-muted-foreground border-t pt-2">
                          After the event is published and players have registered, open the event detail sheet and go to the <strong>Pairings</strong> tab to assign or re-arrange teams.
                        </p>
                      </div>
                      {editId && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                          <p className="text-xs text-amber-700">
                            To manage current pairings for this event, close this dialog and open the <strong>Pairings</strong> tab in the event detail panel.
                          </p>
                        </div>
                      )}
                    </>) : (
                      <div className="py-10 text-center space-y-3">
                        <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto">
                          <Trophy className="h-7 w-7 text-muted-foreground" />
                        </div>
                        <p className="text-sm font-medium">Individual format selected</p>
                        <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                          No team or partner assignments required. All golfers compete as individuals.
                          To use team features, go back to Format and select a Betterball or Scramble format.
                        </p>
                      </div>
                    )}
                  </>)}

                  {/* ━━━ STEP 4: SCHEDULE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
                  {wizardStep === 4 && (<>
                    {/* ── Block full day ──────────────────────────────────────────── */}
                    <div className={`rounded-xl border-2 p-4 flex items-start gap-4 transition-colors ${form.block_full_day ? "border-red-400 bg-red-50" : "border-border bg-muted/30"}`}>
                      <div className="flex-1">
                        <p className="text-sm font-semibold flex items-center gap-1.5">
                          🚫 Block full tournament date/s to public
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Remove <strong>all</strong> public tee time slots across every tournament date. No public bookings will be available on any of these days.
                        </p>
                        {form.block_full_day && (
                          <p className="text-xs text-red-600 font-medium mt-1.5">
                            ⚠ Publishing will cancel and delete all existing public tee time bookings on every tournament date.
                          </p>
                        )}
                      </div>
                      <Switch checked={!!form.block_full_day} onCheckedChange={v => setForm(f => ({ ...f, block_full_day: v }))} />
                    </div>

                    {/* ── Start type ─────────────────────────────────────────────── */}
                    <div>
                      <Label className="text-sm font-semibold mb-2 block">Start Type</Label>
                      <div className="grid grid-cols-2 gap-3">
                        {([
                          {
                            value: false,
                            label: "Interval Start",
                            icon: "🕗",
                            desc: "Groups tee off sequentially at regular intervals (e.g. 7:00, 7:08, 7:16…). Standard for most club competitions.",
                          },
                          {
                            value: true,
                            label: "Shotgun Start",
                            icon: "🔫",
                            desc: "All groups start simultaneously from different holes at the same time. Common for large corporate and charity events.",
                          },
                        ] as const).map(opt => (
                          <button key={String(opt.value)} type="button"
                            onClick={() => setForm(f => ({ ...f, shotgun_start: opt.value }))}
                            className={`text-left rounded-xl border-2 p-4 transition-all ${
                              form.shotgun_start === opt.value
                                ? "border-[#1a5c38] bg-[#1a5c38]/5 shadow-sm"
                                : "border-border bg-background hover:border-[#1a5c38]/40"}`}>
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="text-xl">{opt.icon}</span>
                              <span className={`text-sm font-semibold ${form.shotgun_start === opt.value ? "text-[#1a5c38]" : ""}`}>
                                {opt.label}
                              </span>
                              {form.shotgun_start === opt.value && (
                                <span className="ml-auto text-[10px] font-bold text-white bg-[#1a5c38] rounded-full px-1.5 py-0.5">Selected</span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">{opt.desc}</p>
                          </button>
                        ))}
                      </div>
                      {!!form.shotgun_start && (
                        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 flex items-start gap-2">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                          <p className="text-xs text-amber-700">
                            For shotgun starts, add a <strong>single tee time</strong> below (the common start time). The draw will assign each group a starting hole rather than a start time.
                          </p>
                        </div>
                      )}
                    </div>
                    {!templateMode && form.event_date ? (() => {
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
                          dates.push(cur.toISOString().split("T")[0]!);
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
                              <p className="text-xs text-muted-foreground mt-0.5">These tee slots are exclusive to this tournament.</p>
                            </div>
                            {eventSlots.length > 0 && (
                              <span className="text-xs font-medium text-[#1a5c38] bg-[#1a5c38]/10 px-2 py-1 rounded-full whitespace-nowrap">
                                {eventSlots.length} slot{eventSlots.length !== 1 ? "s" : ""} · {totalSpots} spots
                              </span>
                            )}
                          </div>
                          {/* ── Interval start: prominent generate CTA when no slots exist ── */}
                          {form.shotgun_start === false && eventSlots.length === 0 && !checkingExistingSlots && (
                            <div className="rounded-xl border-2 border-dashed border-[#1a5c38]/40 bg-[#1a5c38]/5 p-5 flex flex-col items-center gap-3 text-center">
                              <Clock className="h-8 w-8 text-[#1a5c38]/50" />
                              <div>
                                <p className="text-sm font-semibold text-[#1a5c38]">No tee schedule yet</p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  Generate tee slots for {tournamentDates.length === 1 ? "this day" : `all ${tournamentDates.length} days`} at once, or use the Generate button on each day below.
                                </p>
                              </div>
                              <Button type="button" size="sm"
                                className="bg-[#1a5c38] hover:bg-[#164d30] text-white h-8 px-4 text-xs gap-1.5"
                                onClick={() => { setGenDialogDate(form.event_date); setGenDialogDateTo(form.end_date || form.event_date); setGenDialogOpen(true); }}>
                                <Clock className="h-3.5 w-3.5" />
                                Generate Tee Schedule
                              </Button>
                            </div>
                          )}
                          {!editId && form.shotgun_start === false && !importBannerDismissed && (checkingExistingSlots || existingGeneralSlots.length > 0) && (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 flex items-start gap-2.5">
                              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                              <div className="flex-1 min-w-0">
                                {checkingExistingSlots ? (
                                  <p className="text-xs text-amber-700 flex items-center gap-1.5">
                                    <Loader2 className="h-3 w-3 animate-spin" />Checking for existing tee slots on this date…
                                  </p>
                                ) : (<>
                                  <p className="text-xs font-semibold text-amber-800">
                                    {existingGeneralSlots.length} existing tee slot{existingGeneralSlots.length !== 1 ? "s" : ""} found
                                  </p>
                                  <p className="text-xs text-amber-700 mt-0.5">Import them as this tournament's exclusive tee times, or leave as public slots.</p>
                                  <div className="flex gap-2 mt-2">
                                    <Button type="button" size="sm" className="h-6 px-2.5 text-xs bg-amber-600 hover:bg-amber-700 text-white"
                                      onClick={handleImportExistingSlots}>Import as tournament tee times</Button>
                                    <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs text-amber-700 hover:bg-amber-100"
                                      onClick={() => setImportBannerDismissed(true)}>Leave as public slots</Button>
                                  </div>
                                </>)}
                              </div>
                            </div>
                          )}
                          {slotsLoading ? (
                            <div className="space-y-2">
                              {tournamentDates.map(d => <div key={d} className="h-20 rounded-lg border bg-muted/20 animate-pulse" />)}
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
                                          {isMultiDay && <span className="text-[10px] font-bold text-white bg-[#1a5c38] rounded px-1.5 py-0.5 shrink-0">Day {idx + 1}</span>}
                                          <span className="text-sm font-semibold">{fmtDate(date)}</span>
                                          <span className="text-[10px] text-muted-foreground">{daySlots.length} slot{daySlots.length !== 1 ? "s" : ""}</span>
                                        </div>
                                        <button type="button"
                                          className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                                          onClick={() => {
                                            if (form.shotgun_start === true) {
                                              setShotgunDlgDate(date); setShotgunDlgOpen(true);
                                            } else {
                                              setGenDialogDate(date); setGenDialogDateTo(date); setGenDialogOpen(true);
                                            }
                                          }}>
                                          <Plus className="h-3 w-3" />Generate
                                        </button>
                                      </div>
                                      {daySlots.length === 0 ? (
                                        <p className="text-[11px] text-amber-600 py-1">No tee times yet — click Generate to build a schedule for this day.</p>
                                      ) : (
                                        <div className="space-y-0.5 max-h-48 overflow-y-auto">
                                          {daySlots.map(slot => {
                                            const isEditing = editingSlotId === slot.id;
                                            if (isEditing) {
                                              return (
                                                <div key={slot.id} className="flex items-center gap-2 py-1.5 px-2 rounded-md bg-muted/60 border border-dashed">
                                                  <Input type="time" className="h-6 text-xs w-24 shrink-0" value={editSlotTime}
                                                    onChange={e => setEditSlotTime(e.target.value)} autoFocus />
                                                  <Input type="number" min={1} max={4} className="h-6 text-xs w-12 shrink-0" value={editSlotPlayers}
                                                    onChange={e => setEditSlotPlayers(Number(e.target.value))} />
                                                  <span className="text-xs text-muted-foreground shrink-0">players</span>
                                                  <button type="button" disabled={slotSaving}
                                                    className="ml-auto h-5 w-5 rounded flex items-center justify-center text-white bg-[#1a5c38] hover:bg-[#164d30] disabled:opacity-50"
                                                    onClick={() => handleSlotUpdate(slot)}>
                                                    <Check className="h-3 w-3" />
                                                  </button>
                                                  <button type="button"
                                                    className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground"
                                                    onClick={() => setEditingSlotId(null)}>
                                                    <X className="h-3 w-3" />
                                                  </button>
                                                </div>
                                              );
                                            }
                                            return (
                                              <div key={slot.id} className="flex items-center gap-2.5 py-1.5 px-2 rounded-md hover:bg-muted group">
                                                <span className="text-sm font-medium tabular-nums">{String(slot.time).slice(0, 5)}</span>
                                                <span className="text-xs text-muted-foreground">{slot.total_slots} players</span>
                                                {slot.id < 0 && <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">new</span>}
                                                {!slot.active && slot.id > 0 && <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">inactive</span>}
                                                <button type="button"
                                                  className="ml-auto h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity"
                                                  onClick={() => { setEditingSlotId(slot.id); setEditSlotTime(String(slot.time).slice(0, 5)); setEditSlotPlayers(slot.total_slots); }}
                                                  title="Edit slot"><Pencil className="h-3 w-3" /></button>
                                                <button type="button"
                                                  className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                                                  onClick={() => {
                                                    if (slot.id > 0) setDeletedSlotIds(prev => [...prev, slot.id]);
                                                    setEventSlots(prev => prev.filter(s => s.id !== slot.id));
                                                  }}
                                                  title="Remove slot"><X className="h-3 w-3" /></button>
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
                          {!editId && form.shotgun_start === false && eventSlots.length > 0 && (
                            <Button type="button" variant="outline" size="sm"
                              className="w-full h-7 text-xs border-[#1a5c38]/30 text-[#1a5c38] hover:bg-[#1a5c38]/5 gap-1.5"
                              onClick={() => { setGenDialogDate(form.event_date); setGenDialogDateTo(form.end_date || form.event_date); setGenDialogOpen(true); }}>
                              <Plus className="h-3 w-3" />Re-generate / Add more days
                            </Button>
                          )}
                        </div>
                      );
                    }) : (() => (
                      <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4 space-y-3">
                        {!templateMode && (
                          <div className="flex items-start gap-3">
                            <Clock className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm font-medium">No tournament date set</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Tee slot generation requires a date. You can still configure your schedule settings now and save them with this template.
                              </p>
                            </div>
                          </div>
                        )}
                        <Button type="button" variant="outline" size="sm"
                          className="h-8 text-xs border-[#1a5c38]/40 text-[#1a5c38] hover:bg-[#1a5c38]/5"
                          onClick={() => {
                            if (form.shotgun_start === true) {
                              setShotgunDlgDate(""); setShotgunDlgOpen(true);
                            } else {
                              setGenDialogDate(form.event_date); setGenDialogDateTo(form.end_date || form.event_date); setGenDialogOpen(true);
                            }
                          }}>
                          <Clock className="h-3.5 w-3.5 mr-1.5" />
                          Configure {form.shotgun_start === true ? "Shotgun" : "Interval"} Schedule Settings
                        </Button>
                        {teeConfigSnapshot && (
                          <p className="text-xs text-[#1a5c38] flex items-center gap-1.5 font-medium">
                            <span className="text-base leading-none">✓</span> Schedule config saved — will be included in template
                          </p>
                        )}
                      </div>
                    ))()}
                  </>)}

                  {/* ━━━ STEP 5: REVIEW ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
                  {wizardStep === 5 && (<>
                    <p className="text-sm text-muted-foreground">Review your configuration before {editId ? "updating" : "creating"} the tournament.</p>
                    <div className="grid gap-3">
                      <Card className="bg-card">
                        <CardContent className="p-4 space-y-2">
                          <div className="flex items-center gap-2 mb-1">
                            <Calendar className="h-4 w-4 text-[#1a5c38]" />
                            <span className="text-sm font-semibold">Details</span>
                            <button type="button" onClick={() => setWizardStep(0)} className="ml-auto text-xs text-[#1a5c38] hover:underline">Edit</button>
                          </div>
                          <div className="space-y-1 text-xs">
                            <div className="flex justify-between"><span className="text-muted-foreground">Name</span><span className={`font-medium truncate max-w-[220px] ${!form.name ? "text-destructive" : ""}`}>{form.name || "Not set ⚠"}</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span className={!form.event_date ? "text-destructive" : ""}>{form.event_date ? fmtDate(form.event_date) : "Not set ⚠"}{form.end_date ? ` – ${fmtDate(form.end_date)}` : ""}</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Holes / Rounds</span><span>{form.holes} holes, {computeDays(form.event_date, form.end_date) * form.rounds_per_day} total rounds</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span>{TYPE_LABELS[form.event_type] ?? form.event_type}</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Access</span><span>{RESTRICT_LABELS[form.restriction] ?? form.restriction}</span></div>
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="bg-card">
                        <CardContent className="p-4 space-y-2">
                          <div className="flex items-center gap-2 mb-1">
                            <Trophy className="h-4 w-4 text-[#1a5c38]" />
                            <span className="text-sm font-semibold">Format</span>
                            <button type="button" onClick={() => setWizardStep(1)} className="ml-auto text-xs text-[#1a5c38] hover:underline">Edit</button>
                          </div>
                          <div className="space-y-1 text-xs">
                            <div className="flex justify-between"><span className="text-muted-foreground">Format 1</span><span>{FORMAT_LABELS[form.format] ?? form.format}</span></div>
                            {form.format2 && <div className="flex justify-between"><span className="text-muted-foreground">Format 2</span><span>{FORMAT_LABELS[form.format2] ?? form.format2}</span></div>}
                            <div className="flex justify-between"><span className="text-muted-foreground">Live Scoring</span><span>{form.scoring_enabled ? "Enabled" : "Disabled"}</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Divisions</span><span>{form.use_divisions ? `${form.divisions.length} divisions` : "Single field"}</span></div>
                            {isTeamFmt && <div className="flex justify-between"><span className="text-muted-foreground">Team type</span><span className="text-[#1a5c38] font-medium">{isGroupFmt ? "Full group" : "Pairs"}</span></div>}
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="bg-card">
                        <CardContent className="p-4 space-y-2">
                          <div className="flex items-center gap-2 mb-1">
                            <CreditCard className="h-4 w-4 text-[#1a5c38]" />
                            <span className="text-sm font-semibold">Pricing</span>
                            <button type="button" onClick={() => setWizardStep(2)} className="ml-auto text-xs text-[#1a5c38] hover:underline">Edit</button>
                          </div>
                          <div className="space-y-1 text-xs">
                            <div className="flex justify-between"><span className="text-muted-foreground">Entries</span><span>{form.entries_required ? "Required" : "Open (tee booking)"}</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Payment</span><span>{form.payment_required ? "Required" : "Free"}</span></div>
                            {form.payment_required && !form.use_tiered_pricing && (
                              <div className="flex justify-between"><span className="text-muted-foreground">Entry Fee</span><span className={(!form.entry_fee || Number(form.entry_fee) <= 0) ? "text-amber-600" : ""}>{form.entry_fee ? `R${form.entry_fee}` : "Not set ⚠"}</span></div>
                            )}
                            {form.payment_required && form.use_tiered_pricing && (
                              <div className="flex justify-between"><span className="text-muted-foreground">Pricing</span><span>Tiered (by golfer type)</span></div>
                            )}
                            {(form.additional_fees ?? []).length > 0 && (
                              <div className="flex justify-between"><span className="text-muted-foreground">Add. fees</span><span>{(form.additional_fees ?? []).length} × (R{(form.additional_fees ?? []).reduce((s, f) => s + (f.amount || 0), 0).toFixed(0)} total)</span></div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="bg-card">
                        <CardContent className="p-4 space-y-2">
                          <div className="flex items-center gap-2 mb-1">
                            <Clock className="h-4 w-4 text-[#1a5c38]" />
                            <span className="text-sm font-semibold">Schedule</span>
                            <button type="button" onClick={() => setWizardStep(4)} className="ml-auto text-xs text-[#1a5c38] hover:underline">Edit</button>
                          </div>
                          <div className="space-y-1 text-xs">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Start type</span>
                              <span className={`font-medium ${form.shotgun_start === true ? "text-[#1a5c38]" : ""}`}>
                                {form.shotgun_start === true ? "🔫 Shotgun" : form.shotgun_start === false ? "🕗 Interval" : "—"}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Tee slots</span>
                              <span>{eventSlots.length > 0
                                ? `${eventSlots.length} slot${eventSlots.length !== 1 ? "s" : ""} · ${eventSlots.reduce((s, sl) => s + sl.total_slots, 0)} spots`
                                : teeConfigSnapshot
                                  ? <span className="text-[#1a5c38] font-medium">✓ Schedule config saved</span>
                                  : <span className="italic text-muted-foreground">None configured yet</span>
                              }</span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                  </>)}
                </div>

                {/* ── Navigation ───────────────────────────────────────────────── */}
                <div className="flex items-center gap-2 pt-4 border-t mt-2">
                  <Button type="button" variant="outline"
                    onClick={() => wizardStep === 0 ? setDlgOpen(false) : setWizardStep(w => w - 1)}>
                    {wizardStep === 0 ? "Cancel" : "← Back"}
                  </Button>
                  <div className="flex-1" />
                  {wizardStep < 5 ? (
                    <Button type="button"
                      disabled={wizardStep === 4 && form.shotgun_start === null}
                      onClick={() => setWizardStep(w => w + 1)}
                      className="bg-[#1a5c38] hover:bg-[#164d30] disabled:opacity-40">
                      Next →
                    </Button>
                  ) : templateMode ? (
                    <Button type="button" onClick={() => doSaveTemplate(form.name)}
                      disabled={savingTpl || !form.name.trim()}
                      className="bg-[#1a5c38] hover:bg-[#164d30]">
                      {savingTpl ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Saving…</> : selectedTplId !== null ? <><BookmarkPlus className="h-4 w-4 mr-1.5" />Update Template</> : <><BookmarkPlus className="h-4 w-4 mr-1.5" />Save Template</>}
                    </Button>
                  ) : (
                    <Button type="button" onClick={handleSave}
                      disabled={saving || readOnly || !form.name || !form.event_date}
                      className="bg-[#1a5c38] hover:bg-[#164d30]">
                      {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Saving…</> : editId ? "Update Tournament" : "Create Tournament"}
                    </Button>
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Tee schedule generation dialog — works for both new and existing events */}
      <GenerateTeeTimesDialog
        open={genDialogOpen}
        onOpenChange={setGenDialogOpen}
        initialDate={genDialogDate || undefined}
        initialDateTo={genDialogDateTo || undefined}
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

      {/* ── Shotgun Start Generator ─────────────────────────────────────── */}
      {(() => {
        const par3Excluded = shotgunDoubleTee && shotgunDoubleTeeMode === "exclude_par3";
        const par3Count    = par3Excluded ? shotgunPar3Holes.size : 0;
        const doubleHoles  = par3Excluded ? shotgunHoles - par3Count : shotgunHoles;
        const singleHoles  = par3Excluded ? par3Count : 0;
        const groupsPerSession = shotgunDoubleTee ? doubleHoles * 2 + singleHoles : shotgunHoles;
        const sessions     = shotgunTwoSessions ? 2 : 1;
        const totalGroups  = groupsPerSession * sessions;
        const totalPlayers = totalGroups * shotgunPPG;
        const sessionTimes = shotgunTwoSessions ? [shotgunAmTime, shotgunPmTime] : [shotgunTime];

        const handleGenerate = () => {
          // Always capture config snapshot (used by template save)
          setTeeConfigSnapshot({
            config_type: "B",
            config_data: {
              shotgun_holes: shotgunHoles,
              shotgun_ppg: shotgunPPG,
              shotgun_two_sessions: shotgunTwoSessions,
              shotgun_time: shotgunTime,
              shotgun_am_time: shotgunAmTime,
              shotgun_pm_time: shotgunPmTime,
              shotgun_double_tee: shotgunDoubleTee,
              shotgun_double_tee_mode: shotgunDoubleTeeMode,
              shotgun_par3_holes: [...shotgunPar3Holes],
            },
          });
          // Config-only mode (no date = template setup, no slots to create)
          if (!shotgunDlgDate) {
            setShotgunDlgOpen(false);
            return;
          }
          const slotsToCreate = sessionTimes.map(time => ({
            date: shotgunDlgDate,
            time,
            total_slots: groupsPerSession * shotgunPPG,
          }));
          if (editId) {
            // Persist double-tee + par3 config on the event so draw generation can use them
            api(`/api/portal/events/${editId}`, {
              method: "PATCH",
              body: JSON.stringify({
                shotgun_double_tee: shotgunDoubleTee ? 1 : 0,
                shotgun_par3_holes: par3Excluded ? [...shotgunPar3Holes] : [],
              }),
            }).catch(() => {});
            Promise.all(slotsToCreate.map(s =>
              api("/api/portal/tee-times", {
                method: "POST",
                body: JSON.stringify({ ...s, active: true, event_id: editId }),
              })
            )).then(() => loadEventSlots(editId)).catch(() => {});
          } else {
            setEventSlots(prev => {
              const withoutDate = prev.filter(s => String(s.date).slice(0, 10) !== shotgunDlgDate);
              const newSlots = slotsToCreate.map(s => ({
                id: tempSlotCounter.current--,
                date: s.date,
                time: s.time,
                total_slots: s.total_slots,
                active: true,
              }));
              return [...withoutDate, ...newSlots];
            });
          }
          setShotgunDlgOpen(false);
        };

        return (
          <Dialog open={shotgunDlgOpen} onOpenChange={setShotgunDlgOpen}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span>🔫</span> Generate Shotgun Schedule
                </DialogTitle>
                <DialogDescription>
                  {shotgunDlgDate ? fmtDate(shotgunDlgDate) + " · " : ""}All groups start simultaneously from different holes.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-5 py-1">

                {/* ── Holes + Players per group ─── */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Number of Holes</Label>
                    <div className="flex gap-2">
                      {([9, 18] as const).map(n => (
                        <button key={n} type="button"
                          onClick={() => {
                            setShotgunHoles(n);
                            setShotgunPar3Holes(new Set(DEFAULT_PAR3[n]));
                          }}
                          className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${shotgunHoles === n ? "text-white border-[#1a5c38] bg-[#1a5c38]" : "border-border text-foreground hover:border-[#1a5c38]/40"}`}>
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Players per Group</Label>
                    <div className="flex gap-1.5">
                      {[2, 3, 4].map(n => (
                        <button key={n} type="button"
                          onClick={() => setShotgunPPG(n)}
                          className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${shotgunPPG === n ? "text-white border-[#1a5c38] bg-[#1a5c38]" : "border-border text-foreground hover:border-[#1a5c38]/40"}`}>
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* ── Two sessions (AM + PM) ─── */}
                <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Two Sessions (AM + PM)</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Run a morning and afternoon field on the same day</p>
                    </div>
                    <button type="button"
                      onClick={() => setShotgunTwoSessions(v => !v)}
                      className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ml-3"
                      style={{ background: shotgunTwoSessions ? "#1a5c38" : "#d1d5db" }}>
                      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${shotgunTwoSessions ? "translate-x-4" : "translate-x-0.5"}`} />
                    </button>
                  </div>
                  {shotgunTwoSessions ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs font-medium flex items-center gap-1.5">
                          <span className="inline-block w-2 h-2 rounded-full bg-[#1a5c38]" />AM Start
                        </Label>
                        <input type="time" value={shotgunAmTime} onChange={e => setShotgunAmTime(e.target.value)}
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-[#1a5c38]" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-medium flex items-center gap-1.5">
                          <span className="inline-block w-2 h-2 rounded-full bg-[#7c3aed]" />PM Start
                        </Label>
                        <input type="time" value={shotgunPmTime} onChange={e => setShotgunPmTime(e.target.value)}
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-[#1a5c38]" />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <Label className="text-xs font-medium">Start Time</Label>
                      <input type="time" value={shotgunTime} onChange={e => setShotgunTime(e.target.value)}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-[#1a5c38]" />
                    </div>
                  )}
                </div>

                {/* ── Double-teeing ─── */}
                <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Double-Teeing</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Two groups start from the same hole (A + B groups)</p>
                    </div>
                    <button type="button"
                      onClick={() => setShotgunDoubleTee(v => !v)}
                      className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ml-3"
                      style={{ background: shotgunDoubleTee ? "#1a5c38" : "#d1d5db" }}>
                      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${shotgunDoubleTee ? "translate-x-4" : "translate-x-0.5"}`} />
                    </button>
                  </div>

                  {shotgunDoubleTee && (
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        {([["all", "All holes"], ["exclude_par3", "Exclude par 3s"]] as const).map(([v, lbl]) => (
                          <button key={v} type="button"
                            onClick={() => setShotgunDoubleTeeMode(v)}
                            className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition-all ${shotgunDoubleTeeMode === v ? "text-white border-[#1a5c38] bg-[#1a5c38]" : "border-border text-foreground hover:border-[#1a5c38]/40"}`}>
                            {lbl}
                          </button>
                        ))}
                      </div>

                      {shotgunDoubleTeeMode === "exclude_par3" && (
                        <div className="space-y-1.5">
                          <p className="text-xs text-muted-foreground">Mark your par 3 holes (they will only have one group):</p>
                          <div className="flex flex-wrap gap-1.5">
                            {Array.from({ length: shotgunHoles }, (_, i) => i + 1).map(hole => {
                              const isPar3 = shotgunPar3Holes.has(hole);
                              return (
                                <button key={hole} type="button"
                                  onClick={() => setShotgunPar3Holes(prev => {
                                    const next = new Set(prev);
                                    next.has(hole) ? next.delete(hole) : next.add(hole);
                                    return next;
                                  })}
                                  className={`w-8 h-8 rounded-lg border text-xs font-bold transition-all ${isPar3 ? "bg-amber-500 border-amber-500 text-white" : "border-border text-muted-foreground hover:border-[#1a5c38]/40"}`}
                                  title={isPar3 ? `Hole ${hole} — par 3 (single group)` : `Hole ${hole} — double tee`}>
                                  {hole}
                                </button>
                              );
                            })}
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            <span className="inline-block w-3 h-3 rounded bg-amber-500 align-middle mr-1" />amber = par 3 (single group)
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* ── Capacity summary ─── */}
                <div className="rounded-lg border border-[#1a5c38]/20 bg-[#1a5c38]/5 px-4 py-3 space-y-1.5 text-xs">
                  <p className="text-xs font-semibold text-[#1a5c38] mb-2">Capacity Summary</p>
                  {shotgunTwoSessions && (
                    <>
                      <div className="flex justify-between">
                        <span className="flex items-center gap-1.5 text-muted-foreground"><span className="w-2 h-2 rounded-full bg-[#1a5c38]" />AM Session ({shotgunAmTime})</span>
                        <span className="font-medium">{groupsPerSession} groups · {groupsPerSession * shotgunPPG} players</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="flex items-center gap-1.5 text-muted-foreground"><span className="w-2 h-2 rounded-full bg-[#7c3aed]" />PM Session ({shotgunPmTime})</span>
                        <span className="font-medium">{groupsPerSession} groups · {groupsPerSession * shotgunPPG} players</span>
                      </div>
                      <div className="border-t border-[#1a5c38]/20 pt-1.5 flex justify-between font-semibold text-[#1a5c38]">
                        <span>Total</span>
                        <span>{totalGroups} groups · {totalPlayers} players</span>
                      </div>
                    </>
                  )}
                  {!shotgunTwoSessions && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Groups</span>
                        <span className="font-medium">{groupsPerSession}</span>
                      </div>
                      {shotgunDoubleTee && shotgunDoubleTeeMode === "exclude_par3" && par3Count > 0 && (
                        <div className="flex justify-between text-amber-700">
                          <span>Par 3 holes (single group)</span>
                          <span className="font-medium">{par3Count} holes</span>
                        </div>
                      )}
                      <div className="flex justify-between font-semibold text-[#1a5c38]">
                        <span>Total capacity</span>
                        <span>{totalPlayers} players</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setShotgunDlgOpen(false)}>Cancel</Button>
                <Button className="bg-[#1a5c38] hover:bg-[#1a5c38]/90" onClick={handleGenerate}>
                  {shotgunDlgDate ? (sessions > 1 ? `Generate ${sessions} Slots` : "Generate Schedule") : <><BookmarkPlus className="h-3.5 w-3.5 mr-1.5" />Save Config to Template</>}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* ── Delete Template Dialog ────────────────────────────────────────────── */}
      <Dialog open={!!deleteTplDlg?.open} onOpenChange={o => { if (!o) setDeleteTplDlg(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-4 w-4" /> Delete Template
            </DialogTitle>
            <DialogDescription>
              You are about to permanently delete the template <span className="font-semibold text-foreground">"{deleteTplDlg?.name}"</span>.
              This cannot be undone — the template and all its saved settings will be gone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTplDlg(null)}>Keep Template</Button>
            <Button variant="destructive" onClick={handleDeleteTemplate}>Delete Permanently</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            {conflictDialog.teeSlots.length > 0
              ? "This shotgun tournament requires exclusive use of the course. The items below fall within the occupied window and must be cleared before publishing."
              : "This tournament's dates overlap with the following existing items. You must resolve all conflicts before publishing. Affected golfers will be notified automatically."}
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

          {/* Conflicting general tee slots in shotgun window */}
          {conflictDialog.teeSlots.length > 0 && (
            <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 space-y-2">
              <p className="text-sm font-semibold text-orange-800 flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                {conflictDialog.teeSlots.length} General Tee Slot{conflictDialog.teeSlots.length !== 1 ? "s" : ""} Will Be Removed from Schedule
              </p>
              <div className="max-h-36 overflow-y-auto space-y-1">
                {conflictDialog.teeSlots.map(s => (
                  <div key={s.id} className="flex items-center justify-between text-xs bg-white rounded px-2 py-1 border border-orange-100">
                    <span className="font-mono font-medium">{fmtDate(s.date)}</span>
                    <span className="text-muted-foreground font-mono">{String(s.tee_time).slice(0, 5)}</span>
                    <span className={s.booking_count > 0 ? "text-red-600 font-medium" : "text-muted-foreground"}>
                      {s.booking_count > 0 ? `${s.booking_count} booking${s.booking_count !== 1 ? "s" : ""} cancelled` : "no bookings"}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-orange-700">
                These slots fall within the shotgun tournament's course window. They will be permanently removed and any bookings cancelled.
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
      )}
    </div>
  );
}
