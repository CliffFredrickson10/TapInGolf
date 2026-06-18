import { useState } from "react";

const PRIMARY = "#1a5c38";
const GOLD = "#c8a84b";
const BG = "#0f1a13";
const CARD = "#1a2e20";
const CARD2 = "#243028";
const MUTED = "#9ca3af";
const BORDER = "#2d4a35";

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

function calcPoints(gross: number | null, par: number, si: number, ph: number): number {
  if (gross === null) return 0;
  const ha = ph <= 18 ? (si <= ph ? 1 : 0) : (1 + (si <= ph - 18 ? 1 : 0));
  const net = gross - ha;
  return Math.max(0, par + 2 - net);
}

export default function HoleEntry() {
  const [holeIdx, setHoleIdx] = useState(2);
  const [scores, setScores] = useState<(number | null)[]>(Array(9).fill(null));
  const [input, setInput] = useState("");
  const ph = 11; // 12 * 0.95 rounded
  const hole = HOLES[holeIdx];

  const ha = ph <= 18 ? (hole.si <= ph ? 1 : 0) : (1 + (hole.si <= ph - 18 ? 1 : 0));

  const handleNum = (n: string) => {
    if (n === "⌫") { setInput(prev => prev.slice(0, -1)); return; }
    if (n === "✕") { setInput(""); return; }
    const next = input + n;
    if (parseInt(next) > 12) return;
    setInput(next);
  };

  const handlePickup = () => {
    const newScores = [...scores];
    newScores[holeIdx] = null;
    setScores(newScores);
    setInput("");
    if (holeIdx < 8) setHoleIdx(holeIdx + 1);
  };

  const handleConfirm = () => {
    if (!input) return;
    const newScores = [...scores];
    newScores[holeIdx] = parseInt(input);
    setScores(newScores);
    setInput("");
    if (holeIdx < 8) setHoleIdx(holeIdx + 1);
  };

  const gross = input ? parseInt(input) : scores[holeIdx];
  const pts = gross !== null ? calcPoints(gross, hole.par, hole.si, ph) : null;
  const totalPts = scores.reduce((acc, s, i) => acc + (s !== null ? calcPoints(s, HOLES[i].par, HOLES[i].si, ph) : 0), 0);
  const holesPlayed = scores.filter(s => s !== null).length;

  const ptColor = pts === null ? MUTED : pts >= 3 ? "#22c55e" : pts >= 2 ? GOLD : pts === 1 ? "#f97316" : "#ef4444";

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", background: BG, minHeight: "100vh", maxWidth: 390, margin: "0 auto", display: "flex", flexDirection: "column", color: "white" }}>
      {/* Status bar */}
      <div style={{ background: BG, height: 44, display: "flex", alignItems: "flex-end", justifyContent: "space-between", padding: "0 20px 8px", fontSize: 12, fontWeight: 600 }}>
        <span>9:41</span>
        <span style={{ color: MUTED }}>Soutpansberg · Stableford</span>
        <span>⬛</span>
      </div>

      {/* Hole progress bar */}
      <div style={{ padding: "0 16px 8px" }}>
        <div style={{ display: "flex", gap: 3 }}>
          {HOLES.map((h, i) => {
            const s = scores[i];
            const played = s !== null;
            const active = i === holeIdx;
            const p = played ? calcPoints(s!, h.par, h.si, ph) : null;
            const col = played ? (p! >= 3 ? "#22c55e" : p! >= 2 ? GOLD : p! === 1 ? "#f97316" : "#ef4444") : active ? "white" : BORDER;
            return (
              <button key={i} onClick={() => setHoleIdx(i)} style={{ flex: 1, height: 4, borderRadius: 4, background: col, border: "none", cursor: "pointer", transition: "all 0.2s", transform: active ? "scaleY(2)" : "scaleY(1)" }} />
            );
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11, color: MUTED }}>
          <span>Hole {holeIdx + 1} of 9</span>
          <span>{holesPlayed} played · {totalPts} pts</span>
        </div>
      </div>

      {/* Hole header */}
      <div style={{ padding: "8px 16px 12px", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={() => holeIdx > 0 && setHoleIdx(holeIdx - 1)} style={{ width: 36, height: 36, borderRadius: "50%", background: CARD, border: `1px solid ${BORDER}`, color: "white", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontSize: 42, fontWeight: 800, lineHeight: 1 }}>
            <span style={{ color: GOLD }}>H</span>{hole.n}
          </div>
        </div>
        <button onClick={() => holeIdx < 8 && setHoleIdx(holeIdx + 1)} style={{ width: 36, height: 36, borderRadius: "50%", background: CARD, border: `1px solid ${BORDER}`, color: "white", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
      </div>

      {/* Hole stats */}
      <div style={{ padding: "0 16px 12px", display: "flex", gap: 8 }}>
        {[
          { label: "Par", value: hole.par, highlight: true },
          { label: "SI", value: hole.si },
          { label: "Dist", value: `${hole.dist}m` },
          { label: "+Strokes", value: ha > 0 ? `+${ha}` : "−" },
        ].map(item => (
          <div key={item.label} style={{ flex: 1, background: CARD, borderRadius: 12, padding: "10px 6px", textAlign: "center", border: item.highlight ? `1px solid ${GOLD}40` : `1px solid ${BORDER}` }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: item.highlight ? GOLD : "white" }}>{item.value}</div>
            <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>{item.label}</div>
          </div>
        ))}
      </div>

      {/* Score display */}
      <div style={{ padding: "4px 16px 12px", textAlign: "center" }}>
        <div style={{ background: CARD2, borderRadius: 20, padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", border: `1px solid ${BORDER}` }}>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: 11, color: MUTED, marginBottom: 4 }}>GROSS SCORE</div>
            <div style={{ fontSize: 52, fontWeight: 900, color: input ? "white" : scores[holeIdx] !== null ? "white" : BORDER, lineHeight: 1 }}>
              {input || (scores[holeIdx] !== null ? scores[holeIdx] : "—")}
            </div>
          </div>
          {pts !== null && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: MUTED, marginBottom: 4 }}>POINTS</div>
              <div style={{ fontSize: 52, fontWeight: 900, color: ptColor, lineHeight: 1 }}>{pts}</div>
              <div style={{ fontSize: 11, color: ptColor, marginTop: 2 }}>
                {pts === 0 ? "Scratch" : pts === 1 ? "1 Bogey" : pts === 2 ? "Par" : pts === 3 ? "Birdie" : pts === 4 ? "Eagle" : pts === 5 ? "Albatross" : ""}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Number pad */}
      <div style={{ padding: "0 16px", flex: 1 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {["1","2","3","4","5","6","7","8","9","✕","0","⌫"].map(n => (
            <button key={n} onClick={() => handleNum(n)} style={{ height: 56, borderRadius: 14, background: n === "✕" ? "#2a1a1a" : n === "⌫" ? CARD2 : CARD, border: `1px solid ${BORDER}`, color: n === "✕" ? "#ef4444" : "white", fontSize: 22, fontWeight: 700, cursor: "pointer", transition: "all 0.1s", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {n}
            </button>
          ))}
        </div>

        {/* Action row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10, marginTop: 10 }}>
          <button onClick={handlePickup} style={{ height: 52, borderRadius: 14, background: CARD, border: `1px solid ${BORDER}`, color: MUTED, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            NR / Pickup
          </button>
          <button onClick={handleConfirm} disabled={!input} style={{ height: 52, borderRadius: 14, background: input ? PRIMARY : BORDER, border: "none", color: "white", fontSize: 16, fontWeight: 700, cursor: input ? "pointer" : "default", opacity: input ? 1 : 0.5, boxShadow: input ? `0 4px 12px ${PRIMARY}60` : "none", transition: "all 0.2s" }}>
            ✓ Confirm
          </button>
        </div>
      </div>

      <div style={{ height: 24 }} />
    </div>
  );
}
