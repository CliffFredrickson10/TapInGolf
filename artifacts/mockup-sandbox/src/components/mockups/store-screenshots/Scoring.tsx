export function Scoring() {
  const holes = [
    { hole: 1, par: 4, si: 7, score: 5, pts: 3, status: "done" },
    { hole: 2, par: 3, si: 15, score: 3, pts: 2, status: "done" },
    { hole: 3, par: 5, si: 1, score: 6, pts: 3, status: "done" },
    { hole: 4, par: 4, si: 11, score: null, pts: null, status: "current" },
    { hole: 5, par: 4, si: 5, score: null, pts: null, status: "upcoming" },
    { hole: 6, par: 4, si: 3, score: null, pts: null, status: "upcoming" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg, #0a2e1a 0%, #1a5c38 55%, #0f4028 100%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 20px 24px", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(200,168,75,0.18)", border: "1px solid rgba(200,168,75,0.35)", borderRadius: 20, padding: "5px 14px", marginBottom: 14 }}>
          <span style={{ fontSize: 13, color: "#c8a84b", fontWeight: 600 }}>📊 LIVE SCORING</span>
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: "#fff", lineHeight: 1.15, margin: "0 0 8px", letterSpacing: -0.5 }}>
          Keep Score<br />
          <span style={{ color: "#c8a84b" }}>on the Course</span>
        </h1>
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", margin: 0 }}>Stroke play · Stableford · Match play · Betterball</p>
      </div>

      <div style={{ width: "100%", maxWidth: 340, background: "rgba(255,255,255,0.06)", backdropFilter: "blur(12px)", borderRadius: 28, border: "1px solid rgba(255,255,255,0.12)", overflow: "hidden", boxShadow: "0 32px 80px rgba(0,0,0,0.45)" }}>
        <div style={{ background: "rgba(0,0,0,0.25)", padding: "14px 16px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>Randpark GC — Round 1</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>Stableford · HCP 14</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>Total pts</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#c8a84b" }}>8</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {holes.map((h) => (
              <div key={h.hole} style={{ flex: 1, height: 4, borderRadius: 4, background: h.status === "done" ? "#c8a84b" : h.status === "current" ? "rgba(200,168,75,0.4)" : "rgba(255,255,255,0.12)" }} />
            ))}
          </div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>Hole 4 of 18</div>
        </div>

        <div style={{ padding: "10px 14px 16px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "32px 40px 40px 50px 50px", gap: 0, marginBottom: 6 }}>
            {["Hole", "Par", "SI", "Score", "Pts"].map(h => (
              <div key={h} style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", fontWeight: 700, textAlign: "center", letterSpacing: 0.5 }}>{h}</div>
            ))}
          </div>
          {holes.map((h, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "32px 40px 40px 50px 50px", gap: 0, padding: "7px 0", borderBottom: i < holes.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none", background: h.status === "current" ? "rgba(200,168,75,0.06)" : "transparent", margin: "0 -14px", padding: "7px 14px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: h.status === "current" ? "#c8a84b" : "rgba(255,255,255,0.7)", textAlign: "center" }}>{h.hole}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", textAlign: "center" }}>{h.par}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", textAlign: "center" }}>{h.si}</div>
              <div style={{ textAlign: "center" }}>
                {h.score !== null ? (
                  <span style={{ fontSize: 13, fontWeight: 700, color: h.score > h.par ? "#f87171" : h.score === h.par ? "#fff" : "#4ade80" }}>{h.score}</span>
                ) : (
                  h.status === "current" ? <span style={{ fontSize: 11, color: "rgba(200,168,75,0.7)" }}>—</span> : <span style={{ fontSize: 11, color: "rgba(255,255,255,0.15)" }}>·</span>
                )}
              </div>
              <div style={{ textAlign: "center" }}>
                {h.pts !== null ? (
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#c8a84b" }}>{h.pts}</span>
                ) : (
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.15)" }}>·</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 22 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#c8a84b" }} />
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>tapin.golf</span>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#c8a84b" }} />
      </div>
    </div>
  );
}
