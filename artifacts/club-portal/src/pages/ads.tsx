import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { format } from "date-fns";

interface Ad {
  id: number; title: string; subtitle: string | null; image_url: string | null;
  cta_text: string | null; link_url: string | null; placement: string;
  priority: number; active: boolean; created_at: string;
}

const EMPTY = { title: "", subtitle: "", image_url: "", cta_text: "", link_url: "", placement: "home", priority: 0, active: true };

export default function Ads() {
  const { toast } = useToast();
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = () => api<Ad[]>("/api/portal/ads").then(setAds).catch(e => toast({ title: "Error", description: e.message, variant: "destructive" })).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const openAdd = () => { setForm(EMPTY); setEditId(null); setOpen(true); };
  const openEdit = (a: Ad) => {
    setForm({ title: a.title, subtitle: a.subtitle ?? "", image_url: a.image_url ?? "", cta_text: a.cta_text ?? "", link_url: a.link_url ?? "", placement: a.placement, priority: a.priority, active: a.active });
    setEditId(a.id); setOpen(true);
  };

  const handleSave = async () => {
    if (!form.title) { toast({ title: "Title required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const body = { ...form, subtitle: form.subtitle || null, image_url: form.image_url || null, cta_text: form.cta_text || null, link_url: form.link_url || null };
      if (editId) await api(`/api/portal/ads/${editId}`, { method: "PUT", body: JSON.stringify(body) });
      else await api("/api/portal/ads", { method: "POST", body: JSON.stringify(body) });
      toast({ title: editId ? "Ad updated" : "Ad created" });
      setOpen(false); load();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this ad?")) return;
    try { await api(`/api/portal/ads/${id}`, { method: "DELETE" }); setAds(a => a.filter(x => x.id !== id)); toast({ title: "Deleted" }); }
    catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const handleToggle = async (ad: Ad) => {
    try { await api(`/api/portal/ads/${ad.id}`, { method: "PUT", body: JSON.stringify({ active: !ad.active }) }); setAds(prev => prev.map(a => a.id === ad.id ? { ...a, active: !a.active } : a)); }
    catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Advertisements</h1>
          <p className="text-muted-foreground mt-1">Manage sponsored ads shown in the TapIn Golf app.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#1a5c38] hover:bg-[#164d30] gap-2" onClick={openAdd}><Plus className="h-4 w-4" />New Ad</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{editId ? "Edit" : "New"} Advertisement</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5"><Label>Title *</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Summer Specials" /></div>
              <div className="space-y-1.5"><Label>Subtitle</Label><Input value={form.subtitle} onChange={e => setForm(f => ({ ...f, subtitle: e.target.value }))} placeholder="Up to 20% off green fees" /></div>
              <div className="space-y-1.5"><Label>Image URL</Label><Input value={form.image_url} onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))} placeholder="https://…" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>CTA Button Text</Label><Input value={form.cta_text} onChange={e => setForm(f => ({ ...f, cta_text: e.target.value }))} placeholder="Book Now" /></div>
                <div className="space-y-1.5"><Label>Link URL</Label><Input value={form.link_url} onChange={e => setForm(f => ({ ...f, link_url: e.target.value }))} placeholder="https://…" /></div>
                <div className="space-y-1.5">
                  <Label>Placement</Label>
                  <Select value={form.placement} onValueChange={v => setForm(f => ({ ...f, placement: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="home">Home Screen</SelectItem>
                      <SelectItem value="explore">Explore Screen</SelectItem>
                      <SelectItem value="bookings">Bookings Screen</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>Priority (higher = first)</Label><Input type="number" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: Number(e.target.value) }))} /></div>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={form.active} onCheckedChange={v => setForm(f => ({ ...f, active: v }))} />
                <Label>Active</Label>
              </div>
              <Button className="w-full bg-[#1a5c38] hover:bg-[#164d30]" onClick={handleSave} disabled={saving}>{saving ? "Saving…" : editId ? "Update" : "Create"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? <Skeleton className="h-48 w-full" /> : (
        ads.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">No ads yet. Create your first advertisement to promote your club in the app.</CardContent></Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {ads.map(a => (
              <Card key={a.id} className={!a.active ? "opacity-60" : ""}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{a.title}</CardTitle>
                      {a.subtitle && <p className="text-sm text-muted-foreground">{a.subtitle}</p>}
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${a.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>{a.active ? "Active" : "Inactive"}</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {a.image_url && <img src={a.image_url} alt={a.title} className="w-full h-32 object-cover rounded" />}
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Placement: <strong>{a.placement}</strong> · Priority: {a.priority}</span>
                    <span>{format(new Date(a.created_at), "dd MMM yyyy")}</span>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <Switch checked={a.active} onCheckedChange={() => handleToggle(a)} />
                    <span className="text-xs text-muted-foreground flex-1">Active</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(a)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(a.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      )}
    </div>
  );
}
