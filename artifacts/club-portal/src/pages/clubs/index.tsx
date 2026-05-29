import { useListPortalClubs } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Plus, Settings, Map } from "lucide-react";

export default function ClubList() {
  const { data: clubs, isLoading } = useListPortalClubs();

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Clubs</h1>
          <p className="text-muted-foreground mt-1">Manage club profiles and tee sheets.</p>
        </div>
        <Button asChild>
          <Link href="/clubs/new">
            <span className="flex items-center">
              <Plus className="mr-2 h-4 w-4" />
              Add Club
            </span>
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-48 w-full" />)}
        </div>
      ) : clubs?.length === 0 ? (
        <div className="text-center py-24 bg-card rounded-lg border">
          <Map className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium text-foreground">No clubs found</h3>
          <p className="text-muted-foreground mt-1 mb-4">Get started by creating a new club profile.</p>
          <Button asChild>
            <Link href="/clubs/new">Create First Club</Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {clubs?.map((club) => (
            <Card key={club.id} className="flex flex-col">
              <CardHeader>
                <CardTitle>{club.name}</CardTitle>
                <CardDescription>{club.layout_type} &bull; {club.total_holes} Holes</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col justify-end">
                <div className="flex items-center gap-2 mt-4 pt-4 border-t">
                  <Button variant="default" className="w-full flex-1" asChild>
                    <Link href={`/clubs/${club.id}`}>Tee Sheet</Link>
                  </Button>
                  <Button variant="outline" size="icon" title="Edit Configuration" asChild>
                    <Link href={`/clubs/${club.id}/edit`}>
                      <Settings className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
