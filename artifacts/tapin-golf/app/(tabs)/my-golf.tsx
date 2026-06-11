import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  Image,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import GolfBallLoader from "@/components/GolfBallLoader";
import BookingCard, { Booking } from "@/components/BookingCard";
import { AppHeader } from "@/components/AppHeader";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/lib/api";

// ─── Tournament types ─────────────────────────────────────────────────────────

interface TournamentEvent {
  id: number;
  name: string;
  event_date: string;
  end_date: string | null;
  event_type: string;
  format: string;
  format_custom: string | null;
  restriction: string;
  entry_fee: number | null;
  payment_required: number;
  image_url: string | null;
  approved_count: number;
  max_participants: number | null;
  club_id: number;
  club_name: string;
  club_logo_url: string | null;
  user_registration: { id: number; status: string } | null;
}

const TYPE_LABELS: Record<string, string> = {
  competition: "Competition",
  open_day: "Open Day",
  corporate: "Corporate",
  social: "Social",
  other: "Other",
};

const RESTRICT_LABEL: Record<string, string> = {
  members_only:     "Members",
  invitation_only:  "Invite Only",
  whs_players_only: "WHS",
};

const RESTRICT_COLOR: Record<string, { bg: string; text: string }> = {
  members_only:     { bg: "#1a5c3818", text: "#1a5c38" },
  invitation_only:  { bg: "#1e40af18", text: "#1e40af" },
  whs_players_only: { bg: "#6d28d918", text: "#6d28d9" },
};

function fmtDate(start: string, end: string | null): string {
  const s = String(start).slice(0, 10);
  const e = end ? String(end).slice(0, 10) : null;
  const fmt = (d: string) => {
    try { return new Date(d + "T00:00:00").toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }); }
    catch { return d; }
  };
  const fmtShort = (d: string) => {
    try { return new Date(d + "T00:00:00").toLocaleDateString("en-ZA", { day: "numeric", month: "short" }); }
    catch { return d; }
  };
  if (!e || e === s) return fmt(s);
  return s.slice(0, 4) === e.slice(0, 4) ? `${fmtShort(s)} – ${fmt(e)}` : `${fmt(s)} – ${fmt(e)}`;
}

// ─── Event Card ───────────────────────────────────────────────────────────────

