export function Discover() {
  const clubs = [
    { name: "Randpark Golf Club", location: "Johannesburg, Gauteng", price: "R450", rating: 4.8, holes: 18, img: "🌳" },
    { name: "Milnerton Golf Club", location: "Cape Town, Western Cape", price: "R380", rating: 4.6, holes: 18, img: "🌊" },
    { name: "Durban Country Club", location: "Durban, KwaZulu-Natal", price: "R520", rating: 4.9, holes: 18, img: "🏖" },
    { name: "Houghton Golf Club", location: "Sandton, Gauteng", price: "R680", rating: 4.7, holes: 18, img: "🏌" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg, #0a2e1a 0%, #1a5c38 55%, #0f4028 100%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 20px 24px", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(200,168,75,0.18)", border: "1px solid rgba(200,168,75,0.35)", borderRadius: 20, padding: "5px 14px", marginBottom: 14 }}>
          <span style={{ fontSize: 13, color: "#c8a84b", fontWeight: 600, letterSpacing: 0.5 }}>⛳ 506 CLUBS ACROSS SOUTH AFRICA</span>
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: "#fff", lineHeight: 1.15, margin: "0 0 8px", letterSpacing: -0.5 }}>
          Discover South Africa's<br />
          <span style={{ color: "#c8a84b" }}>Best Golf Clubs</span>
        </h1>
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", margin: 0, lineHeight: 1.4 }}>Find, compare &amp; book tee times near you</p>
      </div>

      <div style={{ width: "100%", maxWidth: 340, background: "rgba(255,255,255,0.06)", backdropFilter: "blur(12px)", borderRadius: 28, border: "1px solid rgba(255,255,255,0.12)", overflow: "hidden", boxShadow: "0 32px 80px rgba(0,0,0,0.45)" }}>
        <div style={{ background: "rgba(0,0,0,0.25)", padding: "14px 16px 10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.08)", borderRadius: 12, padding: "8px 12px" }}>
            <span style={{ fontSize: 15 }}>🔍</span>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.45)" }}>Search clubs or provinces...</span>
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            {["All", "Gauteng", "Western Cape", "KZN"].map((f, i) => (
              <div key={f} style={{ padding: "4px 10px", borderRadius: 20, background: i === 0 ? "#c8a84b" : "rgba(255,255,255,0.08)", border: i === 0 ? "none" : "1px solid rgba(255,255,255,0.12)" }}>
                <span style={{ fontSize: 11, color: i === 0 ? "#000" : "rgba(255,255,255,0.6)", fontWeight: i === 0 ? 700 : 400 }}>{f}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: "8px 12px 16px" }}>
          {clubs.map((c, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: i < clubs.length - 1 ? "1px solid rgba(255,255,255,0.07)" : "none" }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(135deg, #1a5c38, #0a2e1a)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{c.img}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{c.location}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                  <span style={{ fontSize: 10, color: "#c8a84b", fontWeight: 700 }}>★ {c.rating}</span>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>•</span>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{c.holes} holes</span>
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#c8a84b" }}>{c.price}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>per player</div>
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
