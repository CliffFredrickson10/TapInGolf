import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { RefreshCw, Bell, ChevronDown, ChevronRight, Plus, Trash2, Pencil, Check, X, Search } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AdRequest {
  id: number;
  club_id: number;
  club_name: string;
  club_province: string;
  club_email: string | null;
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
  published_ad_id: number | null;
  created_at: string;
  updated_at: string;
}

interface Stats {
  pending_review: number;
  live: number;
  payment_pending: number;
  revenue_this_month: number;
}

interface Package {
  id: number;
  ad_type: string;
  name: string;
  price_display: string;
  price_period: string | null;
  slot_duration: string | null;
  reach_info: string | null;
  is_popular: number;
  active: number;
  sort_order: number;
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
  active: number;
  sort_order: number;
  packages: Package[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS: Record<string, { bg: string; text: string; label: string }> = {
  pending_review:  { bg: "bg-yellow-100", text: "text-yellow-800", label: "Pending Review" },
  approved:        { bg: "bg-blue-100",   text: "text-blue-800",   label: "Approved" },
  payment_pending: { bg: "bg-orange-100", text: "text-orange-800", label: "Payment Pending" },
  live:            { bg: "bg-green-100",  text: "text-green-800",  label: "Live" },
  expired:         { bg: "bg-gray-100",   text: "text-gray-500",   label: "Expired" },
  rejected:        { bg: "bg-red-100",    text: "text-red-700",    label: "Rejected" },
};

const AD_TYPE_META: Record<string, { label: string; color: string; icon: string }> = {
  club_detail:    { label: "Club Detail Page",     color: "#1a5c38", icon: "🏌️" },
  featured_home:  { label: "Home Screen Featured", color: "#c8a84b", icon: "⭐" },
  explore:        { label: "Explore Spotlight",    color: "#0891b2", icon: "🔍" },
  push:           { label: "Push Notification",    color: "#7c3aed", icon: "📲" },
  tournament:     { label: "Tournament Sponsor",   color: "#c2410c", icon: "🏆" },
  newsletter:     { label: "Newsletter Feature",   color: "#0f766e", icon: "📧" },
  nearby_alert:   { label: "Nearby Club Alert",    color: "#b45309", icon: "🗺️" },
  tee_time_deal:  { label: "Tee Time Deal",        color: "#c2410c", icon: "🎯" },
};

const STATUS_FILTERS = ["all", "pending_review", "approved", "payment_pending", "live", "expired", "rejected"];

// ─── Featured Carousel Tab ────────────────────────────────────────────────────

interface FeaturedCarouselClub {
  id: number;
  name: string;
  location: string;
  province: string;
  has_paid_ad: boolean;
  ad_slot_duration: string | null;
  slot_seconds: number;
  campaign_end: string | null;
  package_name: string | null;
}

const SLOT_OPTIONS = [
  { label: "5 sec  (Bronze tier)", value: 5 },
  { label: "8 sec  (Default)",      value: 8 },
  { label: "10 sec (Silver tier)",  value: 10 },
  { label: "15 sec (Gold tier)",    value: 15 },
];

function FeaturedCarouselTab() {
  const { toast } = useToast();
  const [clubs, setClubs] = useState<FeaturedCarouselClub[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: number; name: string; province: string }[]>([]);
  const [selectedClub, setSelectedClub] = useState<{ id: number; name: string; province: string } | null>(null);
  const [slotSeconds, setSlotSeconds] = useState(8);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ clubs: FeaturedCarouselClub[] }>("/api/admin/featured-carousel");
      setClubs(data.clubs);
    } catch (e: any) {
      toast({ title: "Error loading carousel", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const remove = async (club: FeaturedCarouselClub) => {
    setRemoving(club.id);
    try {
      await api(`/api/admin/clubs/${club.id}/feature`, { method: "DELETE" });
      setClubs(prev => prev.filter(c => c.id !== club.id));
      toast({ title: "Removed from carousel", description: club.name });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setRemoving(null); }
  };

  const addToCarousel = async () => {
    if (!selectedClub) return;
    setAdding(true);
    try {
      await api(`/api/admin/clubs/${selectedClub.id}/feature`, {
        method: "PUT",
        body: JSON.stringify({ slot_seconds: slotSeconds }),
      });
      toast({ title: "Added to carousel", description: selectedClub.name });
      setSelectedClub(null);
      setSearchQ("");
      setSearchResults([]);
      await load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setAdding(false); }
  };

  const onSearchChange = (q: string) => {
    setSearchQ(q);
    setSelectedClub(null);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q.trim()) { setSearchResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await api<{ clubs: any[] }>(`/api/admin/clubs-list?q=${encodeURIComponent(q)}&active=1&limit=10`);
        setSearchResults(data.clubs.map((c: any) => ({ id: c.id, name: c.name, province: c.province })));
      } catch {} finally { setSearching(false); }
    }, 300);
  };

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-semibold text-lg">Home Screen Carousel</h2>
          <p className="text-sm text-muted-foreground">
            {loading ? "Loading…" : clubs.length === 0
              ? "Carousel is empty — add clubs below so users always see content"
              : `${clubs.length} club${clubs.length !== 1 ? "s" : ""} in rotation`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {/* Live carousel slots */}
      <div className="space-y-2">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)
        ) : clubs.length === 0 ? (
          <div className="border-2 border-dashed border-amber-200 bg-amber-50 rounded-xl p-8 text-center">
            <div className="text-3xl mb-2">⭐</div>
            <p className="font-semibold text-amber-800">No clubs in the featured carousel</p>
            <p className="text-sm text-amber-600 mt-1">Use the form below to add clubs — they'll appear on every golfer's home screen.</p>
          </div>
        ) : clubs.map((club, i) => (
          <div key={club.id} className="flex items-center gap-3 bg-white border rounded-lg px-4 py-3 shadow-sm hover:border-[#1a5c38]/30 transition-colors">
            <div className="w-7 h-7 rounded-full bg-[#1a5c38]/10 flex items-center justify-center text-xs font-bold text-[#1a5c38] flex-shrink-0">
              {i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm">{club.name}</span>
                {club.has_paid_ad ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                    ⭐ {club.package_name ?? "Paid Ad"}
                  </span>
                ) : (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                    🏠 TapIn House Pick
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                <span>{club.province}</span>
                <span>·</span>
                <span className="font-medium text-[#1a5c38]">⏱ {club.slot_seconds}s per rotation</span>
                {club.campaign_end && (
                  <>
                    <span>·</span>
                    <span>Paid ad ends {club.campaign_end.slice(0, 10)}</span>
                  </>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-red-400 hover:text-red-600 hover:bg-red-50 flex-shrink-0"
              disabled={removing === club.id}
              onClick={() => remove(club)}
              title="Remove from carousel"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      {/* Add a club */}
      <div className="border rounded-xl p-5 bg-muted/30 space-y-4">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Plus className="h-4 w-4 text-[#1a5c38]" />
          Add a Club to the Carousel
        </h3>
        <div className="flex gap-3 items-end flex-wrap">
          <div className="relative flex-1 min-w-56">
            <label className="text-xs font-medium mb-1.5 block text-muted-foreground">Search clubs</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Type club name…"
                value={selectedClub ? selectedClub.name : searchQ}
                onChange={e => { if (!selectedClub) onSearchChange(e.target.value); }}
                onFocus={() => { if (selectedClub) { setSelectedClub(null); setSearchQ(""); } }}
              />
            </div>
            {!selectedClub && searchQ.trim() && (
              <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-white border rounded-lg shadow-lg max-h-52 overflow-y-auto">
                {searching ? (
                  <div className="px-4 py-3 text-sm text-muted-foreground">Searching…</div>
                ) : searchResults.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-muted-foreground">No clubs found</div>
                ) : searchResults.map(c => (
                  <button key={c.id} className="w-full text-left px-4 py-2.5 hover:bg-muted/60 text-sm border-b last:border-0 transition-colors"
                    onClick={() => { setSelectedClub(c); setSearchResults([]); }}>
                    <span className="font-medium">{c.name}</span>
                    <span className="text-muted-foreground ml-2 text-xs">{c.province}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="w-52">
            <label className="text-xs font-medium mb-1.5 block text-muted-foreground">Slot duration</label>
            <select
              className="w-full border rounded-md px-3 py-2 text-sm bg-background h-10"
              value={slotSeconds}
              onChange={e => setSlotSeconds(Number(e.target.value))}
            >
              {SLOT_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <Button
            onClick={addToCarousel}
            disabled={!selectedClub || adding}
            className="bg-[#1a5c38] hover:bg-[#154d2f] text-white gap-1.5 h-10"
          >
            <Plus className="h-4 w-4" />
            {adding ? "Adding…" : "Add to Carousel"}
          </Button>
        </div>

        {selectedClub && (
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{selectedClub.name}</span> ({selectedClub.province}) will appear in the home screen carousel with a <span className="font-semibold text-[#1a5c38]">{slotSeconds}-second</span> rotation slot.
          </p>
        )}
      </div>

      <p className="text-xs text-muted-foreground border-t pt-4">
        Clubs with an active paid <strong>Home Screen Featured</strong> ad campaign use their purchased slot duration and are labelled <span className="bg-amber-100 text-amber-700 px-1 rounded text-[10px] font-bold">⭐ Paid Ad</span>.
        House picks are managed here and labelled <span className="bg-blue-100 text-blue-700 px-1 rounded text-[10px] font-bold">🏠 TapIn House Pick</span>.
      </p>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function StaffAds() {
  const { toast } = useToast();
  const [allRequests, setAllRequests] = useState<AdRequest[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AdRequest | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("queue");

  const [cfPrice, setCfPrice] = useState("");
  const [cfStart, setCfStart] = useState("");
  const [cfEnd, setCfEnd] = useState("");
  const [cfSlot, setCfSlot] = useState("");
  const [cfSharing, setCfSharing] = useState("");
  const [cfNotes, setCfNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [actioning, setActioning] = useState(false);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const [reqs, statsData] = await Promise.all([
        api<AdRequest[]>("/api/admin/ad-requests"),
        api<Stats>("/api/admin/ad-requests/stats"),
      ]);
      setAllRequests(reqs);
      setStats(statsData);
      if (selected) {
        const refreshed = reqs.find(r => r.id === selected.id);
        if (refreshed) setSelected(refreshed);
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [toast, selected?.id]);

  useEffect(() => { loadRequests(); }, []);

  const selectReq = (req: AdRequest) => {
    setSelected(req);
    setCfPrice(req.confirmed_price ? String(req.confirmed_price) : "");
    setCfStart(req.confirmed_start ? req.confirmed_start.slice(0, 10) : "");
    setCfEnd(req.confirmed_end ? req.confirmed_end.slice(0, 10) : "");
    setCfSlot(req.slot_duration ?? "");
    setCfSharing(req.sharing_tier ?? "");
    setCfNotes(req.staff_notes ?? "");
  };

  const saveConfig = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const updated = await api<AdRequest>(`/api/admin/ad-requests/${selected.id}`, {
        method: "PUT",
        body: JSON.stringify({
          confirmed_price: cfPrice ? Number(cfPrice) : null,
          confirmed_start: cfStart || null,
          confirmed_end: cfEnd || null,
          slot_duration: cfSlot || null,
          sharing_tier: cfSharing || null,
          staff_notes: cfNotes || null,
        }),
      });
      setSelected(updated);
      setAllRequests(prev => prev.map(r => r.id === updated.id ? updated : r));
      toast({ title: "Configuration saved" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const action = async (endpoint: string, label: string, body?: object) => {
    if (!selected) return;
    setActioning(true);
    try {
      await api(`/api/admin/ad-requests/${selected.id}/${endpoint}`, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      });
      toast({ title: label });
      await loadRequests();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setActioning(false); }
  };

  const queueItems    = allRequests.filter(r => r.status === "pending_review");
  const liveItems     = allRequests.filter(r => r.status === "live");
  const filteredItems = statusFilter === "all" ? allRequests : allRequests.filter(r => r.status === statusFilter);
  const listForTab    = activeTab === "queue" ? queueItems : activeTab === "live" ? liveItems : filteredItems;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-8 pt-8 pb-0 space-y-5 flex-shrink-0">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Ad Management</h1>
            <p className="text-sm text-muted-foreground mt-1">Review club ad requests, set pricing, and publish approved campaigns.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => { loadRequests(); }} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>

        {stats && (
          <div className="grid grid-cols-4 gap-3">
            <StatCard label="Pending Review"  value={stats.pending_review}  color="text-yellow-700" bg="bg-yellow-50" border="border-yellow-200" icon="🔔" />
            <StatCard label="Live Now"        value={stats.live}            color="text-green-700"  bg="bg-green-50"  border="border-green-200"  icon="🟢" />
            <StatCard label="Payment Pending" value={stats.payment_pending} color="text-orange-700" bg="bg-orange-50" border="border-orange-200" icon="💳" />
            <StatCard label="Revenue This Mo" value={`R ${Number(stats.revenue_this_month).toLocaleString()}`} color="text-[#1a5c38]" bg="bg-[#e8f5ee]" border="border-[#bbddc9]" icon="💰" />
          </div>
        )}

        <Tabs value={activeTab} onValueChange={v => { setActiveTab(v); setSelected(null); }}>
          <TabsList>
            <TabsTrigger value="queue" className="gap-1.5">
              <Bell className="h-3.5 w-3.5" />
              Review Queue
              {(stats?.pending_review ?? 0) > 0 && (
                <span className="ml-1 bg-yellow-400 text-yellow-900 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{stats!.pending_review}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="all">All Requests</TabsTrigger>
            <TabsTrigger value="live">Live Campaigns</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="pricing">Manage Pricing</TabsTrigger>
            <TabsTrigger value="carousel" className="gap-1.5">⭐ Featured Carousel</TabsTrigger>
          </TabsList>

          <TabsContent value="analytics" className="pt-4">
            <AnalyticsPanel requests={allRequests} />
          </TabsContent>

          <TabsContent value="pricing" className="pt-4 pb-8">
            <PricingManager />
          </TabsContent>

          <TabsContent value="carousel" className="pt-4 pb-8">
            <FeaturedCarouselTab />
          </TabsContent>

          {["queue","all","live"].map(tabId => (
            <TabsContent key={tabId} value={tabId} className="pt-0 mt-0">
              {tabId === "all" && (
                <div className="flex gap-2 flex-wrap py-3">
                  {STATUS_FILTERS.map(s => (
                    <button key={s} onClick={() => setStatusFilter(s)}
                      className={`text-xs font-semibold px-3 py-1 rounded-full border transition-colors ${statusFilter === s ? "bg-[#1a5c38] text-white border-[#1a5c38]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}>
                      {s === "all" ? "All" : STATUS[s]?.label ?? s}
                    </button>
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {/* Split pane for queue / all / live */}
      {["queue","all","live"].includes(activeTab) && (
        <div className="flex flex-1 min-h-0 mx-8 mb-8 rounded-b-xl overflow-hidden border border-t-0 bg-white">
          <div className="w-80 border-r flex-shrink-0 overflow-y-auto">
            {loading ? (
              <div className="p-4 space-y-3">{Array.from({length:4}).map((_,i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
            ) : listForTab.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                {activeTab === "queue" ? "No pending requests 🎉" : "No requests in this view"}
              </div>
            ) : listForTab.map(req => {
              const st = STATUS[req.status] ?? STATUS.pending_review;
              const tp = AD_TYPE_META[req.ad_type];
              const isSelected = selected?.id === req.id;
              return (
                <div key={req.id} onClick={() => selectReq(req)}
                  className={`px-4 py-3.5 border-b cursor-pointer transition-colors ${isSelected ? "bg-[#e8f5ee] border-l-2 border-l-[#1a5c38]" : "hover:bg-gray-50 border-l-2 border-l-transparent"}`}>
                  <div className="flex justify-between items-start mb-1">
                    <div className="font-semibold text-sm truncate flex-1 mr-2">{req.club_name}</div>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${st.bg} ${st.text}`}>{st.label}</span>
                  </div>
                  <div className="text-xs text-muted-foreground truncate mb-1.5">{req.headline}</div>
                  <div className="flex items-center gap-2">
                    {tp && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: tp.color + "18", color: tp.color }}>{tp.icon} {tp.label}</span>}
                    <span className="text-[10px] text-muted-foreground">{format(new Date(req.created_at), "d MMM")}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex-1 overflow-y-auto">
            {!selected ? (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Select a request to review</div>
            ) : (
              <DetailPanel
                req={selected}
                cfPrice={cfPrice} setCfPrice={setCfPrice}
                cfStart={cfStart} setCfStart={setCfStart}
                cfEnd={cfEnd} setCfEnd={setCfEnd}
                cfSlot={cfSlot} setCfSlot={setCfSlot}
                cfSharing={cfSharing} setCfSharing={setCfSharing}
                cfNotes={cfNotes} setCfNotes={setCfNotes}
                saving={saving} actioning={actioning}
                onSave={saveConfig}
                onApprove={() => action("approve", "Request approved", {
                  confirmed_price: cfPrice ? Number(cfPrice) : null,
                  confirmed_start: cfStart || null, confirmed_end: cfEnd || null,
                  slot_duration: cfSlot || null, sharing_tier: cfSharing || null, staff_notes: cfNotes || null,
                })}
                onPaymentRequested={() => action("payment-requested", "Marked as payment pending")}
                onPublish={() => action("publish", "Ad published! It is now live in the app.")}
                onReject={() => action("reject", "Request rejected", { staff_notes: cfNotes || null })}
                onUnpublish={() => action("unpublish", "Ad unpublished")}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Pricing Manager (self-contained) ────────────────────────────────────────

function PricingManager() {
  const { toast } = useToast();
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddOffering, setShowAddOffering] = useState(false);
  const [saving, setSaving] = useState(false);

  const [nForm, setNForm] = useState({ ad_type: "", icon: "📢", title: "", description: "", where_shown: "", color: "#1a5c38", is_extra: false, extra_badge: "", extra_badge_color: "#1a5c38", extra_price_label: "" });

  const load = async () => {
    setLoading(true);
    try {
      const data = await api<Offering[]>("/api/admin/ad-offerings");
      setOfferings(data);
    } catch (e: any) {
      toast({ title: "Error loading offerings", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const addOffering = async () => {
    setSaving(true);
    try {
      await api("/api/admin/ad-offerings", { method: "POST", body: JSON.stringify({ ...nForm, is_extra: nForm.is_extra ? 1 : 0 }) });
      toast({ title: "Offering added" });
      setShowAddOffering(false);
      setNForm({ ad_type: "", icon: "📢", title: "", description: "", where_shown: "", color: "#1a5c38", is_extra: false, extra_badge: "", extra_badge_color: "#1a5c38", extra_price_label: "" });
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const mainOfferings  = offerings.filter(o => !o.is_extra);
  const extraOfferings = offerings.filter(o => !!o.is_extra);

  if (loading) return <div className="space-y-3">{Array.from({length:3}).map((_,i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}</div>;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Advertising Offerings & Pricing</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Manage the ad types, packages, and pricing shown to clubs in the Options &amp; Pricing tab.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={load} className="gap-1.5"><RefreshCw className="h-3.5 w-3.5" /> Refresh</Button>
          <Button size="sm" className="bg-[#1a5c38] hover:bg-[#164d30] gap-1.5" onClick={() => setShowAddOffering(v => !v)}>
            <Plus className="h-3.5 w-3.5" /> Add Offering
          </Button>
        </div>
      </div>

      {showAddOffering && (
        <div className="border-2 border-dashed border-[#1a5c38] rounded-xl p-5 bg-[#f0faf4] space-y-4">
          <div className="font-bold text-[#1a5c38]">New Ad Offering</div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1"><Label className="text-xs">Ad Type Slug *</Label><Input placeholder="podcast_ad" value={nForm.ad_type} onChange={e => setNForm(f => ({ ...f, ad_type: e.target.value }))} className="h-8 text-sm" /></div>
            <div className="space-y-1"><Label className="text-xs">Icon</Label><Input placeholder="📢" value={nForm.icon} onChange={e => setNForm(f => ({ ...f, icon: e.target.value }))} className="h-8 text-sm" /></div>
            <div className="space-y-1"><Label className="text-xs">Color</Label><div className="flex gap-1.5"><Input type="color" value={nForm.color} onChange={e => setNForm(f => ({ ...f, color: e.target.value }))} className="h-8 w-10 p-0.5" /><Input value={nForm.color} onChange={e => setNForm(f => ({ ...f, color: e.target.value }))} className="h-8 text-sm flex-1" /></div></div>
            <div className="col-span-3 space-y-1"><Label className="text-xs">Title *</Label><Input placeholder="Podcast Sponsor Spot" value={nForm.title} onChange={e => setNForm(f => ({ ...f, title: e.target.value }))} className="h-8 text-sm" /></div>
            <div className="col-span-3 space-y-1"><Label className="text-xs">Description</Label><Textarea rows={2} value={nForm.description} onChange={e => setNForm(f => ({ ...f, description: e.target.value }))} className="text-sm" /></div>
            <div className="col-span-2 space-y-1"><Label className="text-xs">Where Shown (badge)</Label><Input placeholder="Podcast · Niche audience" value={nForm.where_shown} onChange={e => setNForm(f => ({ ...f, where_shown: e.target.value }))} className="h-8 text-sm" /></div>
            <div className="flex items-end pb-1 gap-2"><input type="checkbox" id="nf-extra" checked={nForm.is_extra} onChange={e => setNForm(f => ({ ...f, is_extra: e.target.checked }))} className="h-4 w-4 accent-[#1a5c38]" /><Label htmlFor="nf-extra" className="text-xs cursor-pointer">Show as Extra Option</Label></div>
            {nForm.is_extra && (<>
              <div className="space-y-1"><Label className="text-xs">Badge Label</Label><Input placeholder="Popular" value={nForm.extra_badge} onChange={e => setNForm(f => ({ ...f, extra_badge: e.target.value }))} className="h-8 text-sm" /></div>
              <div className="space-y-1"><Label className="text-xs">Badge Color</Label><div className="flex gap-1.5"><Input type="color" value={nForm.extra_badge_color} onChange={e => setNForm(f => ({ ...f, extra_badge_color: e.target.value }))} className="h-8 w-10 p-0.5" /><Input value={nForm.extra_badge_color} onChange={e => setNForm(f => ({ ...f, extra_badge_color: e.target.value }))} className="h-8 text-sm flex-1" /></div></div>
              <div className="space-y-1"><Label className="text-xs">Price Label</Label><Input placeholder="From R 399/mo" value={nForm.extra_price_label} onChange={e => setNForm(f => ({ ...f, extra_price_label: e.target.value }))} className="h-8 text-sm" /></div>
            </>)}
          </div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" className="bg-[#1a5c38] hover:bg-[#164d30]" onClick={addOffering} disabled={saving || !nForm.ad_type || !nForm.title}>{saving ? "Adding…" : "Add Offering"}</Button>
            <Button size="sm" variant="outline" onClick={() => setShowAddOffering(false)}>Cancel</Button>
          </div>
        </div>
      )}

      <div>
        <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Main Ad Types</div>
        <p className="text-xs text-muted-foreground mb-3">Full ad types shown as primary offerings with selectable packages.</p>
        <div className="space-y-4">
          {mainOfferings.map(o => <OfferingCard key={o.id} offering={o} onRefresh={load} toast={toast} />)}
        </div>
      </div>

      <div>
        <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Extra Options</div>
        <p className="text-xs text-muted-foreground mb-3">Shown in the 'More Ways to Promote' section — enquiry-only, no packages.</p>
        <div className="space-y-2 border rounded-xl overflow-hidden bg-white divide-y">
          {extraOfferings.map(o => <OfferingCard key={o.id} offering={o} onRefresh={load} toast={toast} compact />)}
        </div>
      </div>
    </div>
  );
}

// ─── Self-contained Offering Card ─────────────────────────────────────────────

function OfferingCard({ offering, onRefresh, toast, compact = false }: {
  offering: Offering;
  onRefresh: () => void;
  toast: (opts: any) => void;
  compact?: boolean;
}) {
  const [editingOffering, setEditingOffering] = useState(false);
  const [editingPkgId, setEditingPkgId] = useState<number | null>(null);
  const [addingPkg, setAddingPkg] = useState(false);
  const [saving, setSaving] = useState(false);

  const [oForm, setOF] = useState({
    icon: offering.icon, title: offering.title, description: offering.description ?? "",
    where_shown: offering.where_shown ?? "", color: offering.color,
    extra_badge: offering.extra_badge ?? "", extra_badge_color: offering.extra_badge_color ?? "#1a5c38",
    extra_price_label: offering.extra_price_label ?? "",
  });

  const [pForm, setPF] = useState({ name: "", price_display: "", price_period: "/month", slot_duration: "", reach_info: "", is_popular: false });

  const do_ = async (fn: () => Promise<any>, msg: string, after?: () => void) => {
    setSaving(true);
    try {
      await fn();
      toast({ title: msg });
      onRefresh();
      after?.();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const saveOffering = () => do_(
    () => api(`/api/admin/ad-offerings/${offering.id}`, { method: "PUT", body: JSON.stringify({ ...oForm, is_extra: offering.is_extra ? 1 : 0 }) }),
    "Offering saved", () => setEditingOffering(false)
  );

  const toggleActive = () => do_(
    () => api(`/api/admin/ad-offerings/${offering.id}/toggle`, { method: "POST" }),
    offering.active ? "Offering hidden" : "Offering visible"
  );

  const deleteOffering = () => {
    if (!confirm(`Delete "${offering.title}" and all its packages?`)) return;
    do_(() => api(`/api/admin/ad-offerings/${offering.id}`, { method: "DELETE" }), "Offering deleted");
  };

  const startEditPkg = (pkg: Package) => {
    setEditingPkgId(pkg.id);
    setAddingPkg(false);
    setPF({ name: pkg.name, price_display: pkg.price_display, price_period: pkg.price_period ?? "", slot_duration: pkg.slot_duration ?? "", reach_info: pkg.reach_info ?? "", is_popular: !!pkg.is_popular });
  };

  const savePkg = (pkgId: number) => do_(
    () => api(`/api/admin/ad-packages/${pkgId}`, { method: "PUT", body: JSON.stringify({ ...pForm, is_popular: pForm.is_popular ? 1 : 0 }) }),
    "Package saved", () => setEditingPkgId(null)
  );

  const addPkg = () => do_(
    () => api("/api/admin/ad-packages", { method: "POST", body: JSON.stringify({ ...pForm, ad_type: offering.ad_type, is_popular: pForm.is_popular ? 1 : 0 }) }),
    "Package added", () => { setAddingPkg(false); setPF({ name: "", price_display: "", price_period: "/month", slot_duration: "", reach_info: "", is_popular: false }); }
  );

  const deletePkg = (pkgId: number) => {
    if (!confirm("Delete this package?")) return;
    do_(() => api(`/api/admin/ad-packages/${pkgId}`, { method: "DELETE" }), "Package deleted");
  };

  return (
    <div className={`border rounded-xl overflow-hidden bg-white ${!offering.active ? "opacity-60" : ""}`}>
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-gray-50">
        <span className="text-xl">{offering.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-sm">{offering.title}</span>
            <span className="text-[11px] font-mono bg-white border px-1.5 py-0.5 rounded text-gray-500">{offering.ad_type}</span>
            {!offering.active && <span className="text-[11px] font-semibold text-gray-400">Hidden</span>}
          </div>
          {compact && offering.extra_price_label && (
            <span className="text-xs font-bold" style={{ color: offering.color }}>{offering.extra_price_label}</span>
          )}
        </div>
        <div className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ background: offering.color }} />
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" onClick={() => { setEditingOffering(v => !v); setEditingPkgId(null); setAddingPkg(false); }}>
            <Pencil className="h-3 w-3" /> Edit
          </Button>
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={toggleActive} disabled={saving}>
            {offering.active ? "Hide" : "Show"}
          </Button>
          <Button size="sm" variant="outline" className="h-7 px-2 text-red-500 hover:bg-red-50 border-red-100" onClick={deleteOffering} disabled={saving}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Offering edit form */}
      {editingOffering && (
        <div className="px-4 py-4 border-b bg-blue-50 space-y-3">
          <div className="text-xs font-bold text-blue-700 uppercase tracking-wide">Edit Offering Details</div>
          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1"><Label className="text-xs">Icon</Label><Input value={oForm.icon} onChange={e => setOF(f => ({ ...f, icon: e.target.value }))} className="h-8 text-sm" /></div>
            <div className="col-span-2 space-y-1"><Label className="text-xs">Title</Label><Input value={oForm.title} onChange={e => setOF(f => ({ ...f, title: e.target.value }))} className="h-8 text-sm" /></div>
            <div className="space-y-1"><Label className="text-xs">Color</Label><div className="flex gap-1.5"><Input type="color" value={oForm.color} onChange={e => setOF(f => ({ ...f, color: e.target.value }))} className="h-8 w-10 p-0.5 cursor-pointer" /><Input value={oForm.color} onChange={e => setOF(f => ({ ...f, color: e.target.value }))} className="h-8 text-sm flex-1" /></div></div>
            <div className="col-span-4 space-y-1"><Label className="text-xs">Description</Label><Textarea rows={2} value={oForm.description} onChange={e => setOF(f => ({ ...f, description: e.target.value }))} className="text-sm" /></div>
            <div className="col-span-2 space-y-1"><Label className="text-xs">Where Shown (badge text)</Label><Input value={oForm.where_shown} onChange={e => setOF(f => ({ ...f, where_shown: e.target.value }))} className="h-8 text-sm" /></div>
            {offering.is_extra ? (<>
              <div className="space-y-1"><Label className="text-xs">Badge Label</Label><Input value={oForm.extra_badge} onChange={e => setOF(f => ({ ...f, extra_badge: e.target.value }))} className="h-8 text-sm" /></div>
              <div className="space-y-1"><Label className="text-xs">Price Label</Label><Input value={oForm.extra_price_label} onChange={e => setOF(f => ({ ...f, extra_price_label: e.target.value }))} className="h-8 text-sm" placeholder="From R 399/mo" /></div>
            </>) : <div />}
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="bg-[#1a5c38] hover:bg-[#164d30] gap-1" onClick={saveOffering} disabled={saving}><Check className="h-3.5 w-3.5" />{saving ? "Saving…" : "Save"}</Button>
            <Button size="sm" variant="outline" className="gap-1" onClick={() => setEditingOffering(false)}><X className="h-3.5 w-3.5" />Cancel</Button>
          </div>
        </div>
      )}

      {/* Packages section (main offerings only) */}
      {!compact && (
        <div className="divide-y">
          {offering.packages.length === 0 && !addingPkg && (
            <div className="px-4 py-3 text-sm text-muted-foreground italic">No packages yet.</div>
          )}
          {offering.packages.map(pkg => (
            <div key={pkg.id}>
              {editingPkgId === pkg.id ? (
                /* Edit form for this package */
                <div className="px-4 py-4 bg-amber-50 space-y-3">
                  <div className="text-xs font-bold text-amber-700 uppercase tracking-wide">Editing — {pkg.name}</div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-3 space-y-1"><Label className="text-xs">Package Name</Label><Input value={pForm.name} onChange={e => setPF(f => ({ ...f, name: e.target.value }))} className="h-8 text-sm" /></div>
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">Price *</Label>
                      <Input value={pForm.price_display} onChange={e => setPF(f => ({ ...f, price_display: e.target.value }))} className="h-8 text-sm" placeholder="R 499" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">Period</Label>
                      <Input value={pForm.price_period} onChange={e => setPF(f => ({ ...f, price_period: e.target.value }))} className="h-8 text-sm" placeholder="/month" />
                    </div>
                    {offering.ad_type !== "club_detail" && (
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold">Slot Duration</Label>
                        <Input value={pForm.slot_duration} onChange={e => setPF(f => ({ ...f, slot_duration: e.target.value }))} className="h-8 text-sm" placeholder="10 sec / rotation" />
                      </div>
                    )}
                    <div className={`space-y-1 ${offering.ad_type === "club_detail" ? "col-span-2" : ""}`}><Label className="text-xs">Reach Info</Label><Input value={pForm.reach_info} onChange={e => setPF(f => ({ ...f, reach_info: e.target.value }))} className="h-8 text-sm" placeholder="~500 club views/month" /></div>
                    <div className="flex items-end gap-2 pb-1"><input type="checkbox" checked={pForm.is_popular} onChange={e => setPF(f => ({ ...f, is_popular: e.target.checked }))} className="h-4 w-4 accent-[#1a5c38]" /><Label className="text-xs font-semibold">Mark as Popular</Label></div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="bg-[#1a5c38] hover:bg-[#164d30] gap-1" onClick={() => savePkg(pkg.id)} disabled={saving}><Check className="h-3.5 w-3.5" />{saving ? "Saving…" : "Save Changes"}</Button>
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => setEditingPkgId(null)}><X className="h-3.5 w-3.5" />Cancel</Button>
                  </div>
                </div>
              ) : (
                /* Display row */
                <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                  {pkg.is_popular === 1 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white flex-shrink-0" style={{ background: offering.color }}>Popular</span>}
                  <div className={`flex-1 min-w-0 grid gap-4 items-center ${offering.ad_type === "club_detail" ? "grid-cols-3" : "grid-cols-4"}`}>
                    <div className="font-semibold text-sm">{pkg.name}</div>
                    <div>
                      <span className="text-base font-black" style={{ color: offering.color }}>{pkg.price_display}</span>
                      <span className="text-xs text-muted-foreground ml-1">{pkg.price_period}</span>
                    </div>
                    {offering.ad_type !== "club_detail" && (
                      <div className="text-xs text-muted-foreground">{pkg.slot_duration && `⏱ ${pkg.slot_duration}`}</div>
                    )}
                    <div className="text-xs text-muted-foreground">{pkg.reach_info && `👥 ${pkg.reach_info}`}</div>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <Button size="sm" variant="outline" className="h-7 px-2 gap-1 text-xs" onClick={() => startEditPkg(pkg)}>
                      <Pencil className="h-3 w-3" /> Edit
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 px-2 text-red-500 hover:bg-red-50 border-red-100" onClick={() => deletePkg(pkg.id)} disabled={saving}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Add package form */}
          {addingPkg && (
            <div className="px-4 py-4 bg-green-50 space-y-3">
              <div className="text-xs font-bold text-green-700 uppercase tracking-wide">New Package</div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-3 space-y-1"><Label className="text-xs">Package Name *</Label><Input value={pForm.name} onChange={e => setPF(f => ({ ...f, name: e.target.value }))} className="h-8 text-sm" placeholder="e.g. Gold Spot" /></div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Price *</Label>
                  <Input value={pForm.price_display} onChange={e => setPF(f => ({ ...f, price_display: e.target.value }))} className="h-8 text-sm" placeholder="R 499" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Period</Label>
                  <Input value={pForm.price_period} onChange={e => setPF(f => ({ ...f, price_period: e.target.value }))} className="h-8 text-sm" placeholder="/month" />
                </div>
                {offering.ad_type !== "club_detail" && (
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Slot Duration</Label>
                    <Input value={pForm.slot_duration} onChange={e => setPF(f => ({ ...f, slot_duration: e.target.value }))} className="h-8 text-sm" placeholder="10 sec / rotation" />
                  </div>
                )}
                <div className={`space-y-1 ${offering.ad_type === "club_detail" ? "col-span-2" : ""}`}><Label className="text-xs">Reach Info</Label><Input value={pForm.reach_info} onChange={e => setPF(f => ({ ...f, reach_info: e.target.value }))} className="h-8 text-sm" placeholder="~500 club views/month" /></div>
                <div className="flex items-end gap-2 pb-1"><input type="checkbox" checked={pForm.is_popular} onChange={e => setPF(f => ({ ...f, is_popular: e.target.checked }))} className="h-4 w-4 accent-[#1a5c38]" /><Label className="text-xs">Mark as Popular</Label></div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="bg-[#1a5c38] hover:bg-[#164d30] gap-1" onClick={addPkg} disabled={saving || !pForm.name || !pForm.price_display}><Check className="h-3.5 w-3.5" />{saving ? "Adding…" : "Add Package"}</Button>
                <Button size="sm" variant="outline" className="gap-1" onClick={() => setAddingPkg(false)}><X className="h-3.5 w-3.5" />Cancel</Button>
              </div>
            </div>
          )}

          {/* Add package button */}
          {!addingPkg && (
            <div className="px-4 py-2.5 bg-gray-50">
              <button onClick={() => { setAddingPkg(true); setEditingPkgId(null); setPF({ name: "", price_display: "", price_period: "/month", slot_duration: "", reach_info: "", is_popular: false }); }}
                className="flex items-center gap-1.5 text-xs text-[#1a5c38] font-semibold hover:underline">
                <Plus className="h-3.5 w-3.5" /> Add Package
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Analytics Panel ─────────────────────────────────────────────────────────

function AnalyticsPanel({ requests }: { requests: AdRequest[] }) {
  const live    = requests.filter(r => r.status === "live");
  const expired = requests.filter(r => r.status === "expired");
  const revenue = [...live, ...expired].reduce((s, r) => s + Number(r.confirmed_price ?? 0), 0);
  const total   = requests.length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Total Requests",     value: total },
          { label: "Total Live",         value: live.length },
          { label: "Total Revenue",      value: `R ${revenue.toLocaleString()}` },
          { label: "Avg Campaign Value", value: revenue > 0 && [...live,...expired].length > 0 ? `R ${Math.round(revenue / [...live,...expired].length).toLocaleString()}` : "—" },
        ].map((s, i) => (
          <div key={i} className="border rounded-xl p-4 bg-white">
            <div className="text-xl font-black text-[#1a5c38]">{s.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>
      <div className="border rounded-xl overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 border-b">
            <tr>{["Club","Province","Ad Type","Package","Status","Confirmed Price","Submitted"].map(h => (
              <th key={h} className="text-left px-4 py-2.5 text-xs font-bold text-muted-foreground uppercase tracking-wide">{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {requests.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground text-sm">No requests yet</td></tr>
            ) : requests.map(r => {
              const st = STATUS[r.status] ?? STATUS.pending_review;
              const tp = AD_TYPE_META[r.ad_type];
              return (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-semibold">{r.club_name}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{r.club_province}</td>
                  <td className="px-4 py-3">{tp && <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: tp.color + "18", color: tp.color }}>{tp.icon} {tp.label}</span>}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{r.package_name ?? "—"}</td>
                  <td className="px-4 py-3"><span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${st.bg} ${st.text}`}>{st.label}</span></td>
                  <td className="px-4 py-3 font-semibold text-[#1a5c38]">{r.confirmed_price ? `R ${Number(r.confirmed_price).toLocaleString()}` : "—"}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{format(new Date(r.created_at), "d MMM yyyy")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

function DetailPanel({ req, cfPrice, setCfPrice, cfStart, setCfStart, cfEnd, setCfEnd, cfSlot, setCfSlot, cfSharing, setCfSharing, cfNotes, setCfNotes, saving, actioning, onSave, onApprove, onPaymentRequested, onPublish, onReject, onUnpublish }: {
  req: AdRequest; cfPrice: string; setCfPrice: (v: string) => void;
  cfStart: string; setCfStart: (v: string) => void; cfEnd: string; setCfEnd: (v: string) => void;
  cfSlot: string; setCfSlot: (v: string) => void; cfSharing: string; setCfSharing: (v: string) => void;
  cfNotes: string; setCfNotes: (v: string) => void;
  saving: boolean; actioning: boolean;
  onSave: () => void; onApprove: () => void; onPaymentRequested: () => void;
  onPublish: () => void; onReject: () => void; onUnpublish: () => void;
}) {
  const st = STATUS[req.status] ?? STATUS.pending_review;
  const tp = AD_TYPE_META[req.ad_type];
  const statuses = ["pending_review","approved","payment_pending","live"];
  const curIdx = statuses.indexOf(req.status);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${st.bg} ${st.text}`}>{st.label}</span>
            {tp && <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: tp.color + "18", color: tp.color }}>{tp.icon} {tp.label}</span>}
          </div>
          <h2 className="text-xl font-bold">{req.club_name}</h2>
          <p className="text-sm text-muted-foreground">{req.club_province} · #{req.id} · {format(new Date(req.created_at), "d MMM yyyy")}</p>
        </div>
        <div className="flex gap-2">
          {req.status !== "rejected" && req.status !== "expired" && (
            <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50" onClick={onReject} disabled={actioning}>Reject</Button>
          )}
          {req.status === "pending_review" && <Button size="sm" className="bg-[#1a5c38] hover:bg-[#164d30]" onClick={onApprove} disabled={actioning}>{actioning ? "…" : "Approve & Notify →"}</Button>}
          {req.status === "approved" && <Button size="sm" className="bg-[#1a5c38] hover:bg-[#164d30]" onClick={onPaymentRequested} disabled={actioning}>{actioning ? "…" : "Mark Payment Requested →"}</Button>}
          {req.status === "payment_pending" && <Button size="sm" className="bg-[#1a5c38] hover:bg-[#164d30]" onClick={onPublish} disabled={actioning}>{actioning ? "Publishing…" : "Confirm Payment & Publish →"}</Button>}
          {req.status === "live" && <Button size="sm" variant="destructive" onClick={onUnpublish} disabled={actioning}>{actioning ? "…" : "Unpublish"}</Button>}
        </div>
      </div>

      <div className="flex gap-1.5">
        {statuses.map((_, i) => <div key={i} className={`flex-1 h-1.5 rounded-full ${i <= curIdx ? "bg-[#1a5c38]" : "bg-gray-200"}`} />)}
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div>
          <SectionLabel>Club Submission</SectionLabel>
          <InfoRow label="Package" value={req.package_name ?? "—"} />
          <InfoRow label="Headline" value={req.headline} />
          {req.subtitle && <InfoRow label="Subtitle" value={req.subtitle} />}
          <InfoRow label="Requested Start" value={req.requested_start ? format(new Date(req.requested_start), "d MMM yyyy") : "—"} />
          <InfoRow label="Requested End"   value={req.requested_end   ? format(new Date(req.requested_end),   "d MMM yyyy") : "—"} />
          {req.club_email && <InfoRow label="Club Email" value={req.club_email} />}
          {req.club_notes && (
            <div className="mt-2 bg-gray-50 border rounded-lg p-3">
              <div className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1">Club Notes</div>
              <div className="text-sm">{req.club_notes}</div>
            </div>
          )}
          <SectionLabel className="mt-5">Ad Preview</SectionLabel>
          <div className="border rounded-xl overflow-hidden">
            <div className={`bg-gray-100 flex items-center justify-center text-muted-foreground text-sm ${req.image_url ? "" : "h-20"}`}>
              {req.image_url ? <img src={req.image_url} alt="" className="w-full max-h-32 object-cover" /> : "📷 No image provided"}
            </div>
            <div className="p-3">
              <div className="font-bold text-sm">{req.headline}</div>
              {req.subtitle && <div className="text-xs text-muted-foreground">{req.subtitle}</div>}
              <div className="mt-2 inline-block bg-[#1a5c38] text-white text-xs font-semibold rounded px-2.5 py-1">{req.cta_text ?? "Book Now"}</div>
            </div>
          </div>
        </div>

        <div>
          <SectionLabel>Staff Configuration</SectionLabel>
          {req.status === "live" ? (
            <div className="space-y-3">
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <div className="font-semibold text-sm text-green-800">🟢 Live in App</div>
                <div className="text-sm text-green-700 mt-0.5">
                  {req.confirmed_start ? format(new Date(req.confirmed_start), "d MMM yyyy") : "—"} → {req.confirmed_end ? format(new Date(req.confirmed_end), "d MMM yyyy") : "—"}
                </div>
              </div>
              <InfoRow label="Confirmed Price" value={req.confirmed_price ? `R ${Number(req.confirmed_price).toLocaleString()}` : "—"} />
              <InfoRow label="Slot Duration" value={req.slot_duration ?? "—"} />
              <InfoRow label="Sharing Tier" value={req.sharing_tier ?? "—"} />
            </div>
          ) : req.status === "payment_pending" ? (
            <div className="space-y-3">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <div className="font-semibold text-sm text-amber-800">Awaiting Payment</div>
                <div className="text-sm text-amber-700 mt-0.5">Quoted: <strong>R {req.confirmed_price ? Number(req.confirmed_price).toLocaleString() : "—"}</strong></div>
              </div>
              <InfoRow label="Start" value={req.confirmed_start ? format(new Date(req.confirmed_start), "d MMM yyyy") : "—"} />
              <InfoRow label="End"   value={req.confirmed_end   ? format(new Date(req.confirmed_end),   "d MMM yyyy") : "—"} />
              <InfoRow label="Slot"  value={req.slot_duration ?? "—"} />
            </div>
          ) : req.status === "rejected" || req.status === "expired" ? (
            <div className="text-sm text-muted-foreground">No configuration needed for this status.</div>
          ) : (
            <div className="space-y-3">
              <ConfigField label="Confirmed Price (ZAR)" type="number" placeholder="e.g. 1199" value={cfPrice} onChange={setCfPrice} />
              <div className="grid grid-cols-2 gap-3">
                <ConfigField label="Start Date" type="date" placeholder="" value={cfStart} onChange={setCfStart} />
                <ConfigField label="End Date"   type="date" placeholder="" value={cfEnd}   onChange={setCfEnd} />
              </div>
              <ConfigField label="Slot Duration / Rotation" placeholder="e.g. 15 sec" value={cfSlot} onChange={setCfSlot} />
              {req.ad_type === "featured_home" && (
                <div>
                  <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2 block">Sharing Tier</Label>
                  <div className="flex gap-2">
                    {["Exclusive (1 club)", "2-club share", "3-club share"].map(t => (
                      <button key={t} onClick={() => setCfSharing(t)}
                        className={`flex-1 text-xs font-semibold border rounded-lg py-2 transition-colors ${cfSharing === t ? "bg-[#e8f5ee] border-[#1a5c38] text-[#1a5c38]" : "border-gray-200 text-gray-600 hover:border-gray-400"}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">Notes / Quote Message to Club</Label>
                <Textarea value={cfNotes} onChange={e => setCfNotes(e.target.value)} placeholder="Hi! We've reviewed your request. Confirmed price is R X for X weeks starting…" rows={3} />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={onSave} disabled={saving}>{saving ? "Saving…" : "Save Config"}</Button>
                <Button size="sm" className="flex-1 bg-[#1a5c38] hover:bg-[#164d30]" onClick={onApprove} disabled={actioning}>{actioning ? "…" : "✅ Approve & Notify →"}</Button>
              </div>
            </div>
          )}

          <SectionLabel className="mt-5">Activity Log</SectionLabel>
          <LogEntry time={format(new Date(req.created_at), "d MMM yyyy, HH:mm")} actor="Club" text="Ad request submitted" />
          {req.status !== "pending_review" && <LogEntry time={format(new Date(req.updated_at), "d MMM yyyy, HH:mm")} actor="Staff" text={`Request approved${req.confirmed_price ? ` — R ${Number(req.confirmed_price).toLocaleString()}` : ""}`} />}
          {["payment_pending","live","expired"].includes(req.status) && <LogEntry time={format(new Date(req.updated_at), "d MMM yyyy, HH:mm")} actor="Staff" text="Payment link sent to club" />}
          {req.status === "live"     && <LogEntry time={format(new Date(req.updated_at), "d MMM yyyy, HH:mm")} actor="Staff" text="Payment confirmed — ad published to app" />}
          {req.status === "rejected" && <LogEntry time={format(new Date(req.updated_at), "d MMM yyyy, HH:mm")} actor="Staff" text="Request rejected" />}
          {req.status === "expired"  && <LogEntry time={format(new Date(req.updated_at), "d MMM yyyy, HH:mm")} actor="Staff" text="Campaign ended / unpublished" />}
        </div>
      </div>
    </div>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function StatCard({ label, value, color, bg, border, icon }: { label: string; value: string | number; color: string; bg: string; border: string; icon: string }) {
  return (
    <div className={`border rounded-xl p-3.5 flex items-center gap-3 ${bg} ${border}`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl ${bg}`}>{icon}</div>
      <div><div className={`text-xl font-black ${color}`}>{value}</div><div className="text-xs text-muted-foreground">{label}</div></div>
    </div>
  );
}

function SectionLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 ${className}`}>{children}</div>;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-semibold text-foreground">{value}</span>
    </div>
  );
}

function ConfigField({ label, type = "text", placeholder, value, onChange }: { label: string; type?: string; placeholder: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{label}</Label>
      <Input type={type} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} className="h-8 text-sm" />
    </div>
  );
}

function LogEntry({ time, actor, text }: { time: string; actor: string; text: string }) {
  return (
    <div className={`flex gap-3 pb-3 border-l-2 pl-3 ml-1 ${actor === "Staff" ? "border-[#1a5c38]" : "border-gray-300"}`}>
      <div className="flex-1 min-w-0">
        <span className={`text-xs font-bold ${actor === "Staff" ? "text-[#1a5c38]" : "text-gray-500"}`}>{actor}</span>
        <span className="text-xs text-foreground ml-2">{text}</span>
        <div className="text-[10px] text-muted-foreground mt-0.5">{time}</div>
      </div>
    </div>
  );
}
