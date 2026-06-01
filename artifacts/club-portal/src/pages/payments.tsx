import { useEffect, useState, useMemo } from "react";
import * as XLSX from "xlsx";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  CreditCard, Download, Mail, Search, TrendingUp, ReceiptText,
  CheckCircle2, Clock, X, Users, FileSpreadsheet,
} from "lucide-react";
import { format, parseISO } from "date-fns";

interface Player {
  name: string;
  email: string | null;
  amount: number;
  paid: boolean;
}

interface Payment {
  id: number;
  booking_ref: string;
  players: number;
  total_amount: number;
  my_amount: number;
  club_amount: number;
  payment_method: string;
  status: string;
  split_bill: boolean;
  cart_fee: number;
  platform_fee: number;
  discount_amount: number;
  voucher_code: string | null;
  created_at: string;
  holes: number;
  price_tier: string | null;
  user_name: string;
  user_email: string;
  user_phone: string | null;
  tee_date: string;
  tee_time: string;
  players_list: Player[];
}

const STATUS_COLORS: Record<string, string> = {
  confirmed: "bg-green-100 text-green-700 border-green-200",
  completed: "bg-blue-100 text-blue-700 border-blue-200",
  pending:   "bg-yellow-100 text-yellow-700 border-yellow-200",
  cancelled: "bg-red-100 text-red-700 border-red-200",
};

const METHOD_LABELS: Record<string, string> = {
  stitch:  "Stitch (EFT/Card)",
  wallet:  "TapIn Wallet",
  prepaid: "Prepaid",
  card:    "Card",
};

const TIER_LABELS: Record<string, string> = {
  visitor: "Visitor",
  hna:     "HNA Affiliated",
  member:  "Member",
};

