import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Flag, Search, ChevronLeft, ChevronRight, Star, Eye, EyeOff, ShieldCheck } from "lucide-react";

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
  username: string | null;
}

const SA_PROVINCES = [
  "Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal",
  "Limpopo", "Mpumalanga", "North West", "Northern Cape", "Western Cape",
];

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
            The <strong>Club Admin</strong> account logs in via the <em>Club Admin</em> tab with a username + password.
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
              <label className="text-sm font-medium">
                New password <span className="text-muted-foreground font-normal">(leave blank to keep current)</span>
              </label>
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
  const [page, setPage] = useState(1);
  const [toggling, setToggling] = useState<number | null>(null);
  const [credsClub, setCredsClub] = useState<ClubRow | null>(null);
  const LIMIT = 30;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q)            params.set("q", q);
      if (province)     params.set("province", province);
      if (activeFilter) params.set("active", activeFilter);
      params.set("page", String(page));
      params.set("limit", String(LIMIT));
      const data = await api<{ clubs: ClubRow[]; total: number }>(`/api/admin/clubs-list?${params}`);
      setClubs(data.clubs);
      setTotal(data.total);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [q, province, activeFilter, page, toast]);

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
              <th className="text-center px-4 py-3 font-semibold">Featured</th>
              <th className="text-center px-4 py-3 font-semibold">Active</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <tr key={i} className="border-b last:border-0">
                  {[0,1,2,3,4,5,6,7].map(j => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))
            ) : clubs.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-12 text-muted-foreground">
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
