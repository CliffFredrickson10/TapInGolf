import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Store, Plus, KeyRound, Power } from "lucide-react";
import { format, parseISO } from "date-fns";

interface Reseller {
  id: number;
  name: string;
  contact_email: string;
  username: string;
  active: boolean;
  created_at: string;
  purchase_count: number;
  total_spent: number;
}

export default function StaffResellers() {
  const { toast } = useToast();
  const [resellers, setResellers] = useState<Reseller[]>([]);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: "", contact_email: "", username: "", password: "" });
  const [saving, setSaving] = useState(false);

  const [resetTarget, setResetTarget] = useState<Reseller | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const load = useCallback(() =>
    api<{ resellers: Reseller[] }>("/api/admin/resellers")
      .then((data) => setResellers(data.resellers))
      .catch((e) => toast({ title: "Error loading resellers", description: e.message, variant: "destructive" }))
      .finally(() => setLoading(false)),
    [toast]
  );

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setSaving(true);
    try {
      await api("/api/admin/resellers", { method: "POST", body: JSON.stringify(form) });
      toast({ title: "Reseller created", description: `${form.name} can now sign in to the portal with username "${form.username.trim().toLowerCase()}".` });
      setCreateOpen(false);
      setForm({ name: "", contact_email: "", username: "", password: "" });
      load();
    } catch (e: any) {
      toast({ title: "Could not create reseller", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (r: Reseller) => {
    try {
      await api(`/api/admin/resellers/${r.id}`, { method: "PATCH", body: JSON.stringify({ active: !r.active }) });
      toast({ title: r.active ? "Reseller deactivated" : "Reseller activated" });
      load();
    } catch (e: any) {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    }
  };

  const resetPassword = async () => {
    if (!resetTarget) return;
    setSaving(true);
    try {
      await api(`/api/admin/resellers/${resetTarget.id}`, { method: "PATCH", body: JSON.stringify({ password: newPassword }) });
      toast({ title: "Password reset", description: `New password set for ${resetTarget.name}.` });
      setResetTarget(null);
      setNewPassword("");
    } catch (e: any) {
      toast({ title: "Reset failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-8 max-w-5xl w-full mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Store className="h-6 w-6 text-[#1a5c38]" /> Resellers
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Reseller companies that can buy listed tee times from participating clubs.
          </p>
        </div>
        <Button className="bg-[#1a5c38] hover:bg-[#164d30]" onClick={() => setCreateOpen(true)} data-testid="button-create-reseller">
          <Plus className="h-4 w-4 mr-1.5" /> New reseller
        </Button>
      </div>

      {loading ? (
        <div className="grid gap-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
      ) : resellers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Store className="h-8 w-8 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No reseller accounts yet</p>
            <p className="text-xs mt-1">Create the first reseller account to give a partner access to the marketplace.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {resellers.map((r) => (
            <Card key={r.id} data-testid={`card-reseller-${r.id}`}>
              <CardContent className="flex items-center gap-4 py-4">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold flex items-center gap-2">
                    {r.name}
                    {!r.active && <Badge variant="secondary">Disabled</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    @{r.username} · {r.contact_email} · since {format(parseISO(r.created_at), "d MMM yyyy")}
                  </div>
                </div>
                <div className="text-right text-sm">
                  <div className="font-semibold">{r.purchase_count} purchase{r.purchase_count === 1 ? "" : "s"}</div>
                  <div className="text-xs text-muted-foreground">R{r.total_spent.toFixed(2)} total</div>
                </div>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" onClick={() => setResetTarget(r)} data-testid={`button-reset-${r.id}`}>
                    <KeyRound className="h-3.5 w-3.5 mr-1" /> Reset password
                  </Button>
                  <Button
                    variant={r.active ? "outline" : "default"}
                    size="sm"
                    className={r.active ? "text-destructive hover:text-destructive" : "bg-[#1a5c38] hover:bg-[#164d30]"}
                    onClick={() => toggleActive(r)}
                    data-testid={`button-toggle-${r.id}`}
                  >
                    <Power className="h-3.5 w-3.5 mr-1" /> {r.active ? "Deactivate" : "Activate"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New reseller account</DialogTitle>
            <DialogDescription>The reseller signs in on the portal login page under the "Reseller" tab.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="r-name">Company name</Label>
              <Input id="r-name" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. GolfDeals SA" data-testid="input-reseller-name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-email">Contact email</Label>
              <Input id="r-email" type="email" value={form.contact_email} onChange={(e) => setForm(f => ({ ...f, contact_email: e.target.value }))} placeholder="ops@golfdeals.co.za" data-testid="input-reseller-email" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-username">Username</Label>
              <Input id="r-username" value={form.username} onChange={(e) => setForm(f => ({ ...f, username: e.target.value }))} placeholder="golfdeals" data-testid="input-reseller-username" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-password">Password</Label>
              <Input id="r-password" type="text" value={form.password} onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Min 8 characters" data-testid="input-reseller-password" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              className="bg-[#1a5c38] hover:bg-[#164d30]"
              disabled={saving || !form.name || !form.contact_email || !form.username || form.password.length < 8}
              onClick={create}
              data-testid="button-save-reseller"
            >
              {saving ? "Creating…" : "Create account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset password dialog */}
      <Dialog open={!!resetTarget} onOpenChange={(o) => { if (!o) { setResetTarget(null); setNewPassword(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>{resetTarget && `Set a new password for ${resetTarget.name}.`}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="new-pass">New password</Label>
            <Input id="new-pass" type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min 8 characters" data-testid="input-new-password" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetTarget(null)}>Cancel</Button>
            <Button className="bg-[#1a5c38] hover:bg-[#164d30]" disabled={saving || newPassword.length < 8} onClick={resetPassword} data-testid="button-confirm-reset">
              {saving ? "Saving…" : "Reset password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
