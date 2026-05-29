import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2, Calendar } from "lucide-react";
import { format } from "date-fns";

interface GolfEvent {
  id: number; name: string; description: string | null; event_date: string;
  start_time: string | null; end_time: string | null; event_type: string;
  restriction: string; entry_fee: number | null; max_participants: number | null;
  status: string; created_at: string;
}

const EMPTY = { name: "", description: "", event_date: "", start_time: "", end_time: "", event_type: "stroke_play", restriction: "open", entry_fee: "" as any, max_participants: "" as any, status: "active" };

const STATUS_BADGE: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
  completed: "bg-blue-100 text-blue-700",
};

export default function Events() {
  const { toast } = useToast();
  const [events, setEvents] = useState<GolfEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = () => api<GolfEvent[]>("/api/portal/events").then(setEvents).catch(e => toast({ title: "Error", description: e.message, variant: "destructive" })).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const openAdd = () => { setForm(EMPTY); setEditId(null); setOpen(true); };
  const openEdit = (ev: GolfEvent) => {
    setForm({ name: ev.name, description: ev.description ?? "", event_date: ev.event_date, start_time: ev.start_time ?? "", end_time: ev.end_time ?? "", event_type: ev.event_type, restriction: ev.restriction, entry_fee: ev.entry_fee ?? "", max_participants: ev.max_participants ?? "", status: ev.status });
    setEditId(ev.id); setOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.event_date) { toast({ title: "Name and date required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const body = { ...form, description: form.description || null, start_time: form.start_time || null, end_time: form.end_time || null, entry_fee: form.entry_fee === "" ? null : Number(form.entry_fee), max_participants: form.max_participants === "" ? null : Number(form.max_participants) };
      if (editId) await api(`/api/portal/events/${editId}`, { method: "PUT", body: JSON.stringify(body) });
      else await api("/api/portal/events", { method: "POST", body: JSON.stringify(body) });
      toast({ title: editId ? "Event updated" : "Event created" });
      setOpen(false); load();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this event?")) return;
    try { await api(`/api/portal/events/${id}`, { method: "DELETE" }); setEvents(e => e.filter(x => x.id !== id)); toast({ title: "Deleted" }); }
    catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Events</h1>
          <p className="text-muted-foreground mt-1">Manage golf events, tournaments, and competitions at your club.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#1a5c38] hover:bg-[#164d30] gap-2" onClick={openAdd}><Plus className="h-4 w-4" />New Event</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{editId ? "Edit" : "New"} Event</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2 max-h-[70vh] overflow-y-auto pr-1">
              <div className="space-y-1.5"><Label>Event Name *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Club Championship 2026" /></div>
              <div className="space-y-1.5"><Label>Description</Label><textarea className="w-full border rounded-md px-3 py-2 text-sm min-h-[60px] bg-background" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Details about the event…" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Date *</Label><Input type="date" value={form.event_date} onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))} /></div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>Start Time</Label><Input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label>End Time</Label><Input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} /></div>
                <div className="space-y-1.5">
                  <Label>Event Type</Label>
                  <Select value={form.event_type} onValueChange={v => setForm(f => ({ ...f, event_type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="stroke_play">Stroke Play</SelectItem>
                      <SelectItem value="stableford">Stableford</SelectItem>
                      <SelectItem value="match_play">Match Play</SelectItem>
                      <SelectItem value="fourball">Fourball</SelectItem>
                      <SelectItem value="scramble">Scramble</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Restriction</Label>
                  <Select value={form.restriction} onValueChange={v => setForm(f => ({ ...f, restriction: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="members_only">Members Only</SelectItem>
                      <SelectItem value="invite_only">Invite Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>Entry Fee (ZAR)</Label><Input type="number" value={form.entry_fee} onChange={e => setForm(f => ({ ...f, entry_fee: e.target.value }))} placeholder="Optional" /></div>
                <div className="space-y-1.5"><Label>Max Participants</Label><Input type="number" value={form.max_participants} onChange={e => setForm(f => ({ ...f, max_participants: e.target.value }))} placeholder="Optional" /></div>
              </div>
              <Button className="w-full bg-[#1a5c38] hover:bg-[#164d30]" onClick={handleSave} disabled={saving}>{saving ? "Saving…" : editId ? "Update" : "Create"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? <Skeleton className="h-48 w-full" /> : (
        events.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">No events yet. Create your first tournament or competition.</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {events.map(ev => (
              <Card key={ev.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex gap-3">
                      <div className="w-10 h-10 rounded-lg bg-[#1a5c38]/10 flex items-center justify-center flex-shrink-0">
                        <Calendar className="h-5 w-5 text-[#1a5c38]" />
                      </div>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{ev.name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[ev.status] ?? "bg-gray-100 text-gray-700"}`}>{ev.status}</span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(ev.event_date.slice(0, 10) + "T00:00:00"), "dd MMM yyyy")}
                          {ev.start_time ? ` at ${ev.start_time}` : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {ev.event_type.replace(/_/g, " ")} · {ev.restriction.replace(/_/g, " ")}
                          {ev.entry_fee ? ` · R${ev.entry_fee} entry` : ""}
                          {ev.max_participants ? ` · Max ${ev.max_participants}` : ""}
                        </p>
                        {ev.description && <p className="text-xs text-muted-foreground mt-1">{ev.description}</p>}
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(ev)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(ev.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
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
