import { useState } from "react";

const GREEN = "#1a5c38";
const GOLD = "#c8a84b";

const FORMAT_OPTIONS = [
  { key: "gross_stroke_play",      label: "Stroke Play (Gross)",  icon: "🏌️", desc: "Total strokes, lowest wins" },
  { key: "net_stroke_play",        label: "Stroke Play (Net)",    icon: "📊", desc: "Adjusted for handicap" },
  { key: "individual_stableford",  label: "Stableford",           icon: "⭐", desc: "Points per hole" },
  { key: "betterball",             label: "Betterball (4-Ball)",  icon: "👥", desc: "Best ball of pair counts" },
  { key: "scramble",               label: "Scramble",             icon: "🔄", desc: "Team selects best shot" },
  { key: "knockout",               label: "Knockout",             icon: "🏆", desc: "Single-elimination match play", isNew: true },
];

const STEPS = ["Details", "Format", "Pricing", "Tee Sheet", "Publish"];

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

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
  const [knockoutType, setKnockoutType] = useState<"individual" | "team">("individual");
  const [drawMethod, setDrawMethod] = useState<"seeded" | "random">("seeded");

  const REGISTERED_MEMBERS = 47;
  const bracketSize = nextPow2(REGISTERED_MEMBERS);
  const byes = bracketSize - REGISTERED_MEMBERS;
  const rounds = Math.log2(bracketSize);
  const totalMatches = bracketSize - 1;

  const isKnockout = selected === "knockout";

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans">
      <div className="max-w-2xl mx-auto">
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
                  style={{ borderColor: active ? GREEN : "#e5e7eb", background: active ? "#f0faf4" : "#fff" }}
                >
                  {f.isNew && (
                    <span className="absolute top-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: GOLD, color: "#fff" }}>NEW</span>
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

          {isKnockout && (
            <div className="rounded-xl border border-green-200 bg-green-50 p-4 mb-5 space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-sm">🏆</span>
                <span className="text-sm font-semibold" style={{ color: GREEN }}>Knockout Configuration</span>
              </div>

              {/* Tournament type */}
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1.5 block">Tournament Type</label>
                <div className="flex gap-2">
                  {([
                    { key: "individual", label: "Individual", icon: "🏌️", desc: "Player vs player, match play" },
                    { key: "team",       label: "Team",       icon: "👥", desc: "Pair vs pair, best ball" },
                  ] as const).map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setKnockoutType(t.key)}
                      className="flex-1 rounded-lg border-2 p-3 text-left transition-all"
                      style={{ borderColor: knockoutType === t.key ? GREEN : "#d1d5db", background: knockoutType === t.key ? "#fff" : "#f9fafb" }}
                    >
                      <div className="text-lg mb-1">{t.icon}</div>
                      <div className="text-xs font-semibold" style={{ color: knockoutType === t.key ? GREEN : "#374151" }}>{t.label}</div>
                      <div className="text-[10px] text-gray-400">{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Draw Method */}
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1.5 block">Draw Method</label>
                <div className="flex gap-2">
                  {([
                    { key: "seeded", label: "Seeded Draw",  icon: "📊", desc: "Ranked by handicap index — best vs worst" },
                    { key: "random", label: "Random Draw",  icon: "🎲", desc: "Opponents assigned randomly" },
                  ] as const).map((d) => (
                    <button
                      key={d.key}
                      onClick={() => setDrawMethod(d.key)}
                      className="flex-1 rounded-lg border-2 p-3 text-left transition-all"
                      style={{ borderColor: drawMethod === d.key ? GREEN : "#d1d5db", background: drawMethod === d.key ? "#fff" : "#f9fafb" }}
                    >
                      <div className="text-lg mb-1">{d.icon}</div>
                      <div className="text-xs font-semibold" style={{ color: drawMethod === d.key ? GREEN : "#374151" }}>{d.label}</div>
                      <div className="text-[10px] text-gray-400">{d.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Fixed: 18 holes */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-green-200 bg-white">
                <span className="text-sm">⛳</span>
                <div>
                  <div className="text-xs font-semibold text-gray-800">18 Holes per Match</div>
                  <div className="text-[10px] text-gray-400">All knockout matches are played over 18 holes. Sudden death on the 18th if tied.</div>
                </div>
                <div className="ml-auto">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#e8f5ee", color: GREEN }}>Fixed</span>
                </div>
              </div>

              {/* Self-booking note */}
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-blue-100 bg-blue-50">
                <span className="text-sm mt-0.5">📅</span>
                <div className="text-[11px] text-blue-800">
                  <span className="font-semibold">Players book their own tee times. </span>
                  Once the draw is published, each player or team is notified of their opponent and books a tee time at the club to complete the match before the round deadline.
                </div>
              </div>

              {/* Auto bracket preview */}
              <div className="rounded-lg border border-green-200 bg-white p-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <div className="text-xs font-semibold text-gray-800">Bracket Size — Auto Calculated</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      Calculated from registered {knockoutType === "individual" ? "members" : "teams"} at time of publishing the draw.
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: "#e8f5ee", color: GREEN }}>Auto</span>
                </div>
                <div className="rounded-lg bg-green-50 border border-green-100 p-3">
                  <div className="text-[10px] text-gray-500 mb-2 font-medium">
                    Preview based on {REGISTERED_MEMBERS} registered {knockoutType === "individual" ? "members" : "teams"}:
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { label: "Bracket", value: `${bracketSize}` },
                      { label: "Byes",    value: byes > 0 ? String(byes) : "None" },
                      { label: "Rounds",  value: String(rounds) },
                      { label: "Matches", value: String(totalMatches) },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-white rounded-md p-2 text-center border border-green-100">
                        <div className="text-sm font-bold" style={{ color: GREEN }}>{value}</div>
                        <div className="text-[9px] text-gray-400 mt-0.5">{label}</div>
                      </div>
                    ))}
                  </div>
                  {byes > 0 && <p className="text-[10px] text-gray-400 mt-2">⚡ {byes} bye{byes > 1 ? "s" : ""} auto-assigned to top seeds in Round 1.</p>}
                </div>
              </div>

              {/* Annual draw + deadline note */}
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-amber-200 bg-amber-50">
                <span className="text-sm mt-0.5">📢</span>
                <div className="text-[11px] text-amber-800">
                  <span className="font-semibold">One draw per year. </span>
                  You'll set per-round deadlines and publish the draw in the final step. All players/teams are notified automatically when the draw goes live.
                </div>
              </div>
            </div>
          )}

          {!isKnockout && (
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1.5 block">Holes</label>
                <div className="flex gap-2">
                  {([9, 18] as const).map((h) => (
                    <button key={h} className="flex-1 py-1.5 rounded-md border text-xs font-semibold"
                      style={{ borderColor: h === 18 ? GREEN : "#d1d5db", background: h === 18 ? GREEN : "#fff", color: h === 18 ? "#fff" : "#374151" }}>
                      {h}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1.5 block">Rounds</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4].map((r) => (
                    <button key={r} className="flex-1 py-1.5 rounded-md border text-xs font-semibold"
                      style={{ borderColor: r === 1 ? GREEN : "#d1d5db", background: r === 1 ? GREEN : "#fff", color: r === 1 ? "#fff" : "#374151" }}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-between mt-4">
            <button className="px-4 py-2 text-xs text-gray-500 border border-gray-200 rounded-lg">← Back</button>
            <button className="px-5 py-2 text-xs font-semibold rounded-lg text-white" style={{ background: GREEN }}>
              Next: Pricing →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
