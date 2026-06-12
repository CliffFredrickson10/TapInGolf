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

function Toggle({ checked, onChange, label, sublabel }: {
  checked: boolean; onChange: () => void; label: string; sublabel?: string;
}) {
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

// ─── Session pill ─────────────────────────────────────────────────────────────
function SessionBadge({ label, color }: { label: string; color: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold text-white" style={{ background: color }}>
      {label}
    </span>
  );
}

export function ShotgunCreation() {
  const [startType, setStartType] = useState<"interval_start" | "shotgun_start">("shotgun_start");
  const [holes, setHoles] = useState<9 | 18>(18);

  // Single-session time
  const [shotgunTime, setShotgunTime] = useState("07:30");

  // Two-session support
  const [twoSessions, setTwoSessions] = useState(true);
  const [amTime, setAmTime] = useState("07:30");
  const [pmTime, setPmTime] = useState("13:00");

  // Double-teeing
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
  const par3Count    = par3Excluded ? par3Holes.size : 0;
  const doubleHoles  = par3Excluded ? holes - par3Count : holes;
  const singleHoles  = par3Excluded ? par3Count : 0;
  const maxGroupsPerSession = doubleTee ? doubleHoles * 2 + singleHoles : holes;
  const sessions = twoSessions ? 2 : 1;
  const maxGroupsTotal = maxGroupsPerSession * sessions;
  const maxPlayersTotal = maxGroupsTotal * 4;

  const registeredPlayers = 96;
  const registeredGroups  = Math.ceil(registeredPlayers / 4);
  const capacityOk = registeredGroups <= maxGroupsTotal;

  const [step, setStep] = useState(3);
  const STEPS = ["Details", "Format", "Pricing", "Teams", "Schedule", "Review"];

  // Simulates the tournament's Format 1 selection — drives whether Teams is required
  const TEAM_FORMATS = ["betterball", "fourball", "scramble", "alliance", "fourball_stableford"];
  const FORMAT_LABELS: Record<string, string> = {
    betterball: "Betterball", fourball: "Fourball", scramble: "Scramble",
    alliance: "Alliance", fourball_stableford: "Fourball Stableford", stroke_play: "Stroke Play",
  };
  const [selectedFormat, setSelectedFormat] = useState("betterball");
  const isTeamFormat = TEAM_FORMATS.includes(selectedFormat);

  // ── Team pairing state ────────────────────────────────────────────
  const TEAM_COLORS = ["#1a5c38", "#7c3aed", "#b45309", "#be123c", "#0369a1", "#d97706"];
  const MOCK_PLAYERS = [
    "Pieter van Wyk", "Johan Botha", "Andre Smit", "Louis Nel",
    "Morne Visser", "Thabo Dlamini", "Rikus Pretorius", "Jaco Venter",
    "Eugene Steyn", "Charl Fourie", "Danie Grobler", "Herman Louw",
    "Francois Meyer", "Jan Naudé", "Gert Botes", "Rian Joubert",
    "Petrus Jacobs", "Schalk Burger", "Ernst Bekker", "Cobus Viljoen",
  ];
  const [teamSize, setTeamSize]   = useState(2);
  const [pairedTeams, setPairedTeams] = useState([
    { id: 1, players: ["Pieter van Wyk", "Johan Botha"],         color: "#1a5c38" },
    { id: 2, players: ["Morne Visser", "Thabo Dlamini"],         color: "#7c3aed" },
    { id: 3, players: ["Eugene Steyn", "Charl Fourie", "Danie Grobler"], color: "#b45309" },
  ]);
  const [addingPairing, setAddingPairing] = useState(false);
  const [draftTeam, setDraftTeam] = useState<string[]>([]);

  const pairedSet       = new Set(pairedTeams.flatMap(t => t.players));
  const unpairedPlayers = MOCK_PLAYERS.filter(p => !pairedSet.has(p));

  const toggleDraft = (p: string) =>
    setDraftTeam(prev =>
      prev.includes(p) ? prev.filter(x => x !== p) : prev.length < teamSize ? [...prev, p] : prev
    );

  const savePairing = () => {
    if (draftTeam.length < 2) return;
    const color = TEAM_COLORS[pairedTeams.length % TEAM_COLORS.length];
    setPairedTeams(prev => [...prev, { id: Date.now(), players: draftTeam, color }]);
    setDraftTeam([]);
    setAddingPairing(false);
  };

  const removePairing = (id: number) => setPairedTeams(prev => prev.filter(t => t.id !== id));

  const allHoles    = Array.from({ length: holes }, (_, i) => i + 1);
  const previewHoles = Array.from({ length: Math.min(6, holes) }, (_, i) => i + 1);

  const sessionTimes = twoSessions ? [amTime, pmTime] : [shotgunTime];
  const sessionLabels = twoSessions ? ["AM", "PM"] : [""];
  const sessionColors = ["#1a5c38", "#7c3aed"];

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

        {/* Step indicator */}
        <div className="flex items-center gap-0">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium ${i === step ? "text-white" : "text-gray-400"}`}
                style={i === step ? { background: GREEN } : {}}>
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${i < step ? "bg-green-100 text-green-700" : i === step ? "bg-white/30 text-white" : "bg-gray-200 text-gray-500"}`}>
                  {i < step ? "✓" : i + 1}
                </span>
                {label}
              </div>
              {i < 4 && <span className="text-gray-300 text-xs">›</span>}
            </div>
          ))}
        </div>

        {/* Details — step 0 */}
        {step === 0 && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-100" style={{ background: "#f8fdf9" }}>
                <h3 className="text-sm font-semibold text-gray-800">Event Details</h3>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <Label>Event Name</Label>
                  <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-1" defaultValue="Club Championship 2025" style={{ focusRingColor: GREEN }} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Start Date</Label>
                    <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800" defaultValue="2025-06-14" />
                  </div>
                  <div>
                    <Label note="optional">End Date</Label>
                    <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600" />
                  </div>
                </div>
                <div>
                  <Label>Event Type</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {["Competition", "Social", "Club Trial", "League", "Charity", "Corporate"].map(t => (
                      <button key={t}
                        className={`py-1.5 rounded-lg border text-xs font-medium transition-colors ${t === "Competition" ? "text-white" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                        style={t === "Competition" ? { background: GREEN, borderColor: GREEN } : {}}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label>Restriction</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {["Open", "Members Only", "Invite Only", "WHS Index Players Only"].map(r => (
                      <button key={r}
                        className={`py-1.5 rounded-lg border text-xs font-medium transition-colors ${r === "Members Only" ? "text-white" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                        style={r === "Members Only" ? { background: GREEN, borderColor: GREEN } : {}}>
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label note="optional">Max Participants</Label>
                    <input type="number" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800" defaultValue="120" />
                  </div>
                  <div>
                    <Label note="optional">Cover Image URL</Label>
                    <input type="url" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600" placeholder="https://…" />
                  </div>
                </div>
                <div>
                  <Label note="optional">Description</Label>
                  <textarea rows={3} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 resize-none" defaultValue="Annual club championship open to all members with a valid WHS handicap index." />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Format — step 1 */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-100" style={{ background: "#f8fdf9" }}>
                <h3 className="text-sm font-semibold text-gray-800">Game Format</h3>
                <p className="text-xs text-gray-400 mt-0.5">Set Format 1 and optionally a secondary format. Team formats automatically require player pairings.</p>
              </div>
              <div className="p-5 space-y-5">
                <div>
                  <Label>Format 1 <span className="text-xs font-normal text-gray-400">(primary)</span></Label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      ["stroke_play","Stroke Play"],["stableford","Stableford"],["betterball","Betterball"],
                      ["fourball","Fourball"],["scramble","Scramble"],["alliance","Alliance"],
                      ["match_play","Match Play"],["bogey","Bogey"],["other","Other"],
                    ].map(([k, v]) => {
                      const isTeam = ["betterball","fourball","scramble","alliance"].includes(k);
                      return (
                        <button key={k}
                          className={`py-1.5 rounded-lg border text-xs font-medium transition-colors relative ${k === "stroke_play" ? "text-white" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                          style={k === "stroke_play" ? { background: GREEN, borderColor: GREEN } : {}}>
                          {v}
                          {isTeam && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-400" title="Team format" />}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5">🟡 Dot = team format — requires player pairings</p>
                </div>
                <div>
                  <Label>Format 2 <span className="text-xs font-normal text-gray-400">(optional secondary)</span></Label>
                  <div className="grid grid-cols-3 gap-2">
                    {[["none","None"],["stableford","Stableford"],["betterball","Betterball"],["bogey","Bogey"],["other","Other"]].map(([k, v]) => (
                      <button key={k}
                        className={`py-1.5 rounded-lg border text-xs font-medium transition-colors ${k === "none" ? "text-white" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                        style={k === "none" ? { background: "#9ca3af", borderColor: "#9ca3af" } : {}}>
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Holes</Label>
                    <div className="flex gap-2">
                      {[9, 18].map(h => (
                        <button key={h} className={`flex-1 py-2 rounded-lg border text-sm font-medium ${h === 18 ? "text-white" : "border-gray-200 text-gray-600"}`}
                          style={h === 18 ? { background: GREEN, borderColor: GREEN } : {}}>{h}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label>Rounds</Label>
                    <div className="flex gap-2">
                      {[1, 2].map(r => (
                        <button key={r} className={`flex-1 py-2 rounded-lg border text-sm font-medium ${r === 1 ? "text-white" : "border-gray-200 text-gray-600"}`}
                          style={r === 1 ? { background: GREEN, borderColor: GREEN } : {}}>{r}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label>Scoring</Label>
                    <div className="space-y-1.5">
                      {[["Gross","Gross"],["Net","Net (handicap)"],["Both","Gross + Net"]].map(([k,v]) => (
                        <button key={k} className={`w-full py-1.5 rounded-lg border text-xs font-medium text-left px-3 ${k === "Net" ? "text-white" : "border-gray-200 text-gray-600"}`}
                          style={k === "Net" ? { background: GREEN, borderColor: GREEN } : {}}>{v}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Pricing — step 2 */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-100" style={{ background: "#f8fdf9" }}>
                <h3 className="text-sm font-semibold text-gray-800">Entry Fees &amp; Payment</h3>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Entry Fee (R)</Label>
                    <input type="number" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800" defaultValue="450" />
                  </div>
                  <div>
                    <Label>Payment Required</Label>
                    <div className="flex gap-2 mt-0.5">
                      {["Yes","No"].map(v => (
                        <button key={v} className={`flex-1 py-2 rounded-lg border text-sm font-medium ${v === "Yes" ? "text-white" : "border-gray-200 text-gray-600"}`}
                          style={v === "Yes" ? { background: GREEN, borderColor: GREEN } : {}}>{v}</button>
                      ))}
                    </div>
                  </div>
                </div>
                <Toggle checked label="Use club member tiered pricing" sublabel="Members get their club rate; guests pay the guest rate" onChange={() => {}} />
                <div>
                  <Label>Additional Fees <span className="text-xs font-normal text-gray-400">(optional)</span></Label>
                  <div className="space-y-2">
                    {[{ name: "Cart hire", amount: "150" }, { name: "Caddie", amount: "200" }].map(f => (
                      <div key={f.name} className="flex gap-2 items-center">
                        <input className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700" defaultValue={f.name} placeholder="Fee name" />
                        <input className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700" defaultValue={f.amount} placeholder="R" />
                        <button className="text-gray-300 hover:text-red-400"><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                      </div>
                    ))}
                    <button className="text-xs text-gray-400 hover:text-green-700 border border-dashed border-gray-200 rounded-lg w-full py-2 hover:border-green-300 transition-colors">+ Add fee</button>
                  </div>
                </div>
                <div>
                  <Label>Accepted Payment Methods</Label>
                  <div className="space-y-1.5">
                    {[["Stitch (Instant EFT + card)","stitch",true],["Club wallet","wallet",true],["Voucher / prepaid round","voucher",false]].map(([label, k, on]) => (
                      <Toggle key={k as string} checked={on as boolean} label={label as string} onChange={() => {}} />
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Entries Open</Label>
                    <input type="datetime-local" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700" defaultValue="2025-05-01T08:00" />
                  </div>
                  <div>
                    <Label>Entries Close</Label>
                    <input type="datetime-local" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700" defaultValue="2025-06-10T17:00" />
                  </div>
                </div>
                <Toggle checked={false} label="Enable ballot (cap entries, confirm by ballot)" sublabel="Useful when demand exceeds max participants" onChange={() => {}} />
              </div>
            </div>
          </div>
        )}

        {/* Review screen — step 5 */}
        {step === 5 && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2" style={{ background: "#f8fdf9" }}>
                <svg className="h-4 w-4" style={{ color: GREEN }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h3 className="text-sm font-semibold text-gray-800">Review &amp; Publish</h3>
              </div>
              <div className="divide-y divide-gray-100">
                {[
                  { label: "Event", value: "Club Championship 2025" },
                  { label: "Date", value: "Sat 14 Jun 2025" },
                  { label: "Format", value: "Strokeplay · 18 holes · Competition" },
                  { label: "Start type", value: startType === "shotgun" ? "Shotgun Start" : startType === "double-tee" ? "Double Tee" : "Sequential" },
                  { label: "Shotgun time", value: shotgunTime },
                  { label: "Groups", value: `${maxGroupsTotal} groups · ${maxPlayersTotal} players max` },
                  { label: "Entry fee", value: "R450.00 per player" },
                  { label: "Registered", value: `${registeredPlayers} players (${registeredGroups} groups)` },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between px-5 py-3">
                    <span className="text-sm text-gray-500">{row.label}</span>
                    <span className="text-sm font-medium text-gray-900">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-start gap-3 px-4 py-3 rounded-xl border bg-amber-50 border-amber-200">
              <svg className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-xs text-amber-800">Publishing will notify all registered players by email and make the draw visible in the app.</p>
            </div>
          </div>
        )}

        {/* Teams step — step 3 */}
        {step === 3 && (
          <div className="space-y-4">

            {/* Demo toggle — simulates Format selection from step 1 */}
            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-3 flex items-center gap-3 text-xs text-gray-500">
              <span className="font-medium text-gray-600">Demo: Format 1 =</span>
              <select
                value={selectedFormat}
                onChange={e => setSelectedFormat(e.target.value)}
                className="border border-gray-200 rounded px-2 py-1 text-xs text-gray-700 bg-white"
              >
                {Object.entries(FORMAT_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <span className={`ml-auto px-2 py-0.5 rounded text-[10px] font-bold ${isTeamFormat ? "bg-red-600 text-white" : "bg-gray-200 text-gray-500"}`}>
                {isTeamFormat ? "TEAM FORMAT — REQUIRED" : "INDIVIDUAL — OPTIONAL"}
              </span>
            </div>

            {/* Required banner when team format is active */}
            {isTeamFormat && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-2.5">
                <svg className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                <div>
                  <p className="text-xs font-semibold text-amber-800">{FORMAT_LABELS[selectedFormat]} selected — player pairings are required</p>
                  <p className="text-xs text-amber-700 mt-0.5">Players in a team must stay together in the same draw group. Unpaired players will be blocked from entering the tournament from the app until a partner is selected.</p>
                </div>
              </div>
            )}

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2" style={{ background: "#f8fdf9" }}>
                <svg className="h-4 w-4" style={{ color: GREEN }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <h3 className="text-sm font-semibold text-gray-800">Player Pairings</h3>
                <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded ${isTeamFormat ? "bg-red-100 text-red-700" : "text-gray-400"}`}>
                  {isTeamFormat ? "Required" : "Optional"} · {pairedTeams.length} team{pairedTeams.length !== 1 ? "s" : ""} defined
                </span>
              </div>

              <div className="p-5 space-y-5">
                {/* Team size selector */}
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <label className="text-sm font-medium text-gray-700">Team Size</label>
                    <span className="text-xs text-gray-400">players per team</span>
                  </div>
                  <div className="flex gap-2">
                    {[2, 4].map(n => (
                      <button key={n} onClick={() => setTeamSize(n)}
                        className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${teamSize === n ? "text-white" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                        style={teamSize === n ? { background: GREEN, borderColor: GREEN } : {}}>
                        {n}-Ball
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5">Teams will always be placed in the same group. Mixed sizes are supported.</p>
                </div>

                {/* Existing pairings */}
                {pairedTeams.length > 0 && (
                  <div className="space-y-2">
                    {pairedTeams.map((team, ti) => (
                      <div key={team.id} className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 bg-white">
                        <div className="w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0" style={{ background: team.color }} />
                        <div className="flex flex-wrap gap-1.5 flex-1">
                          {team.players.map(p => (
                            <span key={p} className="px-2.5 py-1 rounded-full text-xs font-medium text-white" style={{ background: team.color }}>
                              {p}
                            </span>
                          ))}
                        </div>
                        <span className="text-xs text-gray-400 flex-shrink-0 mt-0.5">{team.players.length}-ball</span>
                        <button onClick={() => removePairing(team.id)} className="text-gray-300 hover:text-red-400 flex-shrink-0" title="Remove">
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add pairing inline form */}
                {addingPairing ? (
                  <div className="rounded-lg border-2 border-dashed p-4 space-y-3" style={{ borderColor: "#b7dfc8", background: "#f8fdf9" }}>
                    <p className="text-xs font-medium text-gray-700">
                      Select {teamSize} players ({draftTeam.length}/{teamSize} selected)
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {unpairedPlayers.map(p => {
                        const selected = draftTeam.includes(p);
                        const disabled = !selected && draftTeam.length >= teamSize;
                        return (
                          <button key={p} onClick={() => toggleDraft(p)} disabled={disabled}
                            className={`px-2.5 py-1.5 rounded-full text-xs font-medium border transition-colors
                              ${selected ? "text-white border-transparent" : "border-gray-200 text-gray-600"}
                              ${disabled ? "opacity-40 cursor-default" : "hover:border-green-300"}`}
                            style={selected ? { background: TEAM_COLORS[pairedTeams.length % TEAM_COLORS.length] } : {}}>
                            {p}
                          </button>
                        );
                      })}
                      {unpairedPlayers.length === 0 && <p className="text-xs text-gray-400">All players already paired.</p>}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => { setAddingPairing(false); setDraftTeam([]); }}
                        className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50">
                        Cancel
                      </button>
                      <button onClick={savePairing} disabled={draftTeam.length < 2}
                        className="px-4 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-40"
                        style={{ background: GREEN }}>
                        Add Team ({draftTeam.length} player{draftTeam.length !== 1 ? "s" : ""})
                      </button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setAddingPairing(true)}
                    className="w-full py-2.5 rounded-lg border-2 border-dashed border-gray-200 text-sm text-gray-400 hover:border-green-300 hover:text-green-700 transition-colors">
                    + Add Pairing
                  </button>
                )}

                {/* Unpaired pool */}
                {unpairedPlayers.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 mb-2">Unpaired ({unpairedPlayers.length}) — will be randomly assigned</p>
                    <div className="flex flex-wrap gap-1.5">
                      {unpairedPlayers.map(p => (
                        <span key={p} className="px-2 py-1 bg-gray-100 rounded-full text-xs text-gray-600">{p}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Schedule card — step 4 */}
        {step === 4 && (<div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2" style={{ background: "#f8fdf9" }}>
            <svg className="h-4 w-4" style={{ color: GREEN }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <h2 className="text-sm font-semibold text-gray-800">Step 4 — Schedule</h2>
            <Badge>Tee Sheet</Badge>
          </div>

          <div className="p-5 space-y-5">

            {/* Start Type */}
            <div>
              <Label note="NEW">Start Type</Label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: "interval_start", title: "Interval Start", desc: "Groups tee off sequentially from the 1st (or 10th) tee, spaced by a set interval." },
                  { key: "shotgun_start",  title: "Shotgun Start",  desc: "All groups start simultaneously, each from a different hole. Ideal for corporate & open days." },
                ].map(opt => (
                  <button key={opt.key} onClick={() => setStartType(opt.key as any)}
                    className={`flex flex-col items-start gap-1 p-3.5 rounded-lg border-2 text-left transition-all ${startType === opt.key ? "border-[#1a5c38] bg-[#f0faf4]" : "border-gray-200 bg-white hover:border-gray-300"}`}>
                    <div className="flex items-center gap-2 w-full">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${startType === opt.key ? "border-[#1a5c38]" : "border-gray-300"}`}>
                        {startType === opt.key && <div className="w-2 h-2 rounded-full" style={{ background: GREEN }} />}
                      </div>
                      <span className={`text-sm font-semibold ${startType === opt.key ? "text-[#1a5c38]" : "text-gray-700"}`}>{opt.title}</span>
                    </div>
                    <p className="text-xs text-gray-500 ml-6">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Interval fields */}
            {startType === "interval_start" && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>First Tee Time</Label>
                  <input type="time" defaultValue="07:30" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white" />
                </div>
                <div>
                  <Label>Tee Interval</Label>
                  <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                    <option>8 minutes</option><option>10 minutes</option><option>12 minutes</option>
                  </select>
                </div>
              </div>
            )}

            {/* ── Shotgun config ──────────────────────────────────────────── */}
            {startType === "shotgun_start" && (
              <div className="space-y-4 rounded-lg border border-[#b7dfc8] bg-[#f8fdf9] p-4">

                {/* Header */}
                <div className="flex items-center gap-2">
                  <svg className="h-4 w-4" style={{ color: GREEN }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span className="text-sm font-semibold" style={{ color: GREEN }}>Shotgun Start Configuration</span>
                </div>

                {/* Course Layout */}
                <div>
                  <Label>Course Layout</Label>
                  <div className="flex gap-2 w-40">
                    {([9, 18] as (9 | 18)[]).map(h => (
                      <button key={h} onClick={() => { setHoles(h); setPar3Holes(new Set(DEFAULT_PAR3_HOLES[h])); }}
                        className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${holes === h ? "text-white border-transparent" : "border-gray-200 text-gray-600 bg-white"}`}
                        style={holes === h ? { background: GREEN } : {}}>
                        {h} Holes
                      </button>
                    ))}
                  </div>
                </div>

                {/* ── Two Sessions toggle ───────────────────────────────── */}
                <Toggle
                  checked={twoSessions}
                  onChange={() => setTwoSessions(v => !v)}
                  label="Two Sessions (AM + PM)"
                  sublabel="Run a morning and afternoon shotgun on the same day — field split across both"
                />

                {/* Session time pickers */}
                {twoSessions ? (
                  <div className="grid grid-cols-2 gap-3">
                    {/* AM */}
                    <div className="rounded-lg border-2 p-3 space-y-1.5" style={{ borderColor: "#1a5c38", background: "#f0faf4" }}>
                      <div className="flex items-center gap-1.5">
                        <SessionBadge label="AM" color="#1a5c38" />
                        <span className="text-xs font-medium" style={{ color: GREEN }}>Morning Session</span>
                      </div>
                      <input type="time" value={amTime} onChange={e => setAmTime(e.target.value)}
                        className="w-full border border-[#b7dfc8] rounded-md px-2.5 py-1.5 text-sm bg-white font-mono" />
                      <p className="text-[10px] text-gray-500">
                        Up to {maxGroupsPerSession} groups · {maxGroupsPerSession * 4} players
                      </p>
                    </div>
                    {/* PM */}
                    <div className="rounded-lg border-2 p-3 space-y-1.5" style={{ borderColor: "#7c3aed", background: "#faf5ff" }}>
                      <div className="flex items-center gap-1.5">
                        <SessionBadge label="PM" color="#7c3aed" />
                        <span className="text-xs font-medium text-purple-700">Afternoon Session</span>
                      </div>
                      <input type="time" value={pmTime} onChange={e => setPmTime(e.target.value)}
                        className="w-full border border-purple-200 rounded-md px-2.5 py-1.5 text-sm bg-white font-mono" />
                      <p className="text-[10px] text-gray-500">
                        Up to {maxGroupsPerSession} groups · {maxGroupsPerSession * 4} players
                      </p>
                    </div>
                  </div>
                ) : (
                  /* Single time picker */
                  <div>
                    <Label>Shotgun Start Time</Label>
                    <input type="time" value={shotgunTime} onChange={e => setShotgunTime(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white" />
                    <p className="text-xs text-gray-400 mt-1">All groups start at this time simultaneously.</p>
                  </div>
                )}

                {/* ── Double Teeing toggle ──────────────────────────────── */}
                <Toggle
                  checked={doubleTee}
                  onChange={() => setDoubleTee(v => !v)}
                  label="Allow Double Teeing"
                  sublabel="Assign up to 2 groups per hole per session"
                />

                {doubleTee && (
                  <div className="ml-3 pl-3 border-l-2 border-[#b7dfc8] space-y-3">
                    <p className="text-xs font-medium text-gray-600">Double tee applies to:</p>

                    {[
                      { key: "all", title: "All holes", desc: `Max ${holes * 2} groups (${holes * 2 * 4} players) per session · 2 groups on every hole` },
                      { key: "exclude_par3", title: "All holes except par 3s", desc: "Par 3s stay single-group to prevent pace-of-play delays.", recommended: true },
                    ].map(opt => (
                      <button key={opt.key} onClick={() => setDoubleTeeMode(opt.key as any)}
                        className={`w-full flex items-start gap-3 p-3 rounded-lg border-2 text-left transition-all ${doubleTeeMode === opt.key ? "border-[#1a5c38] bg-white" : "border-gray-200 bg-white hover:border-gray-300"}`}>
                        <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${doubleTeeMode === opt.key ? "border-[#1a5c38]" : "border-gray-300"}`}>
                          {doubleTeeMode === opt.key && <div className="w-2 h-2 rounded-full" style={{ background: GREEN }} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className={`text-sm font-medium ${doubleTeeMode === opt.key ? "text-[#1a5c38]" : "text-gray-700"}`}>{opt.title}</p>
                            {opt.recommended && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0" style={{ background: "#fef3c7", color: "#92400e" }}>Recommended</span>}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>

                          {/* Par 3 hole picker */}
                          {opt.key === "exclude_par3" && doubleTeeMode === "exclude_par3" && (
                            <div className="mt-3 pt-3 border-t border-gray-100" onClick={e => e.stopPropagation()}>
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-xs font-medium text-gray-600">
                                  Select which holes are par 3
                                  <span className="ml-1 font-normal text-gray-400">({par3Holes.size} selected)</span>
                                </p>
                                <div className="flex gap-2">
                                  <button onClick={() => setPar3Holes(new Set())} className="text-[10px] text-gray-400 hover:text-gray-600 underline">Clear</button>
                                  <button onClick={() => setPar3Holes(new Set(DEFAULT_PAR3_HOLES[holes]))} className="text-[10px] hover:underline" style={{ color: GREEN }}>Reset defaults</button>
                                </div>
                              </div>
                              <div className="grid grid-cols-9 gap-1">
                                {allHoles.map(hole => {
                                  const isPar3 = par3Holes.has(hole);
                                  return (
                                    <button key={hole} onClick={() => togglePar3(hole)}
                                      title={`Hole ${hole}${isPar3 ? " — Par 3" : ""}`}
                                      className="flex flex-col items-center justify-center rounded-md border text-[10px] font-bold py-1.5 transition-all"
                                      style={isPar3
                                        ? { background: "#1d4ed8", borderColor: "#1d4ed8", color: "#fff" }
                                        : { background: "#fff", borderColor: "#e5e7eb", color: "#6b7280" }}>
                                      <span>{hole}</span>
                                      {isPar3 && <span className="text-[8px] font-normal opacity-80 mt-0.5">P3</span>}
                                    </button>
                                  );
                                })}
                              </div>
                              <p className="text-[10px] text-gray-400 mt-2 flex items-center gap-1">
                                <span className="inline-block w-3 h-3 rounded bg-blue-700 flex-shrink-0" />
                                Blue = par 3 (single group only) · White = double tee (A + B)
                              </p>
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* ── Capacity indicator ────────────────────────────────── */}
                <div className={`rounded-lg border p-3 ${capacityOk ? "border-[#b7dfc8] bg-[#f0faf4]" : "border-red-200 bg-red-50"}`}>
                  {twoSessions ? (
                    <>
                      {/* Two-session breakdown */}
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-lg leading-none ${capacityOk ? "text-green-600" : "text-red-500"}`}>{capacityOk ? "✓" : "⚠"}</span>
                        <p className={`text-sm font-medium ${capacityOk ? "text-green-800" : "text-red-700"}`}>
                          {capacityOk
                            ? `Total capacity OK — up to ${maxPlayersTotal} players across both sessions`
                            : `Capacity exceeded — ${registeredGroups} groups needed, only ${maxGroupsTotal} available`}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        {[
                          { label: "AM", time: amTime, color: "#1a5c38", bg: "#f0faf4", border: "#b7dfc8" },
                          { label: "PM", time: pmTime, color: "#7c3aed", bg: "#faf5ff", border: "#c4b5fd" },
                        ].map(s => (
                          <div key={s.label} className="rounded-md border px-2.5 py-2 text-xs" style={{ borderColor: s.border, background: s.bg }}>
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <SessionBadge label={s.label} color={s.color} />
                              <span className="font-mono text-gray-600">{s.time}</span>
                            </div>
                            <p className="text-gray-500">
                              Up to {maxGroupsPerSession} groups · {maxGroupsPerSession * 4} players
                            </p>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-gray-500 mt-2">
                        {holes}-hole course
                        {par3Excluded && par3Count > 0
                          ? ` · double tee on ${doubleHoles} holes · single on ${par3Count} par 3s (holes ${[...par3Holes].sort((a,b)=>a-b).join(", ")})`
                          : doubleTee ? ` · double teeing all holes` : ` · single group per hole`}
                        {" · "}{registeredPlayers} players registered
                      </p>
                    </>
                  ) : (
                    <div className="flex items-start gap-2.5">
                      <span className={`mt-0.5 text-lg leading-none ${capacityOk ? "text-green-600" : "text-red-500"}`}>{capacityOk ? "✓" : "⚠"}</span>
                      <div>
                        <p className={`text-sm font-medium ${capacityOk ? "text-green-800" : "text-red-700"}`}>
                          {capacityOk
                            ? `Capacity OK — up to ${maxPlayersTotal} players (${maxGroupsTotal} groups × 4)`
                            : `Capacity exceeded — ${registeredGroups} groups needed, only ${maxGroupsTotal} available`}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {holes}-hole course
                          {par3Excluded && par3Count > 0
                            ? ` · double tee on ${doubleHoles} holes · single on ${par3Count} par 3s`
                            : doubleTee ? ` · double teeing all holes` : ` · single group per hole`}
                          {" · "}{registeredPlayers} players registered
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Info note */}
                <p className="text-xs text-gray-500 flex items-start gap-1.5">
                  <svg className="h-3.5 w-3.5 text-gray-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {twoSessions
                    ? `Two separate draws will be generated — one per session. Players are assigned to a session at draw time.`
                    : `Hole assignments are auto-generated when you publish the draw.`}
                </p>
              </div>
            )}

            {/* Tee slots for interval */}
            {startType === "interval_start" && (
              <div>
                <Label>Tee Time Slots</Label>
                <div className="space-y-1.5">
                  {["07:30", "07:38", "07:46", "07:54"].map((t, i) => (
                    <div key={t} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm">
                      <span className="font-mono text-gray-600 w-12">{t}</span>
                      <span className="text-gray-400">·</span>
                      <span className="text-gray-500">4 players</span>
                      <span className="ml-auto text-xs" style={{ color: i < 3 ? GREEN : GOLD }}>{i < 3 ? "Booked" : "Available"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Hole assignment preview */}
            {startType === "shotgun_start" && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label note="preview">Hole Assignment Preview</Label>
                  <div className="flex items-center gap-3 text-[10px] text-gray-400">
                    {twoSessions && (
                      <>
                        <span className="flex items-center gap-1"><SessionBadge label="AM" color="#1a5c38" /> {amTime}</span>
                        <span className="flex items-center gap-1"><SessionBadge label="PM" color="#7c3aed" /> {pmTime}</span>
                      </>
                    )}
                    {par3Excluded && par3Count > 0 && (
                      <span className="flex items-center gap-1">
                        <span className="inline-block w-2.5 h-2.5 rounded-sm bg-blue-700" />Par 3 (A only)
                      </span>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {previewHoles.map(hole => {
                    const isPar3 = par3Excluded && par3Holes.has(hole);
                    return (
                      <div key={hole}
                        className="rounded border text-xs overflow-hidden"
                        style={{ borderColor: isPar3 ? "#93c5fd" : "#e5e7eb" }}>
                        {/* Hole label row */}
                        <div className="flex items-center gap-1.5 px-2.5 py-1.5"
                          style={{ background: isPar3 ? "#eff6ff" : "#fff" }}>
                          <span className="font-bold" style={{ color: isPar3 ? "#1d4ed8" : GREEN }}>Hole {hole}</span>
                          {doubleTee && (
                            isPar3
                              ? <span className="ml-auto text-[10px] px-1 rounded font-medium bg-blue-100 text-blue-700">A only</span>
                              : <span className="ml-auto text-[10px] px-1 rounded font-medium" style={{ background: "#fef3c7", color: "#92400e" }}>A+B</span>
                          )}
                        </div>
                        {/* Session time rows */}
                        {sessionTimes.map((t, si) => (
                          <div key={si} className="flex items-center gap-1.5 px-2.5 py-1 border-t border-gray-100"
                            style={{ background: si === 0 ? "#f8fdf9" : "#faf5ff" }}>
                            {twoSessions && <SessionBadge label={sessionLabels[si]} color={sessionColors[si]} />}
                            <span className="font-mono text-[10px] text-gray-500">{t}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                  <div className="col-span-3 text-xs text-gray-400 text-center py-1">
                    …and holes {Math.min(6, holes) + 1}–{holes}
                    {par3Excluded && par3Count > 0 && ` (incl. ${[...par3Holes].filter(h => h > 6).length} more par 3s)`}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>)}

        {/* Navigation */}
        <div className="flex items-center justify-between pb-6">
          <button
            onClick={() => setStep(s => Math.max(0, s - 1))}
            className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 bg-white hover:bg-gray-50"
          >
            ← Back
          </button>
          <button
            onClick={() => setStep(s => Math.min(5, s + 1))}
            className="px-5 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: step === 5 ? GOLD : GREEN }}
          >
            {step === 5 ? "Publish Tournament" : step === 4 ? "Next: Review →" : "Next →"}
          </button>
        </div>
      </div>
    </div>
  );
}
