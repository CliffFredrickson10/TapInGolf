import { Link, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import {
  ShoppingCart, LayoutGrid, Package, Truck, ClipboardList,
  BadgePercent, Users, Receipt, BarChart3, LogOut, Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export function PosLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { posOutlet, activeWaiter, logout } = useAuth();

  // Navigation is driven by whoever has UNLOCKED the terminal, not by the
  // signed-in manager session — until someone enters their PIN, no nav items
  // are shown, and waiters/cashiers only ever see the till/tables screen.
  const isManager = activeWaiter?.role === "manager";
  const isProShop = posOutlet?.type === "pro_shop";

  const navItems = activeWaiter
    ? [
        isProShop
          ? { href: "/", label: "Till", icon: ShoppingCart }
          : { href: "/", label: "Tables & Orders", icon: LayoutGrid },
        ...(isManager
          ? [
              { href: "/products", label: "Products", icon: Package },
              { href: "/suppliers", label: "Suppliers", icon: Truck },
              { href: "/stock-orders", label: "Stock Orders", icon: ClipboardList },
              { href: "/promotions", label: "Promotions", icon: BadgePercent },
              { href: "/staff", label: "Staff", icon: Users },
              { href: "/transactions", label: "Transactions", icon: Receipt },
              { href: "/reports", label: "Reports", icon: BarChart3 },
            ]
          : []),
      ]
    : [];

  const typeLabel = posOutlet?.type === "pro_shop" ? "Pro Shop" : posOutlet?.type === "bar" ? "Bar" : "Restaurant";

  return (
    <div className="flex h-screen overflow-hidden bg-muted/40">
      <aside className="w-60 bg-[#1a5c38] text-white flex flex-col flex-shrink-0 overflow-hidden">
        <div className="p-5 border-b border-white/10">
          <div className="text-xs font-semibold text-white/50 uppercase tracking-widest mb-1">{typeLabel} POS</div>
          <h1 className="text-lg font-bold leading-tight">{posOutlet?.name ?? "Outlet"}</h1>
          <p className="text-xs text-white/60 mt-0.5">{posOutlet?.club_name}</p>
        </div>
        <div className="px-5 py-3 border-b border-white/10">
          {activeWaiter ? (
            <>
              <p className="text-xs font-medium text-white truncate" data-testid="text-pos-active-staff">{activeWaiter.name}</p>
              <p className="text-[10px] text-white/50 capitalize">{activeWaiter.role}</p>
            </>
          ) : (
            <p className="text-xs font-medium text-white/60 flex items-center gap-1.5" data-testid="text-pos-locked">
              <Lock className="h-3 w-3" /> Terminal locked
            </p>
          )}
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href)) || (item.href === "/" && location.startsWith("/orders"));
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all cursor-pointer text-sm font-medium ${
                    isActive ? "bg-white/20 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
                  }`}
                  data-testid={`nav-pos-${item.label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="flex-1">{item.label}</span>
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
            data-testid="button-pos-logout"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 flex flex-col min-w-0 overflow-auto">{children}</main>
    </div>
  );
}