function EventCard({ ev, colors }: { ev: TournamentEvent; colors: ReturnType<typeof useColors> }) {
  const restrict = RESTRICT_LABEL[ev.restriction];
  const restrictColors = RESTRICT_COLOR[ev.restriction];
  const isRegistered = !!ev.user_registration;
  const regStatus = ev.user_registration?.status;

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      activeOpacity={0.82}
      onPress={() => { Haptics.selectionAsync(); router.push({ pathname: "/event/[id]", params: { id: ev.id } }); }}
    >
      <View style={[styles.logoWrap, { backgroundColor: colors.primary + "18" }]}>
        {ev.club_logo_url ? (
          <Image source={{ uri: ev.club_logo_url }} style={styles.logo} resizeMode="contain" />
        ) : (
          <Text style={[styles.logoInitial, { color: colors.primary }]}>{ev.club_name.charAt(0).toUpperCase()}</Text>
        )}
      </View>
      <View style={styles.cardContent}>
        <Text style={[styles.eventName, { color: colors.foreground }]} numberOfLines={2}>{ev.name}</Text>
        <Text style={[styles.eventMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
          {ev.club_name} · {fmtDate(ev.event_date, ev.end_date)}
        </Text>
        <View style={styles.badgeRow}>
          <View style={[styles.badge, { backgroundColor: colors.primary + "12" }]}>
            <Text style={[styles.badgeText, { color: colors.primary }]}>{TYPE_LABELS[ev.event_type] ?? ev.event_type}</Text>
          </View>
          {restrict && restrictColors && (
            <View style={[styles.badge, { backgroundColor: restrictColors.bg }]}>
              <Text style={[styles.badgeText, { color: restrictColors.text }]}>{restrict}</Text>
            </View>
          )}
          {ev.payment_required ? (
            <View style={[styles.badge, { backgroundColor: "#c8a84b18" }]}>
              <Text style={[styles.badgeText, { color: "#b8971f" }]}>{ev.entry_fee != null ? `R${ev.entry_fee.toFixed(0)}` : "Fee Applies"}</Text>
            </View>
          ) : (
            <View style={[styles.badge, { backgroundColor: "#16a34a18" }]}>
              <Text style={[styles.badgeText, { color: "#16a34a" }]}>Free</Text>
            </View>
          )}
        </View>
      </View>
      <View style={styles.cardRight}>
        {isRegistered ? (
          <View style={[styles.regBadge, { backgroundColor: regStatus === "approved" ? "#16a34a" : "#d97706" }]}>
            <Ionicons name={regStatus === "approved" ? "checkmark" : "time"} size={10} color="#fff" />
            <Text style={styles.regBadgeText}>{regStatus === "approved" ? "In" : "Pending"}</Text>
          </View>
        ) : (
          <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
        )}
      </View>
    </TouchableOpacity>
  );
}

function EventSkeleton({ colors }: { colors: ReturnType<typeof useColors> }) {
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.logoWrap, { backgroundColor: colors.border }]} />
      <View style={styles.cardContent}>
        <View style={{ width: "70%", height: 15, borderRadius: 6, backgroundColor: colors.border, marginBottom: 6 }} />
        <View style={{ width: "50%", height: 12, borderRadius: 6, backgroundColor: colors.border, marginBottom: 8 }} />
        <View style={{ flexDirection: "row", gap: 6 }}>
          <View style={{ width: 80, height: 20, borderRadius: 10, backgroundColor: colors.border }} />
          <View style={{ width: 60, height: 20, borderRadius: 10, backgroundColor: colors.border }} />
        </View>
      </View>
    </View>
  );
}

// ─── Bookings panel ───────────────────────────────────────────────────────────

type BookingTab = "upcoming" | "past";

function BookingsPanel({ colors }: { colors: ReturnType<typeof useColors> }) {
  const { user } = useAuth();
  const [tab, setTab] = useState<BookingTab>("upcoming");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [invitedBookings, setInvitedBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    if (!user) { setLoading(false); return; }
    try {
      const data = await apiFetch(`/bookings?status=${tab}`, user.token);
      setBookings(data.bookings ?? []);
      setInvitedBookings(data.invited_bookings ?? []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { setLoading(true); load(); }, [tab, user]);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  if (!user) {
    return (
      <View style={styles.center}>
        <Ionicons name="calendar-outline" size={48} color={colors.mutedForeground} />
        <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Sign in to view bookings</Text>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: colors.primary }]}
          onPress={() => router.push("/(auth)/login")}
        >
          <Text style={styles.actionBtnText}>Sign In</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const pendingPaymentCount = invitedBookings.filter(b => !b.my_paid && b.status === "confirmed").length;
  const allEmpty = bookings.length === 0 && invitedBookings.length === 0;

  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.segRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {(["upcoming", "past"] as BookingTab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.segBtn, { backgroundColor: tab === t ? colors.primary : "transparent" }]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.segText, { color: tab === t ? "#fff" : colors.mutedForeground }]}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}><GolfBallLoader /></View>
      ) : allEmpty ? (
        <View style={styles.center}>
          <Ionicons name="calendar-outline" size={48} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No {tab} bookings</Text>
          {tab === "upcoming" && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.primary }]}
              onPress={() => router.push("/(tabs)/explore")}
            >
              <Text style={styles.actionBtnText}>Book a round</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={[
            ...(invitedBookings.length > 0 ? [{ _section: "invited" as const, items: invitedBookings }] : []),
            ...(bookings.length > 0      ? [{ _section: "mine"    as const, items: bookings         }] : []),
          ]}
          keyExtractor={(item) => item._section}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          contentContainerStyle={{ padding: 16, paddingBottom: Platform.OS === "web" ? 140 : 74 }}
          renderItem={({ item: section }) => (
            <>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
                  {section._section === "invited" ? "INVITED TO PLAY" : "MY BOOKINGS"}
                </Text>
                {section._section === "invited" && pendingPaymentCount > 0 && (
                  <View style={[styles.sectionBadge, { backgroundColor: colors.accent + "22" }]}>
                    <Text style={[styles.sectionBadgeText, { color: colors.accent }]}>{pendingPaymentCount} unpaid</Text>
                  </View>
                )}
              </View>
              {section.items.map((booking) => (
                <BookingCard
                  key={booking.id}
                  booking={booking}
                  onPress={() => router.push({ pathname: "/booking/[id]", params: { id: booking.id } })}
                  onPayNow={booking.role === "invited" && !booking.my_paid ? () => router.push({ pathname: "/booking/[id]", params: { id: booking.id } }) : undefined}
                />
              ))}
            </>
          )}
        />
      )}
    </View>
  );
}

