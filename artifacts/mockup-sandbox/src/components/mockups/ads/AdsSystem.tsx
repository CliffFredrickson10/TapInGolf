import { useState } from "react";

const GREEN = "#1a5c38";
const GREEN_DARK = "#164d30";
const GREEN_LIGHT = "#e8f5ee";
const GOLD = "#c8a84b";
const GOLD_LIGHT = "#fdf8ec";

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  draft:           { bg: "#f3f4f6", text: "#6b7280", label: "Draft" },
  pending_review:  { bg: "#fef3c7", text: "#92400e", label: "Pending Review" },
  approved:        { bg: "#dbeafe", text: "#1e40af", label: "Approved" },
  payment_pending: { bg: "#fde8d8", text: "#c2410c", label: "Payment Pending" },
  live:            { bg: "#dcfce7", text: "#166534", label: "Live" },
  expired:         { bg: "#f3f4f6", text: "#6b7280", label: "Expired" },
};

const AD_TYPES = [
  {
    id: "club_detail",
    icon: "🏌️",
    title: "Club Detail Page Ad",
    subtitle: "Shown to golfers viewing your club profile",
    description: "A banner or card ad displayed directly on your club's detail page inside the TapIn Golf app. Only your club's ad is shown — no competitor sharing.",
    where: "Club detail page · Exclusive slot",
    packages: [
      { name: "Monthly Starter", price: "R 499", period: "/ month", slot: "10 sec display", reach: "~500 club views/mo", highlight: false },
      { name: "Quarterly Pro",   price: "R 1 199", period: "/ quarter", slot: "15 sec display", reach: "~500 club views/mo", highlight: true },
      { name: "Annual Club",    price: "R 3 999", period: "/ year", slot: "20 sec display", reach: "~500 club views/mo", highlight: false },
    ],
    formats: ["Banner image (1200×300)", "Rich card with CTA button", "Video clip (≤15 sec)"],
    color: GREEN,
  },
  {
    id: "featured_home",
    icon: "⭐",
    title: "Home Screen Featured Club",
    subtitle: "Carousel on the TapIn Golf home screen — shared rotation",
    description: "Your club rotates through the Featured Clubs carousel on the app home screen. Slot is shared with other clubs in your tier — you each get a fixed time window per rotation cycle.",
    where: "Home screen carousel · Shared rotation",
    packages: [
      { name: "Bronze Spot",  price: "R 299",   period: "/ month", slot: "5 sec / rotation", reach: "All app users · 3 clubs share slot", highlight: false },
      { name: "Silver Spot",  price: "R 699",   period: "/ month", slot: "10 sec / rotation", reach: "All app users · 2 clubs share slot", highlight: true },
      { name: "Gold Spot",    price: "R 1 499", period: "/ month", slot: "15 sec / rotation", reach: "All app users · Exclusive slot", highlight: false },
    ],
    formats: ["Club card with photo & green fee", "Promotional banner with offer", "Seasonal campaign image"],
    color: GOLD,
  },
];

const EXTRA_AD_OPTIONS = [
  {
    icon: "🔍",
    title: "Explore Screen Spotlight",
    desc: "Pinned to the top of the Explore tab with a highlighted card frame. Golfers browsing clubs see your club first.",
    badge: "Popular",
    price: "From R 399/mo",
    badgeColor: GREEN,
  },
  {
    icon: "📲",
    title: "Push Notification Campaign",
    desc: "Geo-targeted push to golfers within 50 km of your course. Perfect for last-minute tee time fills or special events.",
    badge: "High Impact",
    price: "From R 199/blast",
    badgeColor: "#7c3aed",
  },
  {
    icon: "🏆",
    title: "Tournament Sponsor Banner",
    desc: "Your logo and banner displayed in the in-app tournament leaderboard and results screens during your sponsored event.",
    badge: "Event-based",
    price: "R 299/event",
    badgeColor: "#0891b2",
  },
  {
    icon: "🎯",
    title: "Tee Time Deal Promotion",
    desc: "Offer discounted green fees on specific slots. TapIn promotes these to deal-seekers and fills empty tee times.",
    badge: "Revenue Tool",
    price: "Commission-based",
    badgeColor: "#c2410c",
  },
  {
    icon: "📧",
    title: "Newsletter Feature",
    desc: "Featured placement in the TapIn Golf weekly email newsletter sent to all registered golfers in your province.",
    badge: "Reach",
    price: "R 249/edition",
    badgeColor: "#0f766e",
  },
  {
    icon: "🗺️",
    title: "Nearby Club Alert",
    desc: "When a golfer opens the app within 10 km of your course, they see a pop-up card promoting a current special or open slots.",
    badge: "Geo-Targeted",
    price: "R 349/mo",
    badgeColor: "#b45309",
  },
];

