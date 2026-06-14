import { useState } from "react";

const GREEN = "#1a5c38";
const GOLD = "#c8a84b";
const RED = "#dc2626";

type MatchStatus = "pending" | "live" | "complete";
type TeeStatus = "booked" | "not_booked" | "tbd";
type NotifyStatus = "notified" | "pending";

interface Player { id: number; name: string; handicap: number; seed: number; }

interface Match {
  id: number;
  roundIndex: number;
  player1?: Player;
  player2?: Player;
  score?: string;
  winnerId?: number;
  status: MatchStatus;
  teeStatus?: TeeStatus;
  notifyStatus?: NotifyStatus;
  teeDate?: string;
}

const P = (id: number, name: string, handicap: number, seed: number): Player => ({ id, name, handicap, seed });
const ALL: Player[] = [
  P(1,"T. Vorster",3,1), P(2,"M. de Villiers",4,2), P(3,"R. Swart",5,3), P(4,"J. Pretorius",6,4),
  P(5,"C. Bosman",7,5), P(6,"A. Kruger",9,6), P(7,"D. Nkosi",10,7), P(8,"P. Joubert",11,8),
  P(9,"L. Meyer",12,9), P(10,"K. du Plessis",13,10), P(11,"B. Steyn",14,11), P(12,"H. Mthembu",15,12),
  P(13,"G. van der Berg",16,13), P(14,"F. Barnard",17,14), P(15,"E. Wessels",18,15), P(16,"I. Dlamini",20,16),
];
const g = (seed: number) => ALL.find(p => p.seed === seed)!;

const ROUNDS: { label: string; deadline: string; daysLeft: number; matches: Match[] }[] = [
  {
    label: "Round of 16", deadline: "30 Apr 2025", daysLeft: 2,
    matches: [
      { id: 1, roundIndex: 0, player1: g(1),  player2: g(16), score: "3 & 2", winnerId: 1,       status: "complete", teeStatus: "booked",     notifyStatus: "notified", teeDate: "12 Apr" },
      { id: 2, roundIndex: 0, player1: g(8),  player2: g(9),  score: "2 Up",  winnerId: g(8).id, status: "complete", teeStatus: "booked",     notifyStatus: "notified", teeDate: "13 Apr" },
      { id: 3, roundIndex: 0, player1: g(5),  player2: g(12),                                    status: "live",     teeStatus: "booked",     notifyStatus: "notified", teeDate: "14 Apr" },
      { id: 4, roundIndex: 0, player1: g(4),  player2: g(13),                                    status: "pending",  teeStatus: "booked",     notifyStatus: "notified", teeDate: "15 Apr" },
      { id: 5, roundIndex: 0, player1: g(3),  player2: g(14),                                    status: "pending",  teeStatus: "not_booked", notifyStatus: "notified" },
      { id: 6, roundIndex: 0, player1: g(6),  player2: g(11),                                    status: "pending",  teeStatus: "not_booked", notifyStatus: "notified" },
      { id: 7, roundIndex: 0, player1: g(7),  player2: g(10),                                    status: "pending",  teeStatus: "not_booked", notifyStatus: "notified" },
      { id: 8, roundIndex: 0, player1: g(2),  player2: g(15),                                    status: "pending",  teeStatus: "not_booked", notifyStatus: "notified" },
    ],
  },
  {
    label: "Quarter-Finals", deadline: "31 May 2025", daysLeft: 32,
    matches: [
      { id: 9,  roundIndex: 1, player1: g(1), player2: g(8), status: "pending", teeStatus: "tbd", notifyStatus: "pending" },
      { id: 10, roundIndex: 1,                               status: "pending", teeStatus: "tbd", notifyStatus: "pending" },
      { id: 11, roundIndex: 1,                               status: "pending", teeStatus: "tbd", notifyStatus: "pending" },
      { id: 12, roundIndex: 1,                               status: "pending", teeStatus: "tbd", notifyStatus: "pending" },
    ],
  },
  {
    label: "Semi-Finals", deadline: "30 Jun 2025", daysLeft: 62,
    matches: [
      { id: 13, roundIndex: 2, status: "pending", teeStatus: "tbd", notifyStatus: "pending" },
      { id: 14, roundIndex: 2, status: "pending", teeStatus: "tbd", notifyStatus: "pending" },
    ],
  },
  {
    label: "Final", deadline: "31 Jul 2025", daysLeft: 93,
    matches: [
      { id: 15, roundIndex: 3, status: "pending", teeStatus: "tbd", notifyStatus: "pending" },
    ],
  },
];

