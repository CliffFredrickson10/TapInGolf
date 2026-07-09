import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { posApi as api } from "@/lib/api";
import { PosWaiterGate } from "@/components/pos-waiter-gate";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, UtensilsCrossed, ShoppingBag, HandCoins } from "lucide-react";

const fmt = (n: number) => `R${Number(n).toFixed(2)}`;

export default function PosTables() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewTable, setShowNewTable] = useState(false);
  const [tableName, setTableName] = useState("");
  const [creating, setCreating] = useState(false);
  const [myTips, setMyTips] = useState<any | null>(null);

  const load = useCallback(() => {
    api<{ orders: any[] }>("/api/pos/orders?status=open")
      .then(r => setOrders(r.orders))
      .catch(() => {})
      .finally(() => setLoading(false));
    api<any>("/api/pos/my-tips").then(setMyTips).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 15_000);
    return () => clearInterval(timer);
  }, [load]);

  const createOrder = async (orderType: "table" | "takeaway", name?: string) => {
    if (creating) return;
    setCreating(true);
    try {
      const order = await api<any>("/api/pos/orders", {
        method: "POST",
        body: JSON.stringify({ order_type: orderType, table_name: name }),
      });
      setShowNewTable(false);
      setTableName("");
      navigate(`/orders/${order.id}`);
    } catch (err: any) {
      toast({ title: "Could not open order", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  return (
    <PosWaiterGate>
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Tables & Orders</h1>
          <p className="text-sm text-muted-foreground">Open orders — tap one to add items or take payment.</p>
        </div>
        <div className="flex gap-2 items-center">
          {myTips && myTips.total_tips > 0 && (
            <div className="flex items-center gap-2 rounded-lg border bg-[#faf6ec] px-3 py-2 mr-1" data-testid="my-tips-today">
              <HandCoins className="h-4 w-4 text-[#a8893a]" />
              <div className="leading-tight">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">My tips today</p>
                <p className="text-sm font-bold text-[#a8893a]">
                  {fmt(myTips.total_tips)} <span className="font-normal text-muted-foreground">· {myTips.orders} order{myTips.orders === 1 ? "" : "s"}</span>
                </p>
              </div>
            </div>
          )}
          <Button variant="outline" onClick={() => createOrder("takeaway")} disabled={creating} data-testid="button-new-takeaway">
            <ShoppingBag className="h-4 w-4 mr-2" /> New Takeaway
          </Button>
          <Button className="bg-[#1a5c38] hover:bg-[#164d30]" onClick={() => setShowNewTable(true)} data-testid="button-new-table">
            <Plus className="h-4 w-4 mr-2" /> New Table
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : orders.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          <UtensilsCrossed className="h-8 w-8 mx-auto mb-3 opacity-40" />
          No open orders. Start a table or takeaway order.
        </Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          {orders.map(o => (
            <Card
              key={o.id}
              className="p-4 cursor-pointer hover:ring-2 hover:ring-[#1a5c38]/40 transition-all"
              onClick={() => navigate(`/orders/${o.id}`)}
              data-testid={`order-card-${o.id}`}
            >
              <div className="flex items-start justify-between">
                <p className="font-bold text-base">
                  {o.order_type === "table" ? o.table_name : `Takeaway #${o.id}`}
                </p>
                <Badge variant="secondary" className="text-[10px] capitalize">{o.order_type}</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{o.item_count} item{o.item_count === 1 ? "" : "s"} · {o.opened_by_name ?? ""}</p>
              <p className="font-bold text-[#1a5c38] mt-2 text-lg">{fmt(o.total)}</p>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showNewTable} onOpenChange={setShowNewTable}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Open a table</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); if (tableName.trim()) createOrder("table", tableName.trim()); }}>
            <div className="space-y-2">
              <Label htmlFor="table-name">Table name / number</Label>
              <Input id="table-name" autoFocus value={tableName} onChange={e => setTableName(e.target.value)} placeholder="e.g. Table 4, Patio 2" data-testid="input-table-name" />
            </div>
            <DialogFooter className="mt-4">
              <Button type="submit" className="bg-[#1a5c38] hover:bg-[#164d30]" disabled={!tableName.trim() || creating} data-testid="button-create-table">
                Open table
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
    </PosWaiterGate>
  );
}