const WORKFLOW_STEPS = [
  { num: "1", icon: "📝", title: "Submit Request", desc: "Club fills in ad details, selects package and format. Draft saved immediately.", actor: "Club" },
  { num: "2", icon: "🔔", title: "Staff Notified", desc: "TapIn staff receive an instant email alert with full request details for review.", actor: "TapIn" },
  { num: "3", icon: "✅", title: "Review & Confirm", desc: "Staff review creative, confirm pricing, display timing, and schedule. Club notified of outcome.", actor: "TapIn" },
  { num: "4", icon: "💳", title: "Club Pays", desc: "Club receives payment link. Ad remains in 'Payment Pending' until confirmed.", actor: "Club" },
  { num: "5", icon: "🚀", title: "Go Live", desc: "Staff publish the ad. It appears in the app immediately on the scheduled start date.", actor: "TapIn" },
];

const MOCK_ADS = [
  { type: "club_detail", title: "Summer Twilight Deals", subtitle: "R 299 green fee after 15:00", package: "Quarterly Pro", status: "live", start: "1 Jun 2026", end: "31 Aug 2026", slot: "15 sec" },
  { type: "featured_home", title: "Weekend 4-Ball Special", subtitle: "Book 4, pay for 3 every Saturday", package: "Gold Spot", status: "pending_review", start: "—", end: "—", slot: "15 sec / rotation" },
  { type: "club_detail", title: "Corporate Golf Days", subtitle: "Full event packages from R 4 500", package: "Monthly Starter", status: "expired", start: "1 Apr 2026", end: "30 Apr 2026", slot: "10 sec" },
];

type TabId = "my-ads" | "new-ad" | "packages";