// "My match" — logged-in player is seed 1
const MY_SEED = 1;

function PlayerRow({ player, isWinner, isMe }: { player?: Player; isWinner?: boolean; isMe?: boolean }) {
  if (!player) {
    return (
      <div className="flex items-center gap-2 px-3 py-2" style={{ background: "#f9fafb" }}>
        <div className="w-6 h-6 rounded-full bg-gray-200" />
        <span className="text-xs text-gray-300 italic">TBD</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: isWinner ? "#f0faf4" : "#fff" }}>
      <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
        style={{ background: isWinner ? GREEN : isMe ? GOLD : "#e5e7eb", color: isWinner || isMe ? "#fff" : "#6b7280" }}>
        {player.seed}
      </div>
      <span className="text-xs font-medium flex-1 truncate" style={{ color: isWinner ? GREEN : "#374151" }}>
        {player.name}{isMe ? " (You)" : ""}
      </span>
      <span className="text-[10px] text-gray-400">+{player.handicap}</span>
      {isWinner && <span className="text-[10px] font-bold ml-1" style={{ color: GREEN }}>✓</span>}
    </div>
  );
}

function MatchCard({ match, isMyMatch }: { match: Match; isMyMatch?: boolean }) {
  const [showBook, setShowBook] = useState(false);
  const isComplete = match.status === "complete";
  const isLive = match.status === "live";
  const needsBooking = isMyMatch && match.teeStatus === "not_booked";

  return (
    <div className="rounded-xl border overflow-hidden mb-2"
      style={{ borderColor: isMyMatch ? GOLD : isLive ? `${GOLD}88` : isComplete ? "#b7dfc8" : "#e5e7eb",
               boxShadow: isMyMatch ? `0 0 0 2px ${GOLD}44` : undefined }}>
      {/* Status bar */}
      <div className="flex items-center gap-1.5 px-3 py-1.5"
        style={{ background: isMyMatch ? `${GOLD}15` : isLive ? `${GOLD}11` : isComplete ? "#f0faf4" : "#f9fafb" }}>
        <span className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ background: isComplete ? "#16a34a" : isLive ? GOLD : "#d1d5db" }} />
        <span className="text-[10px] font-semibold uppercase tracking-wide"
          style={{ color: isComplete ? GREEN : isLive ? GOLD : "#9ca3af" }}>
          {isComplete ? "Complete" : isLive ? "In Progress" : "Pending"}
        </span>
        {match.score && <span className="ml-auto text-[10px] font-bold" style={{ color: GREEN }}>{match.score}</span>}
        {isMyMatch && <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: GOLD, color: "#fff" }}>Your Match</span>}
      </div>

      {/* Players */}
      <PlayerRow player={match.player1} isWinner={isComplete && match.winnerId === match.player1?.id} isMe={match.player1?.seed === MY_SEED} />
      <div className="text-[10px] text-center text-gray-200 font-bold py-0.5 border-y border-gray-100">vs</div>
      <PlayerRow player={match.player2} isWinner={isComplete && match.winnerId === match.player2?.id} isMe={match.player2?.seed === MY_SEED} />

      {/* Tee info / CTA */}
      {match.teeStatus === "booked" && match.teeDate && (
        <div className="flex items-center gap-1.5 px-3 py-2 border-t border-gray-100" style={{ background: "#f0faf4" }}>
          <span className="text-[10px]">📅</span>
          <span className="text-[10px] font-medium" style={{ color: GREEN }}>Tee time booked — {match.teeDate}</span>
        </div>
      )}
      {needsBooking && (
        <div className="px-3 py-2 border-t border-amber-100" style={{ background: "#fffbeb" }}>
          <p className="text-[10px] text-amber-700 mb-1.5">Book a tee time to complete this match before the round deadline.</p>
          <button onClick={() => setShowBook(true)}
            className="w-full py-1.5 rounded-lg text-[11px] font-bold text-white"
            style={{ background: GREEN }}>
            📅 Book Tee Time
          </button>
          {showBook && (
            <div className="mt-2 rounded-lg border border-green-200 bg-green-50 p-2 text-[10px] text-green-800">
              ✓ Opening tee sheet for Royal Johannesburg…
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RoundTab({ label, active, hasAlert, onClick }: { label: string; active: boolean; hasAlert?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="relative flex-shrink-0 px-3 py-2 rounded-lg text-[11px] font-semibold transition-all whitespace-nowrap"
      style={{ background: active ? GREEN : "#fff", color: active ? "#fff" : "#6b7280", border: `1.5px solid ${active ? GREEN : "#e5e7eb"}` }}>
      {label}
      {hasAlert && <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full flex items-center justify-center text-[7px] font-bold text-white" style={{ background: RED }}>!</span>}
    </button>
  );
}

export function BracketViewMobile() {
  const [activeRound, setActiveRound] = useState(0);
  const round = ROUNDS[activeRound];
  const urgent = round.daysLeft <= 7;
  const done = round.matches.filter(m => m.status === "complete").length;

  return (
    <div className="min-h-screen font-sans" style={{ background: "#f8f9fa", maxWidth: 390, margin: "0 auto" }}>
      {/* App header */}
      <div className="px-4 pt-5 pb-3" style={{ background: GREEN }}>
        <div className="flex items-center justify-between mb-1">
          <button className="text-white/70 text-sm">←</button>
          <span className="text-white/70 text-[11px] font-medium">Club Championship 2025</span>
          <button className="text-white/70 text-sm">⋯</button>
        </div>
        <h1 className="text-white text-lg font-bold leading-tight">Knockout Draw</h1>
        <p className="text-white/70 text-[11px] mt-0.5">Individual · 16 players · Seeded draw</p>

        {/* Round progress pills */}
        <div className="flex gap-1.5 mt-3 overflow-x-auto pb-1">
          {ROUNDS.map((r, i) => {
            const d = r.matches.filter(m => m.status === "complete").length;
            const tot = r.matches.length;
            const pct = Math.round((d / tot) * 100);
            return (
              <button key={r.label} onClick={() => setActiveRound(i)}
                className="flex-shrink-0 rounded-lg px-2.5 py-1.5 text-center"
                style={{ background: activeRound === i ? "#fff" : "rgba(255,255,255,0.15)", minWidth: 70 }}>
                <div className="text-[9px] font-semibold" style={{ color: activeRound === i ? GREEN : "rgba(255,255,255,0.85)" }}>{r.label}</div>
                <div className="text-[9px] mt-0.5" style={{ color: activeRound === i ? "#6b7280" : "rgba(255,255,255,0.6)" }}>{d}/{tot}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Round info bar */}
      <div className="px-4 py-2.5 flex items-center gap-2 border-b border-gray-200 bg-white">
        <div className="flex-1">
          <div className="text-xs font-bold text-gray-900">{round.label}</div>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-[10px]" style={{ color: urgent ? RED : "#6b7280" }}>⏰ Deadline: {round.deadline}</span>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: urgent ? "#fee2e2" : "#f3f4f6", color: urgent ? RED : "#9ca3af" }}>
              {round.daysLeft}d left
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs font-bold" style={{ color: GREEN }}>{done}/{round.matches.length}</div>
          <div className="text-[10px] text-gray-400">complete</div>
        </div>
      </div>

      {/* Alert */}
      {urgent && round.matches.some(m => m.teeStatus === "not_booked") && (
        <div className="mx-4 mt-3 rounded-xl px-3 py-2 flex items-start gap-2" style={{ background: "#fef9c3", border: "1px solid #fde68a" }}>
          <span className="text-sm mt-0.5">⚠️</span>
          <span className="text-[11px] text-amber-800">
            Some matches have no tee time booked — deadline in {round.daysLeft} days!
          </span>
        </div>
      )}

      {/* Match list */}
      <div className="px-4 pt-3 pb-24">
        {round.matches.map(m => {
          const isMyMatch = m.player1?.seed === MY_SEED || m.player2?.seed === MY_SEED;
          return <MatchCard key={m.id} match={m} isMyMatch={isMyMatch} />;
        })}
      </div>

      {/* Bottom nav */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] bg-white border-t border-gray-200 flex items-center justify-around px-2 py-2">
        {[
          { icon: "🏠", label: "Home" },
          { icon: "🔍", label: "Explore" },
          { icon: "📋", label: "Bookings" },
          { icon: "👥", label: "Friends" },
          { icon: "👤", label: "Profile" },
        ].map(({ icon, label }, i) => (
          <button key={label} className="flex flex-col items-center gap-0.5 px-3 py-1">
            <span className="text-lg">{icon}</span>
            <span className="text-[9px] font-medium" style={{ color: i === 2 ? GREEN : "#9ca3af" }}>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
