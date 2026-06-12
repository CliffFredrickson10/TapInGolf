import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useSearch } from "wouter";
import * as XLSX from "xlsx";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  BookOpen, Download, Search, X, Users, FileSpreadsheet,
  CheckCircle2, Clock, XCircle, CalendarDays, BadgeCheck,
  User, Mail, Phone, CreditCard, UserPlus,
} from "lucide-react";
import { format } from "date-fns";

interface Booking {
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
  guest_name: string;
  guest_email: string;
  guest_phone: string | null;
  booking_source: string | null;
  player_names: string[];
  date: string;
  time: string;
  tee_price: number;
  refund_processed_at: string | null;
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

function fmtRand(n: number) {
  return `R ${Number(n).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtMethod(m: string) {
  return METHOD_LABELS[m] ?? m;
}
function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  try { return format(new Date(d), "dd MMM yyyy"); } catch { return d; }
}
function fmtDateTime(d: string | null | undefined) {
  if (!d) return "—";
  try { return format(new Date(d), "dd MMM yyyy HH:mm"); } catch { return d; }
}

function DetailRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium mt-0.5">{value}</p>
      </div>
    </div>
  );
}

const ALL_EXPORT_FIELDS = [
  { key: "booking_ref",       label: "Reference" },
  { key: "guest_name",        label: "Golfer Name" },
  { key: "guest_email",       label: "Golfer Email" },
  { key: "guest_phone",       label: "Golfer Phone" },
  { key: "date",              label: "Tee Date" },
  { key: "time",              label: "Tee Time" },
  { key: "players",           label: "Players" },
  { key: "split_bill",        label: "Split Bill" },
  { key: "payment_method",    label: "Payment Method" },
  { key: "status",            label: "Status" },
  { key: "total_amount",      label: "Amount (R)" },
  { key: "voucher_code",      label: "Voucher Code" },
  { key: "booked_on",         label: "Booked On" },
  { key: "refund_processed",  label: "Refund Processed" },
] as const;
type ExportFieldKey = typeof ALL_EXPORT_FIELDS[number]["key"];

export default function Bookings() {
  const { toast } = useToast();
  const search = useSearch();

  const [bookings, setBookings]       = useState<Booking[]>([]);
  const [loading, setLoading]         = useState(true);
  const [detail, setDetail]           = useState<Booking | null>(null);
  const [markingRefund, setMarkingRefund] = useState(false);
  const [updating, setUpdating]       = useState<number | null>(null);

  const [q, setQ]                     = useState("");
  const [statusFilter, setStatus]     = useState(() => new URLSearchParams(search).get("status") ?? "all");
  const [methodFilter, setMethod]     = useState("all");
  const [fromDate, setFrom]           = useState("");
  const [toDate, setTo]               = useState("");

  const [exportOpen, setExportOpen]   = useState(false);
  const [exportFields, setExportFields] = useState<Set<ExportFieldKey>>(
    new Set(["booking_ref","guest_name","guest_email","date","time","players","payment_method","status","total_amount","booked_on"])
  );
  const toggleField = (k: ExportFieldKey) =>
    setExportFields(prev => { const s = new Set(prev); s.has(k) ? s.delete(k) : s.add(k); return s; });

  // Walk-in booking dialog
  interface TeeSlot { id: number; date: string; time: string; total_slots: number; active: boolean; }
  const [walkOpen, setWalkOpen]         = useState(false);
  const [walkDate, setWalkDate]         = useState(format(new Date(), "yyyy-MM-dd"));
  const [walkSlots, setWalkSlots]       = useState<TeeSlot[]>([]);
  const [walkSlotsLoading, setWalkSlotsLoading] = useState(false);
  const [walkSlotId, setWalkSlotId]     = useState("");
  const [walkPlayers, setWalkPlayers]   = useState("1");
  const [walkName, setWalkName]         = useState("");
  const [walkEmail, setWalkEmail]       = useState("");
  const [walkPhone, setWalkPhone]       = useState("");
  const [walkSaving, setWalkSaving]     = useState(false);

  const autoOpenedRef = useRef(false);

  // Handle ?action= and ?status= URL shortcuts
  useEffect(() => {
    const params = new URLSearchParams(search);
    const action = params.get("action");
    if (action === "export") setExportOpen(true);
    if (action === "new")    setWalkOpen(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch tee slots when walk-in dialog opens or date changes
  useEffect(() => {
    if (!walkOpen) return;
    setWalkSlotsLoading(true);
    setWalkSlotId("");
    api<TeeSlot[]>(`/api/portal/tee-times?from=${walkDate}&to=${walkDate}`)
      .then(d => setWalkSlots(d.filter((s: TeeSlot) => s.active)))
      .catch(() => setWalkSlots([]))
      .finally(() => setWalkSlotsLoading(false));
  }, [walkOpen, walkDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleWalkIn = async () => {
    if (!walkSlotId || !walkName.trim() || !walkPlayers) return;
    setWalkSaving(true);
    try {
      await api("/api/portal/counter-bookings", {
        method: "POST",
        body: JSON.stringify({
          tee_time_id: Number(walkSlotId),
          players: Number(walkPlayers),
          guest_name: walkName.trim(),
          guest_email: walkEmail.trim() || undefined,
          guest_phone: walkPhone.trim() || undefined,
        }),
      });
      toast({ title: "Walk-in booking created!" });
      setWalkOpen(false);
      setWalkName(""); setWalkEmail(""); setWalkPhone(""); setWalkSlotId(""); setWalkPlayers("1");
      load();
    } catch (e: any) {
      toast({ title: "Booking failed", description: e.message, variant: "destructive" });
    } finally { setWalkSaving(false); }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let url = "/api/portal/bookings?limit=500";
      if (statusFilter !== "all") url += `&status=${statusFilter}`;
      if (fromDate) url += `&from=${fromDate}`;
      if (toDate)   url += `&to=${toDate}`;
      const data = await api<Booking[]>(url);
      setBookings(data);
      if (!autoOpenedRef.current) {
        const params = new URLSearchParams(search);
        const targetId  = params.get("booking");
        const targetRef = params.get("ref");
        const found = targetId
          ? data.find(b => b.id === parseInt(targetId, 10))
          : targetRef
          ? data.find(b => b.booking_ref === targetRef)
          : null;
        if (found) { setDetail(found); autoOpenedRef.current = true; }
      }
    } catch (e: any) {
      toast({ title: "Error loading bookings", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [statusFilter, fromDate, toDate, search, toast]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let list = bookings;
    if (methodFilter !== "all") list = list.filter(b => b.payment_method === methodFilter);
    if (q.trim()) {
      const lq = q.trim().toLowerCase();
      list = list.filter(b =>
        b.booking_ref?.toLowerCase().includes(lq) ||
        b.guest_name?.toLowerCase().includes(lq) ||
        b.guest_email?.toLowerCase().includes(lq)
      );
    }
    return list;
  }, [bookings, methodFilter, q]);

  const stats = useMemo(() => ({
    total:     bookings.length,
    confirmed: bookings.filter(b => b.status === "confirmed" || b.status === "completed").length,
    pending:   bookings.filter(b => b.status === "pending").length,
    cancelled: bookings.filter(b => b.status === "cancelled").length,
  }), [bookings]);

  const clearFilters = () => { setQ(""); setStatus("all"); setMethod("all"); setFrom(""); setTo(""); };
  const hasFilters = q || statusFilter !== "all" || methodFilter !== "all" || fromDate || toDate;

  const markRefundProcessed = async () => {
    if (!detail) return;
    setMarkingRefund(true);
    try {
      await api(`/api/portal/bookings/${detail.id}/refund-processed`, { method: "PUT" });
      const updated = { ...detail, refund_processed_at: new Date().toISOString() };
      setDetail(updated);
      setBookings(prev => prev.map(b => b.id === detail.id ? updated : b));
      toast({ title: "Refund marked as processed" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setMarkingRefund(false); }
  };

  const updateStatus = async (id: number, status: string) => {
    setUpdating(id);
    try {
      await api(`/api/portal/bookings/${id}`, { method: "PUT", body: JSON.stringify({ status }) });
      const updated = bookings.map(b => b.id === id ? { ...b, status } : b);
      setBookings(updated);
      if (detail?.id === id) setDetail(d => d ? { ...d, status } : d);
      toast({ title: "Status updated" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setUpdating(null); }
  };

  const exportToExcel = () => {
    const ordered = ALL_EXPORT_FIELDS.filter(f => exportFields.has(f.key));
    const header = ordered.map(f => f.label);
    const rows = filtered.map(b => ordered.map(f => {
      if (f.key === "booked_on")        return fmtDateTime(b.created_at);
      if (f.key === "refund_processed") return b.refund_processed_at ? fmtDate(b.refund_processed_at) : "";
      if (f.key === "split_bill")       return b.split_bill ? "Yes" : "No";
      if (f.key === "payment_method")   return fmtMethod(b.payment_method);
      if (f.key === "total_amount")     return Number(b.total_amount);
      return (b as any)[f.key] ?? "";
    }));
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Bookings");
    const from = fromDate || "all";
    const to   = toDate   || "all";
    XLSX.writeFile(wb, `TapIn_Bookings_${from}_to_${to}.xlsx`);
    setExportOpen(false);
  };

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <BookOpen className="h-7 w-7 text-[#1a5c38]" />
          Bookings
        </h1>
        <p className="text-muted-foreground mt-1">
          All tee time bookings at your club — filter by status, date, or payment method and export to Excel.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg"><BookOpen className="h-5 w-5 text-blue-600" /></div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-green-50 rounded-lg"><CheckCircle2 className="h-5 w-5 text-green-600" /></div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Confirmed / Completed</p>
              <p className="text-2xl font-bold text-green-700">{stats.confirmed}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-yellow-50 rounded-lg"><Clock className="h-5 w-5 text-yellow-600" /></div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Pending</p>
              <p className="text-2xl font-bold text-yellow-700">{stats.pending}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-red-50 rounded-lg"><XCircle className="h-5 w-5 text-red-600" /></div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Cancelled</p>
              <p className="text-2xl font-bold text-red-700">{stats.cancelled}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48 max-w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search ref, name, email…" value={q} onChange={e => setQ(e.target.value)} className="pl-8" />
        </div>
        <Select value={statusFilter} onValueChange={setStatus}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={methodFilter} onValueChange={setMethod}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Payment method" /></SelectTrigger>
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
          variant="outline" size="sm"
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
          {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No bookings found</p>
            <p className="text-sm mt-1">Try adjusting your filters or date range.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border bg-white overflow-hidden">
          <div className="grid grid-cols-[140px_1fr_100px_80px_80px_150px_110px_130px_105px] gap-0 bg-muted/40 border-b text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <div className="px-4 py-3">Reference</div>
            <div className="px-4 py-3">Golfer</div>
            <div className="px-4 py-3">Tee Date</div>
            <div className="px-4 py-3">Time</div>
            <div className="px-4 py-3">Players</div>
            <div className="px-4 py-3">Booked</div>
            <div className="px-4 py-3 text-right">Amount</div>
            <div className="px-4 py-3">Method</div>
            <div className="px-4 py-3 text-center">Status</div>
          </div>
          {filtered.map(b => (
            <div
              key={b.id}
              className="grid grid-cols-[140px_1fr_100px_80px_80px_150px_110px_130px_105px] gap-0 border-b last:border-b-0 hover:bg-muted/20 transition-colors cursor-pointer items-center"
              onClick={() => setDetail(b)}
            >
              <div className="px-4 py-3">
                <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded font-semibold">{b.booking_ref}</code>
              </div>
              <div className="px-4 py-3 min-w-0">
                <p className="font-medium text-sm truncate">{b.guest_name}</p>
                <p className="text-xs text-muted-foreground truncate">{b.guest_email}</p>
              </div>
              <div className="px-4 py-3 text-sm">{b.date ? fmtDate(b.date) : "—"}</div>
              <div className="px-4 py-3 text-sm">{b.time ? String(b.time).slice(0, 5) : "—"}</div>
              <div className="px-4 py-3 text-sm">
                {b.players}
                {b.split_bill && <span className="ml-1 text-xs text-purple-600">split</span>}
              </div>
              <div className="px-4 py-3 text-sm">
                <span className="block">{fmtDate(b.created_at)}</span>
                <span className="text-xs text-muted-foreground">{b.created_at ? format(new Date(b.created_at), "HH:mm") : ""}</span>
              </div>
              <div className="px-4 py-3 text-sm font-semibold text-right">{fmtRand(b.total_amount)}</div>
              <div className="px-4 py-3 text-xs text-muted-foreground">{fmtMethod(b.payment_method)}</div>
              <div className="px-4 py-3 text-center">
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${STATUS_COLORS[b.status] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
                  {b.status}
                </span>
                {b.status === "cancelled" && b.refund_processed_at && (
                  <span className="block text-xs text-green-700 mt-0.5 flex items-center justify-center gap-0.5">
                    <BadgeCheck className="h-3 w-3 inline" /> refunded
                  </span>
                )}
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
              Export Bookings Report
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Select the columns to include in your Excel file.
            {filtered.length !== bookings.length
              ? ` Exporting ${filtered.length} filtered booking${filtered.length !== 1 ? "s" : ""}.`
              : ` Exporting all ${filtered.length} booking${filtered.length !== 1 ? "s" : ""}.`}
          </p>
          <div className="grid grid-cols-2 gap-2 py-2">
            {ALL_EXPORT_FIELDS.map(f => (
              <div key={f.key} className="flex items-center gap-2">
                <Checkbox id={`ef-${f.key}`} checked={exportFields.has(f.key)} onCheckedChange={() => toggleField(f.key)} />
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

      {/* Walk-in Booking Dialog */}
      <Dialog open={walkOpen} onOpenChange={v => { setWalkOpen(v); if (!v) { setWalkName(""); setWalkEmail(""); setWalkPhone(""); setWalkSlotId(""); setWalkPlayers("1"); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-[#1a5c38]" />
              Add Walk-in Booking
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <input
                type="date"
                value={walkDate}
                onChange={e => setWalkDate(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Tee Time</Label>
              {walkSlotsLoading ? (
                <div className="h-9 rounded-md bg-muted animate-pulse" />
              ) : walkSlots.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active tee times on this date.</p>
              ) : (
                <Select value={walkSlotId} onValueChange={setWalkSlotId}>
                  <SelectTrigger><SelectValue placeholder="Select a tee time…" /></SelectTrigger>
                  <SelectContent>
                    {walkSlots.map(s => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.time.slice(0, 5)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Players</Label>
              <Select value={walkPlayers} onValueChange={setWalkPlayers}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4].map(n => (
                    <SelectItem key={n} value={String(n)}>{n} player{n !== 1 ? "s" : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Guest Name <span className="text-destructive">*</span></Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  value={walkName}
                  onChange={e => setWalkName(e.target.value)}
                  placeholder="Full name"
                  className="flex h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Email <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="email"
                    value={walkEmail}
                    onChange={e => setWalkEmail(e.target.value)}
                    placeholder="email@example.com"
                    className="flex h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Phone <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="tel"
                    value={walkPhone}
                    onChange={e => setWalkPhone(e.target.value)}
                    placeholder="0XX XXX XXXX"
                    className="flex h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 flex-row justify-end pt-2">
            <Button variant="outline" onClick={() => setWalkOpen(false)}>Cancel</Button>
            <Button
              className="gap-2 bg-[#1a5c38] hover:bg-[#154d30]"
              onClick={handleWalkIn}
              disabled={walkSaving || !walkSlotId || !walkName.trim()}
            >
              <UserPlus className="h-4 w-4" />
              {walkSaving ? "Creating…" : "Create Booking"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Sheet */}
      <Sheet open={detail != null} onOpenChange={o => { if (!o) setDetail(null); }}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {detail && (
            <>
              <SheetHeader className="pb-4">
                <SheetTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-[#1a5c38]" />
                  Booking Detail
                  <code className="ml-1 text-sm font-mono bg-muted px-2 py-0.5 rounded">{detail.booking_ref}</code>
                </SheetTitle>
              </SheetHeader>

              <div className="space-y-5">
                {/* Status banner */}
                <div className={`rounded-lg border px-4 py-3 flex items-center justify-between gap-3 ${
                  detail.status === "cancelled" ? "bg-red-50/60 border-red-200" :
                  detail.status === "confirmed" ? "bg-green-50/60 border-green-200" :
                  detail.status === "completed" ? "bg-blue-50/60 border-blue-200" :
                  "bg-yellow-50/60 border-yellow-200"
                }`}>
                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    <span className={`text-sm font-bold uppercase ${
                      detail.status === "cancelled" ? "text-red-700" :
                      detail.status === "confirmed" ? "text-green-700" :
                      detail.status === "completed" ? "text-blue-700" :
                      "text-yellow-700"
                    }`}>{detail.status}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Amount</p>
                    <p className="text-sm font-bold">{fmtRand(detail.total_amount)}</p>
                  </div>
                </div>

                {/* Golfer info */}
                <div className="space-y-4">
                  <DetailRow icon={User} label="Golfer" value={detail.guest_name} />
                  {detail.guest_email && (
                    <DetailRow icon={Mail} label="Email" value={
                      <a href={`mailto:${detail.guest_email}`} className="text-[#1a5c38] underline underline-offset-2">{detail.guest_email}</a>
                    } />
                  )}
                  {detail.guest_phone && (
                    <DetailRow icon={Phone} label="Phone" value={
                      <a href={`tel:${detail.guest_phone}`} className="text-[#1a5c38] underline underline-offset-2">{detail.guest_phone}</a>
                    } />
                  )}
                  <DetailRow icon={CalendarDays} label="Tee Date" value={detail.date ? fmtDate(detail.date) : "—"} />
                  <DetailRow icon={CalendarDays} label="Tee Time" value={detail.time ? String(detail.time).slice(0, 5) : "—"} />
                  <DetailRow icon={Users} label="Players" value={`${detail.players} player${detail.players !== 1 ? "s" : ""}${detail.split_bill ? " · Split Bill" : ""}`} />
                  <DetailRow icon={CreditCard} label="Payment" value={`${fmtRand(detail.total_amount)} · ${fmtMethod(detail.payment_method)}`} />
                  {detail.voucher_code && (
                    <DetailRow icon={CreditCard} label="Voucher" value={detail.voucher_code} />
                  )}
                </div>

                <div className="rounded-lg border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
                  Booked on {fmtDateTime(detail.created_at)}
                  {detail.booking_source === "club_counter" && (
                    <span className="ml-2 text-purple-600 font-medium">· Counter booking</span>
                  )}
                </div>

                {/* Status actions */}
                {(detail.status === "pending" || detail.status === "confirmed") && (
                  <div className="pt-2 border-t space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Update Status</p>
                    <div className="flex gap-2">
                      {detail.status === "pending" && (
                        <Button
                          size="sm" className="flex-1 bg-green-600 hover:bg-green-700 gap-1.5"
                          disabled={updating === detail.id}
                          onClick={() => updateStatus(detail.id, "confirmed")}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />Confirm
                        </Button>
                      )}
                      {detail.status === "confirmed" && (
                        <Button
                          size="sm" variant="outline" className="flex-1 gap-1.5"
                          disabled={updating === detail.id}
                          onClick={() => updateStatus(detail.id, "completed")}
                        >
                          <BadgeCheck className="h-3.5 w-3.5" />Complete
                        </Button>
                      )}
                      <Button
                        size="sm" variant="outline" className="flex-1 text-destructive border-destructive/30 gap-1.5"
                        disabled={updating === detail.id}
                        onClick={() => updateStatus(detail.id, "cancelled")}
                      >
                        <XCircle className="h-3.5 w-3.5" />Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {/* Refund management for cancelled */}
                {detail.status === "cancelled" && (
                  <div className="pt-2 border-t">
                    {detail.refund_processed_at ? (
                      <div className="flex items-center gap-2 text-sm text-green-700 font-medium">
                        <BadgeCheck className="h-4 w-4" />
                        Refund processed · {fmtDate(detail.refund_processed_at)}
                      </div>
                    ) : (
                      <Button
                        className="w-full gap-2 bg-green-600 hover:bg-green-700"
                        onClick={markRefundProcessed}
                        disabled={markingRefund}
                      >
                        <BadgeCheck className="h-4 w-4" />
                        {markingRefund ? "Saving…" : "Mark Refund as Processed"}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
