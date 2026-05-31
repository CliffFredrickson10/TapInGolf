import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Radio, MapPin } from "lucide-react";

interface ClubGeo {
  id: number; name: string; location: string; province: string;
  latitude: number | null; longitude: number | null;
  geofence_enabled: boolean; geofence_radius_m: number;
  ninth_tee_lat: number | null; ninth_tee_lng: number | null; ninth_tee_radius_m: number;
}

export default function StaffGeofence() {
  const { toast } = useToast();
  const [clubs, setClubs] = useState<ClubGeo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<ClubGeo | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api<{ clubs: ClubGeo[] }>("/api/admin/clubs");
      setClubs(data.clubs);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await api(`/api/admin/clubs/${editing.id}/geofence`, {
        method: "PATCH",
        body: JSON.stringify({
          geofence_enabled: editing.geofence_enabled,
          geofence_radius_m: editing.geofence_radius_m,
          ninth_tee_lat: editing.ninth_tee_lat,
          ninth_tee_lng: editing.ninth_tee_lng,
          ninth_tee_radius_m: editing.ninth_tee_radius_m,
        }),
      });
      toast({ title: "Geofence updated", description: editing.name });
      setEditing(null);
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const filtered = clubs.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.province ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Radio className="h-7 w-7 text-[#1a5c38]" />Geofence
        </h1>
        <p className="text-muted-foreground mt-1">Configure course and 9th-tee geofences across all clubs.</p>
      </div>

      <Input placeholder="Search clubs…" value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm" />

      {loading ? <Skeleton className="h-64 w-full" /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(c => (
            <Card key={c.id} className={editing?.id === c.id ? "ring-2 ring-[#1a5c38]" : ""}>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{c.name}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />{c.province}</div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.geofence_enabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                    {c.geofence_enabled ? "On" : "Off"}
                  </span>
                </div>

                {editing?.id === c.id ? (
                  <div className="space-y-3 pt-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">Geofencing enabled</Label>
                      <Switch checked={editing.geofence_enabled} onCheckedChange={v => setEditing({ ...editing, geofence_enabled: v })} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Course radius (m)</Label>
                      <Input type="number" value={editing.geofence_radius_m} onChange={e => setEditing({ ...editing, geofence_radius_m: parseInt(e.target.value || "0", 10) })} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">9th tee lat</Label>
                        <Input type="number" value={editing.ninth_tee_lat ?? ""} onChange={e => setEditing({ ...editing, ninth_tee_lat: e.target.value === "" ? null : parseFloat(e.target.value) })} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">9th tee lng</Label>
                        <Input type="number" value={editing.ninth_tee_lng ?? ""} onChange={e => setEditing({ ...editing, ninth_tee_lng: e.target.value === "" ? null : parseFloat(e.target.value) })} />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">9th tee radius (m)</Label>
                      <Input type="number" value={editing.ninth_tee_radius_m} onChange={e => setEditing({ ...editing, ninth_tee_radius_m: parseInt(e.target.value || "0", 10) })} />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button variant="outline" className="flex-1" onClick={() => setEditing(null)} disabled={saving}>Cancel</Button>
                      <Button className="flex-1 bg-[#1a5c38] hover:bg-[#164d30]" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <div>Course radius: {c.geofence_radius_m} m</div>
                    <div>9th tee: {c.ninth_tee_lat != null && c.ninth_tee_lng != null ? `${c.ninth_tee_lat.toFixed(4)}, ${c.ninth_tee_lng.toFixed(4)} (${c.ninth_tee_radius_m} m)` : "not set"}</div>
                    <Button variant="outline" size="sm" className="mt-2 w-full" onClick={() => setEditing(c)}>Configure</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
