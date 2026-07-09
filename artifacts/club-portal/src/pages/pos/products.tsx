import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, PackagePlus, X } from "lucide-react";

const fmt = (n: number) => `R${Number(n).toFixed(2)}`;

interface VariantDraft {
  id?: number; size: string; colour: string; barcode: string; sku: string; price: string; stock_qty: string;
}

const emptyForm = {
  name: "", brand: "", description: "", price: "", barcode: "", sku: "",
  stock_qty: "0", low_stock_threshold: "5", category_id: "" as string,
};

export default function PosProducts() {
  const { toast } = useToast();
  const { posOutlet } = useAuth();
  const isProShop = posOutlet?.type === "pro_shop";

  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [variants, setVariants] = useState<VariantDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [adjustProduct, setAdjustProduct] = useState<any | null>(null);
  const [adjustVariantId, setAdjustVariantId] = useState<string>("");
  const [adjustChange, setAdjustChange] = useState("");

  const load = useCallback(() => {
    api<{ products: any[] }>("/api/pos/products?include_inactive=1").then(r => setProducts(r.products)).catch(() => {});
    api<{ categories: any[] }>("/api/pos/categories").then(r => setCategories(r.categories)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setVariants([]);
    setDialogOpen(true);
  };

  const openEdit = (p: any) => {
    setEditing(p);
    setForm({
      name: p.name, brand: p.brand ?? "", description: p.description ?? "", price: String(p.price),
      barcode: p.barcode ?? "", sku: p.sku ?? "", stock_qty: String(p.stock_qty),
      low_stock_threshold: String(p.low_stock_threshold), category_id: p.category_id ? String(p.category_id) : "",
    });
    setVariants((p.variants ?? []).map((v: any) => ({
      id: v.id, size: v.size ?? "", colour: v.colour ?? "", barcode: v.barcode ?? "",
      sku: v.sku ?? "", price: v.price != null ? String(v.price) : "", stock_qty: String(v.stock_qty),
    })));
    setDialogOpen(true);
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const body: any = {
        name: form.name, brand: form.brand || null, description: form.description || null,
        price: Number(form.price), barcode: form.barcode || null, sku: form.sku || null,
        stock_qty: Number(form.stock_qty) || 0, low_stock_threshold: Number(form.low_stock_threshold) || 5,
        category_id: form.category_id ? Number(form.category_id) : null,
        variants: variants.map(v => ({
          id: v.id, size: v.size || null, colour: v.colour || null, barcode: v.barcode || null,
          sku: v.sku || null, price: v.price !== "" ? Number(v.price) : null, stock_qty: Number(v.stock_qty) || 0,
        })),
      };
      if (editing) {
        await api(`/api/pos/products/${editing.id}`, { method: "PUT", body: JSON.stringify(body) });
        toast({ title: "Product updated" });
      } else {
        await api("/api/pos/products", { method: "POST", body: JSON.stringify(body) });
        toast({ title: "Product added" });
      }
      setDialogOpen(false);
      load();
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (p: any) => {
    if (!confirm(`Remove "${p.name}" from the product list?`)) return;
    try {
      await api(`/api/pos/products/${p.id}`, { method: "DELETE" });
      toast({ title: "Product removed" });
      load();
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    }
  };

  const addCategory = async () => {
    const name = newCategory.trim();
    if (!name) return;
    try {
      await api("/api/pos/categories", { method: "POST", body: JSON.stringify({ name }) });
      setNewCategory("");
      load();
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    }
  };

  const submitAdjust = async () => {
    const change = Math.round(Number(adjustChange));
    if (!change) return;
    try {
      await api(`/api/pos/products/${adjustProduct.id}/adjust-stock`, {
        method: "POST",
        body: JSON.stringify({ change, variant_id: adjustVariantId ? Number(adjustVariantId) : null }),
      });
      toast({ title: "Stock adjusted" });
      setAdjustProduct(null);
      setAdjustChange("");
      setAdjustVariantId("");
      load();
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    }
  };

  const visible = products.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.brand ?? "").toLowerCase().includes(search.toLowerCase())
      || (p.barcode ?? "").includes(search) || (p.sku ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Products</h1>
          <p className="text-sm text-muted-foreground">Manage your outlet catalogue{isProShop ? ", variants, barcodes and SKUs" : ""}.</p>
        </div>
        <Button className="bg-[#1a5c38] hover:bg-[#164d30]" onClick={openCreate} data-testid="button-add-product">
          <Plus className="h-4 w-4 mr-2" /> Add product
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, brand, barcode…" className="max-w-xs" data-testid="input-products-search" />
        <div className="flex gap-1.5 items-center ml-auto">
          <Input value={newCategory} onChange={e => setNewCategory(e.target.value)} placeholder="New category…" className="w-40 h-9"
            onKeyDown={e => e.key === "Enter" && addCategory()} data-testid="input-new-category" />
          <Button size="sm" variant="outline" onClick={addCategory} data-testid="button-add-category">Add category</Button>
        </div>
      </div>

      <div className="bg-white rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Price</TableHead>
              {isProShop && <TableHead>Barcode / SKU</TableHead>}
              <TableHead>Stock</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-32"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map(p => (
              <TableRow key={p.id} data-testid={`product-row-${p.id}`} className={p.active ? "" : "opacity-50"}>
                <TableCell>
                  <p className="font-medium">{p.name}</p>
                  {p.brand && <p className="text-xs text-muted-foreground">{p.brand}</p>}
                  {p.has_variants ? (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {p.variants.map((v: any) => [v.size, v.colour].filter(Boolean).join("/")).join(", ")}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell className="text-sm">{p.category_name ?? "—"}</TableCell>
                <TableCell className="font-medium">{fmt(p.price)}</TableCell>
                {isProShop && (
                  <TableCell className="text-xs text-muted-foreground">
                    {p.has_variants
                      ? `${p.variants.filter((v: any) => v.barcode).length} variant barcodes`
                      : [p.barcode, p.sku].filter(Boolean).join(" / ") || "—"}
                  </TableCell>
                )}
                <TableCell>
                  <Badge variant={p.total_stock <= p.low_stock_threshold ? "destructive" : "secondary"}>
                    {p.total_stock}
                  </Badge>
                </TableCell>
                <TableCell>
                  {p.active ? <Badge className="bg-[#1a5c38]">Active</Badge> : <Badge variant="outline">Inactive</Badge>}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1 justify-end">
                    <Button size="icon" variant="ghost" className="h-8 w-8" title="Adjust stock"
                      onClick={() => { setAdjustProduct(p); setAdjustVariantId(p.has_variants && p.variants[0] ? String(p.variants[0].id) : ""); }}
                      data-testid={`button-adjust-${p.id}`}>
                      <PackagePlus className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(p)} data-testid={`button-edit-${p.id}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => deactivate(p)} data-testid={`button-delete-${p.id}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {visible.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No products.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit product" : "Add product"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label>Name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} data-testid="input-product-name" />
            </div>
            <div className="space-y-1.5">
              <Label>Brand</Label>
              <Input value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.category_id || "none"} onValueChange={v => setForm(f => ({ ...f, category_id: v === "none" ? "" : v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Uncategorised</SelectItem>
                  {categories.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Price (R) *</Label>
              <Input type="number" step="0.01" min="0" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} data-testid="input-product-price" />
            </div>
            <div className="space-y-1.5">
              <Label>Low stock alert at</Label>
              <Input type="number" min="0" value={form.low_stock_threshold} onChange={e => setForm(f => ({ ...f, low_stock_threshold: e.target.value }))} />
            </div>
            {variants.length === 0 && (
              <>
                <div className="space-y-1.5">
                  <Label>Barcode</Label>
                  <Input value={form.barcode} onChange={e => setForm(f => ({ ...f, barcode: e.target.value }))} data-testid="input-product-barcode" />
                </div>
                <div className="space-y-1.5">
                  <Label>SKU</Label>
                  <Input value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Stock quantity</Label>
                  <Input type="number" min="0" value={form.stock_qty} onChange={e => setForm(f => ({ ...f, stock_qty: e.target.value }))} data-testid="input-product-stock" />
                </div>
              </>
            )}
            <div className="space-y-1.5 col-span-2">
              <Label>Description</Label>
              <Textarea rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
          </div>

          <div className="border-t pt-3">
            <div className="flex items-center justify-between mb-2">
              <div>
                <Label className="text-sm font-semibold">Variants (size / colour)</Label>
                <p className="text-xs text-muted-foreground">Each variant carries its own barcode, SKU and stock. Leave empty for a simple product.</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setVariants(v => [...v, { size: "", colour: "", barcode: "", sku: "", price: "", stock_qty: "0" }])} data-testid="button-add-variant">
                <Plus className="h-3.5 w-3.5 mr-1" /> Variant
              </Button>
            </div>
            {variants.length > 0 && (
              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_1fr_1.4fr_1.2fr_1fr_0.8fr_28px] gap-1.5 text-[11px] text-muted-foreground font-medium px-0.5">
                  <span>Size</span><span>Colour</span><span>Barcode</span><span>SKU</span><span>Price (opt)</span><span>Stock</span><span></span>
                </div>
                {variants.map((v, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_1fr_1.4fr_1.2fr_1fr_0.8fr_28px] gap-1.5 items-center">
                    <Input className="h-8 text-xs" value={v.size} onChange={e => setVariants(list => list.map((x, i) => i === idx ? { ...x, size: e.target.value } : x))} data-testid={`input-variant-size-${idx}`} />
                    <Input className="h-8 text-xs" value={v.colour} onChange={e => setVariants(list => list.map((x, i) => i === idx ? { ...x, colour: e.target.value } : x))} />
                    <Input className="h-8 text-xs" value={v.barcode} onChange={e => setVariants(list => list.map((x, i) => i === idx ? { ...x, barcode: e.target.value } : x))} data-testid={`input-variant-barcode-${idx}`} />
                    <Input className="h-8 text-xs" value={v.sku} onChange={e => setVariants(list => list.map((x, i) => i === idx ? { ...x, sku: e.target.value } : x))} />
                    <Input className="h-8 text-xs" type="number" step="0.01" value={v.price} onChange={e => setVariants(list => list.map((x, i) => i === idx ? { ...x, price: e.target.value } : x))} />
                    <Input className="h-8 text-xs" type="number" value={v.stock_qty} onChange={e => setVariants(list => list.map((x, i) => i === idx ? { ...x, stock_qty: e.target.value } : x))} />
                    <button className="text-destructive" onClick={() => setVariants(list => list.filter((_, i) => i !== idx))}><X className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button className="bg-[#1a5c38] hover:bg-[#164d30]" disabled={!form.name.trim() || form.price === "" || saving} onClick={save} data-testid="button-save-product">
              {saving ? "Saving…" : "Save product"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!adjustProduct} onOpenChange={(o) => !o && setAdjustProduct(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Adjust stock — {adjustProduct?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {adjustProduct?.has_variants ? (
              <div className="space-y-1.5">
                <Label>Variant</Label>
                <Select value={adjustVariantId} onValueChange={setAdjustVariantId}>
                  <SelectTrigger><SelectValue placeholder="Choose variant" /></SelectTrigger>
                  <SelectContent>
                    {adjustProduct.variants.map((v: any) => (
                      <SelectItem key={v.id} value={String(v.id)}>
                        {[v.size, v.colour].filter(Boolean).join(" / ") || v.sku || `#${v.id}`} ({v.stock_qty} in stock)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label>Change (use negative to remove)</Label>
              <Input type="number" value={adjustChange} onChange={e => setAdjustChange(e.target.value)} placeholder="e.g. 10 or -2" data-testid="input-adjust-change" />
            </div>
          </div>
          <DialogFooter>
            <Button className="bg-[#1a5c38] hover:bg-[#164d30]" onClick={submitAdjust} disabled={!adjustChange || (adjustProduct?.has_variants && !adjustVariantId)} data-testid="button-submit-adjust">
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
