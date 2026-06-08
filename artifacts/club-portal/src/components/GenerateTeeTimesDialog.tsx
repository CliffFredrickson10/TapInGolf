import { useEffect, useState, useMemo } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useReadOnly } from "@/context/ReadOnlyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarCog, Loader2, ArrowRight, BookmarkPlus, FolderOpen, X } from "lucide-react";
import { format, addDays, parseISO } from "date-fns";

// ─── Helpers ────────────────────────────────────────────────────────────────

function today() { return format(new Date(), "yyyy-MM-dd"); }
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

// ─── Types ───────────────────────────────────────────────────────────────────

interface Block {
  start: string;
  end: string;
  interval: number;
  tee_start_type: "first_tee" | "two_tee";
  crossover_enabled: boolean;
}

// ─── Defaults ────────────────────────────────────────────────────────────────

const CFG_A_DEFAULT = {
  morning:  { start: "07:00", end: "08:04", interval: 8, tee_start_type: "two_tee" as const, crossover_enabled: false },
  midday:   { start: "11:00", end: "12:44", interval: 8, tee_start_type: "two_tee" as const, crossover_enabled: false },
  twilight: { start: "17:00", end: "17:24", interval: 8, tee_start_type: "two_tee" as const, crossover_enabled: false },
  crossoverGapMin: 176,
  fieldResetGapMin: 256,
};
const CFG_B_DEFAULT = {
  morning:  { start: "07:00", end: "08:04", interval: 8, tee_start_type: "first_tee" as const, crossover_enabled: false },
  midday:   { start: "10:44", end: "13:00", interval: 8, tee_start_type: "first_tee" as const, crossover_enabled: false },
  crossoverGapMin: 160,
};

const MAX_SLOTS = 60;

// ─── BlockEditor ─────────────────────────────────────────────────────────────

