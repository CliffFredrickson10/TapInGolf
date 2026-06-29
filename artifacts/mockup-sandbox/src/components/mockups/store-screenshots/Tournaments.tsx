export function Tournaments() {
  const events = [
    { name: "Winter Club Championship", club: "Randpark GC", date: "12–14 Jul", type: "Competition", badge: "Members", badgeColor: "#1a5c38", fee: "R250", format: "Stableford" },
    { name: "Corporate Golf Day", club: "Houghton GC", date: "20 Jul", type: "Corporate", badge: "Open", badgeColor: "#c8a84b", fee: "Free", format: "4-Ball" },
    { name: "Club Knockout 2026", club: "Durban CC", date: "26 Jul", type: "Knockout", badge: "WHS Only", badgeColor: "#7c3aed", fee: "R150", format: "Match Play" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg, #0a2e1a 0%, #1a5c38 55%, #0f4028 100%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 20px 24px", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(200,168,75,0.18)", border: "1px solid rgba(200,168,75,0.35)", borderRadius: 20, padding: "5px 14px", marginBottom: 14 }}>
          <span style={{ fontSize: 13, color: "#c8a84b", fontWeight: 600 }}>🏆 CLUB COMPETITIONS</span>
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: "#fff", lineHeight: 1.15, margin: "0 0 8px", letterSpacing: -0.5 }}>
          Compete at Your Club<br />
          <span style={{ color: "#c8a84b" }}>This Weekend</span>
        </h1>
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", margin: 0 }}>Enter tournaments · Track results · Climb the leaderboard</p>
      </div>

      <div style={{ width: "100%", maxWidth: 340, background: "rgba(255,255,255,0.06)", backdropFilter: "blur(12px)", borderRadius: 28, border: "1px solid rgba(255,255,255,0.12)", overflow: "hidden", boxShadow: "0 32px 80px rgba(0,0,0,0.45)" }}>
        <div style={{ background: "rgba(0,0,0,0.25)", padding: "14px 16px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: "#1a5c38", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🏌</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>My Club Events</div>
            <div style={{ marginLeft: "auto", background: "#c8a84b", borderRadius: 20, padding: "2px 8px" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#000" }}>3 upcoming</span>
            </div>
          </div>
        </div>

        <div style={{ padding: "10px 14px 16px" }}>
          {events.map((e, i) => (
            <div key={i} style={{ borderRadius: 14, background: i === 0 ? "rgba(26,92,56,0.35)" : "rgba(255,255,255,0.04)", border: `1px solid ${i === 0 ? "rgba(26,92,56,0.7)" : "rgba(255,255,255,0.07)"}`, padding: "12px", marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", flex: 1, paddingRight: 8, lineHeight: 1.2 }}>{e.name}</div>
                <div style={{ background: e.badgeColor + "22", border: `1px solid ${e.badgeColor}55`, borderRadius: 6, padding: "2px 7px", flexShrink: 0 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: e.badge === "Open" ? "#c8a84b" : e.badge === "WHS Only" ? "#a78bfa" : "#4ade80" }}>{e.badge}</span>
                </div>
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 6 }}>{e.club} · {e.date}</div>
              <div style={{ display: "flex", gap: 6 }}>
                <span style={{ fontSize: 10, background: "rgba(255,255,255,0.07)", borderRadius: 6, padding: "3px 7px", color: "rgba(255,255,255,0.6)" }}>{e.type}</span>
                <span style={{ fontSize: 10, background: "rgba(255,255,255,0.07)", borderRadius: 6, padding: "3px 7px", color: "rgba(255,255,255,0.6)" }}>{e.format}</span>
                <span style={{ fontSize: 10, background: e.fee === "Free" ? "rgba(74,222,128,0.12)" : "rgba(200,168,75,0.12)", borderRadius: 6, padding: "3px 7px", color: e.fee === "Free" ? "#4ade80" : "#c8a84b", fontWeight: 600, marginLeft: "auto" }}>{e.fee}</span>
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
