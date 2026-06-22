import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import GolfBallLoader from "@/components/GolfBallLoader";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────
type OpenGame = {
  tee_time_id: number;
  date: string;
  time: string;
  price: number;
  promotional_price: number | null;
  total_slots: number;
  available: number;
  booked_count: number;
  club_id: number;
  club_name: string;
  club_location: string;
  province: string;
  latitude: number | null;
  longitude: number | null;
  cart_available: boolean;
  cart_compulsory: boolean;
  cart_price: number;
  existing_players: { name: string; players: number }[];
  game_type: "open" | "tournament";
  is_shotgun: boolean;
  event_name: string | null;
};

type ClubGroup = {
  club_id: number;
  club_name: string;
  club_location: string;
  province: string;
  latitude: number | null;
  longitude: number | null;
  distKm: number | null;
  games: OpenGame[];
  minPrice: number;
  maxPrice: number;
  totalAvailable: number;
};

type DateOption = { iso: string; label: string; sub: string };

// ─── Constants ────────────────────────────────────────────────────────────────
const RADIUS_OPTIONS = [
  { label: "10 km", km: 10 },
  { label: "25 km", km: 25 },
  { label: "50 km", km: 50 },
  { label: "Any",   km: null },
];

const PROVINCES = [
  "All", "Gauteng", "Western Cape", "KZN", "Mpumalanga",
  "Limpopo", "North West", "Free State", "Eastern Cape", "Northern Cape",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

function buildDateOptions(): DateOption[] {
  const opts: DateOption[] = [];
  const now = new Date();
  for (let i = 0; i < 14; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    const iso = d.toISOString().split("T")[0];
    const sub = d.toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
    if (i === 0)      opts.push({ iso, label: "Today",    sub });
    else if (i === 1) opts.push({ iso, label: "Tomorrow", sub });
    else opts.push({ iso, label: d.toLocaleDateString("en-ZA", { weekday: "short" }), sub });
  }
  return opts;
}

// ─── Slot Row (individual tee-time inside an expanded club) ───────────────────
function SlotRow({
  game,
  onJoin,
  colors,
}: {
  game: OpenGame;
  onJoin: () => void;
  colors: any;
}) {
  const displayPrice = game.promotional_price ?? game.price;
  const spotsLeft = game.available;
  const isTournament = game.game_type === "tournament";
  const isShotgun = game.is_shotgun;

  return (
    <View style={[styles.slotRow, { borderTopColor: colors.border }]}>
      <View style={styles.slotLeft}>
        <View style={styles.slotTimeRow}>
          <Ionicons name="time-outline" size={14} color={colors.mutedForeground} />
          <Text style={[styles.slotTime, { color: colors.foreground }]}>{game.time}</Text>
          <View style={[styles.spotsBadge, {
            backgroundColor: spotsLeft === 1 ? "#ef444422" : colors.primary + "18",
          }]}>
            <Text style={[styles.spotsText, { color: spotsLeft === 1 ? "#ef4444" : colors.primary }]}>
              {spotsLeft} spot{spotsLeft !== 1 ? "s" : ""} left
            </Text>
          </View>
        </View>
        {game.existing_players.length > 0 && (
          <Text style={[styles.slotPlayers, { color: colors.mutedForeground }]} numberOfLines={1}>
            {game.existing_players.map((p) => p.name).join(", ")}
          </Text>
        )}
        {isTournament && isShotgun && (
          <View style={[styles.drawBadge, { backgroundColor: "#c8a84b22" }]}>
            <Ionicons name="shuffle-outline" size={12} color="#c8a84b" />
            <Text style={[styles.drawBadgeText, { color: "#c8a84b" }]}>Draw pending — hole assigned after entry</Text>
          </View>
        )}
      </View>
      <View style={styles.slotRight}>
        <View style={styles.slotPriceRow}>
          {game.promotional_price !== null && (
            <Text style={[styles.slotPriceOld, { color: colors.mutedForeground }]}>
              R{game.price.toFixed(0)}
            </Text>
          )}
          <Text style={[styles.slotPrice, { color: colors.primary }]}>
            R{displayPrice.toFixed(0)}
          </Text>
          <Text style={[styles.slotPricePer, { color: colors.mutedForeground }]}>/pp</Text>
        </View>
        <TouchableOpacity
          style={[styles.slotJoinBtn, { backgroundColor: colors.primary }]}
          onPress={onJoin}
          activeOpacity={0.85}
        >
          <Text style={styles.slotJoinBtnText}>Join</Text>
          <Ionicons name="arrow-forward" size={12} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Club Game Card ────────────────────────────────────────────────────────────
function ClubGameCard({
  group,
  expanded,
  onToggle,
  onJoinGame,
  colors,
}: {
  group: ClubGroup;
  expanded: boolean;
  onToggle: () => void;
  onJoinGame: (game: OpenGame) => void;
  colors: any;
}) {
  const priceLabel =
    group.minPrice === group.maxPrice
      ? `R${group.minPrice.toFixed(0)}`
      : `R${group.minPrice.toFixed(0)} – R${group.maxPrice.toFixed(0)}`;
  const timeFirst = group.games[0].time;
  const timeLast  = group.games[group.games.length - 1].time;
  const timeLabel = group.games.length === 1 ? timeFirst : `${timeFirst} – ${timeLast}`;

  // Derive game type info from the slots in this group
  const hasTournament = group.games.some((g) => g.game_type === "tournament");
  const hasOpen       = group.games.some((g) => g.game_type === "open");
  const hasShotgun    = group.games.some((g) => g.is_shotgun);
  const isMixed       = hasTournament && hasOpen;
  const eventName     = group.games.find((g) => g.event_name)?.event_name ?? null;

  const gameTypeLabel = isMixed ? "Mixed" : hasTournament ? "Tournament" : "Open Game";
  const gameTypeColor = hasTournament ? "#7c3aed" : colors.primary;
  const gameTypeBg    = hasTournament ? "#7c3aed18" : colors.primary + "18";
  const gameTypeIcon  = hasTournament ? "trophy-outline" : "golf-outline";

  return (
    <View style={[
      styles.card,
      {
        backgroundColor: colors.card,
        borderColor: expanded ? colors.primary : colors.border,
        borderWidth: expanded ? 1.5 : 1,
      },
    ]}>
      {/* Tap header to expand/collapse */}
      <TouchableOpacity style={styles.cardHeader} onPress={onToggle} activeOpacity={0.82}>
        <View style={{ flex: 1 }}>
          <View style={styles.cardTitleRow}>
            <Text style={[styles.cardClub, { color: colors.foreground }]} numberOfLines={1}>
              {group.club_name}
            </Text>
            <View style={[styles.gameTypeBadge, { backgroundColor: gameTypeBg }]}>
              <Ionicons name={gameTypeIcon as any} size={11} color={gameTypeColor} />
              <Text style={[styles.gameTypeText, { color: gameTypeColor }]}>{gameTypeLabel}</Text>
            </View>
          </View>
          {hasTournament && eventName && (
            <Text style={[styles.eventNameText, { color: colors.mutedForeground }]} numberOfLines={1}>
              {eventName}
            </Text>
          )}
          <Text style={[styles.cardLocation, { color: colors.mutedForeground }]} numberOfLines={1}>
            <Ionicons name="location-outline" size={11} color={colors.mutedForeground} />
            {"  "}{group.club_location}
            {group.distKm !== null
              ? `  ·  ${group.distKm < 1 ? "<1 km" : `${Math.round(group.distKm)} km away`}`
              : ""}
          </Text>
        </View>
        <View style={styles.cardRight}>
          <View style={[styles.gameCountBadge, { backgroundColor: colors.primary + "15" }]}>
            <Text style={[styles.gameCountText, { color: colors.primary }]}>
              {group.games.length} game{group.games.length !== 1 ? "s" : ""}
            </Text>
          </View>
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={18}
            color={colors.mutedForeground}
          />
        </View>
      </TouchableOpacity>
      {/* Shotgun draw notice — shown at card level so it's visible before expanding */}
      {hasTournament && hasShotgun && !expanded && (
        <View style={[styles.shotgunBanner, { backgroundColor: "#c8a84b15", borderTopColor: colors.border }]}>
          <Ionicons name="shuffle-outline" size={13} color="#c8a84b" />
          <Text style={[styles.shotgunBannerText, { color: "#c8a84b" }]}>
            Shotgun start — starting hole assigned after draw
          </Text>
        </View>
      )}

      {/* Summary row — always visible */}
      <View style={[styles.cardSummary, { borderTopColor: colors.border }]}>
        <View style={styles.metaChip}>
          <Ionicons name="time-outline" size={12} color={colors.mutedForeground} />
          <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{timeLabel}</Text>
        </View>
        <View style={styles.metaChip}>
          <Ionicons name="people-outline" size={12} color={colors.mutedForeground} />
          <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
            {group.totalAvailable} spot{group.totalAvailable !== 1 ? "s" : ""} open
          </Text>
        </View>
        <View style={styles.metaChip}>
          <Ionicons name="cash-outline" size={12} color={colors.mutedForeground} />
          <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{priceLabel}/pp</Text>
        </View>
      </View>

      {/* Expanded: individual tee-time slots */}
      {expanded && (
        <View style={styles.slotsContainer}>
          <Text style={[styles.slotsHeader, { color: colors.mutedForeground, borderBottomColor: colors.border }]}>
            Available tee times — tap to join
          </Text>
          {group.games.map((g) => (
            <SlotRow
              key={g.tee_time_id}
              game={g}
              onJoin={() => onJoinGame(g)}
              colors={colors}
            />
          ))}
        </View>
      )}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function JoinGameScreen() {
  const colors   = useColors();
  const insets   = useSafeAreaInsets();
  const { user } = useAuth();

  const [games,         setGames]         = useState<OpenGame[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [expandedClubId, setExpandedClubId] = useState<number | null>(null);
  // Tracks whether we've auto-expanded the first club for the current result set,
  // so it fires once per fetch and never fights a manual collapse.
  const autoExpandedRef = useRef(false);
  // On first open, we jump the date selector to the earliest date that actually
  // has open games. dateReady gates the per-date fetch until that's resolved.
  const [dateReady, setDateReady] = useState(false);
  const didInitDateRef = useRef(false);

  // ── Filters ──────────────────────────────────────────────────────────────────
  const dateOptions                        = useMemo(() => buildDateOptions(), []);
  const [selectedDate,  setSelectedDate]  = useState(todayISO());
  const [radiusKm,      setRadiusKm]      = useState<number | null>(null);
  const [province,      setProvince]      = useState("All");
  const [suburb,        setSuburb]        = useState("");
  const [suburbInput,   setSuburbInput]   = useState("");
  const suburbTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Location ─────────────────────────────────────────────────────────────────
  const [userLat,   setUserLat]   = useState<number | null>(null);
  const [userLon,   setUserLon]   = useState<number | null>(null);
  const [locLoading, setLocLoading] = useState(false);
  const [locDenied,  setLocDenied]  = useState(false);
  const [locReady,   setLocReady]   = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  // Silently grab location on mount if already permitted
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === "granted") {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setUserLat(pos.coords.latitude);
          setUserLon(pos.coords.longitude);
        } else {
          setLocDenied(status === "denied");
        }
      } catch {
        // fall through
      } finally {
        setLocReady(true);
      }
    })();
  }, []);

  const requestLocation = useCallback(async () => {
    setLocLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setUserLat(pos.coords.latitude);
        setUserLon(pos.coords.longitude);
        setLocDenied(false);
      } else {
        setLocDenied(true);
      }
    } catch {}
    setLocLoading(false);
  }, []);

  // ── Fetch ─────────────────────────────────────────────────────────────────────
  const fetchGames = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      qs.set("date", selectedDate);
      if (province !== "All") qs.set("province", province);
      if (suburb) qs.set("suburb", suburb);
      const data = await apiFetch(`/bookings/open?${qs.toString()}`, user?.token);
      setGames(data.games ?? []);
      setError(null);
      setExpandedClubId(null);
      autoExpandedRef.current = false;
    } catch {
      setError("Could not load open games. Please try again.");
    }
    setLoading(false);
    setRefreshing(false);
  }, [selectedDate, province, suburb, user?.token]);

  // On first open, discover the earliest date with open games (the endpoint
  // returns all upcoming games ordered by date when no date is passed) and jump
  // the date selector to it, so the user lands on the first available game.
  useEffect(() => {
    if (didInitDateRef.current) return;
    didInitDateRef.current = true;
    (async () => {
      try {
        const data = await apiFetch(`/bookings/open`, user?.token);
        const upcoming: OpenGame[] = data.games ?? [];
        if (upcoming.length > 0 && upcoming[0].date) {
          setSelectedDate(upcoming[0].date);
        }
      } catch {
        // fall through — we'll just load the default (today) date
      } finally {
        setDateReady(true);
      }
    })();
  }, [user?.token]);

  useEffect(() => {
    if (!dateReady) return;
    setLoading(true);
    fetchGames();
  }, [fetchGames, dateReady]);

  // ── Handlers ──────────────────────────────────────────────────────────────────
  const onSuburbChange = (text: string) => {
    setSuburbInput(text);
    if (suburbTimer.current) clearTimeout(suburbTimer.current);
    suburbTimer.current = setTimeout(() => setSuburb(text.trim()), 600);
  };

  const onSelectDate = (iso: string) => {
    Haptics.selectionAsync();
    setSelectedDate(iso);
  };

  const onSelectRadius = (km: number | null) => {
    Haptics.selectionAsync();
    setRadiusKm(km);
    if (km !== null && userLat === null) requestLocation();
  };

  const onSelectProvince = (p: string) => {
    Haptics.selectionAsync();
    setProvince(p);
    // When switching to a different province, distance filter is meaningless — reset to Any
    if (p !== "All") setRadiusKm(null);
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchGames();
  };

  // ── Derived data ──────────────────────────────────────────────────────────────
  const hasLocation    = userLat !== null && userLon !== null;
  const sortByDistance = hasLocation && province === "All";

  const clubGroups = useMemo<ClubGroup[]>(() => {
    const map = new Map<number, ClubGroup>();
    for (const g of games) {
      let grp = map.get(g.club_id);
      if (!grp) {
        let distKm: number | null = null;
        if (hasLocation && g.latitude !== null && g.longitude !== null) {
          distKm = haversineKm(userLat!, userLon!, g.latitude, g.longitude);
        }
        grp = {
          club_id:        g.club_id,
          club_name:      g.club_name,
          club_location:  g.club_location,
          province:       g.province,
          latitude:       g.latitude,
          longitude:      g.longitude,
          distKm,
          games:          [],
          minPrice:       Infinity,
          maxPrice:       -Infinity,
          totalAvailable: 0,
        };
        map.set(g.club_id, grp);
      }
      grp.games.push(g);
      const p = g.promotional_price ?? g.price;
      grp.minPrice = Math.min(grp.minPrice, p);
      grp.maxPrice = Math.max(grp.maxPrice, p);
      grp.totalAvailable += g.available;
    }
    return Array.from(map.values())
      .filter((grp) => {
        if (radiusKm === null) return true;
        if (grp.distKm === null) return true;
        return grp.distKm <= radiusKm;
      })
      .sort((a, b) => {
        if (sortByDistance && a.distKm !== null && b.distKm !== null) return a.distKm - b.distKm;
        if (sortByDistance && a.distKm !== null) return -1;
        if (sortByDistance && b.distKm !== null) return 1;
        return 0;
      });
  }, [games, hasLocation, userLat, userLon, radiusKm, sortByDistance]);

  // Auto-expand the first club (the first available spot) once results load,
  // so the user lands directly on a joinable tee time without tapping.
  useEffect(() => {
    if (!loading && !autoExpandedRef.current && clubGroups.length > 0) {
      setExpandedClubId(clubGroups[0].club_id);
      autoExpandedRef.current = true;
    }
  }, [loading, clubGroups]);

  const onJoinGame = (game: OpenGame) => {
    Haptics.selectionAsync();
    router.push({
      pathname: "/booking/new",
      params: {
        club_id:         game.club_id.toString(),
        club_name:       game.club_name,
        tee_time_id:     game.tee_time_id.toString(),
        time:            game.time,
        date:            game.date,
        price:           game.price.toString(),
        ...(game.promotional_price !== null ? { promo_price: game.promotional_price.toString() } : {}),
        available:       game.available.toString(),
        cart_available:  game.cart_available ? "1" : "0",
        cart_compulsory: game.cart_compulsory ? "1" : "0",
        cart_price:      game.cart_price.toString(),
      },
    });
  };

  const showList = !loading && locReady;

  const headerSub = !showList
    ? "Finding open games…"
    : province !== "All"
      ? `${clubGroups.length} club${clubGroups.length !== 1 ? "s" : ""} in ${province}`
      : sortByDistance
        ? `${clubGroups.length} club${clubGroups.length !== 1 ? "s" : ""} · nearest first`
        : `${clubGroups.length} club${clubGroups.length !== 1 ? "s" : ""} with open games`;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Join a Game</Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>{headerSub}</Text>
        </View>
      </View>

      <FlatList
        data={showList ? clubGroups : []}
        keyExtractor={(item) => item.club_id.toString()}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 140 : 100 }}
        ListHeaderComponent={
          <View>
            {/* ── Date selector ─────────────────────────────────────── */}
            <View style={[styles.dateSection, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
              <Text style={[styles.dateSectionLabel, { color: colors.mutedForeground }]}>Select a date</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.dateScroll}
                contentContainerStyle={{ gap: 8, paddingRight: 16 }}
              >
                {dateOptions.map((opt) => {
                  const active = selectedDate === opt.iso;
                  return (
                    <TouchableOpacity
                      key={opt.iso}
                      style={[styles.dateChip, {
                        backgroundColor: active ? colors.primary : colors.background,
                        borderColor:     active ? colors.primary : colors.border,
                      }]}
                      onPress={() => onSelectDate(opt.iso)}
                    >
                      <Text style={[styles.dateChipLabel, { color: active ? "#fff" : colors.foreground }]}>
                        {opt.label}
                      </Text>
                      <Text style={[styles.dateChipSub, { color: active ? "#ffffffb0" : colors.mutedForeground }]}>
                        {opt.sub}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* ── Filters ───────────────────────────────────────────── */}
            <View style={[styles.filtersBox, { backgroundColor: colors.card, borderColor: colors.border }]}>

              {/* Location banner */}
              {locLoading ? (
                <View style={[styles.locBanner, { backgroundColor: colors.primary + "12" }]}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={[styles.locBannerText, { color: colors.primary }]}>
                    Getting your location…
                  </Text>
                </View>
              ) : sortByDistance ? (
                <View style={[styles.locBanner, { backgroundColor: "#1a5c3818" }]}>
                  <Ionicons name="location" size={14} color={colors.primary} />
                  <Text style={[styles.locBannerText, { color: colors.primary }]}>
                    Showing clubs nearest to you
                  </Text>
                </View>
              ) : hasLocation && province !== "All" ? (
                <View style={[styles.locBanner, { backgroundColor: colors.accent + "18" }]}>
                  <Ionicons name="location-outline" size={14} color={colors.accent} />
                  <Text style={[styles.locBannerText, { color: colors.accent }]}>
                    Showing clubs in {province}
                  </Text>
                </View>
              ) : !hasLocation && !locDenied ? (
                <TouchableOpacity
                  style={[styles.locBanner, styles.locBannerBtn, {
                    borderColor:     colors.primary + "50",
                    backgroundColor: colors.primary + "0c",
                  }]}
                  onPress={requestLocation}
                  activeOpacity={0.8}
                >
                  <Ionicons name="location-outline" size={14} color={colors.primary} />
                  <Text style={[styles.locBannerText, { color: colors.primary }]}>
                    Tap to sort by nearest location
                  </Text>
                  <Ionicons name="chevron-forward" size={13} color={colors.primary} style={{ marginLeft: "auto" }} />
                </TouchableOpacity>
              ) : null}

              {/* Max distance (only when we have location) */}
              {hasLocation && (
                <>
                  <Text style={[styles.filterLabel, { color: colors.mutedForeground, marginTop: 14 }]}>
                    Max distance
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.chipScroll}
                    contentContainerStyle={{ gap: 8 }}
                  >
                    {RADIUS_OPTIONS.map((opt) => {
                      const active = radiusKm === opt.km;
                      return (
                        <TouchableOpacity
                          key={opt.label}
                          style={[styles.filterChip, {
                            backgroundColor: active ? colors.primary : colors.background,
                            borderColor:     active ? colors.primary : colors.border,
                          }]}
                          onPress={() => onSelectRadius(opt.km)}
                        >
                          <Text style={[styles.filterChipText, { color: active ? "#fff" : colors.foreground }]}>
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </>
              )}

              {/* Province */}
              <Text style={[styles.filterLabel, { color: colors.mutedForeground, marginTop: 14 }]}>Province</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.chipScroll}
                contentContainerStyle={{ gap: 8 }}
              >
                {PROVINCES.map((p) => {
                  const active = province === p;
                  return (
                    <TouchableOpacity
                      key={p}
                      style={[styles.filterChip, {
                        backgroundColor: active ? colors.primary : colors.background,
                        borderColor:     active ? colors.primary : colors.border,
                      }]}
                      onPress={() => onSelectProvince(p)}
                    >
                      <Text style={[styles.filterChipText, { color: active ? "#fff" : colors.foreground }]}>
                        {p}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Club / Suburb search */}
              <Text style={[styles.filterLabel, { color: colors.mutedForeground, marginTop: 14 }]}>
                Club / Suburb
              </Text>
              <View style={[styles.suburbInput, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Ionicons name="search-outline" size={16} color={colors.mutedForeground} />
                <TextInput
                  style={[styles.suburbText, { color: colors.foreground }]}
                  placeholder="e.g. Sandton, Constantia…"
                  placeholderTextColor={colors.mutedForeground}
                  value={suburbInput}
                  onChangeText={onSuburbChange}
                  returnKeyType="search"
                  autoCorrect={false}
                />
                {suburbInput.length > 0 && (
                  <TouchableOpacity onPress={() => { setSuburbInput(""); setSuburb(""); }}>
                    <Ionicons name="close-circle" size={16} color={colors.mutedForeground} />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Results header */}
            {showList && !error && clubGroups.length > 0 && (
              <View style={styles.resultsLabel}>
                <Text style={[styles.resultsTitle, { color: colors.foreground }]}>
                  {clubGroups.length} club{clubGroups.length !== 1 ? "s" : ""} with open games
                </Text>
                <Text style={[styles.resultsSub, { color: colors.mutedForeground }]}>
                  Tap a club to see available tee times
                </Text>
              </View>
            )}

            {/* Loading */}
            {(loading || !locReady) && (
              <View style={styles.centered}>
                <GolfBallLoader />
                <Text style={[styles.centeredText, { color: colors.mutedForeground }]}>
                  Finding open games near you…
                </Text>
              </View>
            )}

            {/* Error */}
            {showList && error && (
              <View style={styles.centered}>
                <Ionicons name="wifi-outline" size={40} color={colors.mutedForeground} />
                <Text style={[styles.centeredText, { color: colors.mutedForeground }]}>{error}</Text>
                <TouchableOpacity
                  style={[styles.retryBtn, { borderColor: colors.primary }]}
                  onPress={fetchGames}
                >
                  <Text style={[styles.retryText, { color: colors.primary }]}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Empty */}
            {showList && !error && clubGroups.length === 0 && (
              <View style={styles.centered}>
                <Ionicons name="golf-outline" size={40} color={colors.mutedForeground} />
                <Text style={[styles.centeredText, { color: colors.mutedForeground }]}>
                  No open games on this date.
                </Text>
                <Text style={[styles.centeredSub, { color: colors.mutedForeground }]}>
                  Try a different date or province.
                </Text>
              </View>
            )}
          </View>
        }
        renderItem={({ item: group }) => (
          <View style={styles.cardWrap}>
            <ClubGameCard
              group={group}
              expanded={expandedClubId === group.club_id}
              onToggle={() => {
                Haptics.selectionAsync();
                setExpandedClubId(expandedClubId === group.club_id ? null : group.club_id);
              }}
              onJoinGame={onJoinGame}
              colors={colors}
            />
          </View>
        )}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  header: {
    flexDirection:    "row",
    alignItems:       "center",
    paddingHorizontal: 20,
    paddingBottom:    14,
    gap:              14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn:     { padding: 4 },
  headerTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  headerSub:   { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 1 },

  // Date selector
  dateSection: {
    paddingHorizontal: 16,
    paddingTop:        14,
    paddingBottom:     14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dateSectionLabel: {
    fontSize:      11,
    fontFamily:    "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom:  10,
  },
  dateScroll: {},
  dateChip: {
    alignItems:     "center",
    borderRadius:   12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth:    1.5,
    minWidth:       62,
  },
  dateChipLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  dateChipSub:   { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },

  // Filters
  filtersBox: {
    margin:        16,
    borderRadius:  16,
    padding:       16,
    borderWidth:   1,
  },
  filterLabel: {
    fontSize:      12,
    fontFamily:    "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  chipScroll: { marginTop: 8 },
  filterChip: {
    borderRadius:     20,
    paddingHorizontal: 14,
    paddingVertical:  7,
    borderWidth:      1.5,
  },
  filterChipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  suburbInput: {
    flexDirection:    "row",
    alignItems:       "center",
    gap:              8,
    marginTop:        8,
    borderWidth:      1.5,
    borderRadius:     12,
    paddingHorizontal: 12,
    height:           44,
  },
  suburbText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },

  // Location banner
  locBanner: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           7,
    borderRadius:  10,
    paddingHorizontal: 12,
    paddingVertical:   9,
    marginBottom:  4,
  },
  locBannerBtn:  { borderWidth: 1.5 },
  locBannerText: { fontSize: 13, fontFamily: "Inter_500Medium", flex: 1 },

  // Results section
  resultsLabel: { paddingHorizontal: 20, paddingTop: 4, marginBottom: 6 },
  resultsTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  resultsSub:   { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },

  // Club card
  cardWrap: { paddingHorizontal: 16, marginBottom: 12 },
  card: {
    borderRadius: 16,
    overflow:     "hidden",
  },
  cardHeader: {
    flexDirection:    "row",
    alignItems:       "center",
    padding:          14,
    gap:              10,
  },
  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  cardClub:     { fontSize: 16, fontFamily: "Inter_700Bold", flexShrink: 1 },
  cardLocation: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  eventNameText: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginTop: 1 },
  gameTypeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  gameTypeText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  shotgunBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  shotgunBannerText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  cardRight: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           6,
    flexShrink:    0,
  },
  gameCountBadge: {
    borderRadius:     20,
    paddingHorizontal: 10,
    paddingVertical:  4,
  },
  gameCountText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  cardSummary: {
    flexDirection:    "row",
    alignItems:       "center",
    gap:              14,
    paddingHorizontal: 14,
    paddingVertical:  10,
    borderTopWidth:   StyleSheet.hairlineWidth,
    flexWrap:         "wrap",
  },
  metaChip: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText:  { fontSize: 12, fontFamily: "Inter_400Regular" },

  // Slots (expanded)
  slotsContainer: {},
  slotsHeader: {
    fontSize:         11,
    fontFamily:       "Inter_600SemiBold",
    textTransform:    "uppercase",
    letterSpacing:    0.5,
    paddingHorizontal: 14,
    paddingVertical:  10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  slotRow: {
    flexDirection:    "row",
    alignItems:       "center",
    justifyContent:   "space-between",
    paddingHorizontal: 14,
    paddingVertical:  12,
    borderTopWidth:   StyleSheet.hairlineWidth,
    gap:              12,
  },
  slotLeft:    { flex: 1, gap: 4 },
  slotRight:   { alignItems: "flex-end", gap: 6, flexShrink: 0 },
  slotTimeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  slotTime:    { fontSize: 15, fontFamily: "Inter_700Bold" },
  slotPlayers: { fontSize: 11, fontFamily: "Inter_400Regular" },
  drawBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  drawBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  slotPriceRow: { flexDirection: "row", alignItems: "baseline", gap: 2 },
  slotPriceOld: { fontSize: 11, fontFamily: "Inter_400Regular", textDecorationLine: "line-through" },
  slotPrice:    { fontSize: 16, fontFamily: "Inter_700Bold" },
  slotPricePer: { fontSize: 11, fontFamily: "Inter_400Regular" },
  slotJoinBtn: {
    flexDirection:    "row",
    alignItems:       "center",
    borderRadius:     8,
    paddingHorizontal: 12,
    paddingVertical:  7,
    gap:              4,
  },
  slotJoinBtnText: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#fff" },

  // Spots badge
  spotsBadge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  spotsText:  { fontSize: 11, fontFamily: "Inter_700Bold" },

  // Empty / error / loading
  centered: {
    alignItems:       "center",
    paddingVertical:  48,
    paddingHorizontal: 32,
    gap:              10,
  },
  centeredText: { fontSize: 15, fontFamily: "Inter_500Medium", textAlign: "center" },
  centeredSub:  { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  retryBtn: {
    marginTop:        8,
    borderWidth:      1.5,
    borderRadius:     20,
    paddingHorizontal: 24,
    paddingVertical:  8,
  },
  retryText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