function fmtRand(n: number) {
  return `R ${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtMethod(m: string) {
  return METHOD_LABELS[m] ?? m;
}

function fmtTier(t: string | null | undefined) {
  return t ? (TIER_LABELS[t] ?? t) : "Standard";
}

function generateInvoiceHTML(b: Payment, clubName: string): string {
  const hasCart = b.cart_fee > 0;
  // Use my_amount (what this user was charged) as the invoice total.
  // Derive green fee: my_amount minus cart hire plus any discount already applied.
  const greenFee = b.my_amount - b.cart_fee + b.discount_amount;

  const statusBg = b.status === "confirmed" || b.status === "completed"
    ? "background:#dcfce7;color:#166534"
    : b.status === "pending"
    ? "background:#fef9c3;color:#854d0e"
    : "background:#fee2e2;color:#991b1b";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Invoice ${b.booking_ref}</title>
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
          <div style="font-size:13px;opacity:0.75;margin-top:3px">${clubName}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:11px;opacity:0.6;text-transform:uppercase;letter-spacing:1.5px">Invoice</div>
          <div style="font-size:22px;font-weight:700;letter-spacing:2px;margin-top:2px">${b.booking_ref}</div>
          <div style="font-size:12px;opacity:0.7;margin-top:4px">${format(parseISO(b.created_at), "dd MMM yyyy, HH:mm")}</div>
        </div>
      </div>
    </div>

    <div style="padding:36px 40px">
      <!-- Bill To / Status -->
      <div style="display:flex;justify-content:space-between;margin-bottom:32px;gap:24px">
        <div>
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;margin-bottom:8px">Bill To</div>
          <div style="font-size:16px;font-weight:600">${b.user_name}</div>
          <div style="color:#6b7280;font-size:13px;margin-top:2px">${b.user_email}</div>
          ${b.user_phone ? `<div style="color:#6b7280;font-size:13px;margin-top:2px">${b.user_phone}</div>` : ""}
        </div>
        <div style="text-align:right">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;margin-bottom:8px">Payment Status</div>
          <div style="display:inline-block;padding:4px 14px;border-radius:20px;font-size:12px;font-weight:700;letter-spacing:0.5px;${statusBg}">${b.status.toUpperCase()}</div>
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;margin-top:14px;margin-bottom:8px">Payment Method</div>
          <div style="font-size:13px;font-weight:600">${fmtMethod(b.payment_method)}</div>
        </div>
      </div>

      <!-- Booking Details -->
      <div style="background:#f9fafb;border-radius:10px;padding:20px 24px;margin-bottom:28px;border:1px solid #e5e7eb">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;margin-bottom:14px">Booking Details</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px">
          <div><div style="color:#6b7280;font-size:12px">Tee Date</div><div style="font-weight:600;font-size:14px;margin-top:3px">${b.tee_date}</div></div>
          <div><div style="color:#6b7280;font-size:12px">Tee Time</div><div style="font-weight:600;font-size:14px;margin-top:3px">${b.tee_time}</div></div>
          <div><div style="color:#6b7280;font-size:12px">Players</div><div style="font-weight:600;font-size:14px;margin-top:3px">${b.players} player${b.players !== 1 ? "s" : ""}</div></div>
          <div><div style="color:#6b7280;font-size:12px">Service</div><div style="font-weight:600;font-size:14px;margin-top:3px">${b.holes} Holes${hasCart ? " + Golf Cart" : ""}</div></div>
          <div><div style="color:#6b7280;font-size:12px">Pricing Tier</div><div style="font-weight:600;font-size:14px;margin-top:3px">${fmtTier(b.price_tier)}</div></div>
          <div><div style="color:#6b7280;font-size:12px">Paid On</div><div style="font-weight:600;font-size:14px;margin-top:3px">${format(parseISO(b.created_at), "dd MMM yyyy, HH:mm")}</div></div>
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
          <tr>
            <td style="padding:12px 10px;border-bottom:1px solid #f3f4f6">${b.holes} Holes — Green Fee <span style="color:#6b7280;font-size:12px">(${fmtTier(b.price_tier)})</span></td>
            <td style="padding:12px 10px;border-bottom:1px solid #f3f4f6;text-align:right">R ${greenFee.toFixed(2)}</td>
          </tr>
          ${hasCart ? `
          <tr>
            <td style="padding:12px 10px;border-bottom:1px solid #f3f4f6">Golf Cart Hire</td>
            <td style="padding:12px 10px;border-bottom:1px solid #f3f4f6;text-align:right">R ${b.cart_fee.toFixed(2)}</td>
          </tr>` : ""}
          ${b.discount_amount > 0 ? `
          <tr>
            <td style="padding:12px 10px;border-bottom:1px solid #f3f4f6;color:#16a34a">Discount${b.voucher_code ? ` — Voucher <strong>${b.voucher_code}</strong>` : ""}</td>
            <td style="padding:12px 10px;border-bottom:1px solid #f3f4f6;text-align:right;color:#16a34a">−R ${b.discount_amount.toFixed(2)}</td>
          </tr>` : ""}
        </tbody>
        <tfoot>
          <tr style="background:#f0fdf4">
            <td style="padding:14px 10px;font-weight:700;font-size:16px;border-top:2px solid #bbf7d0">Total Charged</td>
            <td style="padding:14px 10px;font-weight:800;font-size:20px;text-align:right;color:#1a5c38;border-top:2px solid #bbf7d0">R ${b.my_amount.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>

      <!-- Payment Reference -->
      <div style="background:#f9fafb;border-radius:10px;padding:16px 24px;border:1px solid #e5e7eb">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;margin-bottom:10px">Payment Reference</div>
        <div style="font-family:monospace;font-size:18px;font-weight:700;color:#1a5c38;letter-spacing:2px">${b.booking_ref}</div>
        <div style="font-size:12px;color:#9ca3af;margin-top:4px">Use this reference for any payment queries</div>
      </div>
    </div>

    <!-- Footer -->
    <div style="padding:20px 40px;border-top:1px solid #e5e7eb;text-align:center;color:#9ca3af;font-size:12px">
      TapIn Golf &nbsp;·&nbsp; tapingolf.co.za &nbsp;·&nbsp; This is your official booking receipt. Please retain for your records.
    </div>
  </div>
</body>
</html>`;
}

function downloadInvoice(b: Payment, clubName: string) {
  const html = generateInvoiceHTML(b, clubName);
  const w = window.open("", "_blank");
  if (!w) { alert("Please allow pop-ups to download invoices."); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 600);
}