// ─── Tournaments panel ────────────────────────────────────────────────────────

function TournamentsPanel({ colors }: { colors: ReturnType<typeof useColors> }) {
  const { user } = useAuth();
  const [homeClubEvents, setHomeClubEvents] = useState<TournamentEvent[]>([]);
  const [openEvents, setOpenEvents]         = useState<TournamentEvent[]>([]);
  const [loading, setLoading]               = useState(true);
  const [refreshing, setRefreshing]         = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch("/events/feed", user?.token);
      setHomeClubEvents(data.home_club ?? []);
      setOpenEvents(data.open ?? []);
    } catch {
      setHomeClubEvents([]);
      setOpenEvents([]);
    } finally { setLoading(false); }
  }, [user]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const hasHomeClub = homeClubEvents.length > 0;
  const hasOpen     = openEvents.length > 0;

  return (
    <ScrollView
      style={{ flex: 1 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {!loading && !user && (
        <TouchableOpacity
          style={[styles.loginBanner, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "30" }]}
          activeOpacity={0.85}
          onPress={() => router.push("/(auth)/login")}
        >
          <Ionicons name="person-circle-outline" size={28} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.loginBannerTitle, { color: colors.foreground }]}>See your club's tournaments</Text>
            <Text style={[styles.loginBannerSub, { color: colors.mutedForeground }]}>Log in to view members-only and invited events</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.primary} />
        </TouchableOpacity>
      )}

      {loading && (
        <View style={styles.section}>
          <View style={[{ width: 120, height: 18, borderRadius: 6, backgroundColor: colors.border, marginBottom: 12 }]} />
          {[1, 2, 3].map(i => <EventSkeleton key={i} colors={colors} />)}
        </View>
      )}

      {!loading && hasHomeClub && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIcon, { backgroundColor: colors.primary }]}>
              <Ionicons name="flag" size={14} color="#fff" />
            </View>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>My Club</Text>
            <Text style={[styles.sectionCount, { color: colors.mutedForeground }]}>{homeClubEvents.length}</Text>
          </View>
          {homeClubEvents.map(ev => <EventCard key={ev.id} ev={ev} colors={colors} />)}
        </View>
      )}

      {!loading && user && !hasHomeClub && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIcon, { backgroundColor: colors.primary }]}>
              <Ionicons name="flag" size={14} color="#fff" />
            </View>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>My Club</Text>
          </View>
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="flag-outline" size={32} color={colors.mutedForeground + "80"} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No upcoming events</Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>Your club hasn't published any upcoming tournaments yet.</Text>
          </View>
        </View>
      )}

      {!loading && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIcon, { backgroundColor: "#c8a84b" }]}>
              <Ionicons name="trophy" size={14} color="#fff" />
            </View>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Open Events</Text>
            {hasOpen && <Text style={[styles.sectionCount, { color: colors.mutedForeground }]}>{openEvents.length}</Text>}
          </View>
          {hasOpen ? (
            openEvents.map(ev => <EventCard key={ev.id} ev={ev} colors={colors} />)
          ) : (
            <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="trophy-outline" size={32} color={colors.mutedForeground + "80"} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No open events</Text>
              <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>No open tournaments are scheduled right now. Check back soon.</Text>
            </View>
          )}
        </View>
      )}

      <View style={{ height: Platform.OS === "web" ? 140 : 74 }} />
    </ScrollView>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

