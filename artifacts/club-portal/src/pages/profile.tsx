import { useEffect, useRef, useState } from "react";
import { api, getToken } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Save, Upload, ImageIcon, Plus, Trash2, GripVertical, X, Link } from "lucide-react";

const API = import.meta.env.VITE_API_URL ?? "/api";

interface ClubProfile {
  id: number; name: string; location: string; province: string;
  image_url: string | null; logo_url: string | null; holes: number; price_from: number | null;
  facilities: string[]; website: string | null; description: string | null;
  phone: string | null; email: string | null; address: string | null;
  cart_available: boolean; cart_compulsory: boolean; cart_price: number | null;
  latitude: number | null; longitude: number | null;
  geofence_enabled: boolean; geofence_radius_m: number | null;
}

type ClubImage = {
  id: number;
  url: string;
  caption: string | null;
  display_order: number;
  created_at: string;
};

type AddMode = "file" | "url";

export default function Profile() {
  const { club: authClub } = useAuth();
  const { toast } = useToast();
  const [profile, setProfile] = useState<ClubProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // ── Facility photos state ──────────────────────────────────────────────────
  const [images, setImages] = useState<ClubImage[]>([]);
  const [imagesLoading, setImagesLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [addMode, setAddMode] = useState<AddMode>("file");
  const [lightbox, setLightbox] = useState<ClubImage | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [pendingFile, setPendingFile] = useState<{ file: File; previewUrl: string } | null>(null);
  const [fileCaption, setFileCaption] = useState("");
  const [fileOrder, setFileOrder] = useState("0");
  const [urlForm, setUrlForm] = useState({ url: "", caption: "", display_order: "0" });
  const [urlSaving, setUrlSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  useEffect(() => {
    api<ClubProfile>("/api/portal/me").then((data) => {
      setProfile(data);
    }).catch(() => {}).finally(() => setLoading(false));
    loadImages();
  }, []);

  const loadImages = async () => {
    setImagesLoading(true);
    try {
      const d = await api(`${API}/portal/images`);
      setImages(d.images ?? []);
    } catch {
      toast({ title: "Failed to load facility photos", variant: "destructive" });
    } finally {
      setImagesLoading(false);
    }
  };

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      await api("/api/portal/me", {
        method: "PUT",
        body: JSON.stringify(profile),
      });
      toast({ title: "Profile saved", description: "Your club profile has been updated." });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    setLogoUploading(true);
    try {
      const formData = new FormData();
      formData.append("logo", file);
      const token = getToken();
      const res = await fetch("/api/portal/logo/upload", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
      update("logo_url", data.logo_url);
      toast({ title: "Logo uploaded", description: "Your club logo has been updated." });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setLogoUploading(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  };

  // ── Facility photo handlers ────────────────────────────────────────────────
  const resetAdd = () => {
    setShowAdd(false);
    setPendingFile(null);
    setFileCaption("");
    setFileOrder("0");
    setUrlForm({ url: "", caption: "", display_order: "0" });
    setUploadProgress(0);
  };

  const pickFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Please select an image file", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File must be under 10 MB", variant: "destructive" });
      return;
    }
    setPendingFile({ file, previewUrl: URL.createObjectURL(file) });
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) pickFile(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) pickFile(file);
    e.target.value = "";
  };

  const handleUploadAndSave = async () => {
    if (!pendingFile) return;
    setUploading(true);
    setUploadProgress(10);
    try {
      const formData = new FormData();
      formData.append("photo", pendingFile.file);
      if (fileCaption.trim()) formData.append("caption", fileCaption.trim());
      formData.append("display_order", fileOrder);
      setUploadProgress(30);
      const token = getToken();
      const r = await fetch(`${API}/portal/images/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      setUploadProgress(80);
      if (!r.ok) throw new Error((await r.json()).message ?? "Upload failed");
      setUploadProgress(100);
      toast({ title: "Photo uploaded successfully" });
      resetAdd();
      await loadImages();
    } catch (err: any) {
      toast({ title: err.message ?? "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleAddUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlForm.url.startsWith("http")) {
      toast({ title: "Enter a valid image URL (https://…)", variant: "destructive" });
      return;
    }
    setUrlSaving(true);
    try {
      await api(`${API}/portal/images`, {
        method: "POST",
        body: JSON.stringify({ url: urlForm.url, caption: urlForm.caption || null, display_order: Number(urlForm.display_order) }),
      });
      toast({ title: "Photo added" });
      resetAdd();
      await loadImages();
    } catch (err: any) {
      toast({ title: err.message ?? "Failed to add photo", variant: "destructive" });
    } finally {
      setUrlSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this photo?")) return;
    setDeleting(id);
    try {
      await api(`${API}/portal/images/${id}`, { method: "DELETE" });
      setImages((prev) => prev.filter((i) => i.id !== id));
      toast({ title: "Photo removed" });
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  };

  if (loading || !profile) {
    return <div className="p-8 space-y-4"><h1 className="text-3xl font-bold">Club Profile</h1><Skeleton className="h-96 w-full" /></div>;
  }

  const update = (key: keyof ClubProfile, value: any) => setProfile(p => p ? { ...p, [key]: value } : p);

  return (
    <div className="p-8 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Club Profile</h1>
          <p className="text-muted-foreground mt-1">Manage your club's public-facing information.</p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="bg-[#1a5c38] hover:bg-[#164d30] gap-2">
          <Save className="h-4 w-4" />{saving ? "Saving…" : "Save Changes"}
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle>Basic Information</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="space-y-2 col-span-2">
            <Label>Club Name</Label>
            <Input value={profile.name} onChange={e => update("name", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Location / City</Label>
            <Input value={profile.location ?? ""} onChange={e => update("location", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Province</Label>
            <Select value={profile.province ?? ""} onValueChange={v => update("province", v)}>
              <SelectTrigger><SelectValue placeholder="Select province" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Gauteng">Gauteng</SelectItem>
                <SelectItem value="Western Cape">Western Cape</SelectItem>
                <SelectItem value="KwaZulu-Natal">KwaZulu-Natal</SelectItem>
                <SelectItem value="Eastern Cape">Eastern Cape</SelectItem>
                <SelectItem value="Limpopo">Limpopo</SelectItem>
                <SelectItem value="Mpumalanga">Mpumalanga</SelectItem>
                <SelectItem value="North West">North West</SelectItem>
                <SelectItem value="Free State">Free State</SelectItem>
                <SelectItem value="Northern Cape">Northern Cape</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Number of Holes</Label>
            <Select value={String(profile.holes ?? 18)} onValueChange={v => update("holes", Number(v))}>
              <SelectTrigger><SelectValue placeholder="Select holes" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="9">9 holes</SelectItem>
                <SelectItem value="18">18 holes</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 col-span-2">
            <Label>Description</Label>
            <textarea
              className="w-full border rounded-md px-3 py-2 text-sm min-h-[80px] resize-y bg-background"
              value={profile.description ?? ""}
              onChange={e => update("description", e.target.value)}
              placeholder="Describe your club…"
            />
          </div>
          <div className="space-y-2 col-span-2">
            <Label>Facilities</Label>
            <p className="text-xs text-muted-foreground -mt-1">Select all that apply to your club.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
              {[
                "Pro Shop","Restaurant","Bar","Driving Range","Putting Green","Chipping Area",
                "Practice Nets","Golf Academy","Club Hire","Caddie Service","Golf Cart Hire",
                "Locker Rooms","Changing Rooms","Pool","Spa","Gym","Accommodation",
                "Conference Facilities","Wi-Fi","Parking","Floodlit Range","Historic Club",
              ].map((facility) => {
                const checked = (profile.facilities ?? []).includes(facility);
                return (
                  <label
                    key={facility}
                    className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 cursor-pointer select-none transition-colors ${
                      checked
                        ? "border-[#1a5c38] bg-[#1a5c38]/8 text-foreground"
                        : "border-muted bg-muted/30 text-muted-foreground hover:border-muted-foreground/40"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="accent-[#1a5c38] h-4 w-4 shrink-0"
                      checked={checked}
                      onChange={() => {
                        const current = profile.facilities ?? [];
                        update("facilities", checked ? current.filter(f => f !== facility) : [...current, facility]);
                      }}
                    />
                    <span className="text-sm">{facility}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Contact & Online</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input value={profile.phone ?? ""} onChange={e => update("phone", e.target.value)} placeholder="+27 11 000 0000" />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" value={profile.email ?? ""} onChange={e => update("email", e.target.value)} placeholder="info@yourclub.co.za" />
          </div>
          <div className="space-y-2 col-span-2">
            <Label>Physical Address</Label>
            <Input value={profile.address ?? ""} onChange={e => update("address", e.target.value)} placeholder="1 Club Drive, Suburb, City, 0000" />
          </div>
          <div className="space-y-2 col-span-2">
            <Label>Website</Label>
            <Input value={profile.website ?? ""} onChange={e => update("website", e.target.value)} placeholder="https://yourclub.co.za" />
          </div>
        </CardContent>
      </Card>

      {/* ── Media ──────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Media</CardTitle>
          <CardDescription>Club logo and facility photos shown on the TapIn Golf app.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* Club Logo */}
          <div>
            <p className="text-sm font-semibold mb-3">Club Logo</p>
            <div className="flex gap-6 items-start">
              <div className="h-36 w-36 shrink-0 rounded-xl bg-muted flex items-center justify-center overflow-hidden border-2 border-dashed border-muted-foreground/30">
                {(profile.logo_url || profile.image_url) ? (
                  <img
                    src={profile.logo_url ?? profile.image_url!}
                    alt="club logo"
                    className="h-full w-full object-contain p-1"
                  />
                ) : (
                  <ImageIcon className="h-10 w-10 text-muted-foreground/40" />
                )}
              </div>
              <div className="flex flex-col gap-3 justify-center pt-1">
                <div>
                  <p className="text-sm font-medium">Club Logo / Image</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {profile.logo_url
                      ? "Showing uploaded logo"
                      : profile.image_url
                      ? "Showing image from club record"
                      : "No logo set"}
                  </p>
                </div>
                <div className="rounded-lg border border-muted bg-muted/40 px-3 py-2.5 space-y-1">
                  <p className="text-xs font-semibold text-foreground">Recommended specs</p>
                  <ul className="text-xs text-muted-foreground space-y-0.5 list-none">
                    <li>• <span className="font-medium text-foreground">800 × 800 px</span> — square (1:1 ratio)</li>
                    <li>• PNG or JPG, max <span className="font-medium text-foreground">2 MB</span></li>
                    <li>• Used as a banner on the club detail screen and in listings</li>
                  </ul>
                </div>
                <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={logoUploading}
                  onClick={() => logoInputRef.current?.click()}
                  className="w-fit gap-2"
                >
                  <Upload className="h-4 w-4" />
                  {logoUploading ? "Uploading…" : (profile.logo_url || profile.image_url) ? "Replace Logo" : "Upload Logo"}
                </Button>
                {profile.logo_url && (
                  <button
                    type="button"
                    onClick={() => update("logo_url", null)}
                    className="text-xs text-muted-foreground underline underline-offset-2 w-fit hover:text-destructive"
                  >
                    Remove uploaded logo
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-dashed border-muted-foreground/20" />

          {/* Facility Photos */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Facility Photos</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Showcase your course, clubhouse and facilities to golfers browsing your club.
                </p>
              </div>
              {!showAdd && (
                <Button size="sm" variant="outline" onClick={() => setShowAdd(true)} className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> Add Photo
                </Button>
              )}
            </div>

            {/* Add panel */}
            {showAdd && (
              <div className="border rounded-xl p-4 bg-muted/30 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-sm">Add New Photo</p>
                  <button onClick={resetAdd} className="text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setAddMode("file")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${addMode === "file" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
                  >
                    <Upload className="h-3 w-3" /> Upload from computer
                  </button>
                  <button
                    onClick={() => setAddMode("url")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${addMode === "url" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
                  >
                    <Link className="h-3 w-3" /> Paste URL
                  </button>
                </div>

                {/* File upload */}
                {addMode === "file" && (
                  <div className="space-y-3">
                    {!pendingFile ? (
                      <div
                        className={`border-2 border-dashed rounded-xl flex flex-col items-center justify-center py-10 gap-2 cursor-pointer transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/50"}`}
                        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={handleFileDrop}
                        onClick={() => fileRef.current?.click()}
                      >
                        <Upload className={`h-8 w-8 ${dragOver ? "text-primary" : "text-muted-foreground/40"}`} />
                        <p className="text-sm font-medium">Drop photo here or click to browse</p>
                        <p className="text-xs text-muted-foreground">JPG, PNG, WebP — max 10 MB</p>
                        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileInput} />
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="relative rounded-xl overflow-hidden border bg-muted h-44">
                          <img src={pendingFile.previewUrl} alt="Preview" className="h-full w-full object-cover" />
                          <button
                            onClick={() => setPendingFile(null)}
                            className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white rounded-full p-1"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                          <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs rounded px-2 py-1 max-w-[80%] truncate">
                            {pendingFile.file.name} ({(pendingFile.file.size / 1024).toFixed(0)} KB)
                          </div>
                        </div>
                        {uploading && (
                          <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                            <div className="bg-primary h-full rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs">Caption <span className="text-muted-foreground">(optional)</span></Label>
                            <Input value={fileCaption} onChange={e => setFileCaption(e.target.value)} placeholder="e.g. View from the 18th tee" disabled={uploading} />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Display Order</Label>
                            <Input type="number" value={fileOrder} onChange={e => setFileOrder(e.target.value)} min={0} disabled={uploading} />
                            <p className="text-xs text-muted-foreground">Lower = shown first</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button type="button" variant="outline" onClick={resetAdd} disabled={uploading} className="flex-1">Cancel</Button>
                          <Button onClick={handleUploadAndSave} disabled={uploading} className="flex-1 gap-2">
                            {uploading ? (
                              <><div className="h-4 w-4 border-2 border-primary-foreground/40 border-t-primary-foreground rounded-full animate-spin" />Uploading…</>
                            ) : (
                              <><Upload className="h-4 w-4" />Upload Photo</>
                            )}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* URL mode */}
                {addMode === "url" && (
                  <form onSubmit={handleAddUrl} className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Image URL <span className="text-destructive">*</span></Label>
                      <Input value={urlForm.url} onChange={e => setUrlForm(f => ({ ...f, url: e.target.value }))} placeholder="https://example.com/image.jpg" required />
                    </div>
                    {urlForm.url.startsWith("http") && (
                      <div className="rounded-lg overflow-hidden border bg-muted h-36">
                        <img src={urlForm.url} alt="Preview" className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Caption <span className="text-muted-foreground">(optional)</span></Label>
                        <Input value={urlForm.caption} onChange={e => setUrlForm(f => ({ ...f, caption: e.target.value }))} placeholder="e.g. Clubhouse entrance" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Display Order</Label>
                        <Input type="number" value={urlForm.display_order} onChange={e => setUrlForm(f => ({ ...f, display_order: e.target.value }))} min={0} />
                        <p className="text-xs text-muted-foreground">Lower = shown first</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" onClick={resetAdd} className="flex-1">Cancel</Button>
                      <Button type="submit" disabled={urlSaving} className="flex-1">{urlSaving ? "Adding…" : "Add Photo"}</Button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* Photo grid */}
            {imagesLoading ? (
              <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="aspect-square rounded-xl bg-muted animate-pulse" />
                ))}
              </div>
            ) : images.length === 0 ? (
              <div
                className="border-2 border-dashed rounded-xl flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground cursor-pointer hover:border-primary/50 hover:bg-muted/20 transition-colors"
                onClick={() => { setShowAdd(true); setAddMode("file"); }}
              >
                <ImageIcon className="h-8 w-8 opacity-30" />
                <div className="text-center">
                  <p className="font-medium text-sm">No facility photos yet</p>
                  <p className="text-xs mt-1">Upload photos of your course, clubhouse and facilities.</p>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
                  {images.map((img) => (
                    <div
                      key={img.id}
                      className="group relative aspect-square rounded-xl overflow-hidden border bg-muted cursor-pointer"
                      onClick={() => setLightbox(img)}
                    >
                      <img src={img.url} alt={img.caption ?? "Club photo"} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all" />
                      {img.caption && (
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                          <p className="text-white text-xs font-medium truncate">{img.caption}</p>
                        </div>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(img.id); }}
                        disabled={deleting === img.id}
                        className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 hover:bg-red-600 text-white rounded-full p-1 shadow"
                      >
                        {deleting === img.id ? (
                          <div className="h-3 w-3 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                      </button>
                      <div className="absolute top-1.5 left-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 text-white rounded px-1.5 py-0.5 text-[10px] flex items-center gap-0.5">
                        <GripVertical className="h-2.5 w-2.5" />{img.display_order}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {images.length} photo{images.length !== 1 ? "s" : ""} · Click a photo to view full-size
                </p>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Cart Settings</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div><Label>Cart Available</Label><p className="text-xs text-muted-foreground">Golf carts can be booked</p></div>
            <Switch checked={!!profile.cart_available} onCheckedChange={v => update("cart_available", v)} />
          </div>
          <div className="flex items-center justify-between">
            <div><Label>Cart Compulsory</Label><p className="text-xs text-muted-foreground">All players must use a cart</p></div>
            <Switch checked={!!profile.cart_compulsory} onCheckedChange={v => update("cart_compulsory", v)} />
          </div>
          <div className="space-y-2">
            <Label>Cart Price (ZAR per player)</Label>
            <Input type="number" value={profile.cart_price ?? ""} onChange={e => update("cart_price", Number(e.target.value))} placeholder="0" className="max-w-xs" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Location</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-muted-foreground">Latitude</Label>
            <Input type="number" step="any" value={profile.latitude ?? ""} readOnly disabled placeholder="-26.0000" className="cursor-not-allowed opacity-50" />
          </div>
          <div className="space-y-2">
            <Label className="text-muted-foreground">Longitude</Label>
            <Input type="number" step="any" value={profile.longitude ?? ""} readOnly disabled placeholder="28.0000" className="cursor-not-allowed opacity-50" />
          </div>
          <p className="col-span-2 text-xs text-muted-foreground -mt-1">
            Coordinates are managed by TapIn Golf administrators and cannot be changed here.
          </p>
          <div className="flex items-center justify-between col-span-2">
            <div><Label>Geofence Enabled</Label><p className="text-xs text-muted-foreground">Restrict check-in to club location</p></div>
            <Switch checked={!!profile.geofence_enabled} onCheckedChange={v => update("geofence_enabled", v)} />
          </div>
          <div className="space-y-2">
            <Label>Geofence Radius (meters)</Label>
            <Input type="number" value={profile.geofence_radius_m ?? ""} onChange={e => update("geofence_radius_m", Number(e.target.value))} placeholder="500" className="max-w-xs" disabled={!profile.geofence_enabled} />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="bg-[#1a5c38] hover:bg-[#164d30] gap-2">
          <Save className="h-4 w-4" />{saving ? "Saving…" : "Save Changes"}
        </Button>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button className="absolute top-4 right-4 text-white/80 hover:text-white" onClick={() => setLightbox(null)}>
            <X className="h-8 w-8" />
          </button>
          <div className="max-w-4xl max-h-full" onClick={(e) => e.stopPropagation()}>
            <img src={lightbox.url} alt={lightbox.caption ?? "Club photo"} className="max-h-[80vh] max-w-full rounded-lg object-contain" />
            {lightbox.caption && <p className="text-white text-center mt-3 text-sm">{lightbox.caption}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
