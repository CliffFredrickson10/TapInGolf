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
  player1_partner_id: number | null; player1_partner_name: string | null; player1_team_name: string | null;
  player2_id: number | null; player2_name: string | null; player2_handicap: number | null;
  player2_partner_id: number | null; player2_partner_name: string | null; player2_team_name: string | null;
  winner_id: number | null; winner_name: string | null;
  score: string | null; status: string;
  next_match_id: number | null; notification_sent_at: string | null;
  player1_result: string | null; player2_result: string | null; dispute: boolean;
}

interface KnockoutRound {
  id: number; event_id: number; round_number: number; label: string;
  deadline: string | null; is_complete: number;
  matches: KnockoutMatch[];
}

interface BracketData {
  event: { id: number; name: string; format: string; knockout_type: string | null; knockout_draw_method: string | null; club_name: string | null };
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

function ResultBadge({ result }: { result: string | null }) {
  if (!result) return null;
  const won = result === "won";
  return (
    <span style={{ fontSize: 8, fontWeight: 700, padding: "1px 4px", borderRadius: 3,
      background: won ? "#dcfce7" : "#fee2e2", color: won ? "#15803d" : "#dc2626", flexShrink: 0 }}>
      {won ? "W" : "L"}
    </span>
  );
}

function MatchCard({ match, x, y, onScore, feeders = [] }: { match: KnockoutMatch; x: number; y: number; onScore: (m: KnockoutMatch) => void; feeders?: KnockoutMatch[] }) {
  const done       = match.status === "complete";
  const live       = match.status === "in_progress";
  const bye        = match.status === "bye";
  const disputed   = !!match.dispute;
  // walkover: deadline expired — no winner regardless of whether players were set
  const walkover   = done && !match.winner_id;
  // Guard against null === null — only highlight a real winner
  const p1win      = done && !walkover && match.winner_id !== null && match.winner_id === match.player1_id;
  const p2win      = done && !walkover && match.winner_id !== null && match.winner_id === match.player2_id;
  // "Did not play": slot is empty because its feeder match expired with no winner
  const sortedFeeders = [...feeders].sort((a, b) => a.match_sequence - b.match_sequence);
  const isVoid = (f?: KnockoutMatch) => !!f && f.status === "complete" && !f.winner_id;
  const p1IsDNP = !match.player1_id && isVoid(sortedFeeders[0]);
  const p2IsDNP = !match.player2_id && isVoid(sortedFeeders[1]);
  const dotColor   = disputed ? RED : walkover ? "#f97316" : done ? "#16a34a" : live ? GOLD : bye ? "#e5e7eb" : LGRAY;
  const borderCol  = disputed ? RED : walkover ? "#fed7aa" : done ? "#b7dfc8" : live ? GOLD : "#e5e7eb";
  const barBg      = disputed ? "#fee2e2" : walkover ? "#fff7ed" : done ? "#f0faf4" : live ? `${GOLD}18` : "#f9fafb";
  const notified   = !!match.notification_sent_at;

  return (
    <div
      style={{
        position: "absolute", left: x, top: y, width: CARD_W, height: CARD_H,
        border: `1.5px solid ${borderCol}`, borderRadius: 8, overflow: "hidden",
        background: "#fff", boxShadow: disputed ? `0 0 0 2px ${RED}44` : live ? `0 0 0 2px ${GOLD}44` : "0 1px 3px rgba(0,0,0,.06)",
        display: "flex", flexDirection: "column", cursor: !bye ? "pointer" : "default",
      }}
      onClick={() => !bye && onScore(match)}
      title={disputed ? "⚠️ Disputed — click to resolve" : !bye ? "Click to enter score" : "Bye"}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 7px", background: barBg, borderBottom: `1px solid ${borderCol}40` }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
        <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: 0.4,
          color: disputed ? RED : walkover ? "#f97316" : done ? GREEN : live ? GOLD : "#9ca3af", flex: 1 }}>
          {disputed ? "⚠️ Disputed" : walkover ? "⏱ Walkover" : bye ? "Bye" : done ? "Complete" : live ? "Live" : "Pending"}
        </span>
        {match.score && <span style={{ fontSize: 9, fontWeight: 700, color: GREEN }}>{match.score}</span>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", background: p1win ? "#f0faf4" : "#fff" }}>
        {match.player1_name ? (
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 10, fontWeight: 600, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: p1win ? GREEN : "#374151" }}>
              {match.player1_name}
            </span>
            {match.player1_partner_name && (
              <span style={{ fontSize: 9, color: "#9ca3af", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                &amp; {match.player1_partner_name}
              </span>
            )}
          </div>
        ) : (
          <span style={{ fontSize: 10, flex: 1, fontStyle: "italic", color: p1IsDNP ? "#f97316" : "#d1d5db" }}>
            {p1IsDNP ? "Did not play" : "TBD"}
          </span>
        )}
        {match.player1_handicap != null && !match.player1_partner_name && <span style={{ fontSize: 9, color: "#9ca3af", flexShrink: 0 }}>+{match.player1_handicap}</span>}
        {p1win && <span style={{ fontSize: 9, color: GREEN, fontWeight: 700 }}>✓</span>}
        {!done && <ResultBadge result={match.player1_result} />}
      </div>
      <div style={{ fontSize: 9, textAlign: "center", color: "#d1d5db", fontWeight: 700, lineHeight: "10px" }}>vs</div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", background: p2win ? "#f0faf4" : "#fff" }}>
        {match.player2_name ? (
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 10, fontWeight: 600, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: p2win ? GREEN : "#374151" }}>
              {match.player2_name}
            </span>
            {match.player2_partner_name && (
              <span style={{ fontSize: 9, color: "#9ca3af", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                &amp; {match.player2_partner_name}
              </span>
            )}
          </div>
        ) : (
          <span style={{ fontSize: 10, flex: 1, fontStyle: "italic", color: p2IsDNP ? "#f97316" : "#d1d5db" }}>
            {bye ? "Bye" : p2IsDNP ? "Did not play" : "TBD"}
          </span>
        )}
        {match.player2_handicap != null && !match.player2_partner_name && <span style={{ fontSize: 9, color: "#9ca3af", flexShrink: 0 }}>+{match.player2_handicap}</span>}
        {p2win && <span style={{ fontSize: 9, color: GREEN, fontWeight: 700 }}>✓</span>}
        {!done && <ResultBadge result={match.player2_result} />}
      </div>
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

function deadlineBadge(deadline: string | null): { label: string; bg: string; color: string } | null {
  if (!deadline) return null;
  const d = new Date(deadline);
  if (isNaN(d.getTime())) return null;
  const daysLeft = Math.ceil((d.getTime() - Date.now()) / 86400000);
  if (daysLeft < 0)  return { label: "Overdue",      bg: "#fee2e2", color: RED };
  if (daysLeft === 0) return { label: "Due today",    bg: "#fef3c7", color: "#b45309" };
  if (daysLeft === 1) return { label: "Due tomorrow", bg: "#fef3c7", color: "#b45309" };
  if (daysLeft <= 7)  return { label: `${daysLeft} days left`, bg: "#fef3c7", color: "#b45309" };
  return { label: `${daysLeft} days`, bg: "#f3f4f6", color: "#6b7280" };
}

function RoundHeader({ round, onEditDeadline }: { round: KnockoutRound; onEditDeadline: () => void }) {
  const done  = round.matches.filter(m => m.status === "complete").length;
  const total = round.matches.filter(m => m.status !== "bye").length;
  const badge = deadlineBadge(round.deadline);
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
          <span style={{ fontSize: 9, color: badge?.color ?? "#6b7280" }}>⏰ {round.deadline}</span>
          {badge && (
            <span style={{ fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4, background: badge.bg, color: badge.color }}>
              {badge.label}
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
      await api(`/api/portal/knockout/${eventId}/rounds/${round.id}`, { method: "PUT", body: JSON.stringify({ deadline: deadline || null }) });
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
      await api(`/api/portal/knockout/${eventId}/matches/${match.id}`, {
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

  const hasDispute = !!match.dispute;

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>{hasDispute ? "⚠️ Resolve Disputed Result" : "Enter Match Result"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {hasDispute && (
            <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8, padding: "10px 12px" }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: "#9a3412", marginBottom: 6 }}>Players reported conflicting results</p>
              {match.player1_name && match.player1_result && (
                <p style={{ fontSize: 12, color: "#7c3f1e", lineHeight: 1.5 }}>
                  <strong>{match.player1_name}</strong> reported: <strong style={{ color: match.player1_result === "won" ? "#15803d" : "#dc2626" }}>{match.player1_result}</strong>
                </p>
              )}
              {match.player2_name && match.player2_result && (
                <p style={{ fontSize: 12, color: "#7c3f1e", lineHeight: 1.5, marginTop: 2 }}>
                  <strong>{match.player2_name}</strong> reported: <strong style={{ color: match.player2_result === "won" ? "#15803d" : "#dc2626" }}>{match.player2_result}</strong>
                </p>
              )}
              <p style={{ fontSize: 11, color: "#9a3412", marginTop: 6, fontStyle: "italic" }}>Select the correct winner below to resolve.</p>
            </div>
          )}
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
          <Button size="sm" disabled={saving} onClick={save} style={hasDispute ? { background: "#dc2626" } : {}}>
            {saving ? "Saving…" : hasDispute ? "Resolve Dispute" : "Save Result"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GenerateDialog({ eventId, approvedCount, isPublished, onClose, onGenerated }: { eventId: number; approvedCount: number; isPublished: boolean; onClose: () => void; onGenerated: () => void }) {
  const { toast } = useToast();
  const [drawMethod, setDrawMethod] = useState("random");
  const [knockoutType, setKnockoutType] = useState("individual");
  const [generating, setGenerating] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const bracketSize = approvedCount < 2 ? 2 : Math.pow(2, Math.ceil(Math.log2(Math.max(approvedCount, 2))));
  const byeCount = bracketSize - approvedCount;

  const generate = async () => {
    setGenerating(true);
    try {
      await api(`/api/portal/knockout/${eventId}/generate`, {
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
        <DialogHeader>
          <DialogTitle>{isPublished ? "⚠️ Regenerate Draw?" : "Generate Knockout Bracket"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {isPublished && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 12px" }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: RED, marginBottom: 4 }}>Draw already published</p>
              <p style={{ fontSize: 12, color: "#7f1d1d", lineHeight: 1.5 }}>
                This draw has already been sent to players. Re-generating will <strong>erase all current matchups and scores</strong>. Players will <strong>not</strong> be automatically re-notified — you will need to publish again manually.
              </p>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 10, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={understood}
                  onChange={e => setUnderstood(e.target.checked)}
                  style={{ marginTop: 2, accentColor: RED, width: 14, height: 14, flexShrink: 0 }}
                />
                <span style={{ fontSize: 12, color: "#991b1b", fontWeight: 600 }}>
                  I understand — erase the current draw and start fresh
                </span>
              </label>
            </div>
          )}
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
          <Button
            size="sm"
            disabled={generating || approvedCount < 2 || (isPublished && !understood)}
            style={isPublished ? { background: RED } : undefined}
            onClick={generate}
          >
            {generating ? "Generating…" : isPublished ? "Regenerate Bracket" : "Generate Bracket"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export { GenerateDialog };

export function KnockoutBracketTab({ eventId, eventName, approvedCount, readOnly, hideBanner }: {
  eventId: number; eventName: string; approvedCount: number; readOnly?: boolean; hideBanner?: boolean;
}) {
  const { toast } = useToast();
  const [data, setData]           = useState<BracketData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [editDeadline, setEditDeadline] = useState<KnockoutRound | null>(null);
  const [editScore, setEditScore]       = useState<KnockoutMatch | null>(null);
  const [showGenerate, setShowGenerate] = useState(false);
  const [publishing, setPublishing]     = useState(false);
  const [showPrintMenu, setShowPrintMenu] = useState(false);
  const [fitToPage, setFitToPage]         = useState(true);

  // Paper sizes (landscape) — available print area in px at 96dpi with 10mm margins each side
  const PRINT_SIZES = [
    { key: "A4", label: "A4", css: "A4", pxW: 1047, pxH: 718,  desc: "210 × 297mm — desktop printer" },
    { key: "A3", label: "A3", css: "A3", pxW: 1512, pxH: 1047, desc: "297 × 420mm — large desktop / office" },
    { key: "A2", label: "A2", css: "A2", pxW: 2170, pxH: 1512, desc: "420 × 594mm — print shop" },
    { key: "A1", label: "A1", css: "A1", pxW: 3103, pxH: 2170, desc: "594 × 841mm — poster" },
    { key: "A0", label: "A0", css: "A0", pxW: 4419, pxH: 3103, desc: "841 × 1189mm — noticeboard banner" },
  ] as const;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api(`/api/portal/knockout/${eventId}/bracket`);
      setData(d);
    } catch {
      setData(null);
    } finally { setLoading(false); }
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  const publish = async () => {
    setPublishing(true);
    try {
      const r = await api(`/api/portal/knockout/${eventId}/publish`, { method: "POST" });
      const pushLine  = r.notified > 0 ? `${r.notified} push notification${r.notified !== 1 ? "s" : ""} sent. ` : "";
      const inboxLine = `In-app inbox updated for ${r.inbox_count} player${r.inbox_count !== 1 ? "s" : ""}.`;
      toast({ title: "Draw published", description: pushLine + inboxLine });
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setPublishing(false); }
  };

  const printDraw = (size: typeof PRINT_SIZES[number]) => {
    if (!data) return;
    setShowPrintMenu(false);
    const event   = data.event;
    const rounds  = data.rounds;
    const numR1   = rounds[0]!.matches.length;
    const pos     = computePositions(numR1);
    const nRounds = pos.length;
    const cH      = numR1 * (CARD_H + SLOT_GAP) - SLOT_GAP;
    const cW      = nRounds * (CARD_W + COL_GAP) + 130;
    const today   = new Date().toLocaleDateString("en-ZA", { day: "2-digit", month: "long", year: "numeric" });

    // Total content height: page header (~60px) + legend (~28px) + round headers + bracket
    const totalContentH = 60 + 28 + HEADER_H + 8 + cH;
    // Scale to fit chosen paper — width-only or both dimensions (fit to 1 page)
    const scaleW  = size.pxW / cW;
    const scaleH  = size.pxH / totalContentH;
    const scale   = fitToPage ? Math.min(scaleW, scaleH) : Math.min(1, scaleW);

    // ── SVG connector lines ───────────────────────────────────────────────────
    let svgLines = "";
    for (let r = 0; r < nRounds - 1; r++) {
      const prevR = pos[r]!;
      const nextR = pos[r + 1]!;
      const exitX  = colX(r) + CARD_W;
      const enterX = colX(r + 1);
      const midX   = (exitX + enterX) / 2;
      nextR.forEach((next, j) => {
        const top = prevR[j * 2];
        const bot = prevR[j * 2 + 1];
        if (!top || !bot) return;
        svgLines += `<line x1="${exitX}"  y1="${top.centerY}" x2="${midX}"  y2="${top.centerY}"   stroke="#d1d5db" stroke-width="1.5"/>`;
        svgLines += `<line x1="${exitX}"  y1="${bot.centerY}" x2="${midX}"  y2="${bot.centerY}"   stroke="#d1d5db" stroke-width="1.5"/>`;
        svgLines += `<line x1="${midX}"   y1="${top.centerY}" x2="${midX}"  y2="${bot.centerY}"   stroke="#d1d5db" stroke-width="1.5"/>`;
        svgLines += `<line x1="${midX}"   y1="${next.centerY}" x2="${enterX}" y2="${next.centerY}" stroke="#d1d5db" stroke-width="1.5"/>`;
      });
    }
    // Final → champion dashed line
    const finalPos = pos[nRounds - 1]?.[0];
    if (finalPos) {
      const fx = colX(nRounds - 1) + CARD_W;
      const cx = colX(nRounds) + 8;
      svgLines += `<line x1="${fx}" y1="${finalPos.centerY}" x2="${cx}" y2="${finalPos.centerY}" stroke="#c8a84b" stroke-width="1.5" stroke-dasharray="4 2"/>`;
    }

    // ── Round headers ─────────────────────────────────────────────────────────
    let headerHtml = "";
    rounds.forEach((round, r) => {
      const done  = round.matches.filter(m => m.status === "complete").length;
      const total = round.matches.filter(m => m.status !== "bye").length;
      headerHtml += `
        <div style="position:absolute;left:${colX(r)}px;top:0;width:${CARD_W}px">
          <div style="font-size:11px;font-weight:700;color:#1a5c38;margin-bottom:2px">${round.label}</div>
          ${round.deadline ? `<div style="font-size:9px;color:#6b7280">⏰ ${round.deadline}</div>` : ""}
          ${total > 0 ? `<div style="font-size:9px;color:#9ca3af;margin-top:2px">${done}/${total} complete</div>` : ""}
        </div>`;
    });
    headerHtml += `<div style="position:absolute;left:${colX(nRounds) + 8}px;top:0;width:110px">
      <span style="font-size:11px;font-weight:700;color:#c8a84b">🏆 Champion</span>
    </div>`;

    // ── Match cards ───────────────────────────────────────────────────────────
    let matchHtml = "";
    pos.forEach((roundPos, r) => {
      roundPos.forEach((p, i) => {
        const match = rounds[r]?.matches[i];
        if (!match) return;
        const bye      = match.status === "bye";
        const done     = match.status === "complete";
        const live     = match.status === "in_progress";
        const dotColor = done ? "#16a34a" : live ? "#c8a84b" : bye ? "#e5e7eb" : "#d1d5db";
        const border   = done ? "#b7dfc8" : live ? "#c8a84b" : "#e5e7eb";
        const barBg    = done ? "#f0faf4" : live ? "#c8a84b18" : "#f9fafb";
        const p1win    = done && match.winner_id === match.player1_id;
        const p2win    = done && match.winner_id === match.player2_id;
        const status   = bye ? "Bye" : done ? "Complete" : live ? "Live" : "Pending";
        const statusColor = done ? "#1a5c38" : live ? "#c8a84b" : "#9ca3af";

        const playerRow = (name: string | null, hcp: number | null, isWinner: boolean, isByeRow: boolean) => {
          if (!name || isByeRow) return `<div style="display:flex;align-items:center;gap:6px;padding:4px 8px;background:#f9fafb">
            <div style="width:14px;height:14px;border-radius:50%;background:#e5e7eb;flex-shrink:0"></div>
            <span style="font-size:10px;color:#d1d5db;font-style:italic">TBD</span>
          </div>`;
          return `<div style="display:flex;align-items:center;gap:5px;padding:4px 8px;background:${isWinner ? "#f0faf4" : "#fff"}">
            <span style="font-size:10px;font-weight:${isWinner ? 700 : 500};color:${isWinner ? "#1a5c38" : "#374151"};flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${name}${isWinner ? " ✓" : ""}</span>
            ${hcp != null ? `<span style="font-size:9px;color:#9ca3af;flex-shrink:0">+${hcp}</span>` : ""}
          </div>`;
        };

        matchHtml += `
          <div style="position:absolute;left:${colX(r)}px;top:${p.topY}px;width:${CARD_W}px;height:${CARD_H}px;border:1.5px solid ${border};border-radius:8px;overflow:hidden;background:#fff;display:flex;flex-direction:column">
            <div style="display:flex;align-items:center;gap:5px;padding:3px 7px;background:${barBg};border-bottom:1px solid ${border}40">
              <span style="width:7px;height:7px;border-radius:50%;background:${dotColor};flex-shrink:0;display:inline-block"></span>
              <span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:${statusColor};flex:1">${status}</span>
              ${match.score ? `<span style="font-size:9px;font-weight:700;color:#1a5c38">${match.score}</span>` : ""}
            </div>
            ${bye
              ? `<div style="display:flex;align-items:center;justify-content:center;flex:1;color:#9ca3af;font-size:10px;font-weight:600">${match.player1_name ?? "Bye"}</div>`
              : `${playerRow(match.player1_name, match.player1_handicap, p1win, false)}
                 <div style="font-size:9px;text-align:center;color:#d1d5db;font-weight:700;line-height:10px">vs</div>
                 ${playerRow(match.player2_name, match.player2_handicap, p2win, false)}`
            }
          </div>`;
      });
    });

    // ── Champion box ──────────────────────────────────────────────────────────
    let championHtml = "";
    if (finalPos) {
      const lastMatch = rounds[nRounds - 1]?.matches[0];
      const champion  = lastMatch?.winner_name ?? null;
      championHtml = `<div style="position:absolute;left:${colX(nRounds) + 8}px;top:${finalPos.topY - 4}px;width:110px">
        <div style="border:2px solid #c8a84b;border-radius:12px;padding:10px 8px;background:#c8a84b26;text-align:center">
          <div style="font-size:20px">🏆</div>
          <div style="font-size:10px;font-weight:700;color:#c8a84b;margin-top:4px">${champion ?? "Champion"}</div>
        </div>
      </div>`;
    }

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${event.name} — Draw</title>
  <style>
    @page { size: ${size.css} landscape; margin: 10mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: system-ui, -apple-system, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { background: #fff; }
    .page-header { margin-bottom: 14px; padding-bottom: 10px; border-bottom: 3px solid #1a5c38; display: flex; align-items: flex-end; justify-content: space-between; }
    .tournament-name { font-size: 20px; font-weight: 800; color: #1a5c38; }
    .tournament-sub  { font-size: 12px; color: #6b7280; margin-top: 4px; }
    .print-meta      { font-size: 10px; color: #9ca3af; text-align: right; line-height: 1.6; }
    .legend          { display: flex; gap: 16px; margin-bottom: 10px; align-items: center; }
    .legend-item     { display: flex; align-items: center; gap: 5px; font-size: 10px; color: #6b7280; }
    .legend-dot      { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
    .bracket-wrap    { transform-origin: top left; transform: scale(${scale.toFixed(4)}); width: ${cW}px; }
    .bracket-outer   { width: ${Math.ceil(cW * scale)}px; height: ${Math.ceil((cH + HEADER_H + 16) * scale)}px; overflow: hidden; }
  </style>
</head>
<body>
  <div class="page-header">
    <div>
      ${event.club_name ? `<div style="font-size:12px;font-weight:600;color:#c8a84b;text-transform:uppercase;letter-spacing:.8px;margin-bottom:3px">${event.club_name}</div>` : ""}
      <div class="tournament-name">${event.name}</div>
      <div class="tournament-sub">
        ${event.knockout_type === "team" ? "Team" : "Individual"} ·
        ${event.knockout_draw_method === "seeded" ? "Seeded draw" : "Random draw"} ·
        ${rounds[0]!.matches.length * 2}-player bracket
      </div>
    </div>
    <div class="print-meta">
      <div style="font-weight:700;color:#1a5c38">TapIn Golf</div>
      <div>Printed: ${today}</div>
    </div>
  </div>
  <div class="legend">
    <div class="legend-item"><span class="legend-dot" style="background:#16a34a"></span>Complete</div>
    <div class="legend-item"><span class="legend-dot" style="background:#c8a84b"></span>Live</div>
    <div class="legend-item"><span class="legend-dot" style="background:#d1d5db"></span>Pending</div>
    <div class="legend-item"><span class="legend-dot" style="background:#e5e7eb"></span>Bye</div>
  </div>
  <div class="bracket-outer">
    <div class="bracket-wrap">
      <div style="position:relative;height:${HEADER_H}px;width:${cW}px;margin-bottom:8px">${headerHtml}</div>
      <div style="position:relative;width:${cW}px;height:${cH}px">
        <svg style="position:absolute;top:0;left:0;width:${cW}px;height:${cH}px;overflow:visible;pointer-events:none">${svgLines}</svg>
        ${matchHtml}
        ${championHtml}
      </div>
    </div>
  </div>
</body>
</html>`;

    const win = window.open("", "_blank", "width=1200,height=900");
    if (!win) {
      toast({ title: "Pop-up blocked", description: "Allow pop-ups for this site to use Print Draw.", variant: "destructive" });
      return;
    }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 500);
  };

  if (loading) {
    return <div className="space-y-3 py-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>;
  }

  const hasRounds = data && data.rounds.length > 0;

  if (!hasRounds) {
    if (hideBanner) return null;
    return (
      <div className="py-10 text-center space-y-4">
        {showGenerate && (
          <GenerateDialog
            eventId={eventId}
            approvedCount={approvedCount}
            isPublished={false}
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
  const isPublished  = rounds.some(r => r.matches.some(m => m.notification_sent_at != null));

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      {editDeadline && (
        <DeadlineDialog round={editDeadline} eventId={eventId} onClose={() => setEditDeadline(null)} onSaved={() => { setEditDeadline(null); load(); }} />
      )}
      {editScore && (
        <ScoreDialog match={editScore} eventId={eventId} onClose={() => setEditScore(null)} onSaved={() => { setEditScore(null); load(); }} />
      )}
      {showGenerate && (
        <GenerateDialog eventId={eventId} approvedCount={approvedCount} isPublished={isPublished} onClose={() => setShowGenerate(false)} onGenerated={() => { setShowGenerate(false); load(); }} />
      )}

      {/* Published banner */}
      {isPublished && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, background: "#f0faf4", border: "1px solid #b7dfc8", marginBottom: 10 }}>
          <span style={{ fontSize: 16 }}>✅</span>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: GREEN }}>Draw published</span>
            <span style={{ fontSize: 11, color: "#4b7a5e", marginLeft: 8 }}>Players are notified of their Round 1 matches. When you enter a result and both players of a next-round match are known, they are automatically notified.</span>
          </div>
        </div>
      )}

      {/* Disputes banner */}
      {(() => {
        const disputed = rounds.flatMap(r => r.matches.filter(m => m.dispute));
        if (disputed.length === 0) return null;
        return (
          <div style={{ background: "#fff7ed", border: "1.5px solid #fb923c", borderRadius: 8, padding: "10px 14px", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 15 }}>⚠️</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#9a3412" }}>
                {disputed.length} disputed {disputed.length === 1 ? "match" : "matches"} — click the red card to resolve
              </span>
            </div>
            {disputed.map(m => {
              const round = rounds.find(r => r.matches.some(x => x.id === m.id));
              return (
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderTop: "1px solid #fed7aa" }}>
                  <span style={{ fontSize: 11, color: "#9a3412", fontWeight: 600, minWidth: 70 }}>{round?.label ?? "Round"}</span>
                  <span style={{ fontSize: 11, color: "#7c3f1e", flex: 1 }}>
                    {m.player1_name ?? "TBD"} vs {m.player2_name ?? "TBD"}
                    {m.player1_result && m.player2_result && (
                      <span style={{ color: "#ef4444", marginLeft: 8 }}>
                        ({m.player1_name}: {m.player1_result} · {m.player2_name}: {m.player2_result})
                      </span>
                    )}
                  </span>
                  {!readOnly && (
                    <button
                      onClick={() => setEditScore(m)}
                      style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 5, border: "1px solid #ef4444", background: "#fef2f2", color: "#dc2626", cursor: "pointer" }}
                    >
                      Resolve
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 12, color: "#6b7280" }}>
            {data!.event.knockout_type === "team" ? "Team" : "Individual"} · {data!.event.knockout_draw_method === "seeded" ? "Seeded" : "Random"} draw · {rounds[0]!.matches.length * 2} player bracket
          </span>
        </div>
        <div style={{ position: "relative" }}>
          <button
            style={{ padding: "5px 10px", fontSize: 11, fontWeight: 600, border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
            onClick={() => setShowPrintMenu(v => !v)}
          >
            🖨 Print Draw <span style={{ fontSize: 9, color: "#9ca3af" }}>▾</span>
          </button>
          {showPrintMenu && (
            <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 50, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, boxShadow: "0 4px 16px rgba(0,0,0,.12)", minWidth: 240, overflow: "hidden" }}>
                <div style={{ padding: "8px 12px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".5px" }}>Paper size (landscape)</span>
                <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 10, fontWeight: 600, color: fitToPage ? GREEN : "#6b7280", whiteSpace: "nowrap" }}>
                  <input
                    type="checkbox"
                    checked={fitToPage}
                    onChange={e => setFitToPage(e.target.checked)}
                    style={{ accentColor: GREEN, width: 13, height: 13, cursor: "pointer" }}
                  />
                  Fit to 1 page
                </label>
              </div>
              {PRINT_SIZES.map(sz => (
                <button
                  key={sz.key}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 14px", border: "none", background: "none", cursor: "pointer", borderBottom: "1px solid #f9fafb" }}
                  onMouseOver={e => (e.currentTarget.style.background = "#f9fafb")}
                  onMouseOut={e  => (e.currentTarget.style.background = "none")}
                  onClick={() => printDraw(sz)}
                >
                  <span style={{ fontSize: 12, fontWeight: 700, color: GREEN }}>{sz.label}</span>
                  <span style={{ fontSize: 10, color: "#6b7280", marginLeft: 8 }}>{sz.desc}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {!readOnly && (
          <>
            <button
              title={isPublished ? "Draw already published — re-generating will erase matchups" : "Re-generate bracket"}
              style={{
                padding: "5px 10px", fontSize: 11, fontWeight: 600, borderRadius: 8, cursor: "pointer",
                border: isPublished ? `1px solid #fca5a5` : "1px solid #e5e7eb",
                background: isPublished ? "#fef2f2" : "#fff",
                color: isPublished ? RED : "#374151",
              }}
              onClick={() => setShowGenerate(true)}
            >
              🔄 {isPublished ? "Regenerate ⚠️" : "Regenerate"}
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

          {(() => {
            // Build reverse feeder map: next_match_id → [feeder matches]
            const allMatches = rounds.flatMap(r => r.matches);
            const feedersOf: Record<number, KnockoutMatch[]> = {};
            allMatches.forEach(m => {
              if (m.next_match_id != null) {
                if (!feedersOf[m.next_match_id]) feedersOf[m.next_match_id] = [];
                feedersOf[m.next_match_id].push(m);
              }
            });
            return positions.map((roundPositions, r) =>
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
                    feeders={feedersOf[match.id] ?? []}
                  />
                );
              })
            );
          })()}

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
