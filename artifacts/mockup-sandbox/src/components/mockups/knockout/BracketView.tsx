import { useState } from "react";

const GREEN = "#1a5c38";
const GOLD = "#c8a84b";
const RED = "#dc2626";

type MatchStatus = "pending" | "live" | "complete" | "bye";
type TeeStatus = "booked" | "not_booked" | "tbd";
type NotifyStatus = "notified" | "pending";

interface Player {
  id: number;
  name: string;
  handicap: number;
  seed: number;
}

interface Match {
  id: number;
  roundIndex: number;
  matchInRound: number;
  player1?: Player;
  player2?: Player;
  score?: string;
  winnerId?: number;
  status: MatchStatus;
  teeStatus?: TeeStatus;
  notifyStatus?: NotifyStatus;
  teeDate?: string;
}

const PLAYERS: Player[] = [
  { id: 1,  name: "T. Vorster",     handicap: 3,  seed: 1  },
  { id: 2,  name: "M. de Villiers", handicap: 4,  seed: 2  },
  { id: 3,  name: "R. Swart",       handicap: 5,  seed: 3  },
  { id: 4,  name: "J. Pretorius",   handicap: 6,  seed: 4  },
  { id: 5,  name: "C. Bosman",      handicap: 7,  seed: 5  },
  { id: 6,  name: "A. Kruger",      handicap: 9,  seed: 6  },
  { id: 7,  name: "D. Nkosi",       handicap: 10, seed: 7  },
  { id: 8,  name: "P. Joubert",     handicap: 11, seed: 8  },
  { id: 9,  name: "L. Meyer",       handicap: 12, seed: 9  },
  { id: 10, name: "K. du Plessis",  handicap: 13, seed: 10 },
  { id: 11, name: "B. Steyn",       handicap: 14, seed: 11 },
  { id: 12, name: "H. Mthembu",     handicap: 15, seed: 12 },
  { id: 13, name: "G. van der Berg",handicap: 16, seed: 13 },
  { id: 14, name: "F. Barnard",     handicap: 17, seed: 14 },
  { id: 15, name: "E. Wessels",     handicap: 18, seed: 15 },
  { id: 16, name: "I. Dlamini",     handicap: 20, seed: 16 },
];

const g = (seed: number) => PLAYERS.find(p => p.seed === seed)!;

const R1: Match[] = [
  { id: 1,  roundIndex: 0, matchInRound: 0, player1: g(1),  player2: g(16), score: "3 & 2", winnerId: 1,  status: "complete", teeStatus: "booked",     notifyStatus: "notified", teeDate: "12 Apr" },
  { id: 2,  roundIndex: 0, matchInRound: 1, player1: g(8),  player2: g(9),  score: "2 Up",  winnerId: g(8).id, status: "complete", teeStatus: "booked", notifyStatus: "notified", teeDate: "13 Apr" },
  { id: 3,  roundIndex: 0, matchInRound: 2, player1: g(5),  player2: g(12), status: "live",    teeStatus: "booked",     notifyStatus: "notified", teeDate: "14 Apr" },
  { id: 4,  roundIndex: 0, matchInRound: 3, player1: g(4),  player2: g(13), status: "pending", teeStatus: "booked",     notifyStatus: "notified", teeDate: "15 Apr" },
  { id: 5,  roundIndex: 0, matchInRound: 4, player1: g(3),  player2: g(14), status: "pending", teeStatus: "not_booked", notifyStatus: "notified" },
  { id: 6,  roundIndex: 0, matchInRound: 5, player1: g(6),  player2: g(11), status: "pending", teeStatus: "not_booked", notifyStatus: "notified" },
  { id: 7,  roundIndex: 0, matchInRound: 6, player1: g(7),  player2: g(10), status: "pending", teeStatus: "not_booked", notifyStatus: "notified" },
  { id: 8,  roundIndex: 0, matchInRound: 7, player1: g(2),  player2: g(15), status: "pending", teeStatus: "not_booked", notifyStatus: "notified" },
];
const QF: Match[] = [
  { id: 9,  roundIndex: 1, matchInRound: 0, player1: g(1), player2: g(8), status: "pending", teeStatus: "tbd", notifyStatus: "pending" },
  { id: 10, roundIndex: 1, matchInRound: 1, status: "pending", teeStatus: "tbd", notifyStatus: "pending" },
  { id: 11, roundIndex: 1, matchInRound: 2, status: "pending", teeStatus: "tbd", notifyStatus: "pending" },
  { id: 12, roundIndex: 1, matchInRound: 3, status: "pending", teeStatus: "tbd", notifyStatus: "pending" },
];
const SF: Match[] = [
  { id: 13, roundIndex: 2, matchInRound: 0, status: "pending", teeStatus: "tbd", notifyStatus: "pending" },
  { id: 14, roundIndex: 2, matchInRound: 1, status: "pending", teeStatus: "tbd", notifyStatus: "pending" },
];
const FINAL: Match[] = [
  { id: 15, roundIndex: 3, matchInRound: 0, status: "pending", teeStatus: "tbd", notifyStatus: "pending" },
];

