import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useReadOnly } from "@/context/ReadOnlyContext";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Star, MessageSquareReply, Flag, EyeOff } from "lucide-react";
import { format } from "date-fns";

interface Review {
  id: number; rating: number; comment: string; created_at: string;
  guest_name: string; guest_email: string;
  response: string | null; responded_at: string | null;
  hidden: number; report_status: string | null;
}

const REPORT_REASONS = [
  { value: "spam", label: "Spam / advertising" },
  { value: "harassment", label: "Harassment / abuse" },
  { value: "hate_speech", label: "Hate speech" },
  { value: "inappropriate", label: "Inappropriate content" },
  { value: "false_info", label: "False / misleading information" },
  { value: "other", label: "Other" },
];

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(i => (
        <Star key={i} className={`h-4 w-4 ${i <= rating ? "fill-[#c8a84b] text-[#c8a84b]" : "text-muted-foreground/30"}`} />
      ))}
    </div>
  );
}

export default function Reviews() {
  const { toast } = useToast();
  const readOnly = useReadOnly();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  // Respond dialog
  const [respondTo, setRespondTo] = useState<Review | null>(null);
  const [responseText, setResponseText] = useState("");
  const [savingResponse, setSavingResponse] = useState(false);

  // Report dialog
  const [reportFor, setReportFor] = useState<Review | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [reportNote, setReportNote] = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);

  const loadReviews = () => {
    setLoading(true);
    api<Review[]>("/api/portal/reviews")
      .then(setReviews)
      .catch((e) => toast({ title: "Error", description: e.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadReviews(); }, []);

  const openRespond = (r: Review) => {
    setRespondTo(r);
    setResponseText(r.response ?? "");
  };

  const saveResponse = async (clear = false) => {
    if (!respondTo) return;
    setSavingResponse(true);
    try {
      await api(`/api/portal/reviews/${respondTo.id}/respond`, {
        method: "POST",
        body: JSON.stringify({ response: clear ? "" : responseText.trim() }),
      });
      toast({ title: clear ? "Response removed" : "Response published", description: respondTo.guest_name });
      setRespondTo(null);
      loadReviews();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setSavingResponse(false); }
  };

  const openReport = (r: Review) => {
    setReportFor(r);
    setReportReason("");
    setReportNote("");
  };

  const submitReport = async () => {
    if (!reportFor || !reportReason) return;
    setSubmittingReport(true);
    try {
      await api(`/api/portal/reviews/${reportFor.id}/report`, {
        method: "POST",
        body: JSON.stringify({ reason: reportReason, note: reportNote.trim() || null }),
      });
      toast({ title: "Review reported", description: "A TapIn admin will review it shortly." });
      setReportFor(null);
      loadReviews();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setSubmittingReport(false); }
  };

  // Visible reviews (excluding admin-removed ones) drive the rating summary.
  const visible = reviews.filter(r => !r.hidden);
  const avg = visible.length ? (visible.reduce((s, r) => s + r.rating, 0) / visible.length).toFixed(1) : null;
  const dist = [5,4,3,2,1].map(star => ({
    star,
    count: visible.filter(r => r.rating === star).length,
    pct: visible.length ? Math.round(visible.filter(r => r.rating === star).length / visible.length * 100) : 0,
  }));

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Reviews</h1>
        <p className="text-muted-foreground mt-1">Golfer reviews and ratings for your club. Reply to feedback, or report abusive reviews to TapIn.</p>
      </div>

      {loading ? <Skeleton className="h-48 w-full" /> : (
        <>
          {visible.length > 0 && (
            <div className="grid grid-cols-2 gap-6 max-w-xl">
              <Card>
                <CardContent className="py-6 text-center">
                  <div className="text-5xl font-bold text-[#1a5c38]">{avg}</div>
                  <Stars rating={Math.round(Number(avg))} />
                  <p className="text-sm text-muted-foreground mt-1">{visible.length} review{visible.length !== 1 ? "s" : ""}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4 space-y-2">
                  {dist.map(({ star, count, pct }) => (
                    <div key={star} className="flex items-center gap-2 text-sm">
                      <span className="w-4 text-right text-muted-foreground">{star}</span>
                      <Star className="h-3.5 w-3.5 text-[#c8a84b]" />
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-[#c8a84b] rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-6 text-right text-muted-foreground">{count}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}

          {reviews.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No reviews yet. Encourage your golfers to leave a review in the TapIn Golf app.</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {reviews.map(r => (
                <Card key={r.id} className={r.hidden ? "opacity-60" : ""}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="font-medium text-sm">{r.guest_name}</span>
                          <Stars rating={r.rating} />
                          {r.hidden ? (
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-600 font-medium">
                              <EyeOff className="h-3 w-3" />Removed by TapIn
                            </span>
                          ) : r.report_status === "pending" ? (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">Reported · under review</span>
                          ) : r.report_status === "dismissed" ? (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">Report dismissed</span>
                          ) : null}
                        </div>
                        {r.comment && <p className="text-sm text-muted-foreground leading-relaxed">"{r.comment}"</p>}
                        <p className="text-xs text-muted-foreground">{format(new Date(r.created_at), "dd MMM yyyy")}</p>

                        {r.response && (
                          <div className="mt-2 rounded-md border-l-2 border-[#1a5c38] bg-[#1a5c38]/5 px-3 py-2">
                            <div className="text-xs font-semibold text-[#1a5c38] flex items-center gap-1.5">
                              <MessageSquareReply className="h-3.5 w-3.5" />Your response
                              {r.responded_at && <span className="font-normal text-muted-foreground">· {format(new Date(r.responded_at), "dd MMM yyyy")}</span>}
                            </div>
                            <p className="text-sm text-foreground mt-1 leading-relaxed">{r.response}</p>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-2 flex-shrink-0">
                        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => openRespond(r)}>
                          <MessageSquareReply className="h-3.5 w-3.5" />{r.response ? "Edit reply" : "Respond"}
                        </Button>
                        {!r.hidden && r.report_status !== "pending" && (
                          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-red-600" onClick={() => openReport(r)}>
                            <Flag className="h-3.5 w-3.5" />Report
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Respond dialog */}
      <Dialog open={respondTo != null} onOpenChange={(o) => { if (!o) setRespondTo(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Respond to {respondTo?.guest_name}</DialogTitle></DialogHeader>
          {respondTo && (
            <div className="space-y-4">
              <div className="rounded-md bg-muted px-3 py-2 text-sm">
                <Stars rating={respondTo.rating} />
                {respondTo.comment && <p className="text-muted-foreground mt-1.5">"{respondTo.comment}"</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Your public response (shown in the TapIn Golf app)</Label>
                <Textarea
                  value={responseText}
                  onChange={(e) => setResponseText(e.target.value)}
                  placeholder="Thank the golfer for their feedback…"
                  rows={4}
                  maxLength={2000}
                />
              </div>
              <DialogFooter className="gap-2">
                {respondTo.response && (
                  <Button variant="outline" onClick={() => saveResponse(true)} disabled={savingResponse || readOnly} className="mr-auto text-red-600 hover:text-red-700">
                    Remove response
                  </Button>
                )}
                <Button variant="outline" onClick={() => setRespondTo(null)} disabled={savingResponse}>Cancel</Button>
                <Button className="bg-[#1a5c38] hover:bg-[#16492d]" onClick={() => saveResponse(false)} disabled={savingResponse || !responseText.trim() || readOnly}>
                  {savingResponse ? "Saving…" : "Publish response"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Report dialog */}
      <Dialog open={reportFor != null} onOpenChange={(o) => { if (!o) setReportFor(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Report this review</DialogTitle></DialogHeader>
          {reportFor && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Flag this review for the TapIn moderation team. They'll review it and remove it if it breaches the guidelines. Clubs can't remove reviews directly.
              </p>
              <div className="rounded-md bg-muted px-3 py-2 text-sm">
                <span className="font-medium">{reportFor.guest_name}</span>
                <Stars rating={reportFor.rating} />
                {reportFor.comment && <p className="text-muted-foreground mt-1.5">"{reportFor.comment}"</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Reason</Label>
                <Select value={reportReason} onValueChange={setReportReason}>
                  <SelectTrigger><SelectValue placeholder="Select a reason…" /></SelectTrigger>
                  <SelectContent>
                    {REPORT_REASONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Details (optional)</Label>
                <Textarea value={reportNote} onChange={(e) => setReportNote(e.target.value)} placeholder="Add any context for the moderator…" rows={3} maxLength={1000} />
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setReportFor(null)} disabled={submittingReport}>Cancel</Button>
                <Button className="bg-red-600 hover:bg-red-700 gap-1.5" onClick={submitReport} disabled={submittingReport || !reportReason || readOnly}>
                  <Flag className="h-4 w-4" />{submittingReport ? "Reporting…" : "Submit report"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
