import { useEffect, useState } from "react";
import { useSearch, useLocation } from "wouter";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ChevronDown, ChevronRight, Send, Users, Ticket, CheckCircle2, Clock, Info } from "lucide-react";

interface PreviewUser {
  id: number;
  name: string;
  email: string;
  booking_id: number;
  voucher_value: number | null;
  time: string;
}

interface Batch {
  id: number;
  reason: string;
  affected_date: string | null;
  from_time: string | null;
  value_rands: string | null;
  expires_at: string | null;
  voucher_count: number;
  redeemed_count: number | string;
  created_at: string;
  issued_by_name: string;
}

interface BatchVoucher {
  id: number;
  code: string;
  value_rands: string | null;
  redeemed_at: string | null;
  expires_at: string | null;
  user_name: string;
  user_email: string;
}

export default function CancellationVouchers() {
  const { toast } = useToast();
  const { club } = useAuth();
  const search = useSearch();
  const [, navigate] = useLocation();

  // Read pre-filled values from URL (e.g. from Schedule page link)
  const params    = new URLSearchParams(search);
  const urlDate   = params.get("date")      ?? "";
  const urlFromTime = params.get("from_time") ?? "";

  // Issue form
  const [date, setDate]           = useState(urlDate);
  const [fromTime, setFromTime]   = useState(urlFromTime);
  const [reason, setReason]       = useState("");
  const [expiryDays, setExpiryDays] = useState("365");
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview]     = useState<PreviewUser[] | null>(null);
  const [issuing, setIssuing]     = useState(false);

  // Sync URL params → state when they change (e.g. navigating from Schedule)
  useEffect(() => {
    if (urlDate) setDate(urlDate);
    if (urlFromTime) setFromTime(urlFromTime);
  }, [urlDate, urlFromTime]);

  // History
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
    setPreviewing(true);
    setPreview(null);
    try {
      const qs = new URLSearchParams({ date });
      if (fromTime) qs.set("from_time", fromTime);
      const d = await api<{ count: number; users: PreviewUser[] }>(
        `/api/admin/cancellation-vouchers/preview?${qs}`
      );
      setPreview(d.users);
    } catch (e: any) {
      toast({ title: "Preview failed", description: e.message, variant: "destructive" });
    } finally {
      setPreviewing(false);
    }
  };

  const handleIssue = async () => {
    if (!reason.trim()) { toast({ title: "Reason is required", variant: "destructive" }); return; }
    if (!date) {
      toast({ title: "Select a date first", variant: "destructive" });
      return;
    }
    if (preview !== null && preview.length === 0) {
      toast({ title: "No affected bookings found for this date", variant: "destructive" });
      return;
    }
    setIssuing(true);
    try {
      const body: Record<string, any> = {
        reason:        reason.trim(),
        affected_date: date,
      };
      if (fromTime)   body.from_time      = fromTime;
      if (expiryDays) body.expires_in_days = parseInt(expiryDays, 10);

      const result = await api<{ success: boolean; voucher_count: number; batch_id: number }>(
        "/api/admin/cancellation-vouchers/issue",
        { method: "POST", body: JSON.stringify(body) }
      );
      toast({
        title: `${result.voucher_count} voucher${result.voucher_count !== 1 ? "s" : ""} issued`,
        description: "Each golfer receives a voucher equal to their booking amount via in-app notification.",
      });
      setDate(""); setFromTime(""); setReason(""); setPreview(null);
      // Strip URL params so the form doesn't re-fill on reload
      navigate("/cancellation-vouchers", { replace: true });
      loadBatches();
    } catch (e: any) {
      toast({ title: "Failed to issue vouchers", description: e.message, variant: "destructive" });
    } finally {
      setIssuing(false);
    }
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
    } finally {
      setLoadingDetail(null);
    }
  };

  // Group preview rows by tee time
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

  const totalVoucherValue = preview?.reduce((s, u) => s + (u.voucher_value ?? 0), 0) ?? 0;

  return (
    <div className="p-8 space-y-8 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Cancellation Vouchers</h1>
        <p className="text-muted-foreground mt-1">
          Issue vouchers to affected golfers. Voucher value is automatically set to what each player paid.
          Linked directly to your Tee Schedule bookings.
        </p>
      </div>

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
                type="date"
                value={date}
                onChange={e => { setDate(e.target.value); setPreview(null); }}
              />
              <p className="text-xs text-muted-foreground">The date of the cancelled tee times</p>
            </div>

            <div className="space-y-1.5">
              <Label>From Tee Time (optional)</Label>
              <Input
                type="time"
                value={fromTime}
                onChange={e => { setFromTime(e.target.value); setPreview(null); }}
                placeholder="Leave blank for all tee times"
              />
              <p className="text-xs text-muted-foreground">
                Only affect bookings at or after this time (e.g. 11:00 if only afternoon is flooded)
              </p>
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <Label>Reason for Cancellation *</Label>
              <Input
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="e.g. Course flooded due to heavy rainfall — afternoon tee times cancelled"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Voucher Valid For (days)</Label>
              <Input
                type="number"
                min="1"
                value={expiryDays}
                onChange={e => setExpiryDays(e.target.value)}
                placeholder="365"
              />
              <p className="text-xs text-muted-foreground">Number of days before vouchers expire</p>
            </div>

            <div className="flex items-end pb-0.5">
              <div className="rounded-lg border border-[#1a5c38]/20 bg-[#1a5c38]/5 px-4 py-3 text-sm text-[#1a5c38] w-full">
                <div className="flex items-center gap-2 font-medium mb-0.5">
                  <Info className="h-4 w-4 flex-shrink-0" />
                  Auto-calculated voucher values
                </div>
                <p className="text-xs text-[#1a5c38]/80 leading-relaxed">
                  Each golfer receives a voucher worth exactly what they paid —
                  full amount for non-split bookings, their share for split-bill bookings.
                </p>
              </div>
            </div>
          </div>

          {/* Preview / Issue actions */}
          <div className="flex flex-wrap gap-3 items-start">
            <Button
              variant="outline"
              onClick={handlePreview}
              disabled={!date || previewing}
              className="gap-2"
            >
              <Users className="h-4 w-4" />
              {previewing ? "Loading…" : "Preview Affected Golfers"}
            </Button>

            {preview !== null && (
              <Button
                className="bg-[#1a5c38] hover:bg-[#164d30] gap-2"
                onClick={handleIssue}
                disabled={issuing || preview.length === 0}
              >
                <Ticket className="h-4 w-4" />
                {issuing
                  ? "Issuing…"
                  : preview.length === 0
                    ? "No affected golfers"
                    : `Issue ${preview.length} Voucher${preview.length !== 1 ? "s" : ""}`}
              </Button>
            )}
          </div>

          {/* Preview list — grouped by tee time */}
          {previewByTime !== null && (
            <div className="rounded-lg border bg-muted/40 overflow-hidden">
              {preview!.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground text-center">
                  No confirmed or pending bookings found for {date}
                  {fromTime ? ` from ${fromTime} onwards` : ""}.
                </div>
              ) : (
                <>
                  <div className="px-4 py-2.5 border-b bg-background text-sm font-medium text-muted-foreground flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Users className="h-3.5 w-3.5" />
                      {preview!.length} golfer{preview!.length !== 1 ? "s" : ""} will receive a voucher
                      {fromTime && (
                        <Badge variant="secondary" className="text-xs">
                          from {fromTime}
                        </Badge>
                      )}
                    </span>
                    {totalVoucherValue > 0 && (
                      <span className="text-xs font-semibold text-[#1a5c38]">
                        Total value: R{totalVoucherValue.toFixed(2)}
                      </span>
                    )}
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
                            <span className="font-semibold text-[#1a5c38] text-sm">
                              {u.voucher_value != null ? `R${u.voucher_value.toFixed(2)}` : "—"}
                            </span>
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
        <h2 className="text-xl font-semibold">Voucher History</h2>

        {loadingBatches ? (
          <div className="space-y-2">
            {[1, 2].map(i => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : batches.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground text-sm">
              No voucher batches yet. Issue your first batch above.
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
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Ticket className="h-3 w-3" />
                          {b.voucher_count} issued (per-player value)
                        </span>
                        {redeemedCount > 0 && (
                          <span className="flex items-center gap-1 text-green-700">
                            <CheckCircle2 className="h-3 w-3" />
                            {redeemedCount} redeemed
                          </span>
                        )}
                        {b.expires_at && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Expires {format(new Date(b.expires_at), "dd MMM yyyy")}
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
                                <th className="text-left px-4 py-2 font-medium">Voucher Code</th>
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
                                    <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded tracking-wide">
                                      {v.code}
                                    </code>
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