type MainTab = "bookings" | "tournaments";

export default function MyGolfScreen() {
  const colors = useColors();
  const [activeTab, setActiveTab] = useState<MainTab>("bookings");

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader />

      {/* Page header */}
      <View style={styles.pageHeader}>
        <Text style={[styles.pageTitle, { color: colors.foreground }]}>My Golf</Text>
      </View>

      {/* Top segment: Bookings | Tournaments */}
      <View style={[styles.mainSegRow, { borderBottomColor: colors.border }]}>
        {([
          { key: "bookings",    label: "Bookings",    icon: "calendar-outline"  },
          { key: "tournaments", label: "Tournaments", icon: "trophy-outline"    },
        ] as { key: MainTab; label: string; icon: any }[]).map(({ key, label, icon }) => (
          <TouchableOpacity
            key={key}
            style={[styles.mainSegBtn, activeTab === key && { borderBottomColor: colors.primary, borderBottomWidth: 2.5 }]}
            onPress={() => { Haptics.selectionAsync(); setActiveTab(key); }}
            activeOpacity={0.75}
          >
            <Ionicons
              name={activeTab === key ? icon.replace("-outline", "") : icon}
              size={16}
              color={activeTab === key ? colors.primary : colors.mutedForeground}
            />
            <Text style={[styles.mainSegText, { color: activeTab === key ? colors.primary : colors.mutedForeground }]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Panel content */}
      {activeTab === "bookings"
        ? <BookingsPanel colors={colors} />
        : <TournamentsPanel colors={colors} />
      }
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  pageHeader: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 4 },
  pageTitle:  { fontSize: 26, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },

  mainSegRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    marginBottom: 4,
  },
  mainSegBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 12,
    borderBottomWidth: 2.5, borderBottomColor: "transparent",
  },
  mainSegText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },

  segRow: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
    padding: 4,
  },
  segBtn:  { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: "center" },
  segText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },

  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  actionBtn: { borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, marginTop: 4 },
  actionBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 15 },

  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  sectionLabel:  { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.8 },
  sectionBadge:  { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  sectionBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  sectionIcon:   { width: 24, height: 24, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  sectionTitle:  { fontSize: 18, fontFamily: "Inter_700Bold", flex: 1 },
  sectionCount:  { fontSize: 13, fontFamily: "Inter_500Medium" },

  section: { marginBottom: 24, paddingHorizontal: 20, paddingTop: 8 },

  loginBanner: {
    marginHorizontal: 20, marginTop: 12, marginBottom: 4,
    borderRadius: 14, borderWidth: 1,
    paddingHorizontal: 16, paddingVertical: 14,
    flexDirection: "row", alignItems: "center", gap: 12,
  },
  loginBannerTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  loginBannerSub:   { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },

  card: {
    borderRadius: 14, borderWidth: 1.5,
    paddingHorizontal: 14, paddingVertical: 12,
    flexDirection: "row", alignItems: "center", gap: 12,
    marginBottom: 10,
  },
  logoWrap: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  logo: { width: 36, height: 36, borderRadius: 18 },
  logoInitial: { fontSize: 18, fontFamily: "Inter_700Bold" },
  cardContent: { flex: 1, gap: 3 },
  eventName: { fontSize: 14, fontFamily: "Inter_700Bold", lineHeight: 19 },
  eventMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 2 },
  badge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  cardRight: { alignItems: "center", justifyContent: "center", flexShrink: 0 },
  regBadge: { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3 },
  regBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#fff" },

  emptyCard: {
    borderRadius: 14, borderWidth: 1.5,
    paddingVertical: 32, paddingHorizontal: 20,
    alignItems: "center", gap: 8,
  },
  emptySub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 18 },
});
