import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const fmt = (n: number) => `R${Number(n).toFixed(2)}`;

function todayISO(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86400_000);
  return d.toISOString().slice(0, 10);
}

export default function PosTransactions() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [from, setFrom] = useState(todayISO(-7));
  const [to, setTo] = useState(todayISO());
  const [method, setMethod] = useState("all");
  const [staffId, setStaffId] = useState("all");
  const [detail, setDetail] = useState<any | null>(null);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (method !== "all") params.set("payment_method", method);
    if (staffId !== "all") params.set("staff_id", staffId);
    api<{ transactions: any[] }>(`/api/pos/transactions?${params}`).then(r => setTransactions(r.transactions)).catch(() => {});
  }, [from, to, method, staffId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api<{ staff: any[] }>("/api/pos/staff").then(r => setStaff(r.staff)).catch(() => {});
  }, []);

  const openDetail = async (id: number) => {
    try { setDetail(await api<any>(`/api/pos/orders/${id}`)); } catch { /* noop */ }
  };

  const total = transactions.reduce((sum, t) => sum + t.total, 0);

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Transactions</h1>
        <p className="text-sm text-muted-foreground">All completed sales for this outlet.</p>
      </div>

      <div className="flex gap-3 flex-wrap items-end">
        <div className="space-y-1">
          <Label className="text-xs">From</Label>
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-9" data-testid="input-tx-from" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-9" data-testid="input-tx-to" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Payment</Label>
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger className="h-9 w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="card">Card</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Staff</Label>
          <Select value={staffId} onValueChange={setStaffId}>
            <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Everyone</SelectItem>
              {staff.map(m => <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto text-right">
          <p className="text-xs text-muted-foreground">{transactions.length} transactions</p>
          <p className="text-lg font-bold text-[#1a5c38]" data-testid="text-tx-total">{fmt(total)}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>When</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Staff</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>Discount</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map(t => (
              <TableRow key={t.id} className="cursor-pointer" onClick={() => openDetail(t.id)} data-testid={`tx-row-${t.id}`}>
                <TableCell className="font-medium">#{t.id}</TableCell>
                <TableCell className="text-sm">{new Date(t.paid_at).toLocaleString()}</TableCell>
                <TableCell className="text-sm capitalize">{t.order_type === "table" ? t.table_name : t.order_type}</TableCell>
                <TableCell>{t.item_count}</TableCell>
                <TableCell className="text-sm">{t.staff_name ?? "—"}</TableCell>
                <TableCell><Badge variant="secondary" className="capitalize">{t.payment_method}</Badge></TableCell>
                <TableCell className="text-sm text-[#1a5c38]">{t.discount_total > 0 ? `-${fmt(t.discount_total)}` : "—"}</TableCell>
                <TableCell className="text-right font-semibold">{fmt(t.total)}</TableCell>
              </TableRow>
            ))}
            {transactions.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No transactions in this period.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Sale #{detail?.id}</DialogTitle></DialogHeader>
          {detail && (
            <div className="space-y-2">
              {detail.items.map((i: any) => (
                <div key={i.id} className="flex justify-between text-sm">
                  <span>{i.quantity}× {i.name}{i.variant_label ? ` (${i.variant_label})` : ""}</span>
                  <span>{fmt(i.line_total)}</span>
                </div>
              ))}
              <div className="border-t pt-2 space-y-1 text-sm">
                <div className="flex justify-between"><span>Subtotal</span><span>{fmt(detail.subtotal)}</span></div>
                {detail.discount_total > 0 && <div className="flex justify-between text-[#1a5c38]"><span>Promotions</span><span>-{fmt(detail.discount_total)}</span></div>}
                <div className="flex justify-between font-bold"><span>Paid ({detail.payment_method})</span><span>{fmt(detail.total)}</span></div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
