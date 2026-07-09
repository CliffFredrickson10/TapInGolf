import { Link, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { Search, ShoppingBag, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/", label: "Find Tee Times", icon: Search },
  { href: "/purchases", label: "My Purchases", icon: ShoppingBag },
];

export function ResellerLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { reseller, logout } = useAuth();

  return (
    <div className="flex h-screen overflow-hidden bg-muted/40">
      <aside className="w-64 bg-[#1a5c38] text-white flex flex-col flex-shrink-0 overflow-hidden">
        <div className="p-6 border-b border-white/10">
          <div className="text-xs font-semibold text-white/50 uppercase tracking-widest mb-1">Reseller Portal</div>
          <h1 className="text-lg font-bold leading-tight">{reseller?.name ?? "Reseller"}</h1>
          <p className="text-xs text-white/60 mt-0.5">{reseller?.contact_email}</p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href)) || (item.href === "/" && location.startsWith("/clubs"));
            return (
              <Link key={item.href} href={item.href}>
                <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all cursor-pointer text-sm font-medium ${
                  isActive
                    ? "bg-white/20 text-white"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}>
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
            data-testid="button-reseller-logout"
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
