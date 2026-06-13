import { useState } from "react";

const GREEN = "#1a5c38";
const GOLD = "#c8a84b";

type MatchStatus = "pending" | "live" | "complete" | "bye";

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
  isBye?: boolean;
}

const PLAYERS: Player[] = [
  { id: 1,  name: "T. Vorster",   handicap: 3,  seed: 1  },
  { id: 2,  name: "M. de Villiers", handicap: 4, seed: 2 },
  { id: 3,  name: "R. Swart",     handicap: 5,  seed: 3  },
  { id: 4,  name: "J. Pretorius", handicap: 6,  seed: 4  },
  { id: 5,  name: "C. Bosman",    handicap: 7,  seed: 5  },
  { id: 6,  name: "A. Kruger",    handicap: 9,  seed: 6  },
  { id: 7,  name: "D. Nkosi",     handicap: 10, seed: 7  },
  { id: 8,  name: "P. Joubert",   handicap: 11, seed: 8  },
  { id: 9,  name: "L. Meyer",     handicap: 12, seed: 9  },
  { id: 10, name: "K. du Plessis",handicap: 13, seed: 10 },
  { id: 11, name: "B. Steyn",     handicap: 14, seed: 11 },
  { id: 12, name: "H. Mthembu",   handicap: 15, seed: 12 },
  { id: 13, name: "G. van der Berg",handicap: 16,seed: 13 },
  { id: 14, name: "F. Barnard",   handicap: 17, seed: 14 },
  { id: 15, name: "E. Wessels",   handicap: 18, seed: 15 },
  { id: 16, name: "I. Dlamini",   handicap: 20, seed: 16 },
];

// Standard 16-player seeding: 1v16, 8v9, 5v12, 4v13, 3v14, 6v11, 7v10, 2v15
const R1_SEEDS = [[1,16],[8,9],[5,12],[4,13],[3,14],[6,11],[7,10],[2,15]];

const getPlayer = (seed: number) => PLAYERS.find(p => p.seed === seed)!;

const R1_MATCHES: Match[] = R1_SEEDS.map(([s1, s2], i) => ({
  id: i + 1,
  roundIndex: 0,
  matchInRound: i,
  player1: getPlayer(s1),
  player2: getPlayer(s2),
  score: i === 0 ? "3 & 2" : i === 1 ? "2 Up" : undefined,
  winnerId: i === 0 ? 1 : i === 1 ? getPlayer(8).id : undefined,
  status: i < 2 ? "complete" : i === 2 ? "live" : "pending",
}));

const QF_MATCHES: Match[] = [
  { id: 9,  roundIndex: 1, matchInRound: 0, player1: PLAYERS[0], player2: PLAYERS[7], score: undefined, winnerId: undefined, status: "pending" },
  { id: 10, roundIndex: 1, matchInRound: 1, player1: PLAYERS[4], player2: PLAYERS[3], status: "pending" },
  { id: 11, roundIndex: 1, matchInRound: 2, status: "pending" },
  { id: 12, roundIndex: 1, matchInRound: 3, status: "pending" },
];

const SF_MATCHES: Match[] = [
  { id: 13, roundIndex: 2, matchInRound: 0, status: "pending" },
  { id: 14, roundIndex: 2, matchInRound: 1, status: "pending" },
];

const FINAL: Match[] = [
  { id: 15, roundIndex: 3, matchInRound: 0, status: "pending" },
];

const ROUNDS = [
  { label: "Round of 16", matches: R1_MATCHES },
  { label: "Quarter-Finals", matches: QF_MATCHES },
  { label: "Semi-Finals", matches: SF_MATCHES },
  { label: "Final", matches: FINAL },
];

function StatusDot({ status }: { status: MatchStatus }) {
  const colors: Record<MatchStatus, string> = {
    complete: "#16a34a",
    live: GOLD,
    pending: "#d1d5db",
    bye: "#9ca3af",
  };
  return <span className="w-2 h-2 rounded-full inline-block flex-shrink-0" style={{ background: colors[status] }} />;
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
    <div
      className="flex items-center justify-between px-2 py-1.5 rounded"
      style={{ background: isWinner ? "#f0faf4" : "#fff" }}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <div
          className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold flex-shrink-0"
          style={{ background: isWinner ? GREEN : "#e5e7eb", color: isWinner ? "#fff" : "#6b7280" }}
        >
          {player.seed}
        </div>
        <span className="text-[11px] truncate font-medium" style={{ color: isWinner ? GREEN : "#374151" }}>{player.name}</span>
      </div>
      <span className="text-[10px] text-gray-400 ml-1 flex-shrink-0">+{player.handicap}</span>
    </div>
  );
}

