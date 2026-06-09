import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Receipt, RefreshCw, ExternalLink, CheckCircle2, Clock } from "lucide-react";
import { format, parseISO } from "date-fns";

interface ClubInvoice {
  id: number;
  invoice_ref: string;
  description: string;
  total_rounds: number;
  platform_fee_rate: number;
  total_amount: number;
  status: "unpaid" | "paid" | "cancelled";
  stitch_payment_url: string | null;
  paid_at: string | null;
  created_at: string;
}

function fmtRand(n: number) {
  return `R ${Number(n).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function Invoices() {
  const { club } = useAuth();
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<ClubInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshingId, setRefreshingId] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    api<{ invoices: ClubInvoice[] }>("/api/portal/invoices")
      .then(d => setInvoices(d.invoices))
      .catch(() => toast({ title: "Failed to load invoices", variant: "destructive" }))
      .finally(() => setLoading(false));
  };

  useEffect(() => { if (club) load(); }, [club]);

  const refreshUrl = async (inv: ClubInvoice) => {
    setRefreshingId(inv.id);
    try {
      const data = await api<{ payment_url: string }>(`/api/portal/invoices/${inv.id}/refresh-url`, {
        method: "POST",
      });
      setInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, stitch_payment_url: data.payment_url } : i));
      window.open(data.payment_url, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      toast({ title: "Could not generate payment link", description: err.message, variant: "destructive" });
    } finally {
      setRefreshingId(null);
    }
  };

  const payNow = (inv: ClubInvoice) => {
    if (inv.stitch_payment_url) {
      window.open(inv.stitch_payment_url, "_blank", "noopener,noreferrer");
    } else {
      refreshUrl(inv);
    }
  };

  const unpaid = invoices.filter(i => i.status === "unpaid");
  const paid   = invoices.filter(i => i.status === "paid");

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Invoices</h1>
          <p className="text-sm text-muted-foreground mt-1">
            TapIn platform fees for uploaded prepaid rounds
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Outstanding invoices */}
      {loading ? (
        <Card>
          <CardContent className="p-6 space-y-4">
            {[1, 2].map(i => <Skeleton key={i} className="h-20 w-full" />)}
          </CardContent>
        </Card>
      ) : unpaid.length > 0 ? (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-orange-600 uppercase tracking-wide flex items-center gap-1.5">
            <Clock className="h-4 w-4" /> Outstanding ({unpaid.length})
          </h2>
          {unpaid.map(inv => (
            <Card key={inv.id} className="border-orange-200 bg-orange-50/40">
              <CardContent className="p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-semibold text-foreground">{inv.invoice_ref}</span>
                      <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-xs">Unpaid</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{inv.description}</p>
                    <p className="text-xs text-muted-foreground">
                      Issued {format(parseISO(inv.created_at), "d MMM yyyy")}
                      {" · "}{inv.total_rounds} round{inv.total_rounds !== 1 ? "s" : ""}
                      {" · "}R{Number(inv.platform_fee_rate).toFixed(2)}/round
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-xl font-bold text-foreground">{fmtRand(inv.total_amount)}</span>
                    <Button
                      onClick={() => payNow(inv)}
                      disabled={refreshingId === inv.id}
                      className="bg-[#1a5c38] hover:bg-[#164d2f] text-white"
                    >
                      {refreshingId === inv.id ? (
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <ExternalLink className="h-4 w-4 mr-2" />
                      )}
                      Pay Now
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          <p className="text-xs text-muted-foreground px-1">
            Clicking "Pay Now" opens the Stitch secure checkout in a new tab. Once payment is confirmed the invoice is automatically marked as paid.
          </p>
        </div>
      ) : !loading && invoices.length > 0 ? (
        <Card className="border-green-200 bg-green-50/40">
          <CardContent className="p-6 flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-green-600 flex-shrink-0" />
            <div>
              <p className="font-medium text-green-800">All invoices paid</p>
              <p className="text-sm text-green-700">Your account is up to date.</p>
            </div>
          </CardContent>
        </Card>
      ) : !loading && invoices.length === 0 ? (
        <Card>
          <CardContent className="p-12 flex flex-col items-center text-center gap-3">
            <Receipt className="h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium text-muted-foreground">No invoices yet</p>
            <p className="text-sm text-muted-foreground max-w-xs">
              Invoices are generated automatically when you upload prepaid rounds during a member import.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {/* Paid history */}
      {paid.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4" /> Payment History
          </h2>
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Invoice</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Description</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Paid</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {paid.map((inv, i) => (
                    <tr key={inv.id} className={i < paid.length - 1 ? "border-b" : ""}>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs font-semibold">{inv.invoice_ref}</span>
                        <Badge className="ml-2 bg-green-100 text-green-700 border-green-200 text-xs">Paid</Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell max-w-xs truncate">{inv.description}</td>
                      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell text-xs">
                        {inv.paid_at ? format(parseISO(inv.paid_at), "d MMM yyyy") : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">{fmtRand(inv.total_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
