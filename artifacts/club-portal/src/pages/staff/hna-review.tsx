import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useHnaPending } from "@/context/HnaPendingContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { IdCard, Check, X } from "lucide-react";
import { format } from "date-fns";

interface VerificationRow {
  id: number; user_id: number; hna_number: string; status: string;
  review_note: string | null; valid_until: string | null;
  created_at: string; reviewed_at: string | null;
  user_name: string; user_email: string; reviewer_name: string | null;
}
interface VerificationDetail extends VerificationRow {
  card_image: string | null; handicap: number | null;
}

const STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" },
];

const statusBadge = (s: string) => {
  const map: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700",
    approved: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
  };
  return map[s] ?? "bg-gray-100 text-gray-600";
};

export default function StaffHnaReview() {
  const { toast } = useToast();
  const { refresh: refreshPending } = useHnaPending();
  const [status, setStatus] = useState("pending");
  const [rows, setRows] = useState<VerificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<VerificationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [validUntil, setValidUntil] = useState("");
  const [note, setNote] = useState("");
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ verifications: VerificationRow[] }>(`/api/admin/hna-verifications${status ? `?status=${status}` : ""}`);
      setRows(data.verifications);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [status, toast]);
  useEffect(() => { load(); }, [load]);

  const openDetail = async (id: number) => {
    setDetailLoading(true);
    setValidUntil(""); setNote("");
    try {
      const data = await api<{ verification: VerificationDetail }>(`/api/admin/hna-verifications/${id}`);
      setDetail(data.verification);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setDetailLoading(false); }
  };

  const approve = async () => {
    if (!detail) return;
    setActing(true);
    try {
      await api(`/api/admin/hna-verifications/${detail.id}/approve`, {
        method: "POST",
        body: JSON.stringify({ valid_until: validUntil || null }),
      });
      toast({ title: "Approved", description: detail.user_name });
      setDetail(null);
      load();
      refreshPending();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setActing(false); }
  };

  const reject = async () => {
    if (!detail) return;
    if (!note.trim()) { toast({ title: "Add a reason", description: "A note is required to reject.", variant: "destructive" }); return; }
    setActing(true);
    try {
      await api(`/api/admin/hna-verifications/${detail.id}/reject`, {
        method: "POST",
        body: JSON.stringify({ note: note.trim() }),
      });
      toast({ title: "Rejected", description: detail.user_name });
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
          <IdCard className="h-7 w-7 text-[#1a5c38]" />HNA Verifications
        </h1>
        <p className="text-muted-foreground mt-1">Review golfer-submitted Handicap Network Africa cards.</p>
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
        <Card><CardContent className="py-12 text-center text-muted-foreground">No verifications in this status.</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-muted-foreground">
                <th className="py-2.5 px-4 font-medium">Golfer</th>
                <th className="py-2.5 px-4 font-medium">HNA Number</th>
                <th className="py-2.5 px-4 font-medium">Status</th>
                <th className="py-2.5 px-4 font-medium">Submitted</th>
                <th className="py-2.5 px-4 font-medium"></th>
              </tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="py-2.5 px-4"><div className="font-medium">{r.user_name}</div><div className="text-xs text-muted-foreground">{r.user_email}</div></td>
                    <td className="py-2.5 px-4 font-mono text-xs">{r.hna_number}</td>
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
          <DialogHeader><DialogTitle>Review Verification</DialogTitle></DialogHeader>
          {detailLoading || !detail ? (
            <Skeleton className="h-72 w-full" />
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><div className="text-muted-foreground text-xs">Golfer</div><div className="font-medium">{detail.user_name}</div></div>
                <div><div className="text-muted-foreground text-xs">Email</div><div>{detail.user_email}</div></div>
                <div><div className="text-muted-foreground text-xs">HNA Number</div><div className="font-mono">{detail.hna_number}</div></div>
                <div><div className="text-muted-foreground text-xs">Handicap</div><div>{detail.handicap ?? "—"}</div></div>
              </div>

              {detail.card_image ? (
                <div>
                  <div className="text-muted-foreground text-xs mb-1.5">Card Image</div>
                  <img src={detail.card_image} alt="HNA card" className="w-full rounded-lg border max-h-72 object-contain bg-muted" />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No card image submitted.</p>
              )}

              {detail.status === "pending" ? (
                <div className="space-y-3 pt-1 border-t">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Valid until (optional — leave blank for no expiry)</Label>
                    <Input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Rejection note (required to reject)</Label>
                    <Input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Card image unclear" />
                  </div>
                  <DialogFooter className="gap-2">
                    <Button variant="outline" className="text-destructive gap-1.5" onClick={reject} disabled={acting}><X className="h-4 w-4" />Reject</Button>
                    <Button className="bg-[#1a5c38] hover:bg-[#164d30] gap-1.5" onClick={approve} disabled={acting}><Check className="h-4 w-4" />Approve</Button>
                  </DialogFooter>
                </div>
              ) : (
                <div className="text-sm space-y-1 pt-1 border-t">
                  <div><span className="text-muted-foreground">Status: </span><span className="capitalize font-medium">{detail.status}</span></div>
                  {detail.valid_until && <div><span className="text-muted-foreground">Valid until: </span>{format(new Date(detail.valid_until), "dd MMM yyyy")}</div>}
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
