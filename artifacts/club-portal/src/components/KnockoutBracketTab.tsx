import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

// ── Constants ─────────────────────────────────────────────────────────────────
const GREEN = "#1a5c38";
const GOLD  = "#c8a84b";
const RED   = "#dc2626";
const LGRAY = "#d1d5db";

const CARD_W   = 160;
const CARD_H   = 80;
const SLOT_GAP = 8;
const COL_GAP  = 44;
const HEADER_H = 60;

// ── Geometry ─────────────────────────────────────────────────────────────────
function computePositions(numR1: number) {
  const unit = CARD_H + SLOT_GAP;
  const rounds: { centerY: number; topY: number }[][] = [];
  rounds[0] = Array.from({ length: numR1 }, (_, i) => ({
    centerY: i * unit + CARD_H / 2,
    topY:    i * unit,
  }));
  while (rounds[rounds.length - 1]!.length > 1) {
    const prev = rounds[rounds.length - 1]!;
    const next: typeof prev = [];
    for (let i = 0; i < prev.length; i += 2) {
      const cy = (prev[i]!.centerY + prev[i + 1]!.centerY) / 2;
      next.push({ centerY: cy, topY: cy - CARD_H / 2 });
    }
    rounds.push(next);
  }
  return rounds;
}

const colX = (r: number) => r * (CARD_W + COL_GAP);

// ── Types ─────────────────────────────────────────────────────────────────────
interface KnockoutMatch {
  id: number; round_id: number; match_sequence: number;
  player1_id: number | null; player1_name: string | null; player1_handicap: number | null;
  player2_id: number | null; player2_name: string | null; player2_handicap: number | null;
  winner_id: number | null; winner_name: string | null;
  score: string | null; status: string;
  next_match_id: number | null; notification_sent_at: string | null;
}

interface KnockoutRound {
  id: number; event_id: number; round_number: number; label: string;
  deadline: string | null; is_complete: number;
  matches: KnockoutMatch[];
}

interface BracketData {
  event: { id: number; name: string; format: string; knockout_type: string | null; knockout_draw_method: string | null };
  rounds: KnockoutRound[];
}

// ── Subcomponents ─────────────────────────────────────────────────────────────
function PlayerRow({ name, hcp, isWinner, isBye }: { name: string | null; hcp?: number | null; isWinner?: boolean; isBye?: boolean }) {
  if (!name || isBye) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", background: "#f9fafb" }}>
        <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#e5e7eb", flexShrink: 0 }} />
        <span style={{ fontSize: 10, color: "#d1d5db", fontStyle: "italic" }}>TBD</span>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 8px", background: isWinner ? "#f0faf4" : "#fff" }}>
      <span style={{ fontSize: 10, fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: isWinner ? GREEN : "#374151" }}>
        {name}
      </span>
      {hcp != null && <span style={{ fontSize: 9, color: "#9ca3af", flexShrink: 0 }}>+{hcp}</span>}
      {isWinner && <span style={{ fontSize: 9, color: GREEN, fontWeight: 700 }}>✓</span>}
    </div>
  );
}

