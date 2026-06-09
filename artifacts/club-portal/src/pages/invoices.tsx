import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Receipt, RefreshCw, ExternalLink, CheckCircle2, Clock,
  ChevronDown, ChevronUp, User, Download, TrendingUp,
} from "lucide-react";
import { format, parseISO } from "date-fns";

interface CounterSummary {
  unbilled_count: number;
  unbilled_bookings: number;
  unbilled_fee: number;
  unbilled_vat: number;
  unbilled_total: number;
  fee_per_booking: number;
  vat_rate: number;
}

interface LineItem {
  email?: string;
  name?: string | null;
  membership_type?: string;
  rounds?: number;
  booking_ref?: string;
  guest_name?: string | null;
  date?: string;
  time?: string;
  players?: number;
  amount: number;
}

interface ClubInvoice {
  id: number;
  invoice_ref: string;
  description: string;
  total_rounds: number;
  platform_fee_rate: number;
  vat_rate: number;
  vat_amount: number;
  total_amount: number;
  invoice_type: "prepaid_rounds" | "counter_bookings";
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

// ── Platform invoice HTML (mirrors booking invoice template) ──────────────────

function generatePlatformInvoiceHTML(inv: ClubInvoice, clubName: string, clubEmail: string): string {
  const isCounter = inv.invoice_type === "counter_bookings";
  const vatPct    = Math.round((Number(inv.vat_rate) || 0.15) * 100);
  const total     = Number(inv.total_amount);
  const vatAmt    = Number(inv.vat_amount) || Math.round(total * vatPct / (100 + vatPct) * 100) / 100;
  const exclVat   = Math.round((total - vatAmt) * 100) / 100;
  const issuedDate = new Date(inv.created_at).toLocaleString("en-ZA", {
    timeZone: "Africa/Johannesburg", day: "2-digit", month: "short",
    year: "numeric", hour: "2-digit", minute: "2-digit",
  });

  const statusBg = inv.status === "paid"
    ? "background:#dcfce7;color:#166534"
    : inv.status === "unpaid"
    ? "background:#fef9c3;color:#854d0e"
    : "background:#fee2e2;color:#991b1b";

  const lineItemRows = inv.line_items.map(li => {
    if (isCounter) {
      const slots = Number(li.players ?? 1);
      return `
      <tr>
        <td style="padding:12px 10px;border-bottom:1px solid #f3f4f6">
          ${li.booking_ref ? `<span style="font-family:monospace;font-weight:600">${li.booking_ref}</span> &mdash; ` : ""}
          ${li.guest_name || "Walk-in"}
          <span style="color:#6b7280;font-size:12px"> &mdash; ${li.date ?? ""} ${li.time ?? ""} &mdash; ${slots} player${slots !== 1 ? "s" : ""}</span>
        </td>
        <td style="padding:12px 10px;border-bottom:1px solid #f3f4f6;text-align:right">R ${Number(li.amount).toFixed(2)}</td>
      </tr>`;
    } else {
      const rounds = Number(li.rounds ?? 0);
      return `
      <tr>
        <td style="padding:12px 10px;border-bottom:1px solid #f3f4f6">
          ${li.name ? `<strong>${li.name}</strong> &mdash; ` : ""}${li.email ?? ""}
          ${li.membership_type ? `<span style="color:#6b7280;font-size:12px"> &mdash; ${li.membership_type.charAt(0).toUpperCase() + li.membership_type.slice(1)}</span>` : ""}
          <span style="color:#6b7280;font-size:12px"> &mdash; ${rounds} round${rounds !== 1 ? "s" : ""}</span>
        </td>
        <td style="padding:12px 10px;border-bottom:1px solid #f3f4f6;text-align:right">R ${Number(li.amount).toFixed(2)}</td>
      </tr>`;
    }
  }).join("");

  const detailLabel = isCounter ? "Counter Bookings" : "Prepaid Rounds — Member Import";
  const unitLabel   = isCounter
    ? `${inv.total_rounds} player slot${inv.total_rounds !== 1 ? "s" : ""}`
    : `${inv.total_rounds} round${inv.total_rounds !== 1 ? "s" : ""} across ${inv.line_items.length} member${inv.line_items.length !== 1 ? "s" : ""}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Tax Invoice ${inv.invoice_ref}</title>
  <style>
    @media print {
      body { margin: 0; padding: 0; background: #fff; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body style="margin:0;padding:40px 24px;font-family:Arial,Helvetica,sans-serif;color:#111827;background:#f9fafb">
  <div class="no-print" style="text-align:center;margin-bottom:24px">
    <button onclick="window.print()" style="background:#1a5c38;color:#fff;border:none;padding:10px 28px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer">
      Print / Save as PDF
    </button>
  </div>
  <div style="max-width:660px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;box-shadow:0 4px 24px rgba(0,0,0,0.06)">
    <!-- Header -->
    <div style="background:#1a5c38;color:#fff;padding:32px 40px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <div style="font-size:24px;font-weight:800;letter-spacing:-0.5px">TapIn Golf</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:11px;opacity:0.6;text-transform:uppercase;letter-spacing:1.5px">Tax Invoice</div>
          <div style="font-size:22px;font-weight:700;letter-spacing:2px;margin-top:2px">${inv.invoice_ref}</div>
          <div style="font-size:12px;opacity:0.7;margin-top:4px">${issuedDate}</div>
        </div>
      </div>
    </div>

    <div style="padding:36px 40px">
      <!-- Bill To / Status -->
      <div style="display:flex;justify-content:space-between;margin-bottom:32px;gap:24px">
        <div>
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;margin-bottom:8px">Bill To</div>
          <div style="font-size:16px;font-weight:600">${clubName}</div>
          ${clubEmail ? `<div style="color:#6b7280;font-size:13px;margin-top:2px">${clubEmail}</div>` : ""}
        </div>
        <div style="text-align:right">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;margin-bottom:8px">Payment Status</div>
          <div style="display:inline-block;padding:4px 14px;border-radius:20px;font-size:12px;font-weight:700;letter-spacing:0.5px;${statusBg}">${inv.status.toUpperCase()}</div>
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;margin-top:14px;margin-bottom:8px">Invoice Type</div>
          <div style="font-size:13px;font-weight:600">${detailLabel}</div>
        </div>
      </div>

      <!-- Invoice Details -->
      <div style="background:#f9fafb;border-radius:10px;padding:20px 24px;margin-bottom:28px;border:1px solid #e5e7eb">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;margin-bottom:14px">Invoice Details</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
          <div><div style="color:#6b7280;font-size:12px">Service</div><div style="font-weight:600;font-size:14px;margin-top:3px">${detailLabel}</div></div>
          <div><div style="color:#6b7280;font-size:12px">Volume</div><div style="font-weight:600;font-size:14px;margin-top:3px">${unitLabel}</div></div>
          <div><div style="color:#6b7280;font-size:12px">Rate (incl. VAT)</div><div style="font-weight:600;font-size:14px;margin-top:3px">R ${Number(inv.platform_fee_rate).toFixed(2)} / ${isCounter ? "player slot" : "round"}</div></div>
          <div><div style="color:#6b7280;font-size:12px">Invoice Date</div><div style="font-weight:600;font-size:14px;margin-top:3px">${new Date(inv.created_at).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" })}</div></div>
        </div>
      </div>

      <!-- Line Items -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:28px">
        <thead>
          <tr style="background:#f3f4f6">
            <th style="padding:10px 10px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;border-radius:4px 0 0 4px">Description</th>
            <th style="padding:10px 10px;text-align:right;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;border-radius:0 4px 4px 0">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${lineItemRows || `<tr><td colspan="2" style="padding:12px 10px;color:#6b7280;font-size:13px;border-bottom:1px solid #f3f4f6">${description || inv.description}</td></tr>`}
        </tbody>
        <tfoot>
          <tr>
            <td style="padding:8px 10px 2px;color:#6b7280;font-size:13px">Subtotal (excl. VAT)</td>
            <td style="padding:8px 10px 2px;text-align:right;color:#6b7280;font-size:13px">R ${exclVat.toFixed(2)}</td>
          </tr>
          <tr>
            <td style="padding:2px 10px 10px;color:#6b7280;font-size:13px">VAT (${vatPct}%)</td>
            <td style="padding:2px 10px 10px;text-align:right;color:#6b7280;font-size:13px">R ${vatAmt.toFixed(2)}</td>
          </tr>
          <tr style="background:#f0fdf4">
            <td style="padding:14px 10px;font-weight:700;font-size:16px;border-top:2px solid #bbf7d0">Total (incl. VAT)</td>
            <td style="padding:14px 10px;font-weight:800;font-size:20px;text-align:right;color:#1a5c38;border-top:2px solid #bbf7d0">R ${total.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>

      <!-- Payment Reference -->
      <div style="background:#f9fafb;border-radius:10px;padding:16px 24px;border:1px solid #e5e7eb">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;margin-bottom:10px">Payment Reference</div>
        <div style="font-family:monospace;font-size:18px;font-weight:700;color:#1a5c38;letter-spacing:2px">${inv.invoice_ref}</div>
        <div style="font-size:12px;color:#9ca3af;margin-top:4px">Use this reference for any payment queries</div>
      </div>
    </div>

    <!-- Footer -->
    <div style="padding:20px 40px;border-top:1px solid #e5e7eb;text-align:center;color:#9ca3af;font-size:12px">
      TapIn Golf &nbsp;·&nbsp; tapingolf.co.za &nbsp;·&nbsp; This is your official platform fee tax invoice. Please retain for your records.
    </div>
  </div>
</body>
</html>`;
}

function downloadInvoice(inv: ClubInvoice, clubName: string, clubEmail: string) {
  const html = generatePlatformInvoiceHTML(inv, clubName, clubEmail);
  const w = window.open("", "_blank");
  if (!w) { alert("Please allow pop-ups to download invoices."); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 600);
}

// ── Invoice breakdown (expandable per-line table) ────────────────────────────

function InvoiceBreakdown({ inv }: { inv: ClubInvoice }) {
  const [open, setOpen] = useState(false);
  const isCounter = inv.invoice_type === "counter_bookings";
  const items = inv.line_items ?? [];
  const vatPct = Math.round((Number(inv.vat_rate) || 0.15) * 100);
  const total  = Number(inv.total_amount);
  const vatAmt = Number(inv.vat_amount) || Math.round(total * vatPct / (100 + vatPct) * 100) / 100;
  const exclVat = Math.round((total - vatAmt) * 100) / 100;

  const summaryLabel = isCounter
    ? `${inv.total_rounds} player slot${inv.total_rounds !== 1 ? "s" : ""} across ${items.length} booking${items.length !== 1 ? "s" : ""}`
    : `${inv.total_rounds} round${inv.total_rounds !== 1 ? "s" : ""} across ${items.length} member${items.length !== 1 ? "s" : ""}`;

  return (
    <div className="mt-3 border-t pt-3">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        {open ? "Hide" : "View"} breakdown — {summaryLabel}
      </button>

      {open && items.length > 0 && (
        <div className="mt-3 rounded-lg border overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                  {isCounter ? "Booking" : "Member"}
                </th>
                {!isCounter && (
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground hidden sm:table-cell">Type</th>
                )}
                <th className="text-center px-3 py-2 font-medium text-muted-foreground">
                  {isCounter ? "Players" : "Rounds"}
                </th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Fee (incl. VAT)</th>
              </tr>
            </thead>
            <tbody>
              {items.map((li, i) => (
                <tr key={i} className={i < items.length - 1 ? "border-b" : ""}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <User className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      <div className="min-w-0">
                        {isCounter ? (
                          <>
                            {li.guest_name && (
                              <p className="font-medium truncate text-foreground">{li.guest_name}</p>
                            )}
                            {li.booking_ref && (
                              <p className="text-xs text-muted-foreground font-mono">{li.booking_ref}</p>
                            )}
                            {(li.date || li.time) && (
                              <p className="text-xs text-muted-foreground">{li.date} {li.time}</p>
                            )}
                          </>
                        ) : (
                          <>
                            {li.name && (
                              <p className="font-medium truncate text-foreground">{li.name}</p>
                            )}
                            <p className={`text-muted-foreground truncate ${li.name ? "text-xs" : ""}`}>{li.email}</p>
                          </>
                        )}
                      </div>
                    </div>
                  </td>
                  {!isCounter && (
                    <td className="px-3 py-2 text-muted-foreground hidden sm:table-cell text-xs capitalize">
                      {capitalize(li.membership_type ?? "")}
                    </td>
                  )}
                  <td className="px-3 py-2 text-center font-medium">
                    {isCounter ? (li.players ?? 1) : li.rounds}
                  </td>
                  <td className="px-3 py-2 text-right font-medium">{fmtRand(li.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/20">
                <td colSpan={isCounter ? 2 : 3} className="px-3 py-2 text-muted-foreground text-sm">
                  Subtotal (excl. VAT)
                </td>
                <td className="px-3 py-2 text-right text-muted-foreground text-sm">{fmtRand(exclVat)}</td>
              </tr>
              <tr className="bg-muted/20">
                <td colSpan={isCounter ? 2 : 3} className="px-3 py-1.5 text-muted-foreground text-xs">
                  VAT ({vatPct}%)
                </td>
                <td className="px-3 py-1.5 text-right text-muted-foreground text-xs">{fmtRand(vatAmt)}</td>
              </tr>
              <tr className="bg-muted/10 border-t">
                <td colSpan={isCounter ? 2 : 3} className="px-3 py-2 font-semibold text-foreground">
                  Total (incl. VAT)
                </td>
                <td className="px-3 py-2 text-right font-bold text-[#1a5c38]">{fmtRand(total)}</td>
              </tr>
            </tfoot>
          </table>
          <div className="px-3 py-2 bg-muted/20 border-t text-xs text-muted-foreground">
            {isCounter
              ? `Rate: R${Number(inv.platform_fee_rate).toFixed(2)} per player slot (incl. VAT) — TapIn platform fee`
              : `Rate: R${Number(inv.platform_fee_rate).toFixed(2)} per prepaid round (incl. VAT) — TapIn platform fee`}
          </div>
        </div>
      )}

      {open && items.length === 0 && (
        <p className="mt-2 text-xs text-muted-foreground italic">No per-item breakdown available for this invoice.</p>
      )}
    </div>
  );
}

// ── Invoice section (shared by both tabs) ────────────────────────────────────

interface InvoiceSectionProps {
  title: string;
  invoices: ClubInvoice[];
  status: "unpaid" | "paid";
  clubName: string;
  clubEmail: string;
  refreshingId: number | null;
  onPay: (inv: ClubInvoice) => void;
  onDownload: (inv: ClubInvoice, name: string, email: string) => void;
  emptyMessage: string;
}

function InvoiceSection({ title, invoices, status, clubName, clubEmail, refreshingId, onPay, onDownload, emptyMessage }: InvoiceSectionProps) {
  const isUnpaid = status === "unpaid";
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
        {invoices.length > 0 && (
          <Badge
            className={isUnpaid
              ? "bg-orange-100 text-orange-700 border-orange-200 text-xs"
              : "bg-green-100 text-green-700 border-green-200 text-xs"}
          >
            {invoices.length}
          </Badge>
        )}
        <div className="flex-1 h-px bg-border" />
      </div>

      {invoices.length === 0 ? (
        <p className="text-sm text-muted-foreground italic px-1">{emptyMessage}</p>
      ) : (
        invoices.map(inv => (
          <Card
            key={inv.id}
            className={isUnpaid ? "border-orange-200 bg-orange-50/40" : ""}
          >
            <CardContent className="p-5">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-semibold text-foreground">{inv.invoice_ref}</span>
                    {isUnpaid
                      ? <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-xs">Unpaid</Badge>
                      : <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">Paid</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">{inv.description}</p>
                  <p className="text-xs text-muted-foreground">
                    Issued {format(parseISO(inv.created_at), "d MMM yyyy")}
                    {inv.paid_at && ` · Paid ${format(parseISO(inv.paid_at), "d MMM yyyy")}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                  <span className={`font-bold flex-shrink-0 ${isUnpaid ? "text-xl" : "text-lg"}`}>
                    {fmtRand(inv.total_amount)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onDownload(inv, clubName, clubEmail)}
                    className="gap-1.5"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </Button>
                  {isUnpaid && (
                    <Button
                      onClick={() => onPay(inv)}
                      disabled={refreshingId === inv.id}
                      className="bg-[#1a5c38] hover:bg-[#164d2f] text-white"
                    >
                      {refreshingId === inv.id
                        ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        : <ExternalLink className="h-4 w-4 mr-2" />}
                      Pay Now
                    </Button>
                  )}
                </div>
              </div>
              <InvoiceBreakdown inv={inv} />
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function Invoices() {
  const { club } = useAuth();
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<ClubInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshingId, setRefreshingId] = useState<number | null>(null);
  const [counterSummary, setCounterSummary] = useState<CounterSummary | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      api<{ invoices: ClubInvoice[] }>("/api/portal/invoices"),
      api<CounterSummary>("/api/portal/counter-bookings/summary"),
    ])
      .then(([d, s]) => { setInvoices(d.invoices); setCounterSummary(s); })
      .catch(() => toast({ title: "Failed to load invoices", variant: "destructive" }))
      .finally(() => setLoading(false));
  };

  useEffect(() => { if (club) load(); }, [club]);

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
  const clubName  = club?.name ?? "Your Club";
  const clubEmail = (club as any)?.email ?? "";

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Invoices</h1>
          <p className="text-sm text-muted-foreground mt-1">
            TapIn platform fee invoices — counter bookings &amp; prepaid rounds
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>


      {/* Unbilled counter bookings summary */}
      {counterSummary && counterSummary.unbilled_bookings > 0 && (
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <TrendingUp className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold">Unbilled walk-in bookings accumulating</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {counterSummary.unbilled_bookings} booking{counterSummary.unbilled_bookings !== 1 ? "s" : ""} · {counterSummary.unbilled_count} player slot{counterSummary.unbilled_count !== 1 ? "s" : ""} · platform fee due: <strong className="text-foreground">{fmtRand(counterSummary.unbilled_total)}</strong> (incl. VAT)
                </p>
                <p className="text-xs text-muted-foreground mt-1">An invoice will be automatically generated on the 1st of next month.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabbed invoice list */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2].map(i => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      ) : (
        <Tabs defaultValue="outstanding">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="outstanding" className="flex-1 sm:flex-none gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Outstanding
              {unpaid.length > 0 && (
                <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-xs ml-1">{unpaid.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="paid" className="flex-1 sm:flex-none gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Paid
              {paid.length > 0 && (
                <Badge className="bg-green-100 text-green-700 border-green-200 text-xs ml-1">{paid.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ── Outstanding ── */}
          <TabsContent value="outstanding" className="mt-4 space-y-6">
            {unpaid.length === 0 ? (
              <Card className="border-green-200 bg-green-50/40">
                <CardContent className="p-8 flex items-center gap-3">
                  <CheckCircle2 className="h-6 w-6 text-green-600 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-green-800">No outstanding invoices</p>
                    <p className="text-sm text-green-700">Your account is up to date.</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <>
                <InvoiceSection
                  title="Counter Bookings"
                  invoices={unpaid.filter(i => i.invoice_type === "counter_bookings")}
                  status="unpaid"
                  clubName={clubName}
                  clubEmail={clubEmail}
                  refreshingId={refreshingId}
                  onPay={payNow}
                  onDownload={downloadInvoice}
                  emptyMessage="No outstanding counter booking invoices"
                />
                <InvoiceSection
                  title="Prepaid Rounds"
                  invoices={unpaid.filter(i => i.invoice_type === "prepaid_rounds")}
                  status="unpaid"
                  clubName={clubName}
                  clubEmail={clubEmail}
                  refreshingId={refreshingId}
                  onPay={payNow}
                  onDownload={downloadInvoice}
                  emptyMessage="No outstanding prepaid round invoices"
                />
                <p className="text-xs text-muted-foreground px-1">
                  "Pay Now" opens the Stitch secure checkout in a new tab. Once payment is confirmed the invoice is automatically marked as paid.
                </p>
              </>
            )}
          </TabsContent>

          {/* ── Paid ── */}
          <TabsContent value="paid" className="mt-4 space-y-6">
            {paid.length === 0 ? (
              <Card>
                <CardContent className="p-8 flex flex-col items-center text-center gap-3">
                  <Receipt className="h-8 w-8 text-muted-foreground/40" />
                  <p className="font-medium text-muted-foreground">No paid invoices yet</p>
                </CardContent>
              </Card>
            ) : (
              <>
                <InvoiceSection
                  title="Counter Bookings"
                  invoices={paid.filter(i => i.invoice_type === "counter_bookings")}
                  status="paid"
                  clubName={clubName}
                  clubEmail={clubEmail}
                  refreshingId={refreshingId}
                  onPay={payNow}
                  onDownload={downloadInvoice}
                  emptyMessage="No paid counter booking invoices"
                />
                <InvoiceSection
                  title="Prepaid Rounds"
                  invoices={paid.filter(i => i.invoice_type === "prepaid_rounds")}
                  status="paid"
                  clubName={clubName}
                  clubEmail={clubEmail}
                  refreshingId={refreshingId}
                  onPay={payNow}
                  onDownload={downloadInvoice}
                  emptyMessage="No paid prepaid round invoices"
                />
              </>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
