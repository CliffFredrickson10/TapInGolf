import {
  LayoutDashboard, Building2, CalendarDays, Star, Megaphone,
  Calendar, Users, Ticket, Bell, CircleDollarSign, CreditCard,
  FileX2, Receipt, ShieldOff, BookOpen, ShieldCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  section: string;
  adminOnly?: boolean;
}

export const ALL_NAV_ITEMS: NavItem[] = [
  { href: "/",                   label: "Dashboard",          icon: LayoutDashboard, section: "dashboard" },
  { href: "/profile",            label: "Club Profile",       icon: Building2,       section: "profile" },
  { href: "/tee-times",          label: "Tee Schedule",       icon: CalendarDays,    section: "schedule" },
  { href: "/bookings",           label: "Bookings",           icon: BookOpen,        section: "schedule" },
  { href: "/payments",           label: "Payments",           icon: CreditCard,      section: "payments" },
  { href: "/events",             label: "Tournaments",        icon: Calendar,        section: "events" },
  { href: "/members",            label: "Members",            icon: Users,           section: "members" },
  { href: "/invoices",           label: "Invoices",           icon: Receipt,         section: "members" },
  { href: "/reviews",            label: "Reviews",            icon: Star,            section: "reviews" },
  { href: "/ads",                label: "Advertisements",     icon: Megaphone,       section: "ads" },
  { href: "/pricing",            label: "Pricing Tiers",      icon: CircleDollarSign,section: "pricing" },
  { href: "/vouchers",           label: "Vouchers",           icon: Ticket,          section: "vouchers" },
  { href: "/bans",               label: "Banned Golfers",     icon: ShieldOff,       section: "bans" },
  { href: "/cancellation-policy",label: "Cancellation Policy",icon: FileX2,          section: "cancellation_policy" },
  { href: "/notifications",      label: "Notifications",      icon: Bell,            section: "notifications" },
  { href: "/portal-users",       label: "Portal Users",       icon: ShieldCheck,     section: "admin", adminOnly: true },
];
