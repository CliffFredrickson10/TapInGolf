import { useEffect, useState } from "react";
import { Link } from "wouter";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, Loader2, Clock } from "lucide-react";

interface Purchase { id: number; status: string }

export default function ResaleSuccess() {
  const [state, setState] = useState<"checking" | "confirmed" | "pending">("checking");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // The redirect itself is never trusted — re-verify pending purchases
        // against Stitch and rely on the webhook as the primary path.
        const data = await api<{ purchases: Purchase[] }>("/api/portal/reseller/purchases");
        const pendings = data.purchases.filter((p) => p.status === "pending").slice(0, 3);
        let confirmed = data.purchases.some((p) => p.status === "confirmed" && pendings.length === 0);
        for (const p of pendings) {
          const v = await api<{ status: string }>(`/api/portal/reseller/purchases/${p.id}/verify`, { method: "POST" }).catch(() => ({ status: "pending" }));
          if (v.status === "confirmed") confirmed = true;
        }
        if (!cancelled) setState(confirmed ? "confirmed" : "pending");
      } catch {
        if (!cancelled) setState("pending");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <Card className="max-w-md w-full">
        <CardContent className="py-10 text-center">
          {state === "checking" ? (
            <>
              <Loader2 className="h-10 w-10 mx-auto mb-4 text-[#1a5c38] animate-spin" />
              <h1 className="text-xl font-bold mb-1">Confirming your payment…</h1>
              <p className="text-sm text-muted-foreground">Checking with Stitch — this only takes a moment.</p>
            </>
          ) : state === "confirmed" ? (
            <>
              <CheckCircle2 className="h-10 w-10 mx-auto mb-4 text-emerald-600" />
              <h1 className="text-xl font-bold mb-1">Purchase confirmed!</h1>
              <p className="text-sm text-muted-foreground mb-6">Your tee time is yours. The club has been notified.</p>
            </>
          ) : (
            <>
              <Clock className="h-10 w-10 mx-auto mb-4 text-amber-500" />
              <h1 className="text-xl font-bold mb-1">Payment is being processed</h1>
              <p className="text-sm text-muted-foreground mb-6">
                We haven't seen the confirmation yet. It usually arrives within a minute — check your purchases shortly.
              </p>
            </>
          )}
          {state !== "checking" && (
            <Link href="/purchases">
              <Button className="bg-[#1a5c38] hover:bg-[#164d30]" data-testid="button-view-purchases">View my purchases</Button>
            </Link>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
