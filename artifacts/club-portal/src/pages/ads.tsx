import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { Plus, Trash2, ChevronRight, ChevronLeft, Check } from "lucide-react";

interface AdRequest {
  id: number;
  ad_type: string;
  package_name: string | null;
  headline: string;
  subtitle: string | null;
  image_url: string | null;
  cta_text: string | null;
  link_url: string | null;
  requested_start: string | null;
  requested_end: string | null;
  club_notes: string | null;
  status: string;
  confirmed_price: number | null;
  confirmed_start: string | null;
  confirmed_end: string | null;
  slot_duration: string | null;
  sharing_tier: string | null;
  staff_notes: string | null;
  created_at: string;
}

const STATUS: Record<string, { bg: string; text: string; label: string }> = {
  pending_review:  { bg: "bg-yellow-100", text: "text-yellow-800", label: "Pending Review" },
  approved:        { bg: "bg-blue-100",   text: "text-blue-800",   label: "Approved" },
  payment_pending: { bg: "bg-orange-100", text: "text-orange-800", label: "Payment Pending" },
  live:            { bg: "bg-green-100",  text: "text-green-800",  label: "Live" },
  expired:         { bg: "bg-gray-100",   text: "text-gray-500",   label: "Expired" },
  rejected:        { bg: "bg-red-100",    text: "text-red-700",    label: "Rejected" },
};

const AD_TYPES = [
  {
    id: "club_detail",
    icon: "🏌️",
    title: "Club Detail Page Ad",
    desc: "A banner shown exclusively on your club's profile page inside the TapIn Golf app. Only your ad appears — no competitor sharing.",
    where: "Club detail page · Exclusive",
    color: "#1a5c38",
    packages: [
      { name: "Monthly Starter",  price: "R 499",   period: "/month",   slot: "10 sec display", reach: "~500 club views/month", popular: false },
      { name: "Quarterly Pro",    price: "R 1 199", period: "/quarter", slot: "15 sec display", reach: "~500 club views/month", popular: true  },
      { name: "Annual Club",      price: "R 3 999", period: "/year",    slot: "20 sec display", reach: "~500 club views/month", popular: false },
    ],
  },
  {
    id: "featured_home",
    icon: "⭐",
    title: "Home Screen Featured Club",
    desc: "Your club rotates through the Featured Clubs carousel on the app home screen. Slot shared with other clubs in your tier — each club gets a fixed window per rotation.",
    where: "Home screen carousel · Shared rotation",
    color: "#c8a84b",
    packages: [
      { name: "Bronze Spot", price: "R 299",   period: "/month", slot: "5 sec / rotation",  reach: "All users · 3 clubs share",   popular: false },
      { name: "Silver Spot", price: "R 699",   period: "/month", slot: "10 sec / rotation", reach: "All users · 2 clubs share",   popular: true  },
      { name: "Gold Spot",   price: "R 1 499", period: "/month", slot: "15 sec / rotation", reach: "All users · Exclusive slot",  popular: false },
    ],
  },
];

const EXTRA_OPTIONS = [
  { icon: "🔍", title: "Explore Screen Spotlight",    id: "explore",     price: "From R 399/mo",    badge: "Popular",      badgeColor: "#1a5c38"  },
  { icon: "📲", title: "Push Notification Campaign",  id: "push",        price: "From R 199/blast", badge: "High Impact",  badgeColor: "#7c3aed"  },
  { icon: "🏆", title: "Tournament Sponsor Banner",   id: "tournament",  price: "R 299/event",      badge: "Event-based",  badgeColor: "#0891b2"  },
  { icon: "🎯", title: "Tee Time Deal Promotion",     id: "tee_time_deal", price: "Commission-based",badge: "Revenue Tool", badgeColor: "#c2410c"  },
  { icon: "📧", title: "Newsletter Feature",          id: "newsletter",  price: "R 249/edition",    badge: "Reach",        badgeColor: "#0f766e"  },
  { icon: "🗺️", title: "Nearby Club Alert",          id: "nearby_alert", price: "R 349/mo",        badge: "Geo-targeted", badgeColor: "#b45309"  },
];

const WORKFLOW = [
  { step: "1", icon: "📝", title: "Submit",   desc: "Fill in your ad details and choose a package.",          actor: "Club" },
  { step: "2", icon: "🔔", title: "Notified", desc: "TapIn staff are alerted immediately for review.",        actor: "Staff" },
  { step: "3", icon: "✅", title: "Approved", desc: "Staff confirm pricing, scheduling, and send a quote.",   actor: "Staff" },
  { step: "4", icon: "💳", title: "Payment",  desc: "Club receives a payment link and pays.",                 actor: "Club" },
  { step: "5", icon: "🚀", title: "Live",     desc: "Staff publish the ad — it appears in the app.",          actor: "Staff" },
];

