import { useState } from "react";

const PRIMARY = "#1a5c38";
const GOLD = "#c8a84b";
const BG = "#f4f7f5";
const CARD = "#ffffff";
const MUTED = "#6b7280";
const BORDER = "#e5e7eb";

type Tournament = { id: string; name: string; date: string; format: string; allowance: number; description: string };

const MOCK_TOURNAMENTS: Tournament[] = [
  { id: "t1", name: "Monthly Medal",       date: "Today · Sat 18 Jun",   format: "net_stroke_play",      allowance: 100, description: "Net Stroke Play · Full handicap" },
  { id: "t2", name: "Club Stableford",     date: "Sat 25 Jun",           format: "individual_stableford", allowance: 95,  description: "Individual Stableford · 95%" },
  { id: "t3", name: "Betterball Classic",  date: "Sun 26 Jun",           format: "fourball_stableford",  allowance: 90,  description: "Betterball Stableford · 90%" },
  { id: "t4", name: "Captain's Day",       date: "Sat 2 Jul",            format: "chairman",             allowance: 100, description: "Chairman (The Perch) · Full handicap" },
];

const TEE_COLORS = [
  { key: "yellow", label: "Yellow", hex: "#F5C518" },
  { key: "white",  label: "White",  hex: "#FFFFFF" },
  { key: "blue",   label: "Blue",   hex: "#3B82F6" },
  { key: "red",    label: "Red",    hex: "#EF4444" },
];

type FormatGroup = { group: string; formats: { key: string; label: string }[] };

const FORMAT_GROUPS: FormatGroup[] = [
  {
    group: "Individual",
    formats: [
      { key: "individual_stableford",  label: "Individual Stableford" },
      { key: "gross_stroke_play",      label: "Gross Stroke Play (Medal)" },
      { key: "net_stroke_play",        label: "Net Stroke Play" },
      { key: "singles_match_play",     label: "Singles Match Play" },
      { key: "individual_par",         label: "Individual Par Competition" },
      { key: "individual_bogey",       label: "Individual Bogey Competition" },
      { key: "modified_stableford",    label: "Modified Stableford" },
      { key: "individual_bonus_bogey", label: "Individual Bonus Bogey" },
      { key: "chairman",               label: "Chairman (The Perch)" },
      { key: "maximum_score",          label: "Maximum Score" },
      { key: "eclectic",               label: "Eclectic (Multi-Round)" },
    ],
  },
  {
    group: "Betterball (2 Players)",
    formats: [
      { key: "fourball_stableford",       label: "Betterball Stableford (4BBB)" },
      { key: "fourball_gross_betterball", label: "Four-Ball Gross Betterball" },
      { key: "fourball_net_betterball",   label: "Four-Ball Net Betterball" },
      { key: "betterball_match_play",     label: "Betterball Match Play" },
      { key: "shamble",                   label: "Shamble" },
      { key: "best_ball_aggregate",       label: "Best Ball Aggregate" },
      { key: "high_low",                  label: "High-Low" },
      { key: "daytona",                   label: "Daytona (Las Vegas)" },
      { key: "low_ball_total",            label: "Low Ball / Total Score" },
      { key: "the_ghost",                 label: "The Ghost" },
      { key: "betterball_bonus_bogey",    label: "Betterball Bonus Bogey" },
      { key: "pinehurst_points",          label: "Multiplication Betterball (Pinehurst)" },
    ],
  },
  {
    group: "Team (3–4 Players)",
    formats: [
      { key: "alliance",         label: "Alliance" },
      { key: "american_scramble", label: "American Scramble" },
    ],
  },
  {
    group: "Other",
    formats: [
      { key: "other", label: "Other / Custom" },
    ],
  },
];

const ALL_FORMATS = FORMAT_GROUPS.flatMap(g => g.formats);

const ALLOWANCES = [
  { value: 100, label: "100%" },
  { value: 95,  label: "95%" },
  { value: 90,  label: "90%" },
  { value: 85,  label: "85%" },
  { value: 75,  label: "75%" },
  { value: 50,  label: "50% (Foursomes)" },
];

