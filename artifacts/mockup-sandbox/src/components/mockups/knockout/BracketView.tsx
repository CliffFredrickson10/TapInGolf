import { useState } from "react";

const GREEN  = "#1a5c38";
const GOLD   = "#c8a84b";
const RED    = "#dc2626";
const LGRAY  = "#d1d5db";

// ── Layout constants ──────────────────────────────────────────────────────────
const CARD_W    = 155;   // match card width
const CARD_H    = 78;    // match card height (must match rendered height)
const SLOT_GAP  = 6;     // gap between adjacent R1 match slots
const COL_GAP   = 40;    // horizontal space between columns (connector area)
const HEADER_H  = 56;    // height of the column header row

// ── Bracket geometry ─────────────────────────────────────────────────────────
// Compute center-Y and top-Y for every match in every round.
// R0 matches are stacked with SLOT_GAP. Each subsequent round's match center
// is the midpoint of its two feeder match centers.
function computePositions(numR1: number) {
  const unit = CARD_H + SLOT_GAP;
  const rounds: { centerY: number; topY: number }[][] = [];

  rounds[0] = Array.from({ length: numR1 }, (_, i) => ({
    centerY: i * unit + CARD_H / 2,
    topY:    i * unit,
  }));

  while (rounds[rounds.length - 1].length > 1) {
    const prev = rounds[rounds.length - 1];
    const next: typeof prev = [];
    for (let i = 0; i < prev.length; i += 2) {
      const cy = (prev[i].centerY + prev[i + 1].centerY) / 2;
      next.push({ centerY: cy, topY: cy - CARD_H / 2 });
    }
    rounds.push(next);
  }
  return rounds;
}

// ── Data types ────────────────────────────────────────────────────────────────
interface Player { id: number; name: string; handicap: number; seed: number; }
type MatchStatus   = "pending" | "live" | "complete";
type TeeStatus     = "booked" | "not_booked" | "tbd";
type NotifyStatus  = "notified" | "pending";

interface Match {
  id:         number;
  player1?:   Player;
  player2?:   Player;
  score?:     string;
  winnerId?:  number;
  status:     MatchStatus;
  teeStatus?: TeeStatus;
  notifySt?:  NotifyStatus;
  teeDate?:   string;
}

interface RoundData { label: string; deadline: string; daysLeft: number; matches: Match[]; }

// ── Seed helpers ──────────────────────────────────────────────────────────────
const mk = (id: number, name: string, hcp: number, seed: number): Player => ({ id, name, handicap: hcp, seed });
const ALL: Player[] = [
  mk(1,"T. Vorster",3,1),       mk(2,"M. de Villiers",4,2),
  mk(3,"R. Swart",5,3),         mk(4,"J. Pretorius",6,4),
  mk(5,"C. Bosman",7,5),        mk(6,"A. Kruger",9,6),
  mk(7,"D. Nkosi",10,7),        mk(8,"P. Joubert",11,8),
  mk(9,"L. Meyer",12,9),        mk(10,"K. du Plessis",13,10),
  mk(11,"B. Steyn",14,11),      mk(12,"H. Mthembu",15,12),
  mk(13,"G. van der Berg",16,13),mk(14,"F. Barnard",17,14),
  mk(15,"E. Wessels",18,15),    mk(16,"I. Dlamini",20,16),
];
const s = (seed: number) => ALL.find(p => p.seed === seed)!;

