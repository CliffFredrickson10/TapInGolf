import { useEffect, useState } from "react";
import { useSearch } from "wouter";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2, Clock } from "lucide-react";
import { format, addDays } from "date-fns";

interface TeeTime {
  id: number; date: string; time: string; price: number; price_9: number | null;
  total_slots: number; active: boolean; promotional_price: number | null;
}

function today() { return format(new Date(), "yyyy-MM-dd"); }
function inDays(n: number) { return format(addDays(new Date(), n), "yyyy-MM-dd"); }

const DEFAULT_FORM = { date: today(), time: "07:00", price: 500, price_9: "" as any, total_slots: 4, active: true, promotional_price: "" as any };

export default function TeeTimes() {
  const { toast } = useToast();
  const search = useSearch();
  const [teeTimes, setTeeTimes] = useState<TeeTime[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState(today());
  const [toDate, setToDate] = useState(inDays(7));
  const [form, setForm] = useState(DEFAULT_FORM);
  const [editId, setEditId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bulkDate, setBulkDate] = useState(today());
  const [bulkPrice, setBulkPrice] = useState(500);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api<TeeTime[]>(`/api/portal/tee-times?from=${fromDate}&to=${toDate}`);
      setTeeTimes(data);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [fromDate, toDate]);

  const openAdd = () => { setForm(DEFAULT_FORM); setEditId(null); setDialogOpen(true); };

  useEffect(() => {
    const params = new URLSearchParams(search);
    if (params.get("action") === "new") openAdd();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const openEdit = (tt: TeeTime) => {
    setForm({ date: tt.date, time: tt.time, price: tt.price, price_9: tt.price_9 ?? "", total_slots: tt.total_slots, active: tt.active, promotional_price: tt.promotional_price ?? "" });
    setEditId(tt.id);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const body = {
        ...form,
        price_9: form.price_9 === "" ? null : Number(form.price_9),
        promotional_price: form.promotional_price === "" ? null : Number(form.promotional_price),
      };
      if (editId) await api(`/api/portal/tee-times/${editId}`, { method: "PUT", body: JSON.stringify(body) });
      else await api("/api/portal/tee-times", { method: "POST", body: JSON.stringify(body) });
      toast({ title: editId ? "Tee time updated" : "Tee time added" });
      setDialogOpen(false);
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this tee time?")) return;
    try {
      await api(`/api/portal/tee-times/${id}`, { method: "DELETE" });
      setTeeTimes(tt => tt.filter(t => t.id !== id));
      toast({ title: "Deleted" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleToggle = async (tt: TeeTime) => {
    try {
      await api(`/api/portal/tee-times/${tt.id}`, { method: "PUT", body: JSON.stringify({ active: !tt.active }) });
      setTeeTimes(prev => prev.map(t => t.id === tt.id ? { ...t, active: !t.active } : t));
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const BULK_TIMES = ["07:00","07:30","08:00","08:30","09:00","09:30","10:00","10:30","11:00","11:30","12:00","14:00","14:30","15:00"];
  const handleBulkAdd = async () => {
    setBulkSaving(true);
    try {
      for (const time of BULK_TIMES) {
        await api("/api/portal/tee-times", { method: "POST", body: JSON.stringify({ date: bulkDate, time, price: bulkPrice, total_slots: 4, active: true }) });
      }
      toast({ title: `${BULK_TIMES.length} tee times added for ${bulkDate}` });
      setBulkOpen(false);
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setBulkSaving(false); }
  };

  const grouped = teeTimes.reduce<Record<string, TeeTime[]>>((acc, tt) => {
    (acc[tt.date] = acc[tt.date] || []).push(tt);
    return acc;
  }, {});

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tee Times</h1>
          <p className="text-muted-foreground mt-1">Manage available tee time slots for booking.</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2"><Clock className="h-4 w-4" />Bulk Add Day</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Full Day of Tee Times</DialogTitle></DialogHeader>
              <div className="space-y-4 py-2">
                <p className="text-sm text-muted-foreground">Adds 14 standard tee times (07:00–15:00) for the selected date.</p>
                <div className="space-y-2"><Label>Date</Label><Input type="date" value={bulkDate} onChange={e => setBulkDate(e.target.value)} /></div>
                <div className="space-y-2"><Label>18-Hole Price per player (ZAR)</Label><Input type="number" value={bulkPrice} onChange={e => setBulkPrice(Number(e.target.value))} /></div>
                <Button className="w-full bg-[#1a5c38] hover:bg-[#164d30]" onClick={handleBulkAdd} disabled={bulkSaving}>{bulkSaving ? "Adding…" : "Add Tee Times"}</Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-[#1a5c38] hover:bg-[#164d30] gap-2" onClick={openAdd}><Plus className="h-4 w-4" />Add Tee Time</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editId ? "Edit" : "Add"} Tee Time</DialogTitle></DialogHeader>
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Date</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Time</Label><Input type="time" value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>18-Hole Price (ZAR)</Label><Input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: Number(e.target.value) }))} /></div>
                  <div className="space-y-2"><Label>9-Hole Price (ZAR, optional)</Label><Input type="number" value={form.price_9} onChange={e => setForm(f => ({ ...f, price_9: e.target.value }))} placeholder="Leave blank to disable" /></div>
                  <div className="space-y-2"><Label>Total Slots</Label><Input type="number" min={1} max={4} value={form.total_slots} onChange={e => setForm(f => ({ ...f, total_slots: Number(e.target.value) }))} /></div>
                  <div className="space-y-2"><Label>Promo Price (optional)</Label><Input type="number" value={form.promotional_price} onChange={e => setForm(f => ({ ...f, promotional_price: e.target.value }))} placeholder="Leave blank for none" /></div>
                  <div className="flex items-center gap-3 pt-6">
                    <Switch checked={form.active} onCheckedChange={v => setForm(f => ({ ...f, active: v }))} />
                    <Label>Active</Label>
                  </div>
                </div>
                <Button className="w-full bg-[#1a5c38] hover:bg-[#164d30]" onClick={handleSave} disabled={saving}>{saving ? "Saving…" : editId ? "Update" : "Add"}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Label>From</Label>
              <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="w-40" />
            </div>
            <div className="flex items-center gap-2">
              <Label>To</Label>
              <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="w-40" />
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? <Skeleton className="h-64 w-full" /> : (
        Object.keys(grouped).sort().length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">No tee times in this range. Use "Bulk Add Day" to get started.</CardContent></Card>
        ) : (
          Object.keys(grouped).sort().map(date => (
            <Card key={date}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{format(new Date(date.slice(0, 10) + "T00:00:00"), "EEEE, dd MMMM yyyy")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2">
                  {grouped[date].sort((a, b) => a.time.localeCompare(b.time)).map(tt => (
                    <div key={tt.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/40 hover:bg-muted/70 transition-colors">
                      <div className="flex items-center gap-4">
                        <span className="font-mono text-sm font-semibold w-14">{String(tt.time).slice(0, 5)}</span>
                        <span className="text-sm text-muted-foreground">{tt.total_slots} slots</span>
                        <span className="text-sm font-medium">18H: R{tt.price.toFixed(0)}</span>
                        {tt.price_9 != null && <span className="text-sm text-muted-foreground">9H: R{tt.price_9.toFixed(0)}</span>}
                        {tt.promotional_price && <span className="text-xs bg-[#c8a84b]/20 text-[#a07c10] px-1.5 py-0.5 rounded">R{tt.promotional_price} promo</span>}
                      </div>
                      <div className="flex items-center gap-3">
                        <Switch checked={tt.active} onCheckedChange={() => handleToggle(tt)} />
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(tt)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(tt.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))
        )
      )}
    </div>
  );
}
