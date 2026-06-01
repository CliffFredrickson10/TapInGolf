import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useReviewReportsPending } from "@/context/ReviewReportsPendingContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { MessageSquareWarning, Trash2, X, RotateCcw, Star } from "lucide-react";
import { format } from "date-fns";

interface ReviewReportRow {
  id: number;
  review_id: number;
  club_id: number;
  reported_excerpt: string | null;
  rating: number | null;
  reason: string;
  note: string | null;
  status: string;
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
  club_name: string;
  review_comment: string | null;
  review_rating: number | null;
  review_created_at: string | null;
  review_hidden: number | null;
  reviewer_name: string | null;
  reviewer_email: string | null;
  resolver_name: string | null;
}

const STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "actioned", label: "Removed" },
  { value: "dismissed", label: "Dismissed" },
  { value: "all", label: "All" },
];

const REASON_LABELS: Record<string, string> = {
  spam: "Spam / advertising",
  harassment: "Harassment / abuse",
  hate_speech: "Hate speech",
  inappropriate: "Inappropriate content",
  false_info: "False / misleading info",
  other: "Other",
};

const statusBadge = (s: string) => {
  const map: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700",
    actioned: "bg-red-100 text-red-700",
    dismissed: "bg-gray-100 text-gray-600",
  };
  return map[s] ?? "bg-gray-100 text-gray-600";
};

function Stars({ rating }: { rating: number | null }) {
  if (rating == null) return null;
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(i => (
        <Star key={i} className={`h-3.5 w-3.5 ${i <= rating ? "fill-[#c8a84b] text-[#c8a84b]" : "text-muted-foreground/30"}`} />
      ))}
    </div>
  );
}

export default function StaffReviewModeration() {
  const { toast } = useToast();
  const { refresh: refreshPending } = useReviewReportsPending();
  const [status, setStatus] = useState("pending");
  const [rows, setRows] = useState<ReviewReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<ReviewReportRow | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ reports: ReviewReportRow[] }>(`/api/admin/review-reports${status ? `?status=${status}` : ""}`);
      setRows(data.reports);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [status, toast]);
  useEffect(() => { load(); }, [load]);

  const openDetail = async (id: number) => {
    setDetailLoading(true);
    setReviewNote("");
    try {
      const data = await api<{ report: ReviewReportRow }>(`/api/admin/review-reports/${id}`);
      setDetail(data.report);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setDetailLoading(false); }
  };

  const resolve = async (action: "dismiss" | "remove") => {
    if (!detail) return;
    setActing(true);
    try {
      await api(`/api/admin/review-reports/${detail.id}/resolve`, {
        method: "POST",
        body: JSON.stringify({ action, review_note: reviewNote.trim() || null }),
      });
      toast({ title: action === "remove" ? "Review removed" : "Report dismissed", description: detail.club_name });
      setDetail(null);
      load();
      refreshPending();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setActing(false); }
  };

  const restore = async () => {
    if (!detail) return;
    setActing(true);
    try {
      await api(`/api/admin/review-reports/${detail.id}/restore`, { method: "POST" });
      toast({ title: "Review restored", description: detail.club_name });
      setDetail(null);
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setActing(false); }
  };

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <MessageSquareWarning className="h-7 w-7 text-[#1a5c38]" />Review Reports
        </h1>
        <p className="text-muted-foreground mt-1">Clubs flag abusive golfer reviews here. Remove a review to hide it from the app, or dismiss the report.</p>
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
                <th className="py-2.5 px-4 font-medium">Club</th>
                <th className="py-2.5 px-4 font-medium">Reviewer</th>
                <th className="py-2.5 px-4 font-medium">Reason</th>
                <th className="py-2.5 px-4 font-medium">Status</th>
                <th className="py-2.5 px-4 font-medium">Reported</th>
                <th className="py-2.5 px-4 font-medium"></th>
              </tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="py-2.5 px-4 font-medium">{r.club_name}</td>
                    <td className="py-2.5 px-4"><div>{r.reviewer_name ?? "—"}</div><div className="text-xs text-muted-foreground">{r.reviewer_email ?? ""}</div></td>
                    <td className="py-2.5 px-4">{REASON_LABELS[r.reason] ?? r.reason}</td>
                    <td className="py-2.5 px-4"><span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${statusBadge(r.status)}`}>{r.status === "actioned" ? "removed" : r.status}</span></td>
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
                <div><div className="text-muted-foreground text-xs">Club</div><div className="font-medium">{detail.club_name}</div></div>
                <div><div className="text-muted-foreground text-xs">Reviewer</div><div className="font-medium">{detail.reviewer_name ?? "—"}</div><div className="text-xs text-muted-foreground">{detail.reviewer_email ?? ""}</div></div>
                <div><div className="text-muted-foreground text-xs">Reason</div><div>{REASON_LABELS[detail.reason] ?? detail.reason}</div></div>
                <div><div className="text-muted-foreground text-xs">Reported</div><div>{format(new Date(detail.created_at), "dd MMM yyyy HH:mm")}</div></div>
              </div>

              <div className="text-sm">
                <div className="text-muted-foreground text-xs mb-1">Reported review</div>
                <div className="rounded-md border px-3 py-2 space-y-1.5">
                  <Stars rating={detail.review_rating ?? detail.rating} />
                  <p>{detail.review_comment ?? detail.reported_excerpt ?? <span className="text-muted-foreground italic">No comment (rating only)</span>}</p>
                  {detail.review_hidden ? <div className="text-xs text-red-600 font-medium">Currently removed from the app</div> : null}
                </div>
              </div>

              {detail.note && (
                <div className="text-sm"><div className="text-muted-foreground text-xs mb-1">Club's note</div><div className="rounded-md bg-muted px-3 py-2">{detail.note}</div></div>
              )}

              {detail.status === "pending" ? (
                <div className="space-y-3 pt-1 border-t">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Moderation note (optional)</Label>
                    <Textarea value={reviewNote} onChange={e => setReviewNote(e.target.value)} placeholder="Internal note on the decision…" rows={2} />
                  </div>
                  <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={() => resolve("dismiss")} disabled={acting} className="gap-1.5"><X className="h-4 w-4" />Dismiss</Button>
                    <Button className="bg-red-600 hover:bg-red-700 gap-1.5" onClick={() => resolve("remove")} disabled={acting}><Trash2 className="h-4 w-4" />Remove review</Button>
                  </DialogFooter>
                </div>
              ) : (
                <div className="text-sm space-y-3 pt-1 border-t">
                  <div className="space-y-1">
                    <div><span className="text-muted-foreground">Decision: </span><span className="capitalize font-medium">{detail.status === "actioned" ? "Review removed" : detail.status}</span></div>
                    {detail.review_note && <div><span className="text-muted-foreground">Note: </span>{detail.review_note}</div>}
                    {detail.resolver_name && <div><span className="text-muted-foreground">Decided by: </span>{detail.resolver_name}</div>}
                  </div>
                  {detail.status === "actioned" && detail.review_hidden ? (
                    <DialogFooter>
                      <Button variant="outline" onClick={restore} disabled={acting} className="gap-1.5">
                        <RotateCcw className="h-4 w-4" />Restore review
                      </Button>
                    </DialogFooter>
                  ) : null}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