// ── Match data ────────────────────────────────────────────────────────────────
const ROUNDS: RoundData[] = [
  {
    label: "Round of 16", deadline: "30 Apr 2025", daysLeft: 2,
    matches: [
      { id:1,  player1:s(1),  player2:s(16), score:"3 & 2", winnerId:1,       status:"complete", teeStatus:"booked",     notifySt:"notified", teeDate:"12 Apr" },
      { id:2,  player1:s(8),  player2:s(9),  score:"2 Up",  winnerId:s(8).id, status:"complete", teeStatus:"booked",     notifySt:"notified", teeDate:"13 Apr" },
      { id:3,  player1:s(5),  player2:s(12),                                  status:"live",     teeStatus:"booked",     notifySt:"notified", teeDate:"14 Apr" },
      { id:4,  player1:s(4),  player2:s(13),                                  status:"pending",  teeStatus:"booked",     notifySt:"notified", teeDate:"15 Apr" },
      { id:5,  player1:s(3),  player2:s(14),                                  status:"pending",  teeStatus:"not_booked", notifySt:"notified" },
      { id:6,  player1:s(6),  player2:s(11),                                  status:"pending",  teeStatus:"not_booked", notifySt:"notified" },
      { id:7,  player1:s(7),  player2:s(10),                                  status:"pending",  teeStatus:"not_booked", notifySt:"notified" },
      { id:8,  player1:s(2),  player2:s(15),                                  status:"pending",  teeStatus:"not_booked", notifySt:"notified" },
    ],
  },
  {
    label: "Quarter-Finals", deadline: "31 May 2025", daysLeft: 32,
    matches: [
      { id:9,  player1:s(1), player2:s(8), status:"pending", teeStatus:"tbd", notifySt:"pending" },
      { id:10,                              status:"pending", teeStatus:"tbd", notifySt:"pending" },
      { id:11,                              status:"pending", teeStatus:"tbd", notifySt:"pending" },
      { id:12,                              status:"pending", teeStatus:"tbd", notifySt:"pending" },
    ],
  },
  {
    label: "Semi-Finals", deadline: "30 Jun 2025", daysLeft: 62,
    matches: [
      { id:13, status:"pending", teeStatus:"tbd", notifySt:"pending" },
      { id:14, status:"pending", teeStatus:"tbd", notifySt:"pending" },
    ],
  },
  {
    label: "Final", deadline: "31 Jul 2025", daysLeft: 93,
    matches: [
      { id:15, status:"pending", teeStatus:"tbd", notifySt:"pending" },
    ],
  },
];

const NUM_R1  = 8;                         // matches in first round
const POSITIONS = computePositions(NUM_R1);
const NUM_ROUNDS = POSITIONS.length;       // 4 rounds
const CANVAS_H  = NUM_R1 * (CARD_H + SLOT_GAP) - SLOT_GAP;
const CANVAS_W  = NUM_ROUNDS * (CARD_W + COL_GAP) + 120; // +120 for champion box

// column left-edge X for round r
const colX = (r: number) => r * (CARD_W + COL_GAP);

