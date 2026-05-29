import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { format } from "date-fns";

interface Voucher {
  id: number; code: string; discount_type: string; discount_value: number;
  min_amount: number | null; max_uses: number | null; uses_count: number;
  active: boolean; expires_at: string | null; created_at: string;
}

const EMPTY = { code: "", discount_type: "percentage", discount_value: 10, min_amount: "" as any, max_uses: "" as any, expires_at: "" };

function generateCode() {
  return `GOLF${Math.random().toString(36).slice(2,6).toUpperCase()}`;
}

export default function Vouchers() {
  const { toast } = useToast();
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = () => api<Voucher[]>("/api/portal/vouchers").then(setVouchers).catch(e => toast({ title: "Error", description: e.message, variant: "destructive" })).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const openAdd = () => { setForm({ ...EMPTY, code: generateCode() }); setEditId(null); setOpen(true); };
  const openEdit = (v: Voucher) => {
    setForm({ code: v.code, discount_type: v.discount_type, discount_value: v.discount_value, min_amount: v.min_amount ?? "", max_uses: v.max_uses ?? "", expires_at: v.expires_at ? v.expires_at.split("T")[0] : "" });
    setEditId(v.id); setOpen(true);
  };

  const handleSave = async () => {
    if (!form.code || !form.discount_value) { toast({ title: "Code and discount value required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const body = { ...form, min_amount: form.min_amount === "" ? null : Number(form.min_amount), max_uses: form.max_uses === "" ? null : Number(form.max_uses), expires_at: form.expires_at || null };
      if (editId) await api(`/api/portal/vouchers/${editId}`, { method: "PUT", body: JSON.stringify(body) });
      else await api("/api/portal/vouchers", { method: "POST", body: JSON.stringify(body) });
      toast({ title: editId ? "Voucher updated" : "Voucher created" });
      setOpen(false); load();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this voucher?")) return;
    try { await api(`/api/portal/vouchers/${id}`, { method: "DELETE" }); setVouchers(v => v.filter(x => x.id !== id)); toast({ title: "Deleted" }); }
    catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const handleToggle = async (v: Voucher) => {
    try { await api(`/api/portal/vouchers/${v.id}`, { method: "PUT", body: JSON.stringify({ active: !v.active }) }); setVouchers(prev => prev.map(x => x.id === v.id ? { ...x, active: !x.active } : x)); }
    catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Vouchers</h1>
          <p className="text-muted-foreground mt-1">Create discount vouchers for golfers to use when booking.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#1a5c38] hover:bg-[#164d30] gap-2" onClick={openAdd}><Plus className="h-4 w-4" />New Voucher</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{editId ? "Edit" : "New"} Voucher</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label>Voucher Code *</Label>
                <div className="flex gap-2">
                  <Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="GOLF2026" className="font-mono" disabled={!!editId} />
                  {!editId && <Button variant="outline" type="button" onClick={() => setForm(f => ({ ...f, code: generateCode() }))}>Random</Button>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Discount Type</Label>
                  <Select value={form.discount_type} onValueChange={v => setForm(f => ({ ...f, discount_type: v }))} disabled={!!editId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Percentage (%)</SelectItem>
                      <SelectItem value="fixed">Fixed Amount (R)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Discount Value {form.discount_type === "percentage" ? "(%)" : "(ZAR)"}</Label>
                  <Input type="number" value={form.discount_value} onChange={e => setForm(f => ({ ...f, discount_value: Number(e.target.value) }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Min Booking Amount (R)</Label>
                  <Input type="number" value={form.min_amount} onChange={e => setForm(f => ({ ...f, min_amount: e.target.value }))} placeholder="Optional" />
                </div>
                <div className="space-y-1.5">
                  <Label>Max Uses</Label>
                  <Input type="number" value={form.max_uses} onChange={e => setForm(f => ({ ...f, max_uses: e.target.value }))} placeholder="Unlimited" />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label>Expires On</Label>
                  <Input type="date" value={form.expires_at} onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))} />
                </div>
              </div>
              <Button className="w-full bg-[#1a5c38] hover:bg-[#164d30]" onClick={handleSave} disabled={saving}>{saving ? "Saving…" : editId ? "Update" : "Create"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? <Skeleton className="h-48 w-full" /> : (
        vouchers.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">No vouchers yet. Create discount codes to attract golfers.</CardContent></Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {vouchers.map(v => (
              <Card key={v.id} className={!v.active ? "opacity-60" : ""}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <code className="text-lg font-bold font-mono tracking-widest">{v.code}</code>
                      <p className="text-sm text-muted-foreground">
                        {v.discount_type === "percentage" ? `${v.discount_value}% off` : `R${v.discount_value} off`}
                        {v.min_amount ? ` · min R${v.min_amount}` : ""}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${v.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>{v.active ? "Active" : "Inactive"}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>Used: {v.uses_count}{v.max_uses ? ` / ${v.max_uses}` : ""}</span>
                    {v.expires_at && <span>Expires: {format(new Date(v.expires_at), "dd MMM yyyy")}</span>}
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <Switch checked={v.active} onCheckedChange={() => handleToggle(v)} />
                    <span className="text-xs text-muted-foreground flex-1">Active</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(v)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(v.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
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
