import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Store, Users, KeyRound, Percent } from "lucide-react";

const TYPE_LABEL: Record<string, string> = { pro_shop: "Pro Shop", bar: "Bar", restaurant: "Restaurant" };

export default function Outlets() {
  const { toast } = useToast();
  const [outlets, setOutlets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: "", type: "" });
  const [saving, setSaving] = useState(false);

  const [staffOutlet, setStaffOutlet] = useState<any | null>(null);
  const [staff, setStaff] = useState<any[]>([]);
  const [staffForm, setStaffForm] = useState({ name: "", email: "", password: "", role: "manager" });
  const [addStaffOpen, setAddStaffOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<any | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [feeTarget, setFeeTarget] = useState<any | null>(null);
  const [feeValue, setFeeValue] = useState("");

  const load = useCallback(() => {
    api<{ outlets: any[] }>("/api/portal/pos/outlets")
      .then(r => setOutlets(r.outlets))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const loadStaff = useCallback((outletId: number) => {
    api<{ staff: any[] }>(`/api/portal/pos/outlets/${outletId}/staff`).then(r => setStaff(r.staff)).catch(() => {});
  }, []);

  const openStaff = (o: any) => {
    setStaffOutlet(o);
    setStaff([]);
    loadStaff(o.id);
  };

  const createOutlet = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await api("/api/portal/pos/outlets", { method: "POST", body: JSON.stringify(form) });
      toast({ title: "Outlet created", description: "Now add a manager account so they can sign in." });
      setCreateOpen(false);
      setForm({ name: "", type: "" });
      load();
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const toggleOutlet = async (o: any) => {
    try {
      await api(`/api/portal/pos/outlets/${o.id}`, { method: "PUT", body: JSON.stringify({ active: o.active ? 0 : 1 }) });
      load();
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    }
  };

  const saveServiceFee = async () => {
    if (!feeTarget || saving) return;
    const pct = Number(feeValue);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      toast({ title: "Invalid percentage", description: "Enter a value between 0 and 100.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await api(`/api/portal/pos/outlets/${feeTarget.id}`, { method: "PUT", body: JSON.stringify({ service_fee_percent: pct }) });
      toast({ title: "Service fee updated", description: pct > 0 ? `A ${pct}% service fee will be added to every bill at ${feeTarget.name}.` : `No automatic service fee at ${feeTarget.name}.` });
      setFeeTarget(null);
      load();
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const createStaff = async () => {
    if (!staffOutlet || saving) return;
    setSaving(true);
    try {
      await api(`/api/portal/pos/outlets/${staffOutlet.id}/staff`, { method: "POST", body: JSON.stringify(staffForm) });
      toast({ title: "Account created", description: `${staffForm.name} can now sign in on the Outlet tab of the portal login.` });
      setAddStaffOpen(false);
      setStaffForm({ name: "", email: "", password: "", role: "manager" });
      loadStaff(staffOutlet.id);
      load();
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const toggleStaff = async (m: any) => {
    try {
      await api(`/api/portal/pos/staff/${m.id}`, { method: "PUT", body: JSON.stringify({ active: m.active ? 0 : 1 }) });
      if (staffOutlet) loadStaff(staffOutlet.id);
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    }
  };

  const resetPassword = async () => {
    if (!resetTarget || newPassword.length < 6) return;
    try {
      await api(`/api/portal/pos/staff/${resetTarget.id}`, { method: "PUT", body: JSON.stringify({ password: newPassword }) });
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
          <h1 className="text-2xl font-bold">Outlets (POS)</h1>
          <p className="text-sm text-muted-foreground">Pro shop, bar and restaurant points of sale. Create an outlet, then add a manager login for it.</p>
        </div>
        <Button className="bg-[#1a5c38] hover:bg-[#164d30]" onClick={() => setCreateOpen(true)} data-testid="button-add-outlet">
          <Plus className="h-4 w-4 mr-2" /> New outlet
        </Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : outlets.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          <Store className="h-8 w-8 mx-auto mb-3 opacity-40" />
          No outlets yet. Create your pro shop, bar or restaurant to get started.
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {outlets.map(o => (
            <Card key={o.id} className={`p-5 ${o.active ? "" : "opacity-60"}`} data-testid={`outlet-card-${o.id}`}>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-lg">{o.name}</h3>
                  <Badge variant="secondary" className="mt-1">{TYPE_LABEL[o.type] ?? o.type}</Badge>
                </div>
                {o.active ? <Badge className="bg-[#1a5c38]">Active</Badge> : <Badge variant="outline">Disabled</Badge>}
              </div>
              <div className="flex gap-4 mt-3 text-sm text-muted-foreground">
                <span>{o.staff_count} staff</span>
                <span>{o.product_count} products</span>
              </div>
              <div className="flex gap-2 mt-4">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => openStaff(o)} data-testid={`button-outlet-staff-${o.id}`}>
                  <Users className="h-3.5 w-3.5 mr-1.5" /> Staff & logins
                </Button>
                <Button size="sm" variant="ghost" onClick={() => toggleOutlet(o)}>
                  {o.active ? "Disable" : "Enable"}
                </Button>
              </div>
              <button
                className="mt-3 w-full flex items-center justify-between text-sm border rounded-lg px-3 py-2 hover:bg-muted transition-colors"
                onClick={() => { setFeeTarget(o); setFeeValue(String(o.service_fee_percent ?? 0)); }}
                data-testid={`button-outlet-fee-${o.id}`}
              >
                <span className="flex items-center gap-1.5 text-muted-foreground"><Percent className="h-3.5 w-3.5" /> Service fee</span>
                <span className={`font-semibold ${Number(o.service_fee_percent) > 0 ? "text-[#1a5c38]" : "text-muted-foreground"}`}>
                  {Number(o.service_fee_percent) > 0 ? `${Number(o.service_fee_percent)}% on all bills` : "None"}
                </span>
              </button>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>New outlet</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Outlet name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Pro Shop, Halfway House" data-testid="input-outlet-name" />
            </div>
            <div className="space-y-1.5">
              <Label>Type *</Label>
              <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                <SelectTrigger data-testid="select-outlet-type"><SelectValue placeholder="Choose type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pro_shop">Pro Shop (barcode till)</SelectItem>
                  <SelectItem value="bar">Bar (tables & tabs)</SelectItem>
                  <SelectItem value="restaurant">Restaurant (tables & takeaway)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button className="bg-[#1a5c38] hover:bg-[#164d30]" disabled={!form.name.trim() || !form.type || saving} onClick={createOutlet} data-testid="button-save-outlet">
              {saving ? "Creating…" : "Create outlet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!staffOutlet} onOpenChange={(o) => !o && setStaffOutlet(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{staffOutlet?.name} — staff & logins</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Button size="sm" className="bg-[#1a5c38] hover:bg-[#164d30]" onClick={() => setAddStaffOpen(true)} data-testid="button-add-outlet-staff">
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Add account
            </Button>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staff.map(m => (
                    <TableRow key={m.id} data-testid={`outlet-staff-row-${m.id}`}>
                      <TableCell>
                        <p className="font-medium text-sm">{m.name}</p>
                        <p className="text-xs text-muted-foreground">{m.email}</p>
                      </TableCell>
                      <TableCell><Badge variant={m.role === "manager" ? "default" : "secondary"} className={m.role === "manager" ? "bg-[#1a5c38]" : ""}>{m.role}</Badge></TableCell>
                      <TableCell>{m.active ? <Badge variant="secondary">Active</Badge> : <Badge variant="outline">Disabled</Badge>}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          <Button size="icon" variant="ghost" className="h-7 w-7" title="Reset password" onClick={() => setResetTarget(m)}>
                            <KeyRound className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => toggleStaff(m)}>
                            {m.active ? "Disable" : "Enable"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {staff.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6 text-sm">No accounts yet — add a manager so they can sign in.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground">Staff sign in on the portal login page under the <strong>Outlet</strong> tab. Managers can add their own waiters/cashiers from inside the POS.</p>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={addStaffOpen} onOpenChange={setAddStaffOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add account — {staffOutlet?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={staffForm.name} onChange={e => setStaffForm(f => ({ ...f, name: e.target.value }))} data-testid="input-outlet-staff-name" />
            </div>
            <div className="space-y-1.5">
              <Label>Email *</Label>
              <Input type="email" value={staffForm.email} onChange={e => setStaffForm(f => ({ ...f, email: e.target.value }))} data-testid="input-outlet-staff-email" />
            </div>
            <div className="space-y-1.5">
              <Label>Password * (min 6 characters)</Label>
              <Input type="password" value={staffForm.password} onChange={e => setStaffForm(f => ({ ...f, password: e.target.value }))} data-testid="input-outlet-staff-password" />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={staffForm.role} onValueChange={v => setStaffForm(f => ({ ...f, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manager">Manager (full outlet control)</SelectItem>
                  <SelectItem value="waiter">Waiter / Cashier (till only)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddStaffOpen(false)}>Cancel</Button>
            <Button className="bg-[#1a5c38] hover:bg-[#164d30]" disabled={!staffForm.name.trim() || !staffForm.email.trim() || staffForm.password.length < 6 || saving} onClick={createStaff} data-testid="button-save-outlet-staff">
              {saving ? "Creating…" : "Create account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!feeTarget} onOpenChange={(o) => { if (!o) setFeeTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Service fee — {feeTarget?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Automatic service fee (%)</Label>
              <Input
                type="number" min={0} max={100} step="0.5"
                value={feeValue}
                onChange={e => setFeeValue(e.target.value)}
                placeholder="e.g. 10"
                data-testid="input-service-fee"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Added to every bill at this outlet (e.g. 10% on a R100 bill = R110 total). The fee is recorded as the waiter's tip.
              Set to 0 to turn it off — the till can still work out tips from the amount the client pays.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFeeTarget(null)}>Cancel</Button>
            <Button className="bg-[#1a5c38] hover:bg-[#164d30]" disabled={saving} onClick={saveServiceFee} data-testid="button-save-service-fee">
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetTarget} onOpenChange={(o) => { if (!o) { setResetTarget(null); setNewPassword(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Reset password — {resetTarget?.name}</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label>New password (min 6 characters)</Label>
            <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
          </div>
          <DialogFooter>
            <Button className="bg-[#1a5c38] hover:bg-[#164d30]" disabled={newPassword.length < 6} onClick={resetPassword}>Update password</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
