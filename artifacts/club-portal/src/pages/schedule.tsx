import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useLocation } from "wouter";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useReadOnly } from "@/context/ReadOnlyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ChevronLeft, ChevronRight, Pencil, Trash2, RefreshCw,
  CalendarCog, Plus, Loader2, ArrowRight, BookmarkPlus, FolderOpen, X,
  Zap, Play, Clock, ChevronDown, ChevronUp, AlertTriangle,
  Search, UserPlus, Users,
} from "lucide-react";
import { format, addDays, parseISO, subDays } from "date-fns";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface AutoRule {
  id: number;
  name: string;
  season_start: string;
  season_end: string;
  lookahead_days: number;
  lookback_days: number;
  players_per_slot: number;
  config_type: string;
  config_data: any;
  blocked_days: number[];
  active: boolean;
  last_run_at: string | null;
}

interface RuleForm {
  name: string;
  season_start_month: string;
  season_start_day: string;
  season_end_month: string;
  season_end_day: string;
  lookahead_days: number;
  lookback_days: number;
  players_per_slot: number;
  config_type: string;
  config_data: any;
  blocked_days: number[];
  active: boolean;
}

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOW_ORDER  = [1, 2, 3, 4, 5, 6, 0]; // Mon → Sun

const MONTHS = [
  { v: "01", l: "January" }, { v: "02", l: "February" }, { v: "03", l: "March" },
  { v: "04", l: "April"   }, { v: "05", l: "May"      }, { v: "06", l: "June"     },
  { v: "07", l: "July"    }, { v: "08", l: "August"   }, { v: "09", l: "September"},
  { v: "10", l: "October" }, { v: "11", l: "November" }, { v: "12", l: "December" },
];
const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, "0"));

const DEFAULT_RULE_FORM: RuleForm = {
  name: "", season_start_month: "09", season_start_day: "01",
  season_end_month: "04", season_end_day: "30",
  lookahead_days: 14, lookback_days: 0, players_per_slot: 4,
  config_type: "A", config_data: {}, blocked_days: [], active: true,
};

interface TeeTime {
  id: number;
  date: string;
  time: string;
  price: number;
  price_9: number | null;
  total_slots: number;
  player_count?: number;
  active: boolean;
  promotional_price: number | null;
  tee_start_type: "first_tee" | "two_tee" | "tenth_tee";
  crossover_enabled: boolean;
  blocked_slots: number[];
  event_id?: number | null;
  event_name?: string | null;
  shotgun_start?: boolean | number | null;
}

interface Booking {
  id: number;
  tee_time_id: number;
  booking_ref: string;
  players: number;
  total_amount: number;
  payment_method: string;
  status: string;
  split_bill: boolean;
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  date: string;
  time: string;
  tee_price: number;
  voucher_code: string | null;
  player_names: string[];
  // Per-player paid flags (0/1) from booking_players, ordered by bp.id.
  // Only populated for split-bill bookings. Used to colour each slot independently.
  player_paid: (0 | 1)[];
  booking_source?: string;
}

type SlotKind =
  | { kind: "open"; price: number }
  | { kind: "unavailable" }
  | { kind: "na" }
  | { kind: "blocked"; slotIndex: number }
  // effectiveStatus: booking status for non-split bookings; per-player
  // "confirmed" / "pending" for split-bill bookings.
  | { kind: "booked"; booking: Booking; playerIndex: number; effectiveStatus: string };

interface Block {
  start: string;
  end: string;
  interval: number;
  tee_start_type: "first_tee" | "two_tee";
  crossover_enabled: boolean;
}