function MatchCard({ match, roundLabel }: { match: Match; roundLabel: string }) {
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
        minWidth: 148,
        maxWidth: 160,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="flex items-center gap-1 px-2 py-1 border-b" style={{ borderColor: isLive ? `${GOLD}44` : "#f3f4f6", background: isLive ? `${GOLD}11` : "#f9fafb" }}>
        <StatusDot status={match.status} />
        <span className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: isLive ? GOLD : isComplete ? GREEN : "#9ca3af" }}>
          {isLive ? "In Progress" : isComplete ? "Complete" : "Pending"}
        </span>
        {match.score && <span className="ml-auto text-[9px] font-bold" style={{ color: GREEN }}>{match.score}</span>}
      </div>
      <div className="p-1.5 flex flex-col gap-1">
        <PlayerSlot player={match.player1} isWinner={isComplete && match.winnerId === match.player1?.id} isEmpty={!match.player1} />
        <div className="text-[9px] text-center text-gray-300 font-medium">vs</div>
        <PlayerSlot player={match.player2} isWinner={isComplete && match.winnerId === match.player2?.id} isEmpty={!match.player2} />
      </div>
    </div>
  );
}

function Connector({ count }: { count: number }) {
  const height = count * 66 + (count - 1) * 12;
  return (
    <div className="flex items-center" style={{ width: 24 }}>
      <svg width="24" height={height} viewBox={`0 0 24 ${height}`} fill="none">
        <path
          d={`M0,${height / 4} L12,${height / 4} L12,${(3 * height) / 4} L24,${(3 * height) / 4}`}
          stroke="#d1d5db" strokeWidth="1.5" fill="none"
        />
        {count > 1 && (
          <path d={`M0,${(3 * height) / 4} L12,${(3 * height) / 4} L12,${height / 4} L24,${height / 4}`} stroke="#d1d5db" strokeWidth="1.5" fill="none" />
        )}
      </svg>
    </div>
  );
}

function RoundColumn({ label, matches, showConnector, nextMatchCount }: { label: string; matches: Match[]; showConnector?: boolean; nextMatchCount?: number }) {
  const pairs: Match[][] = [];
  for (let i = 0; i < matches.length; i += 2) {
    pairs.push(matches.slice(i, i + 2));
  }

  return (
    <div className="flex flex-col items-start">
      <div className="text-[11px] font-bold mb-3 px-1 whitespace-nowrap" style={{ color: GREEN }}>{label}</div>
      <div className="flex gap-0">
        <div className="flex flex-col" style={{ gap: matches.length > 1 ? 12 : 0 }}>
          {matches.map((m) => (
            <MatchCard key={m.id} match={m} roundLabel={label} />
          ))}
        </div>
        {showConnector && (
          <div className="flex flex-col justify-around" style={{ gap: 12 }}>
            {pairs.map((pair, i) => (
              <Connector key={i} count={pair.length} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ChampionBox() {
  return (
    <div className="flex flex-col items-start">
      <div className="text-[11px] font-bold mb-3 px-1" style={{ color: GOLD }}>🏆 Champion</div>
      <div className="rounded-xl border-2 flex flex-col items-center justify-center p-4" style={{ borderColor: GOLD, background: `${GOLD}11`, minWidth: 120, minHeight: 80 }}>
        <div className="text-2xl mb-1">🏆</div>
        <div className="text-[11px] font-bold text-center" style={{ color: GOLD }}>To Be Determined</div>
      </div>
    </div>
  );
}

export function BracketView() {
  const [activeRound, setActiveRound] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: GREEN }}>
            <span className="text-white text-sm">🏆</span>
          </div>
          <div>
            <h1 className="text-sm font-bold text-gray-900">Club Championship 2025</h1>
            <p className="text-[11px] text-gray-500">Knockout · 16-player bracket · 18 holes per match</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: "#16a34a" }} /> Complete
            <span className="w-2 h-2 rounded-full inline-block ml-2" style={{ background: GOLD }} /> In Progress
            <span className="w-2 h-2 rounded-full inline-block ml-2 bg-gray-200" /> Pending
          </div>
          <button className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white" style={{ background: GREEN }}>Enter Score</button>
        </div>
      </div>

      {/* Bracket scroll area */}
      <div className="overflow-x-auto p-5">
        <div className="flex items-start gap-0" style={{ minWidth: 900 }}>
          {ROUNDS.map((round, i) => (
            <RoundColumn
              key={round.label}
              label={round.label}
              matches={round.matches}
              showConnector={i < ROUNDS.length - 1}
              nextMatchCount={ROUNDS[i + 1]?.matches.length}
            />
          ))}
          <ChampionBox />
        </div>
      </div>

      {/* Round summary bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-5 py-2.5 flex items-center gap-4">
        {ROUNDS.map((round, i) => {
          const done = round.matches.filter(m => m.status === "complete").length;
          const total = round.matches.length;
          const pct = Math.round((done / total) * 100);
          return (
            <div key={round.label} className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-gray-600">{round.label}</span>
              <div className="w-20 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct === 100 ? GREEN : GOLD }} />
              </div>
              <span className="text-[11px] text-gray-400">{done}/{total}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
