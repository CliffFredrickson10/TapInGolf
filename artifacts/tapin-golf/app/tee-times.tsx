import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import TeeTimeSlot, { TeeTime } from "@/components/TeeTimeSlot";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/lib/api";

interface Club {
  id: number;
  name: string;
  province: string;
  price: number;
  price_9: number | null;
  cart_available: boolean;
  cart_compulsory: boolean;
  cart_price: number | null;
  range_balls_enabled?: boolean;
  range_balls_price?: number | null;
  club_hire_enabled?: boolean;
  club_hire_price?: number | null;
  stitch_enabled?: boolean;
  prepaid_enabled?: boolean;
  voucher_enabled?: boolean;
  pay_at_club_enabled?: boolean;
}

function fmtDisplayDate(dateStr: string) {
  try {
    return new Date(dateStr + "T00:00:00").toLocaleDateString("en-ZA", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    });
  } catch { return dateStr; }
}

export default function TeeTimesScreen() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const { user } = useAuth();
  const {
    club_id, club_name: clubNameParam,
    date, event_id, event_name, event_holes,
  } = useLocalSearchParams<{
    club_id: string;
    club_name?: string;
    date: string;
    event_id?: string;
    event_name?: string;
    event_holes?: string;
  }>();

  const [club, setClub]             = useState<Club | null>(null);
  const [teeTimes, setTeeTimes]     = useState<TeeTime[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<TeeTime | null>(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const [clubData, slotsData] = await Promise.all([
        apiFetch(`/clubs/${club_id}`, user?.token),
        apiFetch(`/clubs/${club_id}/tee-times?date=${date}`, user?.token),
      ]);
      setClub(clubData.club);
      setTeeTimes(slotsData.tee_times ?? []);
    } catch (e: any) {
      setError(e.message ?? "Failed to load tee times");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, [club_id, date]);

  const handleBook = () => {
    if (!user) { router.push("/(auth)/login"); return; }
    if (!club || !selectedSlot) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({
      pathname: "/booking/new",
      params: {
        club_id:             club.id,
        club_name:           club.name,
        tee_time_id:         selectedSlot.id,
        time:                selectedSlot.time,
        date,
        price:               selectedSlot.price,
        price_9:             selectedSlot.price_9 != null ? String(selectedSlot.price_9) : "",
        promo_price:         selectedSlot.promotional_price ?? "",
        available:           selectedSlot.available_slots,
        total_slots:         selectedSlot.total_slots,
        cart_available:      club.cart_available  ? "1" : "0",
        cart_compulsory:     club.cart_compulsory ? "1" : "0",
        cart_price:          club.cart_price ? String(club.cart_price) : "",
        range_balls_enabled: club.range_balls_enabled ? "1" : "0",
        range_balls_price:   club.range_balls_price ? String(club.range_balls_price) : "",
        club_hire_enabled:   club.club_hire_enabled ? "1" : "0",
        club_hire_price:     club.club_hire_price ? String(club.club_hire_price) : "",
        stitch_enabled:      club.stitch_enabled  === false ? "0" : "1",
        prepaid_enabled:     club.prepaid_enabled === false ? "0" : "1",
        voucher_enabled:     club.voucher_enabled  === false ? "0" : "1",
        pay_at_club_enabled: club.pay_at_club_enabled ? "1" : "0",
        event_id:            event_id ?? "",
        event_name:          event_name ?? "",
        event_holes:         event_holes ?? "",
      },
    });
  };

  const displayName = club?.name ?? clubNameParam ?? "Club";

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.primary, paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle} numberOfLines={1}>{displayName}</Text>
          {event_name ? (
            <Text style={styles.headerSub} numberOfLines={1}>{event_name}</Text>
          ) : null}
        </View>
      </View>

      {/* Date banner */}
      <View style={[styles.dateBanner, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Ionicons name="calendar-outline" size={15} color={colors.primary} />
        <Text style={[styles.dateText, { color: colors.foreground }]}>{fmtDisplayDate(date)}</Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Loading tee times…</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Ionicons name="warning-outline" size={36} color={colors.mutedForeground} />
          <Text style={[styles.errorText, { color: colors.mutedForeground }]}>{error}</Text>
          <TouchableOpacity style={[styles.retryBtn, { borderColor: colors.primary }]} onPress={() => load()}>
            <Text style={[styles.retryText, { color: colors.primary }]}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={colors.primary} />}
        >
          {/* Section title */}
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Available Tee Times</Text>
            <Text style={[styles.sectionSub, { color: colors.mutedForeground }]}>
              {teeTimes.length > 0 ? `${teeTimes.length} slot${teeTimes.length !== 1 ? "s" : ""} available` : ""}
            </Text>
          </View>

          {teeTimes.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="time-outline" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No tee times available</Text>
              <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                There are no available slots for this date. Try visiting the club page to check other dates.
              </Text>
              <TouchableOpacity
                style={[styles.altBtn, { borderColor: colors.primary }]}
                onPress={() => router.push({ pathname: "/club/[id]", params: { id: club_id } })}
              >
                <Text style={[styles.altBtnText, { color: colors.primary }]}>View Club Page</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* Tee time grid */}
              <View style={styles.slotsGrid}>
                {teeTimes.map(slot => (
                  <TeeTimeSlot
                    key={slot.id}
                    slot={slot}
                    selected={selectedSlot?.id === slot.id}
                    onPress={() => { Haptics.selectionAsync(); setSelectedSlot(slot === selectedSlot ? null : slot); }}
                  />
                ))}
              </View>

              {/* Who's joining panel */}
              {selectedSlot && (selectedSlot.existing_players?.length ?? 0) > 0 && (
                <View style={[styles.joiningCard, { backgroundColor: colors.card, borderColor: colors.accent }]}>
                  <View style={styles.joiningHeader}>
                    <Ionicons name="people" size={16} color={colors.accent} />
                    <Text style={[styles.joiningTitle, { color: colors.foreground }]}>Already booked this slot</Text>
                    <View style={[styles.spotsChip, { backgroundColor: colors.accent + "22" }]}>
                      <Text style={[styles.spotsChipText, { color: colors.accent }]}>
                        {selectedSlot.total_slots - selectedSlot.available_slots}/{selectedSlot.total_slots} spots taken
                      </Text>
                    </View>
                  </View>
                  {selectedSlot.existing_players!.map((p, i) => (
                    <View key={i} style={[styles.joiningRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                      <View style={[styles.joiningAvatar, { backgroundColor: colors.accent }]}>
                        <Text style={styles.joiningAvatarText}>{p.name[0].toUpperCase()}</Text>
                      </View>
                      <Text style={[styles.joiningName, { color: colors.foreground }]}>{p.name}</Text>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}

          <View style={{ height: selectedSlot ? 120 : 40 }} />
        </ScrollView>
      )}

      {/* Sticky Book button */}
      {selectedSlot && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12, backgroundColor: colors.background, borderTopColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.bookBtn, { backgroundColor: colors.primary }]}
            onPress={handleBook}
            activeOpacity={0.85}
          >
            <View style={styles.bookBtnInner}>
              <View>
                <Text style={styles.bookBtnLabel}>Book {selectedSlot.time}</Text>
                <Text style={styles.bookBtnSub}>
                  {selectedSlot.available_slots} spot{selectedSlot.available_slots !== 1 ? "s" : ""} left
                  {selectedSlot.promotional_price
                    ? ` · R${Number(selectedSlot.promotional_price).toFixed(2)}`
                    : selectedSlot.price ? ` · R${Number(selectedSlot.price).toFixed(2)}` : ""}
                </Text>
              </View>
              <Ionicons name="arrow-forward-circle" size={28} color="#fff" />
            </View>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1 },
  header:       { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 14, gap: 12 },
  backBtn:      { padding: 2 },
  headerText:   { flex: 1 },
  headerTitle:  { fontSize: 17, fontFamily: "Inter_700Bold", color: "#fff" },
  headerSub:    { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.75)", marginTop: 1 },
  dateBanner:   { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 11, borderBottomWidth: 1 },
  dateText:     { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  centered:     { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  loadingText:  { fontSize: 14, fontFamily: "Inter_400Regular" },
  errorText:    { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  retryBtn:     { marginTop: 4, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5 },
  retryText:    { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  scroll:       { paddingHorizontal: 16, paddingTop: 20 },
  sectionHeader:{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 },
  sectionTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  sectionSub:   { fontSize: 13, fontFamily: "Inter_400Regular" },
  slotsGrid:    { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  emptyCard:    { alignItems: "center", gap: 10, borderRadius: 16, borderWidth: 1.5, padding: 32, marginTop: 8 },
  emptyTitle:   { fontSize: 16, fontFamily: "Inter_700Bold" },
  emptySub:     { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  altBtn:       { marginTop: 4, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5 },
  altBtnText:   { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  joiningCard:  { marginTop: 16, borderRadius: 12, borderWidth: 1.5, overflow: "hidden" },
  joiningHeader:{ flexDirection: "row", alignItems: "center", gap: 8, padding: 12 },
  joiningTitle: { flex: 1, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  spotsChip:    { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  spotsChipText:{ fontSize: 11, fontFamily: "Inter_600SemiBold" },
  joiningRow:   { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  joiningAvatar:{ width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  joiningAvatarText: { fontSize: 12, fontFamily: "Inter_700Bold", color: "#fff" },
  joiningName:  { fontSize: 14, fontFamily: "Inter_500Medium" },
  footer:       { paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1 },
  bookBtn:      { borderRadius: 16, paddingHorizontal: 20, paddingVertical: 16 },
  bookBtnInner: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  bookBtnLabel: { fontSize: 17, fontFamily: "Inter_700Bold", color: "#fff" },
  bookBtnSub:   { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.8)", marginTop: 2 },
});