interface RoundMeta {
  label: string;
  matches: Match[];
  deadline: string;
  daysLeft: number | null;
  overdue?: boolean;
}

const ROUNDS: RoundMeta[] = [
  { label: "Round of 16",   matches: R1,    deadline: "30 Apr 2025", daysLeft: 2,    overdue: false },
  { label: "Quarter-Finals",matches: QF,    deadline: "31 May 2025", daysLeft: 32,   overdue: false },
  { label: "Semi-Finals",   matches: SF,    deadline: "30 Jun 2025", daysLeft: 62,   overdue: false },
  { label: "Final",         matches: FINAL, deadline: "31 Jul 2025", daysLeft: 93,   overdue: false },
];

function TeePill({ status, date }: { status?: TeeStatus; date?: string }) {
  if (!status || status === "tbd") return null;
  if (status === "booked") {
    return (
      <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "#dcfce7", color: "#16a34a" }}>
        📅 {date}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "#fef9c3", color: "#ca8a04" }}>
      ⚠ Not booked
    </span>
  );
}

function NotifyPill({ status }: { status?: NotifyStatus }) {
  if (!status) return null;
  if (status === "notified") {
    return <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "#eff6ff", color: "#2563eb" }}>✉ Sent</span>;
  }
  return <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "#f3f4f6", color: "#9ca3af" }}>⏳ Pending</span>;
}

function PlayerSlot({ player, isWinner, isEmpty }: { player?: Player; isWinner?: boolean; isEmpty?: boolean }) {
  if (isEmpty || !player) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded" style={{ background: "#f9fafb" }}>
        <div className="w-4 h-4 rounded-full bg-gray-200 flex-shrink-0" />
        <span className="text-[11px] text-gray-300 italic">TBD</span>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between px-2 py-1.5 rounded" style={{ background: isWinner ? "#f0faf4" : "#fff" }}>
      <div className="flex items-center gap-1.5 min-w-0">
        <div className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold flex-shrink-0"
          style={{ background: isWinner ? GREEN : "#e5e7eb", color: isWinner ? "#fff" : "#6b7280" }}>
          {player.seed}
        </div>
        <span className="text-[11px] truncate font-medium" style={{ color: isWinner ? GREEN : "#374151" }}>{player.name}</span>
      </div>
      <span className="text-[10px] text-gray-400 ml-1 flex-shrink-0">+{player.handicap}</span>
    </div>
  );
}

function MatchCard({ match }: { match: Match }) {
  const [hover, setHover] = useState(false);
  const isComplete = match.status === "complete";
  const isLive = match.status === "live";

  return (
    <div
      className="rounded-lg border overflow-hidden cursor-pointer transition-all"
      style={{
        borderColor: isLive ? GOLD : isComplete ? "#b7dfc8" : "#e5e7eb",
        background: hover ? "#fafafa" : "#fff",
        boxShadow: isLive ? `0 0 0 2px ${GOLD}33` : undefined,
        minWidth: 148, maxWidth: 162,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="flex items-center gap-1 px-2 py-1 border-b"
        style={{ borderColor: isLive ? `${GOLD}44` : "#f3f4f6", background: isLive ? `${GOLD}11` : "#f9fafb" }}>
        <span className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ background: isComplete ? "#16a34a" : isLive ? GOLD : "#d1d5db" }} />
        <span className="text-[9px] font-semibold uppercase tracking-wide flex-1"
          style={{ color: isLive ? GOLD : isComplete ? GREEN : "#9ca3af" }}>
          {isLive ? "In Progress" : isComplete ? "Complete" : "Pending"}
        </span>
        {match.score && <span className="text-[9px] font-bold" style={{ color: GREEN }}>{match.score}</span>}
      </div>
      <div className="p-1.5 flex flex-col gap-1">
        <PlayerSlot player={match.player1} isWinner={isComplete && match.winnerId === match.player1?.id} isEmpty={!match.player1} />
        <div className="text-[9px] text-center text-gray-300 font-medium">vs</div>
        <PlayerSlot player={match.player2} isWinner={isComplete && match.winnerId === match.player2?.id} isEmpty={!match.player2} />
      </div>
      {(match.teeStatus || match.notifyStatus) && (
        <div className="px-1.5 pb-1.5 flex flex-wrap gap-1">
          <NotifyPill status={match.notifyStatus} />
          <TeePill status={match.teeStatus} date={match.teeDate} />
        </div>
      )}
    </div>
  );
}

