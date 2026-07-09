import { useState, useEffect, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { posApi as api } from "@/lib/api";
import { PosWaiterGate } from "@/components/pos-waiter-gate";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Minus, Trash2, Banknote, CreditCard, XCircle } from "lucide-react";

const fmt = (n: number) => `R${Number(n).toFixed(2)}`;

export default function PosOrder() {
  const { toast } = useToast();
  const [, params] = useRoute("/orders/:id");
  const [, navigate] = useLocation();
  const orderId = params?.id;

  const [order, setOrder] = useState<any | null>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [activeCat, setActiveCat] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [variantPicker, setVariantPicker] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!orderId) return;
    api<any>(`/api/pos/orders/${orderId}`).then(setOrder).catch(() => navigate("/"));
  }, [orderId, navigate]);

  useEffect(() => {
    load();
    api<{ products: any[] }>("/api/pos/products").then(r => setProducts(r.products)).catch(() => {});
    api<{ categories: any[] }>("/api/pos/categories").then(r => setCategories(r.categories)).catch(() => {});
  }, [load]);

  const addItem = async (product: any, variant?: any) => {
    if (product.has_variants && !variant) { setVariantPicker(product); return; }
    setVariantPicker(null);
    try {
      const updated = await api<any>(`/api/pos/orders/${orderId}/items`, {
        method: "POST",
        body: JSON.stringify({ product_id: product.id, variant_id: variant?.id ?? null, quantity: 1 }),
      });
      setOrder(updated);
    } catch (err: any) {
      toast({ title: "Could not add item", description: err.message, variant: "destructive" });
    }
  };

  const setQty = async (itemId: number, quantity: number) => {
    try {
      const updated = await api<any>(`/api/pos/orders/${orderId}/items/${itemId}`, {
        method: "PUT",
        body: JSON.stringify({ quantity }),
      });
      setOrder(updated);
    } catch (err: any) {
      toast({ title: "Could not update item", description: err.message, variant: "destructive" });
    }
  };

  const pay = async (method: "cash" | "card") => {
    if (busy) return;
    setBusy(true);
    try {
      const updated = await api<any>(`/api/pos/orders/${orderId}/pay`, {
        method: "POST",
        body: JSON.stringify({ payment_method: method }),
      });
      setOrder(updated);
      toast({ title: "Payment recorded", description: `${fmt(updated.total)} paid by ${method}.` });
    } catch (err: any) {
      toast({ title: "Payment failed", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const cancelOrder = async () => {
    if (!confirm("Cancel this order? Items will be discarded.")) return;
    try {
      await api(`/api/pos/orders/${orderId}/cancel`, { method: "POST" });
      navigate("/");
    } catch (err: any) {
      toast({ title: "Could not cancel", description: err.message, variant: "destructive" });
    }
  };

  if (!order) return <PosWaiterGate><div className="p-6 text-muted-foreground">Loading…</div></PosWaiterGate>;

  const isOpen = order.status === "open";
  const title = order.order_type === "table" ? order.table_name : order.order_type === "takeaway" ? `Takeaway #${order.id}` : `Sale #${order.id}`;
  const visible = products.filter(p =>
    (activeCat == null || p.category_id === activeCat) &&
    (!search || p.name.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <PosWaiterGate>
    <div className="flex h-full">
      <div className="flex-1 flex flex-col p-4 gap-3 min-w-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")} data-testid="button-back-to-tables"><ArrowLeft className="h-4 w-4" /></Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold">{title}</h1>
            <p className="text-xs text-muted-foreground">Opened by {order.opened_by_name ?? "—"}</p>
          </div>
          <Badge variant={isOpen ? "secondary" : order.status === "paid" ? "default" : "destructive"} className={order.status === "paid" ? "bg-[#1a5c38]" : ""}>
            {order.status}
          </Badge>
        </div>

        {isOpen && (
          <>
            <div className="flex gap-2">
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search menu…" className="h-10" data-testid="input-menu-search" />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              <Button size="sm" variant={activeCat == null ? "default" : "outline"} className={activeCat == null ? "bg-[#1a5c38]" : ""} onClick={() => setActiveCat(null)}>All</Button>
              {categories.map(c => (
                <Button key={c.id} size="sm" variant={activeCat === c.id ? "default" : "outline"} className={activeCat === c.id ? "bg-[#1a5c38]" : ""} onClick={() => setActiveCat(c.id)}>{c.name}</Button>
              ))}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2.5 overflow-y-auto pb-4">
              {visible.map(p => (
                <Card key={p.id} className="p-3 cursor-pointer hover:ring-2 hover:ring-[#1a5c38]/40 transition-all" onClick={() => addItem(p)} data-testid={`menu-tile-${p.id}`}>
                  <p className="font-semibold text-sm leading-tight">{p.name}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="font-bold text-[#1a5c38]">{fmt(p.price)}</span>
                    {p.total_stock <= 0 && <Badge variant="destructive" className="text-[10px]">Out</Badge>}
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="w-96 border-l bg-white flex flex-col flex-shrink-0">
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="font-bold text-lg">Order</h2>
          {isOpen && (
            <Button variant="ghost" size="sm" className="text-destructive" onClick={cancelOrder} data-testid="button-cancel-order">
              <XCircle className="h-4 w-4 mr-1" /> Cancel
            </Button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {order.items.length === 0 && <p className="text-sm text-muted-foreground text-center py-10">No items yet.</p>}
          {order.items.map((i: any) => (
            <div key={i.id} className="border rounded-lg p-2" data-testid={`order-item-${i.id}`}>
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{i.name}</p>
                  {i.variant_label && <p className="text-xs text-muted-foreground">{i.variant_label}</p>}
                  <p className="text-xs text-muted-foreground">{fmt(i.unit_price)} each</p>
                </div>
                {isOpen ? (
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setQty(i.id, i.quantity - 1)}><Minus className="h-3 w-3" /></Button>
                    <span className="w-6 text-center text-sm font-semibold">{i.quantity}</span>
                    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setQty(i.id, i.quantity + 1)}><Plus className="h-3 w-3" /></Button>
                  </div>
                ) : (
                  <span className="text-sm font-semibold">×{i.quantity}</span>
                )}
                <div className="w-20 text-right text-sm font-semibold">{fmt(i.line_total)}</div>
                {isOpen && (
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setQty(i.id, 0)}><Trash2 className="h-3.5 w-3.5" /></Button>
                )}
              </div>
              {Number(i.discount) > 0 && (
                <p className="text-xs text-[#1a5c38] mt-1">Promotion applied: -{fmt(i.discount)}</p>
              )}
            </div>
          ))}
        </div>
        <div className="p-4 border-t space-y-2">
          <div className="flex justify-between text-sm"><span>Subtotal</span><span>{fmt(order.subtotal)}</span></div>
          {Number(order.discount_total) > 0 && (
            <div className="flex justify-between text-sm text-[#1a5c38]"><span>Promotions</span><span>-{fmt(order.discount_total)}</span></div>
          )}
          <div className="flex justify-between text-lg font-bold">
            <span>Total</span>
            <span data-testid="text-order-total">{fmt(order.total)}</span>
          </div>
          {isOpen ? (
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button className="h-12 bg-[#1a5c38] hover:bg-[#164d30]" disabled={order.items.length === 0 || busy} onClick={() => pay("cash")} data-testid="button-order-pay-cash">
                <Banknote className="h-4 w-4 mr-2" /> Paid Cash
              </Button>
              <Button className="h-12 bg-[#1a5c38] hover:bg-[#164d30]" disabled={order.items.length === 0 || busy} onClick={() => pay("card")} data-testid="button-order-pay-card">
                <CreditCard className="h-4 w-4 mr-2" /> Paid Card
              </Button>
            </div>
          ) : (
            <Button className="w-full" variant="outline" onClick={() => navigate("/")} data-testid="button-back-after-paid">Back to orders</Button>
          )}
        </div>
      </div>

      <Dialog open={!!variantPicker} onOpenChange={(o) => !o && setVariantPicker(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{variantPicker?.name} — choose variant</DialogTitle></DialogHeader>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {variantPicker?.variants?.map((v: any) => (
              <button
                key={v.id}
                className="w-full flex items-center justify-between border rounded-lg p-3 hover:bg-muted text-left"
                onClick={() => addItem(variantPicker, v)}
              >
                <div>
                  <p className="font-medium text-sm">{[v.size && `Size ${v.size}`, v.colour].filter(Boolean).join(" · ") || v.sku || `#${v.id}`}</p>
                  <p className="text-xs text-muted-foreground">{v.stock_qty} in stock</p>
                </div>
                <span className="font-semibold">{fmt(v.price != null ? v.price : variantPicker.price)}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </PosWaiterGate>
  );
}
