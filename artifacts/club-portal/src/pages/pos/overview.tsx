import { useState, useEffect, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { posApi as api } from "@/lib/api";
import { PosWaiterGate } from "@/components/pos-waiter-gate";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UtensilsCrossed, UserRound, ReceiptText, CircleDollarSign } from "lucide-react";

const fmt = (n: number) => `R${Number(n).toFixed(2)}`;

interface OverviewOrder {
  id: number;
  order_type: string;
  table_name: string | null;
  created_at: string;
  opened_by: number | null;
  opened_by_name: string | null;
  item_count: number;
  total: number;
}

export default function PosOverview() {
  const [, navigate] = useLocation();
  const [orders, setOrders] = useState<OverviewOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    api<{ orders: OverviewOrder[] }>("/api/pos/orders?status=open")
      .then(r => setOrders(r.orders))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 15_000);
    return () => clearInterval(timer);
  }, [load]);

  const byWaiter = useMemo(() => {
    const groups = new Map<string, { name: string; orders: OverviewOrder[]; total: number }>();
    for (const o of orders) {
      const key = String(o.opened_by ?? "unknown");
      const g = groups.get(key) ?? { name: o.opened_by_name ?? "Unknown", orders: [], total: 0 };
      g.orders.push(o);
      g.total += Number(o.total);
      groups.set(key, g);
    }
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [orders]);

  const openTotal = orders.reduce((s, o) => s + Number(o.total), 0);

  return (
    <PosWaiterGate>
      <div className="p-6 space-y-5">
        <div>
          <h1 className="text-2xl font-bold">Floor Overview</h1>
          <p className="text-sm text-muted-foreground">All open tables and orders by waiter — tap an order to view or assist.</p>
        </div>

        <div className="grid grid-cols-3 gap-3 max-w-xl">
          <Card className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium"><ReceiptText className="h-3.5 w-3.5" /> Open orders</div>
            <p className="text-2xl font-bold mt-1" data-testid="stat-open-orders">{orders.length}</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium"><CircleDollarSign className="h-3.5 w-3.5" /> Open value</div>
            <p className="text-2xl font-bold mt-1 text-[#1a5c38]" data-testid="stat-open-value">{fmt(openTotal)}</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium"><UserRound className="h-3.5 w-3.5" /> Waiters serving</div>
            <p className="text-2xl font-bold mt-1" data-testid="stat-waiters-serving">{byWaiter.length}</p>
          </Card>
        </div>

        {loading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : orders.length === 0 ? (
          <Card className="p-10 text-center text-muted-foreground">
            <UtensilsCrossed className="h-8 w-8 mx-auto mb-3 opacity-40" />
            No open orders right now.
          </Card>
        ) : (
          <div className="space-y-6">
            {byWaiter.map(group => (
              <div key={group.name} className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full bg-[#1a5c38]/10 text-[#1a5c38] flex items-center justify-center font-bold text-xs">
                    {group.name.split(/\s+/).map(p => p[0]).slice(0, 2).join("").toUpperCase()}
                  </div>
                  <h2 className="font-semibold text-sm">{group.name}</h2>
                  <Badge variant="secondary" className="text-[10px]">
                    {group.orders.length} order{group.orders.length === 1 ? "" : "s"} · {fmt(group.total)}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                  {group.orders.map(o => (
                    <Card
                      key={o.id}
                      className="p-4 cursor-pointer hover:ring-2 hover:ring-[#1a5c38]/40 transition-all"
                      onClick={() => navigate(`/orders/${o.id}`)}
                      data-testid={`overview-order-${o.id}`}
                    >
                      <div className="flex items-start justify-between">
                        <p className="font-bold text-base">
                          {o.order_type === "table" ? o.table_name : `Takeaway #${o.id}`}
                        </p>
                        <Badge variant="secondary" className="text-[10px] capitalize">{o.order_type}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{o.item_count} item{o.item_count === 1 ? "" : "s"}</p>
                      <p className="font-bold text-[#1a5c38] mt-2 text-lg">{fmt(o.total)}</p>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PosWaiterGate>
  );
}
