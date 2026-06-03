import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useReadOnly } from "@/context/ReadOnlyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Send, Bell, Inbox, XCircle, CheckCheck, BadgeCheck, ShieldOff } from "lucide-react";
import { format } from "date-fns";
import { useLocation } from "wouter";

interface OutboundNotification {
  id: number; type: string; title: string; body: string;
  tee_shift_minutes: number | null; affected_date: string | null;
  recipient_count: number; sent_at: string;
}

interface InboxItem {
  id: number;
  type: string;
  title: string;
  body: string;
  meta: string | null;
  read_at: string | null;
  refund_processed_at: string | null;
  created_at: string;
}

const OUTBOUND_BADGE: Record<string, string> = {
  general: "bg-blue-100 text-blue-700",
  delay: "bg-yellow-100 text-yellow-700",
  cancellation: "bg-red-100 text-red-700",
  promotion: "bg-green-100 text-green-700",
  event: "bg-purple-100 text-purple-700",
};

const INBOX_ICON: Record<string, { bg: string; text: string }> = {
  cancellation: { bg: "bg-red-100",    text: "text-red-600"    },
  booking:      { bg: "bg-green-100",  text: "text-green-700"  },
  ban_appeal:   { bg: "bg-amber-100",  text: "text-amber-700"  },
  info:         { bg: "bg-blue-100",   text: "text-blue-700"   },
};

function inboxStyle(type: string) {
  return INBOX_ICON[type] ?? INBOX_ICON.info;
}