// ── Sub-components ────────────────────────────────────────────────────────────
function PlayerRow({ player, isWinner }: { player?: Player; isWinner?: boolean }) {
  if (!player) {
    return (
      <div style={{ display:"flex", alignItems:"center", gap:6, padding:"4px 8px", background:"#f9fafb" }}>
        <div style={{ width:16, height:16, borderRadius:"50%", background:"#e5e7eb", flexShrink:0 }} />
        <span style={{ fontSize:10, color:"#d1d5db", fontStyle:"italic" }}>TBD</span>
      </div>
    );
  }
  return (
    <div style={{ display:"flex", alignItems:"center", gap:5, padding:"4px 8px", background: isWinner ? "#f0faf4" : "#fff" }}>
      <div style={{ width:16, height:16, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:8, fontWeight:700, flexShrink:0, background: isWinner ? GREEN : "#e5e7eb", color: isWinner ? "#fff" : "#6b7280" }}>
        {player.seed}
      </div>
      <span style={{ fontSize:10, fontWeight:600, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", color: isWinner ? GREEN : "#374151" }}>
        {player.name}
      </span>
      <span style={{ fontSize:9, color:"#9ca3af", flexShrink:0 }}>+{player.handicap}</span>
    </div>
  );
}

function MatchCard({ match, x, y }: { match: Match; x: number; y: number }) {
  const done = match.status === "complete";
  const live = match.status === "live";
  const p1win = done && match.winnerId === match.player1?.id;
  const p2win = done && match.winnerId === match.player2?.id;
  const dotColor = done ? "#16a34a" : live ? GOLD : LGRAY;
  const barBg    = live ? `${GOLD}18` : done ? "#f0faf4" : "#f9fafb";
  const borderColor = live ? GOLD : done ? "#b7dfc8" : "#e5e7eb";

  return (
    <div style={{
      position:"absolute", left:x, top:y, width:CARD_W, height:CARD_H,
      border:`1.5px solid ${borderColor}`, borderRadius:8, overflow:"hidden",
      background:"#fff", boxShadow: live ? `0 0 0 2px ${GOLD}44` : "0 1px 3px rgba(0,0,0,.06)",
      display:"flex", flexDirection:"column",
    }}>
      {/* Status row */}
      <div style={{ display:"flex", alignItems:"center", gap:5, padding:"3px 8px", background:barBg, borderBottom:`1px solid ${borderColor}40` }}>
        <span style={{ width:7, height:7, borderRadius:"50%", background:dotColor, flexShrink:0 }} />
        <span style={{ fontSize:9, fontWeight:700, textTransform:"uppercase", letterSpacing:.4, color: live ? GOLD : done ? GREEN : "#9ca3af", flex:1 }}>
          {done ? "Complete" : live ? "In Progress" : "Pending"}
        </span>
        {match.score && <span style={{ fontSize:9, fontWeight:700, color:GREEN }}>{match.score}</span>}
      </div>
      {/* Players */}
      <PlayerRow player={match.player1} isWinner={p1win} />
      <div style={{ fontSize:9, textAlign:"center", color:"#d1d5db", fontWeight:700, lineHeight:"10px" }}>vs</div>
      <PlayerRow player={match.player2} isWinner={p2win} />
      {/* Info bar */}
      <div style={{ display:"flex", alignItems:"center", gap:4, padding:"2px 8px", marginTop:"auto", borderTop:"1px solid #f3f4f6" }}>
        {match.notifySt === "notified"
          ? <span style={{ fontSize:8, fontWeight:600, color:"#2563eb" }}>✉ Sent</span>
          : <span style={{ fontSize:8, color:"#d1d5db" }}>✉ pending</span>
        }
        {match.teeStatus === "booked" && match.teeDate && (
          <span style={{ fontSize:8, fontWeight:600, color:GREEN, marginLeft:4 }}>📅 {match.teeDate}</span>
        )}
        {match.teeStatus === "not_booked" && (
          <span style={{ fontSize:8, fontWeight:600, color:"#ca8a04", marginLeft:4 }}>⚠ No tee</span>
        )}
      </div>
    </div>
  );
}

function RoundHeader({ r, round }: { r: number; round: RoundData }) {
  const urgent = round.daysLeft <= 7;
  const done   = round.matches.filter(m => m.status === "complete").length;
  const total  = round.matches.length;
  return (
    <div style={{ position:"absolute", left:colX(r), top:0, width:CARD_W }}>
      <div style={{ fontSize:11, fontWeight:700, color:GREEN, marginBottom:2 }}>{round.label}</div>
      <div style={{ display:"flex", alignItems:"center", gap:4, marginBottom:3 }}>
        <span style={{ fontSize:9, color: urgent ? RED : "#6b7280" }}>⏰ {round.deadline}</span>
        <span style={{ fontSize:8, fontWeight:700, padding:"1px 5px", borderRadius:4, background: urgent ? "#fee2e2" : "#f3f4f6", color: urgent ? RED : "#9ca3af" }}>
          {round.daysLeft}d
        </span>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:4 }}>
        <div style={{ flex:1, height:4, borderRadius:2, background:"#f3f4f6", overflow:"hidden" }}>
          <div style={{ height:"100%", borderRadius:2, width:`${(done/total)*100}%`, background: done===total ? GREEN : GOLD }} />
        </div>
        <span style={{ fontSize:9, color:"#9ca3af" }}>{done}/{total}</span>
      </div>
    </div>
  );
}

// ── Connector SVG lines ───────────────────────────────────────────────────────
// Draws the ─┐ ├─ bracket connectors between round r and round r+1
function Connectors({ r }: { r: number }) {
  const prevRound = POSITIONS[r];
  const nextRound = POSITIONS[r + 1];
  if (!nextRound) return null;

  const exitX  = colX(r) + CARD_W;          // right edge of column r
  const enterX = colX(r + 1);               // left edge of column r+1
  const midX   = (exitX + enterX) / 2;

  const lines: React.ReactNode[] = [];
  nextRound.forEach((next, j) => {
    const top = prevRound[j * 2];
    const bot = prevRound[j * 2 + 1];
    const key = `${r}-${j}`;
    lines.push(
      // top feeder horizontal
      <line key={`${key}a`} x1={exitX} y1={top.centerY} x2={midX} y2={top.centerY} stroke={LGRAY} strokeWidth={1.5} />,
      // bot feeder horizontal
      <line key={`${key}b`} x1={exitX} y1={bot.centerY} x2={midX} y2={bot.centerY} stroke={LGRAY} strokeWidth={1.5} />,
      // vertical connector
      <line key={`${key}c`} x1={midX} y1={top.centerY} x2={midX} y2={bot.centerY} stroke={LGRAY} strokeWidth={1.5} />,
      // exit to next round
      <line key={`${key}d`} x1={midX} y1={next.centerY} x2={enterX} y2={next.centerY} stroke={LGRAY} strokeWidth={1.5} />,
    );
  });
  return <>{lines}</>;
}

