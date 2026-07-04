import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Pencil, Trash2, RefreshCw, Users, Clock } from "lucide-react";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface Member { user_id: number; name: string; email: string }
interface Hold {
  user_id: number; member_name: string; status: string;
  confirm_by: string; date: string; tee_time: string;
}
interface Reservation {
  id: number; day_of_week: number; tee_time: string;
  confirm_hours_before: number; active: boolean;
  members: Member[]; upcoming: Hold[];
}

const DEFAULT_FORM = { day_of_week: 6, tee_time: "07:00", confirm_hours_before: 48, active: true, member_user_ids: [] as number[] };

function holdBadge(status: string) {
  if (status === "confirmed") return <Badge className="bg-green-600 hover:bg-green-600 text-white">Confirmed</Badge>;
  if (status === "held")      return <Badge variant="secondary">Awaiting confirmation</Badge>;
  if (status === "released")  return <Badge variant="outline" className="text-muted-foreground">Released</Badge>;
  if (status === "declined")  return <Badge variant="outline" className="text-muted-foreground">Declined</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

export default function StandingTeeTimes() {
  const { toast } = useToast();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [clubMembers, setClubMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [memberSearch, setMemberSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [res, mem] = await Promise.all([
        api<Reservation[]>("/api/portal/standing-reservations"),
        api<any[]>("/api/portal/members"),
      ]);
      setReservations(res);
      setClubMembers(mem.map((m) => ({ user_id: m.user_id, name: m.name, email: m.email })));
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openAdd = () => { setForm(DEFAULT_FORM); setEditId(null); setMemberSearch(""); setDialogOpen(true); };
  const openEdit = (r: Reservation) => {
    setForm({
      day_of_week: r.day_of_week,
      tee_time: r.tee_time,
      confirm_hours_before: r.confirm_hours_before,
      active: r.active,
      member_user_ids: (r.members ?? []).map((m) => m.user_id),
    });
    setEditId(r.id);
    setMemberSearch("");
    setDialogOpen(true);
  };

  const toggleMember = (id: number) => {
    setForm((f) => {
      const has = f.member_user_ids.includes(id);
      if (has) return { ...f, member_user_ids: f.member_user_ids.filter((x) => x !== id) };
      if (f.member_user_ids.length >= 4) {
        toast({ title: "Maximum 4 players", description: "A standing tee time can hold up to 4 seats.", variant: "destructive" });
        return f;
      }
      return { ...f, member_user_ids: [...f.member_user_ids, id] };
    });
  };

  const save = async () => {
    if (!form.member_user_ids.length) {
      toast({ title: "Select members", description: "Pick at least one member for this standing tee time.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (editId) {
        await api(`/api/portal/standing-reservations/${editId}`, { method: "PUT", body: JSON.stringify(form) });
      } else {
        await api("/api/portal/standing-reservations", { method: "POST", body: JSON.stringify(form) });
      }
      toast({ title: editId ? "Standing tee time updated" : "Standing tee time created" });
      setDialogOpen(false);
      await load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const remove = async (r: Reservation) => {
    if (!confirm(`Delete the ${DAYS[r.day_of_week]} ${r.tee_time} standing tee time? Unconfirmed held seats will be released. Already-confirmed bookings are not affected.`)) return;
    try {
      await api(`/api/portal/standing-reservations/${r.id}`, { method: "DELETE" });
      toast({ title: "Standing tee time deleted" });
      await load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    const base = q
      ? clubMembers.filter((m) => m.name?.toLowerCase().includes(q) || m.email?.toLowerCase().includes(q))
      : clubMembers;
    // Selected members always shown at the top
    const selected = clubMembers.filter((m) => form.member_user_ids.includes(m.user_id));
    const rest = base.filter((m) => !form.member_user_ids.includes(m.user_id));
    return [...selected, ...rest].slice(0, 50);
  }, [clubMembers, memberSearch, form.member_user_ids]);

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Standing Tee Times</h1>
          <p className="text-sm text-muted-foreground">
            Reserve a weekly tee time for regular members. Seats stay hidden from other golfers until the
            confirmation deadline — unconfirmed seats are released automatically.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-4 w-4 mr-1" /> Refresh</Button>
          <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1" /> Add Standing Tee Time</Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full" />)}</div>
      ) : reservations.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Clock className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p>No standing tee times yet.</p>
            <p className="text-sm">Create one to reserve a weekly slot for your regular members.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {reservations.map((r) => (
            <Card key={r.id} className={r.active ? "" : "opacity-60"}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    {DAYS[r.day_of_week]}s at {r.tee_time}
                    {!r.active && <Badge variant="outline">Inactive</Badge>}
                  </CardTitle>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(r)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Members must confirm {r.confirm_hours_before} hours before the tee time.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  {(r.members ?? []).map((m) => (
                    <Badge key={m.user_id} variant="secondary">{m.name}</Badge>
                  ))}
                </div>
                {r.upcoming.length > 0 && (
                  <div className="border rounded-md divide-y">
                    {r.upcoming.map((h, i) => (
                      <div key={i} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                        <span>{h.date} · {h.tee_time} — {h.member_name}</span>
                        <span className="flex items-center gap-2">
                          {h.status === "held" && (
                            <span className="text-xs text-muted-foreground">
                              confirm by {new Date(h.confirm_by).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                            </span>
                          )}
                          {holdBadge(h.status)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit" : "Add"} Standing Tee Time</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Day of week</Label>
                <Select value={String(form.day_of_week)} onValueChange={(v) => setForm({ ...form, day_of_week: Number(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DAYS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Tee time</Label>
                <Input type="time" value={form.tee_time} onChange={(e) => setForm({ ...form, tee_time: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Confirmation deadline (hours before tee time)</Label>
              <Input
                type="number" min={1} max={336}
                value={form.confirm_hours_before}
                onChange={(e) => setForm({ ...form, confirm_hours_before: Number(e.target.value) })}
              />
              <p className="text-xs text-muted-foreground">
                Unconfirmed seats are released this many hours before the tee time.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Members ({form.member_user_ids.length}/4)</Label>
              <Input placeholder="Search members…" value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} />
              <div className="border rounded-md max-h-48 overflow-y-auto divide-y">
                {filteredMembers.length === 0 && (
                  <p className="px-3 py-3 text-sm text-muted-foreground">No members found.</p>
                )}
                {filteredMembers.map((m) => (
                  <label key={m.user_id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/50">
                    <Checkbox
                      checked={form.member_user_ids.includes(m.user_id)}
                      onCheckedChange={() => toggleMember(m.user_id)}
                    />
                    <span className="flex-1">{m.name}</span>
                    <span className="text-xs text-muted-foreground">{m.email}</span>
                  </label>
                ))}
              </div>
            </div>
            {editId && (
              <div className="flex items-center gap-2">
                <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
                <Label>Active</Label>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={save} disabled={saving}>{saving ? "Saving…" : editId ? "Save changes" : "Create"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
