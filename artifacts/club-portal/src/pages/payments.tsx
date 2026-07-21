import { useEffect, useState, useMemo, useCallback, useRef } from "react";
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
  CheckCircle2, Clock, X, Users, FileSpreadsheet, Building2, Banknote,
  ChevronLeft, ChevronRight,
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
  driving_range_fee: number;
  club_hire_fee: number;
  event_entry_fee: number;
  event_additional_fees: number;
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
  // Member tiers
  full_member:          "Full Member",
  six_day_member:       "Six-Day Member",
  week_day_member:      "Weekday Member",
  pensioner_full:       "Pensioner Member (Full)",
  pensioner_six_day:    "Pensioner Member (6-Day)",
  pensioner_week_day:   "Pensioner Member (Weekday)",
  student_member:       "Student Member",
  junior_member:        "Junior Member",
  honorary:             "Honorary Member",
  // Visitor tiers
  affiliated_visitor:       "Affiliated Visitor",
  affiliated_pensioner:     "Affiliated Pensioner",
  non_affiliated_visitor:   "Non-Affiliated Visitor",
  non_affiliated_pensioner: "Non-Affiliated Pensioner",
  student_visitor:          "Student Visitor",
  junior_visitor:           "Junior Visitor",
  // Legacy / catch-all
  visitor: "Visitor",
  hna:     "HNA Affiliated",
  member:  "Member",
};

const MEMBER_TIERS = new Set([
  "full_member","six_day_member","week_day_member",
  "pensioner_full","pensioner_six_day","pensioner_week_day",
  "student_member","junior_member","honorary",
  "member",
]);

const VISITOR_TIERS = new Set([
  "affiliated_visitor","affiliated_pensioner",
  "non_affiliated_visitor","non_affiliated_pensioner",
  "student_visitor","junior_visitor",
  "visitor","hna",
]);

