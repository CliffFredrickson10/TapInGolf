import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

interface Booking {
  id: number; booking_ref: string; players: number; total_amount: number;
  payment_method: string; status: string; split_bill: boolean;
  created_at: string; guest_name: string; guest_email: string; guest_phone: string;
  date: string; time: string; tee_price: number; voucher_code: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  confirmed: "bg-green-100 text-green-700",
  pending: "bg-yellow-100 text-yellow-700",
  cancelled: "bg-red-100 text-red-700",
  completed: "bg-blue-100 text-blue-700",
};

export default function Bookings() {
  const { toast } = useToast();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [updating, setUpdating] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      let url = "/api/portal/bookings?limit=100";
      if (statusFilter !== "all") url += `&status=${statusFilter}`;
      if (dateFilter) url += `&date=${dateFilter}`;
      setBookings(await api<Booking[]>(url));
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [statusFilter, dateFilter]);

  const updateStatus = async (id: number, status: string) => {
    setUpdating(id);
    try {
      await api(`/api/portal/bookings/${id}`, { method: "PUT", body: JSON.stringify({ status }) });
      setBookings(prev => prev.map(b => b.id === id ? { ...b, status } : b));
      toast({ title: "Status updated" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setUpdating(null); }
  };

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Bookings</h1>
        <p className="text-muted-foreground mt-1">View and manage tee time bookings for your club.</p>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <Label>Status</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label>Date</Label>
          <Input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} className="w-40" />
          {dateFilter && <Button variant="ghost" size="sm" onClick={() => setDateFilter("")}>Clear</Button>}
        </div>
      </div>

      {loading ? <Skeleton className="h-64 w-full" /> : (
        bookings.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">No bookings found.</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {bookings.map(b => (
              <Card key={b.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{b.guest_name}</span>
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{b.booking_ref}</code>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[b.status] ?? "bg-gray-100 text-gray-700"}`}>{b.status}</span>
                        {b.split_bill && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">Split Bill</span>}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {b.date} at {String(b.time).slice(0, 5)} · {b.players} player{b.players !== 1 ? "s" : ""} · R{b.total_amount.toFixed(0)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {b.guest_email}{b.guest_phone ? ` · ${b.guest_phone}` : ""} · {b.payment_method}
                        {b.voucher_code ? ` · Voucher: ${b.voucher_code}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">Booked {format(new Date(b.created_at), "dd MMM yyyy HH:mm")}</p>
                    </div>
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      {b.status === "pending" && (
                        <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white text-xs" disabled={updating === b.id} onClick={() => updateStatus(b.id, "confirmed")}>Confirm</Button>
                      )}
                      {(b.status === "pending" || b.status === "confirmed") && (
                        <Button size="sm" variant="outline" className="text-destructive border-destructive/30 text-xs" disabled={updating === b.id} onClick={() => updateStatus(b.id, "cancelled")}>Cancel</Button>
                      )}
                      {b.status === "confirmed" && (
                        <Button size="sm" variant="outline" className="text-xs" disabled={updating === b.id} onClick={() => updateStatus(b.id, "completed")}>Complete</Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      )}
    </div>
  );
}