export default function StartRound() {
  const [tee, setTee] = useState("white");
  const [format, setFormat] = useState("individual_stableford");
  const [courseHcp, setCourseHcp] = useState("11");
  const [allowance, setAllowance] = useState(95);
  const [players, setPlayers] = useState(1);
  const [showAllowanceDropdown, setShowAllowanceDropdown] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(["Individual"]));
  const [tournamentId, setTournamentId] = useState<string | null>(null);

  const linkedTournament = MOCK_TOURNAMENTS.find(t => t.id === tournamentId) ?? null;

  const linkTournament = (t: Tournament) => {
    setTournamentId(t.id);
    setFormat(t.format);
    setAllowance(t.allowance);
    const grp = FORMAT_GROUPS.find(g => g.formats.some(f => f.key === t.format));
    if (grp) setExpandedGroups(new Set([grp.group]));
  };

  const unlinkTournament = () => setTournamentId(null);

  const ch = parseInt(courseHcp) || 0;
  const ph = Math.round(ch * (allowance / 100));
  const selectedAllowance = ALLOWANCES.find(a => a.value === allowance)!;
  const selectedLabel = ALL_FORMATS.find(f => f.key === format)?.label ?? format;

  const isTeamFormat = ["fourball_stableford","fourball_gross_betterball","fourball_net_betterball",
    "betterball_match_play","shamble","best_ball_aggregate","high_low","daytona","low_ball_total",
    "the_ghost","betterball_bonus_bogey","pinehurst_points","alliance","american_scramble"].includes(format);

  const toggleGroup = (g: string) => setExpandedGroups(prev => {
    const next = new Set(prev);
    next.has(g) ? next.delete(g) : next.add(g);
    return next;
  });

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", background: BG, minHeight: "100vh", maxWidth: 390, margin: "0 auto", position: "relative" }}>
      {/* Status bar */}
      <div style={{ background: PRIMARY, height: 44, display: "flex", alignItems: "flex-end", justifyContent: "space-between", padding: "0 20px 8px", color: "white", fontSize: 12, fontWeight: 600 }}>
        <span>9:41</span>
        <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11 }}>
          <span>▐▐▐</span><span>WiFi</span><span>🔋</span>
        </div>
      </div>

      {/* Header */}
      <div style={{ background: PRIMARY, padding: "12px 20px 20px", color: "white" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <button style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 10, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "white", fontSize: 18 }}>←</button>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>Start Round</div>
            <div style={{ fontSize: 13, opacity: 0.8 }}>Set up your scoring session</div>
          </div>
        </div>
        <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, background: GOLD, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>⛳</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Soutpansberg Golf Club</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Louis Trichardt · CR 71.2 · Slope 128</div>
          </div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Change ›</div>
        </div>
      </div>

      <div style={{ padding: "16px 16px 110px", display: "flex", flexDirection: "column", gap: 14 }}>

        {/* Tournament link */}
        <div style={{ background: CARD, borderRadius: 16, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: 0.8 }}>Club Tournament</div>
            {linkedTournament && (
              <button onClick={unlinkTournament} style={{ fontSize: 11, color: "#ef4444", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 20, padding: "3px 10px", cursor: "pointer", fontWeight: 600 }}>Unlink</button>
            )}
          </div>

          {linkedTournament ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: `${PRIMARY}10`, border: `1.5px solid ${PRIMARY}40`, borderRadius: 14 }}>
              <div style={{ width: 40, height: 40, background: PRIMARY, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>🏆</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: PRIMARY }}>{linkedTournament.name}</div>
                <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{linkedTournament.date}</div>
                <div style={{ fontSize: 11, color: "#16a34a", marginTop: 3, fontWeight: 600 }}>{linkedTournament.description}</div>
              </div>
              <div style={{ fontSize: 18, color: "#16a34a" }}>✓</div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 13, color: MUTED, marginBottom: 10 }}>
                Link your round to an official club competition — the format and allowance will be set automatically.
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {MOCK_TOURNAMENTS.map(t => (
                  <button key={t.id} onClick={() => linkTournament(t)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderRadius: 12, border: `1.5px solid ${BORDER}`, background: "#f9fafb", cursor: "pointer", textAlign: "left" }}>
                    <div style={{ width: 34, height: 34, background: `${GOLD}22`, border: `1px solid ${GOLD}50`, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>🏆</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: "#111827" }}>{t.name}</div>
                      <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{t.description}</div>
                    </div>
                    <div style={{ fontSize: 12, color: MUTED, flexShrink: 0 }}>{t.date.split(" · ")[0]}</div>
                  </button>
                ))}
              </div>
              <button style={{ width: "100%", marginTop: 10, padding: "10px", borderRadius: 12, border: `1.5px dashed ${BORDER}`, background: "transparent", color: MUTED, fontSize: 13, cursor: "pointer" }}>
                ⛳ Playing casually (no tournament)
              </button>
            </div>
          )}
        </div>

        {/* Tee colour */}
        <div style={{ background: CARD, borderRadius: 16, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12 }}>Tee Colour</div>
          <div style={{ display: "flex", gap: 10 }}>
            {TEE_COLORS.map(t => (
              <button key={t.key} onClick={() => setTee(t.key)} style={{ flex: 1, padding: "10px 4px", borderRadius: 12, border: `2px solid ${tee === t.key ? PRIMARY : BORDER}`, background: tee === t.key ? "#f0f7f4" : "white", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: t.hex, border: t.key === "white" ? "2px solid #d1d5db" : "2px solid transparent", boxShadow: "0 2px 4px rgba(0,0,0,0.15)" }} />
                <span style={{ fontSize: 11, fontWeight: tee === t.key ? 700 : 500, color: tee === t.key ? PRIMARY : MUTED }}>{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Game Format — grouped, collapsible */}
        <div style={{ background: CARD, borderRadius: 16, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>Game Format</div>
          {/* Selected format chip */}
          <div style={{ marginBottom: 12, padding: "8px 12px", background: "#f0f7f4", borderRadius: 10, border: `1px solid ${PRIMARY}30`, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13 }}>🏌️</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: PRIMARY }}>{selectedLabel}</span>
          </div>

          {FORMAT_GROUPS.map(g => {
            const isOpen = expandedGroups.has(g.group);
            const groupHasSelected = g.formats.some(f => f.key === format);
            return (
              <div key={g.group} style={{ marginBottom: 6 }}>
                {/* Group header */}
                <button
                  onClick={() => toggleGroup(g.group)}
                  style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", borderRadius: 10, border: `1px solid ${groupHasSelected ? PRIMARY + "40" : BORDER}`, background: groupHasSelected ? "#f0f7f4" : "#f9fafb", cursor: "pointer", marginBottom: isOpen ? 6 : 0 }}
                >
                  <span style={{ fontSize: 13, fontWeight: 700, color: groupHasSelected ? PRIMARY : "#374151" }}>
                    {g.group} {groupHasSelected && <span style={{ fontSize: 11, color: PRIMARY }}>✓</span>}
                  </span>
                  <span style={{ fontSize: 12, color: MUTED, transform: isOpen ? "rotate(180deg)" : "none", display: "inline-block", transition: "transform 0.2s" }}>▼</span>
                </button>

                {/* Format options */}
                {isOpen && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 5, paddingLeft: 8 }}>
                    {g.formats.map(f => (
                      <button
                        key={f.key}
                        onClick={() => setFormat(f.key)}
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, border: `1.5px solid ${format === f.key ? PRIMARY : BORDER}`, background: format === f.key ? "#f0f7f4" : "white", cursor: "pointer", textAlign: "left" }}
                      >
                        <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${format === f.key ? PRIMARY : "#d1d5db"}`, background: format === f.key ? PRIMARY : "white", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          {format === f.key && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "white" }} />}
                        </div>
                        <span style={{ fontSize: 13, fontWeight: format === f.key ? 600 : 400, color: format === f.key ? PRIMARY : "#111827" }}>{f.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Handicap */}
        <div style={{ background: CARD, borderRadius: 16, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 14 }}>Handicap</div>

          {/* Course Handicap */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
              Course Handicap
              <span style={{ fontSize: 11, background: "#f3f4f6", color: MUTED, padding: "2px 7px", borderRadius: 20 }}>From HNA app</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#f9fafb", borderRadius: 12, border: `1.5px solid ${BORDER}`, padding: "4px 14px" }}>
              <button onClick={() => setCourseHcp(v => String(Math.max(0, parseInt(v || "0") - 1)))} style={{ width: 32, height: 32, borderRadius: "50%", border: `2px solid ${BORDER}`, background: "white", cursor: "pointer", fontSize: 18, color: PRIMARY, display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
              <input value={courseHcp} onChange={e => { const v = e.target.value.replace(/\D/g, ""); if (parseInt(v || "0") <= 54) setCourseHcp(v); }} style={{ flex: 1, fontSize: 32, fontWeight: 800, color: PRIMARY, border: "none", outline: "none", background: "transparent", textAlign: "center", width: 0 }} inputMode="numeric" />
              <button onClick={() => setCourseHcp(v => String(Math.min(54, parseInt(v || "0") + 1)))} style={{ width: 32, height: 32, borderRadius: "50%", border: `2px solid ${PRIMARY}`, background: PRIMARY, cursor: "pointer", fontSize: 18, color: "white", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
            </div>
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 7, padding: "8px 12px", background: "#eff6ff", borderRadius: 10, border: "1px solid #bfdbfe" }}>
              <span style={{ fontSize: 15 }}>ℹ️</span>
              <span style={{ fontSize: 12, color: "#1e40af", lineHeight: 1.4 }}>Open the <strong>HNA Handicaps app</strong> → Course HCP → select this course &amp; tee.</span>
            </div>
          </div>

          {/* Allowance dropdown */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
              Playing HCP Allowance
              <span style={{ fontSize: 11, background: "#fef9ee", color: "#92400e", padding: "2px 7px", borderRadius: 20, border: "1px solid #fde68a" }}>Set by club</span>
            </div>
            <div style={{ position: "relative" }}>
              <button onClick={() => setShowAllowanceDropdown(v => !v)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px", borderRadius: 12, border: `1.5px solid ${showAllowanceDropdown ? PRIMARY : BORDER}`, background: showAllowanceDropdown ? "#f0f7f4" : "#f9fafb", cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 20, fontWeight: 800, color: PRIMARY }}>{selectedAllowance.label}</span>
                  <span style={{ fontSize: 13, color: MUTED }}>GolfRSA allowance</span>
                </div>
                <span style={{ fontSize: 12, color: MUTED, transform: showAllowanceDropdown ? "rotate(180deg)" : "none", display: "inline-block", transition: "transform 0.2s" }}>▼</span>
              </button>
              {showAllowanceDropdown && (
                <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "white", borderRadius: 14, boxShadow: "0 8px 24px rgba(0,0,0,0.14)", border: `1px solid ${BORDER}`, zIndex: 50, overflow: "hidden" }}>
                  {ALLOWANCES.map((a, i) => (
                    <button key={a.value} onClick={() => { setAllowance(a.value); setShowAllowanceDropdown(false); }} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px", border: "none", background: allowance === a.value ? "#f0f7f4" : "white", cursor: "pointer", borderBottom: i < ALLOWANCES.length - 1 ? `1px solid ${BORDER}` : "none", textAlign: "left" }}>
                      <span style={{ fontSize: 15, fontWeight: allowance === a.value ? 700 : 500, color: allowance === a.value ? PRIMARY : "#111827" }}>{a.label}</span>
                      {allowance === a.value && <span style={{ color: PRIMARY }}>✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Players (team formats) */}
        {isTeamFormat && (
          <div style={{ background: CARD, borderRadius: 16, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12 }}>Number of Players</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20 }}>
              <button onClick={() => setPlayers(Math.max(2, players - 1))} style={{ width: 40, height: 40, borderRadius: "50%", border: `2px solid ${BORDER}`, background: "white", cursor: "pointer", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center", color: PRIMARY }}>−</button>
              <span style={{ fontSize: 36, fontWeight: 800, color: PRIMARY, minWidth: 40, textAlign: "center" }}>{players}</span>
              <button onClick={() => setPlayers(Math.min(4, players + 1))} style={{ width: 40, height: 40, borderRadius: "50%", border: `2px solid ${PRIMARY}`, background: PRIMARY, cursor: "pointer", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center", color: "white" }}>+</button>
            </div>
          </div>
        )}

        {/* Playing handicap summary */}
        {ch > 0 && (
          <div style={{ background: `${GOLD}18`, border: `1px solid ${GOLD}50`, borderRadius: 14, padding: "14px 16px" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#92400e", marginBottom: 10 }}>Playing Handicap Summary</div>
            <div style={{ display: "flex", gap: 6 }}>
              {[
                { label: "Course HCP", value: ch },
                { label: "Allowance", value: `${allowance}%` },
                { label: "Playing HCP", value: ph, highlight: true },
              ].map(item => (
                <div key={item.label} style={{ flex: 1, background: item.highlight ? PRIMARY : "rgba(255,255,255,0.6)", borderRadius: 10, padding: "8px 6px", textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: item.highlight ? "white" : "#92400e" }}>{item.value}</div>
                  <div style={{ fontSize: 10, color: item.highlight ? "rgba(255,255,255,0.75)" : "#b45309", marginTop: 1 }}>{item.label}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: "#b45309" }}>= Round({ch} × {allowance}%) · GolfRSA official</div>
          </div>
        )}
      </div>

      {/* Start button */}
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: 390, padding: "12px 16px 32px", background: "linear-gradient(to top, white 65%, transparent)", boxSizing: "border-box" }}>
        <button disabled={!ch} style={{ width: "100%", padding: "16px", borderRadius: 16, background: ch ? PRIMARY : "#d1d5db", border: "none", color: "white", fontSize: 17, fontWeight: 700, cursor: ch ? "pointer" : "default", boxShadow: ch ? `0 4px 16px ${PRIMARY}60` : "none", letterSpacing: 0.3 }}>
          ⛳ Start Round
        </button>
      </div>
    </div>
  );
}