function MatchCard({ match, x, y, onScore }: { match: KnockoutMatch; x: number; y: number; onScore: (m: KnockoutMatch) => void }) {
  const done       = match.status === "complete";
  const live       = match.status === "in_progress";
  const bye        = match.status === "bye";
  const p1win      = done && match.winner_id === match.player1_id;
  const p2win      = done && match.winner_id === match.player2_id;
  const dotColor   = done ? "#16a34a" : live ? GOLD : bye ? "#e5e7eb" : LGRAY;
  const borderCol  = done ? "#b7dfc8" : live ? GOLD : "#e5e7eb";
  const barBg      = done ? "#f0faf4" : live ? `${GOLD}18` : "#f9fafb";
  const notified   = !!match.notification_sent_at;

  return (
    <div
      style={{
        position: "absolute", left: x, top: y, width: CARD_W, height: CARD_H,
        border: `1.5px solid ${borderCol}`, borderRadius: 8, overflow: "hidden",
        background: "#fff", boxShadow: live ? `0 0 0 2px ${GOLD}44` : "0 1px 3px rgba(0,0,0,.06)",
        display: "flex", flexDirection: "column", cursor: !bye ? "pointer" : "default",
      }}
      onClick={() => !bye && onScore(match)}
      title={!bye ? "Click to enter score" : "Bye"}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 7px", background: barBg, borderBottom: `1px solid ${borderCol}40` }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
        <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: 0.4, color: done ? GREEN : live ? GOLD : bye ? "#9ca3af" : "#9ca3af", flex: 1 }}>
          {bye ? "Bye" : done ? "Complete" : live ? "Live" : "Pending"}
        </span>
        {match.score && <span style={{ fontSize: 9, fontWeight: 700, color: GREEN }}>{match.score}</span>}
      </div>
      <PlayerRow name={match.player1_name} hcp={match.player1_handicap} isWinner={p1win} />
      <div style={{ fontSize: 9, textAlign: "center", color: "#d1d5db", fontWeight: 700, lineHeight: "10px" }}>vs</div>
      <PlayerRow name={match.player2_name} hcp={match.player2_handicap} isWinner={p2win} isBye={bye && !match.player2_name} />
      <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 7px", marginTop: "auto", borderTop: "1px solid #f3f4f6" }}>
        {notified ? <span style={{ fontSize: 8, fontWeight: 600, color: "#2563eb" }}>✉ Sent</span>
                  : <span style={{ fontSize: 8, color: "#d1d5db" }}>✉ pending</span>}
      </div>
    </div>
  );
}

function Connectors({ r, positions }: { r: number; positions: { centerY: number; topY: number }[][] }) {
  const prevRound = positions[r];
  const nextRound = positions[r + 1];
  if (!prevRound || !nextRound) return null;
  const exitX = colX(r) + CARD_W;
  const enterX = colX(r + 1);
  const midX = (exitX + enterX) / 2;
  const lines: React.ReactNode[] = [];
  nextRound.forEach((next, j) => {
    const top = prevRound[j * 2];
    const bot = prevRound[j * 2 + 1];
    if (!top || !bot) return;
    const key = `${r}-${j}`;
    lines.push(
      <line key={`${key}a`} x1={exitX}  y1={top.centerY} x2={midX}  y2={top.centerY}   stroke={LGRAY} strokeWidth={1.5} />,
      <line key={`${key}b`} x1={exitX}  y1={bot.centerY} x2={midX}  y2={bot.centerY}   stroke={LGRAY} strokeWidth={1.5} />,
      <line key={`${key}c`} x1={midX}   y1={top.centerY} x2={midX}  y2={bot.centerY}   stroke={LGRAY} strokeWidth={1.5} />,
      <line key={`${key}d`} x1={midX}   y1={next.centerY} x2={enterX} y2={next.centerY} stroke={LGRAY} strokeWidth={1.5} />,
    );
  });
  return <>{lines}</>;
}

function RoundHeader({ round, onEditDeadline }: { round: KnockoutRound; onEditDeadline: () => void }) {
  const done  = round.matches.filter(m => m.status === "complete").length;
  const total = round.matches.filter(m => m.status !== "bye").length;
  const daysLeft = round.deadline ? Math.ceil((new Date(round.deadline).getTime() - Date.now()) / 86400000) : null;
  const urgent = daysLeft != null && daysLeft <= 7;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: GREEN }}>{round.label}</span>
        <button onClick={onEditDeadline}
          style={{ fontSize: 9, fontWeight: 600, padding: "1px 5px", borderRadius: 4, border: "1px solid #e5e7eb", background: "#fff", color: "#9ca3af", cursor: "pointer", marginLeft: "auto" }}>
          Edit deadline
        </button>
      </div>
      {round.deadline && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3 }}>
          <span style={{ fontSize: 9, color: urgent ? RED : "#6b7280" }}>⏰ {round.deadline}</span>
          {daysLeft != null && (
            <span style={{ fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4, background: urgent ? "#fee2e2" : "#f3f4f6", color: urgent ? RED : "#9ca3af" }}>
              {daysLeft}d
            </span>
          )}
        </div>
      )}
      {total > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ flex: 1, height: 4, borderRadius: 2, background: "#f3f4f6", overflow: "hidden" }}>
            <div style={{ height: "100%", borderRadius: 2, width: `${(done / total) * 100}%`, background: done === total ? GREEN : GOLD }} />
          </div>
          <span style={{ fontSize: 9, color: "#9ca3af" }}>{done}/{total}</span>
        </div>
      )}
    </div>
  );
}

