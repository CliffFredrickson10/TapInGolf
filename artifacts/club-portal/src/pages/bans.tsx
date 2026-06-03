import { useState, useEffect, useCallback, useRef } from "react";
import { useSearch } from "wouter";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useReadOnly } from "@/context/ReadOnlyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ShieldOff, Plus, Search, Phone, User2, ChevronRight, AlertTriangle, CheckCircle2, Clock } from "lucide-react";

interface Ban {
  id: number;
  status: "active" | "appealing" | "lifted";
  reason: string;
  appeal_message: string | null;
  appealed_at: string | null;
  appeal_response: string | null;
  lift_note: string | null;
  lifted_at: string | null;
  created_at: string;
  user_id: number;
  user_name: string;
  phone: string;
  email: string;
}

interface UserResult {
  id: number;
  name: string;
  phone: string;
  email: string;
}

const STATUS_CONFIG = {
  active:    { label: "Banned",    color: "bg-red-100 text-red-700 border-red-200" },
  appealing: { label: "Appealing", color: "bg-amber-100 text-amber-700 border-amber-200" },
  lifted:    { label: "Lifted",    color: "bg-green-100 text-green-700 border-green-200" },
};

function StatusBadge({ status }: { status: Ban["status"] }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${cfg.color}`}>
      {status === "active" && <ShieldOff size={11} />}
      {status === "appealing" && <Clock size={11} />}
      {status === "lifted" && <CheckCircle2 size={11} />}
      {cfg.label}
    </span>
  );
}

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

export default function Bans() {
  const { toast } = useToast();
  const readOnly = useReadOnly();
  const search = useSearch();

  const [bans, setBans] = useState<Ban[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  const [banOpen, setBanOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserResult | null>(null);
  const [banReason, setBanReason] = useState("");
  const [banning, setBanning] = useState(false);

  const [detailBan, setDetailBan] = useState<Ban | null>(null);
  const [liftNote, setLiftNote] = useState("");
  const [respondNote, setRespondNote] = useState("");
  const [actioning, setActioning] = useState(false);

  // Track whether we've already auto-opened from the URL param so we only do it once.
  const autoOpenedRef = useRef(false);

  const fetchBans = useCallback(async () => {
    setLoading(true);
    try {
      const params = filter !== "all" ? `?status=${filter}` : "";
      const data = await api<Ban[]>(`/api/portal/bans${params}`);
      setBans(data);
      // If the page was navigated to with ?ban=<id> (e.g. from a notification), open that ban.
      if (!autoOpenedRef.current) {
        const targetId = new URLSearchParams(search).get("ban");
        if (targetId) {
          const found = data.find(b => b.id === parseInt(targetId, 10));
          if (found) {
            setDetailBan(found);
            setLiftNote("");
            setRespondNote("");
            autoOpenedRef.current = true;
          }
        }
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [filter, search]);

  useEffect(() => { fetchBans(); }, [fetchBans]);

  useEffect(() => {
    if (searchQ.trim().length < 2) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await api<UserResult[]>(`/api/portal/user-lookup?q=${encodeURIComponent(searchQ.trim())}`);
        setSearchResults(r);
      } catch { /* ignore */ } finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [searchQ]);

  const handleBan = async () => {
    if (!selectedUser || !banReason.trim()) return;
    setBanning(true);
    try {
      await api("/api/portal/bans", { method: "POST", body: JSON.stringify({ user_id: selectedUser.id, reason: banReason.trim() }) });
      toast({ title: "Golfer banned", description: `${selectedUser.name} has been notified.` });
      setBanOpen(false);
      setSelectedUser(null);
      setSearchQ("");
      setBanReason("");
      fetchBans();
    } catch (e: any) {
      toast({ title: "Error", description: e.message ?? "Failed to ban golfer", variant: "destructive" });
    } finally { setBanning(false); }
  };

  const handleLift = async () => {
    if (!detailBan) return;
    setActioning(true);
    try {
      await api(`/api/portal/bans/${detailBan.id}/lift`, { method: "POST", body: JSON.stringify({ lift_note: liftNote.trim() || null }) });
      toast({ title: "Ban lifted", description: `${detailBan.user_name}'s access has been restored.` });
      setDetailBan(null);
      fetchBans();
    } catch (e: any) {
      toast({ title: "Error", description: e.message ?? "Failed to lift ban", variant: "destructive" });
    } finally { setActioning(false); }
  };

  const handleRespond = async (action: "lift" | "maintain") => {
    if (!detailBan) return;
    setActioning(true);
    try {
      await api(`/api/portal/bans/${detailBan.id}/respond`, {
        method: "POST",
        body: JSON.stringify({ action, response_note: respondNote.trim() || null }),
      });
      toast({
        title: action === "lift" ? "Appeal accepted" : "Appeal declined",
        description: action === "lift" ? `${detailBan.user_name}'s access has been restored.` : "The ban remains in place.",
      });
      setDetailBan(null);
      fetchBans();
    } catch (e: any) {
      toast({ title: "Error", description: e.message ?? "Failed to respond", variant: "destructive" });
    } finally { setActioning(false); }
  };

  const appeals = bans.filter(b => b.status === "appealing").length;
  const displayed = filter === "all" ? bans : bans.filter(b => b.status === filter);

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldOff className="text-[#1a5c38]" size={24} />
            Banned Golfers
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage golfers who are restricted from booking at your club.
            {appeals > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-amber-700 font-semibold">
                <AlertTriangle size={14} /> {appeals} appeal{appeals > 1 ? "s" : ""} pending
              </span>
            )}
          </p>
        </div>
        {!readOnly && (
          <Button className="bg-[#1a5c38] hover:bg-[#164d30] shrink-0" onClick={() => setBanOpen(true)}>
            <Plus size={16} className="mr-1" /> Ban a Golfer
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="appealing">Appealing</SelectItem>
            <SelectItem value="active">Active bans</SelectItem>
            <SelectItem value="lifted">Lifted</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{displayed.length} record{displayed.length !== 1 ? "s" : ""}</span>
      </div>

      {loading ? (
        <div className="text-center py-16 text-muted-foreground">Loading…</div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ShieldOff size={40} className="mx-auto mb-3 opacity-30" />
          <p>{filter === "all" ? "No banned golfers." : `No ${filter} bans.`}</p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3">Golfer</th>
                <th className="text-left px-4 py-3">Reason</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Date</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {displayed.map((ban) => (
                <tr
                  key={ban.id}
                  className="hover:bg-muted/30 cursor-pointer transition-colors"
                  onClick={() => { setDetailBan(ban); setLiftNote(""); setRespondNote(""); }}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium">{ban.user_name}</div>
                    <div className="text-xs text-muted-foreground">{ban.phone}</div>
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    <span className="line-clamp-1">{ban.reason}</span>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={ban.status} /></td>
                  <td className="px-4 py-3 text-muted-foreground">{fmt(ban.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <ChevronRight size={16} className="text-muted-foreground inline" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Ban a golfer dialog ── */}
      <Dialog open={banOpen} onOpenChange={o => { setBanOpen(o); if (!o) { setSelectedUser(null); setSearchQ(""); setBanReason(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ban a Golfer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {!selectedUser ? (
              <div className="space-y-2">
                <Label>Search by name or phone number</Label>
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchQ}
                    onChange={e => setSearchQ(e.target.value)}
                    placeholder="e.g. John or +27…"
                    className="pl-9"
                    autoFocus
                  />
                </div>
                {searching && <p className="text-xs text-muted-foreground">Searching…</p>}
                {searchResults.length > 0 && (
                  <div className="border rounded-lg overflow-hidden divide-y">
                    {searchResults.map(u => (
                      <button
                        key={u.id}
                        className="w-full text-left px-4 py-3 hover:bg-muted/50 flex items-center gap-3"
                        onClick={() => { setSelectedUser(u); setSearchQ(""); setSearchResults([]); }}
                      >
                        <User2 size={16} className="text-muted-foreground shrink-0" />
                        <div>
                          <div className="font-medium text-sm">{u.name}</div>
                          <div className="text-xs text-muted-foreground flex items-center gap-2">
                            <Phone size={10} /> {u.phone}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {searchQ.trim().length >= 2 && !searching && searchResults.length === 0 && (
                  <p className="text-xs text-muted-foreground">No golfers found. They must be registered on TapIn.</p>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
                  <div>
                    <p className="font-semibold text-sm">{selectedUser.name}</p>
                    <p className="text-xs text-muted-foreground">{selectedUser.phone}</p>
                  </div>
                  <button className="text-xs text-[#1a5c38] hover:underline" onClick={() => setSelectedUser(null)}>Change</button>
                </div>
                <div className="space-y-1.5">
                  <Label>Reason for ban <span className="text-destructive">*</span></Label>
                  <Textarea
                    value={banReason}
                    onChange={e => setBanReason(e.target.value)}
                    placeholder="e.g. Deliberately damaged the 7th green on 1 June 2026. Permanent ban."
                    rows={3}
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground">This reason will be shown to the golfer in their TapIn app.</p>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBanOpen(false)}>Cancel</Button>
            {selectedUser && (
              <Button
                className="bg-red-600 hover:bg-red-700"
                disabled={!banReason.trim() || banning}
                onClick={handleBan}
              >
                {banning ? "Banning…" : "Confirm Ban"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Ban detail sheet ── */}
      <Sheet open={!!detailBan} onOpenChange={o => !o && setDetailBan(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {detailBan && (
            <>
              <SheetHeader className="mb-6">
                <SheetTitle className="flex items-center gap-2">
                  <ShieldOff size={18} className="text-[#1a5c38]" />
                  Ban Details
                </SheetTitle>
              </SheetHeader>

              <div className="space-y-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-bold text-lg">{detailBan.user_name}</p>
                    <p className="text-sm text-muted-foreground">{detailBan.phone}</p>
                    <p className="text-sm text-muted-foreground">{detailBan.email}</p>
                  </div>
                  <StatusBadge status={detailBan.status} />
                </div>

                <div className="rounded-lg border p-4 space-y-1 bg-muted/30">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Reason</p>
                  <p className="text-sm leading-relaxed">{detailBan.reason}</p>
                  <p className="text-xs text-muted-foreground mt-2">Banned on {fmt(detailBan.created_at)}</p>
                </div>

                {detailBan.status === "appealing" && detailBan.appeal_message && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-2">
                    <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide flex items-center gap-1">
                      <AlertTriangle size={12} /> Golfer's Appeal — {fmt(detailBan.appealed_at)}
                    </p>
                    <p className="text-sm leading-relaxed">{detailBan.appeal_message}</p>
                  </div>
                )}

                {detailBan.appeal_response && (
                  <div className="rounded-lg border p-4 space-y-1 bg-muted/30">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Your Response</p>
                    <p className="text-sm leading-relaxed">{detailBan.appeal_response}</p>
                  </div>
                )}

                {detailBan.status === "lifted" && (
                  <div className="rounded-lg border border-green-200 bg-green-50 p-4 space-y-1">
                    <p className="text-xs font-semibold text-green-700 uppercase tracking-wide flex items-center gap-1">
                      <CheckCircle2 size={12} /> Ban lifted on {fmt(detailBan.lifted_at)}
                    </p>
                    {detailBan.lift_note && <p className="text-sm">{detailBan.lift_note}</p>}
                  </div>
                )}

                {!readOnly && detailBan.status === "appealing" && (
                  <div className="space-y-3 border-t pt-4">
                    <p className="text-sm font-semibold">Respond to Appeal</p>
                    <Textarea
                      value={respondNote}
                      onChange={e => setRespondNote(e.target.value)}
                      placeholder="Optional note to golfer…"
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <Button
                        className="flex-1 bg-[#1a5c38] hover:bg-[#164d30]"
                        disabled={actioning}
                        onClick={() => handleRespond("lift")}
                      >
                        Accept Appeal
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1 border-red-300 text-red-700 hover:bg-red-50"
                        disabled={actioning}
                        onClick={() => handleRespond("maintain")}
                      >
                        Decline Appeal
                      </Button>
                    </div>
                  </div>
                )}

                {!readOnly && detailBan.status === "active" && (
                  <div className="space-y-3 border-t pt-4">
                    <div className="space-y-1.5">
                      <Label className="text-sm">Lift note <span className="text-muted-foreground font-normal">(optional)</span></Label>
                      <Input
                        value={liftNote}
                        onChange={e => setLiftNote(e.target.value)}
                        placeholder="e.g. Issue resolved, access restored."
                      />
                    </div>
                    <Button
                      className="w-full bg-[#1a5c38] hover:bg-[#164d30]"
                      disabled={actioning}
                      onClick={handleLift}
                    >
                      Lift Ban
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
