import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import GolfBallLoader from "@/components/GolfBallLoader";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ClubCard, { Club } from "@/components/ClubCard";
import { AppHeader } from "@/components/AppHeader";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/lib/api";

const PROVINCES = [
  "All",
  "Gauteng",
  "Western Cape",
  "KwaZulu-Natal",
  "Eastern Cape",
  "Free State",
  "Mpumalanga",
  "North West",
  "Northern Cape",
  "Limpopo",
];

const PAGE_SIZE = 20;

export default function ExploreScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ q?: string; province?: string; focus?: string; featured?: string }>();
  const searchInputRef = useRef<TextInput>(null);

  const [search, setSearch] = useState(params.q ?? "");
  const [province, setProvince] = useState(params.province || "All");
  const [featuredOnly, setFeaturedOnly] = useState(params.featured === "1");
  const featuredRef = useRef(params.featured === "1");
  const [clubs, setClubs] = useState<Club[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");
  // userCoords is set whenever we have the user's position
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});

  // Tee time search state
  const [showTeeSearch, setShowTeeSearch] = useState(false);
  const [teeDate, setTeeDate] = useState(new Date());
  const [teeTime, setTeeTime] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [teeSearching, setTeeSearching] = useState(false);
  const [teeResults, setTeeResults] = useState<any[] | null>(null);
  const [teeSearchMeta, setTeeSearchMeta] = useState<any>(null);
  // When arriving from the dashboard search box (focus=1), focus the input so
  // the keyboard opens automatically. Clear the flag afterwards so plain
  // Explore-tab taps don't re-trigger it.
  useFocusEffect(
    useCallback(() => {
      if (params.focus !== "1") return;
      const t = setTimeout(() => {
        searchInputRef.current?.focus();
        router.setParams({ focus: "" });
      }, 400);
      return () => clearTimeout(t);
    }, [params.focus]),
  );

  // Tracks the active search so stale responses from old queries are ignored
  const searchKey = useRef(0);
  // Holds the latest coords so callbacks always see the current value
  const coordsRef = useRef<{ lat: number; lng: number } | null>(null);

  // ─── Location helper ──────────────────────────────────────────────────────

  // Try to get location silently (won't show a dialog if permission is denied/undetermined
  // on the first try — we'll request it properly via the button).
  const tryGetLocation = useCallback(async (requestIfNeeded = false) => {
    try {
      let { status } = await Location.getForegroundPermissionsAsync();
      if (status !== "granted" && requestIfNeeded) {
        ({ status } = await Location.requestForegroundPermissionsAsync());
      }
      if (status !== "granted") return null;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch {
      return null;
    }
  }, []);

  // ─── Fetch one page ───────────────────────────────────────────────────────

  const fetchPage = useCallback(async (
    q: string,
    prov: string,
    lat: number | undefined,
    lng: number | undefined,
    off: number,
    append: boolean,
    key: number,
  ) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setClubs([]);
      setTotal(0);
      setOffset(0);
    }

    try {
      const qs = new URLSearchParams();
      if (q) qs.set("q", q);
      if (prov && prov !== "All") qs.set("province", prov);
      if (featuredRef.current) qs.set("featured", "1");
      if (lat != null && lng != null) {
        qs.set("lat", lat.toString());
        qs.set("lng", lng.toString());
      }
      qs.set("limit", PAGE_SIZE.toString());
      qs.set("offset", off.toString());

      const data = await apiFetch(`/clubs?${qs.toString()}`, user?.token);
      if (searchKey.current !== key) return;

      const incoming: Club[] = data.clubs ?? [];
      setClubs(prev => append ? [...prev, ...incoming] : incoming);
      setTotal(data.total ?? 0);
      setOffset(off + incoming.length);
    } catch {}

    if (append) setLoadingMore(false);
    else setLoading(false);
  }, [user?.token]);

  const doSearch = useCallback((q: string, prov: string, lat?: number, lng?: number) => {
    searchKey.current += 1;
    const useLat = lat ?? coordsRef.current?.lat;
    const useLng = lng ?? coordsRef.current?.lng;
    fetchPage(q, prov, useLat, useLng, 0, false, searchKey.current);
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (loadingMore || loading || clubs.length >= total) return;
    fetchPage(
      search, province,
      coordsRef.current?.lat, coordsRef.current?.lng,
      offset, true, searchKey.current,
    );
  }, [loadingMore, loading, clubs.length, total, search, province, offset, fetchPage]);

  // ─── On mount: silently pick up location if already granted, then load ───

  useEffect(() => {
    apiFetch("/clubs/counts", user?.token)
      .then((data: Record<string, number>) => setCounts(data))
      .catch(() => {});

    // Try to use existing permission without prompting — if granted, we get coords
    // immediately and the first search will sort by proximity on "All".
    tryGetLocation(false).then((coords) => {
      if (coords) {
        coordsRef.current = coords;
        setUserCoords(coords);
      }
      // Kick off the initial search (coords may or may not be available)
      doSearch(params.q ?? "", params.province ?? "All", coords?.lat, coords?.lng);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-search whenever province chip changes
  useEffect(() => {
    doSearch(search, province);
  }, [province]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle deep-link search param
  useEffect(() => {
    if (params.q) { setSearch(params.q); doSearch(params.q, province); }
  }, [params.q]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync province when arriving from the dashboard chips. The Explore tab can
  // stay mounted, so params.province must update state (which re-runs the
  // search via the [province] effect) instead of only seeding the initial value.
  useEffect(() => {
    const next = params.province || "All";
    setProvince((prev) => (prev === next ? prev : next));
  }, [params.province]); // eslint-disable-line react-hooks/exhaustive-deps

  // Activate featured-only filter when arriving from home screen "See all"
  useEffect(() => {
    if (params.featured !== "1") return;
    featuredRef.current = true;
    setFeaturedOnly(true);
    doSearch(search, province);
    router.setParams({ featured: "" });
  }, [params.featured]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Location button ──────────────────────────────────────────────────────

  const handleLocationBtn = async () => {
    // If we already have coords, clear them (user wants to turn off distance sort)
    if (userCoords) {
      setUserCoords(null);
      coordsRef.current = null;
      setLocationError("");
      doSearch(search, province, undefined, undefined);
      return;
    }

    setLocating(true);
    setLocationError("");
    const coords = await tryGetLocation(true);
    if (coords) {
      coordsRef.current = coords;
      setUserCoords(coords);
      doSearch(search, province, coords.lat, coords.lng);
    } else {
      setLocationError("Location permission denied");
    }
    setLocating(false);
  };

  // ─── Tee time search ────────────────────────────────────────────────────
  const handleTeeTimeSearch = async () => {
    // Ensure we have location
    let coords = coordsRef.current;
    if (!coords) {
      const loc = await tryGetLocation(true);
      if (loc) {
        coords = loc;
        coordsRef.current = loc;
        setUserCoords(loc);
      } else {
        setLocationError("Location needed to search nearby tee times");
        return;
      }
    }

    setTeeSearching(true);
    setTeeResults(null);
    const dateStr = teeDate.toISOString().slice(0, 10);
    const timeStr = `${String(teeTime.getHours()).padStart(2, "0")}:${String(teeTime.getMinutes()).padStart(2, "0")}`;

    try {
      const qs = new URLSearchParams({
        lat: coords.lat.toString(),
        lng: coords.lng.toString(),
        date: dateStr,
        time: timeStr,
        radius: "50",
      });
      const data = await apiFetch(`/clubs/tee-time-search?${qs}`, user?.token);
      setTeeResults(data.clubs ?? []);
      setTeeSearchMeta(data);
    } catch {
      setTeeResults([]);
    }
    setTeeSearching(false);
  };

  // ─── UI helpers ───────────────────────────────────────────────────────────

  const sortedByDistance = userCoords !== null;

  const listFooter = loadingMore ? (
    <View style={styles.footerLoader}>
      <ActivityIndicator color={colors.primary} size="small" />
      <Text style={[styles.footerText, { color: colors.mutedForeground }]}>
        Loading more clubs…
      </Text>
    </View>
  ) : !loading && clubs.length > 0 && clubs.length >= total ? (
    <Text style={[styles.footerText, styles.footerEnd, { color: colors.mutedForeground }]}>
      All {total} club{total !== 1 ? "s" : ""} loaded
    </Text>
  ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader />

      {/* Search + action buttons */}
      <View style={[styles.header, { paddingTop: 12 }]}>
        <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: sortedByDistance ? colors.primary : colors.border }]}>
          <Ionicons name="search-outline" size={18} color={colors.mutedForeground} />
          <TextInput
            ref={searchInputRef}
            style={[styles.searchInput, { color: colors.foreground }]}
            value={search}
            onChangeText={setSearch}
            placeholder="Search clubs, locations…"
            placeholderTextColor={colors.mutedForeground}
            returnKeyType="search"
            onSubmitEditing={() => doSearch(search, province)}
          />
          {search ? (
            <TouchableOpacity onPress={() => { setSearch(""); doSearch("", province); }}>
              <Ionicons name="close-circle" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Location toggle button */}
        <TouchableOpacity
          style={[
            styles.iconBtn,
            {
              backgroundColor: userCoords ? colors.primary : colors.card,
              borderColor: userCoords ? colors.primary : colors.border,
            },
          ]}
          onPress={() => { Haptics.selectionAsync(); handleLocationBtn(); }}
          disabled={locating}
        >
          {locating ? (
            <ActivityIndicator size="small" color={userCoords ? "#fff" : colors.primary} />
          ) : (
            <Ionicons
              name={userCoords ? "location" : "location-outline"}
              size={18}
              color={userCoords ? "#fff" : colors.foreground}
            />
          )}
        </TouchableOpacity>

        {/* Map button */}
        <TouchableOpacity
          style={[styles.iconBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}
          onPress={() => {
            Haptics.selectionAsync();
            if (userCoords) {
              router.push({ pathname: "/club-map", params: { lat: userCoords.lat, lng: userCoords.lng } });
            } else {
              router.push("/club-map");
            }
          }}
        >
          <Ionicons name="map-outline" size={18} color="#fff" />
        </TouchableOpacity>

        {/* Tee Time Search button */}
        <TouchableOpacity
          style={[styles.iconBtn, { backgroundColor: showTeeSearch ? colors.primary : colors.card, borderColor: showTeeSearch ? colors.primary : colors.border }]}
          onPress={() => { Haptics.selectionAsync(); setShowTeeSearch(true); }}
        >
          <Ionicons name="time-outline" size={18} color={showTeeSearch ? "#fff" : colors.foreground} />
        </TouchableOpacity>
      </View>

      {/* Tee Time Search Modal */}
      <Modal visible={showTeeSearch} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.teeModal, { backgroundColor: colors.background }]}>
          <View style={styles.teeModalHeader}>
            <Text style={[styles.teeModalTitle, { color: colors.foreground }]}>Find Tee Times</Text>
            <TouchableOpacity onPress={() => { setShowTeeSearch(false); setTeeResults(null); }}>
              <Ionicons name="close" size={24} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.teeLabel, { color: colors.mutedForeground }]}>
            Search available tee times at nearby clubs (±1 hour flexibility)
          </Text>

          {/* Date picker */}
          <TouchableOpacity
            style={[styles.teePickerBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => setShowDatePicker(true)}
          >
            <Ionicons name="calendar-outline" size={18} color={colors.primary} />
            <Text style={[styles.teePickerText, { color: colors.foreground }]}>
              {teeDate.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
            </Text>
          </TouchableOpacity>
          {showDatePicker && (
            <DateTimePicker
              value={teeDate}
              mode="date"
              minimumDate={new Date()}
              onChange={(_, d) => { setShowDatePicker(Platform.OS === "ios"); if (d) setTeeDate(d); }}
            />
          )}

          {/* Time picker */}
          <TouchableOpacity
            style={[styles.teePickerBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => setShowTimePicker(true)}
          >
            <Ionicons name="time-outline" size={18} color={colors.primary} />
            <Text style={[styles.teePickerText, { color: colors.foreground }]}>
              {teeTime.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false })}
            </Text>
          </TouchableOpacity>
          {showTimePicker && (
            <DateTimePicker
              value={teeTime}
              mode="time"
              is24Hour={true}
              minuteInterval={5}
              onChange={(_, d) => { setShowTimePicker(Platform.OS === "ios"); if (d) setTeeTime(d); }}
            />
          )}

          {/* Search button */}
          <TouchableOpacity
            style={[styles.teeSearchBtn, { backgroundColor: colors.primary }]}
            onPress={() => { Haptics.selectionAsync(); handleTeeTimeSearch(); }}
            disabled={teeSearching}
          >
            {teeSearching ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="search" size={18} color="#fff" />
                <Text style={styles.teeSearchBtnText}>Search Nearby Tee Times</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Results */}
          {teeSearchMeta && teeResults && (
            <Text style={[styles.teeWindowText, { color: colors.mutedForeground }]}>
              Showing times from {teeSearchMeta.time_window?.from} to {teeSearchMeta.time_window?.to} within {teeSearchMeta.radius_km}km
            </Text>
          )}

          {teeResults !== null && teeResults.length === 0 && !teeSearching && (
            <View style={styles.teeEmpty}>
              <Ionicons name="golf-outline" size={36} color={colors.mutedForeground} />
              <Text style={[styles.teeEmptyText, { color: colors.mutedForeground }]}>No available tee times found nearby</Text>
              <Text style={[styles.teeEmptySubText, { color: colors.mutedForeground }]}>Try a different date or time</Text>
            </View>
          )}

          {teeResults && teeResults.length > 0 && (
            <FlatList
              data={teeResults}
              keyExtractor={(item) => String(item.club_id)}
              style={{ flex: 1, marginTop: 12 }}
              contentContainerStyle={{ paddingBottom: 40 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.teeClubCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setShowTeeSearch(false);
                    setTeeResults(null);
                    router.push({ pathname: "/club/[id]", params: { id: item.club_id, date: teeSearchMeta?.date } });
                  }}
                >
                  <View style={styles.teeClubHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.teeClubName, { color: colors.foreground }]}>{item.club_name}</Text>
                      <Text style={[styles.teeClubLoc, { color: colors.mutedForeground }]}>
                        {item.club_location} · {item.distance_km}km away
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
                  </View>
                  <View style={styles.teeSlots}>
                    {item.slots.map((slot: any) => (
                      <View key={slot.slot_id} style={[styles.teeSlotChip, { backgroundColor: colors.primary + "15" }]}>
                        <Text style={[styles.teeSlotTime, { color: colors.primary }]}>
                          {String(slot.tee_time).slice(0, 5)}
                        </Text>
                        <Text style={[styles.teeSlotAvail, { color: colors.mutedForeground }]}>
                          {slot.available_slots} open
                        </Text>
                      </View>
                    ))}
                  </View>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </Modal>

      {/* Banners */}
      {featuredOnly && (
        <View style={[styles.banner, { backgroundColor: "#c8a84b18" }]}>
          <Ionicons name="star" size={14} color="#c8a84b" />
          <Text style={[styles.bannerText, { color: "#9a7a2a" }]}>
            Showing featured clubs only
          </Text>
          <TouchableOpacity onPress={() => {
            Haptics.selectionAsync();
            featuredRef.current = false;
            setFeaturedOnly(false);
            doSearch(search, province);
          }}>
            <Ionicons name="close-circle" size={16} color="#c8a84b" />
          </TouchableOpacity>
        </View>
      )}
      {locationError ? (
        <View style={[styles.banner, { backgroundColor: "#fff3cd" }]}>
          <Ionicons name="warning-outline" size={14} color="#856404" />
          <Text style={styles.bannerText}>{locationError}</Text>
        </View>
      ) : sortedByDistance ? (
        <View style={[styles.banner, { backgroundColor: colors.primary + "18" }]}>
          <Ionicons name="location" size={14} color={colors.primary} />
          <Text style={[styles.bannerText, { color: colors.primary }]}>
            Sorted by distance from your location
          </Text>
          <TouchableOpacity onPress={() => { Haptics.selectionAsync(); handleLocationBtn(); }}>
            <Ionicons name="close-circle" size={16} color={colors.primary} />
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Province chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, alignItems: "center", flexDirection: "row", gap: 8 }}
        style={{ flexGrow: 0, flexShrink: 0, height: 52 }}
        keyboardShouldPersistTaps="handled"
      >
        {PROVINCES.map((item) => {
          const active = item === province;
          const count = counts[item];
          return (
            <TouchableOpacity
              key={item}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? colors.primary : colors.card,
                  borderColor: active ? colors.primary : colors.border,
                },
              ]}
              onPress={() => {
                Haptics.selectionAsync();
                setProvince(item);
              }}
              activeOpacity={0.75}
            >
              <Text style={[styles.chipText, { color: active ? "#fff" : colors.foreground }]}>
                {item}
              </Text>
              {count != null && (
                <View style={[styles.countBadge, { backgroundColor: active ? "rgba(255,255,255,0.25)" : colors.primary + "18" }]}>
                  <Text style={[styles.countText, { color: active ? "#fff" : colors.primary }]}>
                    {count}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Results count */}
      {!loading && total > 0 && (
        <Text style={[styles.resultCount, { color: colors.mutedForeground }]}>
          {clubs.length < total
            ? `Showing ${clubs.length} of ${total} club${total !== 1 ? "s" : ""}`
            : `${total} club${total !== 1 ? "s" : ""}`}
          {province !== "All" ? ` in ${province}` : ""}
          {search ? ` matching "${search}"` : ""}
        </Text>
      )}

      {/* List */}
      {loading ? (
        <View style={styles.center}>
          <GolfBallLoader />
        </View>
      ) : clubs.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="golf-outline" size={48} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No clubs found</Text>
          <Text style={[styles.emptySubText, { color: colors.mutedForeground }]}>
            Try a different search or province
          </Text>
        </View>
      ) : (
        <FlatList
          data={clubs}
          keyExtractor={(item) => item.id.toString()}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: Platform.OS === "web" ? 140 : 74 }}
          renderItem={({ item }) => (
            <ClubCard
              club={item}
              horizontal
              onPress={() => {
                Haptics.selectionAsync();
                router.push({ pathname: "/club/[id]", params: { id: item.id } });
              }}
            />
          )}
          showsVerticalScrollIndicator={false}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={listFooter}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingBottom: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 50,
  },
  searchInput: { flex: 1, minWidth: 0, fontSize: 15, fontFamily: "Inter_400Regular" },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    flexShrink: 0,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginHorizontal: 16,
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  bannerText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", color: "#856404" },
  chip: {
    borderRadius: 20,
    paddingHorizontal: 12,
    height: 36,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  chipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  countBadge: {
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 24,
    alignItems: "center",
  },
  countText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  resultCount: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  emptyText: { fontSize: 18, fontFamily: "Inter_600SemiBold", marginTop: 8 },
  emptySubText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  footerLoader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
  },
  footerText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  footerEnd: {
    textAlign: "center",
    paddingVertical: 16,
  },
  // Tee time search styles
  teeModal: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  teeModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  teeModalTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
  },
  teeLabel: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginBottom: 16,
  },
  teePickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
  },
  teePickerText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  teeSearchBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 8,
    marginBottom: 8,
  },
  teeSearchBtnText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  teeWindowText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 4,
  },
  teeEmpty: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    gap: 8,
  },
  teeEmptyText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  teeEmptySubText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  teeClubCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  teeClubHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  teeClubName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  teeClubLoc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  teeSlots: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  teeSlotChip: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: "center",
  },
  teeSlotTime: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  teeSlotAvail: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
  },
});
