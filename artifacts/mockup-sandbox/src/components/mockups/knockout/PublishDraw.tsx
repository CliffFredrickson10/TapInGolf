import { useState } from "react";

const GREEN = "#1a5c38";
const GOLD = "#c8a84b";

const ROUNDS_INIT = [
  { label: "Round of 16",    date: "2025-04-30" },
  { label: "Quarter-Finals", date: "2025-05-31" },
  { label: "Semi-Finals",    date: "2025-06-30" },
  { label: "Final",          date: "2025-07-31" },
];

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`;
}

interface Seed {
  seed: number;
  name: string;
  handicap: number;
}

const SEEDS_SEEDED: Seed[] = [
  { seed: 1,  name: "T. Vorster",      handicap: 3  },
  { seed: 2,  name: "M. de Villiers",  handicap: 4  },
  { seed: 3,  name: "R. Swart",        handicap: 5  },
  { seed: 4,  name: "J. Pretorius",    handicap: 6  },
  { seed: 5,  name: "C. Bosman",       handicap: 7  },
  { seed: 6,  name: "A. Kruger",       handicap: 9  },
  { seed: 7,  name: "D. Nkosi",        handicap: 10 },
  { seed: 8,  name: "P. Joubert",      handicap: 11 },
];

const MATCH_PAIRS_SEEDED = [
  [1, 16], [8, 9], [5, 12], [4, 13], [3, 14], [6, 11], [7, 10], [2, 15],
];

const MATCH_PAIRS_RANDOM = [
  [3, 11], [7, 16], [1, 9], [5, 14], [2, 12], [8, 13], [4, 15], [6, 10],
];

const STEPS = ["Details","Format","Pricing","Tee Sheet","Publish"];

function StepBar({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 mb-6">
      {STEPS.map((s, i) => (
        <div key={s} className="flex items-center">
          <div className="flex flex-col items-center">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ background: i < current ? GREEN : i === current ? GOLD : "#e5e7eb", color: i <= current ? "#fff" : "#9ca3af" }}>
              {i < current ? "✓" : i + 1}
            </div>
            <span className="text-[10px] mt-1 font-medium" style={{ color: i === current ? GREEN : "#9ca3af" }}>{s}</span>
          </div>
          {i < STEPS.length - 1 && <div className="w-10 h-px mb-4 mx-1" style={{ background: i < current ? GREEN : "#e5e7eb" }} />}
        </div>
      ))}
    </div>
  );
}

export function PublishDraw() {
  const [drawMethod, setDrawMethod] = useState<"seeded" | "random">("seeded");
  const [rounds, setRounds] = useState(ROUNDS_INIT);
  const [published, setPublished] = useState(false);

  const pairs = drawMethod === "seeded" ? MATCH_PAIRS_SEEDED : MATCH_PAIRS_RANDOM;

  const updateDate = (i: number, date: string) => {
    setRounds(rs => rs.map((r, j) => j === i ? { ...r, date } : r));
  };

  if (published) {
    return (
      <div className="min-h-screen bg-gray-50 font-sans flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 text-center max-w-sm w-full">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "#f0faf4" }}>
            <span className="text-3xl">🏆</span>
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-1">Draw Published!</h2>
          <p className="text-sm text-gray-500 mb-5">
            All 16 players have been notified of their Round 1 opponent via push notification and email. Players can now book tee times to complete their matches.
          </p>
          <div className="space-y-2 text-left mb-5">
            {[
              { icon: "✉️", label: "16 notifications sent" },
              { icon: "📅", label: "4 round deadlines set" },
              { icon: "🏌️", label: "Players booking their own tee times" },
            ].map(({ icon, label }) => (
              <div key={label} className="flex items-center gap-2 text-xs text-gray-600">
                <span>{icon}</span><span>{label}</span>
              </div>
            ))}
          </div>
          <button onClick={() => setPublished(false)}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: GREEN }}>
            View Bracket →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-5 font-sans">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: GREEN }}>
            <span className="text-white text-lg">⛳</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Publish Knockout Draw</h1>
            <p className="text-xs text-gray-500">Royal Johannesburg & Kensington GC · 47 members · 64-player bracket</p>
          </div>
        </div>

        <StepBar current={4} />

        {/* Draw Method */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
          <h2 className="text-sm font-semibold text-gray-800 mb-1">Draw Method</h2>
          <p className="text-xs text-gray-500 mb-3">Choose how opponents are paired for Round 1</p>
          <div className="flex gap-3 mb-4">
            {([
              { key: "seeded", label: "Seeded Draw",  icon: "📊", desc: "Best vs worst by handicap index" },
              { key: "random", label: "Random Draw",  icon: "🎲", desc: "Opponents drawn randomly" },
            ] as const).map((d) => (
              <button key={d.key} onClick={() => setDrawMethod(d.key)}
                className="flex-1 rounded-lg border-2 p-3 text-left transition-all"
                style={{ borderColor: drawMethod === d.key ? GREEN : "#e5e7eb", background: drawMethod === d.key ? "#f0faf4" : "#fff" }}>
                <div className="text-xl mb-1">{d.icon}</div>
                <div className="text-xs font-semibold" style={{ color: drawMethod === d.key ? GREEN : "#374151" }}>{d.label}</div>
                <div className="text-[10px] text-gray-400">{d.desc}</div>
              </button>
            ))}
          </div>

          {/* Round 1 draw preview */}
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <div className="text-[11px] font-semibold text-gray-600 mb-2">Round 1 — Draw Preview</div>
            <div className="grid grid-cols-2 gap-1">
              {pairs.slice(0, 6).map(([s1, s2], i) => (
                <div key={i} className="flex items-center gap-1.5 bg-white rounded px-2 py-1.5 border border-gray-100">
                  <span className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold flex-shrink-0" style={{ background: "#e8f5ee", color: GREEN }}>{s1}</span>
                  <span className="text-[11px] text-gray-700 truncate flex-1">Seed {s1}</span>
                  <span className="text-[10px] text-gray-300 font-bold mx-0.5">vs</span>
                  <span className="text-[11px] text-gray-700 truncate flex-1 text-right">Seed {s2}</span>
                  <span className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold flex-shrink-0" style={{ background: "#f3f4f6", color: "#6b7280" }}>{s2}</span>
                </div>
              ))}
            </div>
            {pairs.length > 6 && (
              <p className="text-[10px] text-gray-400 mt-2 text-center">+{pairs.length - 6} more matches</p>
            )}
          </div>
        </div>

        {/* Round Deadlines */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
          <h2 className="text-sm font-semibold text-gray-800 mb-1">Round Deadlines</h2>
          <p className="text-xs text-gray-500 mb-3">Players must complete their match and book a tee time before each deadline</p>
          <div className="space-y-2">
            {rounds.map((r, i) => (
              <div key={r.label} className="flex items-center gap-3 p-2.5 rounded-lg border border-gray-100">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                  style={{ background: "#e8f5ee", color: GREEN }}>{i + 1}</div>
                <span className="text-xs font-medium text-gray-700 flex-1">{r.label}</span>
                <input
                  type="date"
                  value={r.date}
                  onChange={e => updateDate(i, e.target.value)}
                  className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-green-400"
                />
                <span className="text-[10px] text-gray-400 hidden sm:block">{formatDate(r.date)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Notification preview */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-1">Notifications on Publish</h2>
          <p className="text-xs text-gray-500 mb-3">Each player receives a push notification and email immediately when the draw goes live</p>
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: GREEN }}>
                <span className="text-white text-sm">⛳</span>
              </div>
              <div>
                <div className="text-xs font-bold text-gray-900 mb-0.5">TapIn Golf — Club Championship 2025</div>
                <div className="text-[11px] text-gray-600">
                  The knockout draw is live! Your Round of 16 opponent is{" "}
                  <span className="font-semibold text-gray-800">I. Dlamini (Hcp 20)</span>.
                  Book your tee time before <span className="font-semibold">{formatDate(rounds[0].date)}</span>.
                </div>
                <div className="mt-1.5 flex gap-1.5">
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded" style={{ background: GREEN, color: "#fff" }}>Book Tee Time</span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded border border-gray-200 text-gray-600">View Bracket</span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 mt-3">
            <div className="flex items-center gap-1.5 text-[11px] text-gray-600">
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs" style={{ background: "#e8f5ee" }}>✉</span>
              47 players notified
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-gray-600">
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs" style={{ background: "#eff6ff" }}>📱</span>
              Push + email
            </div>
          </div>
        </div>

        <div className="flex justify-between">
          <button className="px-4 py-2 text-xs text-gray-500 border border-gray-200 rounded-lg">← Back</button>
          <button
            onClick={() => setPublished(true)}
            className="px-6 py-2.5 text-sm font-bold text-white rounded-xl shadow-lg transition-all hover:opacity-90"
            style={{ background: GREEN }}>
            🏆 Publish Draw & Notify Players
          </button>
        </div>
      </div>
    </div>
  );
}
