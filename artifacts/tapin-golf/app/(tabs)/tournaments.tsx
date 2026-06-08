import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  Image,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { AppHeader } from "@/components/AppHeader";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/lib/api";

// ─── Types ─────────────────────────────────────────────────────────────────────

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

// ─── Helpers ───────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  competition: "Competition",
  open_day: "Open Day",
  corporate: "Corporate",
  social: "Social",
  other: "Other",
};

const RESTRICT_LABEL: Record<string, string> = {
  members_only:    "Members",
  invitation_only: "Invite Only",
  whs_players_only: "WHS",
};

const RESTRICT_COLOR: Record<string, { bg: string; text: string }> = {
  members_only:    { bg: "#1a5c3818", text: "#1a5c38" },
  invitation_only: { bg: "#1e40af18", text: "#1e40af" },
  whs_players_only: { bg: "#6d28d918", text: "#6d28d9" },
};

function fmtDate(start: string, end: string | null): string {
  const s = String(start).slice(0, 10);
  const e = end ? String(end).slice(0, 10) : null;
  const fmt = (d: string) => {
    try {
      return new Date(d + "T00:00:00").toLocaleDateString("en-ZA", {
        day: "numeric", month: "short", year: "numeric",
      });
    } catch { return d; }
  };
  const fmtShort = (d: string) => {
    try {
      return new Date(d + "T00:00:00").toLocaleDateString("en-ZA", {
        day: "numeric", month: "short",
      });
    } catch { return d; }
  };
  if (!e || e === s) return fmt(s);
  const sy = s.slice(0, 4), ey = e.slice(0, 4);
  if (sy === ey) return `${fmtShort(s)} – ${fmt(e)}`;
  return `${fmt(s)} – ${fmt(e)}`;
}

// ─── Event Card ────────────────────────────────────────────────────────────────

