import { useEffect, useState } from "react";
import { useSearch, useLocation } from "wouter";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import {
  Plus, Pencil, Trash2,
  Ticket, TicketX, Send, Users, CheckCircle2, Clock, Info, ChevronDown, ChevronRight,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DiscountVoucher {
  id: number; code: string; discount_type: string; discount_value: number;
  min_amount: number | null; max_uses: number | null; uses_count: number;
  active: boolean; expires_at: string | null; created_at: string;
}

interface PreviewUser {
  id: number; name: string; email: string;
  booking_id: number; voucher_value: number | null; payment_method: string | null; time: string;
}

interface Batch {
  id: number; reason: string; affected_date: string | null; from_time: string | null; to_time: string | null;
  value_rands: string | null; expires_at: string | null;
  voucher_count: number; redeemed_count: number | string;
  created_at: string; issued_by_name: string;
}

interface BatchVoucher {
  id: number; code: string; value_rands: string | null;
  redeemed_at: string | null; expires_at: string | null;
  user_name: string; user_email: string;
}

// ─── Discount Vouchers tab ────────────────────────────────────────────────────

const EMPTY_FORM = {
  code: "", discount_type: "percentage", discount_value: 10,
  min_amount: "" as any, max_uses: "" as any, expires_at: "",
};

function generateCode() {
  return `GOLF${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function DiscountVouchersTab() {
  const { toast } = useToast();
  const [vouchers, setVouchers] = useState<DiscountVoucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = () =>
    api<DiscountVoucher[]>("/api/portal/vouchers")
      .then(setVouchers)
      .catch(e => toast({ title: "Error", description: e.message, variant: "destructive" }))
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const openAdd = () => { setForm({ ...EMPTY_FORM, code: generateCode() }); setEditId(null); setOpen(true); };
  const openEdit = (v: DiscountVoucher) => {
    setForm({
      code: v.code, discount_type: v.discount_type, discount_value: v.discount_value,
      min_amount: v.min_amount ?? "", max_uses: v.max_uses ?? "",
      expires_at: v.expires_at ? v.expires_at.split("T")[0] : "",
    });
    setEditId(v.id); setOpen(true);
  };

  const handleSave = async () => {
    if (!form.code || !form.discount_value) {
      toast({ title: "Code and discount value required", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const body = {
        ...form,
        min_amount:  form.min_amount  === "" ? null : Number(form.min_amount),
        max_uses:    form.max_uses    === "" ? null : Number(form.max_uses),
        expires_at:  form.expires_at  || null,
      };
      if (editId) await api(`/api/portal/vouchers/${editId}`, { method: "PUT", body: JSON.stringify(body) });
      else        await api("/api/portal/vouchers",             { method: "POST", body: JSON.stringify(body) });
      toast({ title: editId ? "Voucher updated" : "Voucher created" });
      setOpen(false); load();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this voucher?")) return;
    try {
      await api(`/api/portal/vouchers/${id}`, { method: "DELETE" });
      setVouchers(v => v.filter(x => x.id !== id));
      toast({ title: "Deleted" });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const handleToggle = async (v: DiscountVoucher) => {
    try {
      await api(`/api/portal/vouchers/${v.id}`, { method: "PUT", body: JSON.stringify({ active: !v.active }) });
      setVouchers(prev => prev.map(x => x.id === v.id ? { ...x, active: !x.active } : x));
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">Create reusable discount codes golfers apply at checkout.</p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#1a5c38] hover:bg-[#164d30] gap-2" onClick={openAdd}>
              <Plus className="h-4 w-4" /> New Voucher
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{editId ? "Edit" : "New"} Voucher</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label>Voucher Code *</Label>
                <div className="flex gap-2">
                  <Input
                    value={form.code}
                    onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                    placeholder="GOLF2026" className="font-mono" disabled={!!editId}
                  />
                  {!editId && (
                    <Button variant="outline" type="button" onClick={() => setForm(f => ({ ...f, code: generateCode() }))}>
                      Random
                    </Button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Discount Type</Label>
                  <Select value={form.discount_type} onValueChange={v => setForm(f => ({ ...f, discount_type: v }))} disabled={!!editId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Percentage (%)</SelectItem>
                      <SelectItem value="fixed">Fixed Amount (R)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Discount Value {form.discount_type === "percentage" ? "(%)" : "(ZAR)"}</Label>
                  <Input type="number" value={form.discount_value} onChange={e => setForm(f => ({ ...f, discount_value: Number(e.target.value) }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Min Booking Amount (R)</Label>
                  <Input type="number" value={form.min_amount} onChange={e => setForm(f => ({ ...f, min_amount: e.target.value }))} placeholder="Optional" />
                </div>
                <div className="space-y-1.5">
                  <Label>Max Uses</Label>
                  <Input type="number" value={form.max_uses} onChange={e => setForm(f => ({ ...f, max_uses: e.target.value }))} placeholder="Unlimited" />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label>Expires On</Label>
                  <Input type="date" value={form.expires_at} onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))} />
                </div>
              </div>
              <Button className="w-full bg-[#1a5c38] hover:bg-[#164d30]" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : editId ? "Update" : "Create"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? <Skeleton className="h-48 w-full" /> : (
        vouchers.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No vouchers yet. Create discount codes to attract golfers.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {vouchers.map(v => (
              <Card key={v.id} className={!v.active ? "opacity-60" : ""}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <code className="text-lg font-bold font-mono tracking-widest">{v.code}</code>
                      <p className="text-sm text-muted-foreground">
                        {v.discount_type === "percentage" ? `${v.discount_value}% off` : `R${v.discount_value} off`}
                        {v.min_amount ? ` · min R${v.min_amount}` : ""}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${v.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {v.active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>Used: {v.uses_count}{v.max_uses ? ` / ${v.max_uses}` : ""}</span>
                    {v.expires_at && <span>Expires: {format(new Date(v.expires_at), "dd MMM yyyy")}</span>}
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <Switch checked={v.active} onCheckedChange={() => handleToggle(v)} />
                    <span className="text-xs text-muted-foreground flex-1">Active</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(v)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(v.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      )}
    </div>
  );
}

// ─── Cancellation Vouchers tab ────────────────────────────────────────────────

function CancellationVouchersTab({
  urlDate, urlFromTime, urlToTime, onIssued,
}: { urlDate: string; urlFromTime: string; urlToTime: string; onIssued: () => void }) {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [date, setDate]           = useState(urlDate);
  const [fromTime, setFromTime]   = useState(urlFromTime);
  const [toTime, setToTime]       = useState(urlToTime);
  const [reason, setReason]       = useState("");
  const [expiryDays, setExpiryDays] = useState("365");
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview]     = useState<PreviewUser[] | null>(null);
  const [issuing, setIssuing]     = useState(false);

  useEffect(() => {
    if (urlDate)     setDate(urlDate);
    if (urlFromTime) setFromTime(urlFromTime);
    if (urlToTime)   setToTime(urlToTime);
  }, [urlDate, urlFromTime, urlToTime]);

  const [batches, setBatches]     = useState<Batch[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(true);
  const [expanded, setExpanded]   = useState<number | null>(null);
  const [batchDetail, setBatchDetail] = useState<Record<number, BatchVoucher[]>>({});
  const [loadingDetail, setLoadingDetail] = useState<number | null>(null);

  const loadBatches = () => {
    setLoadingBatches(true);
    api<{ batches: Batch[] }>("/api/admin/cancellation-vouchers/batches")
      .then(d => setBatches(d.batches))
      .catch(e => toast({ title: "Error", description: e.message, variant: "destructive" }))
      .finally(() => setLoadingBatches(false));
  };

  useEffect(() => { loadBatches(); }, []);

  const handlePreview = async () => {
    if (!date) { toast({ title: "Select a date first", variant: "destructive" }); return; }
    setPreviewing(true); setPreview(null);
    try {
      const qs = new URLSearchParams({ date });
      if (fromTime) qs.set("from_time", fromTime);
      if (toTime)   qs.set("to_time",   toTime);
      const d = await api<{ count: number; users: PreviewUser[] }>(
        `/api/admin/cancellation-vouchers/preview?${qs}`
      );
      setPreview(d.users);
    } catch (e: any) {
      toast({ title: "Preview failed", description: e.message, variant: "destructive" });
    } finally { setPreviewing(false); }
  };

  const handleIssue = async () => {
    if (!reason.trim()) { toast({ title: "Reason is required", variant: "destructive" }); return; }
    if (!date)          { toast({ title: "Select a date first", variant: "destructive" }); return; }
    if (preview !== null && preview.length === 0) {
      toast({ title: "No affected bookings found", variant: "destructive" }); return;
    }
    setIssuing(true);
    try {
      const body: Record<string, any> = { reason: reason.trim(), affected_date: date };
      if (fromTime)   body.from_time       = fromTime;
      if (toTime)     body.to_time         = toTime;
      if (expiryDays) body.expires_in_days = parseInt(expiryDays, 10);

      const result = await api<{ success: boolean; voucher_count: number; batch_id: number }>(
        "/api/admin/cancellation-vouchers/issue",
        { method: "POST", body: JSON.stringify(body) }
      );
      toast({
        title: `${result.voucher_count} voucher${result.voucher_count !== 1 ? "s" : ""} issued`,
        description: "Each golfer receives a voucher equal to their booking amount via in-app notification.",
      });
      setDate(""); setFromTime(""); setToTime(""); setReason(""); setPreview(null);
      navigate("/vouchers?tab=cancellation", { replace: true });
      loadBatches();
      onIssued();
    } catch (e: any) {
      toast({ title: "Failed to issue vouchers", description: e.message, variant: "destructive" });
    } finally { setIssuing(false); }
  };

  const toggleBatch = async (batchId: number) => {
    if (expanded === batchId) { setExpanded(null); return; }
    setExpanded(batchId);
    if (batchDetail[batchId]) return;
    setLoadingDetail(batchId);
    try {
      const d = await api<{ vouchers: BatchVoucher[] }>(`/api/admin/cancellation-vouchers/batches/${batchId}`);
      setBatchDetail(prev => ({ ...prev, [batchId]: d.vouchers }));
    } catch (e: any) {
      toast({ title: "Error loading batch", description: e.message, variant: "destructive" });
    } finally { setLoadingDetail(null); }
  };

  const previewByTime = preview
    ? Object.entries(
        preview.reduce<Record<string, PreviewUser[]>>((acc, u) => {
          const key = u.time || "—";
          if (!acc[key]) acc[key] = [];
          acc[key].push(u);
          return acc;
        }, {})
      ).sort(([a], [b]) => a.localeCompare(b))
    : null;

  const totalVoucherValue = preview?.reduce((s, u) => s + (u.payment_method !== "prepaid" ? (u.voucher_value ?? 0) : 0), 0) ?? 0;
  const prepaidCount      = preview?.filter(u => u.payment_method === "prepaid").length ?? 0;

  return (
    <div className="space-y-8">
      {/* Issue form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Send className="h-5 w-5 text-[#1a5c38]" />
            Issue New Vouchers
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Affected Date *</Label>
              <Input
                type="date" value={date}
                onChange={e => { setDate(e.target.value); setPreview(null); }}
              />
              <p className="text-xs text-muted-foreground">The date of the cancelled tee times</p>
            </div>

            <div className="space-y-1.5">
              <Label>From Tee Time (optional)</Label>
              <Input
                type="time" value={fromTime}
                onChange={e => { setFromTime(e.target.value); setPreview(null); }}
              />
              <p className="text-xs text-muted-foreground">
                Only affect bookings at or after this time
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>To Tee Time (optional)</Label>
              <Input
                type="time" value={toTime}
                onChange={e => { setToTime(e.target.value); setPreview(null); }}
              />
              <p className="text-xs text-muted-foreground">
                Only affect bookings up to and including this time (e.g. 12:00 if only the morning is cancelled)
              </p>
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <Label>Reason for Cancellation *</Label>
              <Input
                value={reason} onChange={e => setReason(e.target.value)}
                placeholder="e.g. Course flooded due to heavy rainfall — afternoon tee times cancelled"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Voucher Valid For (days)</Label>
              <Input
                type="number" min="1" value={expiryDays}
                onChange={e => setExpiryDays(e.target.value)} placeholder="365"
              />
              <p className="text-xs text-muted-foreground">Number of days before vouchers expire</p>
            </div>

            <div className="flex items-end pb-0.5">
              <div className="rounded-lg border border-[#1a5c38]/20 bg-[#1a5c38]/5 px-4 py-3 text-sm text-[#1a5c38] w-full">
                <div className="flex items-center gap-2 font-medium mb-0.5">
                  <Info className="h-4 w-4 flex-shrink-0" />
                  Auto-calculated values
                </div>
                <p className="text-xs text-[#1a5c38]/80 leading-relaxed">
                  Each golfer receives a voucher worth exactly what they paid —
                  full amount for non-split bookings, their individual share for split-bill bookings.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 items-start">
            <Button variant="outline" onClick={handlePreview} disabled={!date || previewing} className="gap-2">
              <Users className="h-4 w-4" />
              {previewing ? "Loading…" : "Preview Affected Golfers"}
            </Button>
            {preview !== null && (
              <Button
                className="bg-[#1a5c38] hover:bg-[#164d30] gap-2"
                onClick={handleIssue} disabled={issuing || preview.length === 0}
              >
                <TicketX className="h-4 w-4" />
                {issuing ? "Issuing…" : preview.length === 0 ? "No affected golfers" : `Issue ${preview.length} Voucher${preview.length !== 1 ? "s" : ""}`}
              </Button>
            )}
          </div>

          {previewByTime !== null && (
            <div className="rounded-lg border bg-muted/40 overflow-hidden">
              {preview!.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground text-center">
                  No confirmed or pending bookings found for {date}{fromTime ? ` from ${fromTime}` : ""}{toTime ? ` to ${toTime}` : ""}.
                </div>
              ) : (
                <>
                  <div className="px-4 py-2.5 border-b bg-background text-sm font-medium text-muted-foreground flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Users className="h-3.5 w-3.5" />
                      {preview!.length} golfer{preview!.length !== 1 ? "s" : ""} will receive a voucher
                      {fromTime && <Badge variant="secondary" className="text-xs">from {fromTime}</Badge>}
                      {toTime   && <Badge variant="secondary" className="text-xs">to {toTime}</Badge>}
                    </span>
                    <div className="flex items-center gap-2">
                      {totalVoucherValue > 0 && (
                        <span className="text-xs font-semibold text-[#1a5c38]">R{totalVoucherValue.toFixed(2)} in vouchers</span>
                      )}
                      {prepaidCount > 0 && (
                        <span className="text-xs font-medium text-amber-700">{prepaidCount} round{prepaidCount !== 1 ? "s" : ""} returned</span>
                      )}
                    </div>
                  </div>
                  <div className="divide-y max-h-72 overflow-y-auto">
                    {previewByTime.map(([time, users]) => (
                      <div key={time}>
                        <div className="px-4 py-1.5 bg-muted/60 text-xs font-semibold text-muted-foreground tracking-wide">
                          Tee time {time}
                        </div>
                        {users.map(u => (
                          <div key={`${u.id}-${u.booking_id}`} className="px-4 py-2.5 flex items-center justify-between text-sm border-t border-muted/40 first:border-0">
                            <div>
                              <span className="font-medium">{u.name}</span>
                              <span className="text-muted-foreground ml-2 text-xs">{u.email}</span>
                            </div>
                            {u.payment_method === "prepaid" ? (
                              <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                                Round returned
                              </span>
                            ) : (
                              <span className="font-semibold text-[#1a5c38] text-sm">
                                {u.voucher_value != null ? `R${u.voucher_value.toFixed(2)}` : "—"}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* History */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Voucher History</h2>
        {loadingBatches ? (
          <div className="space-y-2">{[1, 2].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
        ) : batches.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground text-sm">
              No batches yet. Issue your first cancellation vouchers above.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {batches.map(b => {
              const redeemedCount = Number(b.redeemed_count ?? 0);
              const isExpanded = expanded === b.id;
              return (
                <Card key={b.id} className="overflow-hidden">
                  <button
                    className="w-full text-left p-4 flex items-start gap-4 hover:bg-muted/30 transition-colors"
                    onClick={() => toggleBatch(b.id)}
                  >
                    <div className="mt-0.5 text-muted-foreground">
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center flex-wrap gap-2">
                        <span className="font-semibold text-sm truncate">{b.reason}</span>
                        {b.affected_date && (
                          <Badge variant="secondary" className="text-xs">
                            {format(new Date(b.affected_date), "dd MMM yyyy")}
                          </Badge>
                        )}
                        {b.from_time && (
                          <Badge variant="outline" className="text-xs text-amber-700 border-amber-300 bg-amber-50">
                            from {String(b.from_time).slice(0, 5)}
                          </Badge>
                        )}
                        {b.to_time && (
                          <Badge variant="outline" className="text-xs text-amber-700 border-amber-300 bg-amber-50">
                            to {String(b.to_time).slice(0, 5)}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <TicketX className="h-3 w-3" />
                          {b.voucher_count} issued (per-player value)
                        </span>
                        {redeemedCount > 0 && (
                          <span className="flex items-center gap-1 text-green-700">
                            <CheckCircle2 className="h-3 w-3" /> {redeemedCount} redeemed
                          </span>
                        )}
                        {b.expires_at && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" /> Expires {format(new Date(b.expires_at), "dd MMM yyyy")}
                          </span>
                        )}
                        <span>by {b.issued_by_name} · {format(new Date(b.created_at), "dd MMM yyyy HH:mm")}</span>
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t">
                      {loadingDetail === b.id ? (
                        <div className="p-4"><Skeleton className="h-20 w-full" /></div>
                      ) : (batchDetail[b.id] ?? []).length === 0 ? (
                        <div className="p-4 text-sm text-muted-foreground text-center">No vouchers in this batch.</div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                                <th className="text-left px-4 py-2 font-medium">Golfer</th>
                                <th className="text-left px-4 py-2 font-medium">Code</th>
                                <th className="text-left px-4 py-2 font-medium">Value</th>
                                <th className="text-left px-4 py-2 font-medium">Status</th>
                                <th className="text-left px-4 py-2 font-medium">Expires</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {(batchDetail[b.id] ?? []).map(v => (
                                <tr key={v.id} className="hover:bg-muted/20">
                                  <td className="px-4 py-2.5">
                                    <div className="font-medium">{v.user_name}</div>
                                    <div className="text-xs text-muted-foreground">{v.user_email}</div>
                                  </td>
                                  <td className="px-4 py-2.5">
                                    <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded tracking-wide">{v.code}</code>
                                  </td>
                                  <td className="px-4 py-2.5 font-semibold text-[#1a5c38] text-xs">
                                    {v.value_rands ? `R${Number(v.value_rands).toFixed(2)}` : "—"}
                                  </td>
                                  <td className="px-4 py-2.5">
                                    {v.redeemed_at ? (
                                      <span className="inline-flex items-center gap-1 text-xs text-green-700 font-medium">
                                        <CheckCircle2 className="h-3 w-3" />
                                        Redeemed {format(new Date(v.redeemed_at), "dd MMM")}
                                      </span>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">Active</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                                    {v.expires_at ? format(new Date(v.expires_at), "dd MMM yyyy") : "—"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Combined page ────────────────────────────────────────────────────────────

export default function Vouchers() {
  const search    = useSearch();
  const [, navigate] = useLocation();
  const params    = new URLSearchParams(search);
  const tabParam  = params.get("tab");
  const urlDate     = params.get("date")      ?? "";
  const urlFromTime = params.get("from_time") ?? "";
  const urlToTime   = params.get("to_time")   ?? "";

  const activeTab = tabParam === "cancellation" ? "cancellation" : "discount";

  const switchTab = (tab: string) => {
    navigate(tab === "cancellation" ? "/vouchers?tab=cancellation" : "/vouchers", { replace: true });
  };

  return (
    <div className="p-8 max-w-4xl space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Vouchers</h1>
        <p className="text-muted-foreground mt-1">
          Manage discount codes and issue cancellation vouchers to affected golfers.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b">
        <button
          onClick={() => switchTab("discount")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "discount"
              ? "border-[#1a5c38] text-[#1a5c38]"
              : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/40"
          }`}
        >
          <Ticket className="h-4 w-4" />
          Discount Codes
        </button>
        <button
          onClick={() => switchTab("cancellation")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "cancellation"
              ? "border-[#1a5c38] text-[#1a5c38]"
              : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/40"
          }`}
        >
          <TicketX className="h-4 w-4" />
          Cancellation Vouchers
        </button>
      </div>

      {/* Tab content */}
      {activeTab === "discount" ? (
        <DiscountVouchersTab />
      ) : (
        <CancellationVouchersTab
          urlDate={urlDate}
          urlFromTime={urlFromTime}
          urlToTime={urlToTime}
          onIssued={() => {}}
        />
      )}
    </div>
  );
}
