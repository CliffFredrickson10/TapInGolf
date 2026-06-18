import { useState } from "react";

const PRIMARY = "#1a5c38";
const GOLD = "#c8a84b";
const BG = "#f4f7f5";
const CARD = "#ffffff";
const MUTED = "#6b7280";
const BORDER = "#e5e7eb";

const TEE_COLORS = [
  { key: "yellow", label: "Yellow", hex: "#F5C518" },
  { key: "white",  label: "White",  hex: "#FFFFFF" },
  { key: "blue",   label: "Blue",   hex: "#3B82F6" },
  { key: "red",    label: "Red",    hex: "#EF4444" },
];

const FORMATS = [
  { key: "stableford", label: "Stableford",     desc: "Points per hole (recommended)" },
  { key: "medal",      label: "Medal",          desc: "Stroke play — lowest total wins" },
  { key: "fourball",   label: "4BBB",           desc: "Best ball of 2 partners" },
  { key: "alliance",   label: "Alliance",       desc: "2–4 scores count per hole" },
  { key: "matchplay",  label: "Match Play",     desc: "Hole-by-hole vs opponent" },
  { key: "sundowner",  label: "Sundowner (9H)", desc: "9-hole evening format" },
];

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
  const [format, setFormat] = useState("stableford");
  const [courseHcp, setCourseHcp] = useState("11");
  const [allowance, setAllowance] = useState(95);
  const [players, setPlayers] = useState(1);
  const [showAllowanceDropdown, setShowAllowanceDropdown] = useState(false);

  const ch = parseInt(courseHcp) || 0;
  const ph = Math.round(ch * (allowance / 100));
  const selectedAllowance = ALLOWANCES.find(a => a.value === allowance)!;

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", background: BG, minHeight: "100vh", maxWidth: 390, margin: "0 auto", position: "relative", overflow: "hidden" }}>
      {/* Status bar */}
      <div style={{ background: PRIMARY, height: 44, display: "flex", alignItems: "flex-end", justifyContent: "space-between", padding: "0 20px 8px", color: "white", fontSize: 12, fontWeight: 600 }}>
        <span>9:41</span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <svg width="16" height="12" viewBox="0 0 16 12" fill="white"><rect x="0" y="3" width="3" height="9" rx="1"/><rect x="4.5" y="2" width="3" height="10" rx="1"/><rect x="9" y="0" width="3" height="12" rx="1"/><rect x="13.5" y="1" width="2.5" height="11" rx="1" opacity=".3"/></svg>
          <span style={{ fontSize: 11 }}>WiFi</span>
          <span>🔋</span>
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
        {/* Club chip */}
        <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, background: GOLD, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>⛳</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Soutpansberg Golf Club</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Louis Trichardt · CR 71.2 · Slope 128</div>
          </div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Change ›</div>
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ padding: "16px 16px 110px", display: "flex", flexDirection: "column", gap: 14 }}>

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

        {/* Format */}
        <div style={{ background: CARD, borderRadius: 16, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12 }}>Game Format</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {FORMATS.map(f => (
              <button key={f.key} onClick={() => setFormat(f.key)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderRadius: 12, border: `2px solid ${format === f.key ? PRIMARY : BORDER}`, background: format === f.key ? "#f0f7f4" : "white", cursor: "pointer", textAlign: "left" }}>
                <div style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${format === f.key ? PRIMARY : "#d1d5db"}`, background: format === f.key ? PRIMARY : "white", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {format === f.key && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "white" }} />}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: format === f.key ? PRIMARY : "#111827" }}>{f.label}</div>
                  <div style={{ fontSize: 12, color: MUTED }}>{f.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Handicap section */}
        <div style={{ background: CARD, borderRadius: 16, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 14 }}>Handicap</div>

          {/* Course Handicap input */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
              Course Handicap
              <span style={{ fontSize: 11, background: "#f3f4f6", color: MUTED, padding: "2px 7px", borderRadius: 20 }}>From HNA app</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#f9fafb", borderRadius: 12, border: `1.5px solid ${BORDER}`, padding: "4px 14px" }}>
              <button onClick={() => setCourseHcp(v => String(Math.max(0, parseInt(v || "0") - 1)))} style={{ width: 32, height: 32, borderRadius: "50%", border: `2px solid ${BORDER}`, background: "white", cursor: "pointer", fontSize: 18, color: PRIMARY, display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
              <input
                value={courseHcp}
                onChange={e => { const v = e.target.value.replace(/\D/g, ""); if (parseInt(v || "0") <= 54) setCourseHcp(v); }}
                style={{ flex: 1, fontSize: 32, fontWeight: 800, color: PRIMARY, border: "none", outline: "none", background: "transparent", textAlign: "center", width: 0 }}
                inputMode="numeric"
              />
              <button onClick={() => setCourseHcp(v => String(Math.min(54, parseInt(v || "0") + 1)))} style={{ width: 32, height: 32, borderRadius: "50%", border: `2px solid ${PRIMARY}`, background: PRIMARY, cursor: "pointer", fontSize: 18, color: "white", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
            </div>
            {/* HNA hint */}
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 7, padding: "8px 12px", background: "#eff6ff", borderRadius: 10, border: "1px solid #bfdbfe" }}>
              <span style={{ fontSize: 16 }}>ℹ️</span>
              <span style={{ fontSize: 12, color: "#1e40af", lineHeight: 1.4 }}>
                Open the <strong>HNA Handicaps app</strong> → Course HCP → select this course &amp; tee to get your Course Handicap.
              </span>
            </div>
          </div>

          {/* HCP Allowance dropdown */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
              Playing HCP Allowance
              <span style={{ fontSize: 11, background: "#fef9ee", color: "#92400e", padding: "2px 7px", borderRadius: 20, border: "1px solid #fde68a" }}>Set by club</span>
            </div>
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setShowAllowanceDropdown(v => !v)}
                style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px", borderRadius: 12, border: `1.5px solid ${showAllowanceDropdown ? PRIMARY : BORDER}`, background: showAllowanceDropdown ? "#f0f7f4" : "#f9fafb", cursor: "pointer", transition: "all 0.15s" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 20, fontWeight: 800, color: PRIMARY }}>{selectedAllowance.label}</span>
                  <span style={{ fontSize: 13, color: MUTED }}>GolfRSA allowance</span>
                </div>
                <span style={{ fontSize: 14, color: MUTED, transform: showAllowanceDropdown ? "rotate(180deg)" : "none", transition: "transform 0.2s", display: "inline-block" }}>▼</span>
              </button>
              {showAllowanceDropdown && (
                <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "white", borderRadius: 14, boxShadow: "0 8px 24px rgba(0,0,0,0.14)", border: `1px solid ${BORDER}`, zIndex: 50, overflow: "hidden" }}>
                  {ALLOWANCES.map((a, i) => (
                    <button
                      key={a.value}
                      onClick={() => { setAllowance(a.value); setShowAllowanceDropdown(false); }}
                      style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px", border: "none", background: allowance === a.value ? "#f0f7f4" : "white", cursor: "pointer", borderBottom: i < ALLOWANCES.length - 1 ? `1px solid ${BORDER}` : "none", textAlign: "left" }}
                    >
                      <span style={{ fontSize: 15, fontWeight: allowance === a.value ? 700 : 500, color: allowance === a.value ? PRIMARY : "#111827" }}>{a.label}</span>
                      {allowance === a.value && <span style={{ color: PRIMARY, fontSize: 16 }}>✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Players (team formats only) */}
        {(format === "fourball" || format === "alliance" || format === "matchplay") && (
          <div style={{ background: CARD, borderRadius: 16, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12 }}>Number of Players</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20 }}>
              <button onClick={() => setPlayers(Math.max(1, players - 1))} style={{ width: 40, height: 40, borderRadius: "50%", border: `2px solid ${BORDER}`, background: "white", cursor: "pointer", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center", color: PRIMARY }}>−</button>
              <span style={{ fontSize: 36, fontWeight: 800, color: PRIMARY, minWidth: 40, textAlign: "center" }}>{players}</span>
              <button onClick={() => setPlayers(Math.min(4, players + 1))} style={{ width: 40, height: 40, borderRadius: "50%", border: `2px solid ${PRIMARY}`, background: PRIMARY, cursor: "pointer", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center", color: "white" }}>+</button>
            </div>
          </div>
        )}

        {/* Playing handicap summary */}
        {ch > 0 && (
          <div style={{ background: `${GOLD}18`, border: `1px solid ${GOLD}50`, borderRadius: 14, padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#92400e" }}>Playing Handicap Summary</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: PRIMARY }}>{ph}</div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {[
                { label: "Course HCP", value: ch },
                { label: "Allowance", value: `${allowance}%` },
                { label: "Playing HCP", value: ph, highlight: true },
              ].map(item => (
                <div key={item.label} style={{ flex: 1, background: item.highlight ? PRIMARY : "rgba(255,255,255,0.6)", borderRadius: 10, padding: "8px 10px", textAlign: "center", minWidth: 70 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: item.highlight ? "white" : "#92400e" }}>{item.value}</div>
                  <div style={{ fontSize: 10, color: item.highlight ? "rgba(255,255,255,0.8)" : "#b45309", marginTop: 1 }}>{item.label}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: "#b45309" }}>
              = Round({ch} × {allowance}%) · GolfRSA official rule
            </div>
          </div>
        )}
      </div>

      {/* Start button */}
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: 390, padding: "12px 16px 32px", background: "linear-gradient(to top, white 65%, transparent)", boxSizing: "border-box" }}>
        <button disabled={!ch} style={{ width: "100%", padding: "16px", borderRadius: 16, background: ch ? PRIMARY : "#d1d5db", border: "none", color: "white", fontSize: 17, fontWeight: 700, cursor: ch ? "pointer" : "default", boxShadow: ch ? `0 4px 16px ${PRIMARY}60` : "none", letterSpacing: 0.3, transition: "all 0.2s" }}>
          ⛳ Start Round
        </button>
      </div>
    </div>
  );
}
