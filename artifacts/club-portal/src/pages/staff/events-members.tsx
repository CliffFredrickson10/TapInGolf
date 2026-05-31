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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CalendarRange, Plus, Trash2, UserPlus, Pencil, ClipboardList, Check, X } from "lucide-react";
import { format } from "date-fns";

interface EventRow {
  id: number; name: string; description: string | null; event_date: string;
  start_time: string | null; end_time: string | null; event_type: string;
  restriction: string; entry_fee: number | null; max_participants: number | null;
  status: string; total_registrations: number; approved_count: number; pending_count: number;
}
interface MemberRow {
  id: number; membership_type: string; status: string; created_at: string;
  user_id: number; user_name: string; user_email: string; handicap: number | null;
}
interface SearchUser { id: number; name: string; email: string; handicap: number | null; already_member: boolean; }
interface RegistrationRow {
  id: number; status: string; registered_at: string;
  user_id: number; user_name: string; user_email: string;
}

const emptyForm = {
  name: "", description: "", event_date: "", start_time: "", end_time: "",
  event_type: "other", restriction: "open", entry_fee: "", max_participants: "",
};

const EVENT_TYPES = ["open_day", "competition", "corporate", "social", "other"];
const RESTRICTIONS = ["open", "members_only", "invitation_only"];
const MEMBERSHIP_TYPES = ["standard", "premium", "honorary"];

export default function StaffEventsMembers() {
  const { selectedClubId } = useAuth();
  const [tab, setTab] = useState<"events" | "members">("events");

  if (selectedClubId == null) {
    return <div className="p-8 text-muted-foreground">Select a club from the selector above to manage events and members.</div>;
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <CalendarRange className="h-7 w-7 text-[#1a5c38]" />Events & Members
        </h1>
        <p className="text-muted-foreground mt-1">Manage events and the membership roster for the selected club.</p>
      </div>

      <div className="inline-flex gap-1 p-1 rounded-lg bg-muted">
        {(["events", "members"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`text-sm font-medium px-4 py-1.5 rounded-md capitalize transition-colors ${
              tab === t ? "bg-white shadow-sm text-[#1a5c38]" : "text-muted-foreground hover:text-foreground"
            }`}
          >{t}</button>
        ))}
      </div>

      {tab === "events" ? <EventsTab clubId={selectedClubId} /> : <MembersTab clubId={selectedClubId} />}
    </div>
  );
}

