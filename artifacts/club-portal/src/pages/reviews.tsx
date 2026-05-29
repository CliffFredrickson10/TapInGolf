import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Star } from "lucide-react";
import { format } from "date-fns";

interface Review {
  id: number; rating: number; comment: string; created_at: string;
  guest_name: string; guest_email: string;
}

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(i => (
        <Star key={i} className={`h-4 w-4 ${i <= rating ? "fill-[#c8a84b] text-[#c8a84b]" : "text-muted-foreground/30"}`} />
      ))}
    </div>
  );
}

export default function Reviews() {
  const { toast } = useToast();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Review[]>("/api/portal/reviews")
      .then(setReviews)
      .catch((e) => toast({ title: "Error", description: e.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  }, []);

  const avg = reviews.length ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : null;
  const dist = [5,4,3,2,1].map(star => ({
    star,
    count: reviews.filter(r => r.rating === star).length,
    pct: reviews.length ? Math.round(reviews.filter(r => r.rating === star).length / reviews.length * 100) : 0,
  }));

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Reviews</h1>
        <p className="text-muted-foreground mt-1">Golfer reviews and ratings for your club.</p>
      </div>

      {loading ? <Skeleton className="h-48 w-full" /> : (
        <>
          {reviews.length > 0 && (
            <div className="grid grid-cols-2 gap-6 max-w-xl">
              <Card>
                <CardContent className="py-6 text-center">
                  <div className="text-5xl font-bold text-[#1a5c38]">{avg}</div>
                  <Stars rating={Math.round(Number(avg))} />
                  <p className="text-sm text-muted-foreground mt-1">{reviews.length} review{reviews.length !== 1 ? "s" : ""}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4 space-y-2">
                  {dist.map(({ star, count, pct }) => (
                    <div key={star} className="flex items-center gap-2 text-sm">
                      <span className="w-4 text-right text-muted-foreground">{star}</span>
                      <Star className="h-3.5 w-3.5 text-[#c8a84b]" />
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-[#c8a84b] rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-6 text-right text-muted-foreground">{count}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}

          {reviews.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No reviews yet. Encourage your golfers to leave a review in the TapIn Golf app.</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {reviews.map(r => (
                <Card key={r.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-3">
                          <span className="font-medium text-sm">{r.guest_name}</span>
                          <Stars rating={r.rating} />
                        </div>
                        {r.comment && <p className="text-sm text-muted-foreground leading-relaxed">"{r.comment}"</p>}
                        <p className="text-xs text-muted-foreground">{format(new Date(r.created_at), "dd MMM yyyy")}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
