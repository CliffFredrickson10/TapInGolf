import { useState, useEffect, useRef, useCallback } from "react";
import { posApi as api } from "@/lib/api";
import { PosWaiterGate } from "@/components/pos-waiter-gate";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ScanBarcode, Plus, Minus, Trash2, Banknote, CreditCard, Flag } from "lucide-react";

interface Variant { id: number; size: string | null; colour: string | null; barcode: string | null; sku: string | null; price: number | null; stock_qty: number; }
interface Product {
  id: number; name: string; brand: string | null; price: number; barcode: string | null;
  category_id: number | null; category_name: string | null; has_variants: number;
  stock_qty: number; total_stock: number; variants: Variant[];
}
interface CartLine {
  key: string; product_id: number; variant_id: number | null;
  name: string; variant_label: string | null; unit_price: number; quantity: number;
}

const fmt = (n: number) => `R${n.toFixed(2)}`;

export default function PosTill() {
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([]);
  const [activeCat, setActiveCat] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [barcode, setBarcode] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [variantPicker, setVariantPicker] = useState<Product | null>(null);
  const [paying, setPaying] = useState(false);
  const [receipt, setReceipt] = useState<any | null>(null);
  const [preview, setPreview] = useState<{ subtotal: number; discount_total: number; total: number } | null>(null);
  const barcodeRef = useRef<HTMLInputElement>(null);
  const previewSeq = useRef(0);

  // Walk-in golf booking
  interface GolfSlot { id: number; time: string; tee_start_type: string; session_type: string; max_players: number; available: number; }
  const todayISO = () => new Date(Date.now() + 2 * 3600_000).toISOString().slice(0, 10);
  const [golfOpen, setGolfOpen] = useState(false);
  const [golfDate, setGolfDate] = useState(todayISO());
  const [golfSlots, setGolfSlots] = useState<GolfSlot[]>([]);
  const [golfSlotsLoading, setGolfSlotsLoading] = useState(false);
  const [golfSlotId, setGolfSlotId] = useState<number | null>(null);
  const [golfPlayers, setGolfPlayers] = useState(1);
  const [golfName, setGolfName] = useState("");
  const [golfPhone, setGolfPhone] = useState("");
  const [golfFee, setGolfFee] = useState("");
  const [golfSaving, setGolfSaving] = useState(false);
  const [golfReceipt, setGolfReceipt] = useState<any | null>(null);
  const [golfIncludeCart, setGolfIncludeCart] = useState(true);

  useEffect(() => {
    if (!golfOpen) return;
    setGolfSlotsLoading(true);
    setGolfSlotId(null);
    api<{ slots: GolfSlot[] }>(`/api/pos/tee-times?date=${golfDate}`)
      .then(r => setGolfSlots(r.slots))
      .catch(() => setGolfSlots([]))
      .finally(() => setGolfSlotsLoading(false));
  }, [golfOpen, golfDate]);

  const resetGolf = () => {
    setGolfSlotId(null); setGolfPlayers(1); setGolfName(""); setGolfPhone(""); setGolfFee(""); setGolfIncludeCart(true);
  };

  const selectedSlot = golfSlots.find(s => s.id === golfSlotId) ?? null;
  const feePerPlayer = golfFee.trim() === "" ? 0 : Number(golfFee);
  const golfFeesTotal = Number.isFinite(feePerPlayer) && feePerPlayer >= 0
    ? Math.round(feePerPlayer * golfPlayers * 100) / 100 : 0;

  const bookGolf = async (method: "cash" | "card") => {
    if (!golfSlotId || !golfName.trim() || golfSaving) return;
    const includeItems = golfIncludeCart && cart.length > 0;
    setGolfSaving(true);
    try {
      const r = await api<any>("/api/pos/walk-in-bookings", {
        method: "POST",
        body: JSON.stringify({
          tee_time_id: golfSlotId,
          players: golfPlayers,
          guest_name: golfName.trim(),
          guest_phone: golfPhone.trim() || undefined,
          green_fee_per_player: golfFee.trim() === "" ? undefined : feePerPlayer,
          payment_method: method,
          items: includeItems ? cart.map(l => ({ product_id: l.product_id, variant_id: l.variant_id, quantity: l.quantity })) : undefined,
        }),
      });
      setGolfOpen(false);
      resetGolf();
      if (includeItems) { setCart([]); load(); }
      setGolfReceipt(r);
    } catch (err: any) {
      toast({ title: "Booking failed", description: err.message, variant: "destructive" });
    } finally {
      setGolfSaving(false);
    }
  };

  const load = useCallback(() => {
    api<{ products: Product[] }>("/api/pos/products").then(r => setProducts(r.products)).catch(() => {});
    api<{ categories: any[] }>("/api/pos/categories").then(r => setCategories(r.categories)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const addLine = useCallback((line: Omit<CartLine, "key" | "quantity">) => {
    const key = `${line.product_id}:${line.variant_id ?? ""}`;
    setCart(prev => {
      const existing = prev.find(l => l.key === key);
      if (existing) return prev.map(l => l.key === key ? { ...l, quantity: l.quantity + 1 } : l);
      return [...prev, { ...line, key, quantity: 1 }];
    });
  }, []);

  const addProduct = (p: Product, v?: Variant) => {
    if (p.has_variants && !v) { setVariantPicker(p); return; }
    addLine({
      product_id: p.id,
      variant_id: v?.id ?? null,
      name: p.name,
      variant_label: v ? [v.size, v.colour].filter(Boolean).join(" / ") || null : null,
      unit_price: v?.price != null ? v.price : p.price,
    });
    setVariantPicker(null);
  };

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = barcode.trim();
    if (!code) return;
    setBarcode("");
    try {
      const r = await api<any>(`/api/pos/products/lookup?barcode=${encodeURIComponent(code)}`);
      if (!r.found) { toast({ title: "Not found", description: `No product with barcode ${code}`, variant: "destructive" }); return; }
      if (r.needs_variant) { setVariantPicker(r.product); return; }
      addLine({ product_id: r.product_id, variant_id: r.variant_id, name: r.name, variant_label: r.variant_label, unit_price: r.price });
    } catch (err: any) {
      toast({ title: "Scan failed", description: err.message, variant: "destructive" });
    }
  };

  const changeQty = (key: string, delta: number) => {
    setCart(prev => prev
      .map(l => l.key === key ? { ...l, quantity: l.quantity + delta } : l)
      .filter(l => l.quantity > 0));
  };

  const subtotal = cart.reduce((sum, l) => sum + l.unit_price * l.quantity, 0);

  // Live promotion preview — recompute server-side whenever the cart changes
  useEffect(() => {
    const seq = ++previewSeq.current;
    if (cart.length === 0) { setPreview(null); return; }
    const t = setTimeout(() => {
      api<{ subtotal: number; discount_total: number; total: number }>("/api/pos/sales/preview", {
        method: "POST",
        body: JSON.stringify({ items: cart.map(l => ({ product_id: l.product_id, variant_id: l.variant_id, quantity: l.quantity })) }),
      })
        .then(r => { if (previewSeq.current === seq) setPreview(r); })
        .catch(() => { if (previewSeq.current === seq) setPreview(null); });
    }, 250);
    return () => clearTimeout(t);
  }, [cart]);

  const discountTotal = preview?.discount_total ?? 0;
  const displayTotal = preview != null ? preview.total : subtotal;

  const pay = async (method: "cash" | "card") => {
    if (cart.length === 0 || paying) return;
    setPaying(true);
    try {
      const sale = await api<any>("/api/pos/sales", {
        method: "POST",
        body: JSON.stringify({
          payment_method: method,
          items: cart.map(l => ({ product_id: l.product_id, variant_id: l.variant_id, quantity: l.quantity })),
        }),
      });
      setReceipt(sale);
      setCart([]);
      load();
    } catch (err: any) {
      toast({ title: "Sale failed", description: err.message, variant: "destructive" });
    } finally {
      setPaying(false);
    }
  };

  const visible = products.filter(p =>
    (activeCat == null || p.category_id === activeCat) &&
    (!search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.brand ?? "").toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <PosWaiterGate>
    <div className="flex h-full">
      <div className="flex-1 flex flex-col p-4 gap-3 min-w-0">
        <form onSubmit={handleScan} className="flex gap-2">
          <div className="relative flex-1">
            <ScanBarcode className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={barcodeRef}
              autoFocus
              value={barcode}
              onChange={e => setBarcode(e.target.value)}
              placeholder="Scan barcode or type code / SKU and press Enter"
              className="pl-9 h-11"
              data-testid="input-barcode"
            />
          </div>
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search products…"
            className="w-56 h-11"
            data-testid="input-product-search"
          />
          <Button type="button" variant="outline" className="h-11" onClick={() => setGolfOpen(true)} data-testid="button-golf-booking">
            <Flag className="h-4 w-4 mr-2 text-[#1a5c38]" /> Golf booking
          </Button>
        </form>
        <div className="flex gap-1.5 flex-wrap">
          <Button size="sm" variant={activeCat == null ? "default" : "outline"} className={activeCat == null ? "bg-[#1a5c38]" : ""} onClick={() => setActiveCat(null)}>All</Button>
          {categories.map(c => (
            <Button key={c.id} size="sm" variant={activeCat === c.id ? "default" : "outline"} className={activeCat === c.id ? "bg-[#1a5c38]" : ""} onClick={() => setActiveCat(c.id)}>{c.name}</Button>
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2.5 overflow-y-auto pb-4">
          {visible.map(p => (
            <Card
              key={p.id}
              className="p-3 cursor-pointer hover:ring-2 hover:ring-[#1a5c38]/40 transition-all"
              onClick={() => addProduct(p)}
              data-testid={`product-tile-${p.id}`}
            >
              <p className="font-semibold text-sm leading-tight">{p.name}</p>
              {p.brand && <p className="text-xs text-muted-foreground">{p.brand}</p>}
              <div className="flex items-center justify-between mt-2">
                <span className="font-bold text-[#1a5c38]">{fmt(p.price)}</span>
                <Badge variant={p.total_stock <= 0 ? "destructive" : "secondary"} className="text-[10px]">
                  {p.has_variants ? `${p.variants.length} variants` : `${p.total_stock} in stock`}
                </Badge>
              </div>
            </Card>
          ))}
          {visible.length === 0 && <p className="text-sm text-muted-foreground col-span-full py-8 text-center">No products found.</p>}
        </div>
      </div>

      <div className="w-96 border-l bg-white flex flex-col flex-shrink-0">
        <div className="p-4 border-b">
          <h2 className="font-bold text-lg">Current Sale</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {cart.length === 0 && <p className="text-sm text-muted-foreground text-center py-10">Scan or tap products to add them.</p>}
          {cart.map(l => (
            <div key={l.key} className="flex items-center gap-2 border rounded-lg p-2" data-testid={`cart-line-${l.key}`}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{l.name}</p>
                {l.variant_label && <p className="text-xs text-muted-foreground">{l.variant_label}</p>}
                <p className="text-xs text-muted-foreground">{fmt(l.unit_price)} each</p>
              </div>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => changeQty(l.key, -1)}><Minus className="h-3 w-3" /></Button>
                <span className="w-6 text-center text-sm font-semibold">{l.quantity}</span>
                <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => changeQty(l.key, 1)}><Plus className="h-3 w-3" /></Button>
              </div>
              <div className="w-20 text-right text-sm font-semibold">{fmt(l.unit_price * l.quantity)}</div>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => changeQty(l.key, -l.quantity)}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          ))}
        </div>
        <div className="p-4 border-t space-y-3">
          <div className="space-y-1">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Subtotal</span>
              <span data-testid="text-cart-subtotal">{fmt(subtotal)}</span>
            </div>
            {discountTotal > 0 && (
              <div className="flex justify-between text-sm text-[#1a5c38] font-medium">
                <span>Promotions</span>
                <span data-testid="text-cart-discount">-{fmt(discountTotal)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold">
              <span>Total</span>
              <span data-testid="text-cart-total">{fmt(displayTotal)}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button className="h-12 bg-[#1a5c38] hover:bg-[#164d30]" disabled={cart.length === 0 || paying} onClick={() => pay("cash")} data-testid="button-pay-cash">
              <Banknote className="h-4 w-4 mr-2" /> Cash
            </Button>
            <Button className="h-12 bg-[#1a5c38] hover:bg-[#164d30]" disabled={cart.length === 0 || paying} onClick={() => pay("card")} data-testid="button-pay-card">
              <CreditCard className="h-4 w-4 mr-2" /> Card
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={!!variantPicker} onOpenChange={(o) => !o && setVariantPicker(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{variantPicker?.name} — choose variant</DialogTitle></DialogHeader>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {variantPicker?.variants.map(v => (
              <button
                key={v.id}
                className="w-full flex items-center justify-between border rounded-lg p-3 hover:bg-muted text-left"
                onClick={() => addProduct(variantPicker, v)}
                data-testid={`variant-option-${v.id}`}
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

      <Dialog open={golfOpen} onOpenChange={(o) => { setGolfOpen(o); if (!o) resetGolf(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Flag className="h-5 w-5 text-[#1a5c38]" /> Walk-in golf booking
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs">Date</Label>
              <Input type="date" value={golfDate} onChange={e => setGolfDate(e.target.value)} className="h-9" data-testid="input-golf-date" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tee time</Label>
              {golfSlotsLoading ? (
                <p className="text-sm text-muted-foreground py-2">Loading tee times…</p>
              ) : golfSlots.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No tee times for this date.</p>
              ) : (
                <div className="grid grid-cols-4 gap-1.5 max-h-40 overflow-y-auto pr-1">
                  {golfSlots.map(sl => (
                    <button
                      key={sl.id}
                      type="button"
                      disabled={sl.available < 1}
                      onClick={() => { setGolfSlotId(sl.id); if (golfPlayers > sl.available) setGolfPlayers(sl.available); }}
                      className={`border rounded-md px-2 py-1.5 text-sm text-center transition-colors
                        ${sl.available < 1 ? "opacity-40 cursor-not-allowed" :
                          golfSlotId === sl.id ? "bg-[#1a5c38] text-white border-[#1a5c38]" : "hover:bg-muted"}`}
                      data-testid={`golf-slot-${sl.id}`}
                    >
                      <span className="font-semibold">{sl.time}</span>
                      <span className={`block text-[10px] ${golfSlotId === sl.id ? "text-white/80" : "text-muted-foreground"}`}>
                        {sl.available < 1 ? "Full" : `${sl.available} open`}{sl.tee_start_type === "tenth_tee" || sl.tee_start_type === "10th Tee" ? " · 10th" : ""}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Players</Label>
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4].map(n => (
                    <Button
                      key={n} type="button" size="sm"
                      variant={golfPlayers === n ? "default" : "outline"}
                      className={golfPlayers === n ? "bg-[#1a5c38]" : ""}
                      disabled={selectedSlot != null && n > selectedSlot.available}
                      onClick={() => setGolfPlayers(n)}
                      data-testid={`golf-players-${n}`}
                    >{n}</Button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Green fee per player (R)</Label>
                <Input
                  type="number" min="0" step="0.01" value={golfFee}
                  onChange={e => setGolfFee(e.target.value)}
                  placeholder="0.00" className="h-9"
                  data-testid="input-golf-fee"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Lead player name *</Label>
                <Input value={golfName} onChange={e => setGolfName(e.target.value)} placeholder="e.g. John Smith" className="h-9" data-testid="input-golf-name" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Phone (optional)</Label>
                <Input value={golfPhone} onChange={e => setGolfPhone(e.target.value)} placeholder="082 123 4567" className="h-9" data-testid="input-golf-phone" />
              </div>
            </div>
            {cart.length > 0 && (
              <label className="flex items-center gap-2 rounded-md border p-2.5 cursor-pointer hover:bg-muted/50">
                <input
                  type="checkbox"
                  checked={golfIncludeCart}
                  onChange={e => setGolfIncludeCart(e.target.checked)}
                  className="h-4 w-4 accent-[#1a5c38]"
                  data-testid="checkbox-golf-include-cart"
                />
                <span className="text-sm flex-1">
                  Include till cart ({cart.reduce((n, l) => n + l.quantity, 0)} item{cart.reduce((n, l) => n + l.quantity, 0) === 1 ? "" : "s"})
                </span>
                <span className="text-sm font-semibold">{fmt(displayTotal)}</span>
              </label>
            )}
            <div className="flex items-center justify-between border-t pt-3">
              <div>
                {golfIncludeCart && cart.length > 0 ? (
                  <>
                    <p className="text-xs text-muted-foreground">
                      Green fees {fmt(golfFeesTotal)} + products {fmt(displayTotal)}
                    </p>
                    <p className="text-xl font-bold text-[#1a5c38]" data-testid="text-golf-total">{fmt(Math.round((golfFeesTotal + displayTotal) * 100) / 100)}</p>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">Total green fees</p>
                    <p className="text-xl font-bold text-[#1a5c38]" data-testid="text-golf-total">{fmt(golfFeesTotal)}</p>
                  </>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  className="h-11 bg-[#1a5c38] hover:bg-[#164d30]"
                  disabled={!golfSlotId || !golfName.trim() || golfSaving || !Number.isFinite(feePerPlayer) || feePerPlayer < 0}
                  onClick={() => bookGolf("cash")}
                  data-testid="button-golf-cash"
                >
                  <Banknote className="h-4 w-4 mr-2" /> Cash
                </Button>
                <Button
                  className="h-11 bg-[#1a5c38] hover:bg-[#164d30]"
                  disabled={!golfSlotId || !golfName.trim() || golfSaving || !Number.isFinite(feePerPlayer) || feePerPlayer < 0}
                  onClick={() => bookGolf("card")}
                  data-testid="button-golf-card"
                >
                  <CreditCard className="h-4 w-4 mr-2" /> Card
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!golfReceipt} onOpenChange={(o) => { if (!o) { setGolfReceipt(null); barcodeRef.current?.focus(); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Booking confirmed</DialogTitle></DialogHeader>
          {golfReceipt && (
            <div className="space-y-2 text-sm">
              <div className="rounded-lg bg-[#f0f7f2] border border-[#1a5c38]/20 p-3 text-center">
                <p className="text-xs text-muted-foreground">Booking reference</p>
                <p className="text-lg font-bold text-[#1a5c38]" data-testid="text-golf-booking-ref">{golfReceipt.booking_ref}</p>
              </div>
              <div className="flex justify-between"><span>Tee time</span><span className="font-medium">{golfReceipt.date} at {golfReceipt.time}</span></div>
              <div className="flex justify-between"><span>Lead player</span><span className="font-medium">{golfReceipt.guest_name}</span></div>
              <div className="flex justify-between"><span>Players</span><span className="font-medium">{golfReceipt.players}</span></div>
              {golfReceipt.sale && (
                <>
                  <div className="flex justify-between"><span>Green fees</span><span className="font-medium">{fmt(Number(golfReceipt.green_fee_total ?? 0))}</span></div>
                  <div className="flex justify-between"><span>Products</span><span className="font-medium">{fmt(Number(golfReceipt.products_total ?? 0))}</span></div>
                </>
              )}
              {Number(golfReceipt.grand_total ?? golfReceipt.total) > 0 && (
                <div className="flex justify-between border-t pt-2 font-bold">
                  <span>Paid ({golfReceipt.payment_method})</span><span data-testid="text-golf-receipt-total">{fmt(Number(golfReceipt.grand_total ?? golfReceipt.total))}</span>
                </div>
              )}
              <Button className="w-full bg-[#1a5c38] hover:bg-[#164d30]" onClick={() => { setGolfReceipt(null); barcodeRef.current?.focus(); }} data-testid="button-golf-done">
                Done
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!receipt} onOpenChange={(o) => { if (!o) { setReceipt(null); barcodeRef.current?.focus(); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Sale complete</DialogTitle></DialogHeader>
          {receipt && (
            <div className="space-y-2">
              {receipt.items?.map((i: any) => (
                <div key={i.id} className="flex justify-between text-sm">
                  <span>{i.quantity}× {i.name}{i.variant_label ? ` (${i.variant_label})` : ""}</span>
                  <span>{fmt(Number(i.line_total))}</span>
                </div>
              ))}
              <div className="border-t pt-2 space-y-1 text-sm">
                <div className="flex justify-between"><span>Subtotal</span><span>{fmt(Number(receipt.subtotal))}</span></div>
                {Number(receipt.discount_total) > 0 && (
                  <div className="flex justify-between text-[#1a5c38]"><span>Promotions</span><span>-{fmt(Number(receipt.discount_total))}</span></div>
                )}
                <div className="flex justify-between font-bold text-base"><span>Paid ({receipt.payment_method})</span><span data-testid="text-receipt-total">{fmt(Number(receipt.total))}</span></div>
              </div>
              <Button className="w-full bg-[#1a5c38] hover:bg-[#164d30]" onClick={() => { setReceipt(null); barcodeRef.current?.focus(); }} data-testid="button-new-sale">
                New sale
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
    </PosWaiterGate>
  );
}
