import { useState } from "react";

const PRIMARY = "#1a5c38";
const GOLD = "#c8a84b";
const BG = "#f4f7f5";
const MUTED = "#6b7280";
const BORDER = "#e5e7eb";

const HOLES = [
  { n: 1,  par: 4, si: 7,  gross: 5 },
  { n: 2,  par: 3, si: 15, gross: 3 },
  { n: 3,  par: 5, si: 3,  gross: 6 },
  { n: 4,  par: 4, si: 11, gross: 4 },
  { n: 5,  par: 4, si: 1,  gross: 5 },
  { n: 6,  par: 3, si: 17, gross: 2 },
  { n: 7,  par: 4, si: 5,  gross: 4 },
  { n: 8,  par: 5, si: 9,  gross: 6 },
  { n: 9,  par: 4, si: 13, gross: 5 },
  { n: 10, par: 4, si: 8,  gross: 4 },
  { n: 11, par: 3, si: 16, gross: 3 },
  { n: 12, par: 5, si: 4,  gross: 5 },
  { n: 13, par: 4, si: 12, gross: 4 },
  { n: 14, par: 4, si: 2,  gross: 6 },
  { n: 15, par: 3, si: 18, gross: 3 },
  { n: 16, par: 4, si: 6,  gross: 5 },
  { n: 17, par: 5, si: 10, gross: 6 },
  { n: 18, par: 4, si: 14, gross: 4 },
];
const PH = 11;

function calc(gross: number, par: number, si: number, ph: number) {
  const ha = ph <= 18 ? (si <= ph ? 1 : 0) : 1 + (si <= ph - 18 ? 1 : 0);
  const net = gross - ha;
  const pts = Math.max(0, par + 2 - net);
  return { ha, net, pts };
}

