import { useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, UserPlus, Mail, Download } from "lucide-react";
import { format, parseISO } from "date-fns";

interface GuestLead {
  id: number;
  player_name: string;
  player_email: string | null;
  club_name: string;
  province: string | null;
  booking_date: string;
  booking_time: string;
  booking_ref: string;
  created_at: string;
}

function exportCsv(leads: GuestLead[]) {
  const header = ["Name", "Email", "Club", "Province", "Date", "Time", "Booking Ref", "Recorded At"];
  const rows = leads.map(l => [
    l.player_name,
    l.player_email ?? "",
    l.club_name,
    l.province ?? "",
    l.booking_date,
    String(l.booking_time).slice(0, 5),
    l.booking_ref,
    format(parseISO(l.created_at), "yyyy-MM-dd HH:mm"),
  ]);
  const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "guest-leads.csv"; a.click();
  URL.revokeObjectURL(url);
}

export default function StaffGuestLeads() {
  const [leads, setLeads] = useState<GuestLead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const PAGE_SIZE = 50;

  const load = (query: string, pg: number) => {
    setLoading(true);
    api<{ leads: GuestLead[]; total: number }>(
      `/api/staff/guest-leads?q=${encodeURIComponent(query)}&page=${pg}&limit=${PAGE_SIZE}`
    )
      .then(d => { setLeads(d.leads); setTotal(d.total); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load("", 1); }, []);

  const handleSearch = (v: string) => {
    setQ(v); setPage(1);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => load(v, 1), 350);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UserPlus className="h-6 w-6 text-[#1a5c38]" />
            Guest Leads
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Non-TapIn players recorded via club counter bookings. Send them invites to join TapIn Golf.
          </p>
        </div>
        <Button variant="outline" className="gap-2 flex-shrink-0" onClick={() => exportCsv(leads)} disabled={leads.length === 0}>
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search name, email or club…"
            value={q}
            onChange={e => handleSearch(e.target.value)}
          />
        </div>
        <span className="text-sm text-muted-foreground flex-shrink-0">
          {total.toLocaleString()} guest{total !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="rounded-lg border overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="text-left font-medium text-muted-foreground px-4 py-3">Name</th>
              <th className="text-left font-medium text-muted-foreground px-4 py-3">Email</th>
              <th className="text-left font-medium text-muted-foreground px-4 py-3">Club</th>
              <th className="text-left font-medium text-muted-foreground px-4 py-3">Date &amp; Time</th>
              <th className="text-left font-medium text-muted-foreground px-4 py-3">Booking</th>
              <th className="text-left font-medium text-muted-foreground px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 8 }, (_, i) => (
                <tr key={i} className="border-b">
                  {Array.from({ length: 6 }, (_, j) => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))
            ) : leads.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                  {q ? "No guest leads match your search." : "No guest leads recorded yet. They appear here once clubs add counter bookings for non-member players."}
                </td>
              </tr>
            ) : (
              leads.map(l => (
                <tr key={l.id} className="border-b hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-medium">{l.player_name}</td>
                  <td className="px-4 py-3">
                    {l.player_email
                      ? <span className="text-[#1a5c38]">{l.player_email}</span>
                      : <span className="text-muted-foreground/60 italic text-xs">Not captured</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span>{l.club_name}</span>
                    {l.province && <span className="text-xs text-muted-foreground ml-1.5">· {l.province}</span>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {l.booking_date} · {String(l.booking_time).slice(0, 5)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="font-mono text-xs">{l.booking_ref}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    {l.player_email ? (
                      <a
                        href={`mailto:${l.player_email}?subject=Join TapIn Golf&body=Hi ${encodeURIComponent(l.player_name)},%0A%0AWe noticed you played at ${encodeURIComponent(l.club_name)} recently. Join TapIn Golf to book tee times, track your game, and split bills with friends!%0A%0ADownload the app: https://tapingolf.co.za`}
                        className="inline-flex items-center gap-1.5 text-xs text-[#1a5c38] hover:underline font-medium"
                      >
                        <Mail className="h-3.5 w-3.5" />
                        Send Invite
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground/50">No email</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => { const p = page - 1; setPage(p); load(q, p); }}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => { const p = page + 1; setPage(p); load(q, p); }}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
