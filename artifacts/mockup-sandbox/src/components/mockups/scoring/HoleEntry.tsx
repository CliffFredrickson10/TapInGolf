import { useState } from "react";

const PRIMARY = "#1a5c38";
const GOLD = "#c8a84b";
const BG = "#0d1f14";
const MUTED = "#6b7280";
const BORDER = "#1f3826";

const HOLES = [
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

const PH = 11;

function getHA(si: number, ph: number) {
  if (ph <= 18) return si <= ph ? 1 : 0;
  return 1 + (si <= ph - 18 ? 1 : 0);
}

function getPoints(gross: number, par: number, si: number, ph: number) {
  const ha = getHA(si, ph);
  return Math.max(0, par + 2 - (gross - ha));
}

function scoreName(gross: number, par: number) {
  const d = gross - par;
  if (d <= -3) return "Albatross 🦅";
  if (d === -2) return "Eagle 🦅";
  if (d === -1) return "Birdie 🐦";
  if (d === 0)  return "Par ✓";
  if (d === 1)  return "Bogey";
  if (d === 2)  return "Double Bogey";
  if (d === 3)  return "Triple Bogey";
  return `+${d}`;
}

function scoreColor(gross: number, par: number) {
  const d = gross - par;
  if (d <= -2) return "#fbbf24";
  if (d === -1) return "#22c55e";
  if (d === 0)  return "#a3e4bc";
  if (d === 1)  return "#fb923c";
  return "#f87171";
}

export default function HoleEntry() {
  const [holeIdx, setHoleIdx] = useState(2);
  const [scores, setScores] = useState<(number | null)[]>(Array(9).fill(null));
  const [gross, setGross] = useState<number | null>(null);

  const hole = HOLES[holeIdx];
  const ha = getHA(hole.si, PH);

  const pts     = gross !== null ? getPoints(gross, hole.par, hole.si, PH) : null;
  const color   = gross !== null ? scoreColor(gross, hole.par) : "#ffffff";
  const label   = gross !== null ? scoreName(gross, hole.par) : null;
  const totalPts = scores.reduce((a, s, i) => a + (s !== null ? getPoints(s, HOLES[i].par, HOLES[i].si, PH) : 0), 0);

  const goToHole = (idx: number) => {
    if (gross !== null) {
      const ns = [...scores];
      ns[holeIdx] = gross;
      setScores(ns);
    }
    setHoleIdx(idx);
    setGross(scores[idx]);
  };

  const decrement = () => setGross(v => v === null ? hole.par + 1 : Math.max(1, v - 1));
  const increment = () => setGross(v => v === null ? hole.par + 1 : Math.min(15, v + 1));

  const confirmAndNext = () => {
    const ns = [...scores];
    ns[holeIdx] = gross;
    setScores(ns);
    if (holeIdx < 8) {
      setHoleIdx(holeIdx + 1);
      setGross(scores[holeIdx + 1]);
    }
  };

  const pickup = () => {
    const ns = [...scores];
    ns[holeIdx] = null;
    setScores(ns);
    if (holeIdx < 8) {
      setHoleIdx(holeIdx + 1);
      setGross(scores[holeIdx + 1]);
    }
  };

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", background: BG, minHeight: "100vh", maxWidth: 390, margin: "0 auto", display: "flex", flexDirection: "column", color: "white", userSelect: "none" }}>

      {/* Status bar */}
      <div style={{ height: 44, display: "flex", alignItems: "flex-end", justifyContent: "space-between", padding: "0 20px 8px", fontSize: 12, fontWeight: 600, opacity: 0.8 }}>
        <span>9:41</span>
        <span style={{ fontSize: 11, color: "#a3e4bc" }}>Soutpansberg · Individual Stableford</span>
        <span>🔋</span>
      </div>

      {/* Hole strip navigator */}
      <div style={{ padding: "0 16px 10px" }}>
        <div style={{ display: "flex", gap: 4 }}>
          {HOLES.map((h, i) => {
            const s = scores[i];
            const active = i === holeIdx;
            const played = s !== null;
            const p = played ? getPoints(s!, h.par, h.si, PH) : null;
            const dotColor = active
              ? "white"
              : played
                ? (p! >= 3 ? "#22c55e" : p! >= 2 ? GOLD : p! === 1 ? "#fb923c" : "#f87171")
                : "#1f3826";
            return (
              <button
                key={i}
                onClick={() => goToHole(i)}
                style={{
                  flex: 1, height: active ? 36 : 28, borderRadius: 8,
                  background: dotColor,
                  border: active ? "2px solid white" : "1px solid #2d4a35",
                  cursor: "pointer", display: "flex", alignItems: "center",
                  justifyContent: "center", transition: "all 0.2s",
                  boxShadow: active ? "0 0 12px rgba(255,255,255,0.3)" : "none",
                }}
              >
                <span style={{ fontSize: active ? 12 : 10, fontWeight: 700, color: active ? "#0d1f14" : played ? "white" : "#4a6550" }}>
                  {h.n}
                </span>
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11, color: "#4a6550" }}>
          <span>Front 9</span>
          <span>{scores.filter(s => s !== null).length} / 9 scored · {totalPts} pts total</span>
        </div>
      </div>

      {/* ═══ HOLE IDENTITY — unmissable ═══ */}
      <div style={{ padding: "8px 20px 0", textAlign: "center" }}>
        {/* Big hole label */}
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: GOLD, marginBottom: 2 }}>
          Now Scoring
        </div>
        <div style={{
          fontSize: 88, fontWeight: 900, lineHeight: 1, letterSpacing: -4,
          background: `linear-gradient(135deg, white 0%, ${GOLD} 100%)`,
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>
          HOLE {hole.n}
        </div>

        {/* Hole stats row */}
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 10, marginBottom: 4 }}>
          {[
            { label: "PAR",     value: hole.par,          accent: true },
            { label: "SI",      value: hole.si,           accent: false },
            { label: "DIST",    value: `${hole.dist}m`,   accent: false },
            { label: "STROKES", value: ha > 0 ? `+${ha}` : "–", accent: ha > 0 },
          ].map(stat => (
            <div key={stat.label} style={{
              flex: 1, padding: "10px 4px", borderRadius: 12,
              background: stat.accent ? `${GOLD}22` : "#162a1e",
              border: `1px solid ${stat.accent ? GOLD + "50" : BORDER}`,
              textAlign: "center",
            }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: stat.accent ? GOLD : "white" }}>{stat.value}</div>
              <div style={{ fontSize: 9, color: "#4a6550", fontWeight: 600, letterSpacing: 0.8, marginTop: 2 }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ═══ SCORE STEPPER ═══ */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "16px 24px" }}>

        {/* Score name badge */}
        <div style={{
          height: 32, marginBottom: 12,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {label && (
            <div style={{
              padding: "6px 20px", borderRadius: 20,
              background: color + "22", border: `1.5px solid ${color}60`,
              fontSize: 14, fontWeight: 700, color,
            }}>
              {label}
            </div>
          )}
        </div>

        {/* The stepper */}
        <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 16 }}>
          {/* Minus */}
          <button
            onClick={decrement}
            style={{
              width: 72, height: 72, borderRadius: "50%",
              background: gross !== null && gross > 1 ? "#1f3826" : "#162019",
              border: `2px solid ${gross !== null && gross > 1 ? "#f87171" : BORDER}`,
              color: gross !== null && gross > 1 ? "#f87171" : "#2d4a35",
              fontSize: 32, fontWeight: 300, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.15s", lineHeight: 1,
            }}
          >
            −
          </button>

          {/* Score display */}
          <div style={{ textAlign: "center", minWidth: 110 }}>
            {gross !== null ? (
              <>
                <div style={{
                  fontSize: 96, fontWeight: 900, lineHeight: 1,
                  color, textShadow: `0 0 40px ${color}60`,
                  transition: "color 0.2s",
                }}>
                  {gross}
                </div>
                <div style={{ fontSize: 12, color: "#4a6550", marginTop: 2 }}>
                  Net: {gross - ha} · {pts}pts
                </div>
              </>
            ) : (
              <div style={{ fontSize: 64, color: "#1f3826", fontWeight: 900, lineHeight: 1 }}>—</div>
            )}
          </div>

          {/* Plus */}
          <button
            onClick={increment}
            style={{
              width: 72, height: 72, borderRadius: "50%",
              background: "#1a4028",
              border: `2px solid ${PRIMARY}`,
              color: "#22c55e",
              fontSize: 32, fontWeight: 300, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.15s", lineHeight: 1,
            }}
          >
            +
          </button>
        </div>

        {/* Par reference row */}
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          {[-1, 0, 1, 2, 3].map(offset => {
            const val = hole.par + offset;
            const isActive = gross === val;
            const c = val < hole.par ? "#22c55e" : val === hole.par ? GOLD : val === hole.par + 1 ? "#fb923c" : "#f87171";
            return (
              <button
                key={offset}
                onClick={() => setGross(val)}
                style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: isActive ? c + "33" : "#162a1e",
                  border: `1.5px solid ${isActive ? c : BORDER}`,
                  color: isActive ? c : "#4a6550",
                  fontSize: 15, fontWeight: 700, cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {val}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {[-1, 0, 1, 2, 3].map(offset => {
            const labels = ["Bir", "Par", "Bog", "Dbl", "+3"];
            return (
              <div key={offset} style={{ width: 44, textAlign: "center", fontSize: 9, color: "#2d4a35", fontWeight: 600 }}>
                {labels[offset + 1]}
              </div>
            );
          })}
        </div>
      </div>

      {/* ═══ ACTION BUTTONS ═══ */}
      <div style={{ padding: "12px 16px 32px", display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Stableford points chip */}
        {pts !== null && (
          <div style={{ display: "flex", justifyContent: "center" }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 8, padding: "8px 20px",
              background: "#162a1e", borderRadius: 20, border: `1px solid ${BORDER}`,
            }}>
              <span style={{ fontSize: 12, color: "#4a6550" }}>Stableford points</span>
              <span style={{ fontSize: 18, fontWeight: 800, color: pts >= 3 ? "#22c55e" : pts === 2 ? GOLD : pts === 1 ? "#fb923c" : "#f87171" }}>
                {pts}
              </span>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={pickup}
            style={{
              flex: 1, padding: "15px 8px", borderRadius: 16,
              background: "#162a1e", border: `1.5px solid ${BORDER}`,
              color: "#4a6550", fontSize: 14, fontWeight: 600, cursor: "pointer",
            }}
          >
            NR / Pickup
          </button>
          <button
            onClick={confirmAndNext}
            disabled={gross === null}
            style={{
              flex: 3, padding: "15px", borderRadius: 16,
              background: gross !== null ? PRIMARY : "#162a1e",
              border: "none",
              color: gross !== null ? "white" : "#2d4a35",
              fontSize: 16, fontWeight: 700, cursor: gross !== null ? "pointer" : "default",
              boxShadow: gross !== null ? `0 4px 20px ${PRIMARY}80` : "none",
              transition: "all 0.2s",
            }}
          >
            {holeIdx < 8 ? `Save · Next Hole →` : "Save · Finish Round 🏁"}
          </button>
        </div>
      </div>
    </div>
  );
}
