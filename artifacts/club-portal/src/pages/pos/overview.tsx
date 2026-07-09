import { useState, useEffect, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { posApi as api } from "@/lib/api";
import { PosWaiterGate } from "@/components/pos-waiter-gate";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UtensilsCrossed, UserRound, ReceiptText, CircleDollarSign, HandCoins } from "lucide-react";

const fmt = (n: number) => `R${Number(n).toFixed(2)}`;

interface StaffTips {
  staff_id: number;
  name: string;
  orders: number;
  tips: number;
  service_fees: number;
  total_tips: number;
}

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
  const [tips, setTips] = useState<StaffTips[]>([]);
  const [tipsTotal, setTipsTotal] = useState(0);

  const load = useCallback(() => {
    api<{ orders: OverviewOrder[] }>("/api/pos/orders?status=open")
      .then(r => setOrders(r.orders))
      .catch(() => {})
      .finally(() => setLoading(false));
    const today = new Date().toISOString().slice(0, 10);
    api<any>(`/api/pos/reports/summary?from=${today}&to=${today}`)
      .then(r => {
        setTips(r.tips_by_staff ?? []);
        setTipsTotal(Number(r.totals?.total_tips ?? 0) + Number(r.totals?.total_service_fees ?? 0));
      })
      .catch(() => {});
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

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-3xl">
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
          <Card className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium"><HandCoins className="h-3.5 w-3.5" /> Tips today</div>
            <p className="text-2xl font-bold mt-1 text-[#c8a84b]" data-testid="stat-tips-today">{fmt(tipsTotal)}</p>
          </Card>
        </div>

        {tips.length > 0 && (
          <div className="space-y-2">
            <h2 className="font-semibold text-sm flex items-center gap-1.5"><HandCoins className="h-4 w-4 text-[#c8a84b]" /> Tips today by waiter</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
              {tips.map(t => (
                <Card key={t.staff_id} className="p-4" data-testid={`tips-staff-${t.staff_id}`}>
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-full bg-[#c8a84b]/15 text-[#a8893a] flex items-center justify-center font-bold text-xs">
                      {t.name.split(/\s+/).map(p => p[0]).slice(0, 2).join("").toUpperCase()}
                    </div>
                    <p className="font-semibold text-sm flex-1 truncate">{t.name}</p>
                  </div>
                  <p className="text-xl font-bold mt-2 text-[#1a5c38]">{fmt(t.total_tips)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t.orders} order{t.orders === 1 ? "" : "s"}
                    {t.service_fees > 0 && t.tips > 0
                      ? ` · ${fmt(t.tips)} tips + ${fmt(t.service_fees)} service fees`
                      : t.service_fees > 0 ? " · service fees" : " · tips"}
                  </p>
                </Card>
              ))}
            </div>
          </div>
        )}

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
