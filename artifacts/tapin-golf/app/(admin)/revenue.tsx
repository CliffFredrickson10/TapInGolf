import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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

// ─── Types ────────────────────────────────────────────────────────
type Summary = {
  platform_fee_pct:   number;
  total_bookings:     number;
  total_collected:    number;
  total_platform_fee: number;
  total_club_payouts: number;
};

type Booking = {
  id: number;
  booking_ref: string;
  total_amount: number;
  platform_fee: number;
  club_amount: number;
  payment_method: string;
  status: string;
  created_at: string;
  club_name: string;
  golfer_name: string;
  golfer_email: string;
  date: string;
  time: string;
};

type ClubRow = {
  id: number;
  name: string;
  location: string;
  province: string;
  total_bookings: number;
  gross_revenue: number;
  platform_fees: number;
  club_earnings: number;
};

const ZAR = (n: number) =>
  `R ${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PAY_ICONS: Record<string, string> = {
  payfast:     "card",
  google_pay:  "logo-google",
  apple_pay:   "logo-apple",
};

// ═════════════════════════════════════════════════════════════════
export default function RevenueScreen() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const { user } = useAuth();

  const isPlatformAdmin = user?.role === "club_admin" && user?.club_id === null;

  type Tab = "summary" | "bookings" | "clubs";
  const [tab, setTab]             = useState<Tab>("summary");
  const [refreshing, setRefreshing] = useState(false);

  // Summary
  const [summary, setSummary]     = useState<Summary | null>(null);
  const [sumLoading, setSumLoading] = useState(false);
  const [editingFee, setEditingFee] = useState(false);
  const [feeInput, setFeeInput]   = useState("");
  const [savingFee, setSavingFee] = useState(false);

  // Bookings
  const [bookings, setBookings]   = useState<Booking[]>([]);
  const [bkTotal, setBkTotal]     = useState(0);
  const [bkOffset, setBkOffset]   = useState(0);
  const [bkLoading, setBkLoading] = useState(false);
  const BK_LIMIT = 20;

  // Clubs
  const [clubs, setClubs]         = useState<ClubRow[]>([]);
  const [clLoading, setClLoading] = useState(false);

  // ── Fetchers ────────────────────────────────────────────────────
  const fetchSummary = useCallback(async () => {
    if (!user) return;
    setSumLoading(true);
    try {
      const data = await apiFetch("/admin/revenue/summary", user.token);
      setSummary(data);
      setFeeInput(String(data.platform_fee_pct ?? 5));
    } catch (err: any) {
      Alert.alert("Error", err.message ?? "Failed to load summary");
    } finally { setSumLoading(false); }
  }, [user]);

  const fetchBookings = useCallback(async (offset = 0, append = false) => {
    if (!user) return;
    setBkLoading(true);
    try {
      const data = await apiFetch(`/admin/revenue/bookings?limit=${BK_LIMIT}&offset=${offset}`, user.token);
      setBookings((prev) => append ? [...prev, ...(data.bookings ?? [])] : (data.bookings ?? []));
      setBkTotal(data.total ?? 0);
      setBkOffset(offset);
    } catch {} finally { setBkLoading(false); }
  }, [user]);

  const fetchClubs = useCallback(async () => {
    if (!user || !isPlatformAdmin) return;
    setClLoading(true);
    try {
      const data = await apiFetch("/admin/revenue/clubs", user.token);
      setClubs(data.clubs ?? []);
    } catch {} finally { setClLoading(false); }
  }, [user, isPlatformAdmin]);

  // Initial load
  useEffect(() => { fetchSummary(); }, [fetchSummary]);
  useEffect(() => { if (tab === "bookings") fetchBookings(0); }, [tab, fetchBookings]);
  useEffect(() => { if (tab === "clubs") fetchClubs(); }, [tab, fetchClubs]);

  const onRefresh = async () => {
    setRefreshing(true);
    if (tab === "summary")  await fetchSummary();
    if (tab === "bookings") await fetchBookings(0);
    if (tab === "clubs")    await fetchClubs();
    setRefreshing(false);
  };

  // ── Save platform fee ───────────────────────────────────────────
  const saveFee = async () => {
    if (!user) return;
    const pct = parseFloat(feeInput);
    if (isNaN(pct) || pct < 0 || pct > 50) {
      Alert.alert("Invalid", "Fee must be between 0 and 50 %"); return;
    }
    setSavingFee(true);
    try {
      await apiFetch("/admin/revenue/fee", user.token, {
        method: "PUT",
        body: JSON.stringify({ fee_pct: pct }),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditingFee(false);
      fetchSummary();
    } catch (err: any) {
      Alert.alert("Error", err.message);
    } finally { setSavingFee(false); }
  };

  // ── TABS ─────────────────────────────────────────────────────────
  const tabs: { key: Tab; label: string }[] = [
    { key: "summary",  label: "Summary" },
    { key: "bookings", label: "Bookings" },
    ...(isPlatformAdmin ? [{ key: "clubs" as Tab, label: "All Clubs" }] : []),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12, backgroundColor: colors.primary }]}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Revenue Dashboard</Text>
          <Text style={styles.headerSub}>
            {isPlatformAdmin ? "Platform-wide view" : "Your club's earnings"}
          </Text>
        </View>
        <Ionicons name="bar-chart" size={22} color="rgba(255,255,255,0.7)" />
      </View>

      {/* Tabs */}
      <View style={[styles.tabRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {tabs.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, tab === t.key && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => { setTab(t.key); Haptics.selectionAsync(); }}
          >
            <Text style={[styles.tabText, { color: tab === t.key ? colors.primary : colors.mutedForeground }]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Summary Tab ─────────────────────────────────────────── */}
      {tab === "summary" && (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          showsVerticalScrollIndicator={false}
        >
          {sumLoading && !summary ? (
            <View style={styles.center}><GolfBallLoader /></View>
          ) : summary ? (
            <>
              {/* KPI grid */}
              <View style={styles.kpiGrid}>
                <KpiCard label="Total Collected" value={ZAR(summary.total_collected)} icon="wallet" iconColor="#1976d2" colors={colors} />
                <KpiCard label="Club Payouts"    value={ZAR(summary.total_club_payouts)} icon="business" iconColor="#43a047" colors={colors} />
                <KpiCard label="Platform Fees"   value={ZAR(summary.total_platform_fee)} icon="trending-up" iconColor={colors.accent} colors={colors} />
                <KpiCard label="Bookings"        value={String(summary.total_bookings)} icon="calendar-number" iconColor="#8e24aa" colors={colors} />
              </View>

              {/* Revenue split visualisation */}
              {summary.total_collected > 0 && (
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.cardTitle, { color: colors.foreground }]}>Revenue Split</Text>
                  <SplitBar
                    clubPct={(summary.total_club_payouts / summary.total_collected) * 100}
                    feePct={(summary.total_platform_fee / summary.total_collected) * 100}
                    colors={colors}
                  />
                  <View style={styles.splitLegend}>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: "#43a047" }]} />
                      <Text style={[styles.legendText, { color: colors.mutedForeground }]}>
                        Club ({((summary.total_club_payouts / summary.total_collected) * 100).toFixed(1)}%)
                      </Text>
                    </View>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: colors.accent }]} />
                      <Text style={[styles.legendText, { color: colors.mutedForeground }]}>
                        Platform ({((summary.total_platform_fee / summary.total_collected) * 100).toFixed(1)}%)
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Platform fee setting (platform admin only) */}
              {isPlatformAdmin && (
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.cardHeaderRow}>
                    <Text style={[styles.cardTitle, { color: colors.foreground }]}>Platform Fee</Text>
                    {!editingFee && (
                      <TouchableOpacity onPress={() => setEditingFee(true)} style={[styles.editBtn, { backgroundColor: colors.primary + "18" }]}>
                        <Ionicons name="pencil" size={14} color={colors.primary} />
                        <Text style={[styles.editBtnText, { color: colors.primary }]}>Edit</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {editingFee ? (
                    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
                      <View style={styles.feeEditRow}>
                        <TextInput
                          style={[styles.feeInput, { borderColor: colors.primary, color: colors.foreground, backgroundColor: colors.background }]}
                          value={feeInput}
                          onChangeText={setFeeInput}
                          keyboardType="decimal-pad"
                          autoFocus
                        />
                        <Text style={[styles.feePctLabel, { color: colors.mutedForeground }]}>%</Text>
                        <TouchableOpacity
                          style={[styles.feeSaveBtn, { backgroundColor: colors.primary }]}
                          onPress={saveFee}
                          disabled={savingFee}
                        >
                          {savingFee
                            ? <ActivityIndicator size="small" color="#fff" />
                            : <Text style={styles.feeSaveBtnText}>Save</Text>}
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => { setEditingFee(false); setFeeInput(String(summary.platform_fee_pct)); }}>
                          <Ionicons name="close" size={22} color={colors.mutedForeground} />
                        </TouchableOpacity>
                      </View>
                      <Text style={[styles.feeHint, { color: colors.mutedForeground }]}>
                        Platform takes {feeInput || "0"}% of every booking. Applied to all future bookings.
                      </Text>
                    </KeyboardAvoidingView>
                  ) : (
                    <View style={styles.feeDisplayRow}>
                      <Text style={[styles.feeValue, { color: colors.primary }]}>{summary.platform_fee_pct}%</Text>
                      <Text style={[styles.feeDesc, { color: colors.mutedForeground }]}>
                        of every booking goes to the platform
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* Quick stats */}
              {summary.total_bookings > 0 && (
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.cardTitle, { color: colors.foreground }]}>Averages</Text>
                  <StatRow label="Avg. booking value"  value={ZAR(summary.total_collected / summary.total_bookings)} colors={colors} />
                  <StatRow label="Avg. platform fee"   value={ZAR(summary.total_platform_fee / summary.total_bookings)} colors={colors} />
                  <StatRow label="Avg. club payout"    value={ZAR(summary.total_club_payouts / summary.total_bookings)} colors={colors} />
                </View>
              )}
            </>
          ) : null}
        </ScrollView>
      )}

      {/* ── Bookings Tab ─────────────────────────────────────────── */}
      {tab === "bookings" && (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          showsVerticalScrollIndicator={false}
          onScroll={({ nativeEvent }) => {
            const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
            const nearBottom = contentOffset.y + layoutMeasurement.height >= contentSize.height - 120;
            if (nearBottom && !bkLoading && bookings.length < bkTotal) {
              fetchBookings(bkOffset + BK_LIMIT, true);
            }
          }}
          scrollEventThrottle={200}
        >
          {bkLoading && bookings.length === 0 ? (
            <View style={styles.center}><GolfBallLoader /></View>
          ) : bookings.length === 0 ? (
            <View style={styles.center}>
              <Ionicons name="receipt-outline" size={48} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No confirmed bookings yet</Text>
            </View>
          ) : (
            <>
              <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>
                {bkTotal} booking{bkTotal !== 1 ? "s" : ""}
              </Text>
              {bookings.map((b) => {
                const dateStr = b.date ? String(b.date).split("T")[0] : "";
                const timeStr = b.time ? String(b.time).slice(0, 5) : "";
                const payIcon = PAY_ICONS[b.payment_method] ?? "card-outline";
                return (
                  <View key={b.id} style={[styles.bookingCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={styles.bookingTop}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.bookingRef, { color: colors.foreground }]}>{b.booking_ref}</Text>
                        <Text style={[styles.bookingMeta, { color: colors.mutedForeground }]}>
                          {b.golfer_name} · {b.club_name}
                        </Text>
                        <Text style={[styles.bookingDate, { color: colors.mutedForeground }]}>
                          {dateStr} at {timeStr}
                        </Text>
                      </View>
                      <View style={{ alignItems: "flex-end", gap: 4 }}>
                        <Text style={[styles.bookingAmount, { color: colors.foreground }]}>{ZAR(b.total_amount)}</Text>
                        <Ionicons name={payIcon} size={16} color={colors.mutedForeground} />
                      </View>
                    </View>
                    <View style={[styles.bookingFeeRow, { borderTopColor: colors.border }]}>
                      <View style={styles.feeChip}>
                        <Text style={[styles.feeChipLabel, { color: colors.mutedForeground }]}>Club</Text>
                        <Text style={[styles.feeChipValue, { color: "#43a047" }]}>{ZAR(b.club_amount)}</Text>
                      </View>
                      <View style={styles.feeChip}>
                        <Text style={[styles.feeChipLabel, { color: colors.mutedForeground }]}>Platform</Text>
                        <Text style={[styles.feeChipValue, { color: colors.accent }]}>{ZAR(b.platform_fee)}</Text>
                      </View>
                    </View>
                  </View>
                );
              })}
              {bkLoading && <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />}
              {!bkLoading && bookings.length < bkTotal && (
                <TouchableOpacity
                  style={[styles.loadMoreBtn, { borderColor: colors.border }]}
                  onPress={() => fetchBookings(bkOffset + BK_LIMIT, true)}
                >
                  <Text style={[styles.loadMoreText, { color: colors.primary }]}>Load more</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </ScrollView>
      )}

      {/* ── Clubs Tab (platform admin only) ─────────────────────── */}
      {tab === "clubs" && (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          showsVerticalScrollIndicator={false}
        >
          {clLoading ? (
            <View style={styles.center}><GolfBallLoader /></View>
          ) : clubs.length === 0 ? (
            <View style={styles.center}>
              <Ionicons name="business-outline" size={48} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No club data yet</Text>
            </View>
          ) : (
            clubs.map((c, i) => (
              <View key={c.id} style={[styles.clubCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.clubRankRow}>
                  <View style={[styles.rankBadge, { backgroundColor: i === 0 ? colors.accent + "22" : colors.primary + "12" }]}>
                    <Text style={[styles.rankText, { color: i === 0 ? colors.accent : colors.primary }]}>#{i + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.clubName, { color: colors.foreground }]}>{c.name}</Text>
                    <Text style={[styles.clubLocation, { color: colors.mutedForeground }]}>{c.location}, {c.province}</Text>
                  </View>
                  <Text style={[styles.clubEarnings, { color: "#43a047" }]}>{ZAR(c.club_earnings)}</Text>
                </View>
                <View style={[styles.clubStatsRow, { borderTopColor: colors.border }]}>
                  <MiniStat label="Bookings"  value={String(c.total_bookings)} colors={colors} />
                  <MiniStat label="Gross"     value={ZAR(c.gross_revenue)}  colors={colors} />
                  <MiniStat label="Plat. fee" value={ZAR(c.platform_fees)}  colors={colors} />
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────
function KpiCard({ label, value, icon, iconColor, colors }: {
  label: string; value: string; icon: any; iconColor: string; colors: any;
}) {
  return (
    <View style={[kpiStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[kpiStyles.iconBox, { backgroundColor: iconColor + "15" }]}>
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <Text style={[kpiStyles.value, { color: colors.foreground }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={[kpiStyles.label, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

function SplitBar({ clubPct, feePct, colors }: { clubPct: number; feePct: number; colors: any }) {
  return (
    <View style={[splitStyles.bar, { backgroundColor: colors.border }]}>
      <View style={[splitStyles.segment, { flex: clubPct, backgroundColor: "#43a047" }]} />
      <View style={[splitStyles.segment, { flex: feePct,  backgroundColor: colors.accent }]} />
    </View>
  );
}

function StatRow({ label, value, colors }: { label: string; value: string; colors: any }) {
  return (
    <View style={statStyles.row}>
      <Text style={[statStyles.label, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[statStyles.value, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

function MiniStat({ label, value, colors }: { label: string; value: string; colors: any }) {
  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <Text style={[miniStyles.value, { color: colors.foreground }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={[miniStyles.label, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────
const styles = StyleSheet.create({
  header:         { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingBottom: 16 },
  headerTitle:    { color: "#fff", fontSize: 18, fontFamily: "Inter_700Bold" },
  headerSub:      { color: "rgba(255,255,255,0.75)", fontSize: 12, fontFamily: "Inter_400Regular" },
  tabRow:         { flexDirection: "row", borderBottomWidth: 1 },
  tab:            { flex: 1, alignItems: "center", paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabText:        { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  center:         { paddingTop: 60, alignItems: "center", gap: 12 },
  emptyText:      { fontSize: 15, fontFamily: "Inter_400Regular" },
  totalLabel:     { fontSize: 12, fontFamily: "Inter_500Medium" },
  kpiGrid:        { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  card:           { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  cardTitle:      { fontSize: 15, fontFamily: "Inter_700Bold" },
  cardHeaderRow:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  editBtn:        { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5 },
  editBtnText:    { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  feeEditRow:     { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  feeInput:       { width: 72, height: 44, borderWidth: 2, borderRadius: 10, textAlign: "center", fontSize: 20, fontFamily: "Inter_700Bold" },
  feePctLabel:    { fontSize: 18, fontFamily: "Inter_700Bold" },
  feeSaveBtn:     { borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  feeSaveBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  feeHint:        { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 8 },
  feeDisplayRow:  { flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 4 },
  feeValue:       { fontSize: 32, fontFamily: "Inter_700Bold" },
  feeDesc:        { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  splitLegend:    { flexDirection: "row", gap: 16, marginTop: 8 },
  legendItem:     { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot:      { width: 10, height: 10, borderRadius: 5 },
  legendText:     { fontSize: 12, fontFamily: "Inter_400Regular" },
  bookingCard:    { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  bookingTop:     { flexDirection: "row", gap: 10, padding: 12 },
  bookingRef:     { fontSize: 14, fontFamily: "Inter_700Bold" },
  bookingMeta:    { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  bookingDate:    { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  bookingAmount:  { fontSize: 15, fontFamily: "Inter_700Bold" },
  bookingFeeRow:  { flexDirection: "row", borderTopWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  feeChip:        { flex: 1, alignItems: "center", gap: 1 },
  feeChipLabel:   { fontSize: 11, fontFamily: "Inter_400Regular" },
  feeChipValue:   { fontSize: 13, fontFamily: "Inter_700Bold" },
  loadMoreBtn:    { borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  loadMoreText:   { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  clubCard:       { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  clubRankRow:    { flexDirection: "row", alignItems: "center", gap: 10, padding: 12 },
  rankBadge:      { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  rankText:       { fontSize: 13, fontFamily: "Inter_700Bold" },
  clubName:       { fontSize: 14, fontFamily: "Inter_700Bold" },
  clubLocation:   { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  clubEarnings:   { fontSize: 15, fontFamily: "Inter_700Bold" },
  clubStatsRow:   { flexDirection: "row", borderTopWidth: 1, paddingVertical: 10 },
});

const kpiStyles = StyleSheet.create({
  card:    { width: "47%", borderRadius: 14, borderWidth: 1, padding: 12, gap: 6, alignItems: "flex-start" },
  iconBox: { width: 36, height: 36, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  value:   { fontSize: 18, fontFamily: "Inter_700Bold", width: "100%" },
  label:   { fontSize: 11, fontFamily: "Inter_400Regular" },
});

const splitStyles = StyleSheet.create({
  bar:     { height: 14, borderRadius: 7, flexDirection: "row", overflow: "hidden", marginTop: 8 },
  segment: { height: 14 },
});

const statStyles = StyleSheet.create({
  row:   { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  label: { fontSize: 13, fontFamily: "Inter_400Regular" },
  value: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
});

const miniStyles = StyleSheet.create({
  value: { fontSize: 13, fontFamily: "Inter_700Bold" },
  label: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
});
