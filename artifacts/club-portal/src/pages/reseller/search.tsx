import { useEffect, useState, useCallback } from "react";
import { Link } from "wouter";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Search, MapPin, ChevronRight, Flag } from "lucide-react";

interface ResaleClub {
  id: number;
  name: string;
  location: string | null;
  province: string | null;
  logo_url: string | null;
  image_url: string | null;
  holes: number | null;
  listing_count: number;
}

export default function ResellerSearch() {
  const { toast } = useToast();
  const [clubs, setClubs] = useState<ResaleClub[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback((q: string) => {
    setLoading(true);
    api<{ clubs: ResaleClub[] }>(`/api/portal/reseller/clubs${q ? `?search=${encodeURIComponent(q)}` : ""}`)
      .then((data) => setClubs(data.clubs))
      .catch((e) => toast({ title: "Error loading clubs", description: e.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [toast]);

  useEffect(() => {
    const t = setTimeout(() => load(search.trim()), search ? 300 : 0);
    return () => clearTimeout(t);
  }, [search, load]);

  return (
    <div className="p-8 max-w-5xl w-full mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Find Tee Times</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Browse participating clubs and buy their listed tee-time slots.
        </p>
      </div>

      <div className="relative mb-6 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by club name or location…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-11"
          data-testid="input-club-search"
        />
      </div>

      {loading ? (
        <div className="grid gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
      ) : clubs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Flag className="h-8 w-8 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No participating clubs found</p>
            <p className="text-xs mt-1">Clubs opt in to the resale marketplace — check back later or adjust your search.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {clubs.map((club) => (
            <Link key={club.id} href={`/clubs/${club.id}`}>
              <Card className="cursor-pointer hover:shadow-md transition-shadow" data-testid={`card-club-${club.id}`}>
                <CardContent className="flex items-center gap-4 py-4">
                  <div className="w-12 h-12 rounded-lg bg-[#1a5c38]/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {club.logo_url
                      ? <img src={club.logo_url} alt="" className="w-full h-full object-cover" />
                      : <Flag className="h-5 w-5 text-[#1a5c38]" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{club.name}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <MapPin className="h-3 w-3" />
                      {[club.location, club.province].filter(Boolean).join(", ") || "South Africa"}
                    </div>
                  </div>
                  <Badge variant={club.listing_count > 0 ? "default" : "secondary"} className={club.listing_count > 0 ? "bg-[#1a5c38]" : ""}>
                    {club.listing_count} slot{club.listing_count === 1 ? "" : "s"}
                  </Badge>
                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
