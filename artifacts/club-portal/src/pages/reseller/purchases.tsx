import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ShoppingBag, RefreshCw } from "lucide-react";
import { format, parseISO } from "date-fns";

interface Purchase {
  id: number;
  amount: number;
  status: "pending" | "confirmed" | "cancelled";
  created_at: string;
  confirmed_at: string | null;
  date: string;
  tee_time: string;
  max_players: number;
  club_id: number;
  club_name: string;
  province: string | null;
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending:   { label: "Awaiting payment", cls: "bg-amber-100 text-amber-800 hover:bg-amber-100" },
  confirmed: { label: "Confirmed",        cls: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" },
  cancelled: { label: "Cancelled",        cls: "bg-red-100 text-red-700 hover:bg-red-100" },
};

export default function ResellerPurchases() {
  const { toast } = useToast();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifyingId, setVerifyingId] = useState<number | null>(null);
  const autoVerified = useRef(false);

  const load = useCallback(() =>
    api<{ purchases: Purchase[] }>("/api/portal/reseller/purchases")
      .then((data) => { setPurchases(data.purchases); return data.purchases; })
      .catch((e) => { toast({ title: "Error loading purchases", description: e.message, variant: "destructive" }); return [] as Purchase[]; })
      .finally(() => setLoading(false)),
    [toast]
  );

  const verify = useCallback(async (id: number, silent = false) => {
    setVerifyingId(id);
    try {
      const data = await api<{ status: string }>(`/api/portal/reseller/purchases/${id}/verify`, { method: "POST" });
      if (data.status === "confirmed" && !silent) {
        toast({ title: "Payment confirmed", description: "Your tee time purchase is confirmed." });
      } else if (data.status === "pending" && !silent) {
        toast({ title: "Still pending", description: "We haven't seen the payment yet. If you just paid, try again in a moment." });
      }
      await load();
    } catch (e: any) {
      if (!silent) toast({ title: "Verification failed", description: e.message, variant: "destructive" });
    } finally {
      setVerifyingId(null);
    }
  }, [load, toast]);

  useEffect(() => {
    load().then((list) => {
      // After a Stitch redirect the newest pending purchase is usually the one
      // just paid — verify pendings once automatically.
      if (autoVerified.current) return;
      autoVerified.current = true;
      list.filter((p) => p.status === "pending").slice(0, 3).forEach((p) => { verify(p.id, true); });
    });
  }, [load, verify]);

  return (
    <div className="p-8 max-w-5xl w-full mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">My Purchases</h1>
          <p className="text-sm text-muted-foreground mt-1">Tee times you've bought through the marketplace.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => load()} data-testid="button-refresh-purchases">
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      {loading ? (
        <div className="grid gap-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
      ) : purchases.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <ShoppingBag className="h-8 w-8 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No purchases yet</p>
            <p className="text-xs mt-1">Buy a listed tee time from a participating club and it will appear here.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {purchases.map((p) => {
            const badge = STATUS_BADGE[p.status] ?? STATUS_BADGE.pending;
            return (
              <Card key={p.id} data-testid={`card-purchase-${p.id}`}>
                <CardContent className="flex items-center gap-4 py-4">
                  <div className="w-14 text-center">
                    <div className="text-lg font-bold tabular-nums">{p.tee_time}</div>
                    <div className="text-[10px] text-muted-foreground uppercase">{p.max_players}-ball</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{p.club_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {format(parseISO(p.date), "EEE, d MMM yyyy")}
                      {p.province ? ` · ${p.province}` : ""}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">R{p.amount.toFixed(2)}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {format(parseISO(p.created_at), "d MMM yyyy, HH:mm")}
                    </div>
                  </div>
                  <Badge className={badge.cls}>{badge.label}</Badge>
                  {p.status === "pending" && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={verifyingId === p.id}
                      onClick={() => verify(p.id)}
                      data-testid={`button-verify-${p.id}`}
                    >
                      {verifyingId === p.id ? "Checking…" : "Check payment"}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
