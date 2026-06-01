import { useEffect, useState } from "react";
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
import { ChevronDown, ChevronRight, Send, Users, Ticket, CheckCircle2, Clock } from "lucide-react";

interface PreviewUser {
  id: number;
  name: string;
  email: string;
  booking_id: number;
  time: string;
}

interface Batch {
  id: number;
  reason: string;
  affected_date: string | null;
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

  // Issue form
  const [date, setDate]           = useState("");
  const [reason, setReason]       = useState("");
  const [value, setValue]         = useState("");
  const [expiryDays, setExpiryDays] = useState("365");
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview]     = useState<PreviewUser[] | null>(null);
  const [issuing, setIssuing]     = useState(false);

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
      const d = await api<{ count: number; users: PreviewUser[] }>(
        `/api/admin/cancellation-vouchers/preview?date=${date}`
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
    if (!date && (!preview || preview.length === 0)) {
      toast({ title: "Select a date and preview affected golfers first", variant: "destructive" });
      return;
    }
    if (preview !== null && preview.length === 0) {
      toast({ title: "No affected bookings found for this date", variant: "destructive" });
      return;
    }
    setIssuing(true);
    try {
      const body: Record<string, any> = { reason: reason.trim() };
      if (date) body.affected_date = date;
      if (value) body.value_rands = parseFloat(value);
      if (expiryDays) body.expires_in_days = parseInt(expiryDays, 10);

      const result = await api<{ success: boolean; voucher_count: number; batch_id: number }>(
        "/api/admin/cancellation-vouchers/issue",
        { method: "POST", body: JSON.stringify(body) }
      );
      toast({ title: `${result.voucher_count} voucher${result.voucher_count !== 1 ? "s" : ""} issued`, description: "Golfers have been notified via in-app notification." });
      setDate(""); setReason(""); setValue(""); setPreview(null);
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

  return (
    <div className="p-8 space-y-8 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Cancellation Vouchers</h1>
        <p className="text-muted-foreground mt-1">
          Issue unique voucher codes to golfers affected by a cancellation (e.g. flooding, maintenance).
          Each golfer receives their own code stored on their profile and delivered via in-app notification.
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
              <Label>Voucher Value (R)</Label>
              <Input
                type="number"
                min="0"
                step="50"
                value={value}
                onChange={e => setValue(e.target.value)}
                placeholder="e.g. 350 — leave blank for no fixed value"
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Reason for Cancellation *</Label>
              <Input
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="e.g. Course flooded due to heavy rainfall — all tee times cancelled"
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
              <p className="text-xs text-muted-foreground">Number of days before the voucher expires</p>
            </div>
          </div>

          {/* Preview step */}
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

          {/* Preview list */}
          {preview !== null && (
            <div className="rounded-lg border bg-muted/40 overflow-hidden">
              {preview.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground text-center">
                  No confirmed or pending bookings found for {date}.
                </div>
              ) : (
                <>
                  <div className="px-4 py-2.5 border-b bg-background text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Users className="h-3.5 w-3.5" />
                    {preview.length} golfer{preview.length !== 1 ? "s" : ""} will receive a unique voucher
                  </div>
                  <div className="divide-y max-h-48 overflow-y-auto">
                    {preview.map(u => (
                      <div key={u.id} className="px-4 py-2.5 flex items-center justify-between text-sm">
                        <div>
                          <span className="font-medium">{u.name}</span>
                          <span className="text-muted-foreground ml-2">{u.email}</span>
                        </div>
                        {u.time && <span className="text-xs text-muted-foreground">{u.time}</span>}
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
                        {b.value_rands && (
                          <Badge variant="outline" className="text-xs">R{Number(b.value_rands).toFixed(2)}</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Ticket className="h-3 w-3" />
                          {b.voucher_count} issued
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
