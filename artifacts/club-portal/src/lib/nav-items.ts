import {
  LayoutDashboard, Building2, CalendarDays, Star, Megaphone,
  Calendar, Users, Ticket, Bell, CircleDollarSign, CreditCard,
  FileX2, Receipt, ShieldOff, BookOpen, ShieldCheck, Plus,
  UserPlus, Trophy, Download, Clock, RefreshCw,
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
  { href: "/knockout",           label: "Knockout",           icon: Trophy,          section: "events" },
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

export interface ShortcutItem {
  id: string;
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
  section: string;
  adminOnly?: boolean;
  category: string;
}

export const SHORTCUT_ITEMS: ShortcutItem[] = [
  { id: "booking-walkin",   label: "Add Walk-in Booking",  description: "Create a counter booking for a walk-in guest",  href: "/bookings?action=new",     icon: UserPlus,        section: "schedule",             category: "Bookings" },
  { id: "booking-pending",  label: "Pending Bookings",     description: "View bookings awaiting confirmation",           href: "/bookings?status=pending", icon: Clock,           section: "schedule",             category: "Bookings" },
  { id: "booking-export",   label: "Export Bookings",      description: "Download bookings as Excel spreadsheet",        href: "/bookings?action=export",  icon: Download,        section: "schedule",             category: "Bookings" },
  { id: "booking-all",      label: "All Bookings",         description: "View and filter all bookings",                  href: "/bookings",                icon: BookOpen,        section: "schedule",             category: "Bookings" },

  { id: "tee-add",          label: "Add Tee Time",         description: "Add a new tee time slot",                       href: "/tee-times?action=new",    icon: Plus,            section: "schedule",             category: "Tee Schedule" },
  { id: "tee-schedule",     label: "Tee Schedule",         description: "View and manage the full tee sheet",            href: "/tee-times",               icon: CalendarDays,    section: "schedule",             category: "Tee Schedule" },

  { id: "event-new",        label: "New Tournament",       description: "Create a new tournament or open day",           href: "/events?action=new",       icon: Trophy,          section: "events",               category: "Tournaments" },
  { id: "event-list",       label: "All Tournaments",      description: "View upcoming and past tournaments",             href: "/events",                  icon: Calendar,        section: "events",               category: "Tournaments" },

  { id: "member-add",       label: "Add Member",           description: "Enrol a new club member",                       href: "/members?action=new",      icon: UserPlus,        section: "members",              category: "Members" },
  { id: "member-list",      label: "Member List",          description: "View and manage the full member directory",     href: "/members",                 icon: Users,           section: "members",              category: "Members" },
  { id: "member-renew",     label: "Renew Memberships",    description: "Bulk-renew expiring or lapsed memberships",     href: "/members",                 icon: RefreshCw,       section: "members",              category: "Members" },

  { id: "invoices",         label: "View Invoices",        description: "Check outstanding and paid platform invoices",  href: "/invoices",                icon: Receipt,         section: "members",              category: "Finance" },
  { id: "payments",         label: "Payments",             description: "View payment history and wallet balances",      href: "/payments",                icon: CreditCard,      section: "payments",             category: "Finance" },
  { id: "pricing",          label: "Pricing Tiers",        description: "Set green fees by membership tier",             href: "/pricing",                 icon: CircleDollarSign,section: "pricing",              category: "Finance" },
  { id: "voucher-new",      label: "New Voucher",          description: "Create a discount or credit voucher",           href: "/vouchers?action=new",     icon: Ticket,          section: "vouchers",             category: "Finance" },

  { id: "ads",              label: "Advertisements",       description: "Manage sponsored club ads",                     href: "/ads",                     icon: Megaphone,       section: "ads",                  category: "Marketing" },
  { id: "reviews",          label: "Check Reviews",        description: "Read golfer ratings and feedback",               href: "/reviews",                 icon: Star,            section: "reviews",              category: "Marketing" },

  { id: "notifications",    label: "Check Inbox",          description: "Read internal club notifications",              href: "/notifications",           icon: Bell,            section: "notifications",        category: "Operations" },
  { id: "bans",             label: "Banned Golfers",       description: "View and manage the banned golfer list",        href: "/bans",                    icon: ShieldOff,       section: "bans",                 category: "Operations" },
  { id: "cancellation",     label: "Cancellation Policy",  description: "Edit the club cancellation policy",             href: "/cancellation-policy",     icon: FileX2,          section: "cancellation_policy",  category: "Operations" },

  { id: "profile",          label: "Edit Club Profile",    description: "Update club info, photos and facilities",       href: "/profile",                 icon: Building2,       section: "profile",              category: "Settings" },
  { id: "portal-users",     label: "Portal Users",         description: "Manage staff portal access",                    href: "/portal-users",            icon: ShieldCheck,     section: "admin", adminOnly: true, category: "Settings" },
];
