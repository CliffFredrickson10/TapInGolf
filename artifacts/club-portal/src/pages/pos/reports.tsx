import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const fmt = (n: number) => `R${Number(n).toFixed(2)}`;

function todayISO(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86400_000);
  return d.toISOString().slice(0, 10);
}

export default function PosReports() {
  const [from, setFrom] = useState(todayISO(-30));
  const [to, setTo] = useState(todayISO());
  const [summary, setSummary] = useState<any | null>(null);
  const [stock, setStock] = useState<any[]>([]);

  const load = useCallback(() => {
    api<any>(`/api/pos/reports/summary?from=${from}&to=${to}`).then(setSummary).catch(() => {});
  }, [from, to]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api<{ stock: any[] }>("/api/pos/reports/stock").then(r => setStock(r.stock)).catch(() => {});
  }, []);

  const lowStock = stock.filter(s => s.low_stock);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-sm text-muted-foreground">Sales performance and stock on hand.</p>
        </div>
        <div className="flex gap-2 items-end">
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-9" data-testid="input-report-from" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-9" data-testid="input-report-to" />
          </div>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Total sales</p>
            <p className="text-xl font-bold text-[#1a5c38]" data-testid="stat-total-sales">{fmt(summary.totals.total_sales)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Transactions</p>
            <p className="text-xl font-bold">{summary.totals.transaction_count}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Cash</p>
            <p className="text-xl font-bold">{fmt(summary.totals.cash_sales)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Card</p>
            <p className="text-xl font-bold">{fmt(summary.totals.card_sales)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Discounts given</p>
            <p className="text-xl font-bold">{fmt(summary.totals.total_discounts)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Tips & service fees</p>
            <p className="text-xl font-bold text-[#a8893a]" data-testid="stat-total-tips">
              {fmt(Number(summary.totals.total_tips ?? 0) + Number(summary.totals.total_service_fees ?? 0))}
            </p>
          </Card>
        </div>
      )}

      <Tabs defaultValue="sales">
        <TabsList>
          <TabsTrigger value="sales" data-testid="tab-sales">Sales</TabsTrigger>
          <TabsTrigger value="stock" data-testid="tab-stock">
            Stock on hand{lowStock.length > 0 ? ` (${lowStock.length} low)` : ""}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="space-y-4 mt-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card className="p-4">
              <h3 className="font-semibold mb-3">Top products</h3>
              <div className="space-y-2">
                {summary?.top_products?.map((p: any) => (
                  <div key={`${p.product_id}-${p.name}`} className="flex justify-between text-sm">
                    <span>{p.name} <span className="text-muted-foreground">×{p.units}</span></span>
                    <span className="font-medium">{fmt(p.sales)}</span>
                  </div>
                ))}
                {(!summary || summary.top_products.length === 0) && <p className="text-sm text-muted-foreground">No sales in this period.</p>}
              </div>
            </Card>
            <Card className="p-4">
              <h3 className="font-semibold mb-3">By category</h3>
              <div className="space-y-2">
                {summary?.by_category?.map((c: any) => (
                  <div key={c.category} className="flex justify-between text-sm">
                    <span>{c.category} <span className="text-muted-foreground">×{c.units}</span></span>
                    <span className="font-medium">{fmt(c.sales)}</span>
                  </div>
                ))}
                {(!summary || summary.by_category.length === 0) && <p className="text-sm text-muted-foreground">No sales in this period.</p>}
              </div>
            </Card>
            <Card className="p-4">
              <h3 className="font-semibold mb-3">By staff member</h3>
              <div className="space-y-2">
                {summary?.by_staff?.map((w: any) => (
                  <div key={w.staff_id} className="flex justify-between text-sm">
                    <span>{w.name} <span className="text-muted-foreground">({w.transactions} sales)</span></span>
                    <span className="font-medium">{fmt(w.sales)}</span>
                  </div>
                ))}
                {(!summary || summary.by_staff.length === 0) && <p className="text-sm text-muted-foreground">No sales in this period.</p>}
              </div>
            </Card>
            <Card className="p-4">
              <h3 className="font-semibold mb-3">Tips by waiter</h3>
              <div className="space-y-2">
                {summary?.tips_by_staff?.map((w: any) => (
                  <div key={w.staff_id} className="flex justify-between text-sm" data-testid={`report-tips-${w.staff_id}`}>
                    <span>{w.name} <span className="text-muted-foreground">({w.orders} order{w.orders === 1 ? "" : "s"})</span></span>
                    <span className="font-medium text-[#a8893a]">{fmt(w.total_tips)}</span>
                  </div>
                ))}
                {(!summary || !summary.tips_by_staff || summary.tips_by_staff.length === 0) && <p className="text-sm text-muted-foreground">No tips in this period.</p>}
              </div>
            </Card>
            <Card className="p-4">
              <h3 className="font-semibold mb-3">Daily sales</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {summary?.by_day?.map((d: any) => (
                  <div key={d.day} className="flex justify-between text-sm">
                    <span>{new Date(d.day).toLocaleDateString()} <span className="text-muted-foreground">({d.transactions})</span></span>
                    <span className="font-medium">{fmt(d.sales)}</span>
                  </div>
                ))}
                {(!summary || summary.by_day.length === 0) && <p className="text-sm text-muted-foreground">No sales in this period.</p>}
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="stock" className="mt-4">
          <div className="bg-white rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Variants</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stock.map(p => (
                  <TableRow key={p.id} data-testid={`stock-row-${p.id}`}>
                    <TableCell>
                      <p className="font-medium">{p.name}</p>
                      {p.brand && <p className="text-xs text-muted-foreground">{p.brand}</p>}
                    </TableCell>
                    <TableCell className="text-sm">{p.category_name ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {p.variants.length > 0
                        ? p.variants.map((v: any) => `${v.label}: ${v.stock_qty}`).join(" · ")
                        : "—"}
                    </TableCell>
                    <TableCell className="font-semibold">{p.total_stock}</TableCell>
                    <TableCell>
                      {p.low_stock
                        ? <Badge variant="destructive">Low stock</Badge>
                        : <Badge variant="secondary">OK</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
                {stock.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No products.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
