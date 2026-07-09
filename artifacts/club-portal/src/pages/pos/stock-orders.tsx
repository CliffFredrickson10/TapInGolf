import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, X, PackageCheck, Ban } from "lucide-react";

const fmt = (n: number) => `R${Number(n).toFixed(2)}`;

interface DraftItem { product_id: string; variant_id: string; quantity: string; unit_cost: string; }

export default function PosStockOrders() {
  const { toast } = useToast();
  const [orders, setOrders] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewOrder, setViewOrder] = useState<any | null>(null);
  const [supplierId, setSupplierId] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<DraftItem[]>([{ product_id: "", variant_id: "", quantity: "1", unit_cost: "" }]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    api<{ orders: any[] }>("/api/pos/stock-orders").then(r => setOrders(r.orders)).catch(() => {});
    api<{ suppliers: any[] }>("/api/pos/suppliers").then(r => setSuppliers(r.suppliers.filter((s: any) => s.active))).catch(() => {});
    api<{ products: any[] }>("/api/pos/products").then(r => setProducts(r.products)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const productById = (id: string) => products.find(p => String(p.id) === id);

  const create = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const body = {
        supplier_id: Number(supplierId),
        notes: notes || null,
        items: items
          .filter(i => i.product_id && Number(i.quantity) > 0)
          .map(i => ({
            product_id: Number(i.product_id),
            variant_id: i.variant_id ? Number(i.variant_id) : null,
            quantity: Number(i.quantity),
            unit_cost: Number(i.unit_cost) || 0,
          })),
      };
      if (body.items.length === 0) { toast({ title: "Add at least one item", variant: "destructive" }); return; }
      await api("/api/pos/stock-orders", { method: "POST", body: JSON.stringify(body) });
      toast({ title: "Stock order created" });
      setDialogOpen(false);
      setSupplierId(""); setNotes(""); setItems([{ product_id: "", variant_id: "", quantity: "1", unit_cost: "" }]);
      load();
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const receive = async (id: number) => {
    if (!confirm("Mark this order as received? Stock levels will be increased.")) return;
    try {
      await api(`/api/pos/stock-orders/${id}/receive`, { method: "POST" });
      toast({ title: "Stock received", description: "Stock levels have been updated." });
      setViewOrder(null);
      load();
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    }
  };

  const cancel = async (id: number) => {
    if (!confirm("Cancel this stock order?")) return;
    try {
      await api(`/api/pos/stock-orders/${id}/cancel`, { method: "POST" });
      setViewOrder(null);
      load();
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    }
  };

  const openView = async (id: number) => {
    try {
      const o = await api<any>(`/api/pos/stock-orders/${id}`);
      setViewOrder(o);
    } catch { /* noop */ }
  };

  const statusBadge = (status: string) =>
    status === "received" ? <Badge className="bg-[#1a5c38]">Received</Badge>
    : status === "cancelled" ? <Badge variant="outline">Cancelled</Badge>
    : <Badge variant="secondary">Ordered</Badge>;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Stock Orders</h1>
          <p className="text-sm text-muted-foreground">Order from suppliers and receive stock into the outlet.</p>
        </div>
        <Button className="bg-[#1a5c38] hover:bg-[#164d30]" onClick={() => setDialogOpen(true)} disabled={suppliers.length === 0} data-testid="button-new-stock-order">
          <Plus className="h-4 w-4 mr-2" /> New stock order
        </Button>
      </div>
      {suppliers.length === 0 && <p className="text-sm text-muted-foreground">Add a supplier first to create stock orders.</p>}

      <div className="bg-white rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Total cost</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-32"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map(o => (
              <TableRow key={o.id} className="cursor-pointer" onClick={() => openView(o.id)} data-testid={`stock-order-row-${o.id}`}>
                <TableCell className="font-medium">#{o.id}</TableCell>
                <TableCell>{o.supplier_name}</TableCell>
                <TableCell>{o.item_count}</TableCell>
                <TableCell>{fmt(o.total_cost)}</TableCell>
                <TableCell>{statusBadge(o.status)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{new Date(o.created_at).toLocaleDateString()}</TableCell>
                <TableCell onClick={e => e.stopPropagation()}>
                  {o.status === "ordered" && (
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" className="bg-[#1a5c38] hover:bg-[#164d30] h-8" onClick={() => receive(o.id)} data-testid={`button-receive-${o.id}`}>
                        <PackageCheck className="h-3.5 w-3.5 mr-1" /> Receive
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => cancel(o.id)}>
                        <Ban className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {orders.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No stock orders yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New stock order</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Supplier *</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger data-testid="select-supplier"><SelectValue placeholder="Choose supplier" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Items</Label>
                <Button size="sm" variant="outline" onClick={() => setItems(l => [...l, { product_id: "", variant_id: "", quantity: "1", unit_cost: "" }])}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Line
                </Button>
              </div>
              <div className="space-y-2">
                {items.map((item, idx) => {
                  const prod = productById(item.product_id);
                  return (
                    <div key={idx} className="grid grid-cols-[2fr_1.5fr_0.7fr_1fr_28px] gap-1.5 items-center">
                      <Select value={item.product_id} onValueChange={v => setItems(l => l.map((x, i) => i === idx ? { ...x, product_id: v, variant_id: "" } : x))}>
                        <SelectTrigger className="h-9 text-xs" data-testid={`select-so-product-${idx}`}><SelectValue placeholder="Product" /></SelectTrigger>
                        <SelectContent>
                          {products.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {prod?.has_variants ? (
                        <Select value={item.variant_id} onValueChange={v => setItems(l => l.map((x, i) => i === idx ? { ...x, variant_id: v } : x))}>
                          <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Variant" /></SelectTrigger>
                          <SelectContent>
                            {prod.variants.map((v: any) => (
                              <SelectItem key={v.id} value={String(v.id)}>{[v.size, v.colour].filter(Boolean).join(" / ") || v.sku || `#${v.id}`}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : <div className="text-xs text-muted-foreground text-center">—</div>}
                      <Input className="h-9 text-xs" type="number" min="1" placeholder="Qty" value={item.quantity}
                        onChange={e => setItems(l => l.map((x, i) => i === idx ? { ...x, quantity: e.target.value } : x))} data-testid={`input-so-qty-${idx}`} />
                      <Input className="h-9 text-xs" type="number" step="0.01" min="0" placeholder="Unit cost R" value={item.unit_cost}
                        onChange={e => setItems(l => l.map((x, i) => i === idx ? { ...x, unit_cost: e.target.value } : x))} />
                      <button className="text-destructive" onClick={() => setItems(l => l.filter((_, i) => i !== idx))}><X className="h-4 w-4" /></button>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button className="bg-[#1a5c38] hover:bg-[#164d30]" disabled={!supplierId || saving} onClick={create} data-testid="button-save-stock-order">
              {saving ? "Saving…" : "Place order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewOrder} onOpenChange={(o) => !o && setViewOrder(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Stock order #{viewOrder?.id} — {viewOrder?.supplier_name}</DialogTitle></DialogHeader>
          {viewOrder && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">{statusBadge(viewOrder.status)}
                <span className="text-xs text-muted-foreground">{new Date(viewOrder.created_at).toLocaleString()}</span>
              </div>
              <div className="border rounded-lg divide-y">
                {viewOrder.items.map((i: any) => (
                  <div key={i.id} className="flex justify-between p-2 text-sm">
                    <span>{i.quantity}× {i.product_name}{i.variant_label ? ` (${i.variant_label})` : ""}</span>
                    <span>{fmt(i.unit_cost * i.quantity)}</span>
                  </div>
                ))}
              </div>
              {viewOrder.notes && <p className="text-xs text-muted-foreground">{viewOrder.notes}</p>}
              {viewOrder.status === "ordered" && (
                <div className="flex gap-2 pt-2">
                  <Button className="flex-1 bg-[#1a5c38] hover:bg-[#164d30]" onClick={() => receive(viewOrder.id)}>
                    <PackageCheck className="h-4 w-4 mr-2" /> Mark received
                  </Button>
                  <Button variant="outline" className="text-destructive" onClick={() => cancel(viewOrder.id)}>Cancel order</Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
