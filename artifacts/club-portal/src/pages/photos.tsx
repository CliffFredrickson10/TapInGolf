import { useEffect, useRef, useState } from "react";
import { api, getToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ImageIcon, Plus, Trash2, GripVertical, X, Upload, Link } from "lucide-react";

type ClubImage = {
  id: number;
  url: string;
  caption: string | null;
  display_order: number;
  created_at: string;
};

const API = import.meta.env.VITE_API_URL ?? "/api";

type AddMode = "file" | "url";

export default function Photos() {
  const { toast } = useToast();
  const [images, setImages] = useState<ClubImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [addMode, setAddMode] = useState<AddMode>("file");
  const [lightbox, setLightbox] = useState<ClubImage | null>(null);

  // File upload state
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [pendingFile, setPendingFile] = useState<{ file: File; previewUrl: string } | null>(null);
  const [fileCaption, setFileCaption] = useState("");
  const [fileOrder, setFileOrder] = useState("0");

  // URL input state
  const [form, setForm] = useState({ url: "", caption: "", display_order: "0" });
  const [saving, setSaving] = useState(false);

  const [deleting, setDeleting] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const d = await api(`${API}/portal/images`);
      setImages(d.images ?? []);
    } catch {
      toast({ title: "Failed to load images", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const resetAdd = () => {
    setShowAdd(false);
    setPendingFile(null);
    setFileCaption("");
    setFileOrder("0");
    setForm({ url: "", caption: "", display_order: "0" });
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
    const previewUrl = URL.createObjectURL(file);
    setPendingFile({ file, previewUrl });
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
      await load();
    } catch (err: any) {
      toast({ title: err.message ?? "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleAddUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.url.startsWith("http")) {
      toast({ title: "Enter a valid image URL (https://…)", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await api(`${API}/portal/images`, {
        method: "POST",
        body: JSON.stringify({ url: form.url, caption: form.caption || null, display_order: Number(form.display_order) }),
      });
      toast({ title: "Photo added" });
      resetAdd();
      await load();
    } catch (err: any) {
      toast({ title: err.message ?? "Failed to add photo", variant: "destructive" });
    } finally {
      setSaving(false);
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

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Facility Photos</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Photos visible to golfers browsing your club — showcase your facilities, course, and clubhouse.
          </p>
        </div>
        <Button onClick={() => setShowAdd(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Add Photo
        </Button>
      </div>

      {/* Add panel */}
      {showAdd && (
        <div className="border rounded-xl p-5 bg-card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Add New Photo</h2>
            <button onClick={resetAdd} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Mode toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setAddMode("file")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${addMode === "file" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
            >
              <Upload className="h-3.5 w-3.5" /> Upload from computer
            </button>
            <button
              onClick={() => setAddMode("url")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${addMode === "url" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
            >
              <Link className="h-3.5 w-3.5" /> Paste URL
            </button>
          </div>

          {/* File upload mode */}
          {addMode === "file" && (
            <div className="space-y-4">
              {!pendingFile ? (
                <div
                  className={`border-2 border-dashed rounded-xl flex flex-col items-center justify-center py-12 gap-3 cursor-pointer transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/50"}`}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleFileDrop}
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className={`h-10 w-10 ${dragOver ? "text-primary" : "text-muted-foreground/50"}`} />
                  <div className="text-center">
                    <p className="font-medium text-sm">Drop your photo here or click to browse</p>
                    <p className="text-xs text-muted-foreground mt-1">JPG, PNG, WebP — max 10 MB</p>
                  </div>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileInput} />
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Preview */}
                  <div className="relative rounded-xl overflow-hidden border bg-muted h-48">
                    <img src={pendingFile.previewUrl} alt="Preview" className="h-full w-full object-cover" />
                    <button
                      onClick={() => setPendingFile(null)}
                      className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white rounded-full p-1 transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs rounded px-2 py-1 max-w-[80%] truncate">
                      {pendingFile.file.name} ({(pendingFile.file.size / 1024).toFixed(0)} KB)
                    </div>
                  </div>

                  {/* Progress bar */}
                  {uploading && (
                    <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-primary h-full rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Caption <span className="text-muted-foreground text-xs">(optional)</span></Label>
                      <Input
                        value={fileCaption}
                        onChange={(e) => setFileCaption(e.target.value)}
                        placeholder="e.g. View from the 18th tee"
                        disabled={uploading}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Display Order</Label>
                      <Input
                        type="number"
                        value={fileOrder}
                        onChange={(e) => setFileOrder(e.target.value)}
                        min={0}
                        disabled={uploading}
                      />
                      <p className="text-xs text-muted-foreground">Lower = shown first</p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <Button type="button" variant="outline" onClick={resetAdd} disabled={uploading} className="flex-1">Cancel</Button>
                    <Button onClick={handleUploadAndSave} disabled={uploading} className="flex-1 gap-2">
                      {uploading ? (
                        <>
                          <div className="h-4 w-4 border-2 border-primary-foreground/40 border-t-primary-foreground rounded-full animate-spin" />
                          Uploading…
                        </>
                      ) : (
                        <><Upload className="h-4 w-4" /> Upload Photo</>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* URL mode */}
          {addMode === "url" && (
            <form onSubmit={handleAddUrl} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Image URL <span className="text-destructive">*</span></Label>
                <Input
                  value={form.url}
                  onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                  placeholder="https://example.com/image.jpg"
                  required
                />
                <p className="text-xs text-muted-foreground">Paste a direct link to your photo.</p>
              </div>
              {form.url.startsWith("http") && (
                <div className="rounded-lg overflow-hidden border bg-muted h-40">
                  <img src={form.url} alt="Preview" className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Caption <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <Input
                    value={form.caption}
                    onChange={(e) => setForm((f) => ({ ...f, caption: e.target.value }))}
                    placeholder="e.g. View from the 18th tee"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Display Order</Label>
                  <Input
                    type="number"
                    value={form.display_order}
                    onChange={(e) => setForm((f) => ({ ...f, display_order: e.target.value }))}
                    min={0}
                  />
                  <p className="text-xs text-muted-foreground">Lower = shown first</p>
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <Button type="button" variant="outline" onClick={resetAdd} className="flex-1">Cancel</Button>
                <Button type="submit" disabled={saving} className="flex-1">{saving ? "Adding…" : "Add Photo"}</Button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-square rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : images.length === 0 ? (
        <div
          className="border-2 border-dashed rounded-xl flex flex-col items-center justify-center py-20 gap-4 text-muted-foreground cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
          onClick={() => { setShowAdd(true); setAddMode("file"); }}
        >
          <ImageIcon className="h-12 w-12 opacity-30" />
          <div className="text-center">
            <p className="font-medium">No photos yet</p>
            <p className="text-sm mt-1">Upload facility photos so golfers can see what your club looks like.</p>
          </div>
          <Button variant="outline" className="gap-2" onClick={(e) => { e.stopPropagation(); setShowAdd(true); setAddMode("file"); }}>
            <Upload className="h-4 w-4" /> Upload First Photo
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {images.map((img) => (
            <div
              key={img.id}
              className="group relative aspect-square rounded-xl overflow-hidden border bg-muted cursor-pointer"
              onClick={() => setLightbox(img)}
            >
              <img
                src={img.url}
                alt={img.caption ?? "Club photo"}
                className="h-full w-full object-cover transition-transform group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all" />
              {img.caption && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3">
                  <p className="text-white text-xs font-medium truncate">{img.caption}</p>
                </div>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(img.id); }}
                disabled={deleting === img.id}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 hover:bg-red-600 text-white rounded-full p-1.5 shadow-md"
                title="Delete photo"
              >
                {deleting === img.id ? (
                  <div className="h-3.5 w-3.5 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
              </button>
              <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 text-white rounded-full px-2 py-0.5 text-xs flex items-center gap-1">
                <GripVertical className="h-3 w-3" />
                {img.display_order}
              </div>
            </div>
          ))}
        </div>
      )}

      {images.length > 0 && (
        <p className="text-sm text-muted-foreground text-center">
          {images.length} photo{images.length !== 1 ? "s" : ""} · Click a photo to view full-size
        </p>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            className="absolute top-4 right-4 text-white/80 hover:text-white transition-colors"
            onClick={() => setLightbox(null)}
          >
            <X className="h-8 w-8" />
          </button>
          <div className="max-w-4xl max-h-full" onClick={(e) => e.stopPropagation()}>
            <img
              src={lightbox.url}
              alt={lightbox.caption ?? "Club photo"}
              className="max-h-[80vh] max-w-full rounded-lg object-contain"
            />
            {lightbox.caption && (
              <p className="text-white text-center mt-3 text-sm">{lightbox.caption}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
