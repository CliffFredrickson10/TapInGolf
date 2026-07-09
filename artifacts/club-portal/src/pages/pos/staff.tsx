import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, KeyRound, Fingerprint } from "lucide-react";

export default function PosStaff() {
  const { toast } = useToast();
  const { posStaff, posOutlet } = useAuth();
  const [staff, setStaff] = useState<any[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: "", password: "" });
  const [saving, setSaving] = useState(false);
  const [resetTarget, setResetTarget] = useState<any | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const roleLabel = posOutlet?.type === "pro_shop" ? "Cashier" : "Waiter";

  const load = useCallback(() => {
    api<{ staff: any[] }>("/api/pos/staff").then(r => setStaff(r.staff)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await api("/api/pos/staff", { method: "POST", body: JSON.stringify(form) });
      toast({ title: `${roleLabel} added`, description: "They can now unlock the terminal with their PIN." });
      setDialogOpen(false);
      setForm({ name: "", password: "" });
      load();
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (member: any) => {
    try {
      await api(`/api/pos/staff/${member.id}`, { method: "PUT", body: JSON.stringify({ active: member.active ? 0 : 1 }) });
      load();
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    }
  };

  const resetPassword = async () => {
    const minLen = resetTarget?.role === "manager" ? 6 : 4;
    if (!resetTarget || newPassword.length < minLen) return;
    try {
      await api(`/api/pos/staff/${resetTarget.id}`, { method: "PUT", body: JSON.stringify({ password: newPassword }) });
      toast({ title: resetTarget.role === "manager" ? "Password updated" : "PIN updated" });
      setResetTarget(null);
      setNewPassword("");
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    }
  };

  const removeFingerprint = async (member: any) => {
    if (!confirm(`Remove ${member.name}'s registered fingerprint? They can re-register after unlocking with their PIN.`)) return;
    try {
      await api(`/api/pos/staff/${member.id}/fingerprints`, { method: "DELETE" });
      toast({ title: "Fingerprint removed" });
      load();
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Staff</h1>
          <p className="text-sm text-muted-foreground">
            {roleLabel}s don't sign in — they appear on the terminal's list and unlock with their own PIN or fingerprint. Manager accounts are created by your club admin.
          </p>
        </div>
        <Button className="bg-[#1a5c38] hover:bg-[#164d30]" onClick={() => setDialogOpen(true)} data-testid="button-add-staff">
          <Plus className="h-4 w-4 mr-2" /> Add {roleLabel.toLowerCase()}
        </Button>
      </div>

      <div className="bg-white rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Sign-in</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-56"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {staff.map(m => (
              <TableRow key={m.id} data-testid={`staff-row-${m.id}`} className={m.active ? "" : "opacity-50"}>
                <TableCell className="font-medium">{m.name}{m.id === posStaff?.id ? " (you)" : ""}</TableCell>
                <TableCell><Badge variant={m.role === "manager" ? "default" : "secondary"} className={m.role === "manager" ? "bg-[#1a5c38]" : ""}>{m.role === "manager" ? "manager" : roleLabel.toLowerCase()}</Badge></TableCell>
                <TableCell className="text-sm">
                  {m.role === "manager" ? (
                    <span>{m.email}</span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      PIN{m.has_fingerprint && <span className="inline-flex items-center gap-0.5 text-[#1a5c38]"><Fingerprint className="h-3.5 w-3.5" /> + fingerprint</span>}
                    </span>
                  )}
                </TableCell>
                <TableCell>{m.active ? <Badge variant="secondary">Active</Badge> : <Badge variant="outline">Disabled</Badge>}</TableCell>
                <TableCell>
                  {(m.role !== "manager" || m.id === posStaff?.id) && (
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="ghost" className="text-xs" onClick={() => setResetTarget(m)}>
                        <KeyRound className="h-3.5 w-3.5 mr-1" /> {m.role === "manager" ? "Password" : "PIN"}
                      </Button>
                      {m.has_fingerprint && m.role !== "manager" && (
                        <Button size="sm" variant="ghost" className="text-xs" onClick={() => removeFingerprint(m)} data-testid={`button-remove-fingerprint-${m.id}`}>
                          <Fingerprint className="h-3.5 w-3.5 mr-1" /> Remove
                        </Button>
                      )}
                      {m.id !== posStaff?.id && (
                        <Button size="sm" variant="ghost" className="text-xs" onClick={() => toggleActive(m)} data-testid={`button-toggle-staff-${m.id}`}>
                          {m.active ? "Disable" : "Enable"}
                        </Button>
                      )}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {staff.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No staff yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add {roleLabel.toLowerCase()}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} data-testid="input-staff-name" />
            </div>
            <div className="space-y-1.5">
              <Label>PIN * (min 4 digits — they'll type this on the terminal)</Label>
              <Input type="password" inputMode="numeric" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} data-testid="input-staff-password" />
            </div>
            <p className="text-xs text-muted-foreground">
              No email or login needed. {form.name.trim() || `The ${roleLabel.toLowerCase()}`} will appear on the terminal's "Who's serving?" list and can also register a fingerprint on devices with a scanner.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button className="bg-[#1a5c38] hover:bg-[#164d30]" disabled={!form.name.trim() || form.password.length < 4 || saving} onClick={create} data-testid="button-save-staff">
              {saving ? "Adding…" : `Add ${roleLabel.toLowerCase()}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetTarget} onOpenChange={(o) => { if (!o) { setResetTarget(null); setNewPassword(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{resetTarget?.role === "manager" ? "Reset password" : "Reset PIN"} — {resetTarget?.name}</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label>{resetTarget?.role === "manager" ? "New password (min 6 characters)" : "New PIN (min 4 digits)"}</Label>
            <Input type="password" inputMode={resetTarget?.role === "manager" ? undefined : "numeric"} value={newPassword} onChange={e => setNewPassword(e.target.value)} data-testid="input-reset-password" />
          </div>
          <DialogFooter>
            <Button className="bg-[#1a5c38] hover:bg-[#164d30]" disabled={newPassword.length < (resetTarget?.role === "manager" ? 6 : 4)} onClick={resetPassword}>
              Update
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
