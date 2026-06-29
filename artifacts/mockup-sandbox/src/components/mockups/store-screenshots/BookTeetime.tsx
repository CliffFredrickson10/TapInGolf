export function BookTeetime() {
  const slots = [
    { time: "06:30", spots: 4, price: "R520" },
    { time: "07:00", spots: 2, price: "R520" },
    { time: "07:30", spots: 4, price: "R480" },
    { time: "08:00", spots: 3, price: "R480" },
    { time: "08:30", spots: 4, price: "R450" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg, #0a2e1a 0%, #1a5c38 55%, #0f4028 100%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 20px 24px", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(200,168,75,0.18)", border: "1px solid rgba(200,168,75,0.35)", borderRadius: 20, padding: "5px 14px", marginBottom: 14 }}>
          <span style={{ fontSize: 13, color: "#c8a84b", fontWeight: 600 }}>📅 REAL-TIME AVAILABILITY</span>
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: "#fff", lineHeight: 1.15, margin: "0 0 8px", letterSpacing: -0.5 }}>
          Book Your Tee Time<br />
          <span style={{ color: "#c8a84b" }}>in Seconds</span>
        </h1>
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", margin: 0 }}>Live slots · Instant confirmation · Secure payment</p>
      </div>

      <div style={{ width: "100%", maxWidth: 340, background: "rgba(255,255,255,0.06)", backdropFilter: "blur(12px)", borderRadius: 28, border: "1px solid rgba(255,255,255,0.12)", overflow: "hidden", boxShadow: "0 32px 80px rgba(0,0,0,0.45)" }}>
        <div style={{ background: "rgba(0,0,0,0.25)", padding: "14px 16px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "linear-gradient(135deg,#1a5c38,#0a3d22)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>⛳</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>Randpark Golf Club</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>Johannesburg · 18 holes</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
            {["Mon 23", "Tue 24", "Wed 25", "Thu 26", "Fri 27"].map((d, i) => (
              <div key={d} style={{ flex: 1, padding: "6px 0", borderRadius: 10, background: i === 2 ? "#1a5c38" : "rgba(255,255,255,0.06)", border: i === 2 ? "none" : "1px solid rgba(255,255,255,0.08)", textAlign: "center" }}>
                <div style={{ fontSize: 10, color: i === 2 ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.4)" }}>{d.split(" ")[0]}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: i === 2 ? "#fff" : "rgba(255,255,255,0.6)" }}>{d.split(" ")[1]}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: "10px 14px 16px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: 0.8, marginBottom: 8 }}>AVAILABLE TEE TIMES</div>
          {slots.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", padding: "10px 12px", marginBottom: 6, borderRadius: 12, background: i === 0 ? "rgba(26,92,56,0.5)" : "rgba(255,255,255,0.04)", border: i === 0 ? "1px solid rgba(26,92,56,0.8)" : "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: i === 0 ? "#fff" : "rgba(255,255,255,0.7)", minWidth: 52 }}>{s.time}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: 3 }}>
                  {[...Array(4)].map((_, j) => (
                    <div key={j} style={{ width: 10, height: 10, borderRadius: "50%", background: j < s.spots ? "#c8a84b" : "rgba(255,255,255,0.12)" }} />
                  ))}
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{s.spots} spot{s.spots !== 1 ? "s" : ""} left</div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#c8a84b" }}>{s.price}</div>
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