// ── Deadline edit modal ───────────────────────────────────────────────────────
function DeadlineModal({ round, onClose }: { round: RoundData; onClose: () => void }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.3)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:50 }}
         onClick={onClose}>
      <div style={{ background:"#fff", borderRadius:16, padding:20, width:280, boxShadow:"0 20px 60px rgba(0,0,0,.2)" }}
           onClick={e => e.stopPropagation()}>
        <p style={{ fontSize:13, fontWeight:700, color:"#111", marginBottom:4 }}>Edit Round Deadline</p>
        <p style={{ fontSize:11, color:"#6b7280", marginBottom:12 }}>{round.label}</p>
        <label style={{ fontSize:11, fontWeight:600, color:"#374151", display:"block", marginBottom:6 }}>Deadline date</label>
        <input type="date" defaultValue="2025-04-30"
          style={{ width:"100%", border:"1px solid #d1d5db", borderRadius:8, padding:"6px 10px", fontSize:12, marginBottom:12 }} />
        <p style={{ fontSize:10, color:"#9ca3af", marginBottom:14 }}>Players must have a tee time booked and complete their match before this date.</p>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={onClose} style={{ flex:1, padding:"8px 0", fontSize:11, border:"1px solid #e5e7eb", borderRadius:8, background:"#fff", color:"#6b7280", cursor:"pointer" }}>Cancel</button>
          <button onClick={onClose} style={{ flex:1, padding:"8px 0", fontSize:11, borderRadius:8, background:GREEN, color:"#fff", fontWeight:700, border:"none", cursor:"pointer" }}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ── Champion box ──────────────────────────────────────────────────────────────
