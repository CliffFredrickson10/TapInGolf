import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2 } from "lucide-react";

const DAYS = [
  { value: 1, label: "Mon" }, { value: 2, label: "Tue" }, { value: 3, label: "Wed" },
  { value: 4, label: "Thu" }, { value: 5, label: "Fri" }, { value: 6, label: "Sat" }, { value: 0, label: "Sun" },
];

export default function PosPromotions() {
  const { toast } = useToast();
  const [promotions, setPromotions] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "", discount_type: "percentage", discount_value: "", applies_to: "all",
    category_id: "", product_id: "", days: [] as number[], start_time: "", end_time: "",
  });

  const load = useCallback(() => {
    api<{ promotions: any[] }>("/api/pos/promotions").then(r => setPromotions(r.promotions)).catch(() => {});
    api<{ categories: any[] }>("/api/pos/categories").then(r => setCategories(r.categories)).catch(() => {});
    api<{ products: any[] }>("/api/pos/products").then(r => setProducts(r.products)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await api("/api/pos/promotions", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          discount_type: form.discount_type,
          discount_value: Number(form.discount_value),
          applies_to: form.applies_to,
          category_id: form.applies_to === "category" ? Number(form.category_id) : null,
          product_id: form.applies_to === "product" ? Number(form.product_id) : null,
          days_of_week: form.days.length > 0 && form.days.length < 7 ? form.days.join(",") : null,
          start_time: form.start_time || null,
          end_time: form.end_time || null,
        }),
      });
      toast({ title: "Promotion created" });
      setDialogOpen(false);
      setForm({ name: "", discount_type: "percentage", discount_value: "", applies_to: "all", category_id: "", product_id: "", days: [], start_time: "", end_time: "" });
      load();
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (p: any) => {
    try {
      await api(`/api/pos/promotions/${p.id}`, { method: "PUT", body: JSON.stringify({ active: p.active ? 0 : 1 }) });
      load();
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    }
  };

  const remove = async (p: any) => {
    if (!confirm(`Delete promotion "${p.name}"?`)) return;
    try {
      await api(`/api/pos/promotions/${p.id}`, { method: "DELETE" });
      load();
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    }
  };

  const describeSchedule = (p: any) => {
    const parts: string[] = [];
    if (p.days_of_week) {
      const set = String(p.days_of_week).split(",").map((d: string) => parseInt(d, 10));
      parts.push(DAYS.filter(d => set.includes(d.value)).map(d => d.label).join(", "));
    } else parts.push("Every day");
    if (p.start_time || p.end_time) parts.push(`${String(p.start_time ?? "").slice(0, 5) || "open"}–${String(p.end_time ?? "").slice(0, 5) || "close"}`);
    return parts.join(" · ");
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Promotions</h1>
          <p className="text-sm text-muted-foreground">Discounts and happy hours — applied automatically at the till.</p>
        </div>
        <Button className="bg-[#1a5c38] hover:bg-[#164d30]" onClick={() => setDialogOpen(true)} data-testid="button-add-promotion">
          <Plus className="h-4 w-4 mr-2" /> New promotion
        </Button>
      </div>

      <div className="bg-white rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Promotion</TableHead>
              <TableHead>Discount</TableHead>
              <TableHead>Applies to</TableHead>
              <TableHead>Schedule</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="w-16"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {promotions.map(p => (
              <TableRow key={p.id} data-testid={`promotion-row-${p.id}`}>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {p.discount_type === "percentage" ? `${p.discount_value}% off` : `R${Number(p.discount_value).toFixed(2)} off`}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">
                  {p.applies_to === "all" ? "Everything" : p.applies_to === "category" ? `Category: ${p.category_name ?? "?"}` : `Product: ${p.product_name ?? "?"}`}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{describeSchedule(p)}</TableCell>
                <TableCell>
                  <Switch checked={!!p.active} onCheckedChange={() => toggle(p)} data-testid={`switch-promo-${p.id}`} />
                </TableCell>
                <TableCell>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => remove(p)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {promotions.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No promotions yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New promotion</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Happy Hour Beers" data-testid="input-promo-name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={form.discount_type} onValueChange={v => setForm(f => ({ ...f, discount_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage off</SelectItem>
                    <SelectItem value="amount">Rand amount off (per item)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{form.discount_type === "percentage" ? "Percent (%)" : "Amount (R)"} *</Label>
                <Input type="number" step="0.01" min="0" value={form.discount_value} onChange={e => setForm(f => ({ ...f, discount_value: e.target.value }))} data-testid="input-promo-value" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Applies to</Label>
              <Select value={form.applies_to} onValueChange={v => setForm(f => ({ ...f, applies_to: v }))}>
                <SelectTrigger data-testid="select-promo-applies"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Everything in the outlet</SelectItem>
                  <SelectItem value="category">A category</SelectItem>
                  <SelectItem value="product">A single product</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.applies_to === "category" && (
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={form.category_id} onValueChange={v => setForm(f => ({ ...f, category_id: v }))}>
                  <SelectTrigger data-testid="select-promo-category"><SelectValue placeholder="Choose category" /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {form.applies_to === "product" && (
              <div className="space-y-1.5">
                <Label>Product</Label>
                <Select value={form.product_id} onValueChange={v => setForm(f => ({ ...f, product_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Choose product" /></SelectTrigger>
                  <SelectContent>
                    {products.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Days (leave all off for every day)</Label>
              <div className="flex gap-1.5 flex-wrap">
                {DAYS.map(d => (
                  <Button
                    key={d.value}
                    type="button"
                    size="sm"
                    variant={form.days.includes(d.value) ? "default" : "outline"}
                    className={form.days.includes(d.value) ? "bg-[#1a5c38]" : ""}
                    onClick={() => setForm(f => ({ ...f, days: f.days.includes(d.value) ? f.days.filter(x => x !== d.value) : [...f.days, d.value] }))}
                    data-testid={`button-day-${d.label}`}
                  >
                    {d.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>From (time)</Label>
                <Input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} data-testid="input-promo-start" />
              </div>
              <div className="space-y-1.5">
                <Label>Until (time)</Label>
                <Input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} data-testid="input-promo-end" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              className="bg-[#1a5c38] hover:bg-[#164d30]"
              disabled={!form.name.trim() || !form.discount_value || saving ||
                (form.applies_to === "category" && !form.category_id) ||
                (form.applies_to === "product" && !form.product_id)}
              onClick={save}
              data-testid="button-save-promotion"
            >
              {saving ? "Saving…" : "Create promotion"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