function BlockEditor({
  label, color, headerBg, block, onChange, lockedStart, lockTeeType, maxSlots, latestEnd,
}: {
  label: string; color: string; headerBg: string;
  block: Block; onChange: (b: Partial<Block>) => void;
  lockedStart?: boolean; lockTeeType?: boolean;
  maxSlots?: number; latestEnd?: string;
}) {
  const slotCap = maxSlots ?? MAX_SLOTS;
  const count = blockCount(block.start, block.end, block.interval);

  const handleCountChange = (newCount: number) => onChange({ end: lastTime(block.start, newCount, block.interval) });
  const handleStartChange = (newStart: string) => onChange({ start: newStart, end: lastTime(newStart, count, block.interval) });
  const handleIntervalChange = (newInterval: number) => {
    if (newInterval < 1) return;
    onChange({ interval: newInterval, end: lastTime(block.start, count, newInterval) });
  };

  const countOptions = Array.from({ length: slotCap }, (_, i) => i + 1)
    .filter(n => !latestEnd || lastTime(block.start, n, block.interval) < latestEnd)
    .map(n => ({ value: n, label: `${n} slot${n > 1 ? "s" : ""} — ends ${lastTime(block.start, n, block.interval)}` }));

  return (
    <div className={`rounded-lg border-l-4 ${color} border border-gray-200 overflow-hidden shadow-sm`}>
      <div className={`${headerBg} px-3 py-2 flex items-center justify-between`}>
        <span className="font-bold text-sm text-white tracking-wide">{label}</span>
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-white/20 text-white">
          {block.tee_start_type === "two_tee" ? "Two-Tee Start" : "1st Tee Only"}
        </span>
      </div>
      <div className="bg-white p-3 space-y-2">
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label className="text-xs mb-1 block">First Tee Time</Label>
            {lockedStart ? (
              <div className="h-8 flex items-center px-2 rounded-md border bg-[#1a5c38]/5 border-[#1a5c38]/30">
                <span className="font-mono text-xs font-semibold text-[#1a5c38]">{block.start}</span>
              </div>
            ) : (
              <Input type="time" value={block.start} onChange={e => handleStartChange(e.target.value)} className="h-8 text-xs" />
            )}
          </div>
          <div>
            <Label className="text-xs mb-1 block">Number of Slots</Label>
            <Select value={String(count)} onValueChange={v => handleCountChange(Number(v))}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-56">
                {countOptions.map(o => (
                  <SelectItem key={o.value} value={String(o.value)} className="text-xs">{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs mb-1 block">Interval (min)</Label>
            <Input type="number" min={1} max={60} value={block.interval}
              onChange={e => handleIntervalChange(Number(e.target.value))} className="h-8 text-xs" />
          </div>
        </div>
        <div className="flex items-center gap-4 pt-0.5">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>Last tee time:</span>
            <span className="font-mono font-semibold text-[#1a5c38] bg-green-50 px-2 py-0.5 rounded">{block.end}</span>
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
      </div>
    </div>
  );
}

// ─── GenerateTeeTimesDialog ───────────────────────────────────────────────────
// Same dialog as the Schedule page. Pass `initialDate` to pre-fill both date fields
// (e.g. when opening from a tournament day card). `onComplete(dateFrom)` fires after
// generation so the caller can reload its slot list.

export function GenerateTeeTimesDialog({
  open, onOpenChange, onComplete, initialDate, eventId, onStagedSlots,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onComplete: (dateFrom: string) => void;
  initialDate?: string;
  eventId?: number;
  onStagedSlots?: (slots: Array<{ date: string; time: string; total_slots: number }>) => void;
}) {
  const lockDate = !!initialDate;
  const { toast } = useToast();
  const readOnly = useReadOnly();
  const [tab, setTab] = useState<"A" | "B">("A");
  const [dateFrom, setDateFrom] = useState(initialDate ?? today());
  const [dateTo, setDateTo]   = useState(initialDate ?? today());
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

  // Config A & B block state
  const [cfgA, setCfgA] = useState({ ...CFG_A_DEFAULT });
  const updateA = (key: "morning" | "midday" | "twilight") => (patch: Partial<Block>) =>
    setCfgA(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  const [cfgB, setCfgB] = useState({ ...CFG_B_DEFAULT });
  const updateB = (key: "morning" | "midday") => (patch: Partial<Block>) =>
    setCfgB(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  // Sync dates when initialDate changes (dialog may be re-used for different days)
  useEffect(() => {
    if (open && initialDate) {
      setDateFrom(initialDate);
      setDateTo(initialDate);
    }
  }, [open, initialDate]);

  // Fetch tournament conflicts when date range changes (only for general schedule generation)
  useEffect(() => {
    if (!open || eventId || !dateFrom || !dateTo) { setTournamentConflicts([]); return; }
    setConflictsLoading(true);
    api<Array<{ date: string; time: string; event_name: string }>>(`/api/portal/tee-times/tournament-conflicts?from=${dateFrom}&to=${dateTo}`)
      .then(setTournamentConflicts)
      .catch(() => setTournamentConflicts([]))
      .finally(() => setConflictsLoading(false));
  }, [open, eventId, dateFrom, dateTo]);

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
        generateBlockTimes(b.start, b.end, b.interval).map(t => ({ time: t, tee_start_type: b.tee_start_type, crossover_enabled: false }));
      slots_per_day = [...toEntries(cfgB.morning), ...toEntries(cfgB.midday)];
    }
    return { dates: dates.length, perDay: slots_per_day.length, total: dates.length * slots_per_day.length, times: slots_per_day };
  }, [tab, dateFrom, dateTo, cfgA, cfgB]);

  // Auto-derive PM block from AM + crossover gap (Config A)
  useEffect(() => {
    const pmStart = fromMin(toMin(cfgA.morning.end) + cfgA.crossoverGapMin);
    setCfgA(p => ({ ...p, midday: { ...p.midday, start: pmStart } }));
  }, [cfgA.morning.end, cfgA.crossoverGapMin]);

  // Auto-derive Twilight from PM + field reset gap (Config A)
  useEffect(() => {
    const twilightStart = fromMin(toMin(cfgA.midday.end) + cfgA.fieldResetGapMin);
    setCfgA(p => ({ ...p, twilight: { ...p.twilight, start: twilightStart } }));
  }, [cfgA.midday.end, cfgA.fieldResetGapMin]);

  // Auto-derive PM from AM + crossover gap (Config B)
  useEffect(() => {
    const pmStart = fromMin(toMin(cfgB.morning.end) + cfgB.crossoverGapMin);
    setCfgB(p => ({ ...p, midday: { ...p.midday, start: pmStart } }));
  }, [cfgB.morning.end, cfgB.crossoverGapMin]);

  const resetA = () => setCfgA({ ...CFG_A_DEFAULT });
  const resetB = () => setCfgB({ ...CFG_B_DEFAULT });

  // Load saved configs on open
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
    if (cfg.config_type === "A") { setCfgA({ ...CFG_A_DEFAULT, ...cfg.config_data }); setTab("A"); }
    else { setCfgB({ ...CFG_B_DEFAULT, ...cfg.config_data }); setTab("B"); }
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
      await api(`/api/portal/schedule-configs/${id}`, { method: "PUT", body: JSON.stringify({ name }) });
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

    // Build conflict lookup for general schedule generation (tournament-mode has no conflicts)
    const conflictSet = new Set(tournamentConflicts.map(c => `${String(c.date).slice(0, 10)}|${String(c.time).slice(0, 5)}`));

    let allSlots: Array<{ date: string; time: string; tee_start_type: string; crossover_enabled: boolean }> = [];
    let skipped = 0;
    for (const date of dates) {
      if (tab === "A") {
        const addBlock = (b: Block) =>
          generateBlockTimes(b.start, b.end, b.interval).forEach(t => {
            if (!eventId && conflictSet.has(`${date}|${t}`)) { skipped++; return; }
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
            if (!eventId && conflictSet.has(`${date}|${t}`)) { skipped++; return; }
            allSlots.push({ date, time: t, tee_start_type: b.tee_start_type, crossover_enabled: false });
          });
        addBlock(cfgB.morning); addBlock(cfgB.midday);
      }
    }

    // Staged mode: no event ID yet (new tournament) — return slots to caller in memory
    if (!eventId && onStagedSlots) {
      onStagedSlots(allSlots.map(s => ({ date: s.date, time: s.time, total_slots: slots })));
      const skippedNote = skipped > 0 ? ` (${skipped} conflict${skipped > 1 ? "s" : ""} skipped)` : "";
      toast({
        title: "Schedule ready",
        description: `${allSlots.length} tee slot${allSlots.length !== 1 ? "s" : ""} staged${skippedNote} — saved when you create the tournament.`,
      });
      setGenerating(false);
      onOpenChange(false);
      onComplete(dateFrom);
      return;
    }

    setProgress({ done: 0, total: allSlots.length });
    let done = 0;
    let errors = 0;

    try {
      const clearUrl = eventId
        ? `/api/portal/tee-times/clear?from=${dateFrom}&to=${dateTo}&event_id=${eventId}`
        : `/api/portal/tee-times/clear?from=${dateFrom}&to=${dateTo}`;
      await api(clearUrl, { method: "DELETE" });
      const BATCH = 5;
      for (let i = 0; i < allSlots.length; i += BATCH) {
        const batch = allSlots.slice(i, i + BATCH);
        await Promise.all(batch.map(s =>
          api("/api/portal/tee-times", {
            method: "POST",
            body: JSON.stringify({ date: s.date, time: s.time, price: 0, total_slots: slots, active: true, tee_start_type: s.tee_start_type, crossover_enabled: s.crossover_enabled, ...(eventId ? { event_id: eventId } : {}) }),
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

        {/* Saved Configurations */}
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
                      <Input className="h-6 text-xs flex-1 min-w-0" value={renameValue}
                        onChange={e => setRenameValue(e.target.value)} autoFocus onBlur={() => setRenamingId(null)} />
                      <Button type="submit" size="sm" className="h-6 px-2 text-xs bg-[#1a5c38] hover:bg-[#164d30]">Save</Button>
                    </form>
                  ) : (
                    <>
                      <span className="flex-1 text-sm font-medium truncate cursor-pointer hover:text-[#1a5c38]"
                        onDoubleClick={() => { setRenamingId(cfg.id); setRenameValue(cfg.name); }}
                        title="Double-click to rename">{cfg.name}</span>
                      <Button size="sm" variant="outline"
                        className="h-6 px-2 text-xs flex-shrink-0 border-[#1a5c38]/30 text-[#1a5c38] hover:bg-[#1a5c38]/10"
                        onClick={() => handleLoadConfig(cfg)}>Load</Button>
                      <Button size="sm" variant="ghost"
                        className="h-6 w-6 p-0 flex-shrink-0 text-destructive/50 hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDeleteConfig(cfg.id, cfg.name)}><X className="h-3 w-3" /></Button>
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
              <button key={c} onClick={() => setTab(c)}
                className={`relative text-left rounded-lg border-2 px-4 py-3 transition-all focus:outline-none ${
                  tab === c ? "border-[#1a5c38] bg-white shadow-md ring-2 ring-[#1a5c38]/20" : "border-gray-200 bg-white/60 hover:border-[#1a5c38]/40 hover:bg-white"
                }`}>
                {tab === c && (
                  <span className="absolute top-2 right-2 w-4 h-4 rounded-full bg-[#1a5c38] flex items-center justify-center">
                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 10"><path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </span>
                )}
                <span className={`block text-lg font-black mb-0.5 ${tab === c ? "text-[#1a5c38]" : "text-gray-400"}`}>Config {c}</span>
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
        {lockDate ? (
          <div className="rounded-lg border border-[#1a5c38]/30 bg-[#1a5c38]/5 px-4 py-2.5 flex items-center gap-2.5">
            <CalendarCog className="h-4 w-4 text-[#1a5c38] shrink-0" />
            <div>
              <p className="text-xs font-semibold text-[#1a5c38]">Generating for</p>
              <p className="text-sm font-bold text-[#1a5c38]">
                {dateFrom ? format(new Date(dateFrom + "T12:00:00"), "EEEE, d MMMM yyyy") : dateFrom}
              </p>
            </div>
          </div>
        ) : (
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
        )}

        {/* Config A blocks */}
        {tab === "A" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Blocks</span>
              <button onClick={resetA} className="text-xs text-[#1a5c38] hover:underline">Reset to defaults</button>
            </div>
            <BlockEditor label="AM Block" color="border-[#1a5c38]" headerBg="bg-[#1a5c38]" block={cfgA.morning} onChange={updateA("morning")} maxSlots={11} />
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Cross-Over Gap</p>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Label className="text-xs whitespace-nowrap text-muted-foreground">Last AM slot</Label>
                  <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-white border border-amber-200">{cfgA.morning.end}</span>
                </div>
                <span className="text-muted-foreground text-xs">+</span>
                <div className="flex items-center gap-2">
                  <Input type="number" min={10} max={300} value={cfgA.crossoverGapMin}
                    onChange={e => setCfgA(p => ({ ...p, crossoverGapMin: Math.max(10, Number(e.target.value)) }))}
                    className="h-8 text-xs w-20" />
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
            <div className="rounded-lg border border-purple-200 bg-purple-50 px-4 py-3 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-purple-700">Field Reset Gap</p>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Label className="text-xs whitespace-nowrap text-muted-foreground">Last PM slot</Label>
                  <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-white border border-purple-200">{cfgA.midday.end}</span>
                </div>
                <span className="text-muted-foreground text-xs">+</span>
                <div className="flex items-center gap-2">
                  <Input type="number" min={10} max={480} value={cfgA.fieldResetGapMin}
                    onChange={e => setCfgA(p => ({ ...p, fieldResetGapMin: Math.max(10, Number(e.target.value)) }))}
                    className="h-8 text-xs w-20" />
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

        {/* Config B blocks */}
        {tab === "B" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Blocks</span>
              <button onClick={resetB} className="text-xs text-[#1a5c38] hover:underline">Reset to defaults</button>
            </div>
            <BlockEditor label="AM Block" color="border-[#1a5c38]" headerBg="bg-[#1a5c38]" block={cfgB.morning} onChange={updateB("morning")} lockTeeType />
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Cross-Over Gap</p>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Label className="text-xs whitespace-nowrap text-muted-foreground">Last AM slot</Label>
                  <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-white border border-amber-200">{cfgB.morning.end}</span>
                </div>
                <span className="text-muted-foreground text-xs">+</span>
                <div className="flex items-center gap-2">
                  <Input type="number" min={10} max={300} value={cfgB.crossoverGapMin}
                    onChange={e => setCfgB(p => ({ ...p, crossoverGapMin: Math.max(10, Number(e.target.value)) }))}
                    className="h-8 text-xs w-20" />
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

        {/* Preview */}
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
                  <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                    t.tee_start_type === "tenth_tee" ? "bg-orange-100 text-orange-700"
                    : t.tee_start_type === "two_tee" ? "bg-blue-100 text-blue-700"
                    : t.crossover_enabled ? "bg-purple-100 text-purple-700"
                    : "bg-green-100 text-green-700"
                  }`}>
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

        {/* Generate / Save */}
        {generating ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating… {progress.done} / {progress.total}
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div className="bg-[#1a5c38] h-2 rounded-full transition-all"
                style={{ width: progress.total > 0 ? `${(progress.done / progress.total) * 100}%` : "0%" }} />
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {showSavePanel ? (
              <div className="rounded-lg border border-[#c8a84b]/40 bg-[#c8a84b]/5 p-3">
                <p className="text-xs font-semibold text-[#a07c10] mb-2">Save Config {tab} as…</p>
                <form className="flex items-center gap-2" onSubmit={e => { e.preventDefault(); handleSaveConfig(); }}>
                  <Input className="flex-1 h-8 text-sm"
                    placeholder={`e.g. Winter ${tab === "A" ? "18-Hole" : "9-Hole"} Schedule`}
                    value={saveName} onChange={e => setSaveName(e.target.value)} autoFocus maxLength={100} />
                  <Button type="submit" size="sm" className="h-8 px-3 bg-[#1a5c38] hover:bg-[#164d30]" disabled={!saveName.trim() || saving}>
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BookmarkPlus className="h-3.5 w-3.5" />}
                    <span className="ml-1.5">{saving ? "Saving…" : "Save"}</span>
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="h-8 px-2"
                    onClick={() => { setShowSavePanel(false); setSaveName(""); }}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </form>
              </div>
            ) : (
              <Button variant="outline" className="w-full border-[#c8a84b]/40 text-[#a07c10] hover:bg-[#c8a84b]/10 gap-2"
                onClick={() => setShowSavePanel(true)}>
                <BookmarkPlus className="h-4 w-4" />
                Save this configuration for reuse
              </Button>
            )}
            {/* Tournament conflict notice (only for general schedule generation) */}
            {!eventId && (conflictsLoading || tournamentConflicts.length > 0) && (
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

            <Button className="w-full bg-[#1a5c38] hover:bg-[#164d30]"
              disabled={preview.perDay === 0 || readOnly}
              onClick={handleGenerate}>
              Generate {preview.total} Tee Time{preview.total !== 1 ? "s" : ""}
              {preview.dates > 1 ? ` across ${preview.dates} days` : ""}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
