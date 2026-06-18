import { useState } from "react";

const PRIMARY = "#1a5c38";
const GOLD = "#c8a84b";
const BG = "#f4f7f5";
const CARD = "#ffffff";
const MUTED = "#6b7280";
const BORDER = "#e5e7eb";

const NINE = [
  { n: 1,  par: 4, si: 7,  dist: 380 },
  { n: 2,  par: 3, si: 15, dist: 168 },
  { n: 3,  par: 5, si: 3,  dist: 512 },
  { n: 4,  par: 4, si: 11, dist: 355 },
  { n: 5,  par: 4, si: 1,  dist: 432 },
  { n: 6,  par: 3, si: 17, dist: 145 },
  { n: 7,  par: 4, si: 5,  dist: 398 },
  { n: 8,  par: 5, si: 9,  dist: 488 },
  { n: 9,  par: 4, si: 13, dist: 362 },
];
const BACK = [
  { n: 10, par: 4, si: 8,  dist: 370 },
  { n: 11, par: 3, si: 16, dist: 155 },
  { n: 12, par: 5, si: 4,  dist: 498 },
  { n: 13, par: 4, si: 12, dist: 345 },
  { n: 14, par: 4, si: 2,  dist: 425 },
  { n: 15, par: 3, si: 18, dist: 140 },
  { n: 16, par: 4, si: 6,  dist: 388 },
  { n: 17, par: 5, si: 10, dist: 475 },
  { n: 18, par: 4, si: 14, dist: 355 },
];

const SCORES_F = [5,3,6,4,5,2,4,6,5];
const SCORES_B = [4,null,5,4,6,3,5,6,4];

const PH = 11;

function calcPoints(gross: number | null, par: number, si: number, ph: number): number {
  if (gross === null) return 0;
  const ha = ph <= 18 ? (si <= ph ? 1 : 0) : (1 + (si <= ph - 18 ? 1 : 0));
  return Math.max(0, par + 2 - (gross - ha));
}

