import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useReportsPending } from "@/context/ReportsPendingContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ShieldAlert, Check, X } from "lucide-react";
import { format } from "date-fns";

interface ReportRow {
  id: number;
  reporter_id: number;
  reported_user_id: number;
  conversation_id: number | null;
  message_id: number | null;
  reported_excerpt: string | null;
  reason: string;
  note: string | null;
  status: string;
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
  reporter_name: string;
  reporter_email: string;
  reported_name: string;
  reported_email: string;
  reviewer_name: string | null;
}
interface ContextMessage {
  id: number;
  sender_id: number;
  sender_name: string;
  content: string;
  created_at: string;
}

const STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "actioned", label: "Actioned" },
  { value: "dismissed", label: "Dismissed" },
  { value: "all", label: "All" },
];

const REASON_LABELS: Record<string, string> = {
  harassment: "Harassment",
  spam: "Spam",
  hate_speech: "Hate speech",
  inappropriate: "Inappropriate content",
  threat: "Threats / violence",
  impersonation: "Impersonation",
  other: "Other",
};

const statusBadge = (s: string) => {
  const map: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700",
    actioned: "bg-red-100 text-red-700",
    dismissed: "bg-gray-100 text-gray-600",
    reviewed: "bg-blue-100 text-blue-700",
  };
  return map[s] ?? "bg-gray-100 text-gray-600";
};

const GIF_PREFIX = "[GIF]:";
const renderContent = (c: string) => (c.startsWith(GIF_PREFIX) ? "[GIF]" : c);