const TYPE_LABEL: Record<string, string> = {
  club_detail: "Club Detail Page",
  featured_home: "Home Screen Featured",
  explore: "Explore Spotlight",
  push: "Push Notification",
  tournament: "Tournament Sponsor",
  newsletter: "Newsletter",
  nearby_alert: "Nearby Alert",
  tee_time_deal: "Tee Time Deal",
};

const emptyForm = () => ({
  headline: "", subtitle: "", image_url: "", cta_text: "Book Now", link_url: "",
  requested_start: "", requested_end: "", club_notes: "",
});

export default function Ads() {
  const { toast } = useToast();
  const [requests, setRequests] = useState<AdRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("my-ads");

  // Wizard state
  const [wizardStep, setWizardStep] = useState(0);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<AdRequest[]>("/api/portal/ad-requests");
      setRequests(data);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const startWizard = (typeId?: string, packageName?: string) => {
    setWizardStep(typeId ? (packageName ? 2 : 1) : 0);
    setSelectedType(typeId ?? null);
    setSelectedPackage(packageName ?? null);
    setForm(emptyForm());
    setActiveTab("new-ad");
  };

  const handleSubmit = async () => {
    if (!form.headline.trim()) { toast({ title: "Headline required", variant: "destructive" }); return; }
    setSubmitting(true);
    try {
      await api("/api/portal/ad-requests", {
        method: "POST",
        body: JSON.stringify({
          ad_type: selectedType ?? "club_detail",
          package_name: selectedPackage,
          headline: form.headline,
          subtitle: form.subtitle || null,
          image_url: form.image_url || null,
          cta_text: form.cta_text || null,
          link_url: form.link_url || null,
          requested_start: form.requested_start || null,
          requested_end: form.requested_end || null,
          club_notes: form.club_notes || null,
        }),
      });
      toast({ title: "Request submitted!", description: "TapIn staff will review and contact you within 1 business day." });
      setActiveTab("my-ads");
      setWizardStep(0);
      setSelectedType(null);
      setSelectedPackage(null);
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setSubmitting(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Cancel this ad request?")) return;
    try {
      await api(`/api/portal/ad-requests/${id}`, { method: "DELETE" });
      toast({ title: "Request cancelled" });
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const setF = (k: keyof ReturnType<typeof emptyForm>, v: string) => setForm(f => ({ ...f, [k]: v }));

  const detailAds = requests.filter(r => r.ad_type === "club_detail");
  const featuredAds = requests.filter(r => r.ad_type === "featured_home");
  const otherAds = requests.filter(r => !["club_detail","featured_home"].includes(r.ad_type));

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Advertisements</h1>
          <p className="text-muted-foreground mt-1">Promote your club to golfers across the TapIn Golf app. All ads require staff approval before going live.</p>
        </div>
        <Button className="bg-[#1a5c38] hover:bg-[#164d30] gap-2" onClick={() => startWizard()}>
          <Plus className="h-4 w-4" /> Request New Ad
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="my-ads">My Ads</TabsTrigger>
          <TabsTrigger value="new-ad">Request an Ad</TabsTrigger>
          <TabsTrigger value="packages">Options &amp; Pricing</TabsTrigger>
        </TabsList>

        {/* ── MY ADS ── */}
        <TabsContent value="my-ads" className="space-y-6 pt-4">
          {loading ? <Skeleton className="h-48 w-full" /> : (
            <>
              <AdSection
                icon="🏌️" title="Club Detail Page Ads" color="#1a5c38"
                badge={`${detailAds.length} ad${detailAds.length !== 1 ? "s" : ""}`}
                ads={detailAds} onDelete={handleDelete}
                onNew={() => startWizard("club_detail")}
              />
              <AdSection
                icon="⭐" title="Home Screen Featured Clubs" color="#c8a84b"
                badge={`${featuredAds.length} ad${featuredAds.length !== 1 ? "s" : ""}`}
                ads={featuredAds} onDelete={handleDelete}
                onNew={() => startWizard("featured_home")}
              />
              {otherAds.length > 0 && (
                <AdSection
                  icon="💡" title="Other Ad Campaigns" color="#374151"
                  badge={`${otherAds.length}`}
                  ads={otherAds} onDelete={handleDelete}
                  onNew={() => startWizard()}
                />
              )}
              {requests.length === 0 && (
                <div className="text-center py-16 text-muted-foreground">
                  <div className="text-4xl mb-3">📢</div>
                  <p className="font-medium">No ad requests yet</p>
                  <p className="text-sm mt-1">Submit your first request to start reaching more golfers.</p>
                  <Button className="mt-4 bg-[#1a5c38] hover:bg-[#164d30]" onClick={() => startWizard()}>Request Your First Ad</Button>
                </div>
              )}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex gap-3">
                <span className="text-lg">ℹ️</span>
                <div>
                  <p className="text-sm font-semibold text-amber-900">All ads require TapIn staff approval.</p>
                  <p className="text-sm text-amber-800 mt-0.5">When you submit a request our team is notified immediately. We'll review your creative, confirm pricing and scheduling, then send you a payment link. Your ad goes live once payment is confirmed.</p>
                </div>
              </div>
            </>
          )}
        </TabsContent>

        {/* ── REQUEST WIZARD ── */}
        <TabsContent value="new-ad" className="pt-4 max-w-3xl">
          {/* Step indicator */}
          <div className="flex items-center mb-8">
            {["Choose Ad Type", "Select Package", "Ad Details"].map((label, i) => (
              <div key={i} className="flex items-center flex-1">
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    wizardStep > i ? "bg-[#1a5c38] text-white" : wizardStep === i ? "bg-[#1a5c38] text-white" : "bg-gray-200 text-gray-500"
                  }`}>
                    {wizardStep > i ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </div>
                  <span className={`text-sm font-semibold ${wizardStep === i ? "text-[#1a5c38]" : wizardStep > i ? "text-gray-700" : "text-gray-400"}`}>{label}</span>
                </div>
                {i < 2 && <div className={`flex-1 h-0.5 mx-3 ${wizardStep > i ? "bg-[#1a5c38]" : "bg-gray-200"}`} />}
              </div>
            ))}
          </div>

          {/* Step 0 — choose type */}
          {wizardStep === 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold">Where would you like to advertise?</h2>
              <div className="grid grid-cols-2 gap-4">
                {AD_TYPES.map(t => (
                  <button key={t.id} onClick={() => setSelectedType(t.id)}
                    className={`border-2 rounded-xl p-5 text-left transition-all ${selectedType === t.id ? "border-[#1a5c38] bg-[#e8f5ee]" : "border-gray-200 hover:border-gray-300 bg-white"}`}>
                    <div className="text-2xl mb-2">{t.icon}</div>
                    <div className="font-bold text-base mb-1">{t.title}</div>
                    <div className="text-sm text-muted-foreground mb-3">{t.desc}</div>
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: t.color + "18", color: t.color }}>{t.where}</span>
                  </button>
                ))}
              </div>
              <div className="flex justify-end mt-4">
                <Button className="bg-[#1a5c38] hover:bg-[#164d30] gap-1" disabled={!selectedType} onClick={() => setWizardStep(1)}>
                  Next: Choose Package <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 1 — choose package */}
          {wizardStep === 1 && (() => {
            const type = AD_TYPES.find(t => t.id === selectedType)!;
            return (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">{type.icon}</span>
                  <h2 className="text-lg font-bold">{type.title} — Choose a Package</h2>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {type.packages.map(pkg => (
                    <button key={pkg.name} onClick={() => setSelectedPackage(pkg.name)}
                      className={`relative border-2 rounded-xl p-4 text-left transition-all ${selectedPackage === pkg.name ? (type.id === "club_detail" ? "border-[#1a5c38] bg-[#e8f5ee]" : "border-[#c8a84b] bg-[#fdf8ec]") : pkg.popular ? "border-gray-300 bg-white" : "border-gray-200 bg-white hover:border-gray-300"}`}>
                      {pkg.popular && (
                        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: type.color }}>Most Popular</span>
                      )}
                      <div className="font-bold text-sm mb-1">{pkg.name}</div>
                      <div className="text-xl font-black mb-0.5" style={{ color: type.color }}>{pkg.price}<span className="text-xs font-medium text-muted-foreground">{pkg.period}</span></div>
                      <div className="text-xs text-foreground mt-2">⏱ {pkg.slot}</div>
                      <div className="text-xs text-muted-foreground mt-1">👥 {pkg.reach}</div>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground bg-green-50 border border-green-200 rounded-lg p-3">
                  💡 Prices are indicative. TapIn staff will confirm final pricing and scheduling during the approval process.
                </p>
                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setWizardStep(0)}><ChevronLeft className="h-4 w-4" /> Back</Button>
                  <Button className="bg-[#1a5c38] hover:bg-[#164d30] gap-1" disabled={!selectedPackage} onClick={() => setWizardStep(2)}>
                    Next: Ad Details <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })()}

          {/* Step 2 — ad details */}
          {wizardStep === 2 && (
            <div className="space-y-5">
              <h2 className="text-lg font-bold">Ad Details</h2>
              <div className="bg-white border rounded-xl p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 space-y-1.5">
                    <Label>Ad Headline *</Label>
                    <Input value={form.headline} onChange={e => setF("headline", e.target.value)} placeholder="Summer Twilight Deals" />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <Label>Tagline / Subtitle</Label>
                    <Input value={form.subtitle} onChange={e => setF("subtitle", e.target.value)} placeholder="R 299 green fee after 15:00" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Ad Image URL</Label>
                    <Input value={form.image_url} onChange={e => setF("image_url", e.target.value)} placeholder="https://yourclub.co.za/banner.jpg" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>CTA Button Text</Label>
                    <Input value={form.cta_text} onChange={e => setF("cta_text", e.target.value)} placeholder="Book Now" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Campaign Start Date</Label>
                    <Input type="date" value={form.requested_start} onChange={e => setF("requested_start", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Campaign End Date</Label>
                    <Input type="date" value={form.requested_end} onChange={e => setF("requested_end", e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Notes for TapIn Staff</Label>
                  <Textarea value={form.club_notes} onChange={e => setF("club_notes", e.target.value)} placeholder="Any special scheduling requests, target audience notes, or creative preferences…" rows={3} />
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                  📬 Once submitted, TapIn staff will review your request within 1 business day and contact you to confirm pricing and scheduling before any payment is required.
                </div>
              </div>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setWizardStep(1)}><ChevronLeft className="h-4 w-4" /> Back</Button>
                <Button className="bg-[#1a5c38] hover:bg-[#164d30]" onClick={handleSubmit} disabled={submitting}>
                  {submitting ? "Submitting…" : "Submit Request →"}
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── OPTIONS & PRICING ── */}
        <TabsContent value="packages" className="pt-4 space-y-8">
          {AD_TYPES.map(type => (
            <div key={type.id}>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xl">{type.icon}</span>
                <h2 className="text-lg font-bold">{type.title}</h2>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: type.color + "18", color: type.color }}>{type.where}</span>
              </div>
              <p className="text-sm text-muted-foreground mb-4">{type.desc}</p>
              <div className="grid grid-cols-3 gap-4 mb-3">
                {type.packages.map(pkg => (
                  <div key={pkg.name} className={`relative border rounded-xl p-4 bg-white ${pkg.popular ? "border-gray-300 shadow-sm" : "border-gray-200"}`}>
                    {pkg.popular && (
                      <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-bold px-2.5 py-0.5 rounded-full text-white" style={{ background: type.color }}>Most Popular</span>
                    )}
                    <div className="font-bold text-sm mb-1">{pkg.name}</div>
                    <div className="text-xl font-black" style={{ color: type.color }}>{pkg.price}<span className="text-xs font-medium text-muted-foreground">{pkg.period}</span></div>
                    <div className="h-px bg-gray-100 my-3" />
                    <div className="text-xs text-foreground">⏱ {pkg.slot}</div>
                    <div className="text-xs text-muted-foreground mt-1 mb-3">👥 {pkg.reach}</div>
                    <Button size="sm" className="w-full text-white" style={{ background: type.color }} onClick={() => startWizard(type.id, pkg.name)}>
                      Request This Package
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-xl">💡</span>
              <h2 className="text-lg font-bold">More Ways to Promote Your Club</h2>
            </div>
            <div className="grid grid-cols-3 gap-4 mb-8">
              {EXTRA_OPTIONS.map(opt => (
                <div key={opt.id} className="border rounded-xl p-4 bg-white">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">{opt.icon}</span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: opt.badgeColor + "18", color: opt.badgeColor }}>{opt.badge}</span>
                  </div>
                  <div className="font-bold text-sm mb-1">{opt.title}</div>
                  <div className="text-xs text-muted-foreground mb-3 leading-relaxed">{EXTRA_DESCS[opt.id]}</div>
                  <div className="text-sm font-bold text-[#1a5c38] mb-2">{opt.price}</div>
                  <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => startWizard(opt.id)}>Enquire</Button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-xl">🔄</span>
              <h2 className="text-lg font-bold">How the Approval Process Works</h2>
            </div>
            <div className="flex gap-0">
              {WORKFLOW.map((step, i) => (
                <div key={i} className="flex-1 flex flex-col items-center text-center relative px-2">
                  {i < WORKFLOW.length - 1 && <div className="absolute top-5 left-3/5 right-0 h-0.5 bg-gray-200" />}
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center text-lg mb-2 relative z-10 border-2 ${step.actor === "Staff" ? "bg-[#e8f5ee] border-[#1a5c38]" : "bg-[#fdf8ec] border-[#c8a84b]"}`}>{step.icon}</div>
                  <div className="text-[11px] font-bold mb-1" style={{ color: step.actor === "Staff" ? "#1a5c38" : "#92400e" }}>Step {step.step}</div>
                  <div className="text-xs font-bold text-foreground mb-1">{step.title}</div>
                  <div className="text-[11px] text-muted-foreground leading-snug">{step.desc}</div>
                  <span className={`mt-2 text-[10px] font-semibold px-2 py-0.5 rounded-full ${step.actor === "Staff" ? "bg-[#e8f5ee] text-[#1a5c38]" : "bg-[#fdf8ec] text-amber-700"}`}>{step.actor}</span>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

const EXTRA_DESCS: Record<string, string> = {
  explore:       "Pinned to the top of the Explore tab with a highlighted card frame. Golfers browsing clubs see your club first.",
  push:          "Geo-targeted push to golfers within 50 km of your course. Perfect for last-minute tee time fills or special events.",
  tournament:    "Your logo and banner displayed in the in-app tournament leaderboard and results screens during your sponsored event.",
  tee_time_deal: "Offer discounted green fees on specific slots. TapIn promotes these to deal-seekers and fills empty tee times.",
  newsletter:    "Featured placement in the TapIn Golf weekly email newsletter sent to all registered golfers in your province.",
  nearby_alert:  "When a golfer opens the app within 10 km of your course, they see a pop-up card promoting a current special or open slots.",
};

function AdSection({ icon, title, color, badge, ads, onDelete, onNew }: {
  icon: string; title: string; color: string; badge: string;
  ads: AdRequest[]; onDelete: (id: number) => void; onNew: () => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <span className="text-xl">{icon}</span>
        <h2 className="text-base font-bold">{title}</h2>
        <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full" style={{ background: color + "18", color }}>{badge}</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {ads.map(ad => {
          const st = STATUS[ad.status] ?? STATUS.pending_review;
          return (
            <div key={ad.id} className="border rounded-xl p-4 bg-white">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <div className="font-bold text-sm">{ad.headline}</div>
                  {ad.subtitle && <div className="text-xs text-muted-foreground">{ad.subtitle}</div>}
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${st.bg} ${st.text}`}>{st.label}</span>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {ad.package_name && <Tag color={color}>{ad.package_name}</Tag>}
                {ad.slot_duration && <Tag color="#374151">⏱ {ad.slot_duration}</Tag>}
              </div>
              {ad.status === "live" && ad.confirmed_price && (
                <div className="text-xs text-green-700 font-semibold mb-1">✓ Live · R {Number(ad.confirmed_price).toLocaleString()}</div>
              )}
              {ad.status === "approved" && ad.confirmed_price && (
                <div className="text-xs text-blue-700 mb-1">Quote confirmed: R {Number(ad.confirmed_price).toLocaleString()} — awaiting payment</div>
              )}
              {ad.staff_notes && (
                <div className="text-xs text-muted-foreground bg-gray-50 rounded p-2 mb-2">Staff: {ad.staff_notes}</div>
              )}
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-muted-foreground">{format(new Date(ad.created_at), "d MMM yyyy")}</span>
                {["pending_review","rejected"].includes(ad.status) && (
                  <button onClick={() => onDelete(ad.id)} className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1">
                    <Trash2 className="h-3 w-3" /> Cancel
                  </button>
                )}
              </div>
            </div>
          );
        })}
        <button onClick={onNew} className="border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center gap-1.5 min-h-[100px] transition-colors hover:border-gray-400" style={{ borderColor: color + "66" }}>
          <span className="text-2xl">+</span>
          <span className="text-sm font-semibold" style={{ color }}>Request a New Ad</span>
        </button>
      </div>
    </div>
  );
}

function Tag({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: color + "18", color }}>{children}</span>
  );
}