function ScoreCell({ gross, par, si, ph }: { gross: number | null; par: number; si: number; ph: number }) {
  if (gross === null) return <td style={{ padding: "8px 4px", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>—</td>;
  const pts = calcPoints(gross, par, si, ph);
  const diff = gross - par;
  let style: React.CSSProperties = { padding: "6px 4px", textAlign: "center", fontSize: 13, fontWeight: 700, color: "#111827" };
  if (diff <= -2) style = { ...style, background: "#fbbf24", borderRadius: 6, color: "white" };
  else if (diff === -1) style = { ...style, background: "#22c55e", borderRadius: 100, color: "white", width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", margin: "auto" };
  else if (diff === 1) style = { ...style, outline: `2px solid #ef4444`, borderRadius: 4, color: "#ef4444" };
  else if (diff >= 2) style = { ...style, outline: `2px solid #ef4444`, outlineOffset: 2, borderRadius: 2 };
  return (
    <td style={{ padding: "4px 2px", textAlign: "center" }}>
      <div style={style}>{gross}</div>
    </td>
  );
}

function PtsCell({ gross, par, si, ph }: { gross: number | null; par: number; si: number; ph: number }) {
  const pts = calcPoints(gross, par, si, ph);
  const col = pts >= 3 ? "#22c55e" : pts >= 2 ? GOLD : pts === 1 ? "#f97316" : "#ef4444";
  return (
    <td style={{ padding: "8px 4px", textAlign: "center", fontWeight: 700, fontSize: 13, color: gross === null ? MUTED : col }}>
      {gross === null ? "—" : pts}
    </td>
  );
}

export default function ScorecardProgress() {
  const [view, setView] = useState<"front"|"back">("front");
  const holes = view === "front" ? NINE : BACK;
  const scores = view === "front" ? SCORES_F : SCORES_B as (number|null)[];

  const totPar = holes.reduce((a, h) => a + h.par, 0);
  const totGross = scores.reduce((a, s) => a + (s ?? 0), 0);
  const totPts = scores.reduce((a, s, i) => a + calcPoints(s, holes[i].par, holes[i].si, PH), 0);
  const allPts = [...SCORES_F,...(SCORES_B as (number|null)[])].reduce((a,s,i) => a + calcPoints(s, [...NINE,...BACK][i].par, [...NINE,...BACK][i].si, PH), 0);
  const allGross = [...SCORES_F,...(SCORES_B as (number|null)[])].reduce((a,s) => a + (s ?? 0), 0);

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", background: BG, minHeight: "100vh", maxWidth: 390, margin: "0 auto" }}>
      {/* Status bar */}
      <div style={{ background: PRIMARY, height: 44, display: "flex", alignItems: "flex-end", justifyContent: "space-between", padding: "0 20px 8px", color: "white", fontSize: 12, fontWeight: 600 }}>
        <span>9:41</span>
        <span style={{ opacity: 0.8 }}>Soutpansberg</span>
        <span>⬛</span>
      </div>

      {/* Header */}
      <div style={{ background: PRIMARY, padding: "14px 16px 18px", color: "white" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Scorecard</div>
          <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 600 }}>🏌️ Stableford</div>
        </div>
        {/* Summary tiles */}
        <div style={{ display: "flex", gap: 10 }}>
          {[
            { label: "Total Pts", value: allPts, gold: true },
            { label: "Gross", value: allGross },
            { label: "Net", value: allGross - PH },
            { label: "Played", value: "13/18" },
          ].map(t => (
            <div key={t.label} style={{ flex: 1, background: t.gold ? GOLD : "rgba(255,255,255,0.12)", borderRadius: 12, padding: "10px 6px", textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: t.gold ? "#1a1a1a" : "white" }}>{t.value}</div>
              <div style={{ fontSize: 10, color: t.gold ? "#3a2a00" : "rgba(255,255,255,0.7)" }}>{t.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Front/Back toggle */}
      <div style={{ padding: "12px 16px 0" }}>
        <div style={{ display: "flex", background: "white", borderRadius: 12, padding: 3, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
          {(["front","back"] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{ flex: 1, padding: "9px", borderRadius: 10, border: "none", background: view === v ? PRIMARY : "transparent", color: view === v ? "white" : MUTED, fontWeight: 600, fontSize: 14, cursor: "pointer", transition: "all 0.2s" }}>
              {v === "front" ? "Front 9" : "Back 9"}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div style={{ padding: "10px 16px 4px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        {[
          { color: "#fbbf24", label: "Eagle+" },
          { color: "#22c55e", label: "Birdie", round: true },
          { color: "#111827", label: "Par" },
          { outline: "#ef4444", label: "Bogey" },
          { doubleOutline: "#ef4444", label: "Dbl Bogey" },
        ].map(l => (
          <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 14, height: 14, borderRadius: l.round ? "50%" : 2, background: (l as any).color, outline: (l as any).outline ? `2px solid ${(l as any).outline}` : undefined, border: !(l as any).color && !(l as any).doubleOutline ? "1px solid #d1d5db" : undefined }} />
            <span style={{ fontSize: 10, color: MUTED }}>{l.label}</span>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ padding: "8px 16px 100px", overflowX: "auto" }}>
        <div style={{ background: CARD, borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f9fafb" }}>
                {["H","Par","SI","Gross","Net","Pts"].map(h => (
                  <th key={h} style={{ padding: "8px 4px", textAlign: "center", fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase", borderBottom: `1px solid ${BORDER}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {holes.map((h, i) => {
                const s = scores[i];
                const ha = PH <= 18 ? (h.si <= PH ? 1 : 0) : 1 + (h.si <= PH - 18 ? 1 : 0);
                return (
                  <tr key={h.n} style={{ borderBottom: `1px solid ${BORDER}`, background: i % 2 === 0 ? "white" : "#fafafa" }}>
                    <td style={{ padding: "8px 4px", textAlign: "center", fontWeight: 700, fontSize: 13, color: PRIMARY }}>{h.n}</td>
                    <td style={{ padding: "8px 4px", textAlign: "center", fontSize: 13 }}>{h.par}</td>
                    <td style={{ padding: "8px 4px", textAlign: "center", fontSize: 13, color: MUTED }}>{h.si}{ha > 0 ? <span style={{ color: PRIMARY, fontWeight: 700 }}>*</span> : ""}</td>
                    <ScoreCell gross={s ?? null} par={h.par} si={h.si} ph={PH} />
                    <td style={{ padding: "8px 4px", textAlign: "center", fontSize: 13, color: MUTED }}>{s !== null ? s - ha : "—"}</td>
                    <PtsCell gross={s ?? null} par={h.par} si={h.si} ph={PH} />
                  </tr>
                );
              })}
              {/* Totals row */}
              <tr style={{ background: "#f0f7f4", borderTop: `2px solid ${PRIMARY}30` }}>
                <td colSpan={2} style={{ padding: "10px 8px", fontWeight: 700, fontSize: 13, color: PRIMARY }}>Total</td>
                <td style={{ padding: "10px 4px", textAlign: "center", fontSize: 13, color: MUTED }}>{totPar}</td>
                <td style={{ padding: "10px 4px", textAlign: "center", fontWeight: 700, fontSize: 14 }}>{scores.filter(Boolean).length > 0 ? totGross : "—"}</td>
                <td style={{ padding: "10px 4px", textAlign: "center", fontSize: 13, color: MUTED }}></td>
                <td style={{ padding: "10px 4px", textAlign: "center", fontWeight: 800, fontSize: 15, color: PRIMARY }}>{totPts}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Handicap note */}
        <div style={{ marginTop: 10, background: `${GOLD}15`, border: `1px solid ${GOLD}40`, borderRadius: 10, padding: "8px 12px", fontSize: 11, color: "#92400e", display: "flex", gap: 6, alignItems: "center" }}>
          <span>⭐</span> * = Handicap stroke received · Playing handicap: 11 (95% of CH 12)
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: 390, background: "white", borderTop: `1px solid ${BORDER}`, padding: "10px 16px 28px", display: "flex", gap: 10, boxSizing: "border-box" }}>
        <button style={{ flex: 1, padding: "12px", borderRadius: 12, background: "#f3f4f6", border: "none", color: "#374151", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>← Continue</button>
        <button style={{ flex: 2, padding: "12px", borderRadius: 12, background: PRIMARY, border: "none", color: "white", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Finish Round</button>
      </div>
    </div>
  );
}
