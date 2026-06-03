import { useEffect, useState, useCallback } from "react";
import * as XLSX from "xlsx";
import { Link } from "wouter";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useHnaPending } from "@/context/HnaPendingContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart3, Percent, IdCard, Megaphone, ChevronRight, Banknote,
  ChevronLeft, Download, Building2, TrendingUp, ReceiptText,
} from "lucide-react";
import { format } from "date-fns";

interface Summary {
  platform_fee_flat: number;
  vat_pct: number;
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
  payment_method: string; status: string; created_at: string; players: number;
  club_name: string; golfer_name: string; golfer_email: string; date: string; time: string;
}
interface BroadcastRow {
  id: number; type: string; title: string; body: string;
  affected_date: string | null; recipient_count: number; sent_at: string; club_name: string;
}
interface ClubDetailSummary {
  total_bookings: number; gross_revenue: number; platform_fees: number; club_earnings: number;
}

const rand = (n: number) => `R ${Number(n ?? 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Convert YYYY-MM to last calendar day of that month as YYYY-MM-DD
function lastDayOfMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m, 0); // day 0 of next month = last day of this month
  return `${y}-${String(m).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const thisMonth = format(new Date(), "yyyy-MM");

export default function StaffRevenue() {
  const { toast } = useToast();
  const { pending, refresh: refreshHna } = useHnaPending();

  // ── main page state ──────────────────────────────────────────────────
  const [summary, setSummary] = useState<Summary | null>(null);
  const [clubs, setClubs] = useState<ClubRow[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [broadcasts, setBroadcasts] = useState<BroadcastRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [feeInput, setFeeInput] = useState("");
  const [savingFee, setSavingFee] = useState(false);
  const [vatInput, setVatInput] = useState("");
  const [savingVat, setSavingVat] = useState(false);

  // ── club detail state ────────────────────────────────────────────────
  const [selectedClub, setSelectedClub] = useState<ClubRow | null>(null);
  const [clubBookings, setClubBookings] = useState<BookingRow[]>([]);
  const [clubSummary, setClubSummary] = useState<ClubDetailSummary | null>(null);
  const [clubLoading, setClubLoading] = useState(false);
  const [fromMonth, setFromMonth] = useState(thisMonth);
  const [toMonth, setToMonth] = useState(thisMonth);

  // ── load main page ───────────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    refreshHna();
    try {
      const [s, c, b, n] = await Promise.all([
        api<Summary>("/api/admin/revenue/summary"),
        api<{ clubs: ClubRow[] }>("/api/admin/revenue/clubs"),
        api<{ bookings: BookingRow[] }>("/api/admin/revenue/bookings?limit=50"),
        api<{ notifications: BroadcastRow[] }>("/api/admin/notifications/recent?limit=5"),
      ]);
      setSummary(s);
      setFeeInput(String(s.platform_fee_flat));
      setVatInput(String(s.vat_pct ?? 15));
      setClubs(c.clubs);
      setBookings(b.bookings);
      setBroadcasts(n.notifications);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  // ── load club detail ─────────────────────────────────────────────────
  const loadClubDetail = useCallback(async (clubId: number, from: string, to: string) => {
    setClubLoading(true);
    try {
      const fromDate = from + "-01";
      const toDate   = lastDayOfMonth(to);
      const data = await api<{ bookings: BookingRow[]; summary: ClubDetailSummary }>(
        `/api/admin/revenue/clubs/${clubId}/bookings?from=${fromDate}&to=${toDate}&limit=500`
      );
      setClubBookings(data.bookings);
      setClubSummary(data.summary);
    } catch (e: any) {
      toast({ title: "Error loading club transactions", description: e.message, variant: "destructive" });
    } finally {
      setClubLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedClub) return;
    loadClubDetail(selectedClub.id, fromMonth, toMonth);
  }, [selectedClub, fromMonth, toMonth]);

  // ── export XLSX ──────────────────────────────────────────────────────
  const exportXLSX = () => {
    if (!selectedClub || clubBookings.length === 0) return;
    const rows = clubBookings.map(b => ({
      "Ref":             b.booking_ref,
      "Golfer":          b.golfer_name,
      "Email":           b.golfer_email,
      "Tee Date":        b.date ?? "",
      "Tee Time":        b.time ? String(b.time).slice(0, 5) : "",
      "Players":         b.players,
      "Payment Method":  b.payment_method,
      "Status":          b.status,
      "Total (R)":       b.total_amount,
      "Club Payout (R)": b.club_amount,
      "TapIn Fee (R)":   b.platform_fee,
      "Paid At":         b.created_at ? format(new Date(b.created_at), "dd MMM yyyy HH:mm") : "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Transactions");
    const label = `${fromMonth}-to-${toMonth}`.replace(/-/g, "");
    XLSX.writeFile(wb, `${selectedClub.name.replace(/\s+/g, "_")}_transactions_${label}.xlsx`);
  };

  // ── save fee / vat ───────────────────────────────────────────────────
  const saveVat = async () => {
    const pct = parseFloat(vatInput);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      toast({ title: "Invalid VAT rate", description: "Enter a number between 0 and 100.", variant: "destructive" });
      return;
    }
    setSavingVat(true);
    try {
      await api("/api/admin/revenue/vat", { method: "PUT", body: JSON.stringify({ vat_pct: pct }) });
      toast({ title: "VAT rate updated" });
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSavingVat(false);
    }
  };

  const saveFee = async () => {
    const flat = parseFloat(feeInput);
    if (isNaN(flat) || flat < 0 || flat > 1000) {
      toast({ title: "Invalid fee", description: "Enter a rand amount between R0 and R1000.", variant: "destructive" });
      return;
    }
    setSavingFee(true);
    try {
      await api("/api/admin/revenue/fee", { method: "PUT", body: JSON.stringify({ fee_flat: flat }) });
      toast({ title: "Platform fee updated" });
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSavingFee(false);
    }
  };

  // ════════════════════════════════════════════════════════════════════
  // CLUB DETAIL VIEW
  // ════════════════════════════════════════════════════════════════════
  if (selectedClub) {
    return (
      <div className="p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground hover:text-foreground -ml-2"
            onClick={() => setSelectedClub(null)}
          >
            <ChevronLeft className="h-4 w-4" />Back to Revenue
          </Button>
          <div className="h-5 w-px bg-border" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Building2 className="h-6 w-6 text-[#1a5c38]" />{selectedClub.name}
            </h1>
            {selectedClub.province && (
              <p className="text-sm text-muted-foreground mt-0.5">{selectedClub.province}</p>
            )}
          </div>
        </div>

        {/* Filters + Export */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">From month</label>
                <input
                  type="month"
                  value={fromMonth}
                  max={toMonth}
                  onChange={e => setFromMonth(e.target.value)}
                  className="flex h-9 w-40 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">To month</label>
                <input
                  type="month"
                  value={toMonth}
                  min={fromMonth}
                  max={thisMonth}
                  onChange={e => setToMonth(e.target.value)}
                  className="flex h-9 w-40 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
              <div className="flex-1" />
              <Button
                variant="outline"
                className="gap-2 border-[#1a5c38] text-[#1a5c38] hover:bg-[#1a5c38] hover:text-white"
                onClick={exportXLSX}
                disabled={clubLoading || clubBookings.length === 0}
              >
                <Download className="h-4 w-4" />
                Export XLSX ({clubBookings.length} rows)
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Summary stats */}
        {clubLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1,2,3,4].map(i => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
        ) : clubSummary && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-5 flex items-start gap-3">
                <div className="p-2 bg-blue-50 rounded-lg mt-0.5"><ReceiptText className="h-5 w-5 text-blue-600" /></div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Bookings</p>
                  <p className="text-2xl font-bold mt-0.5">{clubSummary.total_bookings}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5 flex items-start gap-3">
                <div className="p-2 bg-green-50 rounded-lg mt-0.5"><TrendingUp className="h-5 w-5 text-green-600" /></div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Gross Collected</p>
                  <p className="text-2xl font-bold mt-0.5 text-[#1a5c38]">{rand(clubSummary.gross_revenue)}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5 flex items-start gap-3">
                <div className="p-2 bg-emerald-50 rounded-lg mt-0.5"><Building2 className="h-5 w-5 text-emerald-600" /></div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Club Payout</p>
                  <p className="text-2xl font-bold mt-0.5 text-emerald-700">{rand(clubSummary.club_earnings)}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5 flex items-start gap-3">
                <div className="p-2 bg-amber-50 rounded-lg mt-0.5"><Banknote className="h-5 w-5 text-amber-600" /></div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">TapIn Fees</p>
                  <p className="text-2xl font-bold mt-0.5 text-amber-700">{rand(clubSummary.platform_fees)}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Transactions table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">
              Transactions
              {!clubLoading && clubSummary && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {fromMonth} → {toMonth}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {clubLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : clubBookings.length === 0 ? (
              <p className="text-muted-foreground text-sm py-8 text-center">
                No confirmed transactions in this period.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">Ref</th>
                      <th className="py-2 px-4 font-medium">Golfer</th>
                      <th className="py-2 px-4 font-medium">Tee Date</th>
                      <th className="py-2 px-4 font-medium">Time</th>
                      <th className="py-2 px-4 font-medium text-center">Players</th>
                      <th className="py-2 px-4 font-medium">Method</th>
                      <th className="py-2 px-4 font-medium text-right">Total</th>
                      <th className="py-2 px-4 font-medium text-right text-emerald-700">Club Payout</th>
                      <th className="py-2 pl-4 font-medium text-right text-amber-700">TapIn Fee</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clubBookings.map(b => (
                      <tr key={b.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="py-2.5 pr-4 font-mono text-xs">{b.booking_ref}</td>
                        <td className="py-2.5 px-4">
                          <div className="font-medium">{b.golfer_name}</div>
                          <div className="text-xs text-muted-foreground">{b.golfer_email}</div>
                        </td>
                        <td className="py-2.5 px-4 text-sm">
                          {b.date ? format(new Date(b.date), "dd MMM yyyy") : "—"}
                        </td>
                        <td className="py-2.5 px-4 text-sm">
                          {b.time ? String(b.time).slice(0, 5) : "—"}
                        </td>
                        <td className="py-2.5 px-4 text-center">{b.players ?? "—"}</td>
                        <td className="py-2.5 px-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                            {b.payment_method ?? "—"}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-right font-semibold">{rand(b.total_amount)}</td>
                        <td className="py-2.5 px-4 text-right font-semibold text-emerald-700">{rand(b.club_amount)}</td>
                        <td className="py-2.5 pl-4 text-right font-semibold text-amber-700">{rand(b.platform_fee)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border bg-muted/30 font-semibold text-sm">
                      <td colSpan={6} className="py-2.5 pr-4 text-right text-muted-foreground">Totals:</td>
                      <td className="py-2.5 px-4 text-right">{rand(clubSummary?.gross_revenue ?? 0)}</td>
                      <td className="py-2.5 px-4 text-right text-emerald-700">{rand(clubSummary?.club_earnings ?? 0)}</td>
                      <td className="py-2.5 pl-4 text-right text-amber-700">{rand(clubSummary?.platform_fees ?? 0)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // MAIN REVENUE PAGE
  // ════════════════════════════════════════════════════════════════════
  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <BarChart3 className="h-7 w-7 text-[#1a5c38]" />Revenue
        </h1>
        <p className="text-muted-foreground mt-1">Platform-wide bookings, fees and club payouts.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Link href="/hna-review">
          <Card className="cursor-pointer transition-colors hover:border-[#1a5c38]/40" data-testid="card-pending-hna">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#1a5c38]/10 flex-shrink-0">
                <IdCard className="h-5 w-5 text-[#1a5c38]" />
              </div>
              <div className="min-w-0">
                <div className="text-sm text-muted-foreground">Pending HNA Verifications</div>
                <div className="text-2xl font-bold mt-0.5" data-testid="text-pending-hna-count">{pending}</div>
              </div>
              <div className="ml-auto flex items-center text-sm font-medium text-[#1a5c38]">
                Review<ChevronRight className="h-4 w-4" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Megaphone className="h-5 w-5 text-[#1a5c38]" />Recent Broadcasts
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? <Skeleton className="h-24 w-full" /> : broadcasts.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4 text-center">No broadcasts sent yet.</p>
            ) : (
              <ul className="divide-y" data-testid="list-recent-broadcasts">
                {broadcasts.map(n => (
                  <li key={n.id} className="py-2.5 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{n.title}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">{n.type}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      <span>{n.club_name}</span>
                      <span>{n.recipient_count} recipient{n.recipient_count !== 1 ? "s" : ""}</span>
                      <span>{format(new Date(n.sent_at), "dd MMM yyyy HH:mm")}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {loading ? <Skeleton className="h-28 w-full" /> : summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card><CardContent className="p-5"><div className="text-sm text-muted-foreground">Total Bookings</div><div className="text-2xl font-bold mt-1">{summary.total_bookings}</div></CardContent></Card>
          <Card><CardContent className="p-5"><div className="text-sm text-muted-foreground">Collected (incl. VAT)</div><div className="text-2xl font-bold mt-1">{rand(summary.total_collected)}</div><div className="text-xs text-muted-foreground mt-1">VAT ({summary.vat_pct ?? 15}%) {rand(Math.round(summary.total_collected * (summary.vat_pct ?? 15) / (100 + (summary.vat_pct ?? 15)) * 100) / 100)}</div></CardContent></Card>
          <Card><CardContent className="p-5"><div className="text-sm text-muted-foreground">Platform Fees</div><div className="text-2xl font-bold mt-1 text-[#1a5c38]">{rand(summary.total_platform_fee)}</div></CardContent></Card>
          <Card><CardContent className="p-5"><div className="text-sm text-muted-foreground">Club Payouts</div><div className="text-2xl font-bold mt-1">{rand(summary.total_club_payouts)}</div></CardContent></Card>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Banknote className="h-5 w-5" />Platform Fee</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-end gap-3">
              <div className="space-y-1.5">
                <label className="text-sm text-muted-foreground">Flat fee per booking (R)</label>
                <Input type="number" className="w-40" value={feeInput} onChange={e => setFeeInput(e.target.value)} step="1" min="0" max="1000" />
              </div>
              <Button className="bg-[#1a5c38] hover:bg-[#164d30]" onClick={saveFee} disabled={savingFee}>
                {savingFee ? "Saving…" : "Save fee"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Charged per booking, regardless of booking size.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Percent className="h-5 w-5" />VAT Rate</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-end gap-3">
              <div className="space-y-1.5">
                <label className="text-sm text-muted-foreground">VAT percentage (%)</label>
                <Input type="number" className="w-40" value={vatInput} onChange={e => setVatInput(e.target.value)} step="0.1" min="0" max="100" />
              </div>
              <Button className="bg-[#1a5c38] hover:bg-[#164d30]" onClick={saveVat} disabled={savingVat}>
                {savingVat ? "Saving…" : "Save VAT"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-3">VAT is shown as a breakdown of the existing price. Changing this updates all displayed VAT amounts immediately.</p>
          </CardContent>
        </Card>
      </div>

      {/* By Club — clickable */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">By Club</CardTitle>
          <p className="text-sm text-muted-foreground">Click a club to see all its transactions.</p>
        </CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-40 w-full" /> : clubs.length === 0 ? (
            <p className="text-muted-foreground text-sm py-6 text-center">No revenue yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Club</th>
                    <th className="py-2 px-4 font-medium text-right">Bookings</th>
                    <th className="py-2 px-4 font-medium text-right">Gross</th>
                    <th className="py-2 px-4 font-medium text-right">Platform Fees</th>
                    <th className="py-2 pl-4 font-medium text-right">Club Earnings</th>
                    <th className="py-2 pl-2 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {clubs.map(c => (
                    <tr
                      key={c.id}
                      className="border-b last:border-0 hover:bg-muted/40 cursor-pointer transition-colors group"
                      onClick={() => {
                        setSelectedClub(c);
                        setFromMonth(thisMonth);
                        setToMonth(thisMonth);
                      }}
                    >
                      <td className="py-2.5 pr-4">
                        <div className="font-medium group-hover:text-[#1a5c38] transition-colors">{c.name}</div>
                        <div className="text-xs text-muted-foreground">{c.province}</div>
                      </td>
                      <td className="py-2.5 px-4 text-right">{c.total_bookings}</td>
                      <td className="py-2.5 px-4 text-right">{rand(c.gross_revenue)}</td>
                      <td className="py-2.5 px-4 text-right text-[#1a5c38]">{rand(c.platform_fees)}</td>
                      <td className="py-2.5 pl-4 text-right">{rand(c.club_earnings)}</td>
                      <td className="py-2.5 pl-2 text-muted-foreground">
                        <ChevronRight className="h-4 w-4 group-hover:text-[#1a5c38] transition-colors" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Bookings */}
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
                  <th className="py-2 px-4 font-medium text-right">Total</th>
                  <th className="py-2 px-4 font-medium text-right text-emerald-700">Club Payout</th>
                  <th className="py-2 pl-4 font-medium text-right text-amber-700">TapIn Fee</th>
                </tr></thead>
                <tbody>
                  {bookings.map(b => (
                    <tr key={b.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-mono text-xs">{b.booking_ref}</td>
                      <td className="py-2 px-4"><div>{b.golfer_name}</div><div className="text-xs text-muted-foreground">{b.golfer_email}</div></td>
                      <td className="py-2 px-4">{b.club_name}</td>
                      <td className="py-2 px-4 text-xs">{b.date ? format(new Date(b.date), "dd MMM") : "—"} {b.time ?? ""}</td>
                      <td className="py-2 px-4 text-right">{rand(b.total_amount)}</td>
                      <td className="py-2 px-4 text-right font-semibold text-emerald-700">{rand(b.club_amount)}</td>
                      <td className="py-2 pl-4 text-right font-semibold text-amber-700">{rand(b.platform_fee)}</td>
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
