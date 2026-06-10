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
import { RefreshCw, Bell, ChevronDown, ChevronRight, Plus, Trash2, Pencil, Check, X } from "lucide-react";

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

// ─── Main Component ───────────────────────────────────────────────────────────

export default function StaffAds() {
  const { toast } = useToast();
  const [allRequests, setAllRequests] = useState<AdRequest[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [offerings, setOfferings] = useState<Offering[]>([]);
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

  const loadOfferings = useCallback(async () => {
    try {
      const data = await api<Offering[]>("/api/admin/ad-offerings");
      setOfferings(data);
    } catch (e: any) {
      toast({ title: "Error loading offerings", description: e.message, variant: "destructive" });
    }
  }, [toast]);

  useEffect(() => { loadRequests(); loadOfferings(); }, []);

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
          <Button variant="outline" size="sm" onClick={() => { loadRequests(); loadOfferings(); }} className="gap-1.5">
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
          </TabsList>

          <TabsContent value="analytics" className="pt-4">
            <AnalyticsPanel requests={allRequests} />
          </TabsContent>

          <TabsContent value="pricing" className="pt-4 pb-8">
            <PricingManager offerings={offerings} onRefresh={loadOfferings} toast={toast} />
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

// ─── Pricing Manager ─────────────────────────────────────────────────────────

function PricingManager({ offerings, onRefresh, toast }: {
  offerings: Offering[];
  onRefresh: () => void;
  toast: (opts: any) => void;
}) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editingOffering, setEditingOffering] = useState<number | null>(null);
  const [editingPackage, setEditingPackage] = useState<number | null>(null);
  const [addingPkgFor, setAddingPkgFor] = useState<string | null>(null);
  const [showAddOffering, setShowAddOffering] = useState(false);
  const [saving, setSaving] = useState(false);

  // Offering edit form
  const [oForm, setOForm] = useState({ icon: "", title: "", description: "", where_shown: "", color: "", is_extra: false, extra_badge: "", extra_badge_color: "", extra_price_label: "" });

  // Package edit/add form
  const [pForm, setPForm] = useState({ name: "", price_display: "", price_period: "", slot_duration: "", reach_info: "", is_popular: false });

  // New offering form
  const [nForm, setNForm] = useState({ ad_type: "", icon: "📢", title: "", description: "", where_shown: "", color: "#1a5c38", is_extra: false, extra_badge: "", extra_badge_color: "#1a5c38", extra_price_label: "" });

  const startEditOffering = (o: Offering) => {
    setEditingOffering(o.id);
    setOForm({ icon: o.icon, title: o.title, description: o.description ?? "", where_shown: o.where_shown ?? "", color: o.color, is_extra: !!o.is_extra, extra_badge: o.extra_badge ?? "", extra_badge_color: o.extra_badge_color ?? "#1a5c38", extra_price_label: o.extra_price_label ?? "" });
  };

  const startEditPackage = (pkg: Package) => {
    setEditingPackage(pkg.id);
    setPForm({ name: pkg.name, price_display: pkg.price_display, price_period: pkg.price_period ?? "", slot_duration: pkg.slot_duration ?? "", reach_info: pkg.reach_info ?? "", is_popular: !!pkg.is_popular });
  };

  const startAddPackage = (adType: string) => {
    setAddingPkgFor(adType);
    setPForm({ name: "", price_display: "", price_period: "/month", slot_duration: "", reach_info: "", is_popular: false });
  };

  const call = async (fn: () => Promise<any>, successMsg: string) => {
    setSaving(true);
    try {
      await fn();
      toast({ title: successMsg });
      onRefresh();
      setEditingOffering(null); setEditingPackage(null); setAddingPkgFor(null); setShowAddOffering(false);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const saveOffering = (id: number) => call(() => api(`/api/admin/ad-offerings/${id}`, { method: "PUT", body: JSON.stringify({ ...oForm, is_extra: oForm.is_extra ? 1 : 0 }) }), "Offering updated");
  const toggleOffering = (id: number) => call(() => api(`/api/admin/ad-offerings/${id}/toggle`, { method: "POST" }), "Visibility toggled");
  const deleteOffering = (id: number) => { if (!confirm("Delete this offering and all its packages?")) return; call(() => api(`/api/admin/ad-offerings/${id}`, { method: "DELETE" }), "Offering deleted"); };

  const savePackage = (id: number) => call(() => api(`/api/admin/ad-packages/${id}`, { method: "PUT", body: JSON.stringify({ ...pForm, is_popular: pForm.is_popular ? 1 : 0 }) }), "Package updated");
  const addPackage  = (adType: string) => call(() => api("/api/admin/ad-packages", { method: "POST", body: JSON.stringify({ ...pForm, ad_type: adType, is_popular: pForm.is_popular ? 1 : 0 }) }), "Package added");
  const deletePackage = (id: number) => { if (!confirm("Delete this package?")) return; call(() => api(`/api/admin/ad-packages/${id}`, { method: "DELETE" }), "Package deleted"); };

  const addOffering = () => call(() => api("/api/admin/ad-offerings", { method: "POST", body: JSON.stringify({ ...nForm, is_extra: nForm.is_extra ? 1 : 0 }) }), "Offering added");

  const mainOfferings  = offerings.filter(o => !o.is_extra);
  const extraOfferings = offerings.filter(o => !!o.is_extra);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Advertising Offerings & Pricing</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Manage the ad types, packages, and pricing shown to clubs in the Options &amp; Pricing tab.</p>
        </div>
        <Button size="sm" className="bg-[#1a5c38] hover:bg-[#164d30] gap-1.5" onClick={() => setShowAddOffering(v => !v)}>
          <Plus className="h-3.5 w-3.5" /> Add Offering
        </Button>
      </div>

      {/* Add new offering form */}
      {showAddOffering && (
        <div className="border-2 border-dashed border-[#1a5c38] rounded-xl p-5 bg-[#f0faf4] space-y-4">
          <div className="font-bold text-[#1a5c38]">New Ad Offering</div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Ad Type Slug *</Label>
              <Input placeholder="e.g. podcast_ad" value={nForm.ad_type} onChange={e => setNForm(f => ({ ...f, ad_type: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Icon (emoji)</Label>
              <Input placeholder="📢" value={nForm.icon} onChange={e => setNForm(f => ({ ...f, icon: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Color (hex)</Label>
              <div className="flex gap-1.5">
                <Input type="color" value={nForm.color} onChange={e => setNForm(f => ({ ...f, color: e.target.value }))} className="h-8 w-10 p-0.5 cursor-pointer" />
                <Input value={nForm.color} onChange={e => setNForm(f => ({ ...f, color: e.target.value }))} className="h-8 text-sm flex-1" />
              </div>
            </div>
            <div className="col-span-3 space-y-1">
              <Label className="text-xs">Title *</Label>
              <Input placeholder="e.g. Podcast Sponsor Spot" value={nForm.title} onChange={e => setNForm(f => ({ ...f, title: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div className="col-span-3 space-y-1">
              <Label className="text-xs">Description</Label>
              <Textarea rows={2} value={nForm.description} onChange={e => setNForm(f => ({ ...f, description: e.target.value }))} className="text-sm" />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Where Shown (badge text)</Label>
              <Input placeholder="e.g. Podcast · Niche audience" value={nForm.where_shown} onChange={e => setNForm(f => ({ ...f, where_shown: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div className="flex items-end pb-1 gap-2">
              <input type="checkbox" id="new-is-extra" checked={nForm.is_extra} onChange={e => setNForm(f => ({ ...f, is_extra: e.target.checked }))} className="h-4 w-4 accent-[#1a5c38]" />
              <Label htmlFor="new-is-extra" className="text-xs cursor-pointer">Show as "Extra Option" (not main offering)</Label>
            </div>
            {nForm.is_extra && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">Extra Badge Label</Label>
                  <Input placeholder="Popular" value={nForm.extra_badge} onChange={e => setNForm(f => ({ ...f, extra_badge: e.target.value }))} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Badge Color</Label>
                  <div className="flex gap-1.5">
                    <Input type="color" value={nForm.extra_badge_color} onChange={e => setNForm(f => ({ ...f, extra_badge_color: e.target.value }))} className="h-8 w-10 p-0.5" />
                    <Input value={nForm.extra_badge_color} onChange={e => setNForm(f => ({ ...f, extra_badge_color: e.target.value }))} className="h-8 text-sm flex-1" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Price Label</Label>
                  <Input placeholder="From R 399/mo" value={nForm.extra_price_label} onChange={e => setNForm(f => ({ ...f, extra_price_label: e.target.value }))} className="h-8 text-sm" />
                </div>
              </>
            )}
          </div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" className="bg-[#1a5c38] hover:bg-[#164d30]" onClick={addOffering} disabled={saving || !nForm.ad_type || !nForm.title}>{saving ? "Adding…" : "Add Offering"}</Button>
            <Button size="sm" variant="outline" onClick={() => setShowAddOffering(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Main Ad Types */}
      <Section title="Main Ad Types" subtitle="Full ad types shown as primary offerings with selectable packages.">
        {mainOfferings.map(o => (
          <OfferingRow key={o.id} o={o} expanded={expandedId === o.id}
            onToggleExpand={() => setExpandedId(expandedId === o.id ? null : o.id)}
            editing={editingOffering === o.id}
            onEdit={() => startEditOffering(o)}
            onCancelEdit={() => setEditingOffering(null)}
            onSaveEdit={() => saveOffering(o.id)}
            onToggleActive={() => toggleOffering(o.id)}
            onDelete={() => deleteOffering(o.id)}
            saving={saving}
            oForm={oForm} setOForm={setOForm}
            editingPackage={editingPackage}
            onEditPackage={startEditPackage}
            onCancelEditPackage={() => setEditingPackage(null)}
            onSavePackage={(id) => savePackage(id)}
            onDeletePackage={deletePackage}
            addingPkg={addingPkgFor === o.ad_type}
            onStartAddPkg={() => startAddPackage(o.ad_type)}
            onCancelAddPkg={() => setAddingPkgFor(null)}
            onAddPkg={() => addPackage(o.ad_type)}
            pForm={pForm} setPForm={setPForm}
          />
        ))}
      </Section>

      {/* Extra Options */}
      <Section title="Extra Options" subtitle="Shown in the 'More Ways to Promote' section — enquiry-only, no package selection.">
        {extraOfferings.map(o => (
          <OfferingRow key={o.id} o={o} expanded={expandedId === o.id}
            onToggleExpand={() => setExpandedId(expandedId === o.id ? null : o.id)}
            editing={editingOffering === o.id}
            onEdit={() => startEditOffering(o)}
            onCancelEdit={() => setEditingOffering(null)}
            onSaveEdit={() => saveOffering(o.id)}
            onToggleActive={() => toggleOffering(o.id)}
            onDelete={() => deleteOffering(o.id)}
            saving={saving}
            oForm={oForm} setOForm={setOForm}
            editingPackage={null}
            onEditPackage={() => {}}
            onCancelEditPackage={() => {}}
            onSavePackage={() => {}}
            onDeletePackage={() => {}}
            addingPkg={false}
            onStartAddPkg={() => {}}
            onCancelAddPkg={() => {}}
            onAddPkg={() => {}}
            pForm={pForm} setPForm={setPForm}
          />
        ))}
      </Section>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-3">
        <div className="text-base font-bold">{title}</div>
        <div className="text-xs text-muted-foreground">{subtitle}</div>
      </div>
      <div className="border rounded-xl overflow-hidden bg-white divide-y">{children}</div>
    </div>
  );
}

function OfferingRow({ o, expanded, onToggleExpand, editing, onEdit, onCancelEdit, onSaveEdit, onToggleActive, onDelete, saving, oForm, setOForm, editingPackage, onEditPackage, onCancelEditPackage, onSavePackage, onDeletePackage, addingPkg, onStartAddPkg, onCancelAddPkg, onAddPkg, pForm, setPForm }: {
  o: Offering; expanded: boolean; onToggleExpand: () => void;
  editing: boolean; onEdit: () => void; onCancelEdit: () => void; onSaveEdit: () => void;
  onToggleActive: () => void; onDelete: () => void; saving: boolean;
  oForm: any; setOForm: (f: any) => void;
  editingPackage: number | null; onEditPackage: (p: Package) => void;
  onCancelEditPackage: () => void; onSavePackage: (id: number) => void;
  onDeletePackage: (id: number) => void;
  addingPkg: boolean; onStartAddPkg: () => void; onCancelAddPkg: () => void; onAddPkg: () => void;
  pForm: any; setPForm: (f: any) => void;
}) {
  return (
    <div>
      {/* Offering header row */}
      <div className={`flex items-center gap-3 px-4 py-3 ${!o.active ? "opacity-50" : ""}`}>
        <button onClick={onToggleExpand} className="text-muted-foreground hover:text-foreground transition-colors">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <span className="text-xl w-7">{o.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">{o.title}</span>
            <span className="text-xs text-muted-foreground font-mono bg-gray-100 px-1.5 py-0.5 rounded">{o.ad_type}</span>
            {!o.active && <span className="text-xs text-gray-400 font-medium">Hidden</span>}
          </div>
          {o.is_extra && o.extra_price_label && (
            <div className="text-xs font-bold mt-0.5" style={{ color: o.color }}>{o.extra_price_label}</div>
          )}
          {!o.is_extra && o.packages.length > 0 && (
            <div className="text-xs text-muted-foreground mt-0.5">{o.packages.length} package{o.packages.length !== 1 ? "s" : ""}</div>
          )}
        </div>
        <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: o.color }} />
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" onClick={onEdit}><Pencil className="h-3 w-3" /> Edit</Button>
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={onToggleActive}>{o.active ? "Hide" : "Show"}</Button>
          <Button size="sm" variant="outline" className="h-7 px-2 text-red-500 hover:text-red-700 hover:bg-red-50 border-red-200" onClick={onDelete}><Trash2 className="h-3 w-3" /></Button>
        </div>
      </div>

      {/* Offering edit form */}
      {editing && (
        <div className="px-4 pb-4 pt-0 bg-blue-50 border-t">
          <div className="grid grid-cols-3 gap-3 pt-3">
            <div className="space-y-1">
              <Label className="text-xs">Icon</Label>
              <Input value={oForm.icon} onChange={e => setOForm((f: any) => ({ ...f, icon: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Title</Label>
              <Input value={oForm.title} onChange={e => setOForm((f: any) => ({ ...f, title: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div className="col-span-3 space-y-1">
              <Label className="text-xs">Description</Label>
              <Textarea rows={2} value={oForm.description} onChange={e => setOForm((f: any) => ({ ...f, description: e.target.value }))} className="text-sm" />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Where Shown (badge)</Label>
              <Input value={oForm.where_shown} onChange={e => setOForm((f: any) => ({ ...f, where_shown: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Color</Label>
              <div className="flex gap-1.5">
                <Input type="color" value={oForm.color} onChange={e => setOForm((f: any) => ({ ...f, color: e.target.value }))} className="h-8 w-10 p-0.5 cursor-pointer" />
                <Input value={oForm.color} onChange={e => setOForm((f: any) => ({ ...f, color: e.target.value }))} className="h-8 text-sm flex-1" />
              </div>
            </div>
            {oForm.is_extra && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">Extra Badge Label</Label>
                  <Input value={oForm.extra_badge} onChange={e => setOForm((f: any) => ({ ...f, extra_badge: e.target.value }))} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Badge Color</Label>
                  <div className="flex gap-1.5">
                    <Input type="color" value={oForm.extra_badge_color} onChange={e => setOForm((f: any) => ({ ...f, extra_badge_color: e.target.value }))} className="h-8 w-10 p-0.5" />
                    <Input value={oForm.extra_badge_color} onChange={e => setOForm((f: any) => ({ ...f, extra_badge_color: e.target.value }))} className="h-8 text-sm flex-1" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Price Label</Label>
                  <Input value={oForm.extra_price_label} onChange={e => setOForm((f: any) => ({ ...f, extra_price_label: e.target.value }))} className="h-8 text-sm" placeholder="From R 399/mo" />
                </div>
              </>
            )}
          </div>
          <div className="flex gap-2 mt-3">
            <Button size="sm" className="bg-[#1a5c38] hover:bg-[#164d30] gap-1" onClick={onSaveEdit} disabled={saving}><Check className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Save Changes"}</Button>
            <Button size="sm" variant="outline" onClick={onCancelEdit} className="gap-1"><X className="h-3.5 w-3.5" /> Cancel</Button>
          </div>
        </div>
      )}

      {/* Packages section (expanded, main offerings only) */}
      {expanded && !o.is_extra && (
        <div className="bg-gray-50 border-t px-4 py-3 space-y-2">
          <div className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1">Packages</div>
          {o.packages.length === 0 && <div className="text-xs text-muted-foreground italic">No packages yet — add one below.</div>}
          {o.packages.map(pkg => (
            <PackageRow key={pkg.id} pkg={pkg} o={o}
              editing={editingPackage === pkg.id}
              onEdit={() => onEditPackage(pkg)}
              onCancelEdit={onCancelEditPackage}
              onSave={() => onSavePackage(pkg.id)}
              onDelete={() => onDeletePackage(pkg.id)}
              saving={saving} pForm={pForm} setPForm={setPForm}
            />
          ))}
          {/* Add package form */}
          {addingPkg ? (
            <div className="border-2 border-dashed rounded-lg p-3 bg-white space-y-2">
              <div className="text-xs font-bold text-[#1a5c38]">New Package</div>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-3 space-y-1"><Label className="text-xs">Name *</Label><Input placeholder="Gold Spot" value={pForm.name} onChange={e => setPForm((f: any) => ({ ...f, name: e.target.value }))} className="h-7 text-xs" /></div>
                <div className="space-y-1"><Label className="text-xs">Price *</Label><Input placeholder="R 499" value={pForm.price_display} onChange={e => setPForm((f: any) => ({ ...f, price_display: e.target.value }))} className="h-7 text-xs" /></div>
                <div className="space-y-1"><Label className="text-xs">Period</Label><Input placeholder="/month" value={pForm.price_period} onChange={e => setPForm((f: any) => ({ ...f, price_period: e.target.value }))} className="h-7 text-xs" /></div>
                <div className="space-y-1"><Label className="text-xs">Slot</Label><Input placeholder="10 sec" value={pForm.slot_duration} onChange={e => setPForm((f: any) => ({ ...f, slot_duration: e.target.value }))} className="h-7 text-xs" /></div>
                <div className="col-span-2 space-y-1"><Label className="text-xs">Reach Info</Label><Input placeholder="All users · 2 clubs share" value={pForm.reach_info} onChange={e => setPForm((f: any) => ({ ...f, reach_info: e.target.value }))} className="h-7 text-xs" /></div>
                <div className="flex items-end gap-1.5 pb-0.5">
                  <input type="checkbox" checked={pForm.is_popular} onChange={e => setPForm((f: any) => ({ ...f, is_popular: e.target.checked }))} className="accent-[#1a5c38]" />
                  <Label className="text-xs">Popular</Label>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="bg-[#1a5c38] hover:bg-[#164d30] h-7 text-xs gap-1" onClick={onAddPkg} disabled={saving}><Check className="h-3 w-3" /> Add</Button>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={onCancelAddPkg}><X className="h-3 w-3" /> Cancel</Button>
              </div>
            </div>
          ) : (
            <button onClick={onStartAddPkg} className="flex items-center gap-1.5 text-xs text-[#1a5c38] font-semibold hover:underline mt-1">
              <Plus className="h-3.5 w-3.5" /> Add Package
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function PackageRow({ pkg, o, editing, onEdit, onCancelEdit, onSave, onDelete, saving, pForm, setPForm }: {
  pkg: Package; o: Offering; editing: boolean;
  onEdit: () => void; onCancelEdit: () => void; onSave: () => void; onDelete: () => void;
  saving: boolean; pForm: any; setPForm: (f: any) => void;
}) {
  if (editing) {
    return (
      <div className="border rounded-lg p-3 bg-white space-y-2">
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-3 space-y-1"><Label className="text-xs">Name</Label><Input value={pForm.name} onChange={e => setPForm((f: any) => ({ ...f, name: e.target.value }))} className="h-7 text-xs" /></div>
          <div className="space-y-1"><Label className="text-xs">Price</Label><Input value={pForm.price_display} onChange={e => setPForm((f: any) => ({ ...f, price_display: e.target.value }))} className="h-7 text-xs" /></div>
          <div className="space-y-1"><Label className="text-xs">Period</Label><Input value={pForm.price_period} onChange={e => setPForm((f: any) => ({ ...f, price_period: e.target.value }))} className="h-7 text-xs" /></div>
          <div className="space-y-1"><Label className="text-xs">Slot</Label><Input value={pForm.slot_duration} onChange={e => setPForm((f: any) => ({ ...f, slot_duration: e.target.value }))} className="h-7 text-xs" /></div>
          <div className="col-span-2 space-y-1"><Label className="text-xs">Reach Info</Label><Input value={pForm.reach_info} onChange={e => setPForm((f: any) => ({ ...f, reach_info: e.target.value }))} className="h-7 text-xs" /></div>
          <div className="flex items-end gap-1.5 pb-0.5">
            <input type="checkbox" checked={pForm.is_popular} onChange={e => setPForm((f: any) => ({ ...f, is_popular: e.target.checked }))} className="accent-[#1a5c38]" />
            <Label className="text-xs">Popular</Label>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" className="bg-[#1a5c38] hover:bg-[#164d30] h-7 text-xs gap-1" onClick={onSave} disabled={saving}><Check className="h-3 w-3" /> {saving ? "…" : "Save"}</Button>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={onCancelEdit}><X className="h-3 w-3" /> Cancel</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 bg-white border rounded-lg px-3 py-2">
      {pkg.is_popular === 1 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white flex-shrink-0" style={{ background: o.color }}>Popular</span>}
      <div className="flex-1 min-w-0">
        <span className="text-sm font-semibold">{pkg.name}</span>
        <span className="text-sm font-black ml-2" style={{ color: o.color }}>{pkg.price_display}</span>
        <span className="text-xs text-muted-foreground">{pkg.price_period}</span>
        {pkg.slot_duration && <span className="text-xs text-muted-foreground ml-2">· {pkg.slot_duration}</span>}
        {pkg.reach_info && <span className="text-xs text-muted-foreground ml-2">· {pkg.reach_info}</span>}
      </div>
      <div className="flex gap-1 flex-shrink-0">
        <Button size="sm" variant="outline" className="h-6 px-1.5" onClick={onEdit}><Pencil className="h-3 w-3" /></Button>
        <Button size="sm" variant="outline" className="h-6 px-1.5 text-red-500 hover:bg-red-50" onClick={onDelete}><Trash2 className="h-3 w-3" /></Button>
      </div>
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
