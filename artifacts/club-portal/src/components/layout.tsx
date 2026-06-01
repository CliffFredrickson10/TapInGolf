import { Link, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  LayoutDashboard,
  Building2,
  CalendarDays,
  Star,
  Megaphone,
  Calendar,
  Users,
  Ticket,
  Bell,
  LogOut,
  Images,
  CircleDollarSign,
  CreditCard,
  FileX2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/profile", label: "Club Profile", icon: Building2 },
  { href: "/tee-times", label: "Tee Schedule", icon: CalendarDays },
  { href: "/payments", label: "Payments", icon: CreditCard },
  { href: "/reviews", label: "Reviews", icon: Star },
  { href: "/ads", label: "Advertisements", icon: Megaphone },
  { href: "/events", label: "Events", icon: Calendar },
  { href: "/members", label: "Members", icon: Users },
  { href: "/pricing", label: "Pricing Tiers", icon: CircleDollarSign },
  { href: "/vouchers", label: "Vouchers", icon: Ticket },
  { href: "/cancellation-policy", label: "Cancellation Policy", icon: FileX2 },
  { href: "/notifications", label: "Notifications", icon: Bell, inbox: true },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { club, logout } = useAuth();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!club) return;
    const fetch = () =>
      api<{ count: number }>("/api/portal/inbox/unread-count")
        .then(r => setUnread(r.count))
        .catch(() => {});
    fetch();
    const timer = setInterval(fetch, 30_000);
    return () => clearInterval(timer);
  }, [club]);

  return (
    <div className="flex h-screen overflow-hidden bg-muted/40">
      <aside className="w-64 bg-[#1a5c38] text-white flex flex-col flex-shrink-0 overflow-hidden">
        <div className="p-6 border-b border-white/10">
          <div className="text-xs font-semibold text-white/50 uppercase tracking-widest mb-1">Club Portal</div>
          <h1 className="text-lg font-bold leading-tight">{club?.name ?? "TapIn Golf"}</h1>
          {club && <p className="text-xs text-white/60 mt-0.5">{club.location}, {club.province}</p>}
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href}>
                <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all cursor-pointer text-sm font-medium ${
                  isActive
                    ? "bg-white/20 text-white"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}>
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  {item.inbox && unread > 0 && (
                    <span className="bg-red-500 text-white text-[10px] font-bold leading-none px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                      {unread > 99 ? "99+" : unread}
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
        {children}
      </main>
    </div>
  );
}
