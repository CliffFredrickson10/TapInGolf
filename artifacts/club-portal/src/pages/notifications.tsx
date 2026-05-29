import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Send, Bell } from "lucide-react";
import { format } from "date-fns";

interface Notification {
  id: number; type: string; title: string; body: string;
  tee_shift_minutes: number | null; affected_date: string | null;
  recipient_count: number; sent_at: string;
}

const TYPE_BADGE: Record<string, string> = {
  general: "bg-blue-100 text-blue-700",
  delay: "bg-yellow-100 text-yellow-700",
  cancellation: "bg-red-100 text-red-700",
  promotion: "bg-green-100 text-green-700",
  event: "bg-purple-100 text-purple-700",
};

export default function Notifications() {
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({
    type: "general", title: "", body: "",
    tee_shift_minutes: "" as any, affected_date: "",
  });

  const load = () => api<Notification[]>("/api/portal/notifications").then(setNotifications).catch(e => toast({ title: "Error", description: e.message, variant: "destructive" })).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const handleSend = async () => {
    if (!form.title || !form.body) { toast({ title: "Title and message required", variant: "destructive" }); return; }
    setSending(true);
    try {
      await api("/api/portal/notifications", {
        method: "POST",
        body: JSON.stringify({ ...form, tee_shift_minutes: form.tee_shift_minutes === "" ? null : Number(form.tee_shift_minutes), affected_date: form.affected_date || null }),
      });
      toast({ title: "Notification sent to all active members" });
      setForm({ type: "general", title: "", body: "", tee_shift_minutes: "", affected_date: "" });
      load();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setSending(false); }
  };

  return (
    <div className="p-8 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
        <p className="text-muted-foreground mt-1">Send messages to all active club members.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Send className="h-5 w-5" />Send Notification</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Notification Type</Label>
              <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="delay">Tee Time Delay</SelectItem>
                  <SelectItem value="cancellation">Cancellation</SelectItem>
                  <SelectItem value="promotion">Promotion</SelectItem>
                  <SelectItem value="event">Event</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.type === "delay" && (
              <div className="space-y-1.5">
                <Label>Delay (minutes)</Label>
                <Input type="number" value={form.tee_shift_minutes} onChange={e => setForm(f => ({ ...f, tee_shift_minutes: e.target.value }))} placeholder="e.g. 30" />
              </div>
            )}
            {(form.type === "delay" || form.type === "cancellation") && (
              <div className="space-y-1.5">
                <Label>Affected Date</Label>
                <Input type="date" value={form.affected_date} onChange={e => setForm(f => ({ ...f, affected_date: e.target.value }))} />
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Title *</Label>
            <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Course Maintenance Update" />
          </div>
          <div className="space-y-1.5">
            <Label>Message *</Label>
            <textarea
              className="w-full border rounded-md px-3 py-2 text-sm min-h-[100px] resize-y bg-background"
              value={form.body}
              onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
              placeholder="Write your message to members…"
            />
          </div>
          <Button className="bg-[#1a5c38] hover:bg-[#164d30] gap-2" onClick={handleSend} disabled={sending}>
            <Send className="h-4 w-4" />{sending ? "Sending…" : "Send to All Active Members"}
          </Button>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-xl font-semibold mb-4">Sent Notifications</h2>
        {loading ? <Skeleton className="h-48 w-full" /> : (
          notifications.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No notifications sent yet.</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {notifications.map(n => (
                <Card key={n.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg bg-[#1a5c38]/10 flex items-center justify-center flex-shrink-0">
                        <Bell className="h-4.5 w-4.5 text-[#1a5c38]" />
                      </div>
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{n.title}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_BADGE[n.type] ?? "bg-gray-100 text-gray-700"}`}>{n.type}</span>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">{n.body}</p>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground pt-0.5">
                          <span>{n.recipient_count} recipient{n.recipient_count !== 1 ? "s" : ""}</span>
                          {n.affected_date && <span>Affected: {n.affected_date}</span>}
                          {n.tee_shift_minutes && <span>Shift: {n.tee_shift_minutes}min</span>}
                          <span>{format(new Date(n.sent_at), "dd MMM yyyy HH:mm")}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