function HoleDot({ gross, par, si, ph }: { gross: number; par: number; si: number; ph: number }) {
  const { pts } = calc(gross, par, si, ph);
  const diff = gross - par;
  let bg = pts >= 3 ? "#22c55e" : pts === 2 ? GOLD : pts === 1 ? "#f97316" : "#ef4444";
  return (
    <div title={`H${si} · ${gross} gross · ${pts} pts`} style={{ width: 26, height: 26, borderRadius: diff <= -1 ? "50%" : diff === 1 ? 4 : diff >= 2 ? 2 : 6, background: bg, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
      {pts}
    </div>
  );
}

export default function RoundComplete() {
  const [saved, setSaved] = useState(false);

  const totalGross = HOLES.reduce((a, h) => a + h.gross, 0);
  const totalPts = HOLES.reduce((a, h) => a + calc(h.gross, h.par, h.si, PH).pts, 0);
  const totalNet = totalGross - PH;
  const parTotal = HOLES.reduce((a, h) => a + h.par, 0);
  const netDiff = totalNet - parTotal;

  const birdies = HOLES.filter(h => h.gross < h.par).length;
  const pars = HOLES.filter(h => h.gross === h.par).length;
  const bogeys = HOLES.filter(h => h.gross === h.par + 1).length;

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", background: BG, minHeight: "100vh", maxWidth: 390, margin: "0 auto" }}>
      {/* Status bar */}
      <div style={{ background: PRIMARY, height: 44, display: "flex", alignItems: "flex-end", justifyContent: "space-between", padding: "0 20px 8px", color: "white", fontSize: 12, fontWeight: 600 }}>
        <span>9:41</span>
        <span>🏆</span>
        <span>⬛</span>
      </div>

      {/* Trophy header */}
      <div style={{ background: `linear-gradient(160deg, ${PRIMARY} 0%, #0a3320 100%)`, padding: "20px 16px 28px", textAlign: "center", color: "white" }}>
        <div style={{ fontSize: 52, marginBottom: 8 }}>🏆</div>
        <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Round Complete!</div>
        <div style={{ fontSize: 14, opacity: 0.8 }}>Soutpansberg Golf Club · 17 Jun 2026</div>
        <div style={{ fontSize: 12, opacity: 0.6 }}>White Tees · Individual Stableford</div>

        {/* Main score */}
        <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 20 }}>
          <div style={{ background: GOLD, borderRadius: 20, padding: "16px 28px", textAlign: "center" }}>
            <div style={{ fontSize: 48, fontWeight: 900, color: "#1a1a1a", lineHeight: 1 }}>{totalPts}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#3a2a00" }}>Stableford Pts</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, justifyContent: "center" }}>
            <div style={{ background: "rgba(255,255,255,0.12)", borderRadius: 12, padding: "10px 16px", textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{totalGross}</div>
              <div style={{ fontSize: 11, opacity: 0.7 }}>Gross</div>
            </div>
            <div style={{ background: "rgba(255,255,255,0.12)", borderRadius: 12, padding: "10px 16px", textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{totalNet} <span style={{ fontSize: 14, opacity: 0.7 }}>({netDiff > 0 ? "+" : ""}{netDiff})</span></div>
              <div style={{ fontSize: 11, opacity: 0.7 }}>Net</div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ padding: "14px 16px 0", display: "flex", gap: 10 }}>
        {[
          { label: "Birdies", value: birdies, color: "#22c55e", icon: "🐦" },
          { label: "Pars", value: pars, color: GOLD, icon: "✓" },
          { label: "Bogeys", value: bogeys, color: "#f97316", icon: "+1" },
          { label: "Others", value: 18 - birdies - pars - bogeys, color: "#ef4444", icon: "↑" },
        ].map(s => (
          <div key={s.label} style={{ flex: 1, background: "white", borderRadius: 12, padding: "12px 6px", textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 11, marginBottom: 4 }}>{s.icon}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Handicap / WHS info */}
      <div style={{ padding: "14px 16px 0" }}>
        <div style={{ background: "white", borderRadius: 16, padding: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{ width: 42, height: 42, background: `${PRIMARY}15`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>📊</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 2 }}>WHS Submission Ready</div>
            <div style={{ fontSize: 12, color: MUTED }}>Net diff: {netDiff > 0 ? "+" : ""}{netDiff} · CH 12 · PH 11 · GolfRSA</div>
          </div>
          <div style={{ fontSize: 20 }}>✅</div>
        </div>
      </div>

      {/* Hole dots */}
      <div style={{ padding: "14px 16px 0" }}>
        <div style={{ background: "white", borderRadius: 16, padding: "14px 14px 12px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.8 }}>Hole Results</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {HOLES.map(h => <HoleDot key={h.n} gross={h.gross} par={h.par} si={h.si} ph={PH} />)}
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
            {[
              { color: "#22c55e", label: "Birdie+" },
              { color: GOLD, label: "Par" },
              { color: "#f97316", label: "Bogey" },
              { color: "#ef4444", label: "Dbl+" },
            ].map(l => (
              <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: l.color }} />
                <span style={{ fontSize: 10, color: MUTED }}>{l.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ padding: "16px 16px 40px", display: "flex", flexDirection: "column", gap: 10 }}>
        <button onClick={() => setSaved(true)} style={{ width: "100%", padding: "16px", borderRadius: 16, background: saved ? "#22c55e" : PRIMARY, border: "none", color: "white", fontSize: 16, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all 0.3s", boxShadow: `0 4px 16px ${PRIMARY}50` }}>
          {saved ? "✅ Saved & Submitted" : "💾 Save & Submit Score"}
        </button>
        <div style={{ display: "flex", gap: 10 }}>
          <button style={{ flex: 1, padding: "14px", borderRadius: 14, background: "white", border: `2px solid ${BORDER}`, color: "#374151", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Share 📤</button>
          <button style={{ flex: 1, padding: "14px", borderRadius: 14, background: "white", border: `2px solid ${BORDER}`, color: "#374151", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Home 🏠</button>
        </div>
      </div>
    </div>
  );
}
