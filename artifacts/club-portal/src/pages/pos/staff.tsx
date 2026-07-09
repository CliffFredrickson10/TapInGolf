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
import { Plus, KeyRound } from "lucide-react";

export default function PosStaff() {
  const { toast } = useToast();
  const { posStaff, posOutlet } = useAuth();
  const [staff, setStaff] = useState<any[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
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
      toast({ title: `${roleLabel} account created` });
      setDialogOpen(false);
      setForm({ name: "", email: "", password: "" });
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
    if (!resetTarget || newPassword.length < 6) return;
    try {
      await api(`/api/pos/staff/${resetTarget.id}`, { method: "PUT", body: JSON.stringify({ password: newPassword }) });
      toast({ title: "Password updated" });
      setResetTarget(null);
      setNewPassword("");
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Staff</h1>
          <p className="text-sm text-muted-foreground">{roleLabel} accounts for this outlet. Manager accounts are created by your club admin.</p>
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
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-40"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {staff.map(m => (
              <TableRow key={m.id} data-testid={`staff-row-${m.id}`} className={m.active ? "" : "opacity-50"}>
                <TableCell className="font-medium">{m.name}{m.id === posStaff?.id ? " (you)" : ""}</TableCell>
                <TableCell className="text-sm">{m.email}</TableCell>
                <TableCell><Badge variant={m.role === "manager" ? "default" : "secondary"} className={m.role === "manager" ? "bg-[#1a5c38]" : ""}>{m.role}</Badge></TableCell>
                <TableCell>{m.active ? <Badge variant="secondary">Active</Badge> : <Badge variant="outline">Disabled</Badge>}</TableCell>
                <TableCell>
                  {(m.role !== "manager" || m.id === posStaff?.id) && (
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="ghost" className="text-xs" onClick={() => setResetTarget(m)}>
                        <KeyRound className="h-3.5 w-3.5 mr-1" /> Password
                      </Button>
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
              <Label>Email *</Label>
              <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} data-testid="input-staff-email" />
            </div>
            <div className="space-y-1.5">
              <Label>Password * (min 6 characters)</Label>
              <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} data-testid="input-staff-password" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button className="bg-[#1a5c38] hover:bg-[#164d30]" disabled={!form.name.trim() || !form.email.trim() || form.password.length < 6 || saving} onClick={create} data-testid="button-save-staff">
              {saving ? "Creating…" : "Create account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetTarget} onOpenChange={(o) => { if (!o) { setResetTarget(null); setNewPassword(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Reset password — {resetTarget?.name}</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label>New password (min 6 characters)</Label>
            <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} data-testid="input-reset-password" />
          </div>
          <DialogFooter>
            <Button className="bg-[#1a5c38] hover:bg-[#164d30]" disabled={newPassword.length < 6} onClick={resetPassword}>Update password</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
