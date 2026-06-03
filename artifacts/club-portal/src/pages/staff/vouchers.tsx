import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Ticket, Plus, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { format } from "date-fns";

interface VoucherRow {
  id: number;
  code: string;
  discount_type: "fixed" | "percentage" | "wallet_credit";
  discount_value: string;
  club_id: number | null;
  club_name: string | null;
  min_amount: string;
  max_uses: number | null;
  uses_count: number;
  active: number;
  expires_at: string | null;
  created_at: string;
}

interface NewVoucherForm {
  code: string;
  discount_type: string;
  discount_value: string;
  club_id: string;
  min_amount: string;
  max_uses: string;
  expires_at: string;
}

const emptyForm = (): NewVoucherForm => ({
  code: "", discount_type: "fixed", discount_value: "",
  club_id: "", min_amount: "", max_uses: "", expires_at: "",
});

const typeLabel = (t: string) => {
  if (t === "percentage") return "% off";
  if (t === "wallet_credit") return "Wallet credit";
  return "Fixed (R)";
};
const typeBadge = (t: string) => {
  if (t === "percentage") return "bg-purple-100 text-purple-700";
  if (t === "wallet_credit") return "bg-blue-100 text-blue-700";
  return "bg-amber-100 text-amber-700";
};
const formatValue = (v: string, t: string) => {
  const n = parseFloat(v);
  if (t === "percentage") return `${n}%`;
  return `R${n.toFixed(2)}`;
};

export default function StaffVouchers() {
  const { toast } = useToast();
  const [vouchers, setVouchers] = useState<VoucherRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<NewVoucherForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ vouchers: VoucherRow[] }>("/api/admin/vouchers");
      setVouchers(data.vouchers);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!form.code || !form.discount_value) {
      toast({ title: "Code and discount value are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await api("/api/admin/vouchers", {
        method: "POST",
        body: JSON.stringify({
          code: form.code,
          discount_type: form.discount_type,
          discount_value: parseFloat(form.discount_value),
          club_id: form.club_id ? null : null,
          min_amount: form.min_amount ? parseFloat(form.min_amount) : 0,
          max_uses: form.max_uses ? parseInt(form.max_uses) : null,
          expires_at: form.expires_at || null,
        }),
      });
      toast({ title: "Voucher created", description: form.code.toUpperCase() });
      setDialogOpen(false);
      setForm(emptyForm());
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const toggleActive = async (v: VoucherRow) => {
    setToggling(v.id);
    try {
      await api(`/api/admin/vouchers/${v.id}`, {
        method: "PUT",
        body: JSON.stringify({ active: !v.active }),
      });
      setVouchers(prev => prev.map(r => r.id === v.id ? { ...r, active: v.active ? 0 : 1 } : r));
      toast({ title: v.active ? "Voucher deactivated" : "Voucher activated", description: v.code });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setToggling(null); }
  };

  const deleteVoucher = async (v: VoucherRow) => {
    if (!confirm(`Delete voucher ${v.code}?`)) return;
    setDeleting(v.id);
    try {
      await api(`/api/admin/vouchers/${v.id}`, { method: "DELETE" });
      toast({ title: "Voucher deleted", description: v.code });
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setDeleting(null); }
  };

  const f = (k: keyof NewVoucherForm, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-[#c8a84b]/15 flex items-center justify-center">
            <Ticket className="h-5 w-5 text-[#c8a84b]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Vouchers</h1>
            <p className="text-sm text-muted-foreground">Create and manage platform-wide discount vouchers</p>
          </div>
        </div>
        <Button className="bg-[#1a5c38] hover:bg-[#154a2e]" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> New Voucher
        </Button>
      </div>

      <div className="border rounded-lg overflow-hidden bg-background">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Code</th>
              <th className="text-left px-4 py-3 font-semibold">Type</th>
              <th className="text-right px-4 py-3 font-semibold">Value</th>
              <th className="text-right px-4 py-3 font-semibold">Min Order</th>
              <th className="text-center px-4 py-3 font-semibold">Uses</th>
              <th className="text-left px-4 py-3 font-semibold">Expires</th>
              <th className="text-left px-4 py-3 font-semibold">Club</th>
              <th className="text-center px-4 py-3 font-semibold">Active</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b last:border-0">
                  {[0,1,2,3,4,5,6,7,8].map(j => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))
            ) : vouchers.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-12 text-muted-foreground">
                  No vouchers yet — click "New Voucher" to create one
                </td>
              </tr>
            ) : (
              vouchers.map(v => (
                <tr key={v.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-mono font-semibold tracking-wide">{v.code}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${typeBadge(v.discount_type)}`}>
                      {typeLabel(v.discount_type)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {formatValue(v.discount_value, v.discount_type)}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {parseFloat(v.min_amount) > 0 ? `R${parseFloat(v.min_amount).toFixed(0)}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-center text-muted-foreground">
                    {v.uses_count}{v.max_uses ? ` / ${v.max_uses}` : ""}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {v.expires_at ? format(new Date(v.expires_at), "d MMM yyyy") : "Never"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {v.club_name ?? "All clubs"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => toggleActive(v)}
                      disabled={toggling === v.id}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      title={v.active ? "Deactivate" : "Activate"}
                    >
                      {v.active
                        ? <ToggleRight className="h-5 w-5 text-green-600" />
                        : <ToggleLeft className="h-5 w-5 text-gray-400" />
                      }
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      variant="ghost" size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => deleteVoucher(v)}
                      disabled={deleting === v.id}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Voucher</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Voucher Code *</Label>
              <Input
                value={form.code}
                onChange={e => f("code", e.target.value.toUpperCase())}
                placeholder="e.g. GOLF20"
                className="font-mono uppercase"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Discount Type *</Label>
                <select
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                  value={form.discount_type}
                  onChange={e => f("discount_type", e.target.value)}
                >
                  <option value="fixed">Fixed amount (R)</option>
                  <option value="percentage">Percentage (%)</option>
                  <option value="wallet_credit">Wallet credit (R)</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Value *</Label>
                <Input
                  type="number" min={0} step={0.01}
                  value={form.discount_value}
                  onChange={e => f("discount_value", e.target.value)}
                  placeholder={form.discount_type === "percentage" ? "10" : "50"}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Min Order Amount (R)</Label>
                <Input
                  type="number" min={0} step={0.01}
                  value={form.min_amount}
                  onChange={e => f("min_amount", e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Max Uses (leave blank = unlimited)</Label>
                <Input
                  type="number" min={1}
                  value={form.max_uses}
                  onChange={e => f("max_uses", e.target.value)}
                  placeholder="∞"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Expiry Date (leave blank = never)</Label>
              <Input
                type="date"
                value={form.expires_at}
                onChange={e => f("expires_at", e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setDialogOpen(false); setForm(emptyForm()); }}>
              Cancel
            </Button>
            <Button className="bg-[#1a5c38] hover:bg-[#154a2e]" onClick={create} disabled={saving}>
              {saving ? "Creating…" : "Create Voucher"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
