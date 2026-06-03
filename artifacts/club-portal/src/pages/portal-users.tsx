import { useState, useEffect, useCallback } from "react";
import { useAuth, type Permissions, type Permission } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  UserPlus,
  MoreHorizontal,
  Pencil,
  KeyRound,
  Trash2,
  ShieldCheck,
  UserX,
  UserCheck,
} from "lucide-react";

interface PortalUser {
  id: number;
  name: string;
  email: string;
  role: "admin" | "member";
  permissions: Permissions;
  active: number;
  created_at: string;
}

const SECTIONS: { key: string; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "profile", label: "Club Profile" },
  { key: "schedule", label: "Tee Schedule" },
  { key: "payments", label: "Payments" },
  { key: "reviews", label: "Reviews" },
  { key: "ads", label: "Advertisements" },
  { key: "events", label: "Events" },
  { key: "members", label: "Members" },
  { key: "pricing", label: "Pricing Tiers" },
  { key: "vouchers", label: "Vouchers" },
  { key: "cancellation_policy", label: "Cancellation Policy" },
  { key: "notifications", label: "Notifications" },
];

const EMPTY_PERMISSIONS: Permissions = Object.fromEntries(
  SECTIONS.map(s => [s.key, "none"])
) as Permissions;

const FULL_PERMISSIONS: Permissions = Object.fromEntries(
  SECTIONS.map(s => [s.key, "edit"])
) as Permissions;

function permissionBadge(level: Permission) {
  if (level === "edit") return <Badge className="bg-green-100 text-green-800 border-green-200 font-normal text-[11px]">Edit</Badge>;
  if (level === "view") return <Badge className="bg-blue-100 text-blue-800 border-blue-200 font-normal text-[11px]">View</Badge>;
  return <Badge variant="outline" className="text-muted-foreground font-normal text-[11px]">None</Badge>;
}

function countPermissions(perms: Permissions) {
  const edit = SECTIONS.filter(s => perms[s.key] === "edit").length;
  const view = SECTIONS.filter(s => perms[s.key] === "view").length;
  return { edit, view, total: SECTIONS.length };
}

