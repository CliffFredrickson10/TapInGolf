import { useState } from "react";

const GREEN = "#1a5c38";
const GOLD = "#c8a84b";

const RESULT_PRESETS = [
  { label: "1 Up",   value: "1 Up" },
  { label: "2 & 1",  value: "2 & 1" },
  { label: "3 & 2",  value: "3 & 2" },
  { label: "4 & 3",  value: "4 & 3" },
  { label: "5 & 4",  value: "5 & 4" },
  { label: "19th",   value: "Won on 19th" },
  { label: "2 Up",   value: "2 Up" },
  { label: "3 Up",   value: "3 Up" },
];

const HOLES = 18;
const HOLE_OUTCOMES: Array<"won" | "lost" | "halved" | null> = [
  "won", "halved", "won", "lost", "halved", "won", "won",
  "lost", "halved", null, null, null, null, null, null, null, null, null
];

function HoleGrid({ outcomes }: { outcomes: Array<"won" | "lost" | "halved" | null> }) {
  const colors: Record<string, string> = {
    won:    "#dcfce7",
    lost:   "#fee2e2",
    halved: "#fef9c3",
  };
  const textColors: Record<string, string> = {
    won:    "#16a34a",
    lost:   "#dc2626",
    halved: "#ca8a04",
  };
  const labels: Record<string, string> = {
    won: "W", lost: "L", halved: "H"
  };

  return (
    <div className="grid grid-cols-9 gap-1">
      {outcomes.map((o, i) => (
        <div
          key={i}
          className="rounded flex flex-col items-center py-1"
          style={{ background: o ? colors[o] : "#f3f4f6", minWidth: 0 }}
        >
          <span className="text-[9px] text-gray-400">{i + 1}</span>
          <span className="text-[11px] font-bold" style={{ color: o ? textColors[o] : "#d1d5db" }}>
            {o ? labels[o] : "·"}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ScoreEntry() {
  const [winner, setWinner] = useState<"p1" | "p2" | null>("p1");
  const [result, setResult] = useState("3 & 2");
  const [custom, setCustom] = useState("");
  const [tab, setTab] = useState<"quick" | "hole">("quick");
  const [confirmed, setConfirmed] = useState(false);

  const p1 = { name: "T. Vorster", seed: 1, handicap: 3 };
  const p2 = { name: "I. Dlamini", seed: 16, handicap: 20 };

  const standing = () => {
    const won = HOLE_OUTCOMES.filter(h => h === "won").length;
    const lost = HOLE_OUTCOMES.filter(h => h === "lost").length;
    const diff = won - lost;
    if (diff > 0) return { label: `${diff} Up`, color: GREEN };
    if (diff < 0) return { label: `${Math.abs(diff)} Down`, color: "#dc2626" };
    return { label: "All Square", color: "#ca8a04" };
  };

  if (confirmed) {
    return (
      <div className="min-h-screen bg-gray-50 font-sans flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 text-center max-w-xs w-full">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "#f0faf4" }}>
            <span className="text-3xl">✅</span>
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-1">Result Recorded</h2>
          <p className="text-sm text-gray-500 mb-4">Match result has been saved and the bracket has been updated.</p>
          <div className="rounded-xl border border-green-200 bg-green-50 p-4 mb-4">
            <div className="text-sm font-bold mb-0.5" style={{ color: GREEN }}>🏆 {p1.name}</div>
            <div className="text-xs text-gray-500">Won {result} — advances to Quarter-Finals</div>
          </div>
          <button
            className="w-full py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: GREEN }}
            onClick={() => setConfirmed(false)}
          >
            Back to Bracket
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans p-5">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="flex items-center gap-2 mb-4">
          <button className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 text-sm">←</button>
          <div>
            <h1 className="text-sm font-bold text-gray-900">Enter Match Result</h1>
            <p className="text-[11px] text-gray-500">Round of 16 · Match 1 · 18 holes</p>
          </div>
        </div>

        {/* Players */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-3">
          <div className="flex items-center gap-3">
            <button
              className="flex-1 rounded-lg border-2 p-3 text-center transition-all"
              style={{ borderColor: winner === "p1" ? GREEN : "#e5e7eb", background: winner === "p1" ? "#f0faf4" : "#fff" }}
              onClick={() => setWinner("p1")}
            >
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold mx-auto mb-1.5" style={{ background: winner === "p1" ? GREEN : "#e5e7eb", color: winner === "p1" ? "#fff" : "#6b7280" }}>
                {p1.seed}
              </div>
              <div className="text-xs font-semibold" style={{ color: winner === "p1" ? GREEN : "#374151" }}>{p1.name}</div>
              <div className="text-[10px] text-gray-400">Hcp {p1.handicap}</div>
              {winner === "p1" && <div className="text-[10px] font-bold mt-1" style={{ color: GREEN }}>🏆 Winner</div>}
            </button>

            <div className="text-sm font-bold text-gray-300">vs</div>

            <button
              className="flex-1 rounded-lg border-2 p-3 text-center transition-all"
              style={{ borderColor: winner === "p2" ? GREEN : "#e5e7eb", background: winner === "p2" ? "#f0faf4" : "#fff" }}
              onClick={() => setWinner("p2")}
            >
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold mx-auto mb-1.5" style={{ background: winner === "p2" ? GREEN : "#e5e7eb", color: winner === "p2" ? "#fff" : "#6b7280" }}>
                {p2.seed}
              </div>
              <div className="text-xs font-semibold" style={{ color: winner === "p2" ? GREEN : "#374151" }}>{p2.name}</div>
              <div className="text-[10px] text-gray-400">Hcp {p2.handicap}</div>
              {winner === "p2" && <div className="text-[10px] font-bold mt-1" style={{ color: GREEN }}>🏆 Winner</div>}
            </button>
          </div>
        </div>

        {/* Score entry tabs */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-3">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden mb-3">
            {(["quick", "hole"] as const).map((t) => (
              <button
                key={t}
                className="flex-1 py-1.5 text-xs font-semibold transition-all"
                style={{ background: tab === t ? GREEN : "#fff", color: tab === t ? "#fff" : "#6b7280" }}
                onClick={() => setTab(t)}
              >
                {t === "quick" ? "Quick Result" : "Hole by Hole"}
              </button>
            ))}
          </div>

          {tab === "quick" ? (
            <>
              <label className="text-xs font-medium text-gray-700 mb-2 block">Result</label>
              <div className="grid grid-cols-4 gap-1.5 mb-3">
                {RESULT_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    className="py-1.5 rounded-lg border text-[11px] font-semibold transition-all"
                    style={{
                      borderColor: result === p.value ? GREEN : "#e5e7eb",
                      background: result === p.value ? "#f0faf4" : "#fff",
                      color: result === p.value ? GREEN : "#374151",
                    }}
                    onClick={() => { setResult(p.value); setCustom(""); }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-xs placeholder:text-gray-400 focus:outline-none"
                  style={{ borderColor: custom ? GREEN : undefined }}
                  placeholder='Custom, e.g. "Conceded on 15th"'
                  value={custom}
                  onChange={(e) => { setCustom(e.target.value); if (e.target.value) setResult(e.target.value); }}
                />
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-700">Hole outcomes for {p1.name}</span>
                <span className="text-xs font-bold" style={{ color: standing().color }}>{standing().label}</span>
              </div>
              <HoleGrid outcomes={HOLE_OUTCOMES} />
              <div className="flex gap-3 mt-2 text-[10px] text-gray-500">
                <span>
                  <span className="inline-block w-2 h-2 rounded-sm bg-green-100 mr-1" />W = Hole Won
                </span>
                <span>
                  <span className="inline-block w-2 h-2 rounded-sm bg-red-100 mr-1" />L = Hole Lost
                </span>
                <span>
                  <span className="inline-block w-2 h-2 rounded-sm bg-yellow-100 mr-1" />H = Halved
                </span>
              </div>
            </>
          )}
        </div>

        {/* Result preview */}
        {winner && (
          <div className="rounded-xl border border-green-200 bg-green-50 p-3 mb-4">
            <div className="text-xs font-medium text-gray-600 mb-0.5">Result preview</div>
            <div className="text-sm font-bold" style={{ color: GREEN }}>
              🏆 {winner === "p1" ? p1.name : p2.name} wins {result}
            </div>
            <div className="text-[11px] text-gray-500 mt-0.5">
              {winner === "p1" ? p1.name : p2.name} advances to the Quarter-Finals
            </div>
          </div>
        )}

        <button
          className="w-full py-2.5 rounded-xl text-sm font-bold text-white transition-opacity"
          style={{ background: GREEN, opacity: winner ? 1 : 0.4 }}
          disabled={!winner}
          onClick={() => setConfirmed(true)}
        >
          Confirm Result & Advance Bracket
        </button>
      </div>
    </div>
  );
}