function RoundHeader({ round, onEdit }: { round: RoundMeta; onEdit: () => void }) {
  const urgent = round.daysLeft !== null && round.daysLeft <= 7;
  const done = round.matches.filter(m => m.status === "complete").length;
  const total = round.matches.length;
  return (
    <div className="mb-2 flex flex-col gap-0.5" style={{ minWidth: 148 }}>
      <div className="text-[11px] font-bold" style={{ color: GREEN }}>{round.label}</div>
      <div className="flex items-center gap-1">
        <span className="text-[10px]" style={{ color: urgent ? RED : "#6b7280" }}>⏰ {round.deadline}</span>
        {round.daysLeft !== null && (
          <span className="text-[9px] font-bold px-1 py-0.5 rounded" style={{ background: urgent ? "#fee2e2" : "#f3f4f6", color: urgent ? RED : "#6b7280" }}>
            {round.daysLeft}d left
          </span>
        )}
        <button onClick={onEdit} className="text-[9px] font-semibold ml-auto px-1.5 py-0.5 rounded border border-gray-200 text-gray-400 hover:border-green-400 hover:text-green-700 transition-all">
          Edit
        </button>
      </div>
      <div className="flex items-center gap-1 mt-0.5">
        <div className="flex-1 h-1 rounded-full bg-gray-100 overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${(done / total) * 100}%`, background: done === total ? GREEN : GOLD }} />
        </div>
        <span className="text-[9px] text-gray-400">{done}/{total}</span>
      </div>
    </div>
  );
}