// ── Dialogs ───────────────────────────────────────────────────────────────────
function DeadlineDialog({ round, eventId, onClose, onSaved }: { round: KnockoutRound; eventId: number; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [deadline, setDeadline] = useState(round.deadline ?? "");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await api(`/portal/knockout/${eventId}/rounds/${round.id}`, { method: "PUT", body: JSON.stringify({ deadline: deadline || null }) });
      toast({ title: "Deadline saved" });
      onSaved();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };
  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-xs">
        <DialogHeader><DialogTitle>Edit Round Deadline — {round.label}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Deadline date</Label>
            <Input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">Players must complete their match and book a tee time before this date.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScoreDialog({ match, eventId, onClose, onSaved }: { match: KnockoutMatch; eventId: number; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [winnerId, setWinnerId] = useState<string>(match.winner_id ? String(match.winner_id) : "");
  const [score, setScore] = useState(match.score ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!winnerId) { toast({ title: "Select a winner", variant: "destructive" }); return; }
    setSaving(true);
    try {
      await api(`/portal/knockout/${eventId}/matches/${match.id}`, {
        method: "PUT",
        body: JSON.stringify({ winner_id: Number(winnerId), score: score.trim() || null }),
      });
      toast({ title: "Match result saved", description: "Winner advances to next round." });
      onSaved();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const opts = [
    match.player1_id && match.player1_name ? { id: match.player1_id, name: match.player1_name } : null,
    match.player2_id && match.player2_name ? { id: match.player2_id, name: match.player2_name } : null,
  ].filter(Boolean) as { id: number; name: string }[];

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-xs">
        <DialogHeader><DialogTitle>Enter Match Result</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Winner</Label>
            <Select value={winnerId} onValueChange={setWinnerId}>
              <SelectTrigger><SelectValue placeholder="Select winner…" /></SelectTrigger>
              <SelectContent>
                {opts.map(o => <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Score <span className="text-muted-foreground font-normal text-xs">(optional, e.g. "3 &amp; 2" or "2 Up")</span></Label>
            <Input placeholder="e.g. 3 &amp; 2" value={score} onChange={e => setScore(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save Result"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GenerateDialog({ eventId, approvedCount, onClose, onGenerated }: { eventId: number; approvedCount: number; onClose: () => void; onGenerated: () => void }) {
  const { toast } = useToast();
  const [drawMethod, setDrawMethod] = useState("random");
  const [knockoutType, setKnockoutType] = useState("individual");
  const [generating, setGenerating] = useState(false);
  const bracketSize = approvedCount < 2 ? 2 : Math.pow(2, Math.ceil(Math.log2(Math.max(approvedCount, 2))));
  const byeCount = bracketSize - approvedCount;

  const generate = async () => {
    setGenerating(true);
    try {
      await api(`/portal/knockout/${eventId}/generate`, {
        method: "POST",
        body: JSON.stringify({ draw_method: drawMethod, knockout_type: knockoutType }),
      });
      toast({ title: "Bracket generated", description: `${bracketSize}-player bracket with ${byeCount} bye${byeCount !== 1 ? "s" : ""}.` });
      onGenerated();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setGenerating(false); }
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Generate Knockout Bracket</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
            <p><span className="font-semibold">{approvedCount}</span> approved players</p>
            <p>Bracket size: <span className="font-semibold">{bracketSize}</span> {byeCount > 0 ? `(${byeCount} bye${byeCount > 1 ? "s" : ""})` : ""}</p>
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={knockoutType} onValueChange={setKnockoutType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="individual">Individual</SelectItem>
                <SelectItem value="team">Team</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Draw method</Label>
            <Select value={drawMethod} onValueChange={setDrawMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="random">Random draw</SelectItem>
                <SelectItem value="seeded">Seeded by handicap</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Seeded places lowest handicap vs highest in each match.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={generating || approvedCount < 2} onClick={generate}>
            {generating ? "Generating…" : "Generate Bracket"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export function KnockoutBracketTab({ eventId, eventName, approvedCount, readOnly }: {
  eventId: number; eventName: string; approvedCount: number; readOnly?: boolean;
}) {
  const { toast } = useToast();
  const [data, setData]           = useState<BracketData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [editDeadline, setEditDeadline] = useState<KnockoutRound | null>(null);
  const [editScore, setEditScore]       = useState<KnockoutMatch | null>(null);
  const [showGenerate, setShowGenerate] = useState(false);
  const [publishing, setPublishing]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api(`/portal/knockout/${eventId}/bracket`);
      setData(d);
    } catch {
      setData(null);
    } finally { setLoading(false); }
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  const publish = async () => {
    setPublishing(true);
    try {
      const r = await api(`/portal/knockout/${eventId}/publish`, { method: "POST" });
      toast({ title: "Draw published", description: `Notified ${r.notified} players.` });
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setPublishing(false); }
  };

  if (loading) {
    return <div className="space-y-3 py-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>;
  }

  const hasRounds = data && data.rounds.length > 0;

  if (!hasRounds) {
    return (
      <div className="py-10 text-center space-y-4">
        {showGenerate && (
          <GenerateDialog
            eventId={eventId}
            approvedCount={approvedCount}
            onClose={() => setShowGenerate(false)}
            onGenerated={() => { setShowGenerate(false); load(); }}
          />
        )}
        <div className="text-4xl">🏆</div>
        <p className="font-semibold">No bracket generated yet</p>
        <p className="text-sm text-muted-foreground">
          {approvedCount < 2 ? `Need at least 2 approved players — currently ${approvedCount}.` : `${approvedCount} players approved and ready.`}
        </p>
        {!readOnly && (
          <button
            className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white"
            style={{ background: approvedCount >= 2 ? GREEN : "#9ca3af", cursor: approvedCount >= 2 ? "pointer" : "not-allowed" }}
            disabled={approvedCount < 2}
            onClick={() => setShowGenerate(true)}
          >
            Generate Bracket
          </button>
        )}
      </div>
    );
  }

  // Compute layout
  const rounds       = data!.rounds;
  const numR1        = rounds[0]!.matches.length;
  const positions    = computePositions(numR1);
  const numRounds    = positions.length;
  const canvasH      = numR1 * (CARD_H + SLOT_GAP) - SLOT_GAP;
  const canvasW      = numRounds * (CARD_W + COL_GAP) + 130;

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      {editDeadline && (
        <DeadlineDialog round={editDeadline} eventId={eventId} onClose={() => setEditDeadline(null)} onSaved={() => { setEditDeadline(null); load(); }} />
      )}
      {editScore && (
        <ScoreDialog match={editScore} eventId={eventId} onClose={() => setEditScore(null)} onSaved={() => { setEditScore(null); load(); }} />
      )}
      {showGenerate && (
        <GenerateDialog eventId={eventId} approvedCount={approvedCount} onClose={() => setShowGenerate(false)} onGenerated={() => { setShowGenerate(false); load(); }} />
      )}

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 12, color: "#6b7280" }}>
            {data!.event.knockout_type === "team" ? "Team" : "Individual"} · {data!.event.knockout_draw_method === "seeded" ? "Seeded" : "Random"} draw · {rounds[0]!.matches.length * 2} player bracket
          </span>
        </div>
        {!readOnly && (
          <>
            <button
              style={{ padding: "5px 10px", fontSize: 11, fontWeight: 600, border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff", cursor: "pointer" }}
              onClick={() => setShowGenerate(true)}
            >
              🔄 Regenerate
            </button>
            <button
              style={{ padding: "5px 12px", fontSize: 11, fontWeight: 700, borderRadius: 8, background: GREEN, color: "#fff", border: "none", cursor: "pointer" }}
              onClick={publish}
              disabled={publishing}
            >
              {publishing ? "Publishing…" : "📢 Publish Draw"}
            </button>
          </>
        )}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
        {([["#16a34a", "Complete"], [GOLD, "Live"], [LGRAY, "Pending"]] as const).map(([c, l]) => (
          <span key={l} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#6b7280" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: c, display: "inline-block" }} />{l}
          </span>
        ))}
        <span style={{ fontSize: 10, color: "#9ca3af" }}>Click a match card to enter score</span>
      </div>

      {/* Bracket canvas */}
      <div style={{ overflowX: "auto", overflowY: "auto", paddingBottom: 16 }}>
        {/* Round headers */}
        <div style={{ position: "relative", height: HEADER_H, width: canvasW, marginBottom: 8 }}>
          {rounds.map((round, r) => (
            <div key={round.id} style={{ position: "absolute", left: colX(r), top: 0, width: CARD_W }}>
              <RoundHeader round={round} onEditDeadline={() => !readOnly && setEditDeadline(round)} />
            </div>
          ))}
          <div style={{ position: "absolute", left: colX(numRounds) + 8, top: 0, width: 110 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: GOLD }}>🏆 Champion</span>
          </div>
        </div>

        {/* Bracket area */}
        <div style={{ position: "relative", width: canvasW, height: canvasH }}>
          <svg style={{ position: "absolute", top: 0, left: 0, width: canvasW, height: canvasH, overflow: "visible", pointerEvents: "none" }}>
            {rounds.map((_, r) => r < numRounds - 1 && <Connectors key={r} r={r} positions={positions} />)}
            {(() => {
              const finalPos = positions[numRounds - 1]?.[0];
              if (!finalPos) return null;
              const fx = colX(numRounds - 1) + CARD_W;
              const cx = colX(numRounds) + 8;
              return <line x1={fx} y1={finalPos.centerY} x2={cx} y2={finalPos.centerY} stroke={GOLD} strokeWidth={1.5} strokeDasharray="4 2" />;
            })()}
          </svg>

          {positions.map((roundPositions, r) =>
            roundPositions.map((pos, i) => {
              const match = rounds[r]?.matches[i];
              if (!match) return null;
              return (
                <MatchCard
                  key={`${r}-${i}`}
                  match={match}
                  x={colX(r)}
                  y={pos.topY}
                  onScore={m => !readOnly && setEditScore(m)}
                />
              );
            })
          )}

          {/* Champion box */}
          {(() => {
            const finalPos = positions[numRounds - 1]?.[0];
            if (!finalPos) return null;
            const lastMatch = rounds[numRounds - 1]?.matches[0];
            const champion  = lastMatch?.winner_name ?? null;
            return (
              <div style={{ position: "absolute", left: colX(numRounds) + 8, top: finalPos.topY - 4, width: 110 }}>
                <div style={{ border: `2px solid ${GOLD}`, borderRadius: 12, padding: "10px 8px", background: `${GOLD}15`, textAlign: "center" }}>
                  <div style={{ fontSize: 20 }}>🏆</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: GOLD, marginTop: 4 }}>
                    {champion ?? "Champion"}
                  </div>
                  {champion && <div style={{ fontSize: 9, color: GREEN, fontWeight: 600, marginTop: 2 }}>{champion}</div>}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Deadline footer */}
      <div style={{ marginTop: 12, paddingTop: 8, borderTop: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: 16, overflowX: "auto" }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: "#6b7280", flexShrink: 0 }}>Deadlines:</span>
        {rounds.map(r => {
          const daysLeft = r.deadline ? Math.ceil((new Date(r.deadline).getTime() - Date.now()) / 86400000) : null;
          const urg = daysLeft != null && daysLeft <= 7;
          return (
            <span key={r.id} style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              <span style={{ fontSize: 10, fontWeight: 500, color: "#374151" }}>{r.label}</span>
              {r.deadline
                ? <span style={{ fontSize: 10, color: urg ? RED : "#6b7280" }}>{r.deadline}</span>
                : <span style={{ fontSize: 10, color: "#d1d5db" }}>—</span>
              }
              {daysLeft != null && (
                <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 4, background: urg ? "#fee2e2" : "#f3f4f6", color: urg ? RED : "#9ca3af" }}>
                  {daysLeft}d
                </span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}
