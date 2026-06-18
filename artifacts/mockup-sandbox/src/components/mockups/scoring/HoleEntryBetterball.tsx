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

const PLAYERS = [
  { name: "Dean Smit",  initials: "DS", ch: 11, color: "#3b82f6" },
  { name: "Grant Lee",  initials: "GL", ch: 8,  color: "#a855f7" },
];

function getHA(si: number, ph: number) {
  if (ph <= 18) return si <= ph ? 1 : 0;
  return 1 + (si <= ph - 18 ? 1 : 0);
}

function getPoints(gross: number, par: number, ha: number) {
  return Math.max(0, par + 2 - (gross - ha));
}

function scoreName(gross: number, par: number) {
  const d = gross - par;
  if (d <= -2) return "Eagle 🦅";
  if (d === -1) return "Birdie 🐦";
  if (d === 0)  return "Par ✓";
  if (d === 1)  return "Bogey";
  if (d === 2)  return "Double";
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

export default function HoleEntryBetterball() {
  const [holeIdx, setHoleIdx] = useState(2);
  const [grossScores, setGrossScores] = useState<(number | null)[][]>(
    PLAYERS.map(() => Array(9).fill(null))
  );

  const hole = HOLES[holeIdx];
  const [g0, setG0] = useState<number | null>(null);
  const [g1, setG1] = useState<number | null>(null);

  const ph0 = Math.round(PLAYERS[0].ch * 0.90);
  const ph1 = Math.round(PLAYERS[1].ch * 0.90);
  const ha0 = getHA(hole.si, ph0);
  const ha1 = getHA(hole.si, ph1);

  const pts0 = g0 !== null ? getPoints(g0, hole.par, ha0) : null;
  const pts1 = g1 !== null ? getPoints(g1, hole.par, ha1) : null;

  const bbPts = pts0 !== null && pts1 !== null
    ? Math.max(pts0, pts1)
    : pts0 ?? pts1 ?? null;

  const bbWinner = pts0 !== null && pts1 !== null
    ? pts0 >= pts1 ? 0 : 1
    : pts0 !== null ? 0 : pts1 !== null ? 1 : null;

  // Running betterball totals
  const runningTotal = HOLES.slice(0, holeIdx).reduce((sum, h, i) => {
    const s0 = grossScores[0][i];
    const s1 = grossScores[1][i];
    const p0 = s0 !== null ? getPoints(s0, h.par, getHA(h.si, ph0)) : null;
    const p1 = s1 !== null ? getPoints(s1, h.par, getHA(h.si, ph1)) : null;
    return sum + (p0 !== null && p1 !== null ? Math.max(p0, p1) : p0 ?? p1 ?? 0);
  }, 0);

  const confirmAndNext = () => {
    const ns0 = [...grossScores[0]]; ns0[holeIdx] = g0;
    const ns1 = [...grossScores[1]]; ns1[holeIdx] = g1;
    setGrossScores([ns0, ns1]);
    if (holeIdx < 8) {
      setHoleIdx(holeIdx + 1);
      setG0(grossScores[0][holeIdx + 1]);
      setG1(grossScores[1][holeIdx + 1]);
    }
  };

  const PlayerRow = ({
    player, gross, setGross, ha, pts, isWinner, idx
  }: {
    player: typeof PLAYERS[0]; gross: number | null; setGross: (v: number | null) => void;
    ha: number; pts: number | null; isWinner: boolean; idx: number;
  }) => (
    <div style={{
      background: isWinner && pts !== null ? `${player.color}14` : "#162a1e",
      border: `1.5px solid ${isWinner && pts !== null ? player.color + "50" : BORDER}`,
      borderRadius: 16, padding: "14px 16px",
      transition: "all 0.2s",
    }}>
      {/* Player header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: player.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: "white", flexShrink: 0 }}>
            {player.initials}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "white" }}>{player.name}</div>
            <div style={{ fontSize: 11, color: "#4a6550" }}>CH {player.ch} · PH {idx === 0 ? ph0 : ph1} · {ha > 0 ? `+${ha} stroke` : "no stroke"} this hole</div>
          </div>
        </div>
        {isWinner && pts !== null && (
          <div style={{ background: GOLD + "22", border: `1px solid ${GOLD}50`, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 700, color: GOLD }}>
            Best Ball ⭐
          </div>
        )}
      </div>

      {/* Score stepper */}
      <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
        {/* Minus */}
        <button
          onClick={() => setGross(gross === null ? hole.par + 1 : Math.max(1, gross - 1))}
          style={{ width: 44, height: 44, borderRadius: "50%", border: `1.5px solid ${gross !== null && gross > 1 ? "#f87171" : BORDER}`, background: "transparent", color: gross !== null && gross > 1 ? "#f87171" : "#2d4a35", fontSize: 22, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
        >−</button>

        {/* Score + label */}
        <div style={{ flex: 1, textAlign: "center" }}>
          {gross !== null ? (
            <>
              <div style={{ fontSize: 52, fontWeight: 900, lineHeight: 1, color: scoreColor(gross, hole.par), textShadow: `0 0 20px ${scoreColor(gross, hole.par)}50`, transition: "color 0.2s" }}>
                {gross}
              </div>
              <div style={{ fontSize: 11, color: "#4a6550", marginTop: 1 }}>
                {scoreName(gross, hole.par)} · net {gross - ha} · <span style={{ color: pts! >= 3 ? "#22c55e" : pts! >= 2 ? GOLD : pts! === 1 ? "#fb923c" : "#f87171", fontWeight: 700 }}>{pts}pts</span>
              </div>
            </>
          ) : (
            <div style={{ fontSize: 40, color: "#1f3826", fontWeight: 900, lineHeight: "52px" }}>—</div>
          )}
        </div>

        {/* Plus */}
        <button
          onClick={() => setGross(gross === null ? hole.par + 1 : Math.min(15, gross + 1))}
          style={{ width: 44, height: 44, borderRadius: "50%", border: `1.5px solid ${PRIMARY}`, background: "#1a4028", color: "#22c55e", fontSize: 22, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
        >+</button>
      </div>

      {/* Quick-tap row */}
      <div style={{ display: "flex", gap: 5, marginTop: 10, justifyContent: "center" }}>
        {[-1, 0, 1, 2, 3].map(offset => {
          const val = hole.par + offset;
          const isActive = gross === val;
          const c = val < hole.par ? "#22c55e" : val === hole.par ? GOLD : val === hole.par + 1 ? "#fb923c" : "#f87171";
          return (
            <button key={offset} onClick={() => setGross(val)} style={{ width: 38, height: 38, borderRadius: 10, background: isActive ? c + "33" : "#0d1f14", border: `1.5px solid ${isActive ? c : BORDER}`, color: isActive ? c : "#2d4a35", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              {val}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", background: BG, minHeight: "100vh", maxWidth: 390, margin: "0 auto", display: "flex", flexDirection: "column", color: "white" }}>

      {/* Status bar */}
      <div style={{ height: 44, display: "flex", alignItems: "flex-end", justifyContent: "space-between", padding: "0 20px 8px", fontSize: 12, fontWeight: 600, opacity: 0.8 }}>
        <span>9:41</span>
        <span style={{ fontSize: 11, color: "#a3e4bc" }}>Betterball Stableford · 90%</span>
        <span>🔋</span>
      </div>

      {/* Hole strip */}
      <div style={{ padding: "0 16px 10px" }}>
        <div style={{ display: "flex", gap: 4 }}>
          {HOLES.map((h, i) => {
            const active = i === holeIdx;
            const s0 = grossScores[0][i];
            const s1 = grossScores[1][i];
            const p0 = s0 !== null ? getPoints(s0, h.par, getHA(h.si, ph0)) : null;
            const p1 = s1 !== null ? getPoints(s1, h.par, getHA(h.si, ph1)) : null;
            const played = p0 !== null || p1 !== null;
            const best = p0 !== null && p1 !== null ? Math.max(p0, p1) : p0 ?? p1;
            const dotColor = active ? "white" : played ? (best! >= 3 ? "#22c55e" : best! >= 2 ? GOLD : best! === 1 ? "#fb923c" : "#f87171") : "#1f3826";
            return (
              <button key={i} onClick={() => { setHoleIdx(i); setG0(grossScores[0][i]); setG1(grossScores[1][i]); }} style={{ flex: 1, height: active ? 36 : 28, borderRadius: 8, background: dotColor, border: active ? "2px solid white" : "1px solid #2d4a35", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: active ? 12 : 10, fontWeight: 700, color: active ? "#0d1f14" : played ? "white" : "#4a6550" }}>{h.n}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Hole identity */}
      <div style={{ padding: "4px 20px 8px", textAlign: "center" }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: GOLD, marginBottom: 0 }}>Now Scoring</div>
        <div style={{ fontSize: 72, fontWeight: 900, lineHeight: 1, letterSpacing: -3, background: `linear-gradient(135deg, white 0%, ${GOLD} 100%)`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          HOLE {hole.n}
        </div>
        {/* Stats row */}
        <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 6 }}>
          {[
            { label: "PAR", value: hole.par, accent: true },
            { label: "SI",  value: hole.si,  accent: false },
            { label: "DIST", value: `${hole.dist}m`, accent: false },
          ].map(stat => (
            <div key={stat.label} style={{ flex: 1, padding: "8px 4px", borderRadius: 10, background: stat.accent ? `${GOLD}22` : "#162a1e", border: `1px solid ${stat.accent ? GOLD + "50" : BORDER}`, textAlign: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: stat.accent ? GOLD : "white" }}>{stat.value}</div>
              <div style={{ fontSize: 9, color: "#4a6550", fontWeight: 600, letterSpacing: 0.8 }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Player score entries */}
      <div style={{ padding: "0 12px", display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
        <PlayerRow player={PLAYERS[0]} gross={g0} setGross={setG0} ha={ha0} pts={pts0} isWinner={bbWinner === 0} idx={0} />
        <PlayerRow player={PLAYERS[1]} gross={g1} setGross={setG1} ha={ha1} pts={pts1} isWinner={bbWinner === 1} idx={1} />
      </div>

      {/* Betterball result + actions */}
      <div style={{ padding: "12px 12px 32px", display: "flex", flexDirection: "column", gap: 10 }}>
        {/* BB points banner */}
        {bbPts !== null && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", background: "#162a1e", borderRadius: 14, border: `1px solid ${BORDER}` }}>
            <div>
              <div style={{ fontSize: 11, color: "#4a6550", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8 }}>Betterball Score</div>
              <div style={{ fontSize: 12, color: "#4a6550", marginTop: 2 }}>Running total: {runningTotal + (bbPts ?? 0)} pts</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 36, fontWeight: 900, color: bbPts >= 3 ? "#22c55e" : bbPts >= 2 ? GOLD : bbPts === 1 ? "#fb923c" : "#f87171", lineHeight: 1 }}>{bbPts}</div>
              <div style={{ fontSize: 11, color: "#4a6550" }}>pts this hole</div>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button style={{ flex: 1, padding: "15px 8px", borderRadius: 16, background: "#162a1e", border: `1.5px solid ${BORDER}`, color: "#4a6550", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            NR / Pickup
          </button>
          <button
            onClick={confirmAndNext}
            disabled={g0 === null && g1 === null}
            style={{ flex: 3, padding: "15px", borderRadius: 16, background: (g0 !== null || g1 !== null) ? PRIMARY : "#162a1e", border: "none", color: (g0 !== null || g1 !== null) ? "white" : "#2d4a35", fontSize: 15, fontWeight: 700, cursor: (g0 !== null || g1 !== null) ? "pointer" : "default", boxShadow: (g0 !== null || g1 !== null) ? `0 4px 20px ${PRIMARY}80` : "none" }}
          >
            {holeIdx < 8 ? "Save · Next Hole →" : "Save · Finish Round 🏁"}
          </button>
        </div>
      </div>
    </div>
  );
}
