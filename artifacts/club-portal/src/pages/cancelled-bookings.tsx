import { useState, useEffect, useCallback, useRef } from "react";
import { useSearch } from "wouter";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { XCircle, Search, User, Mail, Phone, CalendarDays, Clock, Users, CreditCard } from "lucide-react";
import { format } from "date-fns";

interface Booking {
  id: number;
  booking_ref: string;
  players: number;
  total_amount: number;
  payment_method: string;
  status: string;
  split_bill: boolean;
  created_at: string;
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  date: string;
  time: string;
  tee_price: number;
  voucher_code: string | null;
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  try { return format(new Date(d), "dd MMM yyyy"); } catch { return d; }
}
function fmtDateTime(d: string | null | undefined) {
  if (!d) return "—";
  try { return format(new Date(d), "dd MMM yyyy HH:mm"); } catch { return d; }
}

function DetailRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium mt-0.5">{value}</p>
      </div>
    </div>
  );
}

export default function CancelledBookings() {
  const { toast } = useToast();
  const search = useSearch();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<Booking | null>(null);

  const autoOpenedRef = useRef(false);

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<Booking[]>("/api/portal/bookings?status=cancelled&limit=500");
      setBookings(data);
      if (!autoOpenedRef.current) {
        const targetId = new URLSearchParams(search).get("booking");
        if (targetId) {
          const found = data.find(b => b.id === parseInt(targetId, 10));
          if (found) {
            setDetail(found);
            autoOpenedRef.current = true;
          }
        }
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  const filtered = bookings.filter(b => {
    if (!q.trim()) return true;
    const lq = q.toLowerCase();
    return (
      b.guest_name?.toLowerCase().includes(lq) ||
      b.guest_email?.toLowerCase().includes(lq) ||
      b.booking_ref?.toLowerCase().includes(lq)
    );
  });

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Cancelled Bookings</h1>
        <p className="text-muted-foreground mt-1">
          All bookings cancelled by golfers. Click a row to view the full details.
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          className="pl-9"
          placeholder="Search by name, email or ref…"
          value={q}
          onChange={e => setQ(e.target.value)}
        />
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center text-muted-foreground">
            {q ? "No cancelled bookings match your search." : "No cancelled bookings yet."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(b => (
            <Card
              key={b.id}
              className="cursor-pointer hover:border-destructive/40 hover:bg-red-50/30 transition-colors"
              onClick={() => setDetail(b)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                      <XCircle className="h-4 w-4 text-red-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{b.guest_name}</span>
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{b.booking_ref}</code>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {b.date ? fmtDate(b.date) : "—"} at {b.time ? String(b.time).slice(0, 5) : "—"} · {b.players} player{b.players !== 1 ? "s" : ""} · R{Number(b.total_amount).toFixed(2)}
                      </p>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground flex-shrink-0">
                    Cancelled {fmtDate(b.created_at)}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Sheet open={detail != null} onOpenChange={o => { if (!o) setDetail(null); }}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {detail && (
            <>
              <SheetHeader className="pb-4">
                <SheetTitle className="flex items-center gap-2">
                  <XCircle className="h-5 w-5 text-red-600" />
                  Cancelled Booking
                </SheetTitle>
              </SheetHeader>

              <div className="space-y-5">
                <div className="rounded-lg border bg-red-50/60 px-4 py-3 space-y-1">
                  <p className="text-xs text-muted-foreground">Reference</p>
                  <code className="text-base font-bold tracking-wide text-red-700">{detail.booking_ref}</code>
                </div>

                <div className="space-y-4">
                  <DetailRow icon={User} label="Golfer" value={detail.guest_name} />
                  {detail.guest_email && (
                    <DetailRow icon={Mail} label="Email" value={
                      <a href={`mailto:${detail.guest_email}`} className="text-[#1a5c38] underline underline-offset-2">
                        {detail.guest_email}
                      </a>
                    } />
                  )}
                  {detail.guest_phone && (
                    <DetailRow icon={Phone} label="Phone" value={
                      <a href={`tel:${detail.guest_phone}`} className="text-[#1a5c38] underline underline-offset-2">
                        {detail.guest_phone}
                      </a>
                    } />
                  )}
                  <DetailRow icon={CalendarDays} label="Tee Date" value={detail.date ? fmtDate(detail.date) : "—"} />
                  <DetailRow icon={Clock} label="Tee Time" value={detail.time ? String(detail.time).slice(0, 5) : "—"} />
                  <DetailRow icon={Users} label="Players" value={`${detail.players} player${detail.players !== 1 ? "s" : ""}${detail.split_bill ? " · Split Bill" : ""}`} />
                  <DetailRow icon={CreditCard} label="Amount" value={`R${Number(detail.total_amount).toFixed(2)} · ${detail.payment_method}`} />
                  {detail.voucher_code && (
                    <DetailRow icon={CreditCard} label="Voucher" value={detail.voucher_code} />
                  )}
                </div>

                <div className="rounded-lg border bg-muted/40 px-4 py-3 text-xs text-muted-foreground space-y-1">
                  <p>Booked on {fmtDateTime(detail.created_at)}</p>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
