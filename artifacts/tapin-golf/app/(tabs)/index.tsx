import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
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
import AdBanner, { Ad } from "@/components/AdBanner";
import ClubCard, { Club } from "@/components/ClubCard";
import FeaturedCarousel, { FeaturedClub } from "@/components/FeaturedCarousel";
import { AppHeader } from "@/components/AppHeader";
import { ClubCardSkeleton } from "@/components/SkeletonLoader";
import StandingHoldsCard from "@/components/StandingHoldsCard";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/lib/api";
import * as Location from "expo-location";

type UpcomingBooking = {
  id: number;
  club_name: string;
  date: string;
  time: string;
  players: number;
  booking_ref: string;
  status: string;
};


export default function HomeScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const [featuredClubs, setFeaturedClubs] = useState<FeaturedClub[]>([]);
  const [nearbyClubs, setNearbyClubs] = useState<Club[]>([]);
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [upcomingBooking, setUpcomingBooking] = useState<UpcomingBooking | null>(null);
  const [openGamesCount, setOpenGamesCount] = useState<number | null>(null);
  const [adIndex, setAdIndex] = useState(0);
  const adTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = async () => {
    try {
      // Silently use location if already granted — no prompt
      let locationQs = "";
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === "granted") {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          locationQs = `&lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`;
        }
      } catch {}

      const requests: Promise<any>[] = [
        apiFetch(`/clubs?featured=1&limit=20${locationQs}`, user?.token),
        apiFetch("/ads?placement=home", user?.token),
      ];
      if (user) {
        requests.push(apiFetch("/bookings?status=upcoming", user.token));
      }
      const [clubsData, adsData, bookingsData] = await Promise.all(requests);

      const sortByDistance = (arr: any[]) =>
        [...arr].sort((a, b) => (a.distance_km ?? 99999) - (b.distance_km ?? 99999));
      const sortByName = (arr: any[]) => [...arr].sort((a, b) => a.name.localeCompare(b.name));
      const hasDist = (arr: any[]) => arr.some((c) => c.distance_km != null);

      const featured = clubsData.clubs ?? [];
      setFeaturedClubs(hasDist(featured) ? sortByDistance(featured) : sortByName(featured));
      setNearbyClubs(sortByName(clubsData.nearby ?? []));
      setAds(adsData.ads ?? []);
      const allBookings = [
        ...(bookingsData?.bookings ?? []),
        ...(bookingsData?.invited_bookings ?? []),
      ];
      if (allBookings.length > 0) {
        // Pick the soonest upcoming booking across own + invited
        const sorted = allBookings.sort((a: any, b: any) =>
          a.date < b.date ? -1 : a.date > b.date ? 1 : a.time < b.time ? -1 : 1
        );
        setUpcomingBooking(sorted[0]);
      } else {
        setUpcomingBooking(null);
      }
      // Fetch open games count (best-effort, non-blocking)
      apiFetch("/bookings/open", user?.token)
        .then((d: any) => setOpenGamesCount((d.games ?? []).length))
        .catch(() => {});
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  // Rotate through ads using each ad's slot_duration (falls back to 8 s)
  useEffect(() => {
    if (ads.length < 2) return;
    const scheduleNext = (idx: number) => {
      const ad = ads[idx] as any;
      const match = String(ad?.slot_duration ?? "").match(/^(\d+)/);
      const ms = match ? parseInt(match[1]) * 1000 : 8000;
      adTimerRef.current = setTimeout(() => {
        const next = (idx + 1) % ads.length;
        setAdIndex(next);
        scheduleNext(next);
      }, ms);
    };
    scheduleNext(adIndex);
    return () => { if (adTimerRef.current) clearTimeout(adTimerRef.current); };
  }, [ads]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  };

  const formatDate = (d: string) => {
    // Normalise — MySQL may return a full ISO datetime; take the date part only
    const dateStr = String(d).slice(0, 10);
    const date = new Date(dateStr + "T00:00:00");
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    if (dateStr === today.toISOString().split("T")[0]) return "Today";
    if (dateStr === tomorrow.toISOString().split("T")[0]) return "Tomorrow";
    return date.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader />

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Greeting block */}
        <View style={styles.greetingBlock}>
          <Text style={[styles.greeting, { color: colors.mutedForeground }]}>
            {greeting()}{user ? `, ${user.name.split(" ")[0]}` : ""}
          </Text>
          <Text style={[styles.headline, { color: colors.foreground }]}>Find Your Round</Text>
        </View>

      {/* Upcoming round card */}
      {upcomingBooking && (
        <TouchableOpacity
          style={[styles.upcomingCard, { backgroundColor: colors.primary }]}
          onPress={() => {
            Haptics.selectionAsync();
            router.push({ pathname: "/booking/[id]", params: { id: upcomingBooking.id } });
          }}
          activeOpacity={0.88}
        >
          <View style={styles.upcomingLeft}>
            <View style={styles.upcomingIconWrap}>
              <Ionicons name="golf" size={22} color={colors.primary} />
            </View>
            <View>
              <Text style={styles.upcomingLabel}>Your Next Round</Text>
              <Text style={styles.upcomingClub} numberOfLines={1}>{upcomingBooking.club_name}</Text>
              <Text style={styles.upcomingMeta}>
                {formatDate(upcomingBooking.date)} • {upcomingBooking.time.slice(0, 5)} • {upcomingBooking.players} player{upcomingBooking.players > 1 ? "s" : ""}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
      )}

      {/* Standing tee time holds awaiting confirmation */}
      <StandingHoldsCard />

      {/* Book Now Hero */}
      <TouchableOpacity
        style={[styles.heroWrap, { marginTop: 16 }]}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push("/(tabs)/explore"); }}
        activeOpacity={0.88}
      >
        <LinearGradient
          colors={["#0f3d24", "#1a5c38", "#227048"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroGradient}
        >
          <View style={styles.heroCircle1} />
          <View style={styles.heroCircle2} />

          <View style={styles.heroContent}>
            <Text style={styles.heroSub}>Find and book tee times instantly</Text>
            <View style={styles.heroBtn}>
              <Text style={styles.heroBtnText}>Book Your Round</Text>
              <Ionicons name="arrow-forward" size={14} color="#1a5c38" />
            </View>
          </View>
        </LinearGradient>
      </TouchableOpacity>

      {/* Join a Game */}
      <TouchableOpacity
        style={[styles.joinCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={() => { Haptics.selectionAsync(); router.push("/join"); }}
        activeOpacity={0.88}
      >
        <View style={[styles.joinIconWrap, { backgroundColor: colors.primary + "18" }]}>
          <Ionicons name="people" size={26} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.joinTitle, { color: colors.foreground }]}>Join a Game</Text>
          <Text style={[styles.joinSub, { color: colors.mutedForeground }]}>
            {openGamesCount !== null && openGamesCount > 0
              ? `${openGamesCount} open game${openGamesCount !== 1 ? "s" : ""} — spots still available`
              : "Find rounds that need more players"}
          </Text>
        </View>
        <View style={[styles.joinArrow, { backgroundColor: colors.primary }]}>
          <Ionicons name="arrow-forward" size={16} color="#fff" />
        </View>
      </TouchableOpacity>

      {/* Featured Clubs */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Featured Clubs</Text>
          <TouchableOpacity onPress={() => router.push({ pathname: "/(tabs)/explore", params: { featured: "1" } })}>
            <Text style={[styles.seeAll, { color: colors.primary }]}>See all</Text>
          </TouchableOpacity>
        </View>
        {loading ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingLeft: 20 }}>
            {[1, 2, 3].map((i) => <ClubCardSkeleton key={i} />)}
          </ScrollView>
        ) : featuredClubs.length > 0 ? (
          <FeaturedCarousel clubs={featuredClubs} />
        ) : (
          <View style={styles.empty}>
            <Ionicons name="golf-outline" size={36} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No clubs available</Text>
          </View>
        )}
      </View>

      {/* Ad — rotates through all returned ads */}
      {ads.length > 0 && (
        <View style={[styles.section, { paddingHorizontal: 20 }]}>
          <AdBanner key={adIndex} ad={ads[adIndex % ads.length]} />
        </View>
      )}


      <View style={{ height: Platform.OS === "web" ? 140 : 74 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  greetingBlock: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 },
  greeting: { fontSize: 14, fontFamily: "Inter_400Regular" },
  headline: { fontSize: 26, fontFamily: "Inter_700Bold", letterSpacing: -0.5, marginTop: 2 },
  upcomingCard: {
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  upcomingLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 14 },
  upcomingIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  upcomingLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.75)", textTransform: "uppercase", letterSpacing: 0.5 },
  upcomingClub: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff", marginVertical: 1 },
  upcomingMeta: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.8)" },
  heroWrap: { marginHorizontal: 20, marginBottom: 16, borderRadius: 16, overflow: "hidden", elevation: 4, shadowColor: "#0f3d24", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8 },
  heroGradient: { paddingHorizontal: 16, paddingVertical: 14, overflow: "hidden" },
  heroCircle1: { position: "absolute", width: 160, height: 160, borderRadius: 80, backgroundColor: "rgba(255,255,255,0.05)", top: -50, right: -30 },
  heroCircle2: { position: "absolute", width: 80, height: 80, borderRadius: 40, backgroundColor: "rgba(200,168,75,0.12)", bottom: -20, right: 80 },
  heroContent: { alignItems: "center", gap: 6 },
  heroIconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#c8a84b", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  heroSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.75)", marginBottom: 6 },
  heroBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#c8a84b", alignSelf: "center", paddingHorizontal: 14, paddingVertical: 7, borderRadius: 50 },
  heroBtnText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#1a5c38" },
  section: { marginBottom: 28 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  sectionTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  seeAll: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  empty: { alignItems: "center", paddingVertical: 32, gap: 8 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  joinCard: {
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 16,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  joinIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  joinTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  joinSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  joinArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
});
