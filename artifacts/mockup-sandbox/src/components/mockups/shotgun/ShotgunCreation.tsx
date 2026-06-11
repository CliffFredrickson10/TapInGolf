import { useState } from "react";

const GREEN = "#1a5c38";
const GOLD = "#c8a84b";

function Badge({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span style={{ background: color ?? "#f0faf4", color: color ? "#fff" : GREEN, border: `1px solid ${color ?? "#b7dfc8"}` }}
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium">
      {children}
    </span>
  );
}

function Label({ children, note }: { children: React.ReactNode; note?: string }) {
  return (
    <div className="flex items-center gap-1.5 mb-1.5">
      <label className="text-sm font-medium text-gray-700">{children}</label>
      {note && <span className="text-xs text-gray-400">{note}</span>}
    </div>
  );
}

function Toggle({ checked, onChange, label, sublabel }: { checked: boolean; onChange: () => void; label: string; sublabel?: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 px-3 rounded-lg border border-gray-200 bg-gray-50">
      <div>
        <span className="text-sm text-gray-700">{label}</span>
        {sublabel && <p className="text-xs text-gray-400 mt-0.5">{sublabel}</p>}
      </div>
      <button
        onClick={onChange}
        className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none flex-shrink-0 ml-3"
        style={{ background: checked ? GREEN : "#d1d5db" }}
      >
        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}

const DEFAULT_PAR3_HOLES: Record<9 | 18, number[]> = {
  9:  [3, 7],
  18: [3, 7, 12, 16],
};

export function ShotgunCreation() {
  const [startType, setStartType] = useState<"interval_start" | "shotgun_start">("shotgun_start");
  const [shotgunTime, setShotgunTime] = useState("07:30");
  const [holes, setHoles] = useState<9 | 18>(18);
  const [doubleTee, setDoubleTee] = useState(true);
  const [doubleTeeMode, setDoubleTeeMode] = useState<"all" | "exclude_par3">("exclude_par3");
  const [par3Holes, setPar3Holes] = useState<Set<number>>(new Set(DEFAULT_PAR3_HOLES[18]));

  const togglePar3 = (hole: number) => {
    setPar3Holes(prev => {
      const next = new Set(prev);
      next.has(hole) ? next.delete(hole) : next.add(hole);
      return next;
    });
  };

  const par3Excluded = doubleTee && doubleTeeMode === "exclude_par3";
  const par3Count = par3Excluded ? par3Holes.size : 0;
  const doubleHoles = par3Excluded ? holes - par3Count : holes;
  const singleHoles = par3Excluded ? par3Count : 0;
  const maxGroups = doubleTee ? doubleHoles * 2 + singleHoles : holes;
  const maxPlayers = maxGroups * 4;
  const registeredPlayers = 56;
  const registeredGroups = Math.ceil(registeredPlayers / 4);
  const capacityOk = registeredGroups <= maxGroups;

  const allHoles = Array.from({ length: holes }, (_, i) => i + 1);

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center p-6">
      <div className="w-full max-w-2xl space-y-5">

        {/* Page header */}
        <div>
          <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
            <span>Events</span><span>›</span>
            <span style={{ color: GREEN }} className="font-medium">Create Tournament</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Club Championship 2025</h1>
          <p className="text-sm text-gray-500 mt-0.5">Sat 14 Jun 2025 · 18 holes · Competition · Members Only</p>
        </div>

        {/* Wizard step indicator */}
        <div className="flex items-center gap-0">
          {["Details", "Format", "Pricing", "Schedule", "Review"].map((step, i) => (
            <div key={step} className="flex items-center">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium ${i === 3 ? "text-white" : "text-gray-400"}`}
                style={i === 3 ? { background: GREEN } : {}}>
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${i < 3 ? "bg-green-100 text-green-700" : i === 3 ? "bg-white/30 text-white" : "bg-gray-200 text-gray-500"}`}>
                  {i < 3 ? "✓" : i + 1}
                </span>
                {step}
              </div>
              {i < 4 && <span className="text-gray-300 text-xs">›</span>}
            </div>
          ))}
        </div>

        {/* Schedule section card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2" style={{ background: "#f8fdf9" }}>
            <svg className="h-4 w-4" style={{ color: GREEN }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <h2 className="text-sm font-semibold text-gray-800">Step 4 — Schedule</h2>
            <Badge>Tee Sheet</Badge>
          </div>

          <div className="p-5 space-y-5">

            {/* Start Type selector */}
            <div>
              <Label note="NEW">Start Type</Label>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setStartType("interval_start")}
                  className={`flex flex-col items-start gap-1 p-3.5 rounded-lg border-2 text-left transition-all ${startType === "interval_start" ? "border-[#1a5c38] bg-[#f0faf4]" : "border-gray-200 bg-white hover:border-gray-300"}`}>
                  <div className="flex items-center gap-2 w-full">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${startType === "interval_start" ? "border-[#1a5c38]" : "border-gray-300"}`}>
                      {startType === "interval_start" && <div className="w-2 h-2 rounded-full" style={{ background: GREEN }} />}
                    </div>
                    <span className={`text-sm font-semibold ${startType === "interval_start" ? "text-[#1a5c38]" : "text-gray-700"}`}>Interval Start</span>
                  </div>
                  <p className="text-xs text-gray-500 ml-6">Groups tee off sequentially from the 1st (or 10th) tee, spaced by a set interval.</p>
                </button>
                <button onClick={() => setStartType("shotgun_start")}
                  className={`flex flex-col items-start gap-1 p-3.5 rounded-lg border-2 text-left transition-all ${startType === "shotgun_start" ? "border-[#1a5c38] bg-[#f0faf4]" : "border-gray-200 bg-white hover:border-gray-300"}`}>
                  <div className="flex items-center gap-2 w-full">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${startType === "shotgun_start" ? "border-[#1a5c38]" : "border-gray-300"}`}>
                      {startType === "shotgun_start" && <div className="w-2 h-2 rounded-full" style={{ background: GREEN }} />}
                    </div>
                    <span className={`text-sm font-semibold ${startType === "shotgun_start" ? "text-[#1a5c38]" : "text-gray-700"}`}>Shotgun Start</span>
                  </div>
                  <p className="text-xs text-gray-500 ml-6">All groups start simultaneously, each from a different hole. Ideal for corporate &amp; open days.</p>
                </button>
              </div>
            </div>

            {/* Interval Start fields */}
            {startType === "interval_start" && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>First Tee Time</Label>
                  <input type="time" defaultValue="07:30" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white" />
                </div>
                <div>
                  <Label>Tee Interval</Label>
                  <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none">
                    <option>8 minutes</option><option>10 minutes</option><option>12 minutes</option>
                  </select>
                </div>
              </div>
            )}

            {/* Shotgun Start config */}
            {startType === "shotgun_start" && (
              <div className="space-y-4 rounded-lg border border-[#b7dfc8] bg-[#f8fdf9] p-4">
                <div className="flex items-center gap-2">
                  <svg className="h-4 w-4 text-[#1a5c38]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span className="text-sm font-semibold" style={{ color: GREEN }}>Shotgun Start Configuration</span>
                </div>

                {/* Time + Course */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Shotgun Start Time</Label>
                    <input type="time" value={shotgunTime} onChange={e => setShotgunTime(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white" />
                    <p className="text-xs text-gray-400 mt-1">All groups start at this time simultaneously.</p>
                  </div>
                  <div>
                    <Label>Course Layout</Label>
                    <div className="flex gap-2">
                      {([9, 18] as (9 | 18)[]).map(h => (
                        <button key={h} onClick={() => { setHoles(h); setPar3Holes(new Set(DEFAULT_PAR3_HOLES[h])); }}
                          className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${holes === h ? "text-white border-transparent" : "border-gray-200 text-gray-600 bg-white"}`}
                          style={holes === h ? { background: GREEN } : {}}>
                          {h} Holes
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Double Teeing toggle */}
                <Toggle
                  checked={doubleTee}
                  onChange={() => setDoubleTee(v => !v)}
                  label="Allow Double Teeing"
                  sublabel="Assign up to 2 groups per hole to increase capacity"
                />

                {/* Double Teeing sub-options */}
                {doubleTee && (
                  <div className="ml-3 pl-3 border-l-2 border-[#b7dfc8] space-y-3">
                    <p className="text-xs font-medium text-gray-600">Double tee applies to:</p>

                    {/* All holes */}
                    <button onClick={() => setDoubleTeeMode("all")}
                      className={`w-full flex items-start gap-3 p-3 rounded-lg border-2 text-left transition-all ${doubleTeeMode === "all" ? "border-[#1a5c38] bg-white" : "border-gray-200 bg-white hover:border-gray-300"}`}>
                      <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${doubleTeeMode === "all" ? "border-[#1a5c38]" : "border-gray-300"}`}>
                        {doubleTeeMode === "all" && <div className="w-2 h-2 rounded-full" style={{ background: GREEN }} />}
                      </div>
                      <div>
                        <p className={`text-sm font-medium ${doubleTeeMode === "all" ? "text-[#1a5c38]" : "text-gray-700"}`}>All holes</p>
                        <p className="text-xs text-gray-500 mt-0.5">Max {holes * 2} groups ({holes * 2 * 4} players) · 2 groups on every hole including par 3s</p>
                      </div>
                    </button>

                    {/* Exclude par 3s */}
                    <button onClick={() => setDoubleTeeMode("exclude_par3")}
                      className={`w-full flex items-start gap-3 p-3 rounded-lg border-2 text-left transition-all ${doubleTeeMode === "exclude_par3" ? "border-[#1a5c38] bg-white" : "border-gray-200 bg-white hover:border-gray-300"}`}>
                      <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${doubleTeeMode === "exclude_par3" ? "border-[#1a5c38]" : "border-gray-300"}`}>
                        {doubleTeeMode === "exclude_par3" && <div className="w-2 h-2 rounded-full" style={{ background: GREEN }} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className={`text-sm font-medium ${doubleTeeMode === "exclude_par3" ? "text-[#1a5c38]" : "text-gray-700"}`}>
                            All holes except par 3s
                          </p>
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0" style={{ background: "#fef3c7", color: "#92400e" }}>
                            Recommended
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Par 3s stay single-group to prevent pace-of-play delays.
                        </p>

                        {/* Par 3 hole picker — only when this mode is active */}
                        {doubleTeeMode === "exclude_par3" && (
                          <div className="mt-3 pt-3 border-t border-gray-100" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs font-medium text-gray-600">
                                Select which holes are par 3
                                <span className="ml-1.5 font-normal text-gray-400">
                                  ({par3Holes.size} selected)
                                </span>
                              </p>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => setPar3Holes(new Set())}
                                  className="text-[10px] text-gray-400 hover:text-gray-600 underline"
                                >Clear</button>
                                <button
                                  onClick={() => setPar3Holes(new Set(DEFAULT_PAR3_HOLES[holes]))}
                                  className="text-[10px] hover:underline"
                                  style={{ color: GREEN }}
                                >Reset defaults</button>
                              </div>
                            </div>

                            {/* Hole grid */}
                            <div className="grid grid-cols-9 gap-1">
                              {allHoles.map(hole => {
                                const isPar3 = par3Holes.has(hole);
                                return (
                                  <button
                                    key={hole}
                                    onClick={() => togglePar3(hole)}
                                    title={isPar3 ? `Hole ${hole} — Par 3 (click to remove)` : `Hole ${hole} (click to mark as par 3)`}
                                    className="flex flex-col items-center justify-center rounded-md border text-[10px] font-bold py-1.5 transition-all"
                                    style={isPar3
                                      ? { background: "#1d4ed8", borderColor: "#1d4ed8", color: "#fff" }
                                      : { background: "#fff", borderColor: "#e5e7eb", color: "#6b7280" }
                                    }
                                  >
                                    <span>{hole}</span>
                                    {isPar3 && (
                                      <span className="text-[8px] font-normal leading-none opacity-80 mt-0.5">P3</span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>

                            <p className="text-[10px] text-gray-400 mt-2 flex items-center gap-1">
                              <span className="inline-block w-3 h-3 rounded bg-blue-700 flex-shrink-0" />
                              Blue = par 3 (single group only) · White = double tee (Group A + B)
                            </p>
                          </div>
                        )}
                      </div>
                    </button>
                  </div>
                )}

                {/* Capacity indicator */}
                <div className={`flex items-start gap-2.5 p-3 rounded-lg border ${capacityOk ? "border-[#b7dfc8] bg-[#f0faf4]" : "border-red-200 bg-red-50"}`}>
                  <span className={`mt-0.5 text-lg leading-none ${capacityOk ? "text-green-600" : "text-red-500"}`}>
                    {capacityOk ? "✓" : "⚠"}
                  </span>
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${capacityOk ? "text-green-800" : "text-red-700"}`}>
                      {capacityOk
                        ? `Capacity OK — up to ${maxPlayers} players (${maxGroups} groups × 4)`
                        : `Capacity exceeded — ${registeredGroups} groups needed, only ${maxGroups} available`}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {holes}-hole course
                      {doubleTee
                        ? par3Excluded && par3Count > 0
                          ? ` · double tee on ${doubleHoles} holes · single on ${par3Count} par 3${par3Count !== 1 ? "s" : ""} (holes ${[...par3Holes].sort((a,b)=>a-b).join(", ")})`
                          : ` · double teeing on all holes`
                        : " · single group per hole"}
                      {" · "}{registeredPlayers} players registered
                    </p>
                  </div>
                </div>

                {/* Info note */}
                <p className="text-xs text-gray-500 flex items-start gap-1.5">
                  <svg className="h-3.5 w-3.5 text-gray-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {par3Excluded && par3Count > 0
                    ? `Hole assignments auto-generated on draw publish. Par 3s (holes ${[...par3Holes].sort((a,b)=>a-b).join(", ")}) get one group only; all others get Group A + B.`
                    : `Hole assignments are auto-generated when you publish the draw.`}
                </p>
              </div>
            )}

            {/* Interval tee slots */}
            {startType === "interval_start" && (
              <div>
                <Label>Tee Time Slots</Label>
                <div className="space-y-1.5">
                  {["07:30", "07:38", "07:46", "07:54"].map((t, i) => (
                    <div key={t} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm">
                      <span className="font-mono text-gray-600 w-12">{t}</span>
                      <span className="text-gray-400">·</span>
                      <span className="text-gray-500">4 players</span>
                      <span className="ml-auto text-xs" style={{ color: i < 3 ? GREEN : GOLD }}>
                        {i < 3 ? "Booked" : "Available"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Hole assignment preview for shotgun */}
            {startType === "shotgun_start" && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label note="preview">Hole Assignment Preview</Label>
                  {par3Excluded && par3Count > 0 && (
                    <div className="flex items-center gap-3 text-[10px] text-gray-400">
                      <span className="flex items-center gap-1">
                        <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "#fef3c7", border: "1px solid #f59e0b" }} />
                        A+B
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="inline-block w-2.5 h-2.5 rounded-sm bg-blue-700" />
                        Par 3 (A only)
                      </span>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {Array.from({ length: Math.min(9, holes) }, (_, i) => i + 1).map(hole => {
                    const isPar3 = par3Excluded && par3Holes.has(hole);
                    return (
                      <div key={hole}
                        className="flex items-center gap-1.5 px-2.5 py-2 rounded border text-xs"
                        style={isPar3 ? { background: "#eff6ff", borderColor: "#93c5fd" } : { background: "#fff", borderColor: "#e5e7eb" }}>
                        <span className={`font-bold w-14 shrink-0`} style={{ color: isPar3 ? "#1d4ed8" : GREEN }}>
                          Hole {hole}
                        </span>
                        <span className="text-gray-400 font-mono text-[10px]">{shotgunTime}</span>
                        {doubleTee && (
                          isPar3
                            ? <span className="ml-auto text-[10px] px-1 rounded font-medium bg-blue-100 text-blue-700">A only</span>
                            : <span className="ml-auto text-[10px] px-1 rounded font-medium" style={{ background: "#fef3c7", color: "#92400e" }}>A+B</span>
                        )}
                      </div>
                    );
                  })}
                  {holes === 18 && (
                    <div className="col-span-3 text-xs text-gray-400 text-center py-1">
                      …and holes 10–18
                      {par3Excluded && par3Count > 0 && ` (incl. ${[...par3Holes].filter(h => h > 9).length} par 3${[...par3Holes].filter(h => h > 9).length !== 1 ? "s" : ""})`}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between pb-6">
          <button className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 bg-white hover:bg-gray-50">
            ← Back
          </button>
          <button className="px-5 py-2 rounded-lg text-sm font-medium text-white" style={{ background: GREEN }}>
            Next: Review →
          </button>
        </div>
      </div>
    </div>
  );
}
