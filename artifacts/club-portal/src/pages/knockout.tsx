import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useReadOnly } from "@/context/ReadOnlyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { KnockoutBracketTab, GenerateDialog } from "@/components/KnockoutBracketTab";
import { Trophy, Plus, Trash2, CalendarDays, Users, ChevronRight, ChevronDown, Swords, ArrowLeft, Handshake, UserCheck, UserX, Clock, Zap, Pencil } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface KnockoutEvent {
  id: number;
  name: string;
  description: string | null;
  event_date: string | null;
  end_date: string | null;
  format: "knockout_individual" | "knockout_team";
  knockout_type: "individual" | "team" | null;
  knockout_draw_method: "random" | "seeded" | null;
  knockout_pairing_deadline: string | null;
  singles_entry_deadline: string | null;
  bracket_ready_notified_at: string | null;
  status: string;
  member_count: number;
  pair_count: number;
  round_count: number;
  current_round_label: string | null;
  created_at: string;
}

interface KnockoutPair {
  team_id: number;
  p1_id: number;
  p1_name: string;
  p2_id: number;
  p2_name: string;
}

interface UnpairedMember {
  id: number;
  name: string;
}

const SCORING_FORMATS = [
  { value: "stableford",  label: "Stableford" },
  { value: "stroke_play", label: "Stroke Play (Gross)" },
  { value: "match_play",  label: "Match Play" },
  { value: "net_stroke_play", label: "Stroke Play (Net)" },
  { value: "par_bogey",   label: "Par / Bogey" },
  { value: "other",       label: "Other" },
];

const EMPTY_FORM = {
  name: "",
  description: "",
  event_date: "",
  end_date: "",
  knockout_type: "" as "" | "individual" | "team",
  draw_method: "random" as "random" | "seeded",
  pairing_deadline: "",
  singles_entry_deadline: "",
  knockout_scoring_format: "stableford",
};

function fmtDate(d: string | null | undefined) {
  if (!d) return "";
  try {
    return new Date(String(d).slice(0, 10) + "T00:00:00").toLocaleDateString("en-ZA", {
      day: "numeric", month: "short", year: "numeric",
    });
  } catch { return d ?? ""; }
}

function StatusBadge({ ev }: { ev: KnockoutEvent }) {
  if (ev.status === "cancelled") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
        Cancelled
      </span>
    );
  }
  if (ev.status === "completed") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#c8a84b]/20 text-[#92711a]">
        🏆 Complete
      </span>
    );
  }
  if (!ev.round_count || Number(ev.round_count) === 0) {
    if (ev.knockout_type === "team") {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
          <Handshake className="h-3 w-3" /> Pairing Phase
        </span>
      );
    }
    if (ev.knockout_type === "individual" && ev.singles_entry_deadline) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#1a5c38]/10 text-[#1a5c38]">
          <UserCheck className="h-3 w-3" /> Entry Phase
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
        Draw not generated
      </span>
    );
  }
  if (ev.current_round_label) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#1a5c38]/10 text-[#1a5c38]">
        {ev.current_round_label} in progress
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#c8a84b]/20 text-[#92711a]">
      🏆 Complete
    </span>
  );
}

// ── Create Dialog ─────────────────────────────────────────────────────────────

function CreateDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.knockout_type) { toast({ title: "Format is required", description: "Please select Singles or Betterball.", variant: "destructive" }); return; }
    if (!form.name.trim()) { toast({ title: "Name is required", variant: "destructive" }); return; }
    if (form.knockout_type === "team" && !form.pairing_deadline) { toast({ title: "Partner deadline is required", description: "Set a date by which all players must have chosen their partner.", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const r = await api<{ id: number }>("/api/portal/knockout", {
        method: "POST",
        body: JSON.stringify(form),
      });
      toast({ title: "Knockout tournament created", description: "All active club members are automatically included." });
      onCreated(r.id);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const isBetterball = form.knockout_type === "team";

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-[#1a5c38]" />
            New Knockout Tournament
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Format picker — required */}
          <div className="space-y-2">
            <Label>
              Format <span className="text-destructive">*</span>
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, knockout_type: "individual" }))}
                className={[
                  "flex flex-col items-start gap-1 rounded-lg border-2 p-3 text-left transition-all",
                  form.knockout_type === "individual"
                    ? "border-[#1a5c38] bg-[#1a5c38]/5"
                    : "border-border hover:border-[#1a5c38]/40",
                ].join(" ")}
              >
                <div className="flex items-center gap-1.5">
                  <Swords className="h-3.5 w-3.5 text-[#1a5c38]" />
                  <span className="text-sm font-semibold">Singles</span>
                  {form.knockout_type === "individual" && (
                    <span className="ml-auto text-[10px] font-bold text-[#1a5c38]">✓</span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  1 vs 1 match play — each player competes individually
                </p>
              </button>

              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, knockout_type: "team" }))}
                className={[
                  "flex flex-col items-start gap-1 rounded-lg border-2 p-3 text-left transition-all",
                  form.knockout_type === "team"
                    ? "border-[#c8a84b] bg-[#c8a84b]/10"
                    : "border-border hover:border-[#c8a84b]/40",
                ].join(" ")}
              >
                <div className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-[#92711a]" />
                  <span className="text-sm font-semibold">Betterball</span>
                  {form.knockout_type === "team" && (
                    <span className="ml-auto text-[10px] font-bold text-[#92711a]">✓</span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  2 vs 2 pairs — each player must choose a partner
                </p>
              </button>
            </div>

            {/* Betterball partner deadline */}
            {isBetterball && (
              <div className="rounded-lg border border-[#c8a84b]/40 bg-[#c8a84b]/10 px-3 py-3 text-xs text-[#92711a] space-y-3">
                <div>
                  <p className="font-semibold mb-1">👥 Partner pairing required</p>
                  <ul className="space-y-0.5 list-disc list-inside text-[#92711a]/80">
                    <li>After creating the tournament, members pair up in the app</li>
                    <li>Each player must select their partner before the draw is generated</li>
                    <li>Unpaired players cannot be included in the bracket</li>
                  </ul>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[#92711a]">
                    Partner selection deadline <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="date"
                    value={form.pairing_deadline}
                    onChange={e => setForm(f => ({ ...f, pairing_deadline: e.target.value }))}
                    className="bg-white border-[#c8a84b]/50 focus-visible:ring-[#c8a84b]"
                  />
                  <p className="text-[10px] text-[#92711a]/70">
                    Players who have not chosen a partner by this date will be excluded from the draw.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Tournament name <span className="text-destructive">*</span></Label>
            <Input
              placeholder="e.g. Club Championship Match Play 2026"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              onKeyDown={e => e.key === "Enter" && save()}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Description <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
            <Input
              placeholder="Brief description shown to members…"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Start date <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
              <Input type="date" value={form.event_date} onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>End date <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
              <Input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Draw method</Label>
              <Select value={form.draw_method} onValueChange={v => setForm(f => ({ ...f, draw_method: v as "random" | "seeded" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="random">Random draw</SelectItem>
                  <SelectItem value="seeded">Seeded by handicap</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>
                Match scoring format <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.knockout_scoring_format}
                onValueChange={v => setForm(f => ({ ...f, knockout_scoring_format: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SCORING_FORMATS.map(sf => (
                    <SelectItem key={sf.value} value={sf.value}>{sf.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Singles entry deadline (optional) */}
          {form.knockout_type === "individual" && (
            <div className="rounded-lg border border-[#1a5c38]/30 bg-[#1a5c38]/5 px-3 py-3 text-xs text-[#1a5c38] space-y-3">
              <div>
                <p className="font-semibold mb-1">🏌️ Member entry phase (optional)</p>
                <p className="text-[#1a5c38]/80 leading-snug">
                  If set, members receive a notification and can accept or opt out of the tournament before the deadline. Only members who haven't opted out will be included in the draw.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[#1a5c38]">
                  Entry opt-out deadline <span className="text-muted-foreground text-xs font-normal">(optional)</span>
                </Label>
                <Input
                  type="date"
                  value={form.singles_entry_deadline}
                  onChange={e => setForm(f => ({ ...f, singles_entry_deadline: e.target.value }))}
                  className="bg-white border-[#1a5c38]/40 focus-visible:ring-[#1a5c38]"
                />
                <p className="text-[10px] text-[#1a5c38]/70">
                  Members can opt out until this date. Leave blank to include all active members automatically.
                </p>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-[#1a5c38]/20 bg-[#1a5c38]/5 px-3 py-2.5 text-xs text-[#1a5c38]">
            <p className="font-semibold mb-1">ℹ️ How knockout tournaments work</p>
            <ul className="space-y-0.5 text-[#1a5c38]/80 list-disc list-inside">
              <li>{form.knockout_type === "individual" && form.singles_entry_deadline ? "Members can accept or opt out; remaining members enter the draw" : "All active club members are automatically in the draw"}</li>
              <li>No registration, entry fee, or tee times required</li>
              <li>Players book their own tee times to complete each match</li>
              <li>Generate the bracket once, then update results round by round</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            className="bg-[#1a5c38] hover:bg-[#164d30]"
            disabled={saving || !form.knockout_type || (form.knockout_type === "team" && !form.pairing_deadline)}
            onClick={save}
          >
            {saving ? "Creating…" : "Create Tournament"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit Dialog ───────────────────────────────────────────────────────────────

function EditDialog({ ev, onClose, onSaved }: { ev: KnockoutEvent; onClose: () => void; onSaved: (updated: KnockoutEvent) => void }) {
  const { toast } = useToast();
  const isBetterball = ev.knockout_type === "team";
  const [form, setForm] = useState({
    name: ev.name,
    description: ev.description ?? "",
    event_date: ev.event_date ? String(ev.event_date).slice(0, 10) : "",
    end_date: ev.end_date ? String(ev.end_date).slice(0, 10) : "",
    draw_method: ev.knockout_draw_method ?? "random",
    pairing_deadline: ev.knockout_pairing_deadline ? String(ev.knockout_pairing_deadline).slice(0, 10) : "",
    singles_entry_deadline: ev.singles_entry_deadline ? String(ev.singles_entry_deadline).slice(0, 10) : "",
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.name.trim()) { toast({ title: "Name is required", variant: "destructive" }); return; }
    if (isBetterball && !form.pairing_deadline) { toast({ title: "Partner deadline is required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const updated = await api<KnockoutEvent>(`/api/portal/knockout/${ev.id}`, {
        method: "PATCH",
        body: JSON.stringify(form),
      });
      toast({ title: "Tournament updated" });
      onSaved(updated);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-[#1a5c38]" />
            Edit Tournament
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Format — read-only */}
          <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
            {isBetterball
              ? <Users className="h-3.5 w-3.5 text-[#92711a]" />
              : <Swords className="h-3.5 w-3.5 text-[#1a5c38]" />}
            <span className="text-sm font-medium">{isBetterball ? "Betterball" : "Singles"}</span>
            <span className="ml-auto text-xs text-muted-foreground">Format cannot be changed</span>
          </div>

          <div className="space-y-1.5">
            <Label>Tournament name <span className="text-destructive">*</span></Label>
            <Input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              onKeyDown={e => e.key === "Enter" && save()}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Description <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
            <Input
              placeholder="Brief description shown to members…"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Start date <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
              <Input type="date" value={form.event_date} onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>End date <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
              <Input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Draw method</Label>
            <Select value={form.draw_method} onValueChange={v => setForm(f => ({ ...f, draw_method: v as "random" | "seeded" }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="random">Random draw</SelectItem>
                <SelectItem value="seeded">Seeded by handicap</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isBetterball && (
            <div className="space-y-1.5">
              <Label>
                Partner selection deadline <span className="text-destructive">*</span>
              </Label>
              <Input
                type="date"
                value={form.pairing_deadline}
                onChange={e => setForm(f => ({ ...f, pairing_deadline: e.target.value }))}
                className="border-[#c8a84b]/50 focus-visible:ring-[#c8a84b]"
              />
            </div>
          )}

          {!isBetterball && (
            <div className="space-y-1.5">
              <Label>Entry opt-out deadline <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
              <Input
                type="date"
                value={form.singles_entry_deadline}
                onChange={e => setForm(f => ({ ...f, singles_entry_deadline: e.target.value }))}
                className="border-[#1a5c38]/40 focus-visible:ring-[#1a5c38]"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            className="bg-[#1a5c38] hover:bg-[#164d30]"
            disabled={saving || !form.name.trim() || (isBetterball && !form.pairing_deadline)}
            onClick={save}
          >
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Singles Entry Phase Panel (shown before bracket is generated) ────────────

interface SinglesEntryData {
  accepted: { id: number; name: string }[];
  pending:  { id: number; name: string }[];
  opted_out: { id: number; name: string }[];
  entry_deadline: string | null;
}

function SinglesEntryPanel({ ev }: { ev: KnockoutEvent }) {
  const { toast } = useToast();
  const [data, setData]     = useState<SinglesEntryData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<SinglesEntryData>(`/api/portal/knockout/${ev.id}/entries`);
      setData(r);
    } catch (e: any) {
      toast({ title: "Error loading entries", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [ev.id]);

  useEffect(() => { load(); }, [load]);

  const isPastDeadline = data?.entry_deadline ? new Date(data.entry_deadline) < new Date() : false;
  const totalIn = (data?.accepted.length ?? 0) + (data?.pending.length ?? 0);

  return (
    <div className="space-y-4 mb-6">
      {/* Header banner */}
      <div className="rounded-lg border border-[#1a5c38]/30 bg-[#1a5c38]/5 px-4 py-3">
        <div className="flex items-center gap-2 mb-1">
          <UserCheck className="h-4 w-4 text-[#1a5c38]" />
          <span className="text-sm font-semibold text-[#1a5c38]">Singles Entry Phase</span>
        </div>
        <p className="text-xs text-[#1a5c38]/80">
          Members are notified and can accept their spot or opt out before the draw is generated.
          {data?.entry_deadline && (
            <> Opt-out deadline: <strong>{fmtDate(data.entry_deadline)}</strong>{isPastDeadline ? " (passed)" : ""}.</>
          )}
        </p>
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-6 w-64" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Accepted */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
              <UserCheck className="h-3.5 w-3.5 text-green-600" />
              ACCEPTED ({data?.accepted.length ?? 0})
            </p>
            {(data?.accepted.length ?? 0) === 0 ? (
              <p className="text-xs text-muted-foreground italic">No members have accepted yet.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {data?.accepted.map(m => (
                  <span key={m.id} className="inline-flex items-center gap-1 rounded-full border bg-green-50 border-green-100 px-2.5 py-1 text-xs text-green-800">
                    {m.name}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Pending (not responded) */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-amber-600" />
              AWAITING RESPONSE ({data?.pending.length ?? 0})
            </p>
            {(data?.pending.length ?? 0) === 0 ? (
              <p className="text-xs text-muted-foreground italic">All members have responded.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {data?.pending.map(m => (
                  <span key={m.id} className="inline-flex items-center gap-1 rounded-full border bg-amber-50 border-amber-100 px-2.5 py-1 text-xs text-amber-800">
                    {m.name}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Opted out */}
          {(data?.opted_out.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                <UserX className="h-3.5 w-3.5 text-red-500" />
                OPTED OUT ({data?.opted_out.length ?? 0})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {data?.opted_out.map(m => (
                  <span key={m.id} className="inline-flex items-center gap-1 rounded-full border bg-red-50 border-red-100 px-2.5 py-1 text-xs text-red-700">
                    {m.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Ready-to-generate CTA */}
          {totalIn >= 2 && (isPastDeadline || (data?.pending.length ?? 0) === 0) && (
            <div className="rounded-lg border border-green-300 bg-green-50 px-4 py-3 flex items-start gap-3">
              <Zap className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-green-800">
                  {isPastDeadline ? "Entry deadline has passed — bracket ready!" : "All members have responded — bracket ready!"}
                </p>
                <p className="text-xs text-green-700 mt-0.5">
                  {totalIn} member{totalIn !== 1 ? "s" : ""} will enter the draw. Generate it below.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={load} disabled={loading}>
        {loading ? "Loading…" : "Refresh"}
      </Button>
    </div>
  );
}

// ── Betterball Pairing Panel (shown before bracket is generated) ──────────────

function BetterballPairingPanel({ ev, approvedCount, readOnly, onBracketGenerated }: {
  ev: KnockoutEvent;
  approvedCount: number;
  readOnly?: boolean;
  onBracketGenerated?: () => void;
}) {
  const { toast } = useToast();
  const [pairs, setPairs]               = useState<KnockoutPair[]>([]);
  const [pendingRequests, setPendingRequests] = useState<KnockoutPair[]>([]);
  const [unpaired, setUnpaired]         = useState<UnpairedMember[]>([]);
  const [optedOut, setOptedOut]         = useState<UnpairedMember[]>([]);
  const [deadline, setDeadline]         = useState<string | null>(null);
  const [loading, setLoading]           = useState(true);
  const [autoPairing, setAutoPairing]   = useState(false);
  const [confirmAutoPair, setConfirmAutoPair] = useState(false);
  const [bracketExists, setBracketExists] = useState((ev.round_count ?? 0) > 0);
  const [showGenerate, setShowGenerate] = useState(false);
  const [showPairings, setShowPairings] = useState((ev.round_count ?? 0) === 0);

  const load = useCallback(async () => {
    try {
      const r = await api<{ pairs: KnockoutPair[]; pending_requests: KnockoutPair[]; unpaired: UnpairedMember[]; opted_out: UnpairedMember[]; pairing_deadline: string | null }>(
        `/api/portal/knockout/${ev.id}/pairs`
      );
      setPairs(r.pairs ?? []);
      setPendingRequests(r.pending_requests ?? []);
      setUnpaired(r.unpaired ?? []);
      setOptedOut(r.opted_out ?? []);
      setDeadline(r.pairing_deadline ?? null);
    } catch (e: any) {
      toast({ title: "Error loading pairs", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [ev.id]);

  useEffect(() => { load(); }, [load]);

  const isPastDeadline = deadline ? new Date(deadline) < new Date() : false;

  const runAutoPair = async () => {
    setConfirmAutoPair(false);
    setAutoPairing(true);
    try {
      const r = await api<{ pairs_created: number; left_out: number }>(
        `/api/portal/knockout/${ev.id}/auto-pair`,
        { method: "POST" }
      );
      if (r.pairs_created === 0) {
        toast({ title: "No pairs created", description: "There weren't enough unpaired members to form any new pairs.", variant: "destructive" });
      } else {
        const msg = r.left_out > 0
          ? `${r.pairs_created} new pair${r.pairs_created !== 1 ? "s" : ""} created. ${r.left_out} member left out (odd number).`
          : `${r.pairs_created} new pair${r.pairs_created !== 1 ? "s" : ""} created. All unpaired members have been paired.`;
        toast({ title: "Auto-pairing complete", description: msg });
      }
      await load();
    } catch (e: any) {
      toast({ title: "Auto-pairing failed", description: e.message, variant: "destructive" });
    } finally { setAutoPairing(false); }
  };

  return (
    <div className="space-y-4 mb-6">
      {/* Header banner */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 flex items-start gap-3">
        <Handshake className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-blue-800">Betterball Pairing Phase</p>
          <p className="text-xs text-blue-700 mt-0.5">
            Members choose their partner via the TapIn Golf app — one player sends a request, the other must confirm. Once partners confirm, they're a pair. Generate the bracket when ready.
          </p>
          {deadline && (
            <p className="text-xs text-blue-600 font-medium mt-1">
              Pairing deadline: {fmtDate(deadline)}{isPastDeadline ? " (passed)" : ""}
            </p>
          )}
        </div>
        <div className="text-right flex-shrink-0 space-y-0.5">
          <div>
            <div className="text-lg font-bold text-blue-700">{loading ? "—" : pairs.length}</div>
            <div className="text-[10px] text-blue-500 uppercase font-semibold">confirmed</div>
          </div>
          {!loading && pendingRequests.length > 0 && (
            <div>
              <div className="text-sm font-bold text-amber-600">{pendingRequests.length}</div>
              <div className="text-[10px] text-amber-500 uppercase font-semibold">pending</div>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : (
        <div className="space-y-4">
          {/* No bracket generated yet */}
          {!bracketExists && (
            <div className="rounded-lg border border-dashed border-[#c8a84b]/60 bg-[#c8a84b]/5 px-4 py-5 flex flex-col sm:flex-row items-center gap-4">
              {showGenerate && (
                <GenerateDialog
                  eventId={ev.id}
                  approvedCount={approvedCount}
                  isPublished={false}
                  knockoutType={ev.knockout_type ?? "team"}
                  onClose={() => setShowGenerate(false)}
                  onGenerated={() => {
                    setShowGenerate(false);
                    setBracketExists(true);
                    onBracketGenerated?.();
                  }}
                />
              )}
              <div className="text-3xl flex-shrink-0">🏆</div>
              <div className="flex-1 text-center sm:text-left">
                <p className="font-semibold text-sm">No bracket generated yet</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {approvedCount < 2
                    ? `Need at least 2 confirmed pairs — currently ${approvedCount}.`
                    : `${approvedCount} confirmed pair${approvedCount !== 1 ? "s" : ""} approved and ready.`}
                </p>
              </div>
              {!readOnly && (
                <Button
                  size="sm"
                  disabled={approvedCount < 2}
                  className="bg-[#1a5c38] hover:bg-[#154a2d] text-white flex-shrink-0"
                  onClick={() => setShowGenerate(true)}
                >
                  Generate Bracket
                </Button>
              )}
            </div>
          )}

          {/* Ready-to-generate call-to-action */}
          {!bracketExists && (unpaired.length === 0 && pairs.length >= 2 || isPastDeadline && pairs.length >= 2) && (
            <div className="rounded-lg border border-green-300 bg-green-50 px-4 py-3 flex items-start gap-3">
              <Zap className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-green-800">
                  {unpaired.length === 0 ? "All members are paired — bracket ready!" : "Pairing deadline has passed — bracket ready!"}
                </p>
                <p className="text-xs text-green-700 mt-0.5">
                  {unpaired.length === 0
                    ? `${pairs.length} confirmed pairs. Generate the draw below to assign matchups and publish to players.`
                    : `${pairs.length} confirmed pairs · ${unpaired.length} unpaired member${unpaired.length !== 1 ? "s" : ""} won't be included. Generate the draw below when ready.`
                  }
                </p>
              </div>
            </div>
          )}

          {/* Collapsible pairings section */}
          <div className="rounded-lg border">
            <div className="flex items-center">
              <button
                type="button"
                className="flex-1 flex items-center gap-2 px-4 py-2.5 text-left hover:bg-muted/30 transition-colors rounded-l-lg min-w-0"
                onClick={() => setShowPairings(p => !p)}
              >
                <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground flex-shrink-0 transition-transform duration-150 ${showPairings ? "" : "-rotate-90"}`} />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex-shrink-0">Pairings</span>
                <span className="text-xs text-muted-foreground ml-1 truncate">
                  {pairs.length} confirmed · {unpaired.length} unpaired · {optedOut.length} opted out
                  {pendingRequests.length > 0 && ` · ${pendingRequests.length} pending`}
                </span>
              </button>
              <div className="px-2 flex-shrink-0">
                <Button
                  variant="outline" size="sm"
                  className="h-6 text-xs"
                  onClick={load}
                  disabled={loading}
                >
                  Refresh
                </Button>
              </div>
            </div>

            {showPairings && (
              <div className="px-4 pb-4 pt-1 border-t space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  {/* Confirmed pairs */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                      <UserCheck className="h-3.5 w-3.5 text-green-600" />
                      CONFIRMED PAIRS ({pairs.length})
                    </p>
                    {pairs.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">No confirmed pairs yet</p>
                    ) : (
                      <div className="space-y-1.5">
                        {pairs.map(p => (
                          <div key={p.team_id} className="flex items-center gap-2 rounded-md border bg-green-50/60 border-green-100 px-3 py-2 text-xs">
                            <Handshake className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                            <span className="font-medium text-green-900">{p.p1_name}</span>
                            <span className="text-green-500 font-bold">+</span>
                            <span className="font-medium text-green-900">{p.p2_name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Unpaired members */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                      <UserX className="h-3.5 w-3.5 text-amber-600" />
                      UNPAIRED ({unpaired.length})
                    </p>
                    {unpaired.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">All members are paired!</p>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-1.5">
                          {unpaired.map(m => (
                            <span key={m.id} className="inline-flex items-center gap-1 rounded-full border bg-amber-50 border-amber-100 px-2.5 py-1 text-xs text-amber-800">
                              {m.name}
                            </span>
                          ))}
                        </div>
                        {isPastDeadline && unpaired.length >= 2 && (
                          <div className="pt-1">
                            {confirmAutoPair ? (
                              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 space-y-2">
                                <p className="text-xs font-semibold text-amber-800">
                                  Randomly pair {unpaired.length} unpaired member{unpaired.length !== 1 ? "s" : ""}?
                                </p>
                                <p className="text-xs text-amber-700">
                                  This will create {Math.floor(unpaired.length / 2)} pair{Math.floor(unpaired.length / 2) !== 1 ? "s" : ""} at random.
                                  {unpaired.length % 2 !== 0 ? " 1 member with no partner will be left out of the tournament." : " All unpaired members will receive an in-app notification."}
                                </p>
                                <div className="flex gap-2">
                                  <Button size="sm" className="h-7 text-xs bg-amber-600 hover:bg-amber-700" onClick={runAutoPair} disabled={autoPairing}>
                                    {autoPairing ? "Pairing…" : "Confirm auto-pair"}
                                  </Button>
                                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setConfirmAutoPair(false)}>
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <Button
                                size="sm" variant="outline"
                                className="h-7 text-xs gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50"
                                onClick={() => setConfirmAutoPair(true)}
                                disabled={autoPairing}
                              >
                                <Zap className="h-3 w-3" />
                                Auto-pair {unpaired.length} unpaired member{unpaired.length !== 1 ? "s" : ""}
                              </Button>
                            )}
                          </div>
                        )}
                        {!isPastDeadline && (
                          <p className="text-xs text-muted-foreground">Auto-pairing is available once the pairing deadline has passed.</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Opted-out members */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                      <UserX className="h-3.5 w-3.5 text-red-500" />
                      OPTED OUT ({optedOut.length})
                    </p>
                    {optedOut.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">No members have opted out</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {optedOut.map(m => (
                          <span key={m.id} className="inline-flex items-center gap-1 rounded-full border bg-red-50 border-red-100 px-2.5 py-1 text-xs text-red-600">
                            {m.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Pending requests */}
                {pendingRequests.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-amber-500" />
                      AWAITING CONFIRMATION ({pendingRequests.length})
                    </p>
                    <div className="space-y-1.5">
                      {pendingRequests.map(p => (
                        <div key={p.team_id} className="flex items-center gap-2 rounded-md border bg-amber-50/60 border-amber-100 px-3 py-2 text-xs">
                          <Clock className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                          <span className="font-medium text-amber-900">{p.p1_name}</span>
                          <span className="text-amber-400">→</span>
                          <span className="font-medium text-amber-900">{p.p2_name}</span>
                          <span className="ml-auto text-[10px] text-amber-500 italic">waiting for confirmation</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}

// ── Detail View (full page) ───────────────────────────────────────────────────

function DetailView({ ev: evProp, onClose, onDeleted, readOnly }: {
  ev: KnockoutEvent;
  onClose: () => void;
  onDeleted: () => void;
  readOnly: boolean;
}) {
  const { toast } = useToast();
  const [ev, setEv] = useState(evProp);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [bracketKey, setBracketKey] = useState(0);

  const del = async () => {
    setDeleting(true);
    try {
      await api(`/api/portal/knockout/${ev.id}`, { method: "DELETE" });
      toast({ title: "Tournament deleted" });
      onDeleted();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setDeleting(false); setConfirmDelete(false); }
  };

  return (
    <div className="flex flex-col min-h-0 h-full">
      {showEdit && (
        <EditDialog ev={ev} onClose={() => setShowEdit(false)} onSaved={updated => { setEv(updated); setShowEdit(false); }} />
      )}
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-background border-b px-6 py-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost" size="sm"
            className="h-8 gap-1.5 text-muted-foreground hover:text-foreground -ml-2"
            onClick={onClose}
          >
            <ArrowLeft className="h-4 w-4" />
            All Tournaments
          </Button>

          <div className="w-px h-4 bg-border" />

          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Trophy className="h-4 w-4 text-[#c8a84b] flex-shrink-0" />
            <span className="font-semibold text-sm truncate">{ev.name}</span>
            <StatusBadge ev={ev} />
          </div>

          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-shrink-0">
            <span className="capitalize hidden sm:inline">
              {ev.knockout_type ?? "individual"} · {ev.knockout_draw_method === "seeded" ? "Seeded" : "Random"} draw
            </span>
            {ev.event_date && (
              <span className="flex items-center gap-1 hidden md:flex">
                <CalendarDays className="h-3 w-3" />
                {fmtDate(ev.event_date)}{ev.end_date ? ` – ${fmtDate(ev.end_date)}` : ""}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {ev.knockout_type === "team"
                ? <>{ev.pair_count} pairs</>
                : <>{ev.member_count} members</>
              }
            </span>
          </div>

          {!readOnly && (
            <div className="flex-shrink-0 ml-2 flex items-center gap-1">
              {confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-destructive font-medium">Delete?</span>
                  <Button variant="destructive" size="sm" className="h-7 text-xs" disabled={deleting} onClick={del}>
                    {deleting ? "Deleting…" : "Confirm"}
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setConfirmDelete(false)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <>
                  <Button
                    variant="ghost" size="sm" className="h-7 text-xs gap-1"
                    onClick={() => setShowEdit(true)}
                  >
                    <Pencil className="h-3.5 w-3.5" />Edit
                  </Button>
                  <Button
                    variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive gap-1"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />Delete
                  </Button>
                </>
              )}
            </div>
          )}
        </div>

        {ev.description && (
          <p className="text-xs text-muted-foreground mt-1.5 pl-2">{ev.description}</p>
        )}
      </div>

      {/* Body — fills remaining space */}
      <div className="flex-1 px-6 pt-4 pb-8 overflow-auto">
        {/* For betterball tournaments show pairing phase panel before the bracket */}
        {ev.knockout_type === "team" && (
          <BetterballPairingPanel
            ev={ev}
            approvedCount={ev.pair_count}
            readOnly={readOnly}
            onBracketGenerated={() => setBracketKey(k => k + 1)}
          />
        )}
        {/* For singles tournaments with entry phase show entry panel before the bracket */}
        {ev.knockout_type === "individual" && ev.singles_entry_deadline && (
          <SinglesEntryPanel ev={ev} />
        )}
        <KnockoutBracketTab
          key={bracketKey}
          eventId={ev.id}
          eventName={ev.name}
          approvedCount={ev.knockout_type === "team" ? ev.pair_count : ev.member_count}
          readOnly={readOnly}
          hideBanner={ev.knockout_type === "team"}
          knockoutType={ev.knockout_type ?? "individual"}
        />
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type TabValue = "ongoing" | "past" | "cancelled";

export default function KnockoutPage() {
  const { toast } = useToast();
  const readOnly = useReadOnly();
  const [events, setEvents]       = useState<KnockoutEvent[]>([]);
  const [loading, setLoading]     = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected]   = useState<KnockoutEvent | null>(null);
  const [activeTab, setActiveTab] = useState<TabValue>("ongoing");

  const ongoing   = events.filter(e => e.status === "active");
  const past      = events.filter(e => e.status === "completed");
  const cancelled = events.filter(e => e.status === "cancelled");
  const tabEvents = activeTab === "ongoing" ? ongoing : activeTab === "past" ? past : cancelled;

  const load = useCallback(async () => {
    try {
      const r = await api<{ events: KnockoutEvent[] }>("/api/portal/knockout");
      setEvents(r.events ?? []);
    } catch (e: any) {
      toast({ title: "Error loading tournaments", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Full-page detail view when a tournament is selected ───────────────────
  if (selected) {
    return (
      <>
        <DetailView
          ev={selected}
          readOnly={readOnly}
          onClose={() => setSelected(null)}
          onDeleted={() => { setSelected(null); load(); }}
        />
        {createOpen && (
          <CreateDialog
            onClose={() => setCreateOpen(false)}
            onCreated={id => {
              setCreateOpen(false);
              load().then(() => {
                setEvents(evs => {
                  const found = evs.find(e => e.id === id);
                  if (found) setSelected(found);
                  return evs;
                });
              });
            }}
          />
        )}
      </>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <Swords className="h-5 w-5 text-[#1a5c38]" />
            <h1 className="text-xl font-bold">Knockout Tournaments</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Match play bracket tournaments — all active club members are automatically in the draw
          </p>
        </div>
        {!readOnly && (
          <Button className="bg-[#1a5c38] hover:bg-[#164d30] gap-2" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            New Tournament
          </Button>
        )}
      </div>

      {/* Info strip */}
      <div className="rounded-lg border border-dashed border-[#1a5c38]/30 bg-[#1a5c38]/3 px-4 py-3 mb-6 flex items-start gap-3">
        <Trophy className="h-4 w-4 text-[#c8a84b] mt-0.5 flex-shrink-0" />
        <div className="text-xs text-muted-foreground">
          <p><span className="font-semibold text-foreground">How it works:</span> Create a tournament → generate the bracket from all active members → publish the draw to notify players → update match results round by round as players complete their matches on any available tee time.</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b mb-4">
        {(["ongoing", "past", "cancelled"] as const).map(tab => {
          const count = tab === "ongoing" ? ongoing.length : tab === "past" ? past.length : cancelled.length;
          const active = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 capitalize ${active ? "border-[#1a5c38] text-[#1a5c38]" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {tab}
              {!loading && count > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${tab === "cancelled" ? "bg-red-100 text-red-600" : tab === "ongoing" ? "bg-[#1a5c38]/10 text-[#1a5c38]" : "bg-gray-100 text-gray-600"}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tournament list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
      ) : tabEvents.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center space-y-4">
            <div className="text-5xl">{activeTab === "past" ? "📋" : activeTab === "cancelled" ? "🚫" : "🏆"}</div>
            <div>
              <p className="font-semibold text-base">
                {activeTab === "ongoing" ? "No ongoing tournaments" : activeTab === "past" ? "No past tournaments" : "No cancelled tournaments"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {activeTab === "ongoing"
                  ? "Create your first tournament to get started. All active club members will be automatically included."
                  : activeTab === "past"
                  ? "Completed tournaments will appear here once all rounds are finished."
                  : "Cancelled tournaments will appear here."}
              </p>
            </div>
            {activeTab === "ongoing" && !readOnly && (
              <Button className="bg-[#1a5c38] hover:bg-[#164d30] gap-2 mt-2" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                New Tournament
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tabEvents.map(ev => (
            <Card
              key={ev.id}
              className="hover:shadow-md transition-shadow cursor-pointer border"
              onClick={() => setSelected(ev)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-[#1a5c38]/10 flex items-center justify-center flex-shrink-0">
                    <Trophy className="h-5 w-5 text-[#c8a84b]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="font-semibold text-sm truncate">{ev.name}</p>
                      <StatusBadge ev={ev} />
                      {ev.bracket_ready_notified_at && Number(ev.round_count) === 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                          <Zap className="h-2.5 w-2.5" />
                          Generate bracket
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      <span className="capitalize">{ev.knockout_type ?? "individual"}</span>
                      <span>·</span>
                      <span>{ev.knockout_draw_method === "seeded" ? "Seeded" : "Random"} draw</span>
                      {ev.event_date && (
                        <>
                          <span>·</span>
                          <span className="flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" />
                            {fmtDate(ev.event_date)}{ev.end_date ? ` – ${fmtDate(ev.end_date)}` : ""}
                          </span>
                        </>
                      )}
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {ev.knockout_type === "team"
                          ? <>{ev.pair_count} pairs · {ev.member_count} members</>
                          : <>{ev.member_count} members</>
                        }
                      </span>
                      {ev.round_count > 0 && (
                        <>
                          <span>·</span>
                          <span>{ev.round_count}-round bracket</span>
                        </>
                      )}
                    </div>
                    {ev.description && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">{ev.description}</p>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {createOpen && (
        <CreateDialog
          onClose={() => setCreateOpen(false)}
          onCreated={id => {
            setCreateOpen(false);
            load().then(() => {
              setEvents(evs => {
                const found = evs.find(e => e.id === id);
                if (found) setSelected(found);
                return evs;
              });
            });
          }}
        />
      )}
    </div>
  );
}
