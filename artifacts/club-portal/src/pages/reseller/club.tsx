import { useEffect, useState, useCallback } from "react";
import { useRoute, Link } from "wouter";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, MapPin, Flag, CalendarDays, Users, ExternalLink } from "lucide-react";
import { format, parseISO } from "date-fns";

interface Listing {
  id: number;
  date: string;
  tee_time: string;
  max_players: number;
  price: number;
  payment_pending: boolean;
}

interface ClubInfo {
  id: number;
  name: string;
  location: string | null;
  province: string | null;
  logo_url: string | null;
  holes: number | null;
}

export default function ResellerClub() {
  const [, params] = useRoute("/clubs/:id");
  const clubId = params?.id;
  const { toast } = useToast();
  const [club, setClub] = useState<ClubInfo | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [buyingId, setBuyingId] = useState<number | null>(null);

  const load = useCallback(() => {
    if (!clubId) return;
    api<{ club: ClubInfo; listings: Listing[] }>(`/api/portal/reseller/clubs/${clubId}/listings`)
      .then((data) => { setClub(data.club); setListings(data.listings); })
      .catch((e) => toast({ title: "Error loading listings", description: e.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [clubId, toast]);

  useEffect(() => { load(); }, [load]);

  const buy = async (listing: Listing) => {
    setBuyingId(listing.id);
    try {
      const data = await api<{ purchase_id: number; payment_url: string }>(
        `/api/portal/reseller/listings/${listing.id}/buy`,
        { method: "POST" }
      );
      window.open(data.payment_url, "_blank", "noopener");
      toast({
        title: "Payment started",
        description: "Complete the payment in the new tab. Your purchase will be confirmed automatically once paid.",
      });
      load();
    } catch (e: any) {
      toast({ title: "Could not start payment", description: e.message, variant: "destructive" });
      load();
    } finally {
      setBuyingId(null);
    }
  };

  const byDate = listings.reduce<Record<string, Listing[]>>((acc, l) => {
    (acc[l.date] ??= []).push(l);
    return acc;
  }, {});

  return (
    <div className="p-8 max-w-5xl w-full mx-auto">
      <Link href="/">
        <button className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4" data-testid="link-back-to-search">
          <ChevronLeft className="h-4 w-4" /> All clubs
        </button>
      </Link>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-16 w-80 rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      ) : !club ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Club not found or no longer participating.</CardContent></Card>
      ) : (
        <>
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 rounded-xl bg-[#1a5c38]/10 flex items-center justify-center overflow-hidden">
              {club.logo_url
                ? <img src={club.logo_url} alt="" className="w-full h-full object-cover" />
                : <Flag className="h-6 w-6 text-[#1a5c38]" />}
            </div>
            <div>
              <h1 className="text-2xl font-bold">{club.name}</h1>
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {[club.location, club.province].filter(Boolean).join(", ") || "South Africa"}
              </p>
            </div>
          </div>

          {listings.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <CalendarDays className="h-8 w-8 mx-auto mb-3 opacity-40" />
                <p className="font-medium">No tee times listed right now</p>
                <p className="text-xs mt-1">This club hasn't listed any slots for resale — check back later.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {Object.entries(byDate).map(([date, dayListings]) => (
                <div key={date}>
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    {format(parseISO(date), "EEEE, d MMMM yyyy")}
                  </h2>
                  <div className="grid gap-2">
                    {dayListings.map((l) => (
                      <Card key={l.id} data-testid={`card-listing-${l.id}`}>
                        <CardContent className="flex items-center gap-4 py-3.5">
                          <div className="text-lg font-bold tabular-nums w-16">{l.tee_time}</div>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Users className="h-3.5 w-3.5" /> {l.max_players}-ball
                          </div>
                          <div className="flex-1" />
                          <div className="text-lg font-semibold">R{l.price.toFixed(2)}</div>
                          {l.payment_pending ? (
                            <Badge variant="secondary">Payment in progress</Badge>
                          ) : (
                            <Button
                              className="bg-[#1a5c38] hover:bg-[#164d30]"
                              disabled={buyingId === l.id}
                              onClick={() => buy(l)}
                              data-testid={`button-buy-${l.id}`}
                            >
                              {buyingId === l.id ? "Starting…" : (<>Buy <ExternalLink className="h-3.5 w-3.5 ml-1" /></>)}
                            </Button>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
