import { useEffect, useState, useRef, useMemo } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
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
} from "lucide-react";
import { format, addDays, parseISO, subDays } from "date-fns";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface TeeTime {
  id: number;
  date: string;
  time: string;
  price: number;
  price_9: number | null;
  total_slots: number;
  active: boolean;
  promotional_price: number | null;
  tee_start_type: "first_tee" | "two_tee" | "tenth_tee";
  crossover_enabled: boolean;
  blocked_slots: number[];
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
  const [tab, setTab] = useState<"A" | "B">("A");
  const [dateFrom, setDateFrom] = useState(today());
  const [dateTo, setDateTo]   = useState(today());
  const slots = 4;
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

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

    // Build list of all slots to create
    let allSlots: Array<{ date: string; time: string; tee_start_type: string; crossover_enabled: boolean }> = [];
    for (const date of dates) {
      if (tab === "A") {
        const addBlock = (b: Block) =>
          generateBlockTimes(b.start, b.end, b.interval).forEach(t => {
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
          generateBlockTimes(b.start, b.end, b.interval).forEach(t =>
            allSlots.push({ date, time: t, tee_start_type: b.tee_start_type, crossover_enabled: false })
          );
        addBlock(cfgB.morning); addBlock(cfgB.midday);
      }
    }

    setProgress({ done: 0, total: allSlots.length });
    let done = 0;
    let errors = 0;

    try {
      // Always clear existing tee times for the date range before generating
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
      toast({
        title: errors > 0 ? `Generated with ${errors} errors` : "Schedule generated",
        description: `${done - errors} tee times created across ${dates.length} day${dates.length > 1 ? "s" : ""}`,
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

            <Button
              className="w-full bg-[#1a5c38] hover:bg-[#164d30]"
              disabled={preview.perDay === 0}
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
          <Button className="w-full bg-[#1a5c38] hover:bg-[#164d30]" onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : editId ? "Update Tee Time" : "Add Tee Time"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Delete Tee Times Dialog ───────────────────────────────────────────────────

function DeleteTeeTimesDialog({
  open, onOpenChange, defaultDate, onDeleted,
}: { open: boolean; onOpenChange: (v: boolean) => void; defaultDate: string; onDeleted: (from: string, to: string) => void }) {
  const { toast } = useToast();
  const [mode, setMode] = useState<"day" | "range">("day");
  const [from, setFrom] = useState(defaultDate);
  const [to, setTo]     = useState(defaultDate);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (open) { setFrom(defaultDate); setTo(defaultDate); setMode("day"); }
  }, [open, defaultDate]);

  const effectiveFrom = mode === "day" ? defaultDate : from;
  const effectiveTo   = mode === "day" ? defaultDate : (to < from ? from : to);

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

          <Button onClick={handleDelete} disabled={deleting}
            className="w-full bg-red-600 hover:bg-red-700 gap-2">
            {deleting ? <><Loader2 className="h-4 w-4 animate-spin" /> Deleting…</> : <><Trash2 className="h-4 w-4" /> Confirm Delete</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function Schedule() {
  const { toast } = useToast();
  const stripRef = useRef<HTMLDivElement>(null);

  const [rangeStart, setRangeStart] = useState(today());
  const [selectedDate, setSelectedDate] = useState(today());
  const rangeEnd = inDays(13, rangeStart);

  const [teeTimes, setTeeTimes] = useState<TeeTime[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
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

  // ── Data ──────────────────────────────────────────────────────────────────

  const load = async () => {
    setLoading(true);
    try {
      const [tt, bk] = await Promise.all([
        api<TeeTime[]>(`/api/portal/tee-times?from=${rangeStart}&to=${rangeEnd}`),
        api<Booking[]>(`/api/portal/bookings?limit=500&from=${rangeStart}&to=${rangeEnd}`),
      ]);
      setTeeTimes(tt.map(t => ({ ...t, date: t.date.slice(0, 10) })));
      setBookings(bk.map(b => ({ ...b, date: b.date.slice(0, 10) })));
    } catch (e: any) {
      toast({ title: "Error loading schedule", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [rangeStart]);
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
      <div className="px-8 pt-8 pb-4 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tee Schedule</h1>
          <p className="text-muted-foreground mt-1">Tee times and bookings in one view.</p>
        </div>
        <div className="flex gap-2 items-center">
          <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={openAdd} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Add Single Slot
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDeleteOpen(true)} className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50 hover:border-red-400">
            <Trash2 className="h-3.5 w-3.5" /> Delete Tee Times
          </Button>
          <Button className="bg-[#1a5c38] hover:bg-[#164d30] gap-2" onClick={() => setGenOpen(true)}>
            <CalendarCog className="h-4 w-4" /> Generate Schedule
          </Button>
        </div>
      </div>

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
        <div className="bg-[#1a5c38] text-white rounded-lg px-5 py-3 flex items-center justify-between">
          <h2 className="font-semibold text-sm">{format(parseISO(selectedDate + "T00:00:00"), "EEEE, dd MMMM yyyy")}</h2>
          {!loading && (
            <div className="flex items-center gap-5 text-xs text-white/80">
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
              const slots = buildSlots(tt, bForTT(tt.id));
              return (
                <div key={tt.id}
                  className={`grid grid-cols-[96px_1fr_1fr_1fr_1fr_108px] border-t text-sm ${rowIdx % 2 === 0 ? "bg-white" : "bg-gray-50/60"} ${!tt.active ? "opacity-60" : ""}`}
                >
                  {/* Time cell */}
                  <div className="px-3 py-2 flex flex-col justify-center border-r border-gray-100 gap-0.5">
                    <span className="font-mono font-bold text-[#1a5c38] text-sm">{String(tt.time).slice(0, 5)}</span>
                    <div className="flex gap-1 flex-wrap">
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

                  {/* Player cells */}
                  {slots.map((slot, i) => (
                    <div key={i}
                      className={`px-3 py-2 border-l border-gray-100 text-xs flex items-center transition-all
                        ${slotBg(slot)}
                        ${slot.kind === "booked" ? "cursor-pointer hover:brightness-95" : ""}
                        ${slot.kind === "open" ? "cursor-pointer hover:brightness-95" : ""}
                        ${slot.kind === "blocked" ? "cursor-pointer hover:brightness-95" : ""}`}
                      onClick={() => {
                        if (slot.kind === "booked" && slot.playerIndex === 0) { setSelBooking(slot.booking); setBookingOpen(true); }
                        else if (slot.kind === "open") handleBlockSlot(tt, i);
                        else if (slot.kind === "blocked") handleBlockSlot(tt, i);
                      }}
                      title={
                        slot.kind === "booked" ? `Manage: ${slot.booking.booking_ref}` :
                        slot.kind === "open" ? "Click to block this slot" :
                        slot.kind === "blocked" ? "Click to unblock this slot" :
                        undefined
                      }
                    >
                      {slot.kind === "open" && (
                        <span className="font-medium">
                          {tt.promotional_price
                            ? <span className="text-gray-500">R{tt.promotional_price}</span>
                            : <span className="text-gray-300 italic text-[11px]">Click to block slot</span>}
                        </span>
                      )}
                      {slot.kind === "unavailable" && <span className="font-medium text-red-400">Unavailable</span>}
                      {slot.kind === "blocked" && <span className="font-medium text-orange-500">Blocked</span>}
                      {slot.kind === "na" && <span className="text-gray-300">—</span>}
                      {slot.kind === "booked" && (
                        <span className="font-medium truncate leading-tight flex items-center gap-1 flex-wrap">
                          <span className={`truncate ${slot.playerIndex > 0 ? "opacity-70 italic text-[11px]" : ""}`}>
                            {slot.booking.player_names?.[slot.playerIndex] ?? slot.booking.guest_name}
                          </span>
                          <span className={`flex-shrink-0 text-[9px] px-1 py-0.5 rounded border font-semibold ${STATUS_BADGE[slot.effectiveStatus] ?? ""}`}>
                            {STATUS_LABEL[slot.effectiveStatus] ?? slot.effectiveStatus}
                          </span>
                        </span>
                      )}
                    </div>
                  ))}

                  {/* Actions */}
                  <div className="px-2 py-2 border-l border-gray-100 flex items-center justify-center gap-1">
                    <Switch checked={tt.active} onCheckedChange={() => handleToggle(tt)} className="scale-75" />
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => openEdit(tt)} title="Edit">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive/60 hover:text-destructive" onClick={() => handleDelete(tt.id)} title="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
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
    </div>
  );
}
