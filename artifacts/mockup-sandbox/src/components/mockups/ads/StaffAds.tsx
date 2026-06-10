import { useState } from "react";

const GREEN = "#1a5c38";
const GREEN_LIGHT = "#e8f5ee";
const GOLD = "#c8a84b";
const GOLD_LIGHT = "#fdf8ec";
const RED = "#dc2626";

const STATUS_META: Record<string, { bg: string; text: string; label: string; next?: string; nextLabel?: string }> = {
  pending_review:  { bg: "#fef3c7", text: "#92400e", label: "Pending Review",  next: "approved",        nextLabel: "Approve & Send Quote" },
  approved:        { bg: "#dbeafe", text: "#1e40af", label: "Approved",         next: "payment_pending", nextLabel: "Mark Payment Requested" },
  payment_pending: { bg: "#fde8d8", text: "#c2410c", label: "Payment Pending",  next: "live",            nextLabel: "Confirm Payment & Publish" },
  live:            { bg: "#dcfce7", text: "#166534", label: "Live" },
  expired:         { bg: "#f3f4f6", text: "#6b7280", label: "Expired" },
  rejected:        { bg: "#fee2e2", text: "#991b1b", label: "Rejected" },
};

const AD_TYPE_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  club_detail:   { label: "Club Detail Page",       color: GREEN, icon: "🏌️" },
  featured_home: { label: "Home Screen Featured",   color: GOLD,  icon: "⭐" },
  explore:       { label: "Explore Spotlight",      color: "#0891b2", icon: "🔍" },
  push:          { label: "Push Notification",      color: "#7c3aed", icon: "📲" },
  tournament:    { label: "Tournament Sponsor",     color: "#c2410c", icon: "🏆" },
};

interface AdRequest {
  id: number;
  club: string;
  province: string;
  type: string;
  package: string;
  headline: string;
  subtitle: string;
  status: string;
  submitted: string;
  startDate: string;
  endDate: string;
  slot: string;
  quotedPrice: number | null;
  notes: string;
  imageUrl: string;
}

const MOCK_REQUESTS: AdRequest[] = [
  { id: 1, club: "Durban Country Club", province: "KZN", type: "featured_home", package: "Gold Spot", headline: "Heritage & Excellence Since 1922", subtitle: "Membership enquiries open", status: "pending_review", submitted: "9 Jun 2026", startDate: "1 Jul 2026", endDate: "31 Jul 2026", slot: "15 sec / rotation", quotedPrice: null, notes: "Prefer Saturday morning peak hours if possible", imageUrl: "" },
  { id: 2, club: "Houghton Golf Club", province: "Gauteng", type: "club_detail", package: "Quarterly Pro", headline: "Host Your Corporate Golf Day", subtitle: "Full packages from R 4 500/group", status: "approved", submitted: "7 Jun 2026", startDate: "15 Jun 2026", endDate: "14 Sep 2026", slot: "15 sec", quotedPrice: 1199, notes: "", imageUrl: "" },
  { id: 3, club: "Fancourt Estate", province: "Western Cape", type: "featured_home", package: "Silver Spot", headline: "Garden Route's Premier Golf Estate", subtitle: "3 Championship Courses · Stay & Play", status: "payment_pending", submitted: "3 Jun 2026", startDate: "1 Jul 2026", endDate: "31 Aug 2026", slot: "10 sec / rotation", quotedPrice: 699, notes: "", imageUrl: "" },
  { id: 4, club: "Royal Johannesburg", province: "Gauteng", type: "explore", package: "Explore Spotlight", headline: "Two World-Class Courses, One Club", subtitle: "Book East or West course online", status: "live", submitted: "25 May 2026", startDate: "1 Jun 2026", endDate: "30 Jun 2026", slot: "Pinned top", quotedPrice: 399, notes: "", imageUrl: "" },
  { id: 5, club: "Pearl Valley Golf", province: "Western Cape", type: "club_detail", package: "Monthly Starter", headline: "Summer Twilight Specials", subtitle: "R 350 green fee after 15:00", status: "expired", submitted: "1 May 2026", startDate: "1 May 2026", endDate: "31 May 2026", slot: "10 sec", quotedPrice: 499, notes: "", imageUrl: "" },
  { id: 6, club: "Zebula Golf Estate", province: "Limpopo", type: "push", package: "Push Blast", headline: "Weekend Getaway — 2 Nights + 2 Rounds", subtitle: "Limited slots available this weekend", status: "pending_review", submitted: "10 Jun 2026", startDate: "13 Jun 2026", endDate: "13 Jun 2026", slot: "1 blast", quotedPrice: null, notes: "Target golfers within 200 km of Bela-Bela", imageUrl: "" },
];

