import { useEffect, useState, useCallback, useRef } from "react";
import { api, getToken } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { Plus, Trash2, ChevronRight, ChevronLeft, Check, Upload, X, ImageIcon } from "lucide-react";

interface Package {
  id: number;
  ad_type: string;
  name: string;
  price_display: string;
  price_period: string | null;
  slot_duration: string | null;
  reach_info: string | null;
  is_popular: number;
}

interface Offering {
  id: number;
  ad_type: string;
  icon: string;
  title: string;
  description: string | null;
  where_shown: string | null;
  color: string;
  is_extra: number;
  extra_badge: string | null;
  extra_badge_color: string | null;
  extra_price_label: string | null;
  packages: Package[];
}

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
  payment_link: string | null;
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

const WORKFLOW = [
  { step: "1", icon: "📝", title: "Submit",   desc: "Fill in your ad details and choose a package.",        actor: "Club"  },
  { step: "2", icon: "🔔", title: "Notified", desc: "TapIn staff are alerted immediately for review.",      actor: "Staff" },
  { step: "3", icon: "✅", title: "Approved", desc: "Staff confirm pricing, scheduling, and send a quote.", actor: "Staff" },
  { step: "4", icon: "💳", title: "Payment",  desc: "Club receives a payment link and pays.",               actor: "Club"  },
  { step: "5", icon: "🚀", title: "Live",     desc: "Staff publish the ad — it appears in the app.",        actor: "Staff" },
];

const emptyForm = () => ({
  headline: "", subtitle: "", image_url: "", cta_text: "Book Now", link_url: "",
  requested_start: "", requested_end: "", club_notes: "",
});

