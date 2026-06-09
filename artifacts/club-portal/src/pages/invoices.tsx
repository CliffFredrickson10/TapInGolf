import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Receipt, RefreshCw, ExternalLink, CheckCircle2, Clock,
  ChevronDown, ChevronUp, User, ConciergeBell, AlertCircle,
} from "lucide-react";
import { format, parseISO } from "date-fns";

interface CounterSummary {
  unbilled_count: number;
  unbilled_fee: number;
  fee_per_booking: number;
}

interface LineItem {
  email: string;
  name: string | null;
  membership_type: string;
  rounds: number;
  amount: number;
}

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
  line_items: LineItem[];
}

function fmtRand(n: number) {
  return `R ${Number(n).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function InvoiceBreakdown({ inv }: { inv: ClubInvoice }) {
  const [open, setOpen] = useState(false);
  const items = inv.line_items ?? [];

  return (
    <div className="mt-3 border-t pt-3">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        {open ? "Hide" : "View"} breakdown — {inv.total_rounds} round{inv.total_rounds !== 1 ? "s" : ""} across {items.length} member{items.length !== 1 ? "s" : ""}
      </button>

      {open && items.length > 0 && (
        <div className="mt-3 rounded-lg border overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Member</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground hidden sm:table-cell">Type</th>
                <th className="text-center px-3 py-2 font-medium text-muted-foreground">Rounds</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Fee</th>
              </tr>
            </thead>
            <tbody>
              {items.map((li, i) => (
                <tr key={i} className={i < items.length - 1 ? "border-b" : ""}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <User className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      <div className="min-w-0">
                        {li.name && (
                          <p className="font-medium truncate text-foreground">{li.name}</p>
                        )}
                        <p className={`text-muted-foreground truncate ${li.name ? "text-xs" : ""}`}>{li.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground hidden sm:table-cell text-xs capitalize">
                    {capitalize(li.membership_type)}
                  </td>
                  <td className="px-3 py-2 text-center font-medium">{li.rounds}</td>
                  <td className="px-3 py-2 text-right font-medium">{fmtRand(li.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/20">
                <td colSpan={2} className="px-3 py-2 font-semibold text-foreground hidden sm:table-cell">Total</td>
                <td className="px-3 py-2 text-center font-bold">{inv.total_rounds}</td>
                <td className="px-3 py-2 text-right font-bold text-[#1a5c38]">{fmtRand(inv.total_amount)}</td>
              </tr>
            </tfoot>
          </table>
          <div className="px-3 py-2 bg-muted/20 border-t text-xs text-muted-foreground">
            Rate: R{Number(inv.platform_fee_rate).toFixed(2)} per prepaid round (TapIn platform fee)
          </div>
        </div>
      )}

      {open && items.length === 0 && (
        <p className="mt-2 text-xs text-muted-foreground italic">No per-member breakdown available for this invoice.</p>
      )}
    </div>
  );
}

export default function Invoices() {
  const { club } = useAuth();
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<ClubInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshingId, setRefreshingId] = useState<number | null>(null);
  const [counterSummary, setCounterSummary] = useState<CounterSummary | null>(null);
  const [generatingCounter, setGeneratingCounter] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      api<{ invoices: ClubInvoice[] }>("/api/portal/invoices"),
      api<CounterSummary>("/api/portal/counter-bookings/summary"),
    ])
      .then(([d, cs]) => { setInvoices(d.invoices); setCounterSummary(cs); })
      .catch(() => toast({ title: "Failed to load invoices", variant: "destructive" }))
      .finally(() => setLoading(false));
  };

  useEffect(() => { if (club) load(); }, [club]);

  const generateCounterInvoice = async () => {
    setGeneratingCounter(true);
    try {
      const data = await api<{ payment_url: string | null; count: number; total_amount: number }>(
        "/api/portal/invoices/counter-monthly", { method: "POST" }
      );
      toast({ title: "Invoice generated", description: `${data.count} counter booking${data.count !== 1 ? "s" : ""} — ${fmtRand(data.total_amount)}` });
      load();
      if (data.payment_url) window.open(data.payment_url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast({ title: "Failed to generate invoice", description: e.message, variant: "destructive" });
    } finally { setGeneratingCounter(false); }
  };

  const refreshUrl = async (inv: ClubInvoice) => {
    setRefreshingId(inv.id);
    try {
      const data = await api<{ payment_url: string }>(`/api/portal/invoices/${inv.id}/refresh-url`, { method: "POST" });
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

      {/* Counter Bookings pending charges */}
      {!loading && counterSummary && counterSummary.unbilled_count > 0 && (
        <Card className="border-orange-200 bg-orange-50/40">
          <CardContent className="p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <ConciergeBell className="h-4 w-4 text-orange-600" />
                  <span className="font-semibold text-orange-800">Counter Bookings — Pending Charges</span>
                  <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-xs">{counterSummary.unbilled_count} unbilled</Badge>
                </div>
                <p className="text-sm text-orange-700">
                  {counterSummary.unbilled_count} walk-in booking{counterSummary.unbilled_count !== 1 ? "s" : ""} at R{counterSummary.fee_per_booking.toFixed(2)}/booking = <strong>{fmtRand(counterSummary.unbilled_fee)}</strong> owed to TapIn Golf
                </p>
                <p className="text-xs text-orange-600/80 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Counter booking fees are invoiced monthly. Generate your invoice below to pay via Stitch.
                </p>
              </div>
              <Button
                onClick={generateCounterInvoice}
                disabled={generatingCounter}
                className="bg-orange-600 hover:bg-orange-700 text-white flex-shrink-0"
              >
                {generatingCounter ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Receipt className="h-4 w-4 mr-2" />}
                {generatingCounter ? "Generating…" : "Generate Invoice"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Outstanding invoices */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2].map(i => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      ) : unpaid.length > 0 ? (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-orange-600 uppercase tracking-wide flex items-center gap-1.5">
            <Clock className="h-4 w-4" /> Outstanding ({unpaid.length})
          </h2>
          {unpaid.map(inv => (
            <Card key={inv.id} className="border-orange-200 bg-orange-50/40">
              <CardContent className="p-5">
                {/* Header row */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-semibold text-foreground">{inv.invoice_ref}</span>
                      <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-xs">Unpaid</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{inv.description}</p>
                    <p className="text-xs text-muted-foreground">
                      Issued {format(parseISO(inv.created_at), "d MMM yyyy")}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-xl font-bold text-foreground">{fmtRand(inv.total_amount)}</span>
                    <Button
                      onClick={() => payNow(inv)}
                      disabled={refreshingId === inv.id}
                      className="bg-[#1a5c38] hover:bg-[#164d2f] text-white"
                    >
                      {refreshingId === inv.id
                        ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        : <ExternalLink className="h-4 w-4 mr-2" />}
                      Pay Now
                    </Button>
                  </div>
                </div>
                {/* Expandable per-member breakdown */}
                <InvoiceBreakdown inv={inv} />
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
          <div className="space-y-3">
            {paid.map(inv => (
              <Card key={inv.id}>
                <CardContent className="p-5">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-semibold">{inv.invoice_ref}</span>
                        <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">Paid</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{inv.description}</p>
                      <p className="text-xs text-muted-foreground">
                        Issued {format(parseISO(inv.created_at), "d MMM yyyy")}
                        {inv.paid_at && ` · Paid ${format(parseISO(inv.paid_at), "d MMM yyyy")}`}
                      </p>
                    </div>
                    <span className="text-lg font-bold flex-shrink-0">{fmtRand(inv.total_amount)}</span>
                  </div>
                  <InvoiceBreakdown inv={inv} />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