const STATS = [
  { label: "Pending Review",  value: 2, color: "#fef3c7", text: "#92400e", icon: "🔔" },
  { label: "Live Now",        value: 1, color: "#dcfce7", text: "#166534", icon: "🟢" },
  { label: "Payment Pending", value: 1, color: "#fde8d8", text: "#c2410c", icon: "💳" },
  { label: "Revenue This Mo", value: "R 2 297", color: GREEN_LIGHT, text: GREEN, icon: "💰" },
];

type Tab = "queue" | "all" | "live" | "analytics";

export default function StaffAds() {
  const [tab, setTab] = useState<Tab>("queue");
  const [selected, setSelected] = useState<AdRequest | null>(MOCK_REQUESTS[0]);
  const [price, setPrice] = useState("");
  const [scheduleStart, setScheduleStart] = useState("");
  const [scheduleEnd, setScheduleEnd] = useState("");
  const [slotDuration, setSlotDuration] = useState("");
  const [staffNote, setStaffNote] = useState("");
  const [listFilter, setListFilter] = useState("all");

  const filtered = MOCK_REQUESTS.filter(r => {
    if (tab === "queue") return r.status === "pending_review";
    if (tab === "live")  return r.status === "live";
    if (listFilter !== "all") return r.status === listFilter;
    return true;
  });

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", background: "#f9fafb", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ background: "#111827", padding: "12px 28px", display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ color: GOLD, fontWeight: 800, fontSize: 18 }}>TapIn Golf</span>
        <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 14, marginLeft: 4 }}>›</span>
        <span style={{ color: "white", fontSize: 14 }}>Staff Portal</span>
        <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 14 }}>›</span>
        <span style={{ color: "white", fontSize: 14 }}>Ad Management</span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e" }} />
          <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 13 }}>Staff: admin@tapingolf.co.za</span>
        </div>
      </div>

      <div style={{ padding: "24px 28px 0", flex: 1, display: "flex", flexDirection: "column" }}>
        {/* Page title + stats */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: "#111827", margin: 0 }}>Ad Management</h1>
            <p style={{ color: "#6b7280", margin: "4px 0 0", fontSize: 14 }}>Review club ad requests, set pricing, and publish approved campaigns.</p>
          </div>
          <button style={{ background: GREEN, color: "white", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            + Create Ad for Club
          </button>
        </div>

        {/* Stat cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
          {STATS.map((s, i) => (
            <div key={i} style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 10, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: s.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{s.icon}</div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: s.text }}>{s.value}</div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 2, borderBottom: "2px solid #e5e7eb", marginBottom: 0 }}>
          {([["queue", "🔔 Review Queue (2)"], ["all", "All Requests"], ["live", "🟢 Live Campaigns"], ["analytics", "Analytics"]] as [Tab, string][]).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{
              padding: "8px 16px", border: "none", background: "none", cursor: "pointer",
              fontSize: 13, fontWeight: 600, color: tab === id ? GREEN : "#6b7280",
              borderBottom: tab === id ? `2px solid ${GREEN}` : "2px solid transparent",
              marginBottom: -2
            }}>{label}</button>
          ))}
          {tab === "all" && (
            <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center", paddingBottom: 6 }}>
              {["all","pending_review","approved","payment_pending","live","expired"].map(s => (
                <button key={s} onClick={() => setListFilter(s)} style={{
                  fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, border: "1px solid",
                  borderColor: listFilter === s ? GREEN : "#e5e7eb",
                  background: listFilter === s ? GREEN_LIGHT : "white",
                  color: listFilter === s ? GREEN : "#6b7280", cursor: "pointer"
                }}>{s === "all" ? "All" : STATUS_META[s]?.label}</button>
              ))}
            </div>
          )}
        </div>

        {/* Split pane: list + detail */}
        {tab !== "analytics" ? (
          <div style={{ display: "flex", flex: 1, gap: 0, background: "white", border: "1px solid #e5e7eb", borderTop: "none", borderRadius: "0 0 12px 12px", overflow: "hidden", minHeight: 480 }}>
            {/* Left: list */}
            <div style={{ width: 340, borderRight: "1px solid #e5e7eb", overflowY: "auto", flexShrink: 0 }}>
              {filtered.length === 0 && (
                <div style={{ padding: 24, color: "#9ca3af", fontSize: 13, textAlign: "center" }}>No requests in this view.</div>
              )}
              {filtered.map(req => {
                const st = STATUS_META[req.status];
                const tp = AD_TYPE_LABELS[req.type];
                const isSelected = selected?.id === req.id;
                return (
                  <div key={req.id} onClick={() => setSelected(req)} style={{
                    padding: "14px 16px", borderBottom: "1px solid #f3f4f6", cursor: "pointer",
                    background: isSelected ? GREEN_LIGHT : "white",
                    borderLeft: isSelected ? `3px solid ${GREEN}` : "3px solid transparent",
                    transition: "background 0.1s"
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: "#111827" }}>{req.club}</div>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20, background: st.bg, color: st.text, whiteSpace: "nowrap" }}>{st.label}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>{req.headline}</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 7px", borderRadius: 20, background: tp.color + "18", color: tp.color }}>{tp.icon} {tp.label}</span>
                      <span style={{ fontSize: 10, color: "#9ca3af" }}>{req.submitted}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right: detail panel */}
            {selected ? (
              <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
                <DetailPanel
                  req={selected}
                  price={price} setPrice={setPrice}
                  scheduleStart={scheduleStart} setScheduleStart={setScheduleStart}
                  scheduleEnd={scheduleEnd} setScheduleEnd={setScheduleEnd}
                  slotDuration={slotDuration} setSlotDuration={setSlotDuration}
                  staffNote={staffNote} setStaffNote={setStaffNote}
                />
              </div>
            ) : (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 14 }}>Select a request to review</div>
            )}
          </div>
        ) : (
          <AnalyticsTab />
        )}
      </div>
    </div>
  );
}