function ChampionBox({ y }: { y: number }) {
  return (
    <div style={{ position:"absolute", left:colX(NUM_ROUNDS) + 8, top:y - 4, width:100 }}>
      {/* connector tail already drawn in SVG */}
      <div style={{ border:`2px solid ${GOLD}`, borderRadius:12, padding:"12px 8px", background:`${GOLD}15`, textAlign:"center" }}>
        <div style={{ fontSize:22 }}>🏆</div>
        <div style={{ fontSize:10, fontWeight:700, color:GOLD, marginTop:4 }}>Champion</div>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export function BracketView() {
  const [editRound, setEditRound] = useState<number | null>(null);
  const notBooked = ROUNDS[0].matches.filter(m => m.teeStatus === "not_booked").length;
  const urgent    = ROUNDS[0].daysLeft <= 7;

  return (
    <div style={{ minHeight:"100vh", background:"#f8f9fa", fontFamily:"system-ui,sans-serif", display:"flex", flexDirection:"column" }}>
      {editRound !== null && <DeadlineModal round={ROUNDS[editRound]} onClose={() => setEditRound(null)} />}

      {/* Top bar */}
      <div style={{ background:"#fff", borderBottom:"1px solid #e5e7eb", padding:"10px 16px", display:"flex", alignItems:"center", gap:12 }}>
        <div style={{ width:32, height:32, borderRadius:8, background:GREEN, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
          <span style={{ fontSize:16 }}>🏆</span>
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:700, color:"#111" }}>Club Championship 2025 — Knockout</div>
          <div style={{ fontSize:10, color:"#9ca3af" }}>Individual · 16 players · Seeded draw · 18 holes per match</div>
        </div>
        <button style={{ padding:"6px 10px", fontSize:10, fontWeight:600, border:"1px solid #e5e7eb", borderRadius:8, background:"#fff", color:"#374151", cursor:"pointer", whiteSpace:"nowrap" }}>📢 Notify All</button>
        <button style={{ padding:"6px 12px", fontSize:10, fontWeight:700, borderRadius:8, background:GREEN, color:"#fff", border:"none", cursor:"pointer", whiteSpace:"nowrap" }}>Enter Score</button>
      </div>

      {/* Alert */}
      {notBooked > 0 && (
        <div style={{ margin:"10px 16px 0", padding:"8px 12px", borderRadius:10, background:"#fef9c3", border:"1px solid #fde68a", display:"flex", alignItems:"center", gap:8 }}>
          <span>⚠️</span>
          <span style={{ fontSize:11, color:"#92400e" }}>
            {notBooked} match{notBooked>1?"es":""} in Round of 16 have no tee time — deadline in {ROUNDS[0].daysLeft} days
          </span>
          <button style={{ marginLeft:"auto", fontSize:10, fontWeight:700, color:"#92400e", background:"none", border:"none", textDecoration:"underline", cursor:"pointer" }}>Chase players</button>
        </div>
      )}

      {/* Legend */}
      <div style={{ padding:"6px 16px", display:"flex", gap:12, alignItems:"center", flexWrap:"wrap" }}>
        {[["#16a34a","Complete"],[GOLD,"In Progress"],[LGRAY,"Pending"]].map(([c,l]) => (
          <span key={l as string} style={{ display:"flex", alignItems:"center", gap:4, fontSize:10, color:"#6b7280" }}>
            <span style={{ width:8, height:8, borderRadius:"50%", background:c as string, display:"inline-block" }} />{l}
          </span>
        ))}
        <span style={{ fontSize:10, color:"#6b7280" }}>✉ = Notified &nbsp; 📅 = Tee booked &nbsp; ⚠ = Needs booking</span>
      </div>

      {/* Bracket canvas — horizontally scrollable */}
      <div style={{ flex:1, overflowX:"auto", overflowY:"auto", padding:"8px 16px 60px" }}>
        {/* Column headers */}
        <div style={{ position:"relative", height:HEADER_H, width:CANVAS_W, marginBottom:8 }}>
          {ROUNDS.map((round, r) => (
            <div key={r} style={{ position:"absolute", left:colX(r), top:0, width:CARD_W }}>
              <RoundHeader r={r} round={round} />
              <button onClick={() => setEditRound(r)}
                style={{ position:"absolute", top:0, right:0, fontSize:9, fontWeight:600, padding:"2px 6px", borderRadius:4, border:"1px solid #e5e7eb", background:"#fff", color:"#9ca3af", cursor:"pointer" }}>
                Edit
              </button>
            </div>
          ))}
          {/* Champion header */}
          <div style={{ position:"absolute", left:colX(NUM_ROUNDS) + 8, top:0, width:100 }}>
            <div style={{ fontSize:11, fontWeight:700, color:GOLD }}>🏆 Champion</div>
          </div>
        </div>

        {/* Main bracket area */}
        <div style={{ position:"relative", width:CANVAS_W, height:CANVAS_H }}>
          {/* SVG connector overlay */}
          <svg style={{ position:"absolute", top:0, left:0, width:CANVAS_W, height:CANVAS_H, overflow:"visible", pointerEvents:"none" }}>
            {ROUNDS.map((_, r) => r < NUM_ROUNDS - 1 && <Connectors key={r} r={r} />)}
            {/* Final → Champion connector */}
            {(() => {
              const finalPos = POSITIONS[NUM_ROUNDS - 1][0];
              const fx = colX(NUM_ROUNDS - 1) + CARD_W;
              const cx = colX(NUM_ROUNDS) + 8;
              return <line x1={fx} y1={finalPos.centerY} x2={cx} y2={finalPos.centerY} stroke={GOLD} strokeWidth={1.5} strokeDasharray="4 2" />;
            })()}
          </svg>

          {/* Match cards */}
          {POSITIONS.map((roundPositions, r) =>
            roundPositions.map((pos, i) => {
              const m = ROUNDS[r]?.matches[i];
              if (!m) return null;
              return <MatchCard key={`${r}-${i}`} match={m} x={colX(r)} y={pos.topY} />;
            })
          )}

          {/* Champion box */}
          <ChampionBox y={POSITIONS[NUM_ROUNDS - 1][0].topY} />
        </div>
      </div>

      {/* Deadline footer */}
      <div style={{ position:"fixed", bottom:0, left:0, right:0, background:"#fff", borderTop:"1px solid #e5e7eb", padding:"6px 16px", display:"flex", alignItems:"center", gap:16, overflowX:"auto" }}>
        <span style={{ fontSize:10, fontWeight:600, color:"#6b7280", flexShrink:0 }}>Deadlines:</span>
        {ROUNDS.map(r => {
          const urg = r.daysLeft <= 7;
          return (
            <span key={r.label} style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
              <span style={{ fontSize:10, fontWeight:500, color:"#374151" }}>{r.label}</span>
              <span style={{ fontSize:10, color: urg ? RED : "#6b7280" }}>{r.deadline}</span>
              <span style={{ fontSize:9, fontWeight:700, padding:"1px 5px", borderRadius:4, background: urg ? "#fee2e2" : "#f3f4f6", color: urg ? RED : "#9ca3af" }}>{r.daysLeft}d</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
