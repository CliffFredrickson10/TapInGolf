import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Megaphone, Send, Users } from "lucide-react";
import { format } from "date-fns";

interface HistoryItem {
  id: number; type: string; title: string; body: string;
  tee_shift_minutes: number | null; affected_date: string | null;
  recipient_count: number; sent_at: string; sent_by_name: string;
}

const TYPES = [
  { value: "general", label: "General" },
  { value: "course_closed", label: "Course Closed" },
  { value: "course_open", label: "Course Open" },
  { value: "lightning", label: "Lightning" },
  { value: "tee_shift", label: "Tee Time Shift" },
];

export default function StaffBroadcast() {
  const { toast } = useToast();
  const { selectedClubId } = useAuth();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({
    type: "general", title: "", body: "",
    tee_shift_minutes: "" as any, affected_date: "",
  });

  const load = useCallback(async () => {
    if (selectedClubId == null) { setLoading(false); return; }
    setLoading(true);
    try {
      const [h, p] = await Promise.all([
        api<{ notifications: HistoryItem[] }>(`/api/admin/notifications?club_id=${selectedClubId}`),
        api<{ count: number }>(`/api/admin/notifications/preview?club_id=${selectedClubId}${form.affected_date ? `&date=${form.affected_date}` : ""}`),
      ]);
      setHistory(h.notifications);
      setPreviewCount(p.count);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [selectedClubId, form.affected_date, toast]);
  useEffect(() => { load(); }, [load]);

  const handleSend = async () => {
    if (selectedClubId == null) { toast({ title: "Select a club first", variant: "destructive" }); return; }
    if (!form.title || !form.body) { toast({ title: "Title and message required", variant: "destructive" }); return; }
    setSending(true);
    try {
      const res = await api<{ recipient_count: number; total_booked: number }>("/api/admin/notifications/broadcast", {
        method: "POST",
        body: JSON.stringify({
          club_id: selectedClubId,
          type: form.type,
          title: form.title,
          body: form.body,
          tee_shift_minutes: form.tee_shift_minutes === "" ? null : Number(form.tee_shift_minutes),
          affected_date: form.affected_date || null,
        }),
      });
      toast({ title: `Sent to ${res.recipient_count} golfer${res.recipient_count !== 1 ? "s" : ""}` });
      setForm({ type: "general", title: "", body: "", tee_shift_minutes: "", affected_date: "" });
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  if (selectedClubId == null) {
    return <div className="p-8 text-muted-foreground">Select a club from the selector above to broadcast.</div>;
  }

  return (
    <div className="p-8 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Megaphone className="h-7 w-7 text-[#1a5c38]" />Broadcast
        </h1>
        <p className="text-muted-foreground mt-1">Send a push notification to all booked golfers at the selected club.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Send className="h-5 w-5" />New Broadcast</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {form.type === "tee_shift" && (
              <div className="space-y-1.5">
                <Label>Shift (minutes, +/-)</Label>
                <Input type="number" value={form.tee_shift_minutes} onChange={e => setForm(f => ({ ...f, tee_shift_minutes: e.target.value }))} placeholder="e.g. 30 or -15" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Affected Date (optional)</Label>
              <Input type="date" value={form.affected_date} onChange={e => setForm(f => ({ ...f, affected_date: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Title *</Label>
            <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Course closed for maintenance" />
          </div>
          <div className="space-y-1.5">
            <Label>Message *</Label>
            <textarea
              className="w-full border rounded-md px-3 py-2 text-sm min-h-[100px] resize-y bg-background"
              value={form.body}
              onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
              placeholder="Write your message to golfers…"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Users className="h-4 w-4" />
              {previewCount == null ? "…" : `${previewCount} booked golfer${previewCount !== 1 ? "s" : ""}`}{form.affected_date ? ` on ${form.affected_date}` : ""}
            </span>
            <Button className="bg-[#1a5c38] hover:bg-[#164d30] gap-2" onClick={handleSend} disabled={sending}>
              <Send className="h-4 w-4" />{sending ? "Sending…" : "Send Broadcast"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-xl font-semibold mb-4">Recent Broadcasts</h2>
        {loading ? <Skeleton className="h-48 w-full" /> : history.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">No broadcasts yet for this club.</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {history.map(n => (
              <Card key={n.id}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{n.title}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">{n.type}</span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed mt-1">{n.body}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
                    <span>{n.recipient_count} recipient{n.recipient_count !== 1 ? "s" : ""}</span>
                    {n.affected_date && <span>Affected: {n.affected_date}</span>}
                    <span>by {n.sent_by_name}</span>
                    <span>{format(new Date(n.sent_at), "dd MMM yyyy HH:mm")}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