function DetailPanel({ req, price, setPrice, scheduleStart, setScheduleStart, scheduleEnd, setScheduleEnd, slotDuration, setSlotDuration, staffNote, setStaffNote }: {
  req: AdRequest;
  price: string; setPrice: (v: string) => void;
  scheduleStart: string; setScheduleStart: (v: string) => void;
  scheduleEnd: string; setScheduleEnd: (v: string) => void;
  slotDuration: string; setSlotDuration: (v: string) => void;
  staffNote: string; setStaffNote: (v: string) => void;
}) {
  const st = STATUS_META[req.status];
  const tp = AD_TYPE_LABELS[req.type];
  const canAction = !!st.next;

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: st.bg, color: st.text }}>{st.label}</span>
            <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: tp.color + "18", color: tp.color }}>{tp.icon} {tp.label}</span>
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: "#111827", margin: 0 }}>{req.club}</h2>
          <div style={{ fontSize: 13, color: "#6b7280" }}>{req.province} · Submitted {req.submitted}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={{ border: "1px solid #fca5a5", background: "#fee2e2", color: RED, borderRadius: 7, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Reject</button>
          {canAction && (
            <button style={{ background: GREEN, color: "white", border: "none", borderRadius: 7, padding: "7px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              {st.nextLabel} →
            </button>
          )}
          {req.status === "live" && (
            <button style={{ background: RED, color: "white", border: "none", borderRadius: 7, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              Unpublish
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
        {["pending_review","approved","payment_pending","live"].map((s, i) => {
          const statuses = ["pending_review","approved","payment_pending","live"];
          const curIdx = statuses.indexOf(req.status);
          const done = i <= curIdx;
          return (
            <div key={s} style={{ flex: 1, height: 4, borderRadius: 4, background: done ? GREEN : "#e5e7eb" }} />
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Left column: club's submission */}
        <div>
          <SectionHead>Club Submission</SectionHead>
          <InfoRow label="Package" value={req.package} />
          <InfoRow label="Headline" value={req.headline} />
          <InfoRow label="Subtitle" value={req.subtitle} />
          <InfoRow label="Requested Start" value={req.startDate} />
          <InfoRow label="Requested End" value={req.endDate} />
          <InfoRow label="Slot Duration" value={req.slot} />
          {req.notes && (
            <div style={{ marginTop: 10, background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 3 }}>CLUB NOTES</div>
              <div style={{ fontSize: 13, color: "#374151" }}>{req.notes}</div>
            </div>
          )}

          {/* Ad preview */}
          <SectionHead style={{ marginTop: 16 }}>Ad Preview</SectionHead>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ background: "#f3f4f6", height: 80, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 13 }}>
              {req.imageUrl ? <img src={req.imageUrl} alt="" style={{ maxHeight: "100%", objectFit: "cover" }} /> : "📷 No image uploaded yet"}
            </div>
            <div style={{ padding: "10px 12px" }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#111827" }}>{req.headline}</div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>{req.subtitle}</div>
              <div style={{ marginTop: 6, display: "inline-block", background: GREEN, color: "white", borderRadius: 5, padding: "3px 10px", fontSize: 11, fontWeight: 600 }}>Book Now</div>
            </div>
          </div>
        </div>

        {/* Right column: staff configuration */}
        <div>
          <SectionHead>Staff Configuration</SectionHead>

          {req.status === "pending_review" || req.status === "approved" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <StaffField label="Confirmed Price (ZAR)" placeholder={req.quotedPrice ? `R ${req.quotedPrice}` : "e.g. 1199"} value={price} onChange={setPrice} type="number" />
              <StaffField label="Confirmed Start Date" placeholder={req.startDate} value={scheduleStart} onChange={setScheduleStart} type="date" />
              <StaffField label="Confirmed End Date" placeholder={req.endDate} value={scheduleEnd} onChange={setScheduleEnd} type="date" />
              <StaffField label="Slot Duration / Rotation" placeholder={req.slot} value={slotDuration} onChange={setSlotDuration} />

              {req.type === "featured_home" && (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>Sharing Tier</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {["Exclusive (1 club)", "2-club share", "3-club share"].map(t => (
                      <div key={t} style={{ flex: 1, border: "1.5px solid #e5e7eb", borderRadius: 7, padding: "6px 8px", fontSize: 11, fontWeight: 600, textAlign: "center", cursor: "pointer", color: "#374151" }}>{t}</div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>Staff Notes / Quote Message to Club</label>
                <textarea rows={3} placeholder="Hi! We've reviewed your request. Confirmed price is R X for X weeks starting…"
                  value={staffNote} onChange={e => setStaffNote(e.target.value)}
                  style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 10px", fontSize: 12, resize: "vertical", boxSizing: "border-box" }} />
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button style={{ flex: 1, border: "1px solid #e5e7eb", background: "white", color: "#374151", borderRadius: 7, padding: "8px 0", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  📧 Send Quote to Club
                </button>
                <button style={{ flex: 1, background: GREEN, color: "white", border: "none", borderRadius: 7, padding: "8px 0", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  ✅ Approve & Notify
                </button>
              </div>
            </div>
          ) : req.status === "payment_pending" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ background: GOLD_LIGHT, border: `1px solid ${GOLD}55`, borderRadius: 8, padding: "12px 14px" }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#78350f", marginBottom: 2 }}>Awaiting Payment</div>
                <div style={{ fontSize: 12, color: "#92400e" }}>Quoted price: <strong>R {req.quotedPrice?.toLocaleString()}</strong></div>
                <div style={{ fontSize: 12, color: "#92400e", marginTop: 2 }}>Payment link sent to club. Confirm when received.</div>
              </div>
              <InfoRow label="Confirmed Start" value={req.startDate} />
              <InfoRow label="Confirmed End" value={req.endDate} />
              <InfoRow label="Slot" value={req.slot} />
              <button style={{ width: "100%", background: GREEN, color: "white", border: "none", borderRadius: 8, padding: "10px 0", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                💳 Confirm Payment Received → Publish
              </button>
              <button style={{ width: "100%", background: "white", color: "#6b7280", border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 0", fontSize: 12, cursor: "pointer" }}>
                Resend Payment Link
              </button>
            </div>
          ) : req.status === "live" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ background: "#dcfce7", border: "1px solid #bbf7d0", borderRadius: 8, padding: "12px 14px" }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#166534" }}>🟢 Live in App</div>
                <div style={{ fontSize: 12, color: "#166534", marginTop: 2 }}>{req.startDate} → {req.endDate}</div>
              </div>
              <InfoRow label="Package" value={req.package} />
              <InfoRow label="Slot Duration" value={req.slot} />
              <InfoRow label="Revenue" value={`R ${req.quotedPrice?.toLocaleString() ?? "—"}`} />
              <div style={{ marginTop: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6 }}>Live Performance</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  {[["Impressions", "4 821"], ["Taps", "312"], ["CTR", "6.5%"]].map(([l, v]) => (
                    <div key={l} style={{ background: GREEN_LIGHT, borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
                      <div style={{ fontWeight: 800, fontSize: 16, color: GREEN }}>{v}</div>
                      <div style={{ fontSize: 10, color: "#6b7280" }}>{l}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ color: "#9ca3af", fontSize: 13 }}>No actions available for this status.</div>
          )}
        </div>
      </div>

      {/* Activity log */}
      <div style={{ marginTop: 20 }}>
        <SectionHead>Activity Log</SectionHead>
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {[
            { time: "10 Jun 2026, 09:14", actor: "Club", text: "Ad request submitted" },
            ...(req.status !== "pending_review" ? [{ time: "10 Jun 2026, 11:30", actor: "Staff", text: "Request approved. Quote sent: R " + (req.quotedPrice ?? "—") }] : []),
            ...(req.status === "payment_pending" || req.status === "live" ? [{ time: "11 Jun 2026, 08:00", actor: "Staff", text: "Payment link sent to club" }] : []),
            ...(req.status === "live" ? [{ time: "12 Jun 2026, 09:00", actor: "Staff", text: "Payment confirmed. Ad published to app." }] : []),
          ].map((e, i) => (
            <div key={i} style={{ display: "flex", gap: 12, paddingBottom: 8, borderLeft: `2px solid ${e.actor === "Staff" ? GREEN : "#e5e7eb"}`, paddingLeft: 12, marginLeft: 6 }}>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: e.actor === "Staff" ? GREEN : "#6b7280" }}>{e.actor}</span>
                <span style={{ fontSize: 12, color: "#374151", marginLeft: 6 }}>{e.text}</span>
                <div style={{ fontSize: 11, color: "#9ca3af" }}>{e.time}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AnalyticsTab() {
  const rows = [
    { club: "Royal Johannesburg",  type: "explore",       status: "live",    revenue: 399,  impressions: 4821, taps: 312, ctr: "6.5%" },
    { club: "Houghton Golf Club",  type: "club_detail",   status: "approved", revenue: 1199, impressions: 0,    taps: 0,   ctr: "—" },
    { club: "Fancourt Estate",     type: "featured_home", status: "payment_pending", revenue: 699,  impressions: 0, taps: 0, ctr: "—" },
    { club: "Pearl Valley Golf",   type: "club_detail",   status: "expired",  revenue: 499,  impressions: 2104, taps: 87,  ctr: "4.1%" },
  ];
  const totalRev = rows.reduce((s, r) => s + r.revenue, 0);
  const totalImp = rows.reduce((s, r) => s + r.impressions, 0);

  return (
    <div style={{ background: "white", border: "1px solid #e5e7eb", borderTop: "none", borderRadius: "0 0 12px 12px", padding: 24 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        {[
          { label: "Total Revenue (Jun)", value: `R ${totalRev.toLocaleString()}`, color: GREEN },
          { label: "Total Impressions",   value: totalImp.toLocaleString(), color: "#1d4ed8" },
          { label: "Active Campaigns",    value: "1", color: "#166534" },
          { label: "Avg CTR",             value: "5.3%", color: "#7c3aed" },
        ].map((s, i) => (
          <div key={i} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>{s.label}</div>
          </div>
        ))}
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
            {["Club", "Ad Type", "Status", "Revenue", "Impressions", "Taps", "CTR"].map(h => (
              <th key={h} style={{ textAlign: "left", padding: "8px 10px", fontWeight: 700, color: "#6b7280", fontSize: 11, textTransform: "uppercase" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const st = STATUS_META[r.status];
            const tp = AD_TYPE_LABELS[r.type];
            return (
              <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ padding: "10px 10px", fontWeight: 600, color: "#111827" }}>{r.club}</td>
                <td style={{ padding: "10px 10px" }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: tp.color, background: tp.color + "18", padding: "2px 8px", borderRadius: 20 }}>{tp.icon} {tp.label}</span>
                </td>
                <td style={{ padding: "10px 10px" }}>
                  <span style={{ fontSize: 11, fontWeight: 600, background: st.bg, color: st.text, padding: "2px 8px", borderRadius: 20 }}>{st.label}</span>
                </td>
                <td style={{ padding: "10px 10px", fontWeight: 700, color: GREEN }}>R {r.revenue.toLocaleString()}</td>
                <td style={{ padding: "10px 10px", color: "#374151" }}>{r.impressions.toLocaleString() || "—"}</td>
                <td style={{ padding: "10px 10px", color: "#374151" }}>{r.taps || "—"}</td>
                <td style={{ padding: "10px 10px", fontWeight: 600, color: "#374151" }}>{r.ctr}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SectionHead({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ fontSize: 11, fontWeight: 800, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8, ...style }}>{children}</div>;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #f3f4f6" }}>
      <span style={{ fontSize: 12, color: "#6b7280" }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: "#111827" }}>{value}</span>
    </div>
  );
}

function StaffField({ label, placeholder, value, onChange, type = "text" }: { label: string; placeholder: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>{label}</label>
      <input type={type} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)}
        style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 7, padding: "7px 10px", fontSize: 12, boxSizing: "border-box" }} />
    </div>
  );
}