function PermissionsGrid({
  value,
  onChange,
}: {
  value: Permissions;
  onChange: (p: Permissions) => void;
}) {
  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="grid grid-cols-[1fr_80px_80px_80px] bg-muted/50 px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        <span>Section</span>
        <span className="text-center">No Access</span>
        <span className="text-center">View Only</span>
        <span className="text-center">Full Edit</span>
      </div>
      <div className="divide-y">
        {SECTIONS.map(s => (
          <div key={s.key} className="grid grid-cols-[1fr_80px_80px_80px] px-4 py-2.5 items-center hover:bg-muted/20">
            <span className="text-sm font-medium">{s.label}</span>
            {(["none", "view", "edit"] as Permission[]).map(level => (
              <div key={level} className="flex justify-center">
                <input
                  type="radio"
                  name={s.key}
                  checked={(value[s.key] ?? "none") === level}
                  onChange={() => onChange({ ...value, [s.key]: level })}
                  className="h-4 w-4 accent-[#1a5c38] cursor-pointer"
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PortalUsers() {
  const { isClubAdmin } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<PortalUser[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addPassword, setAddPassword] = useState("");
  const [addRole, setAddRole] = useState<"admin" | "member">("member");
  const [addPerms, setAddPerms] = useState<Permissions>(EMPTY_PERMISSIONS);
  const [addLoading, setAddLoading] = useState(false);

  const [editUser, setEditUser] = useState<PortalUser | null>(null);
  const [editPerms, setEditPerms] = useState<Permissions>(EMPTY_PERMISSIONS);
  const [editRole, setEditRole] = useState<"admin" | "member">("member");
  const [editLoading, setEditLoading] = useState(false);

  const [resetUser, setResetUser] = useState<PortalUser | null>(null);
  const [resetPw, setResetPw] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  const loadUsers = useCallback(() => {
    api<{ users: PortalUser[] }>("/api/portal/users")
      .then(d => setUsers(d.users))
      .catch(() => toast({ title: "Failed to load portal users", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [toast]);

  useEffect(() => {
    if (isClubAdmin) loadUsers();
    else setLoading(false);
  }, [isClubAdmin, loadUsers]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddLoading(true);
    try {
      await api("/api/portal/users", {
        method: "POST",
        body: JSON.stringify({ name: addName, email: addEmail, password: addPassword, role: addRole, permissions: addPerms }),
      });
      toast({ title: "User created" });
      setShowAdd(false);
      setAddName(""); setAddEmail(""); setAddPassword(""); setAddRole("member"); setAddPerms(EMPTY_PERMISSIONS);
      loadUsers();
    } catch (err: any) {
      toast({ title: err.message || "Failed to create user", variant: "destructive" });
    } finally {
      setAddLoading(false);
    }
  }

  async function handleEditSave() {
    if (!editUser) return;
    setEditLoading(true);
    try {
      await api(`/api/portal/users/${editUser.id}`, {
        method: "PUT",
        body: JSON.stringify({ role: editRole, permissions: editPerms }),
      });
      toast({ title: "Permissions updated" });
      setEditUser(null);
      loadUsers();
    } catch (err: any) {
      toast({ title: err.message || "Failed to update", variant: "destructive" });
    } finally {
      setEditLoading(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resetUser) return;
    setResetLoading(true);
    try {
      await api(`/api/portal/users/${resetUser.id}/password`, {
        method: "PUT",
        body: JSON.stringify({ password: resetPw }),
      });
      toast({ title: "Password updated" });
      setResetUser(null);
      setResetPw("");
    } catch (err: any) {
      toast({ title: err.message || "Failed to reset password", variant: "destructive" });
    } finally {
      setResetLoading(false);
    }
  }

  async function toggleActive(u: PortalUser) {
    try {
      await api(`/api/portal/users/${u.id}`, {
        method: "PUT",
        body: JSON.stringify({ active: u.active ? 0 : 1 }),
      });
      toast({ title: u.active ? "User deactivated" : "User activated" });
      loadUsers();
    } catch (err: any) {
      toast({ title: err.message || "Failed to update", variant: "destructive" });
    }
  }

  async function handleDelete(u: PortalUser) {
    if (!confirm(`Delete ${u.name}? This cannot be undone.`)) return;
    try {
      await api(`/api/portal/users/${u.id}`, { method: "DELETE" });
      toast({ title: "User deleted" });
      loadUsers();
    } catch (err: any) {
      toast({ title: err.message || "Failed to delete", variant: "destructive" });
    }
  }

  if (!isClubAdmin) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <ShieldCheck className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-muted-foreground font-medium">Admin access required</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Portal Users</h1>
          <p className="text-muted-foreground mt-1">
            Manage who can access your club portal and control what each person can view or edit.
          </p>
        </div>
        <Button
          className="bg-[#1a5c38] hover:bg-[#164d30] gap-2"
          onClick={() => { setShowAdd(true); setAddPerms(EMPTY_PERMISSIONS); }}
        >
          <UserPlus className="h-4 w-4" />
          Add user
        </Button>
      </div>

      {loading ? (
        <div className="text-muted-foreground py-12 text-center">Loading…</div>
      ) : users.length === 0 ? (
        <div className="text-center py-16 border rounded-xl bg-muted/20">
          <ShieldCheck className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium text-gray-700">No portal users yet</p>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            Add staff members and control exactly what they can access.
          </p>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => setShowAdd(true)}
          >
            <UserPlus className="h-4 w-4" />
            Add first user
          </Button>
        </div>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="font-semibold">Name</TableHead>
                <TableHead className="font-semibold">Email</TableHead>
                <TableHead className="font-semibold">Role</TableHead>
                <TableHead className="font-semibold">Access</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map(u => {
                const { edit, view } = countPermissions(u.permissions ?? {});
                return (
                  <TableRow key={u.id} className={!u.active ? "opacity-50" : undefined}>
                    <TableCell className="font-medium">{u.name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{u.email}</TableCell>
                    <TableCell>
                      {u.role === "admin"
                        ? <Badge className="bg-[#1a5c38]/10 text-[#1a5c38] border-[#1a5c38]/20 font-medium text-[11px]">Admin</Badge>
                        : <Badge variant="outline" className="font-normal text-[11px]">Member</Badge>
                      }
                    </TableCell>
                    <TableCell>
                      {u.role === "admin" ? (
                        <span className="text-xs text-muted-foreground">Full access</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {edit} edit · {view} view
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {u.active
                        ? <Badge className="bg-green-100 text-green-800 border-green-200 font-normal text-[11px]">Active</Badge>
                        : <Badge variant="outline" className="text-muted-foreground font-normal text-[11px]">Inactive</Badge>
                      }
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setEditUser(u);
                              setEditPerms({ ...EMPTY_PERMISSIONS, ...u.permissions });
                              setEditRole(u.role);
                            }}
                          >
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit permissions
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setResetUser(u); setResetPw(""); }}>
                            <KeyRound className="h-4 w-4 mr-2" />
                            Reset password
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => toggleActive(u)}>
                            {u.active
                              ? <><UserX className="h-4 w-4 mr-2" />Deactivate</>
                              : <><UserCheck className="h-4 w-4 mr-2" />Activate</>
                            }
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => handleDelete(u)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete user
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add User Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add portal user</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="add-name">Full name</Label>
                <Input id="add-name" value={addName} onChange={e => setAddName(e.target.value)} required placeholder="Jane Smith" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-email">Email</Label>
                <Input id="add-email" type="email" value={addEmail} onChange={e => setAddEmail(e.target.value)} required placeholder="jane@example.com" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="add-password">Temporary password</Label>
                <Input id="add-password" type="text" value={addPassword} onChange={e => setAddPassword(e.target.value)} required placeholder="Min. 6 characters" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-role">Role</Label>
                <Select value={addRole} onValueChange={(v: any) => {
                  setAddRole(v);
                  if (v === "admin") setAddPerms(FULL_PERMISSIONS);
                  else setAddPerms(EMPTY_PERMISSIONS);
                }}>
                  <SelectTrigger id="add-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Member — limited access</SelectItem>
                    <SelectItem value="admin">Admin — full access</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {addRole === "member" && (
              <div className="space-y-2">
                <Label>Section permissions</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Choose what this user can see and do in each section.
                </p>
                <PermissionsGrid value={addPerms} onChange={setAddPerms} />
                <div className="flex gap-2 pt-1">
                  <Button type="button" variant="outline" size="sm" onClick={() => setAddPerms(FULL_PERMISSIONS)}>
                    Grant all
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setAddPerms(EMPTY_PERMISSIONS)}>
                    Clear all
                  </Button>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button type="submit" className="bg-[#1a5c38] hover:bg-[#164d30]" disabled={addLoading}>
                {addLoading ? "Creating…" : "Create user"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Permissions Dialog */}
      <Dialog open={!!editUser} onOpenChange={v => { if (!v) setEditUser(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit permissions — {editUser?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={editRole} onValueChange={(v: any) => {
                setEditRole(v);
                if (v === "admin") setEditPerms(FULL_PERMISSIONS);
              }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member — limited access</SelectItem>
                  <SelectItem value="admin">Admin — full access</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editRole === "member" && (
              <div className="space-y-2">
                <Label>Section permissions</Label>
                <PermissionsGrid value={editPerms} onChange={setEditPerms} />
                <div className="flex gap-2 pt-1">
                  <Button type="button" variant="outline" size="sm" onClick={() => setEditPerms(FULL_PERMISSIONS)}>
                    Grant all
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setEditPerms(EMPTY_PERMISSIONS)}>
                    Clear all
                  </Button>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditUser(null)}>Cancel</Button>
              <Button className="bg-[#1a5c38] hover:bg-[#164d30]" onClick={handleEditSave} disabled={editLoading}>
                {editLoading ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={!!resetUser} onOpenChange={v => { if (!v) setResetUser(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset password — {resetUser?.name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reset-pw">New password</Label>
              <Input
                id="reset-pw"
                type="text"
                value={resetPw}
                onChange={e => setResetPw(e.target.value)}
                required
                minLength={6}
                placeholder="Min. 6 characters"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setResetUser(null)}>Cancel</Button>
              <Button type="submit" className="bg-[#1a5c38] hover:bg-[#164d30]" disabled={resetLoading}>
                {resetLoading ? "Updating…" : "Update password"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
