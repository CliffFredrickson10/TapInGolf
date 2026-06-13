import { useState } from "react";

const GREEN = "#1a5c38";
const GOLD = "#c8a84b";

const FORMAT_OPTIONS = [
  { key: "gross_stroke_play", label: "Stroke Play (Gross)", icon: "🏌️", desc: "Total strokes, lowest wins" },
  { key: "net_stroke_play", label: "Stroke Play (Net)", icon: "📊", desc: "Adjusted for handicap" },
  { key: "individual_stableford", label: "Stableford", icon: "⭐", desc: "Points per hole" },
  { key: "betterball", label: "Betterball (4-Ball)", icon: "👥", desc: "Best ball of pair counts" },
  { key: "scramble", label: "Scramble", icon: "🔄", desc: "Team selects best shot" },
  { key: "knockout", label: "Knockout", icon: "🏆", desc: "Single-elimination match play", isNew: true },
];

const BRACKET_SIZES = [8, 16, 32, 64];

const STEPS = ["Details", "Format", "Pricing", "Tee Sheet", "Publish"];

function StepBar({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 mb-6">
      {STEPS.map((s, i) => (
        <div key={s} className="flex items-center">
          <div className="flex flex-col items-center">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
              style={{
                background: i < current ? GREEN : i === current ? GOLD : "#e5e7eb",
                color: i <= current ? "#fff" : "#9ca3af",
              }}
            >
              {i < current ? "✓" : i + 1}
            </div>
            <span className="text-[10px] mt-1 font-medium" style={{ color: i === current ? GREEN : "#9ca3af" }}>{s}</span>
          </div>
          {i < STEPS.length - 1 && (
            <div className="w-10 h-px mb-4 mx-1" style={{ background: i < current ? GREEN : "#e5e7eb" }} />
          )}
        </div>
      ))}
    </div>
  );
}

export function FormatSelection() {
  const [selected, setSelected] = useState("knockout");
  const [bracketSize, setBracketSize] = useState(16);
  const [holes, setHoles] = useState<9 | 18>(18);
  const [rounds, setRounds] = useState(1);

  const isKnockout = selected === "knockout";

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: GREEN }}>
            <span className="text-white text-lg">⛳</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">New Tournament</h1>
            <p className="text-xs text-gray-500">Royal Johannesburg & Kensington GC</p>
          </div>
        </div>

        <StepBar current={1} />

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-1">Format</h2>
          <p className="text-xs text-gray-500 mb-4">Choose the scoring format for this tournament</p>

          <div className="grid grid-cols-2 gap-2 mb-5">
            {FORMAT_OPTIONS.map((f) => {
              const active = selected === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => setSelected(f.key)}
                  className="relative text-left rounded-lg border-2 p-3 transition-all"
                  style={{
                    borderColor: active ? GREEN : "#e5e7eb",
                    background: active ? "#f0faf4" : "#fff",
                  }}
                >
                  {f.isNew && (
                    <span
                      className="absolute top-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ background: GOLD, color: "#fff" }}
                    >
                      NEW
                    </span>
                  )}
                  <div className="text-xl mb-1">{f.icon}</div>
                  <div className="text-xs font-semibold" style={{ color: active ? GREEN : "#374151" }}>{f.label}</div>
                  <div className="text-[11px] text-gray-400 mt-0.5">{f.desc}</div>
                  {active && (
                    <div className="absolute top-2 left-2 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: GREEN }}>
                      <span className="text-white text-[8px]">✓</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Knockout-specific config */}
          {isKnockout && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 mb-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm">🏆</span>
                <span className="text-sm font-semibold" style={{ color: GREEN }}>Knockout Configuration</span>
              </div>

              <div className="mb-3">
                <label className="text-xs font-medium text-gray-700 mb-1.5 block">Bracket Size</label>
                <div className="flex gap-2">
                  {BRACKET_SIZES.map((sz) => (
                    <button
                      key={sz}
                      onClick={() => setBracketSize(sz)}
                      className="flex-1 py-1.5 rounded-md border text-xs font-semibold transition-all"
                      style={{
                        borderColor: bracketSize === sz ? GREEN : "#d1d5db",
                        background: bracketSize === sz ? GREEN : "#fff",
                        color: bracketSize === sz ? "#fff" : "#374151",
                      }}
                    >
                      {sz}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-gray-400 mt-1">Players needed for a full bracket. Byes are auto-assigned to top seeds.</p>
              </div>

              <div className="mb-3">
                <label className="text-xs font-medium text-gray-700 mb-1.5 block">Holes per Match</label>
                <div className="flex gap-2">
                  {([9, 18] as const).map((h) => (
                    <button
                      key={h}
                      onClick={() => setHoles(h)}
                      className="flex-1 py-1.5 rounded-md border text-xs font-semibold transition-all"
                      style={{
                        borderColor: holes === h ? GREEN : "#d1d5db",
                        background: holes === h ? GREEN : "#fff",
                        color: holes === h ? "#fff" : "#374151",
                      }}
                    >
                      {h} holes
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 mt-3">
                <div className="bg-white rounded-md p-2 text-center border border-green-200">
                  <div className="text-lg font-bold" style={{ color: GREEN }}>{bracketSize}</div>
                  <div className="text-[10px] text-gray-500">Players</div>
                </div>
                <div className="bg-white rounded-md p-2 text-center border border-green-200">
                  <div className="text-lg font-bold" style={{ color: GREEN }}>{Math.log2(bracketSize)}</div>
                  <div className="text-[10px] text-gray-500">Rounds</div>
                </div>
                <div className="bg-white rounded-md p-2 text-center border border-green-200">
                  <div className="text-lg font-bold" style={{ color: GREEN }}>{bracketSize - 1}</div>
                  <div className="text-[10px] text-gray-500">Matches</div>
                </div>
              </div>
            </div>
          )}

          {/* Standard format options (non-knockout) */}
          {!isKnockout && (
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1.5 block">Holes</label>
                <div className="flex gap-2">
                  {([9, 18] as const).map((h) => (
                    <button key={h} onClick={() => setHoles(h)}
                      className="flex-1 py-1.5 rounded-md border text-xs font-semibold"
                      style={{ borderColor: holes === h ? GREEN : "#d1d5db", background: holes === h ? GREEN : "#fff", color: holes === h ? "#fff" : "#374151" }}>
                      {h}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1.5 block">Rounds</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4].map((r) => (
                    <button key={r} onClick={() => setRounds(r)}
                      className="flex-1 py-1.5 rounded-md border text-xs font-semibold"
                      style={{ borderColor: rounds === r ? GREEN : "#d1d5db", background: rounds === r ? GREEN : "#fff", color: rounds === r ? "#fff" : "#374151" }}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-between mt-4">
            <button className="px-4 py-2 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">← Back</button>
            <button className="px-5 py-2 text-xs font-semibold rounded-lg text-white" style={{ background: GREEN }}>
              Next: Pricing →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