export default function Payments() {
  const { club } = useAuth();
  const { toast } = useToast();

  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState<Payment | null>(null);
  const [resending, setResending] = useState(false);

  const [search, setSearch]         = useState("");
  const [statusFilter, setStatus]   = useState("all");
  const [methodFilter, setMethod]   = useState("all");
  const [fromDate, setFrom]         = useState("");
  const [toDate, setTo]             = useState("");

  const [exportOpen, setExportOpen] = useState(false);
  const ALL_EXPORT_FIELDS = [
    { key: "booking_ref",     label: "Reference" },
    { key: "user_name",       label: "Golfer Name" },
    { key: "user_email",      label: "Golfer Email" },
    { key: "user_phone",      label: "Golfer Phone" },
    { key: "tee_date",        label: "Tee Date" },
    { key: "tee_time",        label: "Tee Time" },
    { key: "holes",           label: "Holes" },
    { key: "players",         label: "Players" },
    { key: "service",         label: "Service" },
    { key: "payment_method",  label: "Payment Method" },
    { key: "status",          label: "Status" },
    { key: "my_amount",       label: "Amount Charged (R)" },
    { key: "cart_fee",        label: "Cart Fee (R)" },
    { key: "voucher_code",    label: "Voucher Code" },
    { key: "paid_on",         label: "Paid On" },
  ] as const;
  type ExportFieldKey = typeof ALL_EXPORT_FIELDS[number]["key"];
  const [exportFields, setExportFields] = useState<Set<ExportFieldKey>>(
    new Set(["booking_ref","user_name","user_email","tee_date","tee_time","service","payment_method","status","my_amount","paid_on"])
  );
  const toggleField = (k: ExportFieldKey) =>
    setExportFields(prev => { const s = new Set(prev); s.has(k) ? s.delete(k) : s.add(k); return s; });

  const exportToExcel = () => {
    const ordered = ALL_EXPORT_FIELDS.filter(f => exportFields.has(f.key));
    const header = ordered.map(f => f.label);
    const rows = filtered.map(p => ordered.map(f => {
      if (f.key === "service")         return `${p.holes}H${p.cart_fee > 0 ? " + Cart" : ""}`;
      if (f.key === "paid_on")         return format(parseISO(p.created_at), "dd MMM yyyy HH:mm");
      if (f.key === "payment_method")  return fmtMethod(p.payment_method);
      if (f.key === "my_amount")       return p.my_amount;
      if (f.key === "cart_fee")        return p.cart_fee;
      return (p as any)[f.key] ?? "";
    }));
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Payments");
    const from = fromDate || "all";
    const to   = toDate   || "all";
    XLSX.writeFile(wb, `TapIn_Payments_${from}_to_${to}.xlsx`);
    setExportOpen(false);
  };

  const load = async () => {
    setLoading(true);
    try {
      let url = "/api/portal/payments?limit=300";
      if (statusFilter !== "all") url += `&status=${statusFilter}`;
      if (fromDate) url += `&from=${fromDate}`;
      if (toDate)   url += `&to=${toDate}`;
      const data = await api<Payment[]>(url);
      setPayments(data);
    } catch (e: any) {
      toast({ title: "Error loading payments", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [statusFilter, fromDate, toDate]);

  const filtered = useMemo(() => {
    let list = payments;
    if (methodFilter !== "all") list = list.filter(p => p.payment_method === methodFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(p =>
        p.booking_ref.toLowerCase().includes(q) ||
        p.user_name.toLowerCase().includes(q) ||
        p.user_email.toLowerCase().includes(q)
      );
    }
    return list;
  }, [payments, methodFilter, search]);

  const stats = useMemo(() => {
    const paid = payments.filter(p => p.status === "confirmed" || p.status === "completed");
    // Prepaid rounds are settled directly with the club — exclude from digital revenue
    const digital = paid.filter(p => p.payment_method !== "prepaid");
    return {
      total:     payments.length,
      revenue:   digital.reduce((s, p) => s + p.my_amount, 0),
      confirmed: paid.length,
      pending:   payments.filter(p => p.status === "pending").length,
    };
  }, [payments]);

  const clearFilters = () => { setSearch(""); setStatus("all"); setMethod("all"); setFrom(""); setTo(""); };
  const hasFilters = search || statusFilter !== "all" || methodFilter !== "all" || fromDate || toDate;

  const resendInvoice = async (p: Payment) => {
    setResending(true);
    try {
      await api(`/api/portal/payments/${p.id}/resend-invoice`, { method: "POST" });
      toast({ title: "Invoice sent", description: `Invoice emailed to ${p.user_email}` });
    } catch (e: any) {
      toast({ title: "Failed to send", description: e.message, variant: "destructive" });
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <CreditCard className="h-7 w-7 text-[#1a5c38]" />
          Payments
        </h1>
        <p className="text-muted-foreground mt-1">
          All transactions for your club — download or resend invoices directly from here.
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-green-50 rounded-lg"><TrendingUp className="h-5 w-5 text-green-600" /></div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total Revenue</p>
              <p className="text-xl font-bold text-[#1a5c38]">{fmtRand(stats.revenue)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg"><ReceiptText className="h-5 w-5 text-blue-600" /></div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Transactions</p>
              <p className="text-xl font-bold">{stats.total}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-green-50 rounded-lg"><CheckCircle2 className="h-5 w-5 text-green-600" /></div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Confirmed / Completed</p>
              <p className="text-xl font-bold">{stats.confirmed}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-yellow-50 rounded-lg"><Clock className="h-5 w-5 text-yellow-600" /></div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Pending</p>
              <p className="text-xl font-bold">{stats.pending}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48 max-w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search ref, name, email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatus}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={methodFilter} onValueChange={setMethod}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Payment method" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Methods</SelectItem>
            <SelectItem value="stitch">Stitch (EFT/Card)</SelectItem>
            <SelectItem value="wallet">TapIn Wallet</SelectItem>
            <SelectItem value="prepaid">Prepaid</SelectItem>
            <SelectItem value="card">Card</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5">
          <label className="text-sm text-muted-foreground whitespace-nowrap">From</label>
          <Input type="date" value={fromDate} onChange={e => setFrom(e.target.value)} className="w-36" />
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-sm text-muted-foreground whitespace-nowrap">To</label>
          <Input type="date" value={toDate} onChange={e => setTo(e.target.value)} className="w-36" />
        </div>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1.5 text-muted-foreground">
            <X className="h-3.5 w-3.5" /> Clear
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className="ml-auto gap-2 border-[#1a5c38] text-[#1a5c38] hover:bg-[#1a5c38]/5"
          onClick={() => setExportOpen(true)}
          disabled={filtered.length === 0}
        >
          <FileSpreadsheet className="h-4 w-4" />
          Export Report
        </Button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <CreditCard className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No payments found</p>
            <p className="text-sm mt-1">Try adjusting your filters or date range.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border bg-white overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[140px_1fr_100px_90px_120px_130px_110px_100px] gap-0 bg-muted/40 border-b text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <div className="px-4 py-3">Reference</div>
            <div className="px-4 py-3">Golfer</div>
            <div className="px-4 py-3">Tee Date</div>
            <div className="px-4 py-3">Time</div>
            <div className="px-4 py-3">Service</div>
            <div className="px-4 py-3">Paid On</div>
            <div className="px-4 py-3 text-right">Amount</div>
            <div className="px-4 py-3 text-center">Status</div>
          </div>
          {/* Rows */}
          {filtered.map(p => (
            <div
              key={p.id}
              className="grid grid-cols-[140px_1fr_100px_90px_120px_130px_110px_100px] gap-0 border-b last:border-b-0 hover:bg-muted/20 transition-colors cursor-pointer items-center"
              onClick={() => setSelected(p)}
            >
              <div className="px-4 py-3">
                <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded font-semibold">{p.booking_ref}</code>
              </div>
              <div className="px-4 py-3 min-w-0">
                <p className="font-medium text-sm truncate">{p.user_name}</p>
                <p className="text-xs text-muted-foreground truncate">{p.user_email}</p>
              </div>
              <div className="px-4 py-3 text-sm">{p.tee_date}</div>
              <div className="px-4 py-3 text-sm">{p.tee_time}</div>
              <div className="px-4 py-3 text-sm">
                <span>{p.holes}H{p.cart_fee > 0 ? " + Cart" : ""}</span>
                <span className="text-xs text-muted-foreground block">{p.players} player{p.players !== 1 ? "s" : ""}</span>
              </div>
              <div className="px-4 py-3 text-sm">
                <span className="block">{format(parseISO(p.created_at), "dd MMM yyyy")}</span>
                <span className="text-xs text-muted-foreground">{format(parseISO(p.created_at), "HH:mm")}</span>
              </div>
              <div className="px-4 py-3 text-sm font-semibold text-right">{fmtRand(p.my_amount)}</div>
              <div className="px-4 py-3 text-center">
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${STATUS_COLORS[p.status] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
                  {p.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Export Dialog */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-[#1a5c38]" />
              Export Payments Report
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Select the columns to include in your Excel file.
            {filtered.length !== payments.length
              ? ` Exporting ${filtered.length} filtered transaction${filtered.length !== 1 ? "s" : ""}.`
              : ` Exporting all ${filtered.length} transaction${filtered.length !== 1 ? "s" : ""}.`}
          </p>
          <div className="grid grid-cols-2 gap-2 py-2">
            {ALL_EXPORT_FIELDS.map(f => (
              <div key={f.key} className="flex items-center gap-2">
                <Checkbox
                  id={`ef-${f.key}`}
                  checked={exportFields.has(f.key)}
                  onCheckedChange={() => toggleField(f.key)}
                />
                <Label htmlFor={`ef-${f.key}`} className="text-sm cursor-pointer">{f.label}</Label>
              </div>
            ))}
          </div>
          <DialogFooter className="gap-2 flex-row justify-end">
            <Button variant="outline" onClick={() => setExportOpen(false)}>Cancel</Button>
            <Button
              className="gap-2 bg-[#1a5c38] hover:bg-[#154d30]"
              onClick={exportToExcel}
              disabled={exportFields.size === 0}
            >
              <Download className="h-4 w-4" />
              Download Excel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!selected} onOpenChange={open => { if (!open) setSelected(null); }}>
        {selected && (
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ReceiptText className="h-5 w-5 text-[#1a5c38]" />
                Transaction Detail
                <code className="ml-2 text-sm font-mono bg-muted px-2 py-0.5 rounded">{selected.booking_ref}</code>
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-5 pt-2">
              {/* Status + method row */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className={`text-xs px-3 py-1 rounded-full font-semibold border ${STATUS_COLORS[selected.status] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
                  {selected.status.toUpperCase()}
                </span>
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <CreditCard className="h-3.5 w-3.5" />
                  {fmtMethod(selected.payment_method)}
                </span>
                <span className="text-xs text-muted-foreground ml-auto">
                  Booked {format(parseISO(selected.created_at), "dd MMM yyyy 'at' HH:mm")}
                </span>
              </div>

              {/* Golfer */}
              <div className="rounded-lg border p-4 space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Golfer</p>
                <p className="font-semibold text-base">{selected.user_name}</p>
                <p className="text-sm text-muted-foreground">{selected.user_email}</p>
                {selected.user_phone && <p className="text-sm text-muted-foreground">{selected.user_phone}</p>}
              </div>

              {/* Booking info */}
              <div className="rounded-lg border p-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Booking</p>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">Tee Date</p>
                    <p className="font-semibold mt-0.5">{selected.tee_date}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Tee Time</p>
                    <p className="font-semibold mt-0.5">{selected.tee_time}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Players</p>
                    <p className="font-semibold mt-0.5">{selected.players} player{selected.players !== 1 ? "s" : ""}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Service</p>
                    <p className="font-semibold mt-0.5">{selected.holes} Holes{selected.cart_fee > 0 ? " + Golf Cart" : ""}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Pricing Tier</p>
                    <p className="font-semibold mt-0.5">{fmtTier(selected.price_tier)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Paid On</p>
                    <p className="font-semibold mt-0.5">{format(parseISO(selected.created_at), "dd MMM yyyy, HH:mm")}</p>
                  </div>
                </div>
              </div>

              {/* Financial breakdown */}
              <div className="rounded-lg border p-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Charges</p>
                <div className="space-y-2 text-sm">
                  {(() => {
                    const greenFee = selected.my_amount - selected.cart_fee + selected.discount_amount;
                    return (
                      <>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{selected.holes} Holes Green Fee</span>
                          <span className="font-medium">{fmtRand(greenFee)}</span>
                        </div>
                        {selected.cart_fee > 0 && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Golf Cart Hire</span>
                            <span className="font-medium">{fmtRand(selected.cart_fee)}</span>
                          </div>
                        )}
                        {selected.discount_amount > 0 && (
                          <div className="flex justify-between text-green-700">
                            <span>Discount{selected.voucher_code ? ` — ${selected.voucher_code}` : ""}</span>
                            <span className="font-medium">−{fmtRand(selected.discount_amount)}</span>
                          </div>
                        )}
                        <div className="flex justify-between font-bold text-base pt-2 border-t">
                          <span>Total Charged</span>
                          <span className="text-[#1a5c38]">{fmtRand(selected.my_amount)}</span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <Button
                  className="flex-1 gap-2 bg-[#1a5c38] hover:bg-[#154d30]"
                  onClick={() => downloadInvoice(selected, club?.name ?? "TapIn Golf")}
                >
                  <Download className="h-4 w-4" />
                  Download Invoice
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 gap-2"
                  disabled={resending}
                  onClick={() => resendInvoice(selected)}
                >
                  <Mail className="h-4 w-4" />
                  {resending ? "Sending…" : "Resend to Golfer"}
                </Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