export default function Ads() {
  const { toast } = useToast();
  const [requests, setRequests] = useState<AdRequest[]>([]);
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("my-ads");

  const [wizardStep, setWizardStep] = useState(0);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const mainOfferings = offerings.filter(o => !o.is_extra);
  const extraOfferings = offerings.filter(o => !!o.is_extra);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [reqs, offs] = await Promise.all([
        api<AdRequest[]>("/api/portal/ad-requests"),
        api<Offering[]>("/api/portal/ad-offerings"),
      ]);
      setRequests(reqs);
      setOfferings(offs);
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
    setImageUploading(false);
    setActiveTab("new-ad");
  };

  const handleImageUpload = async (file: File) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      toast({ title: "Unsupported format", description: "Please upload a JPG, PNG, or WebP image.", variant: "destructive" });
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast({ title: "File too large", description: "Image must be under 8 MB.", variant: "destructive" });
      return;
    }
    setImageUploading(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const token = getToken();
      const res = await fetch("/api/portal/ad-image/upload", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Upload failed" }));
        throw new Error(err.message ?? "Upload failed");
      }
      const data = await res.json();
      setF("image_url", data.url);
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setImageUploading(false);
    }
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
      setWizardStep(0); setSelectedType(null); setSelectedPackage(null);
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

  const detailAds  = requests.filter(r => r.ad_type === "club_detail");
  const featuredAds = requests.filter(r => r.ad_type === "featured_home");
  const otherAds   = requests.filter(r => !["club_detail","featured_home"].includes(r.ad_type));

  const selectedOffering = offerings.find(o => o.ad_type === selectedType);

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
              <AdSection icon="🏌️" title="Club Detail Page Ads" color="#1a5c38"
                badge={`${detailAds.length} ad${detailAds.length !== 1 ? "s" : ""}`}
                ads={detailAds} onDelete={handleDelete} onNew={() => startWizard("club_detail")} />
              <AdSection icon="⭐" title="Home Screen Featured Clubs" color="#c8a84b"
                badge={`${featuredAds.length} ad${featuredAds.length !== 1 ? "s" : ""}`}
                ads={featuredAds} onDelete={handleDelete} onNew={() => startWizard("featured_home")} />
              {otherAds.length > 0 && (
                <AdSection icon="💡" title="Other Ad Campaigns" color="#374151"
                  badge={`${otherAds.length}`}
                  ads={otherAds} onDelete={handleDelete} onNew={() => startWizard()} />
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
                  <p className="text-sm text-amber-800 mt-0.5">Submit a request — our team is notified immediately. We'll review your creative, confirm pricing and scheduling, then send a payment link. Your ad goes live once payment is confirmed.</p>
                </div>
              </div>
            </>
          )}
        </TabsContent>

        {/* ── REQUEST WIZARD ── */}
        <TabsContent value="new-ad" className="pt-4 max-w-3xl">
          <div className="flex items-center mb-8">
            {["Choose Ad Type","Select Package","Ad Details"].map((label, i) => (
              <div key={i} className="flex items-center flex-1">
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${wizardStep > i ? "bg-[#1a5c38] text-white" : wizardStep === i ? "bg-[#1a5c38] text-white" : "bg-gray-200 text-gray-500"}`}>
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
              {loading ? <Skeleton className="h-40 w-full" /> : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    {offerings.map(o => (
                      <button key={o.ad_type} onClick={() => setSelectedType(o.ad_type)}
                        className={`border-2 rounded-xl p-5 text-left transition-all ${selectedType === o.ad_type ? "border-[#1a5c38] bg-[#e8f5ee]" : "border-gray-200 hover:border-gray-300 bg-white"}`}>
                        <div className="text-2xl mb-2">{o.icon}</div>
                        <div className="font-bold text-base mb-1">{o.title}</div>
                        <div className="text-sm text-muted-foreground mb-3">{o.description}</div>
                        {o.where_shown && (
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: o.color + "18", color: o.color }}>{o.where_shown}</span>
                        )}
                        {o.is_extra && o.extra_price_label && (
                          <span className="text-xs font-bold text-[#1a5c38] mt-2 block">{o.extra_price_label}</span>
                        )}
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-end mt-4">
                    <Button className="bg-[#1a5c38] hover:bg-[#164d30] gap-1" disabled={!selectedType}
                      onClick={() => {
                        const off = offerings.find(o => o.ad_type === selectedType);
                        if (off && off.packages.length > 0) setWizardStep(1);
                        else setWizardStep(2);
                      }}>
                      Next <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 1 — choose package */}
          {wizardStep === 1 && selectedOffering && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">{selectedOffering.icon}</span>
                <h2 className="text-lg font-bold">{selectedOffering.title} — Choose a Package</h2>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {selectedOffering.packages.map(pkg => (
                  <button key={pkg.id} onClick={() => setSelectedPackage(pkg.name)}
                    className={`relative border-2 rounded-xl p-4 text-left transition-all ${selectedPackage === pkg.name ? "border-[#1a5c38] bg-[#e8f5ee]" : pkg.is_popular ? "border-gray-300 bg-white" : "border-gray-200 bg-white hover:border-gray-300"}`}>
                    {pkg.is_popular === 1 && (
                      <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: selectedOffering.color }}>Most Popular</span>
                    )}
                    <div className="font-bold text-sm mb-1">{pkg.name}</div>
                    <div className="text-xl font-black mb-0.5" style={{ color: selectedOffering.color }}>
                      {pkg.price_display}<span className="text-xs font-medium text-muted-foreground">{pkg.price_period}</span>
                    </div>
                    {pkg.slot_duration && <div className="text-xs text-foreground mt-2">⏱ {pkg.slot_duration}</div>}
                    {pkg.reach_info && <div className="text-xs text-muted-foreground mt-1">👥 {pkg.reach_info}</div>}
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
          )}

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
                  <div className="col-span-2 space-y-1.5">
                    <Label>Ad Image</Label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = ""; }}
                    />
                    {form.image_url ? (
                      <div className="relative rounded-xl overflow-hidden border border-gray-200 bg-gray-50" style={{ aspectRatio: "16/9", maxHeight: 220 }}>
                        <img src={form.image_url} alt="Ad preview" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setF("image_url", "")}
                          className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white rounded-full p-1 transition-colors"
                          title="Remove image"
                        >
                          <X className="h-4 w-4" />
                        </button>
                        <div className="absolute bottom-2 left-2 bg-green-600 text-white text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Check className="h-3 w-3" /> Image uploaded
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={imageUploading}
                        className="w-full border-2 border-dashed border-gray-300 hover:border-[#1a5c38] hover:bg-green-50 rounded-xl transition-colors p-6 flex flex-col items-center gap-2 text-gray-500 hover:text-[#1a5c38] disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {imageUploading ? (
                          <>
                            <div className="h-8 w-8 rounded-full border-2 border-[#1a5c38] border-t-transparent animate-spin" />
                            <span className="text-sm font-medium">Uploading…</span>
                          </>
                        ) : (
                          <>
                            <Upload className="h-8 w-8" />
                            <span className="text-sm font-semibold">Click to upload ad image</span>
                            <span className="text-xs text-gray-400">JPG · PNG · WebP &nbsp;·&nbsp; Max 8 MB</span>
                          </>
                        )}
                      </button>
                    )}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-1">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-800">
                        <ImageIcon className="h-3.5 w-3.5" /> Image guidelines for best results
                      </div>
                      <ul className="text-xs text-blue-700 space-y-0.5 list-disc list-inside">
                        <li><strong>Dimensions:</strong> 1920 × 1080 px (16:9 landscape) — mandatory for Featured Home carousel cards</li>
                        <li><strong>Safe zone:</strong> Keep text and logo in the centre 70% — edges may be cropped on smaller screens</li>
                        <li><strong>Format:</strong> JPG or WebP preferred for best compression; PNG for graphics with transparency</li>
                        <li><strong>File size:</strong> Under 3 MB recommended (max 8 MB accepted)</li>
                        <li><strong>Content:</strong> No phone numbers, URLs, or QR codes — use the CTA button and link fields instead</li>
                      </ul>
                    </div>
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
                <Button variant="outline" onClick={() => setWizardStep(selectedOffering && selectedOffering.packages.length > 0 ? 1 : 0)}>
                  <ChevronLeft className="h-4 w-4" /> Back
                </Button>
                <Button className="bg-[#1a5c38] hover:bg-[#164d30]" onClick={handleSubmit} disabled={submitting}>
                  {submitting ? "Submitting…" : "Submit Request →"}
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── OPTIONS & PRICING ── */}
        <TabsContent value="packages" className="pt-4 space-y-8">
          {loading ? <Skeleton className="h-64 w-full" /> : (
            <>
              {mainOfferings.map(o => (
                <div key={o.ad_type}>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-xl">{o.icon}</span>
                    <h2 className="text-lg font-bold">{o.title}</h2>
                    {o.where_shown && (
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: o.color + "18", color: o.color }}>{o.where_shown}</span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">{o.description}</p>
                  {o.packages.length > 0 ? (
                    <div className="grid grid-cols-3 gap-4 mb-3">
                      {o.packages.map(pkg => (
                        <div key={pkg.id} className={`relative border rounded-xl p-4 bg-white ${pkg.is_popular ? "border-gray-300 shadow-sm" : "border-gray-200"}`}>
                          {pkg.is_popular === 1 && (
                            <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-bold px-2.5 py-0.5 rounded-full text-white" style={{ background: o.color }}>Most Popular</span>
                          )}
                          <div className="font-bold text-sm mb-1">{pkg.name}</div>
                          <div className="text-xl font-black" style={{ color: o.color }}>
                            {pkg.price_display}<span className="text-xs font-medium text-muted-foreground">{pkg.price_period}</span>
                          </div>
                          <div className="h-px bg-gray-100 my-3" />
                          {pkg.slot_duration && <div className="text-xs text-foreground">⏱ {pkg.slot_duration}</div>}
                          {pkg.reach_info && <div className="text-xs text-muted-foreground mt-1 mb-3">👥 {pkg.reach_info}</div>}
                          <Button size="sm" className="w-full text-white" style={{ background: o.color }} onClick={() => startWizard(o.ad_type, pkg.name)}>
                            Request This Package
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Button className="bg-[#1a5c38] hover:bg-[#164d30]" onClick={() => startWizard(o.ad_type)}>Enquire</Button>
                  )}
                </div>
              ))}

              {extraOfferings.length > 0 && (
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-xl">💡</span>
                    <h2 className="text-lg font-bold">More Ways to Promote Your Club</h2>
                  </div>
                  <div className="grid grid-cols-3 gap-4 mb-8">
                    {extraOfferings.map(o => (
                      <div key={o.ad_type} className="border rounded-xl p-4 bg-white">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xl">{o.icon}</span>
                          {o.extra_badge && (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: (o.extra_badge_color ?? "#1a5c38") + "18", color: o.extra_badge_color ?? "#1a5c38" }}>{o.extra_badge}</span>
                          )}
                        </div>
                        <div className="font-bold text-sm mb-1">{o.title}</div>
                        <div className="text-xs text-muted-foreground mb-3 leading-relaxed">{o.description}</div>
                        {o.extra_price_label && <div className="text-sm font-bold text-[#1a5c38] mb-2">{o.extra_price_label}</div>}
                        <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => startWizard(o.ad_type)}>Enquire</Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

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
              {ad.package_name && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full mr-1" style={{ background: color + "18", color }}>{ad.package_name}</span>
              )}
              {ad.status === "live" && ad.confirmed_price && (
                <div className="text-xs text-green-700 font-semibold mt-2">✓ Live · R {Number(ad.confirmed_price).toLocaleString()}</div>
              )}
              {ad.status === "approved" && ad.confirmed_price && (
                <div className="text-xs text-blue-700 mt-1">Quote: R {Number(ad.confirmed_price).toLocaleString()} — awaiting payment link</div>
              )}
              {ad.status === "payment_pending" && (
                <div className="mt-2 rounded-lg border border-orange-200 bg-orange-50 p-3 space-y-2">
                  <div className="text-xs font-semibold text-orange-800">
                    💳 Payment required{ad.confirmed_price ? ` — R ${Number(ad.confirmed_price).toLocaleString()}` : ""}
                  </div>
                  {ad.payment_link ? (
                    <a
                      href={ad.payment_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full text-center text-sm font-semibold text-white rounded-lg py-2 px-3"
                      style={{ backgroundColor: "#1a5c38" }}
                    >
                      Pay Now →
                    </a>
                  ) : (
                    <div className="text-xs text-orange-700">TapIn staff will send you a payment link shortly.</div>
                  )}
                </div>
              )}
              {ad.staff_notes && ad.status !== "payment_pending" && (
                <div className="text-xs text-muted-foreground bg-gray-50 rounded p-2 mt-2">Staff: {ad.staff_notes}</div>
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