function Connector({ matchCount }: { matchCount: number }) {
  const itemH = 66;
  const gap = 12;
  const colH = matchCount * itemH + (matchCount - 1) * gap;
  const midY = colH / 2;
  return (
    <div style={{ width: 24, height: colH, marginTop: 52 }}>
      <svg width="24" height={colH} fill="none">
        <line x1="0" y1={midY} x2="12" y2={midY} stroke="#d1d5db" strokeWidth="1.5" />
        <line x1="12" y1="33" x2="12" y2={colH - 33} stroke="#d1d5db" strokeWidth="1.5" />
        <line x1="12" y1="33" x2="24" y2="33" stroke="#d1d5db" strokeWidth="1.5" />
        <line x1="12" y1={colH - 33} x2="24" y2={colH - 33} stroke="#d1d5db" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

function DeadlineModal({ round, onClose }: { round: RoundMeta; onClose: () => void }) {
  const [date, setDate] = useState(round.deadline.split(" ").reverse().join("-"));
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl p-5 w-72" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-bold text-gray-900 mb-1">Edit Round Deadline</h3>
        <p className="text-xs text-gray-500 mb-4">{round.label}</p>
        <label className="text-xs font-medium text-gray-700 mb-1.5 block">Deadline date</label>
        <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs mb-4 focus:outline-none focus:border-green-400" defaultValue="2025-04-30" />
        <p className="text-[11px] text-gray-400 mb-4">Players must complete their match and have a tee time booked before this date.</p>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 text-xs border border-gray-200 rounded-lg text-gray-500">Cancel</button>
          <button onClick={onClose} className="flex-1 py-2 text-xs font-semibold text-white rounded-lg" style={{ background: GREEN }}>Save Deadline</button>
        </div>
      </div>
    </div>
  );
}

function ChampionBox() {
  return (
    <div className="flex flex-col items-start" style={{ paddingTop: 52 }}>
      <div className="rounded-xl border-2 flex flex-col items-center justify-center p-4" style={{ borderColor: GOLD, background: `${GOLD}11`, minWidth: 110 }}>
        <div className="text-2xl mb-1">🏆</div>
        <div className="text-[10px] font-bold text-center" style={{ color: GOLD }}>Champion</div>
      </div>
    </div>
  );
}

export function BracketView() {
  const [editingRound, setEditingRound] = useState<number | null>(null);

  const notBooked = R1.filter(m => m.teeStatus === "not_booked").length;
  const urgent = ROUNDS[0].daysLeft !== null && ROUNDS[0].daysLeft <= 7;

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      {editingRound !== null && (
        <DeadlineModal round={ROUNDS[editingRound]} onClose={() => setEditingRound(null)} />
      )}

      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: GREEN }}>
            <span className="text-white text-sm">🏆</span>
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-gray-900 truncate">Club Championship 2025 — Knockout</h1>
            <p className="text-[11px] text-gray-500">Individual · 16 players · Seeded draw · 18 holes</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-gray-200 text-gray-600">📢 Notify All</button>
          <button className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white" style={{ background: GREEN }}>Enter Score</button>
        </div>
      </div>

      {/* Alert banner */}
      {notBooked > 0 && (
        <div className="mx-4 mt-3 rounded-lg px-3 py-2 flex items-center gap-2" style={{ background: "#fef9c3", border: "1px solid #fde68a" }}>
          <span className="text-sm">⚠️</span>
          <span className="text-[11px] text-amber-800 font-medium">
            {notBooked} match{notBooked > 1 ? "es" : ""} in Round of 16 {notBooked > 1 ? "have" : "has"} no tee time booked — deadline in {ROUNDS[0].daysLeft} days.
          </span>
          <button className="ml-auto text-[10px] font-bold text-amber-700 underline">Chase players</button>
        </div>
      )}

      {/* Legend */}
      <div className="px-4 pt-2 pb-1 flex items-center gap-3 flex-wrap">
        <span className="text-[10px] text-gray-400 font-medium">Key:</span>
        {[
          { color: "#16a34a", label: "Complete" },
          { color: GOLD,      label: "In Progress" },
          { color: "#d1d5db", label: "Pending" },
        ].map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1 text-[10px] text-gray-500">
            <span className="w-2 h-2 rounded-full" style={{ background: color }} />{label}
          </span>
        ))}
        <span className="flex items-center gap-1 text-[10px] text-gray-500">
          <span className="text-[9px] font-semibold px-1 py-0.5 rounded-full" style={{ background: "#dcfce7", color: "#16a34a" }}>📅 14 Apr</span>Tee booked
        </span>
        <span className="flex items-center gap-1 text-[10px] text-gray-500">
          <span className="text-[9px] font-semibold px-1 py-0.5 rounded-full" style={{ background: "#fef9c3", color: "#ca8a04" }}>⚠ Not booked</span>Self-booking needed
        </span>
      </div>

      {/* Bracket */}
      <div className="overflow-x-auto px-4 pb-16 pt-2">
        <div className="flex items-start gap-0" style={{ minWidth: 860 }}>
          {ROUNDS.map((round, ri) => (
            <div key={round.label} className="flex items-start">
              <div className="flex flex-col">
                <RoundHeader round={round} onEdit={() => setEditingRound(ri)} />
                <div className="flex flex-col" style={{ gap: 12 }}>
                  {round.matches.map(m => <MatchCard key={m.id} match={m} />)}
                </div>
              </div>
              {ri < ROUNDS.length - 1 && <Connector matchCount={round.matches.length} />}
            </div>
          ))}
          <ChampionBox />
        </div>
      </div>

      {/* Round deadline summary bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2 flex items-center gap-4 overflow-x-auto">
        <span className="text-[10px] font-semibold text-gray-500 flex-shrink-0">Deadlines:</span>
        {ROUNDS.map((r) => {
          const urg = r.daysLeft !== null && r.daysLeft <= 7;
          return (
            <div key={r.label} className="flex items-center gap-1.5 flex-shrink-0">
              <span className="text-[10px] font-medium text-gray-600">{r.label}</span>
              <span className="text-[10px]" style={{ color: urg ? RED : "#6b7280" }}>{r.deadline}</span>
              {r.daysLeft !== null && (
                <span className="text-[9px] font-bold px-1 rounded" style={{ background: urg ? "#fee2e2" : "#f3f4f6", color: urg ? RED : "#9ca3af" }}>
                  {r.daysLeft}d
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