function fmtRand(n: number) {
  return `R ${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtMethod(m: string) {
  return METHOD_LABELS[m] ?? m;
}

function fmtTier(t: string | null | undefined) {
  return t ? (TIER_LABELS[t] ?? t) : "Standard";
}

// ─── Period picker helpers (shared with dashboard) ────────────────────────────

type PeriodKey = "today" | "week" | "month" | "quarter" | "year" | "custom";

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "today",   label: "Today" },
  { key: "week",    label: "Week" },
  { key: "month",   label: "Month" },
  { key: "quarter", label: "Quarter" },
  { key: "year",    label: "Year" },
  { key: "custom",  label: "Custom" },
];

const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTH_FULL  = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function getFiscalYearStart(now: Date, fiscalStartMonth: number): Date {
  const fsm = fiscalStartMonth - 1;
  return new Date(now.getMonth() >= fsm ? now.getFullYear() : now.getFullYear() - 1, fsm, 1);
}

function currentFiscalQuarter(now: Date, fsm: number) {
  const fyStart = getFiscalYearStart(now, fsm);
  return { fq: Math.floor(((now.getMonth() - fyStart.getMonth() + 12) % 12) / 3), fyYear: fyStart.getFullYear() };
}

function computeDateRange(
  period: PeriodKey,
  weekPickDate: string,
  selMonth: number, selMonthYear: number,
  selFQ: number, selFQYear: number,
  selFYear: number,
  customFrom: string, customTo: string,
  fiscalStartMonth = 1
): { from: string; to: string } {
  const now = new Date();
  const today = fmtDate(now);
  switch (period) {
    case "today": return { from: today, to: today };
    case "week": {
      const pick = weekPickDate ? new Date(weekPickDate + "T00:00:00") : now;
      if (isNaN(pick.getTime())) return { from: today, to: today };
      const diff = pick.getDay() === 0 ? 6 : pick.getDay() - 1;
      const mon = new Date(pick); mon.setDate(pick.getDate() - diff);
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      return { from: fmtDate(mon), to: fmtDate(sun) };
    }
    case "month": {
      const isCurrent = selMonthYear === now.getFullYear() && selMonth === now.getMonth();
      return {
        from: fmtDate(new Date(selMonthYear, selMonth, 1)),
        to:   isCurrent ? today : fmtDate(new Date(selMonthYear, selMonth + 1, 0)),
      };
    }
    case "quarter": {
      const fsm = fiscalStartMonth - 1;
      const qSM = (fsm + selFQ * 3) % 12;
      const qEM = (fsm + selFQ * 3 + 2) % 12;
      const qSY = qSM < fsm ? selFQYear + 1 : selFQYear;
      const qEY = qEM < qSM ? qSY + 1 : qSY;
      return { from: fmtDate(new Date(qSY, qSM, 1)), to: fmtDate(new Date(qEY, qEM + 1, 0)) };
    }
    case "year": {
      const fsm = fiscalStartMonth - 1;
      return { from: fmtDate(new Date(selFYear, fsm, 1)), to: fmtDate(new Date(selFYear + 1, fsm, 0)) };
    }
    case "custom": return { from: customFrom || today, to: customTo || today };
    default: return { from: today, to: today };
  }
}

function periodLabel(
  period: PeriodKey,
  selMonth: number, selMonthYear: number,
  selFQ: number, selFQYear: number,
  selFYear: number,
  from: string, to: string,
  fiscalStartMonth = 1
): string {
  switch (period) {
    case "today":   return "today";
    case "week":    return `${from} — ${to}`;
    case "month":   return `${MONTH_FULL[selMonth]} ${selMonthYear} (${from} — ${to})`;
    case "quarter": {
      const fsm = fiscalStartMonth - 1;
      const qSM = (fsm + selFQ * 3) % 12;
      const qSY = qSM < fsm ? selFQYear + 1 : selFQYear;
      return `Q${selFQ + 1} ${qSY} (${from} — ${to})`;
    }
    case "year": {
      const fsm = fiscalStartMonth - 1;
      const label = fsm === 0 ? String(selFYear) : `FY${selFYear}`;
      return `${label} (${from} — ${to})`;
    }
    case "custom":  return `${from} — ${to}`;
    default:        return "";
  }
}

function generateInvoiceHTML(b: Payment, clubName: string, vatPct: number): string {
  const hasCart = b.cart_fee > 0;
  // Use my_amount (what this user was charged) as the invoice total.
  // Derive green fee: my_amount minus cart hire plus any discount already applied.
  const greenFee  = b.my_amount - b.cart_fee + b.discount_amount;
  const vatAmount = Math.round(b.my_amount * vatPct / (100 + vatPct) * 100) / 100;
  const exclVat   = Math.round((b.my_amount - vatAmount) * 100) / 100;

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
          <tr>
            <td style="padding:8px 10px 2px;color:#6b7280;font-size:13px">Subtotal (excl. VAT)</td>
            <td style="padding:8px 10px 2px;text-align:right;color:#6b7280;font-size:13px">R ${exclVat.toFixed(2)}</td>
          </tr>
          <tr>
            <td style="padding:2px 10px 10px;color:#6b7280;font-size:13px">VAT (${vatPct}%)</td>
            <td style="padding:2px 10px 10px;text-align:right;color:#6b7280;font-size:13px">R ${vatAmount.toFixed(2)}</td>
          </tr>
          <tr style="background:#f0fdf4">
            <td style="padding:14px 10px;font-weight:700;font-size:16px;border-top:2px solid #bbf7d0">Total (incl. VAT)</td>
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

function downloadInvoice(b: Payment, clubName: string, vatPct: number) {
  const html = generateInvoiceHTML(b, clubName, vatPct);
  const w = window.open("", "_blank");
  if (!w) { alert("Please allow pop-ups to download invoices."); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 600);
}

export default function Payments() {
  const [tab, setTab] = useState<"payments" | "split">("payments");

  return (
    <div className="space-y-6">
      <div className="border-b">
        <div className="flex gap-0">
          <button
            onClick={() => setTab("payments")}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === "payments"
                ? "border-[#1a5c38] text-[#1a5c38]"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <CreditCard className="h-4 w-4 inline mr-1.5 -mt-0.5" />
            Payments
          </button>
          <button
            onClick={() => setTab("split")}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === "split"
                ? "border-[#1a5c38] text-[#1a5c38]"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Banknote className="h-4 w-4 inline mr-1.5 -mt-0.5" />
            Split Payments
          </button>
        </div>
      </div>
      {tab === "payments" ? <PaymentsContent /> : <SplitPaymentsContent />}
    </div>
  );
}

export function PaymentsContent() {
  const { club } = useAuth();
  const { toast } = useToast();

  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState<Payment | null>(null);
  const [resending, setResending] = useState(false);
  const [vatPct, setVatPct]     = useState(15);

  const [search, setSearch]         = useState("");
  const [statusFilter, setStatus]   = useState("all");
  const [methodFilter, setMethod]   = useState("all");

  // ── Period picker state ───────────────────────────────────────────────────
  const fiscalStartMonth = club?.fiscal_year_start_month ?? 1;
  const _now = new Date();
  const _currentYear = _now.getFullYear();
  const _initFQ = currentFiscalQuarter(_now, fiscalStartMonth);
  const yearOptions = [_currentYear - 2, _currentYear - 1, _currentYear];

  const [period, setPeriod]                     = useState<PeriodKey>("month");
  const [weekPickDate, setWeekPickDate]         = useState(() => fmtDate(_now));
  const [selectedMonth, setSelectedMonth]       = useState(_now.getMonth());
  const [selectedMonthYear, setSelectedMonthYear] = useState(_currentYear);
  const [selectedFQ, setSelectedFQ]             = useState(_initFQ.fq);
  const [selectedFQYear, setSelectedFQYear]     = useState(_initFQ.fyYear);
  const [selectedFYear, setSelectedFYear]       = useState(_initFQ.fyYear);
  const [customFrom, setCustomFrom]             = useState("");
  const [customTo, setCustomTo]                 = useState("");

  const { from: fromDate, to: toDate } = computeDateRange(
    period, weekPickDate, selectedMonth, selectedMonthYear,
    selectedFQ, selectedFQYear, selectedFYear,
    customFrom, customTo, fiscalStartMonth
  );

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
    XLSX.writeFile(wb, `TapIn_Payments_${fromDate}_to_${toDate}.xlsx`);
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
  useEffect(() => {
    api<{ vat_pct: number }>("/api/settings").then(d => setVatPct(d.vat_pct ?? 15)).catch(() => {});
  }, []);

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
    // "paid" = confirmed/completed, any payment method.
    // "digital" = paid minus prepaid (prepaid rounds have no per-booking cash flow for the club).
    const paid    = payments.filter(p => p.status === "confirmed" || p.status === "completed");
    const digital = paid.filter(p => p.payment_method !== "prepaid");
    return {
      total:          payments.length,
      // Total Revenue = gross booking value + event entry/competition fees.
      // Club Earnings = club's net after TapIn fee + event fees (no platform fee on event fees).
      revenue:        digital.reduce((s, p) => s + (p.total_amount ?? 0) + (p.event_entry_fee ?? 0) + (p.event_additional_fees ?? 0), 0),
      club_earnings:  digital.reduce((s, p) => s + (p.club_amount ?? 0) + (p.event_entry_fee ?? 0) + (p.event_additional_fees ?? 0), 0),
      platform_fees:  digital.reduce((s, p) => s + (p.platform_fee ?? 0), 0),
      confirmed:      paid.length,
      pending:        payments.filter(p => p.status === "pending").length,
      // Earnings breakdowns — green fees + event entry/competition fees; add-ons listed separately.
      // club_amount = total_amount − platform_fee, so subtract add-ons but include event fees.
      visitor_earnings: digital.filter(p => p.price_tier != null && VISITOR_TIERS.has(p.price_tier)).reduce((s, p) => s + (p.club_amount ?? 0) - (p.cart_fee ?? 0) - (p.driving_range_fee ?? 0) - (p.club_hire_fee ?? 0) + (p.event_entry_fee ?? 0) + (p.event_additional_fees ?? 0), 0),
      member_earnings:  digital.filter(p => p.price_tier != null && MEMBER_TIERS.has(p.price_tier)).reduce((s, p) => s + (p.club_amount ?? 0) - (p.cart_fee ?? 0) - (p.driving_range_fee ?? 0) - (p.club_hire_fee ?? 0) + (p.event_entry_fee ?? 0) + (p.event_additional_fees ?? 0), 0),
      range_earnings:   digital.reduce((s, p) => s + (p.driving_range_fee ?? 0), 0),
      cart_earnings:    digital.reduce((s, p) => s + (p.cart_fee ?? 0), 0),
      hire_earnings:    digital.reduce((s, p) => s + (p.club_hire_fee ?? 0), 0),
    };
  }, [payments]);

  const clearFilters = () => {
    setSearch(""); setStatus("all"); setMethod("all");
    setPeriod("month"); setSelectedMonth(_now.getMonth()); setSelectedMonthYear(_currentYear);
  };
  const hasFilters = !!(search || statusFilter !== "all" || methodFilter !== "all");

  // ── Lazy loading ──────────────────────────────────────────────────────────
  const PAGE = 50;
  const [visibleCount, setVisibleCount] = useState(PAGE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setVisibleCount(PAGE); }, [fromDate, toDate, search, statusFilter, methodFilter]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) setVisibleCount(c => c + PAGE);
    }, { rootMargin: "200px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, [filtered]);

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
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <CreditCard className="h-7 w-7 text-[#1a5c38]" />
          Payments
        </h1>
        <p className="text-muted-foreground mt-1">
          Showing{" "}
          <span className="font-medium text-foreground">
            {periodLabel(period, selectedMonth, selectedMonthYear, selectedFQ, selectedFQYear, selectedFYear, fromDate, toDate, fiscalStartMonth)}
          </span>
          {filtered.length > 0 && (
            <> &mdash; {filtered.length} transaction{filtered.length !== 1 ? "s" : ""}</>
          )}
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
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
            <div className="p-2 bg-emerald-50 rounded-lg"><Building2 className="h-5 w-5 text-emerald-600" /></div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Club Earnings</p>
              <p className="text-xl font-bold text-emerald-700">{fmtRand(stats.club_earnings)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-amber-50 rounded-lg"><Banknote className="h-5 w-5 text-amber-600" /></div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">TapIn Fees</p>
              <p className="text-xl font-bold text-amber-700">{fmtRand(stats.platform_fees)}</p>
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

      {/* Earnings Breakdown */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Earnings Breakdown</p>
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 bg-green-50 rounded-lg"><Users className="h-5 w-5 text-green-600" /></div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Visitor Bookings</p>
                <p className="text-xl font-bold text-[#1a5c38]">{fmtRand(stats.visitor_earnings)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 bg-blue-50 rounded-lg"><Users className="h-5 w-5 text-blue-600" /></div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Member Bookings</p>
                <p className="text-xl font-bold text-blue-700">{fmtRand(stats.member_earnings)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 bg-teal-50 rounded-lg"><TrendingUp className="h-5 w-5 text-teal-600" /></div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Driving Range Balls</p>
                <p className="text-xl font-bold text-teal-700">{fmtRand(stats.range_earnings)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 bg-orange-50 rounded-lg"><Banknote className="h-5 w-5 text-orange-600" /></div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Golf Cart Hire</p>
                <p className="text-xl font-bold text-orange-700">{fmtRand(stats.cart_earnings)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 bg-purple-50 rounded-lg"><Banknote className="h-5 w-5 text-purple-600" /></div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Club Hire</p>
                <p className="text-xl font-bold text-purple-700">{fmtRand(stats.hire_earnings)}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Period Picker */}
      {(() => {
        const pill = (active: boolean) =>
          `px-3 py-1 rounded-full text-sm font-medium transition-colors cursor-pointer border ${
            active
              ? "bg-[#1a5c38] text-white border-[#1a5c38]"
              : "bg-background text-foreground border-border hover:bg-muted"
          }`;
        return (
          <div className="space-y-3">
            {/* Period tabs */}
            <div className="flex gap-1.5 flex-wrap">
              {PERIODS.map(p => (
                <button key={p.key} onClick={() => setPeriod(p.key)} className={pill(period === p.key)}>
                  {p.label}
                </button>
              ))}
            </div>

            {/* Today — no sub-picker */}

            {/* Week picker */}
            {period === "week" && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Week containing</span>
                <Input
                  type="date"
                  value={weekPickDate}
                  onChange={e => setWeekPickDate(e.target.value)}
                  className="w-40"
                />
              </div>
            )}

            {/* Month picker */}
            {period === "month" && (
              <div className="flex items-center gap-4 flex-wrap">
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Month</p>
                  <div className="flex gap-1 flex-wrap">
                    {MONTH_SHORT.map((m, i) => (
                      <button key={i} onClick={() => setSelectedMonth(i)} className={pill(selectedMonth === i)}>
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="w-px h-10 bg-border self-end" />
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Year</p>
                  <div className="flex gap-1">
                    {yearOptions.map(y => (
                      <button key={y} onClick={() => setSelectedMonthYear(y)} className={pill(selectedMonthYear === y)}>
                        {y}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Quarter picker */}
            {period === "quarter" && (
              <div className="flex items-center gap-4 flex-wrap">
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quarter</p>
                  <div className="flex gap-1">
                    {["Q1","Q2","Q3","Q4"].map((q, i) => (
                      <button key={i} onClick={() => setSelectedFQ(i)} className={pill(selectedFQ === i)}>
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="w-px h-10 bg-border self-end" />
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Year</p>
                  <div className="flex gap-1">
                    {yearOptions.map(y => (
                      <button key={y} onClick={() => setSelectedFQYear(y)} className={pill(selectedFQYear === y)}>
                        {y}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Year picker */}
            {period === "year" && (
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Year</p>
                <div className="flex gap-1">
                  {yearOptions.map(y => (
                    <button key={y} onClick={() => setSelectedFYear(y)} className={pill(selectedFYear === y)}>
                      {y}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Custom picker */}
            {period === "custom" && (
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <label className="text-sm text-muted-foreground whitespace-nowrap">From</label>
                  <Input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="w-36" />
                </div>
                <div className="flex items-center gap-1.5">
                  <label className="text-sm text-muted-foreground whitespace-nowrap">To</label>
                  <Input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="w-36" />
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Search / Status / Method filters */}
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
          <div className="grid grid-cols-[140px_1fr_100px_90px_120px_130px_110px_95px_85px_100px] gap-0 bg-muted/40 border-b text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <div className="px-4 py-3">Reference</div>
            <div className="px-4 py-3">Golfer</div>
            <div className="px-4 py-3">Tee Date</div>
            <div className="px-4 py-3">Time</div>
            <div className="px-4 py-3">Service</div>
            <div className="px-4 py-3">Paid On</div>
            <div className="px-4 py-3 text-right">Amount</div>
            <div className="px-4 py-3 text-right text-emerald-700">Club Earns</div>
            <div className="px-4 py-3 text-right text-amber-700">TapIn Fee</div>
            <div className="px-4 py-3 text-center">Status</div>
          </div>
          {/* Rows */}
          {filtered.slice(0, visibleCount).map(p => (
            <div
              key={p.id}
              className="grid grid-cols-[140px_1fr_100px_90px_120px_130px_110px_95px_85px_100px] gap-0 border-b last:border-b-0 hover:bg-muted/20 transition-colors cursor-pointer items-center"
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
              <div className="px-4 py-3 text-sm font-semibold text-right text-emerald-700">
                {p.payment_method === "prepaid" ? <span className="text-muted-foreground text-xs">prepaid</span> : fmtRand(p.club_amount ?? 0)}
              </div>
              <div className="px-4 py-3 text-sm font-semibold text-right text-amber-700">
                {p.payment_method === "prepaid" ? <span className="text-muted-foreground text-xs">—</span> : fmtRand(p.platform_fee ?? 0)}
              </div>
              <div className="px-4 py-3 text-center">
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${STATUS_COLORS[p.status] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
                  {p.status}
                </span>
              </div>
            </div>
          ))}
          {/* Lazy-load sentinel */}
          {visibleCount < filtered.length && (
            <div ref={sentinelRef} className="py-4 text-center text-sm text-muted-foreground">
              Loading more…
            </div>
          )}
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
                        {(() => {
                          const vat  = Math.round(selected.my_amount * vatPct / (100 + vatPct) * 100) / 100;
                          const excl = Math.round((selected.my_amount - vat) * 100) / 100;
                          return (
                            <>
                              <div className="flex justify-between text-muted-foreground text-xs pt-2 border-t">
                                <span>Subtotal (excl. VAT)</span>
                                <span>{fmtRand(excl)}</span>
                              </div>
                              <div className="flex justify-between text-muted-foreground text-xs">
                                <span>VAT ({vatPct}%)</span>
                                <span>{fmtRand(vat)}</span>
                              </div>
                              <div className="flex justify-between font-bold text-base pt-1 border-t">
                                <span>Total (incl. VAT)</span>
                                <span className="text-[#1a5c38]">{fmtRand(selected.my_amount)}</span>
                              </div>
                            </>
                          );
                        })()}
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <Button
                  className="flex-1 gap-2 bg-[#1a5c38] hover:bg-[#154d30]"
                  onClick={() => downloadInvoice(selected, club?.name ?? "TapIn Golf", vatPct)}
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


// --- Split Payments Sub-Tab ----------------------------------------------------

interface SplitPayment {
  id: number;
  booking_id: number;
  total_amount: string;
  tapin_fee: string;
  club_amount: string;
  players: number;
  club_merchant_id: string | null;
  status: "pending" | "completed" | "failed";
  created_at: string;
  updated_at: string;
  booking_ref: string;
  player_name: string;
  player_email: string;
}

const SPLIT_STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  completed: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-800",
};

export function SplitPaymentsContent() {
  const [payments, setPayments] = useState<SplitPayment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const limit = 25;

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (filter) params.set("status", filter);
    api<{ payments: SplitPayment[]; total: number }>(`/api/portal/split-payments?${params}`)
      .then((data) => {
        setPayments(data.payments);
        setTotal(data.total);
      })
      .finally(() => setLoading(false));
  }, [page, filter]);

  const totalPages = Math.ceil(total / limit);
  const totalTapIn = payments.reduce((s, p) => s + Number(p.tapin_fee), 0);
  const totalClub = payments.reduce((s, p) => s + Number(p.club_amount), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Banknote className="h-5 w-5" /> Split Payments
        </h2>
        <div className="flex gap-2">
          {["", "pending", "completed", "failed"].map((s) => (
            <Button
              key={s}
              size="sm"
              variant={filter === s ? "default" : "outline"}
              onClick={() => { setFilter(s); setPage(1); }}
            >
              {s || "All"}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-gray-500">TapIn Platform Fees</p>
            <p className="text-2xl font-bold text-emerald-700">R{totalTapIn.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-gray-500">Your Earnings</p>
            <p className="text-2xl font-bold">R{totalClub.toFixed(2)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : payments.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No split payments found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Booking</th>
                    <th className="px-3 py-2">Player</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="px-3 py-2 text-right">Platform Fee</th>
                    <th className="px-3 py-2 text-right">Your Earnings</th>
                    <th className="px-3 py-2 text-center">Players</th>
                    <th className="px-3 py-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((sp) => (
                    <tr key={sp.id} className="border-b hover:bg-gray-50">
                      <td className="px-3 py-2 whitespace-nowrap">
                        {format(new Date(sp.created_at), "dd MMM yyyy HH:mm")}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{sp.booking_ref}</td>
                      <td className="px-3 py-2">
                        <div>{sp.player_name}</div>
                        <div className="text-xs text-gray-400">{sp.player_email}</div>
                      </td>
                      <td className="px-3 py-2 text-right">R{Number(sp.total_amount).toFixed(2)}</td>
                      <td className="px-3 py-2 text-right text-gray-500">R{Number(sp.tapin_fee).toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-semibold">R{Number(sp.club_amount).toFixed(2)}</td>
                      <td className="px-3 py-2 text-center">{sp.players}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${SPLIT_STATUS_COLORS[sp.status] ?? ""}`}>
                          {sp.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <ChevronLeft className="h-4 w-4" /> Previous
              </Button>
              <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}