export default function StaffModeration() {
  const { toast } = useToast();
  const { refresh: refreshPending } = useReportsPending();
  const [status, setStatus] = useState("pending");
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<ReportRow | null>(null);
  const [context, setContext] = useState<ContextMessage[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ reports: ReportRow[] }>(`/api/admin/reports${status ? `?status=${status}` : ""}`);
      setRows(data.reports);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [status, toast]);
  useEffect(() => { load(); }, [load]);

  const openDetail = async (id: number) => {
    setDetailLoading(true);
    setReviewNote("");
    setContext([]);
    try {
      const data = await api<{ report: ReportRow; context: ContextMessage[] }>(`/api/admin/reports/${id}`);
      setDetail(data.report);
      setContext(data.context ?? []);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setDetailLoading(false); }
  };

  const resolve = async (action: "dismiss" | "uphold") => {
    if (!detail) return;
    setActing(true);
    try {
      await api(`/api/admin/reports/${detail.id}/resolve`, {
        method: "POST",
        body: JSON.stringify({ action, review_note: reviewNote.trim() || null }),
      });
      toast({ title: action === "uphold" ? "Report actioned" : "Report dismissed", description: detail.reported_name });
      setDetail(null);
      load();
      refreshPending();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setActing(false); }
  };

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <ShieldAlert className="h-7 w-7 text-[#1a5c38]" />Chat Reports
        </h1>
        <p className="text-muted-foreground mt-1">Review golfer reports of objectionable chat content.</p>
      </div>

      <div className="inline-flex gap-1 p-1 rounded-lg bg-muted">
        {STATUSES.map(s => (
          <button
            key={s.value}
            onClick={() => setStatus(s.value)}
            className={`text-sm font-medium px-4 py-1.5 rounded-md transition-colors ${
              status === s.value ? "bg-white shadow-sm text-[#1a5c38]" : "text-muted-foreground hover:text-foreground"
            }`}
          >{s.label}</button>
        ))}
      </div>

      {loading ? <Skeleton className="h-64 w-full" /> : rows.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No reports in this status.</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-muted-foreground">
                <th className="py-2.5 px-4 font-medium">Reported</th>
                <th className="py-2.5 px-4 font-medium">Reporter</th>
                <th className="py-2.5 px-4 font-medium">Reason</th>
                <th className="py-2.5 px-4 font-medium">Status</th>
                <th className="py-2.5 px-4 font-medium">Submitted</th>
                <th className="py-2.5 px-4 font-medium"></th>
              </tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="py-2.5 px-4"><div className="font-medium">{r.reported_name}</div><div className="text-xs text-muted-foreground">{r.reported_email}</div></td>
                    <td className="py-2.5 px-4"><div>{r.reporter_name}</div><div className="text-xs text-muted-foreground">{r.reporter_email}</div></td>
                    <td className="py-2.5 px-4">{REASON_LABELS[r.reason] ?? r.reason}</td>
                    <td className="py-2.5 px-4"><span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${statusBadge(r.status)}`}>{r.status}</span></td>
                    <td className="py-2.5 px-4 text-xs text-muted-foreground">{format(new Date(r.created_at), "dd MMM yyyy HH:mm")}</td>
                    <td className="py-2.5 px-4 text-right"><Button variant="outline" size="sm" onClick={() => openDetail(r.id)}>Review</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Dialog open={detail != null || detailLoading} onOpenChange={(o) => { if (!o) setDetail(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Review Report</DialogTitle></DialogHeader>
          {detailLoading || !detail ? (
            <Skeleton className="h-72 w-full" />
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><div className="text-muted-foreground text-xs">Reported user</div><div className="font-medium">{detail.reported_name}</div><div className="text-xs text-muted-foreground">{detail.reported_email}</div></div>
                <div><div className="text-muted-foreground text-xs">Reported by</div><div className="font-medium">{detail.reporter_name}</div><div className="text-xs text-muted-foreground">{detail.reporter_email}</div></div>
                <div><div className="text-muted-foreground text-xs">Reason</div><div>{REASON_LABELS[detail.reason] ?? detail.reason}</div></div>
                <div><div className="text-muted-foreground text-xs">Submitted</div><div>{format(new Date(detail.created_at), "dd MMM yyyy HH:mm")}</div></div>
              </div>

              {detail.note && (
                <div className="text-sm"><div className="text-muted-foreground text-xs mb-1">Reporter note</div><div className="rounded-md bg-muted px-3 py-2">{detail.note}</div></div>
              )}

              {detail.reported_excerpt && (
                <div className="text-sm"><div className="text-muted-foreground text-xs mb-1">Reported message</div><div className="rounded-md border px-3 py-2">{renderContent(detail.reported_excerpt)}</div></div>
              )}

              {context.length > 0 && (
                <div>
                  <div className="text-muted-foreground text-xs mb-1.5">Conversation context (latest {context.length})</div>
                  <div className="rounded-md border max-h-56 overflow-y-auto divide-y">
                    {context.map(m => (
                      <div key={m.id} className={`px-3 py-2 text-sm ${m.sender_id === detail.reported_user_id ? "bg-red-50" : ""}`}>
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-medium text-xs">{m.sender_name}{m.sender_id === detail.reported_user_id ? " (reported)" : ""}</span>
                          <span className="text-[10px] text-muted-foreground">{format(new Date(m.created_at), "dd MMM HH:mm")}</span>
                        </div>
                        <div>{renderContent(m.content)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detail.status === "pending" ? (
                <div className="space-y-3 pt-1 border-t">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Review note (optional)</Label>
                    <Textarea value={reviewNote} onChange={e => setReviewNote(e.target.value)} placeholder="Internal note on the action taken…" rows={2} />
                  </div>
                  <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={() => resolve("dismiss")} disabled={acting} className="gap-1.5"><X className="h-4 w-4" />Dismiss</Button>
                    <Button className="bg-red-600 hover:bg-red-700 gap-1.5" onClick={() => resolve("uphold")} disabled={acting}><Check className="h-4 w-4" />Uphold &amp; action</Button>
                  </DialogFooter>
                </div>
              ) : (
                <div className="text-sm space-y-1 pt-1 border-t">
                  <div><span className="text-muted-foreground">Status: </span><span className="capitalize font-medium">{detail.status}</span></div>
                  {detail.review_note && <div><span className="text-muted-foreground">Note: </span>{detail.review_note}</div>}
                  {detail.reviewer_name && <div><span className="text-muted-foreground">Reviewed by: </span>{detail.reviewer_name}</div>}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
