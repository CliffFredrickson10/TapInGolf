import { Link, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { useHnaPending } from "@/context/HnaPendingContext";
import {
  BarChart3,
  Megaphone,
  Radio,
  CalendarRange,
  IdCard,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const navItems = [
  { href: "/", label: "Revenue", icon: BarChart3 },
  { href: "/broadcast", label: "Broadcast", icon: Megaphone },
  { href: "/geofence", label: "Geofence", icon: Radio },
  { href: "/events-members", label: "Events & Members", icon: CalendarRange },
  { href: "/hna-review", label: "HNA Verifications", icon: IdCard, badge: "hnaPending" as const },
];

// Pages that operate on a single selected club need the club selector shown.
const CLUB_SCOPED = ["/broadcast", "/events-members"];

export function StaffLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { staff, logout, clubs, selectedClubId, setSelectedClubId } = useAuth();
  const { pending } = useHnaPending();

  const showClubSelector = CLUB_SCOPED.includes(location);

  return (
    <div className="flex h-screen overflow-hidden bg-muted/40">
      <aside className="w-64 bg-[#1a5c38] text-white flex flex-col flex-shrink-0 overflow-hidden">
        <div className="p-6 border-b border-white/10">
          <div className="text-xs font-semibold text-white/50 uppercase tracking-widest mb-1">TapIn Staff</div>
          <h1 className="text-lg font-bold leading-tight">{staff?.name ?? "Super Admin"}</h1>
          <p className="text-xs text-white/60 mt-0.5">{staff?.email}</p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            const showBadge = item.badge === "hnaPending" && pending > 0;
            return (
              <Link key={item.href} href={item.href}>
                <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all cursor-pointer text-sm font-medium ${
                  isActive
                    ? "bg-white/20 text-white"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}>
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  {showBadge && (
                    <span
                      className="ml-auto inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-[#c8a84b] text-[#1a5c38] text-xs font-bold"
                      data-testid="badge-hna-pending"
                      aria-label={`${pending} pending verifications`}
                    >
                      {pending > 99 ? "99+" : pending}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-white/10">
          <Button
            variant="ghost"
            className="w-full justify-start text-white/70 hover:text-white hover:bg-white/10 gap-3 font-medium text-sm"
            onClick={logout}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 flex flex-col min-w-0 overflow-auto">
        {showClubSelector && (
          <div className="flex items-center gap-3 px-8 py-3 border-b bg-background sticky top-0 z-10">
            <span className="text-sm font-medium text-muted-foreground">Club:</span>
            <Select
              value={selectedClubId != null ? String(selectedClubId) : undefined}
              onValueChange={(v) => setSelectedClubId(parseInt(v, 10))}
            >
              <SelectTrigger className="w-72 h-9">
                <SelectValue placeholder="Select a club…" />
              </SelectTrigger>
              <SelectContent>
                {clubs.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}{c.province ? ` · ${c.province}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
