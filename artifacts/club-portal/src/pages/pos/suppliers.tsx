import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil } from "lucide-react";

const emptyForm = { name: "", contact_name: "", email: "", phone: "", notes: "" };

export default function PosSuppliers() {
  const { toast } = useToast();
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    api<{ suppliers: any[] }>("/api/pos/suppliers").then(r => setSuppliers(r.suppliers)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm({ ...emptyForm }); setDialogOpen(true); };
  const openEdit = (s: any) => {
    setEditing(s);
    setForm({ name: s.name, contact_name: s.contact_name ?? "", email: s.email ?? "", phone: s.phone ?? "", notes: s.notes ?? "" });
    setDialogOpen(true);
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (editing) {
        await api(`/api/pos/suppliers/${editing.id}`, { method: "PUT", body: JSON.stringify(form) });
        toast({ title: "Supplier updated" });
      } else {
        await api("/api/pos/suppliers", { method: "POST", body: JSON.stringify(form) });
        toast({ title: "Supplier added" });
      }
      setDialogOpen(false);
      load();
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (s: any) => {
    try {
      await api(`/api/pos/suppliers/${s.id}`, {
        method: "PUT",
        body: JSON.stringify({ name: s.name, contact_name: s.contact_name, email: s.email, phone: s.phone, notes: s.notes, active: s.active ? 0 : 1 }),
      });
      load();
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Suppliers</h1>
          <p className="text-sm text-muted-foreground">Who you order stock from.</p>
        </div>
        <Button className="bg-[#1a5c38] hover:bg-[#164d30]" onClick={openCreate} data-testid="button-add-supplier">
          <Plus className="h-4 w-4 mr-2" /> Add supplier
        </Button>
      </div>

      <div className="bg-white rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Supplier</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {suppliers.map(s => (
              <TableRow key={s.id} data-testid={`supplier-row-${s.id}`} className={s.active ? "" : "opacity-50"}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell className="text-sm">{s.contact_name ?? "—"}</TableCell>
                <TableCell className="text-sm">{s.email ?? "—"}</TableCell>
                <TableCell className="text-sm">{s.phone ?? "—"}</TableCell>
                <TableCell>
                  {s.active ? <Badge className="bg-[#1a5c38]">Active</Badge> : <Badge variant="outline">Inactive</Badge>}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1 justify-end">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(s)} data-testid={`button-edit-supplier-${s.id}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" className="text-xs" onClick={() => toggleActive(s)}>
                      {s.active ? "Disable" : "Enable"}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {suppliers.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No suppliers yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Edit supplier" : "Add supplier"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} data-testid="input-supplier-name" />
            </div>
            <div className="space-y-1.5">
              <Label>Contact person</Label>
              <Input value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button className="bg-[#1a5c38] hover:bg-[#164d30]" disabled={!form.name.trim() || saving} onClick={save} data-testid="button-save-supplier">
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