function EventsTab({ clubId }: { clubId: number }) {
  const { toast } = useToast();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [regEvent, setRegEvent] = useState<EventRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ events: EventRow[] }>(`/api/admin/events?club_id=${clubId}`);
      setEvents(data.events);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [clubId, toast]);
  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
    setOpen(true);
  };

  const openEdit = (e: EventRow) => {
    setEditingId(e.id);
    setForm({
      name: e.name,
      description: e.description ?? "",
      event_date: e.event_date ? e.event_date.slice(0, 10) : "",
      start_time: e.start_time ?? "",
      end_time: e.end_time ?? "",
      event_type: e.event_type,
      restriction: e.restriction,
      entry_fee: e.entry_fee != null ? String(e.entry_fee) : "",
      max_participants: e.max_participants != null ? String(e.max_participants) : "",
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name || !form.event_date) { toast({ title: "Name and date required", variant: "destructive" }); return; }
    setSaving(true);
    const payload = {
      club_id: clubId,
      name: form.name, description: form.description || null,
      event_date: form.event_date, start_time: form.start_time || null, end_time: form.end_time || null,
      event_type: form.event_type, restriction: form.restriction,
      entry_fee: form.entry_fee === "" ? null : parseFloat(form.entry_fee),
      max_participants: form.max_participants === "" ? null : parseInt(form.max_participants, 10),
    };
    try {
      if (editingId != null) {
        await api(`/api/admin/events/${editingId}`, { method: "PUT", body: JSON.stringify(payload) });
        toast({ title: "Event updated" });
      } else {
        await api("/api/admin/events", { method: "POST", body: JSON.stringify(payload) });
        toast({ title: "Event created" });
      }
      setOpen(false);
      setEditingId(null);
      setForm({ ...emptyForm });
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const cancelEvent = async (id: number) => {
    try {
      await api(`/api/admin/events/${id}?club_id=${clubId}`, { method: "DELETE" });
      toast({ title: "Event cancelled" });
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button className="bg-[#1a5c38] hover:bg-[#164d30] gap-2" onClick={openCreate}><Plus className="h-4 w-4" />New Event</Button>
      </div>
      {loading ? <Skeleton className="h-40 w-full" /> : events.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No upcoming events.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {events.map(e => (
            <Card key={e.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{e.name}</div>
                    <div className="text-xs text-muted-foreground capitalize">{e.event_type.replace("_", " ")} · {e.restriction.replace("_", " ")}</div>
                  </div>
                  {e.status !== "cancelled" && (
                    <div className="flex items-center gap-0.5">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(e)} title="Edit"><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="text-destructive h-8 w-8" onClick={() => cancelEvent(e.id)} title="Cancel event"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  )}
                </div>
                {e.description && <p className="text-sm text-muted-foreground mt-2">{e.description}</p>}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-3">
                  <span>{format(new Date(e.event_date), "EEE dd MMM yyyy")}</span>
                  {e.start_time && <span>{e.start_time}{e.end_time ? `–${e.end_time}` : ""}</span>}
                  {e.entry_fee != null && <span>R {e.entry_fee.toFixed(2)}</span>}
                  <span>{e.approved_count} approved{e.pending_count > 0 ? ` · ${e.pending_count} pending` : ""}</span>
                  {e.status === "cancelled" && <span className="text-destructive font-medium">Cancelled</span>}
                </div>
                <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={() => setRegEvent(e)}>
                  <ClipboardList className="h-4 w-4" />
                  Registrations{e.pending_count > 0 ? ` (${e.pending_count} pending)` : ""}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditingId(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingId != null ? "Edit Event" : "New Event"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Name *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Description</Label>
              <textarea className="w-full border rounded-md px-3 py-2 text-sm min-h-[60px] bg-background" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label>Date *</Label><Input type="date" value={form.event_date} onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Start</Label><Input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>End</Label><Input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Type</Label>
                <Select value={form.event_type} onValueChange={v => setForm(f => ({ ...f, event_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{EVENT_TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{t.replace("_", " ")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Restriction</Label>
                <Select value={form.restriction} onValueChange={v => setForm(f => ({ ...f, restriction: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{RESTRICTIONS.map(t => <SelectItem key={t} value={t} className="capitalize">{t.replace("_", " ")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Entry fee (R)</Label><Input type="number" value={form.entry_fee} onChange={e => setForm(f => ({ ...f, entry_fee: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Max participants</Label><Input type="number" value={form.max_participants} onChange={e => setForm(f => ({ ...f, max_participants: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpen(false); setEditingId(null); }} disabled={saving}>Cancel</Button>
            <Button className="bg-[#1a5c38] hover:bg-[#164d30]" onClick={save} disabled={saving}>
              {saving ? "Saving…" : editingId != null ? "Save changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RegistrationsDialog clubId={clubId} event={regEvent} onClose={() => setRegEvent(null)} onChanged={load} />
    </div>
  );
}

function RegistrationsDialog({ clubId, event, onClose, onChanged }: {
  clubId: number; event: EventRow | null; onClose: () => void; onChanged: () => void;
}) {
  const { toast } = useToast();
  const [regs, setRegs] = useState<RegistrationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [actingId, setActingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!event) return;
    setLoading(true);
    try {
      const data = await api<{ registrations: RegistrationRow[] }>(`/api/admin/events/${event.id}/registrations?club_id=${clubId}`);
      setRegs(data.registrations);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [event, clubId, toast]);
  useEffect(() => { if (event) load(); }, [event, load]);

  const decide = async (userId: number, status: "approved" | "rejected") => {
    if (!event) return;
    setActingId(userId);
    try {
      await api(`/api/admin/events/${event.id}/registrations/${userId}`, {
        method: "PUT",
        body: JSON.stringify({ club_id: clubId, status }),
      });
      toast({ title: status === "approved" ? "Registration approved" : "Registration rejected" });
      await load();
      onChanged();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setActingId(null); }
  };

  const badge = (s: string) => {
    const map: Record<string, string> = {
      pending: "bg-amber-100 text-amber-700",
      approved: "bg-green-100 text-green-700",
      rejected: "bg-red-100 text-red-700",
    };
    return map[s] ?? "bg-gray-100 text-gray-600";
  };

  return (
    <Dialog open={event != null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Registrations · {event?.name}</DialogTitle></DialogHeader>
        {loading ? <Skeleton className="h-40 w-full" /> : regs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No registrations yet.</p>
        ) : (
          <div className="max-h-96 overflow-y-auto space-y-1">
            {regs.map(r => (
              <div key={r.id} className="flex items-center justify-between gap-2 p-2.5 rounded-md hover:bg-muted">
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{r.user_name}</div>
                  <div className="text-xs text-muted-foreground truncate">{r.user_email}</div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {r.status === "pending" ? (
                    <>
                      <Button size="sm" variant="outline" className="text-destructive gap-1 h-8" disabled={actingId === r.user_id} onClick={() => decide(r.user_id, "rejected")}><X className="h-3.5 w-3.5" />Reject</Button>
                      <Button size="sm" className="bg-[#1a5c38] hover:bg-[#164d30] gap-1 h-8" disabled={actingId === r.user_id} onClick={() => decide(r.user_id, "approved")}><Check className="h-3.5 w-3.5" />Approve</Button>
                    </>
                  ) : (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${badge(r.status)}`}>{r.status}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MembersTab({ clubId }: { clubId: number }) {
  const { toast } = useToast();
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [results, setResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ members: MemberRow[] }>(`/api/admin/members?club_id=${clubId}`);
      setMembers(data.members);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [clubId, toast]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (searchQ.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await api<{ users: SearchUser[] }>(`/api/admin/members/search?club_id=${clubId}&q=${encodeURIComponent(searchQ.trim())}`);
        setResults(data.users);
      } catch { /* ignore */ } finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [searchQ, clubId]);

  const addMember = async (userId: number, membership_type = "standard") => {
    try {
      await api("/api/admin/members", { method: "POST", body: JSON.stringify({ club_id: clubId, user_id: userId, membership_type }) });
      toast({ title: "Member added" });
      setAddOpen(false); setSearchQ(""); setResults([]);
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const updateMember = async (userId: number, body: { membership_type?: string; status?: string }) => {
    try {
      await api(`/api/admin/members/${userId}`, { method: "PUT", body: JSON.stringify({ club_id: clubId, ...body }) });
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const removeMember = async (userId: number) => {
    try {
      await api(`/api/admin/members/${userId}?club_id=${clubId}`, { method: "DELETE" });
      toast({ title: "Member removed" });
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button className="bg-[#1a5c38] hover:bg-[#164d30] gap-2" onClick={() => setAddOpen(true)}><UserPlus className="h-4 w-4" />Add Member</Button>
      </div>
      {loading ? <Skeleton className="h-40 w-full" /> : members.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No members yet.</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-muted-foreground">
                <th className="py-2.5 px-4 font-medium">Name</th>
                <th className="py-2.5 px-4 font-medium">Handicap</th>
                <th className="py-2.5 px-4 font-medium">Membership</th>
                <th className="py-2.5 px-4 font-medium">Status</th>
                <th className="py-2.5 px-4 font-medium"></th>
              </tr></thead>
              <tbody>
                {members.map(m => (
                  <tr key={m.id} className="border-b last:border-0">
                    <td className="py-2.5 px-4"><div className="font-medium">{m.user_name}</div><div className="text-xs text-muted-foreground">{m.user_email}</div></td>
                    <td className="py-2.5 px-4">{m.handicap ?? "—"}</td>
                    <td className="py-2.5 px-4">
                      <Select value={m.membership_type} onValueChange={v => updateMember(m.user_id, { membership_type: v })}>
                        <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                        <SelectContent>{MEMBERSHIP_TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
                      </Select>
                    </td>
                    <td className="py-2.5 px-4">
                      <Select value={m.status} onValueChange={v => updateMember(m.user_id, { status: v })}>
                        <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">active</SelectItem>
                          <SelectItem value="suspended">suspended</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <Button variant="ghost" size="icon" className="text-destructive h-8 w-8" onClick={() => removeMember(m.user_id)}><Trash2 className="h-4 w-4" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Member</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Search by name or email…" value={searchQ} onChange={e => setSearchQ(e.target.value)} autoFocus />
            <div className="max-h-72 overflow-y-auto space-y-1">
              {searching && <p className="text-sm text-muted-foreground py-2">Searching…</p>}
              {!searching && searchQ.trim().length >= 2 && results.length === 0 && <p className="text-sm text-muted-foreground py-2">No users found.</p>}
              {results.map(u => (
                <div key={u.id} className="flex items-center justify-between gap-2 p-2 rounded-md hover:bg-muted">
                  <div><div className="font-medium text-sm">{u.name}</div><div className="text-xs text-muted-foreground">{u.email}</div></div>
                  {u.already_member ? (
                    <span className="text-xs text-muted-foreground">Member</span>
                  ) : (
                    <Button size="sm" className="bg-[#1a5c38] hover:bg-[#164d30]" onClick={() => addMember(u.id)}>Add</Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
