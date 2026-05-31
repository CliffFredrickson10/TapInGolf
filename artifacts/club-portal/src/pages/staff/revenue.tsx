import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, Percent } from "lucide-react";
import { format } from "date-fns";

interface Summary {
  platform_fee_pct: number;
  total_bookings: number;
  total_collected: number;
  total_platform_fee: number;
  total_club_payouts: number;
}
interface ClubRow {
  id: number; name: string; location: string; province: string;
  total_bookings: number; gross_revenue: number; platform_fees: number; club_earnings: number;
}
interface BookingRow {
  id: number; booking_ref: string; total_amount: number; platform_fee: number; club_amount: number;
  payment_method: string; status: string; created_at: string;
  club_name: string; golfer_name: string; golfer_email: string; date: string; time: string;
}

const rand = (n: number) => `R ${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function StaffRevenue() {
  const { toast } = useToast();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [clubs, setClubs] = useState<ClubRow[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [feeInput, setFeeInput] = useState("");
  const [savingFee, setSavingFee] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [s, c, b] = await Promise.all([
        api<Summary>("/api/admin/revenue/summary"),
        api<{ clubs: ClubRow[] }>("/api/admin/revenue/clubs"),
        api<{ bookings: BookingRow[] }>("/api/admin/revenue/bookings?limit=50"),
      ]);
      setSummary(s);
      setFeeInput(String(s.platform_fee_pct));
      setClubs(c.clubs);
      setBookings(b.bookings);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const saveFee = async () => {
    const pct = parseFloat(feeInput);
    if (isNaN(pct) || pct < 0 || pct > 50) {
      toast({ title: "Invalid fee", description: "Enter a number between 0 and 50.", variant: "destructive" });
      return;
    }
    setSavingFee(true);
    try {
      await api("/api/admin/revenue/fee", { method: "PUT", body: JSON.stringify({ fee_pct: pct }) });
      toast({ title: "Platform fee updated" });
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSavingFee(false);
    }
  };

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <BarChart3 className="h-7 w-7 text-[#1a5c38]" />Revenue
        </h1>
        <p className="text-muted-foreground mt-1">Platform-wide bookings, fees and club payouts.</p>
      </div>

      {loading ? <Skeleton className="h-28 w-full" /> : summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card><CardContent className="p-5"><div className="text-sm text-muted-foreground">Total Bookings</div><div className="text-2xl font-bold mt-1">{summary.total_bookings}</div></CardContent></Card>
          <Card><CardContent className="p-5"><div className="text-sm text-muted-foreground">Collected</div><div className="text-2xl font-bold mt-1">{rand(summary.total_collected)}</div></CardContent></Card>
          <Card><CardContent className="p-5"><div className="text-sm text-muted-foreground">Platform Fees</div><div className="text-2xl font-bold mt-1 text-[#1a5c38]">{rand(summary.total_platform_fee)}</div></CardContent></Card>
          <Card><CardContent className="p-5"><div className="text-sm text-muted-foreground">Club Payouts</div><div className="text-2xl font-bold mt-1">{rand(summary.total_club_payouts)}</div></CardContent></Card>
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Percent className="h-5 w-5" />Platform Fee</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">Fee percentage (%)</label>
              <Input type="number" className="w-40" value={feeInput} onChange={e => setFeeInput(e.target.value)} step="0.1" min="0" max="50" />
            </div>
            <Button className="bg-[#1a5c38] hover:bg-[#164d30]" onClick={saveFee} disabled={savingFee}>
              {savingFee ? "Saving…" : "Save fee"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">By Club</CardTitle></CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-40 w-full" /> : clubs.length === 0 ? (
            <p className="text-muted-foreground text-sm py-6 text-center">No revenue yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Club</th>
                  <th className="py-2 px-4 font-medium text-right">Bookings</th>
                  <th className="py-2 px-4 font-medium text-right">Gross</th>
                  <th className="py-2 px-4 font-medium text-right">Platform Fees</th>
                  <th className="py-2 pl-4 font-medium text-right">Club Earnings</th>
                </tr></thead>
                <tbody>
                  {clubs.map(c => (
                    <tr key={c.id} className="border-b last:border-0">
                      <td className="py-2 pr-4"><div className="font-medium">{c.name}</div><div className="text-xs text-muted-foreground">{c.province}</div></td>
                      <td className="py-2 px-4 text-right">{c.total_bookings}</td>
                      <td className="py-2 px-4 text-right">{rand(c.gross_revenue)}</td>
                      <td className="py-2 px-4 text-right text-[#1a5c38]">{rand(c.platform_fees)}</td>
                      <td className="py-2 pl-4 text-right">{rand(c.club_earnings)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Recent Bookings</CardTitle></CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-40 w-full" /> : bookings.length === 0 ? (
            <p className="text-muted-foreground text-sm py-6 text-center">No bookings yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Ref</th>
                  <th className="py-2 px-4 font-medium">Golfer</th>
                  <th className="py-2 px-4 font-medium">Club</th>
                  <th className="py-2 px-4 font-medium">Tee</th>
                  <th className="py-2 px-4 font-medium text-right">Amount</th>
                  <th className="py-2 pl-4 font-medium text-right">Fee</th>
                </tr></thead>
                <tbody>
                  {bookings.map(b => (
                    <tr key={b.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-mono text-xs">{b.booking_ref}</td>
                      <td className="py-2 px-4"><div>{b.golfer_name}</div><div className="text-xs text-muted-foreground">{b.golfer_email}</div></td>
                      <td className="py-2 px-4">{b.club_name}</td>
                      <td className="py-2 px-4 text-xs">{b.date ? format(new Date(b.date), "dd MMM") : "—"} {b.time ?? ""}</td>
                      <td className="py-2 px-4 text-right">{rand(b.total_amount)}</td>
                      <td className="py-2 pl-4 text-right text-[#1a5c38]">{rand(b.platform_fee)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
