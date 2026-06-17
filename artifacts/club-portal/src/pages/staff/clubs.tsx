import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Flag, Search, ChevronLeft, ChevronRight, Star, Eye, EyeOff, UserPlus, CheckCircle2, Trash2, KeyRound, Pencil, X, ShieldCheck } from "lucide-react";

interface ClubRow {
  id: number;
  name: string;
  location: string;
  province: string;
  holes: number;
  price_from: string | null;
  active: number;
  featured: number;
  created_at: string;
  has_portal: number;
  username: string | null;
}

interface PortalAccount {
  id: number;
  name: string;
  email: string;
  role: string;
  active: boolean;
  created_at: string;
}

const SA_PROVINCES = [
  "Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal",
  "Limpopo", "Mpumalanga", "North West", "Northern Cape", "Western Cape",
];

// ── Portal Account Dialog ──────────────────────────────────────────────────────
function PortalAccountDialog({
  club,
  onClose,
  onChanged,
}: {
  club: ClubRow;
  onClose: () => void;
  onChanged: (clubId: number, hasPortal: number) => void;
}) {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<PortalAccount[]>([]);
  const [loading, setLoading]   = useState(true);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Create form
  const [name, setName]         = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("Golf2026!");
  const [saving, setSaving]     = useState(false);

  // Edit state
  const [editingId, setEditingId]       = useState<number | null>(null);
  const [editName, setEditName]         = useState("");
  const [editEmail, setEditEmail]       = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editSaving, setEditSaving]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ accounts: PortalAccount[] }>(`/api/admin/clubs/${club.id}/portal-accounts`);
      setAccounts(data.accounts);
      setShowForm(data.accounts.length === 0);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [club.id, toast]);

  useEffect(() => { load(); }, [load]);

  const startEdit = (a: PortalAccount) => {
    setEditingId(a.id);
    setEditName(a.name);
    setEditEmail(a.email);
    setEditPassword("");
    setShowForm(false);
  };

  const cancelEdit = () => { setEditingId(null); setEditName(""); setEditEmail(""); setEditPassword(""); };

  const saveEdit = async () => {
    if (!editName.trim() || !editEmail.trim() || editingId == null) return;
    setEditSaving(true);
    try {
      const data = await api<{ account: PortalAccount }>(`/api/admin/clubs/${club.id}/portal-accounts/${editingId}`, {
        method: "PUT",
        body: JSON.stringify({ name: editName.trim(), email: editEmail.trim(), password: editPassword || undefined }),
      });
      setAccounts(prev => prev.map(a => a.id === editingId ? data.account : a));
      cancelEdit();
      toast({ title: "Account updated", description: data.account.email });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setEditSaving(false); }
  };

  const create = async () => {
    if (!name.trim() || !email.trim() || !password) return;
    setSaving(true);
    try {
      const data = await api<{ account: PortalAccount }>(`/api/admin/clubs/${club.id}/portal-accounts`, {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password }),
      });
      setAccounts(prev => [...prev, data.account]);
      onChanged(club.id, 1);
      setName(""); setEmail(""); setPassword("Golf2026!");
      setShowForm(false);
      toast({ title: "Account created", description: `${data.account.email} can now log in to the portal.` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const remove = async (userId: number, userEmail: string) => {
    if (!confirm(`Remove portal access for ${userEmail}?`)) return;
    setDeleting(userId);
    try {
      await api(`/api/admin/clubs/${club.id}/portal-accounts/${userId}`, { method: "DELETE" });
      const remaining = accounts.filter(a => a.id !== userId);
      setAccounts(remaining);
      onChanged(club.id, remaining.length > 0 ? 1 : 0);
      toast({ title: "Account removed", description: userEmail });
      if (remaining.length === 0) setShowForm(true);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setDeleting(null); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-[#1a5c38]" />
            Portal Access — {club.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Existing accounts */}
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : accounts.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Existing accounts</p>
              {accounts.map(a => (
                <div key={a.id} className="rounded-lg border overflow-hidden">
                  {/* Row summary */}
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{a.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{a.email} · {a.role}</p>
                    </div>
                    <Button
                      variant="ghost" size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-[#1a5c38]"
                      onClick={() => editingId === a.id ? cancelEdit() : startEdit(a)}
                      title={editingId === a.id ? "Cancel edit" : "Edit account"}
                    >
                      {editingId === a.id ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                    </Button>
                    <Button
                      variant="ghost" size="sm"
                      className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                      onClick={() => remove(a.id, a.email)}
                      disabled={deleting === a.id}
                      title="Remove account"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {/* Inline edit form */}
                  {editingId === a.id && (
                    <div className="border-t bg-muted/30 px-3 py-3 space-y-2">
                      <Input
                        placeholder="Contact name"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                      />
                      <Input
                        type="email"
                        placeholder="Email address"
                        value={editEmail}
                        onChange={e => setEditEmail(e.target.value)}
                      />
                      <Input
                        type="text"
                        placeholder="New password (leave blank to keep current)"
                        value={editPassword}
                        onChange={e => setEditPassword(e.target.value)}
                      />
                      <div className="flex justify-end gap-2 pt-1">
                        <Button variant="outline" size="sm" onClick={cancelEdit}>Cancel</Button>
                        <Button
                          size="sm"
                          className="bg-[#1a5c38] hover:bg-[#154d30]"
                          onClick={saveEdit}
                          disabled={editSaving || !editName.trim() || !editEmail.trim()}
                        >
                          {editSaving ? "Saving…" : "Save changes"}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : null}

          {/* Create form */}
          {!showForm && accounts.length > 0 ? (
            <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={() => { setShowForm(true); cancelEdit(); }}>
              <UserPlus className="h-3.5 w-3.5" /> Add another account
            </Button>
          ) : showForm ? (
            <div className="space-y-3 rounded-lg border p-4 bg-muted/30">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {accounts.length === 0 ? "Create portal account" : "New account"}
              </p>
              <div className="space-y-2">
                <Input
                  placeholder="Contact name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
                <Input
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
                <Input
                  type="text"
                  placeholder="Password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground">Share these credentials with the club. They can change their password after first login.</p>
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
          {showForm && (
            <Button
              className="bg-[#1a5c38] hover:bg-[#154d30] gap-1.5"
              onClick={create}
              disabled={saving || !name.trim() || !email.trim() || !password}
            >
              <UserPlus className="h-4 w-4" />
              {saving ? "Creating…" : "Create account"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Club Credentials Dialog ────────────────────────────────────────────────────
function ClubCredentialsDialog({ club, onClose, onUpdated }: {
  club: ClubRow;
  onClose: () => void;
  onUpdated: (clubId: number, username: string) => void;
}) {
  const { toast } = useToast();
  const [username, setUsername] = useState(club.username ?? "");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!username.trim()) return;
    setSaving(true);
    try {
      const data = await api<{ club: { id: number; username: string } }>(`/api/admin/clubs/${club.id}/credentials`, {
        method: "PUT",
        body: JSON.stringify({ username: username.trim(), password: password || undefined }),
      });
      onUpdated(club.id, data.club.username);
      toast({ title: "Credentials updated", description: `Username: ${data.club.username}${password ? " · Password reset" : ""}` });
      onClose();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[#1a5c38]" />
            Club Admin credentials — {club.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <p className="text-xs text-muted-foreground">
            The <strong>Club Admin</strong> account logs in via the <em>Club Admin</em> tab with a username + password. This is different from Club Staff accounts (which use email).
          </p>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Username</label>
              <Input
                placeholder="e.g. soutpansberg_golf_club"
                value={username}
                onChange={e => setUsername(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Spaces and special characters are converted to underscores automatically.</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">New password <span className="text-muted-foreground font-normal">(leave blank to keep current)</span></label>
              <Input
                type="text"
                placeholder="New password"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>
          </div>
          {club.username && (
            <div className="rounded-lg bg-muted/50 border px-3 py-2 text-xs text-muted-foreground">
              Current username: <span className="font-mono font-medium text-foreground">{club.username}</span>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            className="bg-[#1a5c38] hover:bg-[#154d30] gap-1.5"
            onClick={save}
            disabled={saving || !username.trim()}
          >
            <ShieldCheck className="h-4 w-4" />
            {saving ? "Saving…" : "Save credentials"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function StaffClubs() {
  const { toast } = useToast();
  const [clubs, setClubs] = useState<ClubRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [province, setProvince] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [portalFilter, setPortalFilter] = useState("");
  const [page, setPage] = useState(1);
  const [toggling, setToggling] = useState<number | null>(null);
  const [portalClub, setPortalClub] = useState<ClubRow | null>(null);
  const [credsClub, setCredsClub] = useState<ClubRow | null>(null);
  const LIMIT = 30;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q)             params.set("q", q);
      if (province)      params.set("province", province);
      if (activeFilter)  params.set("active", activeFilter);
      params.set("page", String(page));
      params.set("limit", String(LIMIT));
      const data = await api<{ clubs: ClubRow[]; total: number }>(`/api/admin/clubs-list?${params}`);
      let rows = data.clubs;
      if (portalFilter === "1")   rows = rows.filter(c => c.has_portal > 0);
      if (portalFilter === "0")   rows = rows.filter(c => c.has_portal === 0);
      setClubs(rows);
      setTotal(data.total);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [q, province, activeFilter, portalFilter, page, toast]);

  useEffect(() => { load(); }, [load]);

  const resetPage = () => setPage(1);

  const toggleActive = async (club: ClubRow) => {
    setToggling(club.id);
    try {
      const data = await api<{ club: { id: number; active: number } }>(`/api/admin/clubs/${club.id}/toggle`, { method: "PUT" });
      setClubs(prev => prev.map(c => c.id === club.id ? { ...c, active: data.club.active } : c));
      toast({ title: data.club.active ? "Club activated" : "Club deactivated", description: club.name });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setToggling(null); }
  };

  const toggleFeatured = async (club: ClubRow) => {
    setToggling(club.id * -1);
    try {
      const data = await api<{ club: { id: number; featured: number } }>(`/api/admin/clubs/${club.id}/toggle-featured`, { method: "PUT" });
      setClubs(prev => prev.map(c => c.id === club.id ? { ...c, featured: data.club.featured } : c));
      toast({ title: data.club.featured ? "Marked as featured" : "Removed from featured", description: club.name });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setToggling(null); }
  };

  const handlePortalChanged = (clubId: number, hasPortal: number) => {
    setClubs(prev => prev.map(c => c.id === clubId ? { ...c, has_portal: hasPortal } : c));
  };

  const handleCredentialsUpdated = (clubId: number, username: string) => {
    setClubs(prev => prev.map(c => c.id === clubId ? { ...c, username } : c));
  };

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-[#1a5c38]/10 flex items-center justify-center">
          <Flag className="h-5 w-5 text-[#1a5c38]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Club Management</h1>
          <p className="text-sm text-muted-foreground">
            {loading ? "Loading…" : `${total} golf clubs`}
          </p>
        </div>
      </div>

      <div className="flex gap-3 items-center flex-wrap">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search clubs…"
            value={q}
            onChange={e => { setQ(e.target.value); resetPage(); }}
          />
        </div>
        <select
          className="border rounded-md px-3 py-2 text-sm bg-background h-10"
          value={province}
          onChange={e => { setProvince(e.target.value); resetPage(); }}
        >
          <option value="">All provinces</option>
          {SA_PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select
          className="border rounded-md px-3 py-2 text-sm bg-background h-10"
          value={activeFilter}
          onChange={e => { setActiveFilter(e.target.value); resetPage(); }}
        >
          <option value="">Active &amp; Inactive</option>
          <option value="1">Active only</option>
          <option value="0">Inactive only</option>
        </select>
        <select
          className="border rounded-md px-3 py-2 text-sm bg-background h-10"
          value={portalFilter}
          onChange={e => { setPortalFilter(e.target.value); resetPage(); }}
        >
          <option value="">All portal status</option>
          <option value="1">Has portal access</option>
          <option value="0">No portal access</option>
        </select>
      </div>

      <div className="border rounded-lg overflow-hidden bg-background">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Name</th>
              <th className="text-left px-4 py-3 font-semibold">Province</th>
              <th className="text-left px-4 py-3 font-semibold">Location</th>
              <th className="text-center px-4 py-3 font-semibold">Holes</th>
              <th className="text-right px-4 py-3 font-semibold">Price from</th>
              <th className="text-center px-4 py-3 font-semibold">Club Admin</th>
              <th className="text-center px-4 py-3 font-semibold">Portal</th>
              <th className="text-center px-4 py-3 font-semibold">Featured</th>
              <th className="text-center px-4 py-3 font-semibold">Active</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <tr key={i} className="border-b last:border-0">
                  {[0,1,2,3,4,5,6,7,8].map(j => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))
            ) : clubs.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-12 text-muted-foreground">
                  No clubs found
                </td>
              </tr>
            ) : (
              clubs.map(c => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.province}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs max-w-[140px] truncate">{c.location}</td>
                  <td className="px-4 py-3 text-center text-muted-foreground">{c.holes}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {c.price_from ? `R${parseFloat(c.price_from).toFixed(0)}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => setCredsClub(c)}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold transition-colors ${
                        c.username
                          ? "bg-blue-50 text-blue-700 hover:bg-blue-100"
                          : "bg-gray-100 text-gray-500 hover:bg-blue-50 hover:text-blue-600"
                      }`}
                      title="Edit club admin credentials"
                    >
                      <ShieldCheck className="h-3 w-3" />
                      {c.username ? c.username : "Set up"}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {c.has_portal > 0 ? (
                      <button
                        onClick={() => setPortalClub(c)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
                        title="Manage portal access"
                      >
                        <CheckCircle2 className="h-3 w-3" /> Active
                      </button>
                    ) : (
                      <button
                        onClick={() => setPortalClub(c)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500 hover:bg-blue-100 hover:text-blue-700 transition-colors"
                        title="Create portal account"
                      >
                        <UserPlus className="h-3 w-3" /> Set up
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => toggleFeatured(c)}
                      disabled={toggling !== null}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold transition-colors ${
                        c.featured
                          ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                          : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                      }`}
                      title={c.featured ? "Remove from featured" : "Mark as featured"}
                    >
                      <Star className="h-3 w-3" fill={c.featured ? "currentColor" : "none"} />
                      {c.featured ? "Featured" : "Normal"}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => toggleActive(c)}
                      disabled={toggling !== null}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold transition-colors ${
                        c.active
                          ? "bg-green-100 text-green-700 hover:bg-green-200"
                          : "bg-red-100 text-red-600 hover:bg-red-200"
                      }`}
                    >
                      {c.active ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                      {c.active ? "Active" : "Hidden"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages} · {total} clubs
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {portalClub && (
        <PortalAccountDialog
          club={portalClub}
          onClose={() => setPortalClub(null)}
          onChanged={handlePortalChanged}
        />
      )}

      {credsClub && (
        <ClubCredentialsDialog
          club={credsClub}
          onClose={() => setCredsClub(null)}
          onUpdated={handleCredentialsUpdated}
        />
      )}
    </div>
  );
}
