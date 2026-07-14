import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useReadOnly } from "@/context/ReadOnlyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Store, Plus, Pencil, Trash2, CalendarDays } from "lucide-react";
import { format, parseISO, addDays } from "date-fns";

interface ResaleListing {
  id: number;
  slot_id: number;
  price: number;
  status: "listed" | "sold";
  date: string;
  tee_time: string;
  max_players: number;
  payment_pending: boolean;
  reseller_name: string | null;
  sold_amount: number | null;
  sold_at: string | null;
}

interface EligibleSlot {
  id: number;
  tee_time: string;
  max_players: number;
  player_count: number;
  held_count: number;
  listable: boolean;
  listing_id: number | null;
  listing_status: string | null;
  listing_price: number | null;
}

export default function Resale() {
  const { toast } = useToast();
  const readOnly = useReadOnly();
  const [enabled, setEnabled] = useState(false);
  const [listings, setListings] = useState<ResaleListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  // List-a-slot dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [slotDate, setSlotDate] = useState(() => format(addDays(new Date(), 1), "yyyy-MM-dd"));
  const [slots, setSlots] = useState<EligibleSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);

  // Edit price dialog
  const [editListing, setEditListing] = useState<ResaleListing | null>(null);
  const [editPrice, setEditPrice] = useState("");

  const load = useCallback(() =>
    api<{ enabled: boolean; listings: ResaleListing[] }>("/api/portal/resale")
      .then((data) => { setEnabled(data.enabled); setListings(data.listings); })
      .catch((e) => toast({ title: "Error loading resale settings", description: e.message, variant: "destructive" }))
      .finally(() => setLoading(false)),
    [toast]
  );

  useEffect(() => { load(); }, [load]);

  const toggleEnabled = async (next: boolean) => {
    setToggling(true);
    try {
      await api("/api/portal/resale/enabled", { method: "PUT", body: JSON.stringify({ enabled: next }) });
      setEnabled(next);
      toast({
        title: next ? "Resale marketplace enabled" : "Resale marketplace disabled",
        description: next
          ? "Resellers can now see your listed tee times."
          : "Your club is hidden from resellers. Existing listings stay hidden from public booking until unlisted.",
      });
    } catch (e: any) {
      toast({ title: "Could not update setting", description: e.message, variant: "destructive" });
    } finally {
      setToggling(false);
    }
  };

  const loadSlots = useCallback((date: string) => {
    setSlotsLoading(true);
    setSelectedIds(new Set());
    api<{ slots: EligibleSlot[] }>(`/api/portal/resale/slots?date=${date}`)
      .then((data) => setSlots(data.slots))
      .catch((e) => toast({ title: "Error loading slots", description: e.message, variant: "destructive" }))
      .finally(() => setSlotsLoading(false));
  }, [toast]);

  useEffect(() => {
    if (dialogOpen && /^\d{4}-\d{2}-\d{2}$/.test(slotDate)) loadSlots(slotDate);
  }, [dialogOpen, slotDate, loadSlots]);

  const toggleSlot = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const createListing = async () => {
    const chosen = slots.filter((s) => s.listable && selectedIds.has(s.id));
    if (chosen.length === 0) return;
    const p = parseFloat(price);
    if (isNaN(p) || p < 1) {
      toast({ title: "Invalid price", description: "Price must be at least R1.00", variant: "destructive" });
      return;
    }
    setSaving(true);
    const failed: string[] = [];
    let listed = 0;
    for (const s of chosen) {
      try {
        await api("/api/portal/resale/listings", {
          method: "POST",
          body: JSON.stringify({ slot_id: s.id, price: p }),
        });
        listed++;
      } catch {
        failed.push(s.tee_time);
      }
    }
    setSaving(false);
    if (listed > 0) {
      toast({
        title: listed === 1 ? "Slot listed" : `${listed} slots listed`,
        description: `Listed for R${p.toFixed(2)} each on ${slotDate} and hidden from public booking.`,
      });
    }
    if (failed.length > 0) {
      toast({ title: "Some slots could not be listed", description: failed.join(", "), variant: "destructive" });
      loadSlots(slotDate);
      load();
      return;
    }
    setDialogOpen(false);
    setPrice("");
    setSelectedIds(new Set());
    load();
  };

  const savePrice = async () => {
    if (!editListing) return;
    const p = parseFloat(editPrice);
    if (isNaN(p) || p < 1) {
      toast({ title: "Invalid price", description: "Price must be at least R1.00", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await api(`/api/portal/resale/listings/${editListing.id}`, { method: "PUT", body: JSON.stringify({ price: p }) });
      toast({ title: "Price updated" });
      setEditListing(null);
      load();
    } catch (e: any) {
      toast({ title: "Could not update price", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const unlist = async (listing: ResaleListing) => {
    try {
      await api(`/api/portal/resale/listings/${listing.id}`, { method: "DELETE" });
      toast({ title: "Slot unlisted", description: "The slot is available for public booking again." });
      load();
    } catch (e: any) {
      toast({ title: "Could not unlist", description: e.message, variant: "destructive" });
    }
  };

  const active = listings.filter((l) => l.status === "listed");
  const sold = listings.filter((l) => l.status === "sold");

  return (
    <div className="p-8 max-w-5xl w-full mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Store className="h-6 w-6 text-[#1a5c38]" /> Resale Marketplace
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sell unsold tee-time slots to registered resellers. Listed slots are hidden from public booking in the app.
          </p>
        </div>
        {!readOnly && (
          <Button className="bg-[#1a5c38] hover:bg-[#164d30]" onClick={() => setDialogOpen(true)} disabled={loading} data-testid="button-list-slot">
            <Plus className="h-4 w-4 mr-1.5" /> List a slot
          </Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      ) : (
        <>
          <Card className="mb-6">
            <CardContent className="flex items-center justify-between py-5">
              <div>
                <div className="font-semibold">Participate in the resale marketplace</div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  When enabled, resellers can find your club and buy the slots you list below.
                </p>
              </div>
              <Switch
                checked={enabled}
                onCheckedChange={toggleEnabled}
                disabled={toggling || readOnly}
                data-testid="switch-resale-enabled"
              />
            </CardContent>
          </Card>

          <Card className="mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Active listings</CardTitle>
              <CardDescription>Slots currently offered to resellers.</CardDescription>
            </CardHeader>
            <CardContent>
              {active.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-sm">
                  <CalendarDays className="h-6 w-6 mx-auto mb-2 opacity-40" />
                  No active listings. List an unsold slot to offer it to resellers.
                </div>
              ) : (
                <div className="divide-y">
                  {active.map((l) => (
                    <div key={l.id} className="flex items-center gap-4 py-3" data-testid={`row-listing-${l.id}`}>
                      <div className="w-14 text-center">
                        <div className="font-bold tabular-nums">{l.tee_time}</div>
                        <div className="text-[10px] text-muted-foreground uppercase">{l.max_players}-ball</div>
                      </div>
                      <div className="flex-1 text-sm">{format(parseISO(l.date), "EEE, d MMM yyyy")}</div>
                      <div className="font-semibold">R{l.price.toFixed(2)}</div>
                      {l.payment_pending && <Badge variant="secondary">Payment in progress</Badge>}
                      {!readOnly && (
                        <div className="flex gap-1">
                          <Button
                            variant="ghost" size="icon" className="h-8 w-8"
                            disabled={l.payment_pending}
                            onClick={() => { setEditListing(l); setEditPrice(String(l.price)); }}
                            data-testid={`button-edit-${l.id}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                            disabled={l.payment_pending}
                            onClick={() => unlist(l)}
                            data-testid={`button-unlist-${l.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Sold</CardTitle>
              <CardDescription>Slots bought by resellers — payment confirmed via Stitch.</CardDescription>
            </CardHeader>
            <CardContent>
              {sold.length === 0 ? (
                <div className="py-6 text-center text-muted-foreground text-sm">No sales yet.</div>
              ) : (
                <div className="divide-y">
                  {sold.map((l) => (
                    <div key={l.id} className="flex items-center gap-4 py-3" data-testid={`row-sold-${l.id}`}>
                      <div className="w-14 text-center">
                        <div className="font-bold tabular-nums">{l.tee_time}</div>
                        <div className="text-[10px] text-muted-foreground uppercase">{l.max_players}-ball</div>
                      </div>
                      <div className="flex-1 text-sm">
                        {format(parseISO(l.date), "EEE, d MMM yyyy")}
                        {l.reseller_name && <span className="text-muted-foreground"> · sold to {l.reseller_name}</span>}
                      </div>
                      <div className="font-semibold">R{(l.sold_amount ?? l.price).toFixed(2)}</div>
                      <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Sold</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* List-a-slot dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>List a slot for resale</DialogTitle>
            <DialogDescription>
              Only empty, active, non-tournament slots with no holds can be listed. Listing hides the slot from public booking.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="slot-date">Date</Label>
              <Input
                id="slot-date"
                type="date"
                value={slotDate}
                min={format(new Date(), "yyyy-MM-dd")}
                onChange={(e) => setSlotDate(e.target.value)}
                data-testid="input-slot-date"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Available slots{selectedIds.size > 0 ? ` (${selectedIds.size} selected)` : ""}</Label>
                {!slotsLoading && slots.filter((s) => s.listable).length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => {
                      const listable = slots.filter((s) => s.listable);
                      setSelectedIds((prev) =>
                        prev.size === listable.length ? new Set() : new Set(listable.map((s) => s.id))
                      );
                    }}
                    data-testid="button-select-all-slots"
                  >
                    {selectedIds.size === slots.filter((s) => s.listable).length ? "Deselect all" : "Select all"}
                  </Button>
                )}
              </div>
              {slotsLoading ? (
                <Skeleton className="h-24 w-full rounded-lg" />
              ) : slots.filter((s) => s.listable).length === 0 ? (
                <p className="text-sm text-muted-foreground py-3">No listable slots on this date.</p>
              ) : (
                <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto p-0.5">
                  {slots.filter((s) => s.listable).map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggleSlot(s.id)}
                      className={`text-sm py-2 rounded-lg border font-medium transition-colors ${
                        selectedIds.has(s.id)
                          ? "bg-[#1a5c38] text-white border-[#1a5c38]"
                          : "hover:border-[#1a5c38]/50"
                      }`}
                      data-testid={`button-slot-${s.id}`}
                    >
                      {s.tee_time}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="price">Price (R)</Label>
              <Input
                id="price"
                type="number"
                min="1"
                step="0.01"
                placeholder="e.g. 1200.00"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                data-testid="input-price"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              className="bg-[#1a5c38] hover:bg-[#164d30]"
              disabled={selectedIds.size === 0 || !price || saving}
              onClick={createListing}
              data-testid="button-confirm-list"
            >
              {saving ? "Listing…" : selectedIds.size > 1 ? `List ${selectedIds.size} slots` : "List slot"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit price dialog */}
      <Dialog open={!!editListing} onOpenChange={(o) => { if (!o) setEditListing(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit listing price</DialogTitle>
            <DialogDescription>
              {editListing && `${editListing.tee_time} on ${format(parseISO(editListing.date), "d MMM yyyy")}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="edit-price">Price (R)</Label>
            <Input
              id="edit-price"
              type="number"
              min="1"
              step="0.01"
              value={editPrice}
              onChange={(e) => setEditPrice(e.target.value)}
              data-testid="input-edit-price"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditListing(null)}>Cancel</Button>
            <Button className="bg-[#1a5c38] hover:bg-[#164d30]" disabled={saving} onClick={savePrice} data-testid="button-save-price">
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
