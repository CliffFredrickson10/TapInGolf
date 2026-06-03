import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Megaphone, Plus, Pencil, Trash2 } from "lucide-react";
import { format } from "date-fns";

interface AdRow {
  id: number;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  cta_text: string | null;
  link_url: string | null;
  placement: string;
  priority: number;
  active: number;
  club_id: number | null;
  club_name: string | null;
  created_at: string;
}

type AdForm = Omit<AdRow, "id" | "club_name" | "created_at">;

const PLACEMENTS = ["home", "club", "explore"];

const emptyForm = (): AdForm => ({
  title: "", subtitle: "", image_url: "", cta_text: "", link_url: "",
  placement: "home", priority: 0, active: 1, club_id: null,
});

const placementBadge = (p: string) => {
  const map: Record<string, string> = {
    home: "bg-blue-100 text-blue-700",
    club: "bg-green-100 text-green-700",
    explore: "bg-purple-100 text-purple-700",
  };
  return map[p] ?? "bg-gray-100 text-gray-600";
};

export default function StaffAds() {
  const { toast } = useToast();
  const [ads, setAds] = useState<AdRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<AdForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ ads: AdRow[] }>("/api/admin/ads");
      setAds(data.ads);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditId(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (ad: AdRow) => {
    setEditId(ad.id);
    setForm({
      title: ad.title, subtitle: ad.subtitle ?? "", image_url: ad.image_url ?? "",
      cta_text: ad.cta_text ?? "", link_url: ad.link_url ?? "",
      placement: ad.placement, priority: ad.priority, active: ad.active,
      club_id: ad.club_id,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.title || !form.placement) {
      toast({ title: "Title and placement are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const body = {
        ...form,
        subtitle: form.subtitle || null,
        image_url: form.image_url || null,
        cta_text: form.cta_text || null,
        link_url: form.link_url || null,
        active: form.active ? 1 : 0,
      };
      if (editId) {
        await api(`/api/admin/ads/${editId}`, { method: "PUT", body: JSON.stringify(body) });
        toast({ title: "Ad updated" });
      } else {
        await api("/api/admin/ads", { method: "POST", body: JSON.stringify(body) });
        toast({ title: "Ad created" });
      }
      setDialogOpen(false);
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const deleteAd = async (id: number) => {
    if (!confirm("Delete this ad?")) return;
    setDeleting(id);
    try {
      await api(`/api/admin/ads/${id}`, { method: "DELETE" });
      toast({ title: "Ad deleted" });
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setDeleting(null); }
  };

  const f = (k: keyof AdForm, v: any) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-[#c8a84b]/15 flex items-center justify-center">
            <Megaphone className="h-5 w-5 text-[#c8a84b]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Ads &amp; Promotions</h1>
            <p className="text-sm text-muted-foreground">Manage sponsored placements across the app</p>
          </div>
        </div>
        <Button className="bg-[#1a5c38] hover:bg-[#154a2e]" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" /> New Ad
        </Button>
      </div>

      <div className="border rounded-lg overflow-hidden bg-background">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Title</th>
              <th className="text-left px-4 py-3 font-semibold">Placement</th>
              <th className="text-center px-4 py-3 font-semibold">Priority</th>
              <th className="text-left px-4 py-3 font-semibold">Club</th>
              <th className="text-center px-4 py-3 font-semibold">Status</th>
              <th className="text-left px-4 py-3 font-semibold">Created</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b last:border-0">
                  {[0,1,2,3,4,5,6].map(j => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))
            ) : ads.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-muted-foreground">
                  No ads yet — click "New Ad" to create one
                </td>
              </tr>
            ) : (
              ads.map(ad => (
                <tr key={ad.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium">{ad.title}</div>
                    {ad.subtitle && <div className="text-xs text-muted-foreground">{ad.subtitle}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${placementBadge(ad.placement)}`}>
                      {ad.placement}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-muted-foreground">{ad.priority}</td>
                  <td className="px-4 py-3 text-muted-foreground">{ad.club_name ?? "All clubs"}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      ad.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                    }`}>
                      {ad.active ? "Active" : "Paused"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {format(new Date(ad.created_at), "d MMM yyyy")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(ad)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => deleteAd(ad.id)}
                        disabled={deleting === ad.id}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Ad" : "New Ad"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label>Title *</Label>
                <Input value={form.title} onChange={e => f("title", e.target.value)} placeholder="Ad headline" />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Subtitle</Label>
                <Input value={form.subtitle ?? ""} onChange={e => f("subtitle", e.target.value)} placeholder="Short description" />
              </div>
              <div className="space-y-1.5">
                <Label>Placement *</Label>
                <select
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                  value={form.placement}
                  onChange={e => f("placement", e.target.value)}
                >
                  {PLACEMENTS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Priority (higher = first)</Label>
                <Input
                  type="number" min={0} max={100}
                  value={form.priority}
                  onChange={e => f("priority", parseInt(e.target.value) || 0)}
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Image URL</Label>
                <Input value={form.image_url ?? ""} onChange={e => f("image_url", e.target.value)} placeholder="https://…" />
              </div>
              <div className="space-y-1.5">
                <Label>CTA Button Text</Label>
                <Input value={form.cta_text ?? ""} onChange={e => f("cta_text", e.target.value)} placeholder="Book Now" />
              </div>
              <div className="space-y-1.5">
                <Label>Link URL</Label>
                <Input value={form.link_url ?? ""} onChange={e => f("link_url", e.target.value)} placeholder="https://…" />
              </div>
              <div className="col-span-2 flex items-center gap-3">
                <input
                  type="checkbox"
                  id="ad-active"
                  checked={!!form.active}
                  onChange={e => f("active", e.target.checked ? 1 : 0)}
                  className="h-4 w-4"
                />
                <Label htmlFor="ad-active">Active (visible in app)</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button className="bg-[#1a5c38] hover:bg-[#154a2e]" onClick={save} disabled={saving}>
              {saving ? "Saving…" : editId ? "Save Changes" : "Create Ad"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