interface DrawEntry {
  event_id: number;
  round: number;
  tee_date: string;
  tee_time: string;
  draw_group: number;
  starting_tee: number;
  user_name: string;
  division: string | null;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function today() { return format(new Date(), "yyyy-MM-dd"); }
function inDays(n: number, from?: string) {
  return format(addDays(from ? parseISO(from + "T00:00:00") : new Date(), n), "yyyy-MM-dd");
}

function toMin(t: string) { const [h, m] = t.split(":").map(Number); return h * 60 + m; }
function fromMin(m: number) { return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; }
function blockCount(start: string, end: string, interval: number) {
  const diff = toMin(end) - toMin(start);
  return diff < 0 ? 1 : Math.floor(diff / interval) + 1;
}
function lastTime(start: string, count: number, interval: number) { return fromMin(toMin(start) + (count - 1) * interval); }

function generateBlockTimes(start: string, end: string, intervalMin: number): string[] {
  if (!start || !end || intervalMin < 1) return [];
  let cur = toMin(start);
  const endMin = toMin(end);
  const times: string[] = [];
  while (cur <= endMin) { times.push(fromMin(cur)); cur += intervalMin; }
  return times;
}

function datesInRange(from: string, to: string): string[] {
  const dates: string[] = [];
  let cur = parseISO(from + "T00:00:00");
  const end = parseISO(to + "T00:00:00");
  while (cur <= end) { dates.push(format(cur, "yyyy-MM-dd")); cur = addDays(cur, 1); }
  return dates;
}

function buildSlots(tt: TeeTime, bookings: Booking[]): SlotKind[] {
  const COLS = 4;
  const blocked = new Set(tt.blocked_slots ?? []);
  if (!tt.active) return Array.from({ length: COLS }, (_, i) => i < tt.total_slots ? { kind: "unavailable" } : { kind: "na" });
  // Initialise: na past total_slots, individually blocked, otherwise open.
  const slots: SlotKind[] = Array.from({ length: COLS }, (_, i) => {
    if (i >= tt.total_slots) return { kind: "na" };
    if (blocked.has(i)) return { kind: "blocked", slotIndex: i };
    return { kind: "open", price: tt.price };
  });
  // Fill bookings into non-blocked open slots left-to-right.
  let fillIdx = 0;
  for (const b of bookings) {
    if (b.status === "cancelled") continue;
    for (let p = 0; p < b.players; p++) {
      while (fillIdx < COLS && slots[fillIdx].kind !== "open") fillIdx++;
      if (fillIdx >= COLS) break;
      // For split-bill bookings colour each slot by that player's individual paid flag.
      // For non-split bookings the whole booking status applies to every slot.
      let effectiveStatus = b.status;
      if (b.split_bill && b.player_paid && b.player_paid.length > p) {
        effectiveStatus = (b.player_paid[p] === 1 || b.player_paid[p] as any === true)
          ? "confirmed"
          : "pending";
      }
      slots[fillIdx] = { kind: "booked", booking: b, playerIndex: p, effectiveStatus };
      fillIdx++;
    }
  }
  // If player_count from DB is higher than what bookings filled (e.g. stale bookings not yet loaded),
  // mark remaining open slots as unavailable so staff can't double-book.
  const dbPlayerCount = tt.player_count ?? 0;
  if (dbPlayerCount > fillIdx) {
    let extra = dbPlayerCount - fillIdx;
    for (let i = 0; i < COLS && extra > 0; i++) {
      if (slots[i].kind === "open") { slots[i] = { kind: "unavailable" }; extra--; }
    }
  }
  return slots;
}

const STATUS_BADGE: Record<string, string> = {
  confirmed: "bg-green-100 text-green-700 border-green-200",
  pending: "bg-yellow-100 text-yellow-700 border-yellow-300",
  cancelled: "bg-red-100 text-red-600 border-red-200",
  completed: "bg-blue-100 text-blue-700 border-blue-200",
};
const STATUS_LABEL: Record<string, string> = {
  confirmed: "Confirmed",
  pending: "Pending Payment",
  cancelled: "Cancelled",
  completed: "Completed",
};
const CELL_BG: Record<string, string> = {
  open: "text-gray-400",
  unavailable: "bg-red-50 text-red-500",
  blocked: "bg-orange-50 text-orange-600 ring-1 ring-inset ring-orange-200",
  na: "text-gray-300",
  confirmed: "bg-[#1a5c38] text-white",
  pending: "bg-yellow-50 text-yellow-900 ring-1 ring-inset ring-yellow-300",
  cancelled: "bg-red-50 text-red-400 line-through",
  completed: "bg-blue-50 text-blue-700",
};
function slotBg(s: SlotKind) {
  if (s.kind === "open") return CELL_BG.open;
  if (s.kind === "unavailable") return CELL_BG.unavailable;
  if (s.kind === "blocked") return CELL_BG.blocked;
  if (s.kind === "na") return CELL_BG.na;
  return CELL_BG[s.effectiveStatus] ?? CELL_BG.pending;
}

// ─── Config A defaults ────────────────────────────────────────────────────────

const CFG_A_DEFAULT = {
  morning:  { start: "07:00", end: "08:04", interval: 8, tee_start_type: "two_tee" as const, crossover_enabled: false },
  midday:   { start: "11:00", end: "12:44", interval: 8, tee_start_type: "two_tee" as const, crossover_enabled: false },
  twilight: { start: "17:00", end: "17:24", interval: 8, tee_start_type: "two_tee" as const, crossover_enabled: false },
  crossoverGapMin: 176,
  fieldResetGapMin: 256,
};
const CFG_B_DEFAULT = {
  morning:  { start: "07:00", end: "08:04", interval: 8,  tee_start_type: "first_tee" as const, crossover_enabled: false },
  midday:   { start: "10:44", end: "13:00", interval: 8,  tee_start_type: "first_tee" as const, crossover_enabled: false },
  crossoverGapMin: 160,
};

// ─── Block editor sub-component ───────────────────────────────────────────────

const MAX_SLOTS = 60;

function BlockEditor({
  label, color, headerBg, block, onChange, lockedStart, lockTeeType, maxSlots, latestEnd,
}: {
  label: string;
  color: string;
  headerBg: string;
  block: Block;
  onChange: (b: Partial<Block>) => void;
  lockedStart?: boolean;
  lockTeeType?: boolean;
  maxSlots?: number;
  latestEnd?: string;
}) {
  const slotCap = maxSlots ?? MAX_SLOTS;

  // Derive current count from start/end/interval
  const count = blockCount(block.start, block.end, block.interval);

  // When count changes: recalculate end, keep start & interval
  const handleCountChange = (newCount: number) => {
    onChange({ end: lastTime(block.start, newCount, block.interval) });
  };

  // When start changes: keep count, recalculate end
  const handleStartChange = (newStart: string) => {
    onChange({ start: newStart, end: lastTime(newStart, count, block.interval) });
  };

  // When interval changes: keep count, recalculate end
  const handleIntervalChange = (newInterval: number) => {
    if (newInterval < 1) return;
    onChange({ interval: newInterval, end: lastTime(block.start, count, newInterval) });
  };

  // Build dropdown options: 1 → slotCap, filtered so end never reaches latestEnd
  const countOptions = Array.from({ length: slotCap }, (_, i) => i + 1)
    .filter(n => !latestEnd || lastTime(block.start, n, block.interval) < latestEnd)
    .map(n => ({
      value: n,
      label: `${n} slot${n > 1 ? "s" : ""} — ends ${lastTime(block.start, n, block.interval)}`,
    }));

  return (
    <div className={`rounded-lg border-l-4 ${color} border border-gray-200 overflow-hidden shadow-sm`}>
      {/* Coloured header band */}
      <div className={`${headerBg} px-3 py-2 flex items-center justify-between`}>
        <span className="font-bold text-sm text-white tracking-wide">{label}</span>
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-white/20 text-white">
          {block.tee_start_type === "two_tee" ? "Two-Tee Start" : "1st Tee Only"}
        </span>
      </div>
      <div className="bg-white p-3 space-y-2">

      <div className="grid grid-cols-3 gap-2">
        {/* First tee time */}
        <div>
          <Label className="text-xs mb-1 block">First Tee Time</Label>
          {lockedStart ? (
            <div className="h-8 flex items-center px-2 rounded-md border bg-[#1a5c38]/5 border-[#1a5c38]/30">
              <span className="font-mono text-xs font-semibold text-[#1a5c38]">{block.start}</span>
            </div>
          ) : (
            <Input
              type="time"
              value={block.start}
              onChange={e => handleStartChange(e.target.value)}
              className="h-8 text-xs"
            />
          )}
        </div>

        {/* Number of slots → drives the last tee time */}
        <div>
          <Label className="text-xs mb-1 block">Number of Slots</Label>
          <Select
            value={String(count)}
            onValueChange={v => handleCountChange(Number(v))}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-56">
              {countOptions.map(o => (
                <SelectItem key={o.value} value={String(o.value)} className="text-xs">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Interval */}
        <div>
          <Label className="text-xs mb-1 block">Interval (min)</Label>
          <Input
            type="number"
            min={1}
            max={60}
            value={block.interval}
            onChange={e => handleIntervalChange(Number(e.target.value))}
            className="h-8 text-xs"
          />
        </div>
      </div>

      {/* Calculated last tee time (read-only) + tee start type */}
      <div className="flex items-center gap-4 pt-0.5">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>Last tee time:</span>
          <span className="font-mono font-semibold text-[#1a5c38] bg-green-50 px-2 py-0.5 rounded">
            {block.end}
          </span>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <Label className="text-xs">Tee Start</Label>
          <Select
            value={lockTeeType ? "first_tee" : block.tee_start_type}
            onValueChange={(v: "first_tee" | "two_tee") => onChange({ tee_start_type: v })}
            disabled={lockTeeType}
          >
            <SelectTrigger className={`h-7 text-xs w-36 ${lockTeeType ? "opacity-50 cursor-not-allowed" : ""}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="first_tee">1st Tee Only</SelectItem>
              {!lockTeeType && <SelectItem value="two_tee">Two-Tee Start</SelectItem>}
            </SelectContent>
          </Select>
        </div>
      </div>
      </div>{/* /bg-white */}
    </div>
  );
}

// ─── Generate Schedule Dialog ─────────────────────────────────────────────────

function GenerateDialog({
  open, onOpenChange, onComplete,
}: { open: boolean; onOpenChange: (v: boolean) => void; onComplete: (dateFrom: string) => void }) {
  const { toast } = useToast();
  const readOnly = useReadOnly();
  const [tab, setTab] = useState<"A" | "B">("A");
  const [dateFrom, setDateFrom] = useState(today());
  const [dateTo, setDateTo]   = useState(today());
  const slots = 4;
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [tournamentConflicts, setTournamentConflicts] = useState<Array<{ date: string; time: string; event_name: string }>>([]);
  const [conflictsLoading, setConflictsLoading] = useState(false);

  // Saved configs state
  const [savedConfigs, setSavedConfigs] = useState<Array<{ id: number; name: string; config_type: string; config_data: any }>>([]);
  const [loadingConfigs, setLoadingConfigs] = useState(false);
  const [showSavePanel, setShowSavePanel] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Config A block state
  const [cfgA, setCfgA] = useState({ ...CFG_A_DEFAULT });
  const updateA = (key: "morning" | "midday" | "twilight") => (patch: Partial<Block>) =>
    setCfgA(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  // Config B block state
  const [cfgB, setCfgB] = useState({ ...CFG_B_DEFAULT });
  const updateB = (key: "morning" | "midday") => (patch: Partial<Block>) =>
    setCfgB(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  // Live preview
  const preview = useMemo(() => {
    const dates = datesInRange(dateFrom, dateTo);
    let slots_per_day: Array<{ time: string; tee_start_type: string; crossover_enabled: boolean }> = [];
    if (tab === "A") {
      const toEntries = (b: Block) => {
        const times = generateBlockTimes(b.start, b.end, b.interval);
        if (b.tee_start_type === "two_tee") {
          return times.flatMap(t => [
            { time: t, tee_start_type: "first_tee" as const, crossover_enabled: b.crossover_enabled },
            { time: t, tee_start_type: "tenth_tee" as const, crossover_enabled: b.crossover_enabled },
          ]);
        }
        return times.map(t => ({ time: t, tee_start_type: b.tee_start_type, crossover_enabled: b.crossover_enabled }));
      };
      slots_per_day = [...toEntries(cfgA.morning), ...toEntries(cfgA.midday), ...toEntries(cfgA.twilight)];
    } else {
      const toEntries = (b: Block) =>
        generateBlockTimes(b.start, b.end, b.interval).map(t => ({
          time: t, tee_start_type: b.tee_start_type,
          crossover_enabled: false,
        }));
      slots_per_day = [...toEntries(cfgB.morning), ...toEntries(cfgB.midday)];
    }
    return { dates: dates.length, perDay: slots_per_day.length, total: dates.length * slots_per_day.length, times: slots_per_day };
  }, [tab, dateFrom, dateTo, cfgA, cfgB]);

  // Auto-derive PM block start from last AM tee time + crossover gap (Config A)
  useEffect(() => {
    const pmStart = fromMin(toMin(cfgA.morning.end) + cfgA.crossoverGapMin);
    setCfgA(p => ({ ...p, midday: { ...p.midday, start: pmStart } }));
  }, [cfgA.morning.end, cfgA.crossoverGapMin]);

  // Auto-derive Twilight block start from last PM tee time + field reset gap (Config A)
  useEffect(() => {
    const twilightStart = fromMin(toMin(cfgA.midday.end) + cfgA.fieldResetGapMin);
    setCfgA(p => ({ ...p, twilight: { ...p.twilight, start: twilightStart } }));
  }, [cfgA.midday.end, cfgA.fieldResetGapMin]);

  // Auto-derive PM block start from last AM tee time + crossover gap (Config B)
  useEffect(() => {
    const pmStart = fromMin(toMin(cfgB.morning.end) + cfgB.crossoverGapMin);
    setCfgB(p => ({ ...p, midday: { ...p.midday, start: pmStart } }));
  }, [cfgB.morning.end, cfgB.crossoverGapMin]);

  const resetA = () => setCfgA({ ...CFG_A_DEFAULT });
  const resetB = () => setCfgB({ ...CFG_B_DEFAULT });

  // Fetch tournament conflicts whenever the date range or dialog open state changes
  useEffect(() => {
    if (!open || !dateFrom || !dateTo) { setTournamentConflicts([]); return; }
    setConflictsLoading(true);
    api<Array<{ date: string; time: string; event_name: string }>>(`/api/portal/tee-times/tournament-conflicts?from=${dateFrom}&to=${dateTo}`)
      .then(setTournamentConflicts)
      .catch(() => setTournamentConflicts([]))
      .finally(() => setConflictsLoading(false));
  }, [open, dateFrom, dateTo]);

  // Load saved configs whenever the dialog opens
  useEffect(() => {
    if (!open) return;
    setLoadingConfigs(true);
    api<any[]>("/api/portal/schedule-configs")
      .then(setSavedConfigs)
      .catch(() => {})
      .finally(() => setLoadingConfigs(false));
  }, [open]);

  const handleSaveConfig = async () => {
    const name = saveName.trim();
    if (!name) return;
    setSaving(true);
    try {
      const config_data = tab === "A" ? { ...cfgA } : { ...cfgB };
      const saved = await api<any>("/api/portal/schedule-configs", {
        method: "POST",
        body: JSON.stringify({ name, config_type: tab, config_data }),
      });
      setSavedConfigs(prev => [...prev, saved]);
      setSaveName("");
      setShowSavePanel(false);
      toast({ title: "Configuration saved", description: `"${name}" saved successfully.` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleLoadConfig = (cfg: { id: number; name: string; config_type: string; config_data: any }) => {
    if (cfg.config_type === "A") {
      setCfgA({ ...CFG_A_DEFAULT, ...cfg.config_data });
      setTab("A");
    } else {
      setCfgB({ ...CFG_B_DEFAULT, ...cfg.config_data });
      setTab("B");
    }
    toast({ title: `Loaded "${cfg.name}"`, description: `Config ${cfg.config_type} settings applied.` });
  };

  const handleDeleteConfig = async (id: number, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return;
    try {
      await api(`/api/portal/schedule-configs/${id}`, { method: "DELETE" });
      setSavedConfigs(prev => prev.filter(c => c.id !== id));
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleRenameConfig = async (id: number) => {
    const name = renameValue.trim();
    if (!name) return;
    try {
      await api(`/api/portal/schedule-configs/${id}`, {
        method: "PUT",
        body: JSON.stringify({ name }),
      });
      setSavedConfigs(prev => prev.map(c => c.id === id ? { ...c, name } : c));
      setRenamingId(null);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleGenerate = async () => {
    if (preview.perDay === 0) { toast({ title: "No tee times to generate", variant: "destructive" }); return; }
    setGenerating(true);
    const dates = datesInRange(dateFrom, dateTo);

    // Build conflict lookup: "date|HH:MM" for each tournament slot time
    const conflictSet = new Set(tournamentConflicts.map(c => `${String(c.date).slice(0, 10)}|${String(c.time).slice(0, 5)}`));

    // Build list of all slots to create, skipping times that clash with tournament slots
    let allSlots: Array<{ date: string; time: string; tee_start_type: string; crossover_enabled: boolean }> = [];
    let skipped = 0;
    for (const date of dates) {
      if (tab === "A") {
        const addBlock = (b: Block) =>
          generateBlockTimes(b.start, b.end, b.interval).forEach(t => {
            if (conflictSet.has(`${date}|${t}`)) { skipped++; return; }
            if (b.tee_start_type === "two_tee") {
              allSlots.push({ date, time: t, tee_start_type: "first_tee", crossover_enabled: b.crossover_enabled });
              allSlots.push({ date, time: t, tee_start_type: "tenth_tee", crossover_enabled: b.crossover_enabled });
            } else {
              allSlots.push({ date, time: t, tee_start_type: b.tee_start_type, crossover_enabled: b.crossover_enabled });
            }
          });
        addBlock(cfgA.morning); addBlock(cfgA.midday); addBlock(cfgA.twilight);
      } else {
        const addBlock = (b: Block) =>
          generateBlockTimes(b.start, b.end, b.interval).forEach(t => {
            if (conflictSet.has(`${date}|${t}`)) { skipped++; return; }
            allSlots.push({ date, time: t, tee_start_type: b.tee_start_type, crossover_enabled: false });
          });
        addBlock(cfgB.morning); addBlock(cfgB.midday);
      }
    }

    setProgress({ done: 0, total: allSlots.length });
    let done = 0;
    let errors = 0;

    try {
      // Clear existing general tee times for the date range (tournament slots are never touched)
      await api(`/api/portal/tee-times/clear?from=${dateFrom}&to=${dateTo}`, { method: "DELETE" });

      // Generate in batches of 5 parallel requests
      const BATCH = 5;
      for (let i = 0; i < allSlots.length; i += BATCH) {
        const batch = allSlots.slice(i, i + BATCH);
        await Promise.all(batch.map(s =>
          api("/api/portal/tee-times", {
            method: "POST",
            body: JSON.stringify({ date: s.date, time: s.time, price: 0, total_slots: slots, active: true, tee_start_type: s.tee_start_type, crossover_enabled: s.crossover_enabled }),
          }).catch(() => { errors++; })
        ));
        done = Math.min(i + BATCH, allSlots.length);
        setProgress({ done, total: allSlots.length });
      }
      const skippedNote = skipped > 0 ? ` · ${skipped} tournament slot${skipped > 1 ? "s" : ""} preserved` : "";
      toast({
        title: errors > 0 ? `Generated with ${errors} errors` : "Schedule generated",
        description: `${done - errors} tee times created across ${dates.length} day${dates.length > 1 ? "s" : ""}${skippedNote}`,
      });
      onOpenChange(false);
      onComplete(dateFrom);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setGenerating(false); setProgress({ done: 0, total: 0 }); }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!generating) onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarCog className="h-5 w-5 text-[#1a5c38]" />
            Generate Tee Time Schedule
          </DialogTitle>
        </DialogHeader>

        {/* ── Saved Configurations ─────────────────────────────────────── */}
        <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-[#1a5c38]" />
              <span className="text-sm font-semibold text-[#1a5c38]">Saved Configurations</span>
            </div>
            {loadingConfigs && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </div>
          {savedConfigs.length === 0 && !loadingConfigs ? (
            <p className="text-xs text-muted-foreground italic">No saved configs yet — configure below and save for quick reuse.</p>
          ) : (
            <div className="space-y-1.5">
              {savedConfigs.map(cfg => (
                <div key={cfg.id} className="flex items-center gap-2 bg-white rounded-lg border border-gray-200 px-3 py-2">
                  <span className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${cfg.config_type === "A" ? "bg-[#1a5c38]/10 text-[#1a5c38]" : "bg-blue-100 text-blue-700"}`}>
                    Config {cfg.config_type}
                  </span>
                  {renamingId === cfg.id ? (
                    <form className="flex items-center gap-1.5 flex-1 min-w-0" onSubmit={e => { e.preventDefault(); handleRenameConfig(cfg.id); }}>
                      <Input
                        className="h-6 text-xs flex-1 min-w-0"
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        autoFocus
                        onBlur={() => setRenamingId(null)}
                      />
                      <Button type="submit" size="sm" className="h-6 px-2 text-xs bg-[#1a5c38] hover:bg-[#164d30]">Save</Button>
                    </form>
                  ) : (
                    <>
                      <span
                        className="flex-1 text-sm font-medium truncate cursor-pointer hover:text-[#1a5c38]"
                        onDoubleClick={() => { setRenamingId(cfg.id); setRenameValue(cfg.name); }}
                        title="Double-click to rename"
                      >{cfg.name}</span>
                      <Button
                        size="sm" variant="outline"
                        className="h-6 px-2 text-xs flex-shrink-0 border-[#1a5c38]/30 text-[#1a5c38] hover:bg-[#1a5c38]/10"
                        onClick={() => handleLoadConfig(cfg)}
                      >Load</Button>
                      <Button
                        size="sm" variant="ghost"
                        className="h-6 w-6 p-0 flex-shrink-0 text-destructive/50 hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDeleteConfig(cfg.id, cfg.name)}
                      ><X className="h-3 w-3" /></Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Config selector */}
        <div className="rounded-xl border-2 border-[#1a5c38]/20 bg-[#1a5c38]/5 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#1a5c38] text-white text-[10px] font-bold flex-shrink-0">1</span>
            <p className="text-sm font-bold text-[#1a5c38] uppercase tracking-wide">Select a schedule configuration to begin</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(["A", "B"] as const).map(c => (
              <button
                key={c}
                onClick={() => setTab(c)}
                className={`relative text-left rounded-lg border-2 px-4 py-3 transition-all focus:outline-none ${
                  tab === c
                    ? "border-[#1a5c38] bg-white shadow-md ring-2 ring-[#1a5c38]/20"
                    : "border-gray-200 bg-white/60 hover:border-[#1a5c38]/40 hover:bg-white"
                }`}
              >
                {tab === c && (
                  <span className="absolute top-2 right-2 w-4 h-4 rounded-full bg-[#1a5c38] flex items-center justify-center">
                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 10"><path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </span>
                )}
                <span className={`block text-lg font-black mb-0.5 ${tab === c ? "text-[#1a5c38]" : "text-gray-400"}`}>
                  Config {c}
                </span>
                <span className={`block text-xs font-semibold mb-1 ${tab === c ? "text-[#1a5c38]" : "text-gray-500"}`}>
                  {c === "A" ? "18-Hole · Split-Tee" : "9-Hole · Continuous"}
                </span>
                <span className={`block text-xs leading-snug ${tab === c ? "text-gray-600" : "text-gray-400"}`}>
                  {c === "A"
                    ? "AM, PM & Twilight blocks with field reset gap. Best for high-volume 18-hole clubs."
                    : "Continuous AM & afternoon blocks. Designed for 9-hole or smaller clubs."}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Date range */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs mb-1 block">From Date</Label>
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs mb-1 block">To Date</Label>
            <Input type="date" value={dateTo} min={dateFrom} onChange={e => setDateTo(e.target.value)} />
          </div>
        </div>

        {/* ─── Config A blocks ─── */}
        {tab === "A" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Blocks</span>
              <button onClick={resetA} className="text-xs text-[#1a5c38] hover:underline">Reset to defaults</button>
            </div>
            <BlockEditor label="AM Block" color="border-[#1a5c38]" headerBg="bg-[#1a5c38]" block={cfgA.morning} onChange={updateA("morning")} maxSlots={11} />

            {/* ── Cross-Over Gap ── */}
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Cross-Over Gap</p>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Label className="text-xs whitespace-nowrap text-muted-foreground">Last AM slot</Label>
                  <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-white border border-amber-200">{cfgA.morning.end}</span>
                </div>
                <span className="text-muted-foreground text-xs">+</span>
                <div className="flex items-center gap-2">
                  <Input
                    type="number" min={10} max={300}
                    value={cfgA.crossoverGapMin}
                    onChange={e => setCfgA(p => ({ ...p, crossoverGapMin: Math.max(10, Number(e.target.value)) }))}
                    className="h-8 text-xs w-20"
                  />
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">min gap</Label>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                <div className="flex items-center gap-2">
                  <Label className="text-xs whitespace-nowrap text-muted-foreground">PM first tee</Label>
                  <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-[#1a5c38] text-white">{cfgA.midday.start}</span>
                </div>
              </div>
              <p className="text-xs text-amber-600/80">Gap between the last AM tee time and when the PM block begins.</p>
            </div>

            <BlockEditor label="PM Block" color="border-blue-500" headerBg="bg-blue-500" block={cfgA.midday} onChange={updateA("midday")} lockedStart maxSlots={18} latestEnd={cfgA.twilight.start} />

            {/* ── Field Reset Gap ── */}
            <div className="rounded-lg border border-purple-200 bg-purple-50 px-4 py-3 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-purple-700">Field Reset Gap</p>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Label className="text-xs whitespace-nowrap text-muted-foreground">Last PM slot</Label>
                  <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-white border border-purple-200">{cfgA.midday.end}</span>
                </div>
                <span className="text-muted-foreground text-xs">+</span>
                <div className="flex items-center gap-2">
                  <Input
                    type="number" min={10} max={480}
                    value={cfgA.fieldResetGapMin}
                    onChange={e => setCfgA(p => ({ ...p, fieldResetGapMin: Math.max(10, Number(e.target.value)) }))}
                    className="h-8 text-xs w-20"
                  />
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">min gap</Label>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-purple-500 shrink-0" />
                <div className="flex items-center gap-2">
                  <Label className="text-xs whitespace-nowrap text-muted-foreground">Twilight first tee</Label>
                  <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-purple-600 text-white">{cfgA.twilight.start}</span>
                </div>
              </div>
              <p className="text-xs text-purple-600/80">Gap between the last PM tee time and when the Twilight block begins.</p>
            </div>

            <BlockEditor label="Twilight Block" color="border-purple-600" headerBg="bg-purple-600" block={cfgA.twilight} onChange={updateA("twilight")} lockedStart />
          </div>
        )}

        {/* ─── Config B blocks ─── */}
        {tab === "B" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Blocks</span>
              <button onClick={resetB} className="text-xs text-[#1a5c38] hover:underline">Reset to defaults</button>
            </div>
            <BlockEditor label="AM Block" color="border-[#1a5c38]" headerBg="bg-[#1a5c38]" block={cfgB.morning} onChange={updateB("morning")} lockTeeType />

            {/* ── Cross-Over Gap ── */}
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Cross-Over Gap</p>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Label className="text-xs whitespace-nowrap text-muted-foreground">Last AM slot</Label>
                  <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-white border border-amber-200">{cfgB.morning.end}</span>
                </div>
                <span className="text-muted-foreground text-xs">+</span>
                <div className="flex items-center gap-2">
                  <Input
                    type="number" min={10} max={300}
                    value={cfgB.crossoverGapMin}
                    onChange={e => setCfgB(p => ({ ...p, crossoverGapMin: Math.max(10, Number(e.target.value)) }))}
                    className="h-8 text-xs w-20"
                  />
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">min gap</Label>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                <div className="flex items-center gap-2">
                  <Label className="text-xs whitespace-nowrap text-muted-foreground">PM first tee</Label>
                  <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-[#1a5c38] text-white">{cfgB.midday.start}</span>
                </div>
              </div>
              <p className="text-xs text-amber-600/80">Gap between the last AM tee time and when the PM block begins.</p>
            </div>

            <BlockEditor label="PM Block" color="border-blue-500" headerBg="bg-blue-500" block={cfgB.midday} onChange={updateB("midday")} lockedStart lockTeeType />
          </div>
        )}

        {/* ─── Preview ─── */}
        <div className="rounded-lg bg-[#1a5c38]/5 border border-[#1a5c38]/20 p-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold text-[#1a5c38] uppercase tracking-wide">Preview</span>
          </div>
          {preview.perDay === 0 ? (
            <p className="text-xs text-red-500">No tee times — check block start/end times and intervals</p>
          ) : (
            <>
              <div className="flex gap-4 text-sm mb-2">
                <span><span className="font-bold text-[#1a5c38]">{preview.perDay}</span> slots/day</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground mt-0.5" />
                <span><span className="font-bold text-[#1a5c38]">{preview.dates}</span> day{preview.dates > 1 ? "s" : ""}</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground mt-0.5" />
                <span><span className="font-bold text-[#1a5c38]">{preview.total}</span> total tee times</span>
              </div>
              <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                {preview.times.map((t, i) => (
                  <span
                    key={i}
                    className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                      t.tee_start_type === "tenth_tee"
                        ? "bg-orange-100 text-orange-700"
                        : t.tee_start_type === "two_tee"
                          ? "bg-blue-100 text-blue-700"
                          : t.crossover_enabled
                            ? "bg-purple-100 text-purple-700"
                            : "bg-green-100 text-green-700"
                    }`}
                  >
                    {t.time}
                    {t.tee_start_type === "tenth_tee" && " 10th"}
                    {t.tee_start_type === "first_tee" && " 1st"}
                    {t.tee_start_type === "two_tee" && " 2T"}
                    {t.crossover_enabled && " ↺"}
                  </span>
                ))}
              </div>
              <div className="flex gap-3 mt-1.5 text-[10px] text-muted-foreground">
                <span><span className="inline-block w-2 h-2 rounded bg-green-200 mr-1" />1st Tee</span>
                <span><span className="inline-block w-2 h-2 rounded bg-orange-200 mr-1" />10th Tee</span>
                <span><span className="inline-block w-2 h-2 rounded bg-purple-200 mr-1" />Cross-Over</span>
              </div>
            </>
          )}
        </div>

        {/* Generate button */}
        {generating ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating… {progress.done} / {progress.total}
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div
                className="bg-[#1a5c38] h-2 rounded-full transition-all"
                style={{ width: progress.total > 0 ? `${(progress.done / progress.total) * 100}%` : "0%" }}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {/* ── Save Config Panel ──────────────────────────────────── */}
            {showSavePanel ? (
              <div className="rounded-lg border border-[#c8a84b]/40 bg-[#c8a84b]/5 p-3">
                <p className="text-xs font-semibold text-[#a07c10] mb-2">
                  Save Config {tab} as…
                </p>
                <form className="flex items-center gap-2" onSubmit={e => { e.preventDefault(); handleSaveConfig(); }}>
                  <Input
                    className="flex-1 h-8 text-sm"
                    placeholder={`e.g. Winter ${tab === "A" ? "18-Hole" : "9-Hole"} Schedule`}
                    value={saveName}
                    onChange={e => setSaveName(e.target.value)}
                    autoFocus
                    maxLength={100}
                  />
                  <Button type="submit" size="sm" className="h-8 px-3 bg-[#1a5c38] hover:bg-[#164d30]" disabled={!saveName.trim() || saving}>
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BookmarkPlus className="h-3.5 w-3.5" />}
                    <span className="ml-1.5">{saving ? "Saving…" : "Save"}</span>
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="h-8 px-2" onClick={() => { setShowSavePanel(false); setSaveName(""); }}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </form>
              </div>
            ) : (
              <Button
                variant="outline"
                className="w-full border-[#c8a84b]/40 text-[#a07c10] hover:bg-[#c8a84b]/10 gap-2"
                onClick={() => setShowSavePanel(true)}
              >
                <BookmarkPlus className="h-4 w-4" />
                Save this configuration for reuse
              </Button>
            )}

            {/* Tournament conflict notice */}
            {(conflictsLoading || tournamentConflicts.length > 0) && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm">🏆</span>
                  <span className="text-xs font-semibold text-amber-800">
                    {conflictsLoading
                      ? "Checking for tournament tee times…"
                      : `${tournamentConflicts.length} tournament tee time${tournamentConflicts.length > 1 ? "s" : ""} in this range will be preserved`}
                  </span>
                </div>
                {!conflictsLoading && tournamentConflicts.length > 0 && (
                  <>
                    <p className="text-xs text-amber-700">
                      These slots belong to existing tournaments and will <strong>not</strong> be replaced. General tee times at those times will be skipped automatically.
                    </p>
                    <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                      {tournamentConflicts.map((c, i) => (
                        <span key={i} className="text-[10px] bg-amber-100 border border-amber-300 text-amber-800 rounded px-1.5 py-0.5 font-mono">
                          {String(c.date).slice(5)} · {String(c.time).slice(0, 5)} · {c.event_name}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            <Button
              className="w-full bg-[#1a5c38] hover:bg-[#164d30]"
              disabled={preview.perDay === 0 || readOnly}
              onClick={handleGenerate}
            >
              Generate {preview.total} Tee Time{preview.total !== 1 ? "s" : ""}
              {preview.dates > 1 ? ` across ${preview.dates} days` : ""}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Tee Time Dialog ─────────────────────────────────────────────────────

const DEFAULT_FORM = {
  date: today(), time: "07:00", price: 500, price_9: "" as any,
  total_slots: 4, active: true, promotional_price: "" as any,
  tee_start_type: "first_tee" as "first_tee" | "two_tee" | "tenth_tee",
  crossover_enabled: false,
};

function EditTeeTimeDialog({
  open, onOpenChange, editId, form, setForm, onSave, saving,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editId: number | null;
  form: typeof DEFAULT_FORM;
  setForm: React.Dispatch<React.SetStateAction<typeof DEFAULT_FORM>>;
  onSave: () => void;
  saving: boolean;
}) {
  const readOnly = useReadOnly();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editId ? "Edit" : "Add"} Tee Time</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="grid grid-cols-2 gap-4">
            {/* Date & Time — read-only when editing */}
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={form.date} disabled={!!editId} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Time</Label>
              <Input type="time" value={form.time} disabled={!!editId} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} />
            </div>
            {/* Prices — always editable */}
            <div className="space-y-1.5">
              <Label>18-Hole Price (ZAR)</Label>
              <Input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: Number(e.target.value) }))} />
            </div>
            <div className="space-y-1.5">
              <Label>9-Hole Price (optional)</Label>
              <Input type="number" value={form.price_9} onChange={e => setForm(f => ({ ...f, price_9: e.target.value }))} placeholder="Leave blank" />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Promo Price (optional)</Label>
              <Input type="number" value={form.promotional_price} onChange={e => setForm(f => ({ ...f, promotional_price: e.target.value }))} placeholder="Leave blank" />
            </div>
            {/* Remaining fields — read-only when editing */}
            {!editId && (
              <>
                <div className="space-y-1.5">
                  <Label>Total Slots</Label>
                  <Input type="number" min={1} max={4} value={form.total_slots} onChange={e => setForm(f => ({ ...f, total_slots: Number(e.target.value) }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Tee Start Type</Label>
                  <Select value={form.tee_start_type} onValueChange={(v: "first_tee" | "two_tee" | "tenth_tee") => setForm(f => ({ ...f, tee_start_type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="first_tee">1st Tee</SelectItem>
                      <SelectItem value="tenth_tee">10th Tee</SelectItem>
                      <SelectItem value="two_tee">Two-Tee Start (legacy)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2 pt-1 col-span-2">
                  <div className="flex items-center gap-2">
                    <Switch checked={form.active} onCheckedChange={v => setForm(f => ({ ...f, active: v }))} />
                    <Label>Active</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={form.crossover_enabled} onCheckedChange={v => setForm(f => ({ ...f, crossover_enabled: v }))} />
                    <Label className="text-xs">Cross-Over (18H)</Label>
                  </div>
                </div>
              </>
            )}
          </div>
          <Button className="w-full bg-[#1a5c38] hover:bg-[#164d30]" onClick={onSave} disabled={saving || readOnly}>
            {saving ? "Saving…" : editId ? "Update Tee Time" : "Add Tee Time"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Delete Tee Times Dialog ───────────────────────────────────────────────────

function DeleteTeeTimesDialog({
  open, onOpenChange, defaultDate, onDeleted, teeTimes,
}: { open: boolean; onOpenChange: (v: boolean) => void; defaultDate: string; onDeleted: (from: string, to: string) => void; teeTimes: TeeTime[] }) {
  const { toast } = useToast();
  const readOnly = useReadOnly();
  const [mode, setMode] = useState<"day" | "range">("day");
  const [from, setFrom] = useState(defaultDate);
  const [to, setTo]     = useState(defaultDate);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (open) { setFrom(defaultDate); setTo(defaultDate); setMode("day"); }
  }, [open, defaultDate]);

  const effectiveFrom = mode === "day" ? defaultDate : from;
  const effectiveTo   = mode === "day" ? defaultDate : (to < from ? from : to);

  // Detect tournament slots in the selected range (client-side, using loaded data)
  const blockedTournaments = useMemo(() => {
    const names = new Set<string>();
    (teeTimes ?? []).forEach(t => {
      if (t.event_id && t.event_name && t.date >= effectiveFrom && t.date <= effectiveTo) {
        names.add(t.event_name);
      }
    });
    return Array.from(names);
  }, [teeTimes, effectiveFrom, effectiveTo]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api(`/api/portal/tee-times/clear?from=${effectiveFrom}&to=${effectiveTo}`, { method: "DELETE" });
      const label = effectiveFrom === effectiveTo
        ? format(parseISO(effectiveFrom + "T00:00:00"), "dd MMM yyyy")
        : `${format(parseISO(effectiveFrom + "T00:00:00"), "dd MMM")} – ${format(parseISO(effectiveTo + "T00:00:00"), "dd MMM yyyy")}`;
      toast({ title: "Tee times deleted", description: `All slots for ${label} removed.` });
      onDeleted(effectiveFrom, effectiveTo);
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setDeleting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <Trash2 className="h-4 w-4" /> Delete Tee Times
          </DialogTitle>
          <DialogDescription>
            Permanently removes all tee time slots for the selected period.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Mode toggle */}
          <div className="flex rounded-lg border overflow-hidden text-sm">
            {(["day", "range"] as const).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={`flex-1 py-2 font-medium transition-colors ${mode === m ? "bg-red-600 text-white" : "text-muted-foreground hover:bg-muted"}`}>
                {m === "day" ? "This Day Only" : "Date Range"}
              </button>
            ))}
          </div>

          {mode === "day" && (
            <div className="rounded-md border border-red-100 bg-red-50 px-4 py-2.5 text-sm text-red-700">
              Will delete all tee times for <strong>{format(parseISO(defaultDate + "T00:00:00"), "EEEE, dd MMMM yyyy")}</strong>
            </div>
          )}

          {mode === "range" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>From</Label>
                <Input type="date" value={from} onChange={e => setFrom(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>To</Label>
                <Input type="date" value={to < from ? from : to} min={from} onChange={e => setTo(e.target.value)} />
              </div>
            </div>
          )}

          {/* Tournament conflict warning */}
          {blockedTournaments.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 space-y-1">
              <p className="font-semibold">⚠ Cannot delete — tournament slots in range</p>
              <ul className="list-disc list-inside text-amber-700 space-y-0.5">
                {blockedTournaments.map(n => <li key={n}>{n}</li>)}
              </ul>
              <p className="text-xs text-amber-600 mt-1">Cancel the tournament first, or change its tee times from the Events page.</p>
            </div>
          )}

          <Button onClick={handleDelete} disabled={deleting || readOnly || blockedTournaments.length > 0}
            className="w-full bg-red-600 hover:bg-red-700 gap-2 disabled:opacity-50">
            {deleting ? <><Loader2 className="h-4 w-4 animate-spin" /> Deleting…</> : <><Trash2 className="h-4 w-4" /> Confirm Delete</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

// ─── Counter Booking Dialog ────────────────────────────────────────────────────

// ── Per-slot member search input ─────────────────────────────────────────────

interface PlayerSlot { userId: number | null; name: string; email: string; }

function PlayerSlotSearch({
  slot, onChange, placeholder, autoFocus = false, onSwitchToGuest,
}: {
  slot: PlayerSlot;
  onChange: (s: PlayerSlot) => void;
  placeholder: string;
  autoFocus?: boolean;
  onSwitchToGuest?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ id: number; name: string; email: string }>>([]);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (query.length < 2) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await api<Array<{ id: number; name: string; email: string }>>(
          `/api/portal/users/search?q=${encodeURIComponent(query)}`
        );
        setResults(r);
      } catch { /* silent */ } finally { setSearching(false); }
    }, 300);
  }, [query]);

  if (slot.userId !== null) {
    return (
      <div className="flex items-center justify-between px-2.5 py-1.5 rounded-md border bg-[#1a5c38]/5 border-[#1a5c38]/20 h-8">
        <div className="flex items-center gap-1.5 min-w-0">
          <Users className="h-3.5 w-3.5 text-[#1a5c38] flex-shrink-0" />
          <span className="text-sm font-medium truncate">{slot.name}</span>
          <span className="text-xs text-muted-foreground truncate hidden sm:inline">{slot.email}</span>
        </div>
        <button
          className="text-xs text-muted-foreground hover:text-foreground ml-2 flex-shrink-0"
          onClick={() => { onChange({ userId: null, name: "", email: "" }); setQuery(""); setResults([]); }}
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
      <Input
        className="h-8 text-sm pl-7 pr-7"
        placeholder={placeholder}
        value={query}
        onChange={e => { setQuery(e.target.value); onChange({ userId: null, name: e.target.value, email: "" }); }}
        autoFocus={autoFocus}
      />
      {searching && <Loader2 className="absolute right-2 top-2 h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      {results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-white shadow-lg max-h-44 overflow-y-auto">
          {results.map(u => (
            <button
              key={u.id}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
              onClick={() => { onChange({ userId: u.id, name: u.name, email: u.email }); setQuery(""); setResults([]); }}
            >
              <Users className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium">{u.name}</p>
                <p className="text-xs text-muted-foreground truncate">{u.email}</p>
              </div>
            </button>
          ))}
        </div>
      )}
      {query.length >= 2 && !searching && results.length === 0 && onSwitchToGuest && (
        <p className="mt-1 text-xs text-muted-foreground px-0.5">
          No members found — <button className="underline" onClick={onSwitchToGuest}>switch to Guest</button>.
        </p>
      )}
    </div>
  );
}

// ── Counter booking dialog ────────────────────────────────────────────────────

function CounterBookingDialog({
  open, onOpenChange, tee, onBooked,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tee: TeeTime | null;
  onBooked: () => void;
}) {
  const { toast } = useToast();
  const [players, setPlayers] = useState(1);
  const emptySlot = (): PlayerSlot => ({ userId: null, name: "", email: "" });
  const [slots, setSlots] = useState<PlayerSlot[]>([emptySlot(), emptySlot(), emptySlot(), emptySlot()]);
  const [slotEmails, setSlotEmails] = useState<string[]>(["", "", "", ""]);
  const [leadPhone, setLeadPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const resetSlots = () => {
    setSlots([emptySlot(), emptySlot(), emptySlot(), emptySlot()]);
    setSlotEmails(["", "", "", ""]);
  };

  useEffect(() => {
    if (!open) { setPlayers(1); resetSlots(); setLeadPhone(""); }
  }, [open]);

  const updateSlot = (i: number, s: PlayerSlot) =>
    setSlots(prev => { const n = [...prev]; n[i] = s; return n; });

  const updateSlotEmail = (i: number, v: string) =>
    setSlotEmails(prev => { const n = [...prev]; n[i] = v; return n; });

  const lead = slots[0];
  const leadIsGuest = lead.userId === null;

  const handleSubmit = async () => {
    if (!tee) return;
    if (!lead.name.trim()) {
      toast({ title: "Player 1 name is required", variant: "destructive" }); return;
    }
    setSubmitting(true);
    try {
      const leadName = lead.name.trim();
      const names = Array.from({ length: players }, (_, i) =>
        slots[i]?.name.trim() || leadName
      );
      const playerEmails = Array.from({ length: players }, (_, i) =>
        slots[i]?.userId ? "" : slotEmails[i]?.trim() || ""
      );
      await api("/api/portal/counter-bookings", {
        method: "POST",
        body: JSON.stringify({
          tee_time_id:   tee.id,
          players,
          user_id:       leadIsGuest ? undefined : lead.userId,
          guest_name:    leadIsGuest ? leadName : undefined,
          guest_email:   leadIsGuest ? (slotEmails[0].trim() || undefined) : undefined,
          guest_phone:   leadIsGuest ? (leadPhone.trim() || undefined) : undefined,
          player_names:  names,
          player_emails: playerEmails,
        }),
      });
      toast({ title: "Booking added", description: `${tee.date} · ${String(tee.time).slice(0, 5)} · ${players} player${players > 1 ? "s" : ""}` });
      onOpenChange(false);
      onBooked();
    } catch (e: any) {
      toast({ title: "Booking failed", description: e.message, variant: "destructive" });
    } finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            Add Walk-in Booking
          </DialogTitle>
          {tee && (
            <DialogDescription>
              {tee.date} · {String(tee.time).slice(0, 5)} — R10/player slot charged monthly
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Players count */}
          <div>
            <Label className="text-xs mb-1.5 block">Number of Players</Label>
            <div className="flex gap-2">
              {[1, 2, 3, 4].map(n => (
                <button key={n}
                  className={`flex-1 py-2 rounded-md border text-sm font-semibold transition-colors
                    ${players === n ? "bg-[#1a5c38] text-white border-[#1a5c38]" : "bg-white text-foreground hover:bg-muted/50"}`}
                  onClick={() => setPlayers(n)}>
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Per-player slots */}
          <div className="space-y-3">
            <Label className="text-xs">Players</Label>
            <div className="space-y-3">
              {Array.from({ length: players }, (_, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="flex items-start gap-2">
                    <span className="text-xs text-muted-foreground w-16 flex-shrink-0 pt-2">
                      Player {i + 1}{i === 0 ? " *" : ""}
                    </span>
                    <div className="flex-1 min-w-0">
                      <PlayerSlotSearch
                        slot={slots[i]}
                        onChange={s => updateSlot(i, s)}
                        placeholder={i === 0 ? "Search TapIn member or type name…" : `Player ${i + 1} — search member or type name`}
                        autoFocus={i === 0}
                      />
                    </div>
                  </div>
                  {/* Guest contact fields — shown for each unlinked slot that has a typed name */}
                  {slots[i].userId === null && slots[i].name.trim() && (
                    <div className={`ml-[72px] ${i === 0 ? "grid grid-cols-2 gap-2" : ""}`}>
                      <Input
                        className="h-7 text-xs"
                        type="email"
                        placeholder="Email (optional)"
                        value={slotEmails[i] ?? ""}
                        onChange={e => updateSlotEmail(i, e.target.value)}
                      />
                      {i === 0 && (
                        <Input
                          className="h-7 text-xs"
                          placeholder="Phone (optional)"
                          value={leadPhone}
                          onChange={e => setLeadPhone(e.target.value)}
                        />
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Search to link a TapIn member, or type any name for a guest player. Blank additional slots use the lead name.
            </p>
          </div>

          {/* Fee summary */}
          <div className="rounded-lg bg-orange-50 border border-orange-100 px-3 py-2 flex items-center justify-between">
            <span className="text-xs text-orange-700">Platform fee (invoiced monthly)</span>
            <span className="text-sm font-semibold text-orange-800">R{(players * 10).toFixed(2)}</span>
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
            <Button className="flex-1 bg-[#1a5c38] hover:bg-[#164d2f] text-white" onClick={handleSubmit} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {submitting ? "Booking…" : `Confirm ${players} Player${players > 1 ? "s" : ""}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Schedule() {
  const { toast } = useToast();
  const readOnly = useReadOnly();
  const [, navigate] = useLocation();
  const stripRef = useRef<HTMLDivElement>(null);

  const [rangeStart, setRangeStart] = useState(today());
  const [selectedDate, setSelectedDate] = useState(today());
  const rangeEnd = inDays(13, rangeStart);

  const [teeTimes, setTeeTimes] = useState<TeeTime[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [drawEntries, setDrawEntries] = useState<DrawEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Generate dialog
  const [genOpen, setGenOpen] = useState(false);

  // Delete tee times dialog
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Edit/add single tee time dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);

  // Booking detail dialog
  const [selBooking, setSelBooking] = useState<Booking | null>(null);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [updatingBooking, setUpdatingBooking] = useState(false);

  // Auto-generate rules
  const [autoRules, setAutoRules] = useState<AutoRule[]>([]);
  const [autoRulesLoading, setAutoRulesLoading] = useState(false);
  const [autoRulesOpen, setAutoRulesOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [ruleDlgOpen, setRuleDlgOpen] = useState(false);
  const [ruleDlgSaving, setRuleDlgSaving] = useState(false);
  const [ruleEditId, setRuleEditId] = useState<number | null>(null);
  const [ruleForm, setRuleForm] = useState<RuleForm>({ ...DEFAULT_RULE_FORM });
  const [ruleRunning, setRuleRunning] = useState<number | null>(null);
  const [ruleSavedConfigs, setRuleSavedConfigs] = useState<Array<{ id: number; name: string; config_type: string; config_data: any }>>([]);
  const [ruleConfirm, setRuleConfirm] = useState<{ type: "delete" | "toggle_off"; rule: AutoRule } | null>(null);
  const [ruleConfirmBusy, setRuleConfirmBusy] = useState(false);

  // Counter (walk-in) booking dialog state
  const [counterOpen, setCounterOpen] = useState(false);
  const [counterTee, setCounterTee] = useState<TeeTime | null>(null);

  // ── Auto-rule handlers ─────────────────────────────────────────────────────

  const loadAutoRules = useCallback(async () => {
    setAutoRulesLoading(true);
    try { setAutoRules(await api<AutoRule[]>("/api/portal/tee-auto-rules")); } catch { /* silent */ }
    finally { setAutoRulesLoading(false); }
  }, []);

  useEffect(() => { loadAutoRules(); }, [loadAutoRules]);

  const openNewRule = () => {
    setRuleEditId(null);
    setRuleForm({ ...DEFAULT_RULE_FORM });
    setRuleSavedConfigs([]);
    setRuleDlgOpen(true);
    api<any[]>("/api/portal/schedule-configs").then(setRuleSavedConfigs).catch(() => {});
  };

  const openEditRule = (r: AutoRule) => {
    const [sm, sd] = r.season_start.split("-");
    const [em, ed] = r.season_end.split("-");
    setRuleEditId(r.id);
    setRuleForm({
      name: r.name, season_start_month: sm, season_start_day: sd,
      season_end_month: em, season_end_day: ed,
      lookahead_days: r.lookahead_days, lookback_days: r.lookback_days ?? 0,
      players_per_slot: r.players_per_slot,
      config_type: r.config_type, config_data: r.config_data,
      blocked_days: r.blocked_days ?? [], active: r.active,
    });
    setRuleSavedConfigs([]);
    setRuleDlgOpen(true);
    api<any[]>("/api/portal/schedule-configs").then(setRuleSavedConfigs).catch(() => {});
  };

  const handleSaveRule = async () => {
    if (!ruleForm.name.trim()) { toast({ title: "Rule name is required", variant: "destructive" }); return; }
    setRuleDlgSaving(true);
    try {
      const body = {
        name: ruleForm.name.trim(),
        season_start: `${ruleForm.season_start_month}-${ruleForm.season_start_day}`,
        season_end: `${ruleForm.season_end_month}-${ruleForm.season_end_day}`,
        lookahead_days: ruleForm.lookahead_days,
        lookback_days: ruleForm.lookback_days,
        players_per_slot: ruleForm.players_per_slot,
        config_type: ruleForm.config_type,
        config_data: ruleForm.config_data,
        blocked_days: ruleForm.blocked_days,
        active: ruleForm.active,
      };
      if (ruleEditId) {
        const updated = await api<AutoRule>(`/api/portal/tee-auto-rules/${ruleEditId}`, { method: "PUT", body: JSON.stringify(body) });
        setAutoRules(prev => prev.map(r => r.id === ruleEditId ? updated : r));
      } else {
        const created = await api<AutoRule>("/api/portal/tee-auto-rules", { method: "POST", body: JSON.stringify(body) });
        setAutoRules(prev => [...prev, created]);
      }
      setRuleDlgOpen(false);
      toast({
        title: ruleEditId ? "Rule updated" : "Auto-rule created",
        description: ruleEditId
          ? "Changes saved. Click Run Now to apply them immediately, or wait for the daily worker."
          : "Rule created. Click Run Now to fill the upcoming window immediately.",
      });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setRuleDlgSaving(false); }
  };

  const handleDeleteRule = (rule: AutoRule) => {
    setRuleConfirm({ type: "delete", rule });
  };

  const handleToggleRule = (rule: AutoRule) => {
    if (rule.active) {
      // Turning OFF — show warning dialog
      setRuleConfirm({ type: "toggle_off", rule });
    } else {
      // Turning ON — safe, do immediately
      doToggleRule(rule);
    }
  };

  const doToggleRule = async (rule: AutoRule) => {
    try {
      const updated = await api<AutoRule>(`/api/portal/tee-auto-rules/${rule.id}`, { method: "PUT", body: JSON.stringify({ active: !rule.active }) });
      setAutoRules(prev => prev.map(r => r.id === rule.id ? updated : r));
      if (!rule.active) toast({ title: "Rule enabled", description: "Use Run Now to immediately fill the upcoming window." });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const handleRuleConfirmAction = async () => {
    if (!ruleConfirm) return;
    setRuleConfirmBusy(true);
    try {
      if (ruleConfirm.type === "delete") {
        await api(`/api/portal/tee-auto-rules/${ruleConfirm.rule.id}`, { method: "DELETE" });
        setAutoRules(prev => prev.filter(r => r.id !== ruleConfirm.rule.id));
        toast({ title: "Rule deleted", description: "Already-generated tee times remain in the schedule." });
      } else {
        const updated = await api<AutoRule>(`/api/portal/tee-auto-rules/${ruleConfirm.rule.id}`, { method: "PUT", body: JSON.stringify({ active: false }) });
        setAutoRules(prev => prev.map(r => r.id === ruleConfirm.rule.id ? updated : r));
        toast({ title: "Rule paused", description: "No new tee times will be generated until you re-enable it." });
      }
      setRuleConfirm(null);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setRuleConfirmBusy(false); }
  };

  const handleRunNow = async (rule: AutoRule) => {
    setRuleRunning(rule.id);
    try {
      const result = await api<{ dates_processed: number; slots_created: number; no_config: boolean; out_of_season: boolean; season_start?: string; season_end?: string }>(`/api/portal/tee-auto-rules/${rule.id}/run-now`, { method: "POST" });
      if (result.slots_created > 0) setAutoRules(prev => prev.map(r => r.id === rule.id ? { ...r, last_run_at: new Date().toISOString() } : r));
      const isError = result.no_config || result.out_of_season;
      toast({
        title: "Rule executed",
        description: result.no_config
          ? "No time config set — edit the rule and load a saved schedule template first."
          : result.out_of_season
            ? `Today falls outside this rule's season (${result.season_start} → ${result.season_end}). Update the season dates to include the current month.`
            : result.slots_created > 0
              ? `Generated ${result.slots_created} slots across ${result.dates_processed} date${result.dates_processed !== 1 ? "s" : ""}.`
              : "All dates in the lookahead window already have tee times.",
        variant: isError ? "destructive" : "default",
      });
      if (result.slots_created > 0) load();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setRuleRunning(null); }
  };

  // ── Data ──────────────────────────────────────────────────────────────────

  const fetchData = async () => {
    const [tt, bk, de] = await Promise.all([
      api<TeeTime[]>(`/api/portal/tee-times?from=${rangeStart}&to=${rangeEnd}`),
      api<Booking[]>(`/api/portal/bookings?limit=500&from=${rangeStart}&to=${rangeEnd}`),
      api<DrawEntry[]>(`/api/portal/schedule-draw-entries?from=${rangeStart}&to=${rangeEnd}`),
    ]);
    setTeeTimes(tt.map(t => ({ ...t, date: t.date.slice(0, 10) })));
    setBookings(bk.map(b => ({ ...b, date: b.date.slice(0, 10) })));
    setDrawEntries(de.map(d => ({ ...d, tee_date: d.tee_date.slice(0, 10), tee_time: String(d.tee_time).slice(0, 5) })));
  };

  const load = async () => {
    setLoading(true);
    try {
      await fetchData();
    } catch (e: any) {
      toast({ title: "Error loading schedule", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [rangeStart]);

  // Keep the schedule fresh: silently refetch every 30s and whenever the tab
  // regains focus, so bookings/cancellations made from the mobile app appear
  // without a manual page reload.
  useEffect(() => {
    const silentRefresh = () => { fetchData().catch(() => {}); };
    const iv = setInterval(silentRefresh, 30_000);
    const onVisible = () => { if (document.visibilityState === "visible") silentRefresh(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [rangeStart]);
  useEffect(() => {
    if (selectedDate < rangeStart) setSelectedDate(rangeStart);
    if (selectedDate > rangeEnd) setSelectedDate(rangeEnd);
  }, [rangeStart]);

  // ── Navigation ─────────────────────────────────────────────────────────────

  const days = Array.from({ length: 14 }, (_, i) => inDays(i, rangeStart));
  const prevRange = () => setRangeStart(p => format(subDays(parseISO(p + "T00:00:00"), 14), "yyyy-MM-dd"));
  const nextRange = () => setRangeStart(p => inDays(14, p));
  const dayMinPrice = (d: string) => {
    const active = teeTimes.filter(t => t.date === d && t.active);
    return active.length ? Math.min(...active.map(t => t.promotional_price ?? t.price)) : null;
  };

  // ── Derived ────────────────────────────────────────────────────────────────

  const dayTeeTimes = teeTimes.filter(t => t.date === selectedDate).sort((a, b) => a.time.localeCompare(b.time));
  const dayBookings = bookings.filter(b => b.date === selectedDate);
  const bForTT = (id: number) => dayBookings.filter(b => b.tee_time_id === id);
  const totalSlots = dayTeeTimes.reduce((s, t) => s + t.total_slots, 0);
  const bookedSlots = dayBookings.filter(b => b.status !== "cancelled").reduce((s, b) => s + b.players, 0);

  // ── Tee time CRUD ──────────────────────────────────────────────────────────

  const openAdd = () => { setForm({ ...DEFAULT_FORM, date: selectedDate }); setEditId(null); setEditOpen(true); };

  const openEdit = (tt: TeeTime) => {
    setForm({
      date: tt.date, time: tt.time, price: tt.price, price_9: tt.price_9 ?? "",
      total_slots: tt.total_slots, active: tt.active, promotional_price: tt.promotional_price ?? "",
      tee_start_type: tt.tee_start_type, crossover_enabled: tt.crossover_enabled,
    });
    setEditId(tt.id); setEditOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const body = {
        ...form,
        price_9: form.price_9 === "" ? null : Number(form.price_9),
        promotional_price: form.promotional_price === "" ? null : Number(form.promotional_price),
      };
      if (editId) await api(`/api/portal/tee-times/${editId}`, { method: "PUT", body: JSON.stringify(body) });
      else await api("/api/portal/tee-times", { method: "POST", body: JSON.stringify(body) });
      toast({ title: editId ? "Tee time updated" : "Tee time added" });
      setEditOpen(false); load();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this tee time?")) return;
    try {
      await api(`/api/portal/tee-times/${id}`, { method: "DELETE" });
      setTeeTimes(p => p.filter(t => t.id !== id));
      toast({ title: "Deleted" });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const handleToggle = async (tt: TeeTime) => {
    try {
      await api(`/api/portal/tee-times/${tt.id}`, { method: "PUT", body: JSON.stringify({ active: !tt.active }) });
      setTeeTimes(p => p.map(t => t.id === tt.id ? { ...t, active: !t.active } : t));
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const handleBlockSlot = async (tt: TeeTime, slotIndex: number) => {
    const current = tt.blocked_slots ?? [];
    const isBlocked = current.includes(slotIndex);
    const newBlocked = isBlocked ? current.filter(i => i !== slotIndex) : [...current, slotIndex];
    // Optimistic update first so the UI feels instant.
    setTeeTimes(p => p.map(t => t.id === tt.id ? { ...t, blocked_slots: newBlocked } : t));
    try {
      await api(`/api/portal/tee-times/${tt.id}`, { method: "PUT", body: JSON.stringify({ blocked_slots: newBlocked }) });
    } catch (e: any) {
      // Roll back on failure.
      setTeeTimes(p => p.map(t => t.id === tt.id ? { ...t, blocked_slots: current } : t));
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  // ── Booking actions ────────────────────────────────────────────────────────

  const updateBookingStatus = async (id: number, status: string) => {
    setUpdatingBooking(true);
    try {
      await api(`/api/portal/bookings/${id}`, { method: "PUT", body: JSON.stringify({ status }) });
      setBookings(p => p.map(b => b.id === id ? { ...b, status } : b));
      if (selBooking?.id === id) setSelBooking(p => p ? { ...p, status } : p);
      toast({ title: "Booking updated" });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setUpdatingBooking(false); }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="px-8 pt-8 pb-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Tee Schedule</h1>
            <p className="text-muted-foreground mt-1">Tee times and bookings in one view.</p>
          </div>
          <Button
            variant="outline" size="sm"
            onClick={() => setToolsOpen(p => !p)}
            className={`gap-1.5 ${toolsOpen ? "bg-gray-100 border-gray-400" : ""}`}
          >
            <CalendarCog className="h-3.5 w-3.5" />
            Manage
            {toolsOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </Button>
        </div>

        {/* Collapsible tools toolbar */}
        {toolsOpen && (
          <div className="mt-3 flex gap-2 items-center flex-wrap border border-gray-200 bg-gray-50 rounded-xl px-4 py-3">
            <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={openAdd} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Add Single Slot
            </Button>
            <Button variant="outline" size="sm" onClick={() => setDeleteOpen(true)} className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50 hover:border-red-400">
              <Trash2 className="h-3.5 w-3.5" /> Delete Tee Times
            </Button>
            <div className="w-px h-5 bg-gray-300 mx-1" />
            <Button
              variant="outline" size="sm"
              onClick={() => setAutoRulesOpen(p => !p)}
              className={`gap-1.5 ${autoRulesOpen ? "bg-amber-50 border-amber-300 text-amber-700" : ""}`}
            >
              <Zap className="h-3.5 w-3.5" />
              Auto-Rules
              {autoRules.length > 0 && (
                <span className="ml-0.5 rounded-full bg-amber-500 text-white text-[10px] font-bold w-4 h-4 flex items-center justify-center">
                  {autoRules.filter(r => r.active).length}
                </span>
              )}
              {autoRulesOpen ? <ChevronUp className="h-3 w-3 ml-0.5" /> : <ChevronDown className="h-3 w-3 ml-0.5" />}
            </Button>
            <Button className="bg-[#1a5c38] hover:bg-[#164d30] gap-2" onClick={() => setGenOpen(true)}>
              <CalendarCog className="h-4 w-4" /> Generate Schedule
            </Button>
          </div>
        )}
      </div>

      {/* Auto-Rules panel */}
      {autoRulesOpen && (
        <div className="px-8 pb-4 flex-shrink-0">
          <div className="border border-amber-200 bg-amber-50/60 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-600" />
                <span className="font-semibold text-sm text-amber-900">Tee Time Auto-generation Rules</span>
                <span className="text-xs text-amber-700 font-normal">— runs daily, fills your {"{lookahead}"} day window</span>
              </div>
              {!readOnly && (
                <Button size="sm" variant="outline" className="gap-1.5 border-amber-300 text-amber-800 hover:bg-amber-100 h-7 text-xs" onClick={openNewRule}>
                  <Plus className="h-3 w-3" /> New Rule
                </Button>
              )}
            </div>

            {autoRulesLoading ? (
              <div className="flex items-center gap-2 text-xs text-amber-700"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading rules…</div>
            ) : autoRules.length === 0 ? (
              <p className="text-xs text-amber-700">No auto-rules yet. Create one to start auto-generating tee times.</p>
            ) : (
              <div className="space-y-2">
                {autoRules.map(rule => (
                  <div key={rule.id} className={`bg-white border rounded-lg px-4 py-3 flex items-center gap-3 transition-opacity ${rule.active ? "border-green-200" : "border-gray-200 opacity-60"}`}>
                    <Switch
                      checked={rule.active}
                      onCheckedChange={() => !readOnly && handleToggleRule(rule)}
                      disabled={readOnly}
                      className="data-[state=checked]:bg-green-600 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium truncate">{rule.name}</p>
                        {ruleRunning === rule.id ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                            <Loader2 className="h-2.5 w-2.5 animate-spin" /> Generating…
                          </span>
                        ) : rule.active ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">
                            <Zap className="h-2.5 w-2.5" /> Running daily
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
                            <X className="h-2.5 w-2.5" /> Paused
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Season: <span className="font-medium">{rule.season_start} → {rule.season_end}</span>
                        &nbsp;·&nbsp;{rule.lookahead_days}d ahead
                        {rule.lookback_days > 0 && <>&nbsp;·&nbsp;{rule.lookback_days}d back</>}
                        &nbsp;·&nbsp;{rule.players_per_slot} players/slot
                        {(rule.blocked_days ?? []).length > 0 && (
                          <>&nbsp;·&nbsp;<span className="text-red-600">Blocked: {DOW_ORDER.filter(d => (rule.blocked_days ?? []).includes(d)).map(d => DOW_LABELS[d]).join(", ")}</span></>
                        )}
                      </p>
                      {rule.last_run_at && (
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Clock className="h-2.5 w-2.5" />
                          Last run: {format(new Date(rule.last_run_at), "dd MMM yyyy HH:mm")}
                        </p>
                      )}
                    </div>
                    {!readOnly && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button
                          size="icon" variant="ghost"
                          className="h-7 w-7 text-amber-600 hover:bg-amber-100"
                          title={rule.active ? "Run now" : "Enable rule to run"}
                          disabled={ruleRunning === rule.id || !rule.active}
                          onClick={() => handleRunNow(rule)}
                        >
                          {ruleRunning === rule.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditRule(rule)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDeleteRule(rule)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Day strip */}
      <div className="px-8 flex-shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <Button variant="outline" size="icon" className="h-8 w-8 flex-shrink-0" onClick={prevRange}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div ref={stripRef} className="flex gap-1 overflow-x-auto flex-1 pb-1">
            {days.map(d => {
              const minPrice = dayMinPrice(d);
              const isSel = d === selectedDate;
              const isTod = d === today();
              return (
                <button key={d} onClick={() => setSelectedDate(d)}
                  className={`flex-shrink-0 flex flex-col items-center px-3 py-2 rounded-lg border text-xs font-medium transition-all min-w-[72px] ${
                    isSel ? "bg-[#1a5c38] text-white border-[#1a5c38] shadow-md"
                    : isTod ? "bg-[#1a5c38]/10 text-[#1a5c38] border-[#1a5c38]/30 hover:bg-[#1a5c38]/20"
                    : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <span className="uppercase tracking-wide font-semibold text-[10px]">{format(parseISO(d + "T00:00:00"), "EEE")}</span>
                  <span className="text-sm font-bold mt-0.5">{format(parseISO(d + "T00:00:00"), "d MMM")}</span>
                </button>
              );
            })}
          </div>
          <Button variant="outline" size="icon" className="h-8 w-8 flex-shrink-0" onClick={nextRange}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Day stats bar */}
      <div className="px-8 py-3 flex-shrink-0">
        <div className="bg-[#1a5c38] text-white rounded-lg px-5 py-3 flex items-center justify-between gap-4">
          <h2 className="font-semibold text-sm shrink-0">{format(parseISO(selectedDate + "T00:00:00"), "EEEE, dd MMMM yyyy")}</h2>
          {!loading && (
            <div className="flex items-center gap-5 text-xs text-white/80 flex-1">
              <span><span className="font-bold text-white">{dayTeeTimes.length}</span> slots</span>
              <span><span className="font-bold text-white">{bookedSlots}</span> booked</span>
              <span><span className="font-bold text-white">{Math.max(0, totalSlots - bookedSlots)}</span> open</span>
              <span><span className="font-bold text-white">{dayBookings.filter(b => b.status === "pending").length}</span> pending</span>
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="px-8 pb-3 flex items-center gap-4 text-xs text-muted-foreground flex-shrink-0">
        {[
          { color: "bg-[#1a5c38] border-[#1a5c38]", label: "Confirmed" },
          { color: "bg-yellow-50 border-yellow-300 ring-1 ring-yellow-300", label: "Pending Payment" },
          { color: "bg-white border-gray-300",        label: "Open" },
          { color: "bg-orange-50 border-orange-200", label: "Blocked slot" },
          { color: "bg-red-50 border-red-200",       label: "Unavailable" },
          { color: "bg-gray-100 border-gray-200",    label: "N/A" },
        ].map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className={`inline-block w-3 h-3 rounded border ${color}`} />{label}
          </span>
        ))}
        <span className="flex items-center gap-1.5 ml-2">
          <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-mono">1st Tee</span>1st Tee
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-mono">10th Tee</span>10th Tee
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-mono">↺</span>Cross-Over
        </span>
      </div>

      {/* Schedule table */}
      <div className="px-8 pb-8 flex-1 overflow-auto">
        {loading ? (
          <Skeleton className="h-96 w-full rounded-lg" />
        ) : dayTeeTimes.length === 0 ? (
          <div className="rounded-lg border border-dashed p-16 text-center text-muted-foreground">
            <CalendarCog className="h-8 w-8 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No tee times for this day</p>
            <p className="text-sm mt-1">Use "Generate Schedule" to create a full day using Config A or B.</p>
            <Button className="mt-4 bg-[#1a5c38] hover:bg-[#164d30] gap-2" onClick={() => setGenOpen(true)}>
              <CalendarCog className="h-4 w-4" /> Generate Schedule
            </Button>
          </div>
        ) : (
          <div className="rounded-lg border overflow-hidden shadow-sm">
            {/* Header row */}
            <div className="grid grid-cols-[96px_1fr_1fr_1fr_1fr_108px] bg-[#1a5c38] text-white text-xs font-semibold uppercase tracking-wide">
              <div className="px-4 py-3">Time</div>
              {["Player 1","Player 2","Player 3","Player 4"].map(p => (
                <div key={p} className="px-4 py-3 border-l border-white/20">{p}</div>
              ))}
              <div className="px-4 py-3 border-l border-white/20 text-center">Actions</div>
            </div>

            {dayTeeTimes.map((tt, rowIdx) => {
              const isTournament = !!tt.event_id;

              // ── Draw players for tournament slots ─────────────────────────────
              // Map starting_tee number to tee_start_type string
              const teeTypeToStartingTee: Record<string, number> = { first_tee: 1, tenth_tee: 10, two_tee: 1 };
              const slotStartingTee = teeTypeToStartingTee[tt.tee_start_type] ?? 1;
              const ttTime = String(tt.time).slice(0, 5);
              const drawPlayers: DrawEntry[] = isTournament
                ? drawEntries.filter(d =>
                    d.event_id === tt.event_id &&
                    d.tee_date === tt.date &&
                    d.tee_time === ttTime &&
                    d.starting_tee === slotStartingTee
                  )
                : [];
              const hasDrawPlayers = drawPlayers.length > 0;

              // ── Regular slot (+ tournament slots rendered identically but locked) ─
              const slots = buildSlots(tt, bForTT(tt.id));
              const borderCol  = isTournament ? "border-amber-100" : "border-gray-100";
              return (
                <div key={tt.id}
                  className={`grid grid-cols-[96px_1fr_1fr_1fr_1fr_108px] border-t text-sm
                    ${isTournament
                      ? rowIdx % 2 === 0 ? "bg-amber-50/40" : "bg-amber-50/70"
                      : rowIdx % 2 === 0 ? "bg-white" : "bg-gray-50/60"}
                    ${!tt.active ? "opacity-60" : ""}`}
                >
                  {/* Time cell */}
                  <div className={`px-3 py-2 flex flex-col justify-center border-r ${borderCol} gap-0.5`}>
                    <span className="font-mono font-bold text-[#1a5c38] text-sm">{ttTime}</span>
                    <div className="flex gap-1 flex-wrap">
                      {isTournament && (
                        <span className="text-[9px] bg-amber-100 text-amber-800 px-1 py-0.5 rounded font-semibold">🏆 {tt.event_name ?? "Tournament"}</span>
                      )}
                      {tt.tee_start_type === "first_tee" && (
                        <span className="text-[9px] bg-green-100 text-green-700 px-1 py-0.5 rounded font-semibold">1st Tee</span>
                      )}
                      {tt.tee_start_type === "tenth_tee" && (
                        <span className="text-[9px] bg-orange-100 text-orange-700 px-1 py-0.5 rounded font-semibold">10th Tee</span>
                      )}
                      {tt.tee_start_type === "two_tee" && (
                        <span className="text-[9px] bg-blue-100 text-blue-700 px-1 py-0.5 rounded font-semibold">2T</span>
                      )}
                      {tt.crossover_enabled && (
                        <span className="text-[9px] bg-purple-100 text-purple-700 px-1 py-0.5 rounded font-semibold">↺</span>
                      )}
                      {tt.promotional_price && (
                        <span className="text-[9px] bg-[#c8a84b]/20 text-[#a07c10] px-1 py-0.5 rounded font-semibold">PROMO</span>
                      )}
                    </div>
                  </div>

                  {/* Player cells — draw players for tournament slots, bookings for regular slots */}
                  {isTournament && !!tt.shotgun_start
                    ? (
                      <div className="col-span-4 border-l border-amber-100 px-4 py-2.5 flex items-center gap-3 bg-amber-50/60">
                        <span className="text-xl flex-shrink-0">🔫</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-amber-800 leading-tight">Shotgun Start — all groups start simultaneously</p>
                          <p className="text-[11px] text-amber-600 mt-0.5">
                            {Math.ceil(tt.total_slots / 4)} groups &middot; {tt.total_slots} spots &middot; Hole assignments are managed in the Draw
                          </p>
                        </div>
                        <button
                          onClick={() => navigate(`/events?event=${tt.event_id}&tab=draw`)}
                          className="flex-shrink-0 text-[11px] font-semibold text-[#1a5c38] border border-[#1a5c38]/40 rounded-lg px-3 py-1.5 hover:bg-[#1a5c38]/8 transition-colors whitespace-nowrap">
                          View Draw &rarr;
                        </button>
                      </div>
                    )
                    : isTournament && hasDrawPlayers
                    ? Array.from({ length: 4 }, (_, i) => {
                        const p = drawPlayers[i];
                        return (
                          <div key={i} className={`px-3 py-2 border-l ${borderCol} text-xs flex items-center ${p ? "bg-[#1a5c38] text-white" : "text-gray-300"}`}>
                            {p ? (
                              <span className="flex items-center justify-between w-full gap-1 min-w-0">
                                <span className={`truncate leading-tight font-medium ${i > 0 ? "opacity-80 text-[11px]" : ""}`}>{p.user_name}</span>
                                {p.division && <span className="flex-shrink-0 text-[9px] px-1 py-0.5 rounded bg-white/20 font-semibold">{p.division}</span>}
                              </span>
                            ) : <span className="italic text-[11px]">—</span>}
                          </div>
                        );
                      })
                    : slots.map((slot, i) => (
                    <div key={i}
                      className={`px-3 py-2 border-l ${borderCol} text-xs flex items-center transition-all
                        ${slotBg(slot)}
                        ${!isTournament && slot.kind === "booked" ? "cursor-pointer hover:brightness-95" : ""}
                        ${!isTournament && slot.kind === "open" ? "cursor-pointer hover:brightness-95" : ""}
                        ${!isTournament && slot.kind === "blocked" ? "cursor-pointer hover:brightness-95" : ""}`}
                      onClick={() => {
                        if (isTournament) return;
                        if (slot.kind === "booked" && slot.playerIndex === 0) { setSelBooking(slot.booking); setBookingOpen(true); }
                        else if (slot.kind === "open") { setCounterTee(tt); setCounterOpen(true); }
                        else if (slot.kind === "blocked") handleBlockSlot(tt, i);
                      }}
                      title={
                        isTournament ? undefined :
                        slot.kind === "booked" ? `Manage: ${slot.booking.booking_ref}` :
                        slot.kind === "open" ? "Add booking for this slot" :
                        slot.kind === "blocked" ? "Click to unblock this slot" :
                        undefined
                      }
                    >
                      {slot.kind === "open" && (
                        <span className="font-medium">
                          {isTournament
                            ? <span className="text-amber-300 italic text-[11px]">Open</span>
                            : tt.promotional_price
                              ? <span className="text-gray-500">R{tt.promotional_price}</span>
                              : <span className="text-[#1a5c38]/60 italic text-[11px]">+ Add booking</span>}
                        </span>
                      )}
                      {slot.kind === "unavailable" && <span className="font-medium text-red-400">Unavailable</span>}
                      {slot.kind === "blocked" && <span className="font-medium text-orange-500">Blocked</span>}
                      {slot.kind === "na" && <span className="text-gray-300">—</span>}
                      {slot.kind === "booked" && (
                        <span className="flex items-center justify-between w-full gap-1 min-w-0">
                          <span className={`truncate leading-tight font-medium ${slot.playerIndex > 0 ? "opacity-70 italic text-[11px]" : ""}`}>
                            {slot.booking.player_names?.[slot.playerIndex] ?? slot.booking.guest_name}
                          </span>
                          <span className="flex items-center gap-1 flex-shrink-0">
                            {slot.booking.booking_source === "club_counter" && (
                              <span className="text-[8px] px-1 py-0.5 rounded bg-orange-100 text-orange-700 border border-orange-200 font-bold">Walk-in</span>
                            )}
                            <span className={`text-[9px] px-1 py-0.5 rounded border font-semibold ${STATUS_BADGE[slot.effectiveStatus] ?? ""}`}>
                              {STATUS_LABEL[slot.effectiveStatus] ?? slot.effectiveStatus}
                            </span>
                          </span>
                        </span>
                      )}
                    </div>
                  ))}

                  {/* Actions */}
                  {isTournament ? (
                    <div className={`px-2 py-2 border-l ${borderCol} flex items-center justify-center`}>
                      <span className="text-[10px] text-amber-500 font-semibold">🔒</span>
                    </div>
                  ) : (
                    <div className="px-2 py-2 border-l border-gray-100 flex items-center justify-center gap-1">
                      <Switch checked={tt.active} onCheckedChange={() => handleToggle(tt)} className="scale-75" />
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => openEdit(tt)} title="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive/60 hover:text-destructive" onClick={() => handleDelete(tt.id)} title="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Generate Schedule Dialog ─────────────────────────────────────────── */}
      <GenerateDialog open={genOpen} onOpenChange={setGenOpen} onComplete={(dateFrom) => {
        setRangeStart(dateFrom);
        setSelectedDate(dateFrom);
        load();
      }} />

      {/* ── Delete Tee Times Dialog ──────────────────────────────────────────── */}
      <DeleteTeeTimesDialog
        open={deleteOpen} onOpenChange={setDeleteOpen}
        defaultDate={selectedDate}
        teeTimes={teeTimes}
        onDeleted={(from, to) => {
          setTeeTimes(p => p.filter(t => t.date < from || t.date > to));
        }}
      />

      {/* ── Edit / Add single tee time dialog ───────────────────────────────── */}
      <EditTeeTimeDialog
        open={editOpen} onOpenChange={setEditOpen}
        editId={editId} form={form} setForm={setForm}
        onSave={handleSave} saving={saving}
      />

      {/* ── Booking detail dialog ────────────────────────────────────────────── */}
      <Dialog open={bookingOpen} onOpenChange={setBookingOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Booking Detail
              {selBooking && (
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_BADGE[selBooking.status] ?? ""}`}>
                  {selBooking.status}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {selBooking && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ["Reference", <code className="bg-muted px-2 py-0.5 rounded text-xs">{selBooking.booking_ref}</code>],
                  ["Time", <span className="font-semibold">{String(selBooking.time).slice(0, 5)}</span>],
                  ["Guest", <span className="font-semibold">{selBooking.guest_name}</span>],
                  ["Players", <span className="font-semibold">{selBooking.players}</span>],
                  ["Email", <span className="text-xs break-all">{selBooking.guest_email}</span>],
                  ["Phone", <span className="text-xs">{selBooking.guest_phone || "—"}</span>],
                  ["Amount", <span className="font-semibold text-[#1a5c38]">R{Number(selBooking.total_amount).toFixed(0)}</span>],
                  ["Payment", <span className="text-xs">{selBooking.payment_method}</span>],
                ].map(([label, val]) => (
                  <div key={String(label)}>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">{label}</p>
                    {val}
                  </div>
                ))}
                {selBooking.voucher_code && (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Voucher</p>
                    <span className="bg-muted px-2 py-0.5 rounded text-xs">{selBooking.voucher_code}</span>
                  </div>
                )}
              </div>
              {selBooking.payment_method === "prepaid" && (selBooking.status === "pending" || selBooking.status === "confirmed") && (
                <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                  <span className="mt-0.5">⚠️</span>
                  <span>Prepaid round is <strong>non-refundable</strong> — cancelling will not return the round to the member's balance.</span>
                </div>
              )}
              <div className="flex gap-2 pt-2 border-t">
                {selBooking.status === "pending" && (
                  <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white flex-1" disabled={updatingBooking}
                    onClick={() => updateBookingStatus(selBooking.id, "confirmed")}>Confirm</Button>
                )}
                {selBooking.status === "confirmed" && (
                  <Button size="sm" variant="outline" className="flex-1" disabled={updatingBooking}
                    onClick={() => updateBookingStatus(selBooking.id, "completed")}>Mark Complete</Button>
                )}
                {(selBooking.status === "pending" || selBooking.status === "confirmed") && (
                  <Button size="sm" variant="outline" className="text-destructive border-destructive/30 flex-1" disabled={updatingBooking}
                    onClick={() => updateBookingStatus(selBooking.id, "cancelled")}>Cancel Booking</Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Auto-Rule Confirm Dialog (toggle off / delete) */}
      <Dialog open={!!ruleConfirm} onOpenChange={open => { if (!open && !ruleConfirmBusy) setRuleConfirm(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              {ruleConfirm?.type === "delete" ? <Trash2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              {ruleConfirm?.type === "delete" ? "Delete auto-rule?" : "Pause auto-rule?"}
            </DialogTitle>
            <DialogDescription className="pt-1 space-y-2 text-left">
              {ruleConfirm?.type === "delete" ? (
                <>
                  <p>You are about to permanently delete <strong>"{ruleConfirm.rule.name}"</strong>.</p>
                  <p>Tee times that have already been generated will remain in the schedule, but <strong>no new tee times will ever be created by this rule</strong>. You will need to recreate it to resume auto-generation.</p>
                </>
              ) : (
                <>
                  <p>You are about to pause <strong>"{ruleConfirm?.rule.name}"</strong>.</p>
                  <p>The daily worker will stop generating tee times for this rule. <strong>Dates beyond the already-generated window will have no tee times</strong>, leaving gaps that golfers cannot book.</p>
                  <p className="text-amber-700 font-medium">Keep rules active year-round — the season window controls which dates get slots, not when the rule runs.</p>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" disabled={ruleConfirmBusy} onClick={() => setRuleConfirm(null)}>Cancel</Button>
            <Button variant="destructive" size="sm" disabled={ruleConfirmBusy} onClick={handleRuleConfirmAction}>
              {ruleConfirmBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              {ruleConfirm?.type === "delete" ? "Yes, delete rule" : "Yes, pause rule"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Auto-Rule Create / Edit Dialog */}
      <Dialog open={ruleDlgOpen} onOpenChange={setRuleDlgOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{ruleEditId ? "Edit Auto-Rule" : "New Auto-Generation Rule"}</DialogTitle>
            <DialogDescription>
              The rule runs daily and fills your lookahead window with tee slots — skipping dates that already have tee times.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            {/* Name */}
            <div>
              <Label className="text-xs font-medium mb-1 block">Rule name</Label>
              <Input
                placeholder="e.g. Summer weekday schedule"
                value={ruleForm.name}
                onChange={e => setRuleForm(p => ({ ...p, name: e.target.value }))}
              />
            </div>

            {/* Season */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-medium mb-1 block">Season start</Label>
                <div className="flex gap-1">
                  <Select value={ruleForm.season_start_month} onValueChange={v => setRuleForm(p => ({ ...p, season_start_month: v }))}>
                    <SelectTrigger className="flex-1 h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent side="top" className="max-h-48 overflow-y-auto">{MONTHS.map(m => <SelectItem key={m.v} value={m.v} className="text-xs">{m.l}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={ruleForm.season_start_day} onValueChange={v => setRuleForm(p => ({ ...p, season_start_day: v }))}>
                    <SelectTrigger className="w-16 h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent side="top" className="max-h-48 overflow-y-auto">{DAYS.map(d => <SelectItem key={d} value={d} className="text-xs">{d}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs font-medium mb-1 block">Season end</Label>
                <div className="flex gap-1">
                  <Select value={ruleForm.season_end_month} onValueChange={v => setRuleForm(p => ({ ...p, season_end_month: v }))}>
                    <SelectTrigger className="flex-1 h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent side="top" className="max-h-48 overflow-y-auto">{MONTHS.map(m => <SelectItem key={m.v} value={m.v} className="text-xs">{m.l}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={ruleForm.season_end_day} onValueChange={v => setRuleForm(p => ({ ...p, season_end_day: v }))}>
                    <SelectTrigger className="w-16 h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent side="top" className="max-h-48 overflow-y-auto">{DAYS.map(d => <SelectItem key={d} value={d} className="text-xs">{d}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Lookback + Lookahead + players */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs font-medium mb-1 block">Past days (lookback)</Label>
                <Input
                  type="number" min={0} max={9999} className="h-9 text-xs"
                  value={ruleForm.lookback_days}
                  onChange={e => setRuleForm(p => ({ ...p, lookback_days: Math.max(0, Number(e.target.value) || 0) }))}
                />
                <p className="text-[10px] text-muted-foreground mt-1">0 = start from today</p>
              </div>
              <div>
                <Label className="text-xs font-medium mb-1 block">Future days (lookahead)</Label>
                <Select value={String(ruleForm.lookahead_days)} onValueChange={v => setRuleForm(p => ({ ...p, lookahead_days: Number(v) }))}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent side="top" className="max-h-48 overflow-y-auto">
                    {Array.from({ length: 28 }, (_, i) => i + 1).map(d => <SelectItem key={d} value={String(d)} className="text-xs">{d} day{d !== 1 ? "s" : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-medium mb-1 block">Players per slot</Label>
                <Select value={String(ruleForm.players_per_slot)} onValueChange={v => setRuleForm(p => ({ ...p, players_per_slot: Number(v) }))}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4].map(n => <SelectItem key={n} value={String(n)} className="text-xs">{n} player{n !== 1 ? "s" : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Blocked days */}
            <div>
              <Label className="text-xs font-medium mb-1.5 block">Blocked days — no tee times generated</Label>
              <div className="flex gap-1.5">
                {DOW_ORDER.map(d => {
                  const blocked = (ruleForm.blocked_days ?? []).includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setRuleForm(p => {
                        const cur = p.blocked_days ?? [];
                        return { ...p, blocked_days: blocked ? cur.filter(x => x !== d) : [...cur, d] };
                      })}
                      className={`flex-1 py-1.5 text-xs rounded border font-medium transition-colors select-none ${
                        blocked
                          ? "bg-red-100 border-red-300 text-red-700"
                          : "bg-muted border-border text-muted-foreground hover:bg-muted/60"
                      }`}
                    >
                      {DOW_LABELS[d]}
                    </button>
                  );
                })}
              </div>
              {(ruleForm.blocked_days ?? []).length > 0 && (
                <p className="text-[10px] text-red-600 mt-1">
                  Skipping: {DOW_ORDER.filter(d => (ruleForm.blocked_days ?? []).includes(d)).map(d => DOW_LABELS[d]).join(", ")}
                </p>
              )}
            </div>

            {/* Saved config picker */}
            {ruleSavedConfigs.length > 0 && (
              <div>
                <Label className="text-xs font-medium mb-1 block">
                  <FolderOpen className="h-3 w-3 inline mr-1" />
                  Load time config from saved template
                </Label>
                <Select
                  value=""
                  onValueChange={v => {
                    const cfg = ruleSavedConfigs.find(c => String(c.id) === v);
                    if (cfg) setRuleForm(p => ({ ...p, config_type: cfg.config_type, config_data: cfg.config_data }));
                  }}
                >
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Choose a saved config…" /></SelectTrigger>
                  <SelectContent>
                    {ruleSavedConfigs.map(c => (
                      <SelectItem key={c.id} value={String(c.id)} className="text-xs">{c.name} (Type {c.config_type})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Config summary */}
            {ruleForm.config_data && (Object.keys(ruleForm.config_data).length > 0) ? (
              <div className="bg-muted rounded-lg px-3 py-2 text-xs text-muted-foreground">
                <p className="font-medium text-foreground mb-1">Loaded config: Type {ruleForm.config_type}</p>
                {["morning", "midday", "twilight"].filter(k => ruleForm.config_data[k]?.start).map(k => (
                  <p key={k}><span className="capitalize font-medium">{k}:</span> {ruleForm.config_data[k].start}–{ruleForm.config_data[k].end} every {ruleForm.config_data[k].interval}min ({ruleForm.config_data[k].tee_start_type})</p>
                ))}
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                No time config loaded — you must choose a saved schedule template above before the rule can generate tee times.
              </div>
            )}

            {/* Active */}
            <div className="flex items-center gap-3 pt-1">
              <Switch
                checked={ruleForm.active}
                onCheckedChange={v => setRuleForm(p => ({ ...p, active: v }))}
                className="data-[state=checked]:bg-amber-500"
              />
              <Label className="text-sm">Rule is active</Label>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setRuleDlgOpen(false)} disabled={ruleDlgSaving}>
              Cancel
            </Button>
            <Button
              className="flex-1 bg-[#1a5c38] hover:bg-[#164d30]"
              onClick={handleSaveRule}
              disabled={ruleDlgSaving}
            >
              {ruleDlgSaving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
              {ruleEditId ? "Save Changes" : "Create Rule"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Counter (walk-in) booking dialog ─────────────────────────────────── */}
      <CounterBookingDialog
        open={counterOpen}
        onOpenChange={setCounterOpen}
        tee={counterTee}
        onBooked={load}
      />
    </div>
  );
}