export default function AdsSystem() {
  const [tab, setTab] = useState<TabId>("my-ads");
  const [adTypeStep, setAdTypeStep] = useState<0 | 1 | 2>(0);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", background: "#f9fafb", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Portal Header */}
      <div style={{ background: GREEN, padding: "12px 28px", display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ color: GOLD, fontWeight: 800, fontSize: 18 }}>TapIn Golf</span>
        <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, marginLeft: 4 }}>›</span>
        <span style={{ color: "white", fontSize: 14 }}>Advertisements</span>
        <span style={{ marginLeft: "auto", background: GOLD, color: "white", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20 }}>Club Portal</span>
      </div>

      <div style={{ padding: "28px 32px", flex: 1 }}>
        {/* Page Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: "#111827", margin: 0 }}>Advertisements</h1>
            <p style={{ color: "#6b7280", margin: "4px 0 0", fontSize: 14 }}>
              Promote your club to golfers across the TapIn Golf app. All ads require TapIn staff approval before going live.
            </p>
          </div>
          <button
            onClick={() => { setTab("new-ad"); setAdTypeStep(0); setSelectedType(null); setSelectedPackage(null); }}
            style={{ background: GREEN, color: "white", border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
          >
            <span>+</span> Request New Ad
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 2, marginBottom: 24, borderBottom: "2px solid #e5e7eb" }}>
          {([["my-ads", "My Ads"], ["new-ad", "Request an Ad"], ["packages", "Ad Options & Pricing"]] as [TabId, string][]).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{
              padding: "8px 18px", border: "none", background: "none", cursor: "pointer",
              fontSize: 14, fontWeight: 600, color: tab === id ? GREEN : "#6b7280",
              borderBottom: tab === id ? `2px solid ${GREEN}` : "2px solid transparent",
              marginBottom: -2, transition: "color 0.15s"
            }}>{label}</button>
          ))}
        </div>

        {/* ─── TAB: My Ads ─── */}
        {tab === "my-ads" && (
          <div>
            {/* Section: Club Detail Ads */}
            <SectionHeader icon="🏌️" title="Club Detail Page Ads" color={GREEN}
              badge={`${MOCK_ADS.filter(a => a.type === "club_detail").length} ads`} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 28 }}>
              {MOCK_ADS.filter(a => a.type === "club_detail").map((ad, i) => <AdCard key={i} ad={ad} />)}
              <NewAdPrompt color={GREEN} type="Club Detail" onClick={() => { setTab("new-ad"); setAdTypeStep(0); }} />
            </div>

            {/* Section: Featured Home Ads */}
            <SectionHeader icon="⭐" title="Home Screen Featured Clubs" color={GOLD}
              badge={`${MOCK_ADS.filter(a => a.type === "featured_home").length} ads`} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 28 }}>
              {MOCK_ADS.filter(a => a.type === "featured_home").map((ad, i) => <AdCard key={i} ad={ad} />)}
              <NewAdPrompt color={GOLD} type="Featured Slot" onClick={() => { setTab("new-ad"); setAdTypeStep(0); }} />
            </div>

            {/* Workflow reminder */}
            <div style={{ background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 10, padding: "14px 18px", display: "flex", gap: 12, alignItems: "flex-start" }}>
              <span style={{ fontSize: 18 }}>ℹ️</span>
              <div>
                <strong style={{ fontSize: 13, color: "#92400e" }}>All ads require TapIn staff approval.</strong>
                <p style={{ margin: "3px 0 0", fontSize: 13, color: "#78350f" }}>
                  When you submit an ad request, our team is notified immediately. We'll review your creative, confirm pricing and scheduling, then send you a payment link. Your ad goes live once payment is confirmed.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ─── TAB: New Ad ─── */}
        {tab === "new-ad" && (
          <div style={{ maxWidth: 860 }}>
            {/* Step indicator */}
            <div style={{ display: "flex", gap: 0, marginBottom: 28 }}>
              {["Choose Ad Type", "Select Package", "Ad Details"].map((s, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 13, fontWeight: 700,
                      background: adTypeStep > i ? GREEN : adTypeStep === i ? GREEN : "#e5e7eb",
                      color: adTypeStep >= i ? "white" : "#9ca3af"
                    }}>{adTypeStep > i ? "✓" : i + 1}</div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: adTypeStep === i ? GREEN : adTypeStep > i ? "#374151" : "#9ca3af" }}>{s}</span>
                  </div>
                  {i < 2 && <div style={{ flex: 1, height: 2, background: adTypeStep > i ? GREEN : "#e5e7eb", margin: "0 12px" }} />}
                </div>
              ))}
            </div>

            {/* Step 0: Choose type */}
            {adTypeStep === 0 && (
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: "#111827" }}>Where would you like to advertise?</h2>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  {AD_TYPES.map(t => (
                    <div key={t.id} onClick={() => setSelectedType(t.id)}
                      style={{ border: `2px solid ${selectedType === t.id ? t.color : "#e5e7eb"}`, borderRadius: 12, padding: 20, cursor: "pointer", background: selectedType === t.id ? (t.color === GREEN ? GREEN_LIGHT : GOLD_LIGHT) : "white", transition: "all 0.15s" }}>
                      <div style={{ fontSize: 28, marginBottom: 8 }}>{t.icon}</div>
                      <div style={{ fontWeight: 700, fontSize: 16, color: "#111827", marginBottom: 4 }}>{t.title}</div>
                      <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 10 }}>{t.description}</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: t.color, background: t.color + "18", padding: "3px 10px", borderRadius: 20, display: "inline-block" }}>{t.where}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
                  <button onClick={() => selectedType && setAdTypeStep(1)}
                    style={{ background: selectedType ? GREEN : "#9ca3af", color: "white", border: "none", borderRadius: 8, padding: "10px 24px", fontSize: 14, fontWeight: 600, cursor: selectedType ? "pointer" : "not-allowed" }}>
                    Next: Choose Package →
                  </button>
                </div>
              </div>
            )}

            {/* Step 1: Choose package */}
            {adTypeStep === 1 && (() => {
              const type = AD_TYPES.find(t => t.id === selectedType)!;
              return (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                    <span style={{ fontSize: 20 }}>{type.icon}</span>
                    <h2 style={{ fontSize: 18, fontWeight: 700, color: "#111827", margin: 0 }}>{type.title} — Choose a Package</h2>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 20 }}>
                    {type.packages.map(pkg => (
                      <div key={pkg.name} onClick={() => setSelectedPackage(pkg.name)}
                        style={{ border: `2px solid ${selectedPackage === pkg.name ? type.color : pkg.highlight ? type.color + "66" : "#e5e7eb"}`, borderRadius: 12, padding: 18, cursor: "pointer", background: selectedPackage === pkg.name ? (type.color === GREEN ? GREEN_LIGHT : GOLD_LIGHT) : pkg.highlight ? "#fafafa" : "white", position: "relative", transition: "all 0.15s" }}>
                        {pkg.highlight && <div style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", background: type.color, color: "white", fontSize: 10, fontWeight: 700, padding: "2px 10px", borderRadius: 20 }}>Most Popular</div>}
                        <div style={{ fontWeight: 700, fontSize: 15, color: "#111827", marginBottom: 6 }}>{pkg.name}</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: type.color }}>{pkg.price}<span style={{ fontSize: 13, fontWeight: 500, color: "#6b7280" }}>{pkg.period}</span></div>
                        <div style={{ fontSize: 12, color: "#374151", marginTop: 10 }}>⏱ {pkg.slot}</div>
                        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>👥 {pkg.reach}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#166534", marginBottom: 16 }}>
                    💡 Prices are indicative. TapIn staff will confirm final pricing and scheduling during the approval process.
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <button onClick={() => setAdTypeStep(0)} style={{ background: "none", border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer", color: "#374151" }}>← Back</button>
                    <button onClick={() => selectedPackage && setAdTypeStep(2)}
                      style={{ background: selectedPackage ? GREEN : "#9ca3af", color: "white", border: "none", borderRadius: 8, padding: "10px 24px", fontSize: 14, fontWeight: 600, cursor: selectedPackage ? "pointer" : "not-allowed" }}>
                      Next: Ad Details →
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Step 2: Ad details form */}
            {adTypeStep === 2 && (
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: "#111827" }}>Ad Details</h2>
                <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 12, padding: 24 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                    <FormField label="Ad Headline *" placeholder="Summer Twilight Deals" />
                    <FormField label="Tagline / Subtitle" placeholder="R 299 green fee after 15:00" />
                    <FormField label="Ad Image URL" placeholder="https://yourclub.co.za/banner.jpg" />
                    <FormField label="CTA Button Text" placeholder="Book Now" />
                    <FormField label="Campaign Start Date" placeholder="2026-07-01" type="date" />
                    <FormField label="Campaign End Date" placeholder="2026-09-30" type="date" />
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>Additional Notes for TapIn Staff</label>
                    <textarea placeholder="Any special scheduling requests, target audience notes, or creative preferences…" rows={3}
                      style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 12px", fontSize: 13, resize: "vertical", boxSizing: "border-box" }} />
                  </div>
                  <div style={{ background: GOLD_LIGHT, border: `1px solid ${GOLD}55`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#78350f", marginBottom: 16 }}>
                    📬 Once submitted, TapIn staff will review your request within 1 business day and contact you to confirm pricing and scheduling before any payment is required.
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <button onClick={() => setAdTypeStep(1)} style={{ background: "none", border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer", color: "#374151" }}>← Back</button>
                    <button style={{ background: GREEN, color: "white", border: "none", borderRadius: 8, padding: "10px 24px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                      Submit Request →
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── TAB: Packages ─── */}
        {tab === "packages" && (
          <div>
            {/* Two main types */}
            {AD_TYPES.map(type => (
              <div key={type.id} style={{ marginBottom: 36 }}>
                <SectionHeader icon={type.icon} title={type.title} color={type.color} badge={type.where} />
                <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 16 }}>{type.description}</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 12 }}>
                  {type.packages.map(pkg => (
                    <div key={pkg.name} style={{ border: `1.5px solid ${pkg.highlight ? type.color : "#e5e7eb"}`, borderRadius: 12, padding: 18, background: pkg.highlight ? (type.color === GREEN ? GREEN_LIGHT : GOLD_LIGHT) : "white", position: "relative" }}>
                      {pkg.highlight && <div style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", background: type.color, color: "white", fontSize: 10, fontWeight: 700, padding: "2px 10px", borderRadius: 20 }}>Most Popular</div>}
                      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{pkg.name}</div>
                      <div style={{ fontSize: 24, fontWeight: 800, color: type.color }}>{pkg.price}<span style={{ fontSize: 13, fontWeight: 500, color: "#6b7280" }}>{pkg.period}</span></div>
                      <div style={{ height: 1, background: "#e5e7eb", margin: "12px 0" }} />
                      <div style={{ fontSize: 12, color: "#374151" }}>⏱ {pkg.slot}</div>
                      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4, marginBottom: 12 }}>👥 {pkg.reach}</div>
                      <button onClick={() => { setTab("new-ad"); setAdTypeStep(0); setSelectedType(type.id); setSelectedPackage(pkg.name); }}
                        style={{ width: "100%", background: type.color, color: "white", border: "none", borderRadius: 7, padding: "8px 0", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                        Request This Package
                      </button>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 13, color: "#6b7280" }}>
                  <strong>Formats accepted:</strong> {type.formats.join(" · ")}
                </div>
              </div>
            ))}

            {/* Workflow */}
            <div style={{ marginBottom: 36 }}>
              <SectionHeader icon="🔄" title="How the Approval Process Works" color="#374151" badge="5 steps" />
              <div style={{ display: "flex", gap: 0, marginTop: 8 }}>
                {WORKFLOW_STEPS.map((step, i) => (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", position: "relative" }}>
                    {i < WORKFLOW_STEPS.length - 1 && <div style={{ position: "absolute", top: 22, left: "60%", right: "-40%", height: 2, background: "#e5e7eb", zIndex: 0 }} />}
                    <div style={{ width: 44, height: 44, borderRadius: "50%", background: step.actor === "TapIn" ? GREEN_LIGHT : GOLD_LIGHT, border: `2px solid ${step.actor === "TapIn" ? GREEN : GOLD}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, marginBottom: 8, position: "relative", zIndex: 1 }}>{step.icon}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: step.actor === "TapIn" ? GREEN : "#92400e", marginBottom: 2 }}>Step {step.num}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 4 }}>{step.title}</div>
                    <div style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.4 }}>{step.desc}</div>
                    <div style={{ fontSize: 10, fontWeight: 600, marginTop: 6, padding: "2px 8px", borderRadius: 20, background: step.actor === "TapIn" ? GREEN_LIGHT : GOLD_LIGHT, color: step.actor === "TapIn" ? GREEN : "#92400e" }}>{step.actor}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Extra options */}
            <SectionHeader icon="💡" title="More Ways to Promote Your Club" color="#374151" badge="6 options" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginTop: 8 }}>
              {EXTRA_AD_OPTIONS.map((opt, i) => (
                <div key={i} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, background: "white" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 22 }}>{opt.icon}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: opt.badgeColor + "18", color: opt.badgeColor }}>{opt.badge}</span>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#111827", marginBottom: 4 }}>{opt.title}</div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10, lineHeight: 1.5 }}>{opt.desc}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: GREEN }}>{opt.price}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ icon, title, color, badge }: { icon: string; title: string; color: string; badge: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
      <span style={{ fontSize: 20 }}>{icon}</span>
      <h2 style={{ fontSize: 17, fontWeight: 800, color: "#111827", margin: 0 }}>{title}</h2>
      <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 10px", borderRadius: 20, background: color + "18", color }}>{badge}</span>
      <div style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
    </div>
  );
}

function AdCard({ ad }: { ad: typeof MOCK_ADS[0] }) {
  const status = STATUS_COLORS[ad.status];
  const typeColor = ad.type === "club_detail" ? GREEN : GOLD;
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, background: "white" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>{ad.title}</div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>{ad.subtitle}</div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: status.bg, color: status.text, whiteSpace: "nowrap" }}>{status.label}</span>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Tag color={typeColor}>{ad.type === "club_detail" ? "🏌️ Club Detail" : "⭐ Featured"}</Tag>
        <Tag color="#374151">📦 {ad.package}</Tag>
        <Tag color="#374151">⏱ {ad.slot}</Tag>
      </div>
      <div style={{ marginTop: 10, fontSize: 12, color: "#9ca3af" }}>{ad.start !== "—" ? `${ad.start} → ${ad.end}` : "Dates TBC after approval"}</div>
    </div>
  );
}

function NewAdPrompt({ color, type, onClick }: { color: string; type: string; onClick: () => void }) {
  return (
    <div onClick={onClick} style={{ border: `2px dashed ${color}55`, borderRadius: 10, padding: 16, background: color + "08", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", minHeight: 100, gap: 6 }}>
      <span style={{ fontSize: 22 }}>+</span>
      <span style={{ fontSize: 13, fontWeight: 600, color }}>Request a {type} Ad</span>
    </div>
  );
}

function Tag({ color, children }: { color: string; children: React.ReactNode }) {
  return <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: color + "15", color }}>{children}</span>;
}

function FormField({ label, placeholder, type = "text" }: { label: string; placeholder: string; type?: string }) {
  return (
    <div>
      <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 5 }}>{label}</label>
      <input type={type} placeholder={placeholder} style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 12px", fontSize: 13, boxSizing: "border-box" }} />
    </div>
  );
}