export default function Notifications() {
  const { toast } = useToast();
  const readOnly = useReadOnly();
  const [, navigate] = useLocation();

  // ── Inbox state ──────────────────────────────────────────────────────────
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [inboxLoading, setInboxLoading] = useState(true);

  const loadInbox = useCallback(() =>
    api<InboxItem[]>("/api/portal/inbox")
      .then(setInbox)
      .catch(e => toast({ title: "Error loading inbox", description: e.message, variant: "destructive" }))
      .finally(() => setInboxLoading(false)),
    [toast]
  );

  useEffect(() => { loadInbox(); }, [loadInbox]);

  const markRead = async (id: number) => {
    await api(`/api/portal/inbox/${id}/read`, { method: "PUT" }).catch(() => {});
    setInbox(prev => prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
  };

  const markAllRead = async () => {
    await api("/api/portal/inbox/read-all", { method: "PUT" }).catch(() => {});
    setInbox(prev => prev.map(n => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
  };

  const markUnread = async (id: number) => {
    await api(`/api/portal/inbox/${id}/unread`, { method: "PUT" }).catch(() => {});
    setInbox(prev => prev.map(n => n.id === id ? { ...n, read_at: null } : n));
  };

  const markRefundProcessed = async (id: number) => {
    await api(`/api/portal/inbox/${id}/refund-processed`, { method: "PUT" }).catch(() => {});
    const now = new Date().toISOString();
    setInbox(prev => prev.map(n => n.id === id ? { ...n, refund_processed_at: now, read_at: n.read_at ?? now } : n));
  };

  const unreadCount = inbox.filter(n => !n.read_at).length;

  // ── Outbound state ───────────────────────────────────────────────────────
  const [notifications, setNotifications] = useState<OutboundNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({
    type: "general", title: "", body: "",
    tee_shift_minutes: "" as any, affected_date: "",
  });

  const loadOutbound = () =>
    api<OutboundNotification[]>("/api/portal/notifications")
      .then(setNotifications)
      .catch(e => toast({ title: "Error", description: e.message, variant: "destructive" }))
      .finally(() => setLoading(false));

  useEffect(() => { loadOutbound(); }, []);

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
      loadOutbound();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setSending(false); }
  };

  return (
    <div className="p-8 space-y-8 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
        <p className="text-muted-foreground mt-1">Your inbox from TapIn, and tools to message members.</p>
      </div>

      {/* ── INBOX ─────────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Inbox className="h-5 w-5 text-[#1a5c38]" />
            Inbox
            {unreadCount > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {unreadCount} new
              </span>
            )}
          </h2>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground" onClick={markAllRead}>
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </Button>
          )}
        </div>

        {inboxLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : inbox.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground text-sm">
              No notifications yet — cancellations and booking events will appear here.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {inbox.map(n => {
              const style = inboxStyle(n.type);
              const isUnread = !n.read_at;
              const refundDone = !!n.refund_processed_at;
              const isCancellation = n.type === "cancellation";
              return (
                <Card
                  key={n.id}
                  className={`transition-colors ${isUnread ? "border-[#1a5c38]/30 bg-[#1a5c38]/[0.03]" : "opacity-75"}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${style.bg}`}>
                        {isCancellation
                          ? <XCircle className={`h-4.5 w-4.5 ${style.text}`} />
                          : n.type === "ban_appeal"
                          ? <ShieldOff className={`h-4.5 w-4.5 ${style.text}`} />
                          : <Bell className={`h-4.5 w-4.5 ${style.text}`} />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-semibold ${isUnread ? "text-foreground" : "text-muted-foreground"}`}>
                              {n.title}
                              {isUnread && <span className="ml-2 inline-block w-2 h-2 rounded-full bg-red-500 align-middle" />}
                            </p>
                            <p className="text-sm text-muted-foreground mt-0.5 whitespace-pre-line leading-relaxed">{n.body}</p>
                          </div>
                          <div className="flex flex-col items-end gap-1.5 shrink-0">
                            {isUnread ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs text-muted-foreground h-7 px-2"
                                onClick={() => markRead(n.id)}
                              >
                                Dismiss
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs text-muted-foreground h-7 px-2"
                                onClick={() => markUnread(n.id)}
                              >
                                Mark unread
                              </Button>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 mt-2 flex-wrap">
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(n.created_at), "dd MMM yyyy HH:mm")}
                          </p>
                          {n.type === "ban_appeal" && (() => {
                            let banId: number | null = null;
                            try { banId = JSON.parse(n.meta ?? "{}").ban_id ?? null; } catch {}
                            return banId ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 px-2.5 text-xs gap-1 border-amber-300 text-amber-700 hover:bg-amber-50"
                                onClick={async () => {
                                  if (isUnread) await markRead(n.id);
                                  navigate(`/bans?ban=${banId}`);
                                }}
                              >
                                <ShieldOff className="h-3.5 w-3.5" />
                                View Appeal
                              </Button>
                            ) : null;
                          })()}
                          {isCancellation && (() => {
                            let bookingId: number | null = null;
                            try { bookingId = JSON.parse(n.meta ?? "{}").booking_id ?? null; } catch {}
                            return bookingId ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 px-2.5 text-xs gap-1 border-red-300 text-red-700 hover:bg-red-50"
                                onClick={async () => {
                                  if (isUnread) await markRead(n.id);
                                  navigate(`/cancelled-bookings?booking=${bookingId}`);
                                }}
                              >
                                <XCircle className="h-3.5 w-3.5" />
                                View Booking
                              </Button>
                            ) : null;
                          })()}
                          {isCancellation && (
                            refundDone ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                                <BadgeCheck className="h-3.5 w-3.5" />
                                Refund Processed · {format(new Date(n.refund_processed_at!), "dd MMM HH:mm")}
                              </span>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 px-2.5 text-xs gap-1 border-green-300 text-green-700 hover:bg-green-50"
                                onClick={() => markRefundProcessed(n.id)}
                              >
                                <BadgeCheck className="h-3.5 w-3.5" />
                                Mark Refund Processed
                              </Button>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ── SEND TO MEMBERS ───────────────────────────────────────────────── */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Send to Members</h2>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Send className="h-5 w-5" />Compose Notification</CardTitle></CardHeader>
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
            <Button className="bg-[#1a5c38] hover:bg-[#164d30] gap-2" onClick={handleSend} disabled={sending || readOnly}>
              <Send className="h-4 w-4" />{sending ? "Sending…" : "Send to All Active Members"}
            </Button>
          </CardContent>
        </Card>

        <div className="mt-6">
          <h3 className="text-base font-semibold mb-3 text-muted-foreground">Sent History</h3>
          {loading ? <Skeleton className="h-48 w-full" /> : (
            notifications.length === 0 ? (
              <Card><CardContent className="py-10 text-center text-muted-foreground text-sm">No notifications sent yet.</CardContent></Card>
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
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${OUTBOUND_BADGE[n.type] ?? "bg-gray-100 text-gray-700"}`}>{n.type}</span>
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
    </div>
  );
}
