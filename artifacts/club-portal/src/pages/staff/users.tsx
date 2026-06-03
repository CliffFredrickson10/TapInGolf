import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Users, Search, Shield, UserX } from "lucide-react";
import { format } from "date-fns";

interface UserRow {
  id: number;
  name: string;
  email: string;
  role: string;
  club_id: number | null;
  club_name: string | null;
  is_super_user: number;
  created_at: string;
}
interface ClubOption { id: number; name: string; province: string | null; }

const roleBadge = (r: string, isSuper: number) => {
  if (isSuper) return "bg-purple-100 text-purple-700";
  if (r === "club_admin") return "bg-blue-100 text-blue-700";
  return "bg-gray-100 text-gray-500";
};
const roleLabel = (r: string, isSuper: number) => {
  if (isSuper) return "Super Admin";
  if (r === "club_admin") return "Club Admin";
  return "User";
};

export default function StaffUsers() {
  const { toast } = useToast();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [selected, setSelected] = useState<UserRow | null>(null);
  const [clubs, setClubs] = useState<ClubOption[]>([]);
  const [assignClubId, setAssignClubId] = useState("");
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ users: UserRow[] }>("/api/admin/users");
      setRows(data.users);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api<{ clubs: ClubOption[] }>("/api/clubs?limit=999")
      .then(d => setClubs(d.clubs ?? []))
      .catch(() => {});
  }, []);

  const filtered = rows.filter(u => {
    const matchQ = !q.trim() ||
      u.name.toLowerCase().includes(q.toLowerCase()) ||
      u.email.toLowerCase().includes(q.toLowerCase());
    const matchRole =
      roleFilter === "all" ||
      (roleFilter === "super" ? !!u.is_super_user :
       roleFilter === "club_admin" ? u.role === "club_admin" && !u.is_super_user :
       u.role === "user");
    return matchQ && matchRole;
  });

  const openDetail = (u: UserRow) => {
    setSelected(u);
    setAssignClubId(u.club_id ? String(u.club_id) : "");
  };

  const promote = async () => {
    if (!selected) return;
    setActing(true);
    try {
      await api(`/api/admin/users/${selected.id}/assign-club`, {
        method: "POST",
        body: JSON.stringify({ club_id: assignClubId ? parseInt(assignClubId) : null }),
      });
      toast({ title: "Promoted to club admin", description: selected.name });
      setSelected(null);
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setActing(false); }
  };

  const demote = async () => {
    if (!selected) return;
    setActing(true);
    try {
      await api(`/api/admin/users/${selected.id}/role`, {
        method: "PUT",
        body: JSON.stringify({ role: "user" }),
      });
      toast({ title: "Role removed", description: `${selected.name} is now a regular user` });
      setSelected(null);
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setActing(false); }
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-[#1a5c38]/10 flex items-center justify-center">
          <Users className="h-5 w-5 text-[#1a5c38]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">User Management</h1>
          <p className="text-sm text-muted-foreground">View, search and manage platform users</p>
        </div>
      </div>

      <div className="flex gap-3 items-center flex-wrap">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search name or email…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <select
          className="border rounded-md px-3 py-2 text-sm bg-background h-10"
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
        >
          <option value="all">All roles</option>
          <option value="super">Super Admins</option>
          <option value="club_admin">Club Admins</option>
          <option value="user">Regular Users</option>
        </select>
        <span className="text-sm text-muted-foreground">
          {loading ? "Loading…" : `${filtered.length} user${filtered.length !== 1 ? "s" : ""}`}
        </span>
      </div>

      <div className="border rounded-lg overflow-hidden bg-background">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Name</th>
              <th className="text-left px-4 py-3 font-semibold">Email</th>
              <th className="text-left px-4 py-3 font-semibold">Role</th>
              <th className="text-left px-4 py-3 font-semibold">Club</th>
              <th className="text-left px-4 py-3 font-semibold">Joined</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b last:border-0">
                  {[0,1,2,3,4].map(j => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-12 text-muted-foreground">
                  No users found
                </td>
              </tr>
            ) : (
              filtered.map(u => (
                <tr
                  key={u.id}
                  className="border-b last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                  onClick={() => openDetail(u)}
                >
                  <td className="px-4 py-3 font-medium">{u.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${roleBadge(u.role, u.is_super_user)}`}>
                      {!!u.is_super_user && <Shield className="h-3 w-3" />}
                      {roleLabel(u.role, u.is_super_user)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{u.club_name ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {u.created_at ? format(new Date(u.created_at), "d MMM yyyy") : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Manage User</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div>
                <div className="font-semibold">{selected.name}</div>
                <div className="text-sm text-muted-foreground">{selected.email}</div>
                <div className="mt-2 flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${roleBadge(selected.role, selected.is_super_user)}`}>
                    {roleLabel(selected.role, selected.is_super_user)}
                  </span>
                  {selected.club_name && (
                    <span className="text-xs text-muted-foreground">· {selected.club_name}</span>
                  )}
                </div>
              </div>

              {!selected.is_super_user && (
                <div className="border-t pt-4 space-y-3">
                  <Label>Assign as Club Admin</Label>
                  <select
                    className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                    value={assignClubId}
                    onChange={e => setAssignClubId(e.target.value)}
                  >
                    <option value="">Platform Admin (no specific club)</option>
                    {clubs.map(c => (
                      <option key={c.id} value={String(c.id)}>
                        {c.name}{c.province ? ` · ${c.province}` : ""}
                      </option>
                    ))}
                  </select>
                  <Button
                    className="w-full bg-[#1a5c38] hover:bg-[#154a2e]"
                    onClick={promote}
                    disabled={acting}
                  >
                    Promote to Club Admin
                  </Button>
                  {selected.role === "club_admin" && (
                    <Button
                      variant="outline"
                      className="w-full text-destructive border-destructive/30 hover:bg-destructive/5"
                      onClick={demote}
                      disabled={acting}
                    >
                      <UserX className="h-4 w-4 mr-2" />
                      Remove Admin Role
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSelected(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