function EventCard({ ev, colors }: { ev: TournamentEvent; colors: ReturnType<typeof useColors> }) {
  const restrict = RESTRICT_LABEL[ev.restriction];
  const restrictColors = RESTRICT_COLOR[ev.restriction];
  const isRegistered = !!ev.user_registration;
  const regStatus = ev.user_registration?.status;

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      activeOpacity={0.82}
      onPress={() => {
        Haptics.selectionAsync();
        router.push({ pathname: "/event/[id]", params: { id: ev.id } });
      }}
    >
      {/* Club logo */}
      <View style={[styles.logoWrap, { backgroundColor: colors.primary + "18" }]}>
        {ev.club_logo_url ? (
          <Image source={{ uri: ev.club_logo_url }} style={styles.logo} resizeMode="contain" />
        ) : (
          <Text style={[styles.logoInitial, { color: colors.primary }]}>
            {ev.club_name.charAt(0).toUpperCase()}
          </Text>
        )}
      </View>

      {/* Content */}
      <View style={styles.cardContent}>
        <Text style={[styles.eventName, { color: colors.foreground }]} numberOfLines={2}>
          {ev.name}
        </Text>
        <Text style={[styles.eventMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
          {ev.club_name} · {fmtDate(ev.event_date, ev.end_date)}
        </Text>

        {/* Badges row */}
        <View style={styles.badgeRow}>
          <View style={[styles.badge, { backgroundColor: colors.primary + "12" }]}>
            <Text style={[styles.badgeText, { color: colors.primary }]}>
              {TYPE_LABELS[ev.event_type] ?? ev.event_type}
            </Text>
          </View>

          {restrict && restrictColors && (
            <View style={[styles.badge, { backgroundColor: restrictColors.bg }]}>
              <Text style={[styles.badgeText, { color: restrictColors.text }]}>{restrict}</Text>
            </View>
          )}

          {ev.payment_required ? (
            <View style={[styles.badge, { backgroundColor: "#c8a84b18" }]}>
              <Text style={[styles.badgeText, { color: "#b8971f" }]}>
                {ev.entry_fee != null ? `R${ev.entry_fee.toFixed(0)}` : "Fee Applies"}
              </Text>
            </View>
          ) : (
            <View style={[styles.badge, { backgroundColor: "#16a34a18" }]}>
              <Text style={[styles.badgeText, { color: "#16a34a" }]}>Free</Text>
            </View>
          )}
        </View>
      </View>

      {/* Right side */}
      <View style={styles.cardRight}>
        {isRegistered ? (
          <View style={[
            styles.regBadge,
            { backgroundColor: regStatus === "approved" ? "#16a34a" : "#d97706" },
          ]}>
            <Ionicons
              name={regStatus === "approved" ? "checkmark" : "time"}
              size={10}
              color="#fff"
            />
            <Text style={styles.regBadgeText}>
              {regStatus === "approved" ? "In" : "Pending"}
            </Text>
          </View>
        ) : (
          <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─── Skeleton ──────────────────────────────────────────────────────────────────

function CardSkeleton({ colors }: { colors: ReturnType<typeof useColors> }) {
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

// ─── Main Screen ───────────────────────────────────────────────────────────────

export default function TournamentsScreen() {
  const colors = useColors();
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
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const hasHomeClub = homeClubEvents.length > 0;
  const hasOpen     = openEvents.length > 0;
  const isEmpty     = !loading && !hasHomeClub && !hasOpen;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader />

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* Page title */}
        <View style={styles.pageHeader}>
          <Text style={[styles.pageTitle, { color: colors.foreground }]}>Tournaments</Text>
          <Text style={[styles.pageSubtitle, { color: colors.mutedForeground }]}>
            Upcoming events you can enter
          </Text>
        </View>

        {/* Loading skeletons */}
        {loading && (
          <View style={styles.section}>
            <View style={[styles.skeletonLabel, { backgroundColor: colors.border }]} />
            {[1, 2, 3].map(i => <CardSkeleton key={i} colors={colors} />)}
          </View>
        )}

        {/* Not logged in banner */}
        {!loading && !user && (
          <TouchableOpacity
            style={[styles.loginBanner, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "30" }]}
            activeOpacity={0.85}
            onPress={() => router.push("/(auth)/login")}
          >
            <Ionicons name="person-circle-outline" size={28} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.loginBannerTitle, { color: colors.foreground }]}>
                See your club's tournaments
              </Text>
              <Text style={[styles.loginBannerSub, { color: colors.mutedForeground }]}>
                Log in to view members-only and invited events
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.primary} />
          </TouchableOpacity>
        )}

        {/* My Club section */}
        {!loading && hasHomeClub && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIcon, { backgroundColor: colors.primary }]}>
                <Ionicons name="flag" size={14} color="#fff" />
              </View>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>My Club</Text>
              <Text style={[styles.sectionCount, { color: colors.mutedForeground }]}>
                {homeClubEvents.length}
              </Text>
            </View>
            {homeClubEvents.map(ev => (
              <EventCard key={ev.id} ev={ev} colors={colors} />
            ))}
          </View>
        )}

        {/* My Club empty state */}
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
              <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                Your club hasn't published any upcoming tournaments yet.
              </Text>
            </View>
          </View>
        )}

        {/* Open Events section */}
        {!loading && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIcon, { backgroundColor: "#c8a84b" }]}>
                <Ionicons name="trophy" size={14} color="#fff" />
              </View>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Open Events</Text>
              {hasOpen && (
                <Text style={[styles.sectionCount, { color: colors.mutedForeground }]}>
                  {openEvents.length}
                </Text>
              )}
            </View>
            {hasOpen ? (
              openEvents.map(ev => (
                <EventCard key={ev.id} ev={ev} colors={colors} />
              ))
            ) : (
              <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="trophy-outline" size={32} color={colors.mutedForeground + "80"} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No open events</Text>
                <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                  No open tournaments are scheduled right now. Check back soon.
                </Text>
              </View>
            )}
          </View>
        )}

        <View style={{ height: Platform.OS === "web" ? 140 : 74 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  pageHeader: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 },
  pageTitle: { fontSize: 26, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  pageSubtitle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 3 },

  loginBanner: {
    marginHorizontal: 20, marginBottom: 20,
    borderRadius: 14, borderWidth: 1,
    paddingHorizontal: 16, paddingVertical: 14,
    flexDirection: "row", alignItems: "center", gap: 12,
  },
  loginBannerTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  loginBannerSub:   { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },

  section: { marginBottom: 24, paddingHorizontal: 20 },
  sectionHeader: {
    flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12,
  },
  sectionIcon: {
    width: 24, height: 24, borderRadius: 8,
    alignItems: "center", justifyContent: "center",
  },
  sectionTitle: { fontSize: 18, fontFamily: "Inter_700Bold", flex: 1 },
  sectionCount: { fontSize: 13, fontFamily: "Inter_500Medium" },

  skeletonLabel: {
    width: 120, height: 18, borderRadius: 6, marginBottom: 12,
  },

  card: {
    borderRadius: 14, borderWidth: 1.5,
    paddingHorizontal: 14, paddingVertical: 12,
    flexDirection: "row", alignItems: "center", gap: 12,
    marginBottom: 10,
  },
  logoWrap: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  logo: { width: 36, height: 36, borderRadius: 18 },
  logoInitial: { fontSize: 18, fontFamily: "Inter_700Bold" },

  cardContent: { flex: 1, gap: 3 },
  eventName: { fontSize: 14, fontFamily: "Inter_700Bold", lineHeight: 19 },
  eventMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },

  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 2 },
  badge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  cardRight: { alignItems: "center", justifyContent: "center", flexShrink: 0 },
  regBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3,
  },
  regBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#fff" },

  emptyCard: {
    borderRadius: 14, borderWidth: 1.5,
    paddingVertical: 32, paddingHorizontal: 20,
    alignItems: "center", gap: 8,
  },
  emptyTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 18 },
});
