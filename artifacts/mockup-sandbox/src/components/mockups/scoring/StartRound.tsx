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
  { key: "stableford",    label: "Stableford",     desc: "Points per hole (recommended)" },
  { key: "medal",         label: "Medal",          desc: "Stroke play — lowest total wins" },
  { key: "fourball",      label: "4BBB",           desc: "Best ball of 2 partners" },
  { key: "alliance",      label: "Alliance",       desc: "2–4 scores count per hole" },
  { key: "matchplay",     label: "Match Play",     desc: "Hole-by-hole vs opponent" },
  { key: "sundowner",     label: "Sundowner (9H)", desc: "9-hole evening format" },
];

export default function StartRound() {
  const [tee, setTee] = useState("white");
  const [format, setFormat] = useState("stableford");
  const [handicap, setHandicap] = useState("12");
  const [players, setPlayers] = useState(1);

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", background: BG, minHeight: "100vh", maxWidth: 390, margin: "0 auto", position: "relative", overflow: "hidden" }}>
      {/* Status bar */}
      <div style={{ background: PRIMARY, height: 44, display: "flex", alignItems: "flex-end", justifyContent: "space-between", padding: "0 20px 8px", color: "white", fontSize: 12, fontWeight: 600 }}>
        <span>9:41</span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <svg width="16" height="12" viewBox="0 0 16 12" fill="white"><rect x="0" y="3" width="3" height="9" rx="1"/><rect x="4.5" y="2" width="3" height="10" rx="1"/><rect x="9" y="0" width="3" height="12" rx="1"/><rect x="13.5" y="1" width="2.5" height="11" rx="1" opacity=".3"/></svg>
          <svg width="16" height="12" viewBox="0 0 24 24" fill="white"><path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round"/></svg>
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
            <div style={{ fontSize: 12, opacity: 0.8 }}>Louis Trichardt, Limpopo</div>
          </div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Change ›</div>
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ padding: "16px 16px 100px", display: "flex", flexDirection: "column", gap: 14 }}>

        {/* Tee colour */}
        <div style={{ background: CARD, borderRadius: 16, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12 }}>Tee Colour</div>
          <div style={{ display: "flex", gap: 10 }}>
            {TEE_COLORS.map(t => (
              <button key={t.key} onClick={() => setTee(t.key)} style={{ flex: 1, padding: "10px 4px", borderRadius: 12, border: `2px solid ${tee === t.key ? PRIMARY : BORDER}`, background: tee === t.key ? "#f0f7f4" : "white", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, transition: "all 0.15s" }}>
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
              <button key={f.key} onClick={() => setFormat(f.key)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderRadius: 12, border: `2px solid ${format === f.key ? PRIMARY : BORDER}`, background: format === f.key ? "#f0f7f4" : "white", cursor: "pointer", textAlign: "left", transition: "all 0.15s" }}>
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

        {/* Handicap + Players row */}
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1, background: CARD, borderRadius: 16, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>Handicap</div>
            <input value={handicap} onChange={e => setHandicap(e.target.value)} style={{ width: "100%", fontSize: 28, fontWeight: 700, color: PRIMARY, border: "none", outline: "none", background: "transparent", textAlign: "center" }} />
            <div style={{ fontSize: 11, color: MUTED, textAlign: "center" }}>Course Handicap</div>
          </div>
          {(format === "fourball" || format === "alliance" || format === "matchplay") && (
            <div style={{ flex: 1, background: CARD, borderRadius: 16, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>Players</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
                <button onClick={() => setPlayers(Math.max(1, players - 1))} style={{ width: 32, height: 32, borderRadius: "50%", border: `2px solid ${BORDER}`, background: "white", cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", color: PRIMARY }}>−</button>
                <span style={{ fontSize: 28, fontWeight: 700, color: PRIMARY }}>{players}</span>
                <button onClick={() => setPlayers(Math.min(4, players + 1))} style={{ width: 32, height: 32, borderRadius: "50%", border: `2px solid ${PRIMARY}`, background: PRIMARY, cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", color: "white" }}>+</button>
              </div>
            </div>
          )}
        </div>

        {/* Playing handicap info */}
        <div style={{ background: `${GOLD}18`, border: `1px solid ${GOLD}40`, borderRadius: 12, padding: "12px 14px", display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 20 }}>📊</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#92400e" }}>Playing Handicap: {Math.round(parseInt(handicap || "0") * (format === "fourball" ? 0.85 : 0.95))}</div>
            <div style={{ fontSize: 12, color: "#b45309" }}>{format === "fourball" ? "85%" : "95%"} allowance · GolfRSA official</div>
          </div>
        </div>
      </div>

      {/* Start button */}
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: 390, padding: "12px 16px 32px", background: "linear-gradient(to top, white 60%, transparent)", boxSizing: "border-box" }}>
        <button style={{ width: "100%", padding: "16px", borderRadius: 16, background: PRIMARY, border: "none", color: "white", fontSize: 17, fontWeight: 700, cursor: "pointer", boxShadow: `0 4px 16px ${PRIMARY}60`, letterSpacing: 0.3 }}>
          ⛳ Start Round
        </button>
      </div>
    </div>
  );
}
