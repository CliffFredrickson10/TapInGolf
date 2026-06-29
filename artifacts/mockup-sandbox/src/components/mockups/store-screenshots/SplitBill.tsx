export function SplitBill() {
  const players = [
    { name: "You", initials: "JS", paid: true, amount: "R480", color: "#1a5c38" },
    { name: "Thabo M.", initials: "TM", paid: true, amount: "R480", color: "#2d6e4a" },
    { name: "Sipho K.", initials: "SK", paid: false, amount: "R480", color: "#7c3aed" },
    { name: "Luca D.", initials: "LD", paid: false, amount: "R480", color: "#d97706" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg, #0a2e1a 0%, #1a5c38 55%, #0f4028 100%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 20px 24px", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(200,168,75,0.18)", border: "1px solid rgba(200,168,75,0.35)", borderRadius: 20, padding: "5px 14px", marginBottom: 14 }}>
          <span style={{ fontSize: 13, color: "#c8a84b", fontWeight: 600 }}>💳 INSTANT EFT &amp; CARD</span>
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: "#fff", lineHeight: 1.15, margin: "0 0 8px", letterSpacing: -0.5 }}>
          Split the Green Fee<br />
          <span style={{ color: "#c8a84b" }}>with Friends</span>
        </h1>
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", margin: 0 }}>Invite friends · Split the cost · Everyone pays their share</p>
      </div>

      <div style={{ width: "100%", maxWidth: 340, background: "rgba(255,255,255,0.06)", backdropFilter: "blur(12px)", borderRadius: 28, border: "1px solid rgba(255,255,255,0.12)", overflow: "hidden", boxShadow: "0 32px 80px rgba(0,0,0,0.45)" }}>
        <div style={{ background: "rgba(0,0,0,0.25)", padding: "16px 16px 14px" }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>Randpark Golf Club · Wed 25 Jun · 07:30</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>Total booking</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#fff" }}>R1,920</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>per player</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#c8a84b" }}>R480</div>
            </div>
          </div>
          <div style={{ marginTop: 12, background: "rgba(255,255,255,0.06)", borderRadius: 8, height: 6, overflow: "hidden" }}>
            <div style={{ width: "50%", height: "100%", background: "linear-gradient(90deg,#c8a84b,#e8c85b)", borderRadius: 8 }} />
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 4 }}>2 of 4 players paid · R960 collected</div>
        </div>

        <div style={{ padding: "12px 14px 16px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: 0.8, marginBottom: 10 }}>PLAYERS</div>
          {players.map((p, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: i < players.length - 1 ? "1px solid rgba(255,255,255,0.07)" : "none" }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: p.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{p.initials}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{p.name}</div>
                <div style={{ fontSize: 11, color: p.paid ? "#4ade80" : "#f87171", marginTop: 1 }}>{p.paid ? "✓ Paid" : "⏳ Pending"}</div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: p.paid ? "#c8a84b" : "rgba(255,255,255,0.5)" }}>{p.amount}</div>
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
