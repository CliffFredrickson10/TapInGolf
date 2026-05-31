import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/lib/api";
import { Booking } from "@/components/BookingCard";

interface BookingDetail extends Booking {
  role?: "organizer" | "invited";
  my_paid?: boolean;
  players_list?: Array<{ name: string; email: string; paid: boolean; amount: number }>;
  club_phone?: string;
  club_address?: string;
  club_latitude?: number;
  club_longitude?: number;
}

const STATUS_COLORS: Record<string, string> = {
  confirmed: "#1a5c38",
  pending: "#f57f17",
  cancelled: "#e53935",
  completed: "#546e7a",
};

export default function BookingDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [payLoading, setPayLoading]       = useState(false);
  const [payMethod, setPayMethod]         = useState<"stitch" | "wallet">("stitch");
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [payError, setPayError]           = useState<string | null>(null);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  useEffect(() => {
    if (!user) return;
    apiFetch(`/bookings/${id}`, user.token)
      .then((d) => setBooking(d.booking))
      .catch(() => {})
      .finally(() => setLoading(false));
    apiFetch("/payments/methods", user.token)
      .then((d) => setWalletBalance(parseFloat(d?.wallet?.balance ?? "0")))
      .catch(() => {});
  }, [id, user]);

  const handleCancel = async () => {
    if (!user || !booking) return;
    setCancelling(true);
    try {
      await apiFetch(`/bookings/${booking.id}/cancel`, user.token, { method: "PUT" });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setBooking((prev) => prev ? { ...prev, status: "cancelled" } : prev);
      setConfirmCancel(false);
    } catch {
      // silently fail — user can retry
    } finally {
      setCancelling(false);
    }
  };

  const handlePayShare = async () => {
    if (!user || !booking) return;
    setPayLoading(true);
    setPayError(null);
    try {
      const data = await apiFetch(`/bookings/${booking.id}/pay`, user.token, {
        method: "POST",
        body: JSON.stringify({ payment_method: payMethod }),
      });
      if (payMethod === "wallet") {
        // Wallet deducted immediately — refresh booking state
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        const fresh = await apiFetch(`/bookings/${booking.id}`, user.token);
        setBooking(fresh.booking);
        setWalletBalance(prev => prev !== null ? prev - (data.amount ?? 0) : null);
      } else if (data.payment_url) {
        // Stitch — open payment WebView
        router.push({ pathname: "/booking/payment", params: { url: data.payment_url, booking_id: booking.id, is_player_pay: "1" } });
      }
    } catch (e: any) {
      setPayError(e?.message ?? "Payment failed. Please try again.");
    } finally {
      setPayLoading(false);
    }
  };

  if (loading) {
    return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.primary} size="large" /></View>;
  }

  if (!booking) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.mutedForeground} />
        <Text style={[styles.errorText, { color: colors.foreground }]}>Booking not found</Text>
        <TouchableOpacity onPress={() => router.back()}><Text style={{ color: colors.primary }}>Go back</Text></TouchableOpacity>
      </View>
    );
  }

  const statusColor = STATUS_COLORS[booking.status] ?? colors.mutedForeground;
  const isInvited = booking.role === "invited";
  const needsPayment = isInvited && !booking.my_paid && booking.status === "confirmed";

  const formatDate = (raw: string) => {
    try {
      return new Date(raw).toLocaleDateString("en-ZA", {
        weekday: "long", day: "numeric", month: "long", year: "numeric",
      });
    } catch { return raw; }
  };
  const formatTime = (raw: string) => {
    // raw may be "HH:MM:SS" or an ISO string
    const t = String(raw).slice(0, 5);
    const [h, m] = t.split(":").map(Number);
    if (isNaN(h)) return raw;
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} showsVerticalScrollIndicator={false}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <TouchableOpacity onPress={() => router.replace("/(tabs)/bookings")}>
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Booking Details</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.content}>
        {/* Status */}
        <View style={[styles.statusCard, { backgroundColor: statusColor + "15", borderColor: statusColor + "40" }]}>
          <Ionicons
            name={booking.status === "confirmed" ? "checkmark-circle" : booking.status === "cancelled" ? "close-circle" : "time"}
            size={28}
            color={statusColor}
          />
          <View style={{ flex: 1 }}>
            <Text style={[styles.statusText, { color: statusColor }]}>
              {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
            </Text>
            <Text style={[styles.refText, { color: statusColor + "aa" }]}>Ref: {booking.booking_ref}</Text>
          </View>
          {isInvited && (
            <View style={[styles.invitedBadge, { backgroundColor: colors.accent + "22" }]}>
              <Text style={[styles.invitedText, { color: colors.accent }]}>Invited</Text>
            </View>
          )}
        </View>

        {/* Pay your share */}
        {needsPayment && (
          <View style={[styles.payCard, { backgroundColor: colors.card, borderColor: colors.accent + "55" }]}>
            <View style={styles.payCardHeader}>
              <Ionicons name="card-outline" size={20} color={colors.accent} />
              <Text style={[styles.payCardTitle, { color: colors.foreground }]}>Pay your share</Text>
              <Text style={[styles.payCardAmount, { color: colors.accent }]}>
                R{(booking.my_amount ?? 0).toFixed(2)}
              </Text>
            </View>

            {/* Stitch option */}
            <TouchableOpacity
              style={[styles.payOption, {
                backgroundColor: payMethod === "stitch" ? colors.primaryLight : colors.background,
                borderColor:     payMethod === "stitch" ? colors.primary : colors.border,
              }]}
              onPress={() => { Haptics.selectionAsync(); setPayMethod("stitch"); }}
            >
              <Ionicons name="card-outline" size={20} color={payMethod === "stitch" ? colors.primary : colors.mutedForeground} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.payOptionLabel, { color: colors.foreground }]}>Stitch</Text>
                <Text style={[styles.payOptionSub, { color: colors.mutedForeground }]}>Instant EFT, Debit/Credit card</Text>
              </View>
              {payMethod === "stitch" && <Ionicons name="checkmark-circle" size={18} color={colors.primary} />}
            </TouchableOpacity>

            {/* Wallet option — shown when balance is loaded */}
            {walletBalance !== null && (
              <TouchableOpacity
                style={[styles.payOption, {
                  backgroundColor: payMethod === "wallet" ? colors.primaryLight : colors.background,
                  borderColor:     payMethod === "wallet" ? colors.primary : colors.border,
                }]}
                onPress={() => { Haptics.selectionAsync(); setPayMethod("wallet"); }}
              >
                <Ionicons name="wallet-outline" size={20} color={payMethod === "wallet" ? colors.primary : colors.mutedForeground} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.payOptionLabel, { color: colors.foreground }]}>Wallet</Text>
                  <Text style={[styles.payOptionSub, {
                    color: walletBalance >= (booking.my_amount ?? 0) ? colors.primary : "#e53935",
                  }]}>
                    R{walletBalance.toFixed(2)} available
                    {walletBalance < (booking.my_amount ?? 0) ? " — insufficient" : ""}
                  </Text>
                </View>
                {payMethod === "wallet" && <Ionicons name="checkmark-circle" size={18} color={colors.primary} />}
              </TouchableOpacity>
            )}

            {/* Insufficient wallet notice */}
            {payMethod === "wallet" && walletBalance !== null && walletBalance < (booking.my_amount ?? 0) && (
              <View style={[styles.payOption, { backgroundColor: "#fff3e0", borderColor: colors.warning }]}>
                <Ionicons name="information-circle-outline" size={18} color={colors.warning} />
                <Text style={{ color: colors.warning, flex: 1, fontSize: 13 }}>
                  Top up your wallet in the Profile tab before paying.
                </Text>
              </View>
            )}

            {/* Error */}
            {payError && (
              <Text style={{ color: "#e53935", fontSize: 13, marginTop: 4 }}>{payError}</Text>
            )}

            <TouchableOpacity
              style={[styles.payConfirmBtn, {
                backgroundColor: (payLoading || (payMethod === "wallet" && walletBalance !== null && walletBalance < (booking.my_amount ?? 0)))
                  ? colors.muted : colors.accent,
              }]}
              onPress={handlePayShare}
              disabled={payLoading || (payMethod === "wallet" && walletBalance !== null && walletBalance < (booking.my_amount ?? 0))}
            >
              <Text style={styles.payConfirmText}>
                {payLoading
                  ? "Processing…"
                  : `Pay R${(booking.my_amount ?? 0).toFixed(2)} via ${payMethod === "wallet" ? "Wallet" : "Stitch"}`}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {isInvited && booking.my_paid && (
          <View style={[styles.paidBanner, { backgroundColor: colors.success + "18", borderColor: colors.success + "33" }]}>
            <Ionicons name="checkmark-circle" size={20} color={colors.success} />
            <Text style={[styles.paidBannerText, { color: colors.success }]}>Your share is paid</Text>
          </View>
        )}

        {/* Details */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>{booking.club_name}</Text>
          <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>{booking.club_location}</Text>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          {[
            { icon: "calendar-outline", label: "Date", value: formatDate(booking.date) },
            { icon: "time-outline", label: "Tee Time", value: formatTime(booking.time) },
            { icon: "people-outline", label: "Players", value: `${booking.players} player${booking.players > 1 ? "s" : ""}` },
          ].map((row) => (
            <View key={row.label} style={styles.detailRow}>
              <View style={styles.detailLeft}>
                <Ionicons name={row.icon as any} size={16} color={colors.primary} />
                <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>{row.label}</Text>
              </View>
              <Text style={[styles.detailValue, { color: colors.foreground }]}>{row.value}</Text>
            </View>
          ))}
        </View>

        {/* Directions & Contact */}
        {(booking.club_latitude || booking.club_address || booking.club_phone) && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>Getting There</Text>
            {(booking.club_latitude || booking.club_address) && (
              <TouchableOpacity
                style={[styles.contactRow, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "33" }]}
                activeOpacity={0.75}
                onPress={() => {
                  const lat = booking.club_latitude;
                  const lng = booking.club_longitude;
                  const query = lat && lng
                    ? `${lat},${lng}`
                    : encodeURIComponent((booking.club_address ?? "") || (booking.club_name + " " + booking.club_location));
                  const url = lat && lng
                    ? `https://www.google.com/maps?q=${query}`
                    : `https://www.google.com/maps/search/?api=1&query=${query}`;
                  Linking.openURL(url);
                }}
              >
                <View style={[styles.contactIcon, { backgroundColor: colors.primary }]}>
                  <Ionicons name="navigate" size={18} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.contactLabel, { color: colors.foreground }]}>Get Directions</Text>
                  <Text style={[styles.contactSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                    {booking.club_address ?? booking.club_location}
                  </Text>
                </View>
                <Ionicons name="open-outline" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}
            {booking.club_phone && (
              <TouchableOpacity
                style={[styles.contactRow, { backgroundColor: colors.accent + "12", borderColor: colors.accent + "33" }]}
                activeOpacity={0.75}
                onPress={() => Linking.openURL(`tel:${booking.club_phone}`)}
              >
                <View style={[styles.contactIcon, { backgroundColor: colors.accent }]}>
                  <Ionicons name="call" size={18} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.contactLabel, { color: colors.foreground }]}>Call Club</Text>
                  <Text style={[styles.contactSub, { color: colors.mutedForeground }]}>{booking.club_phone}</Text>
                </View>
                <Ionicons name="open-outline" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Payment */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Payment</Text>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>Total amount</Text>
            <Text style={[styles.detailValue, { color: colors.foreground }]}>R{booking.total_amount.toFixed(2)}</Text>
          </View>
          {booking.my_amount != null && booking.my_amount !== booking.total_amount && (
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>Your share</Text>
              <Text style={[styles.amountText, { color: colors.primary }]}>R{booking.my_amount.toFixed(2)}</Text>
            </View>
          )}
        </View>

        {/* Players list */}
        {booking.players_list && booking.players_list.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>Players</Text>
            {booking.players_list.map((p, i) => (
              <View key={i} style={styles.playerRow}>
                <View style={[styles.playerAvatar, { backgroundColor: colors.primaryLight }]}>
                  <Text style={[styles.playerInitial, { color: colors.primary }]}>
                    {p.name[0].toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.playerName, { color: colors.foreground }]}>{p.name}</Text>
                  <Text style={[styles.playerEmail, { color: colors.mutedForeground }]}>{p.email}</Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 3 }}>
                  <View style={[styles.paidBadge, { backgroundColor: p.paid ? colors.success + "20" : colors.warning + "20" }]}>
                    <Text style={[styles.paidText, { color: p.paid ? colors.success : colors.warning }]}>
                      {p.paid ? "Paid" : "Pending"}
                    </Text>
                  </View>
                  {p.amount > 0 && (
                    <Text style={[styles.playerAmount, { color: colors.mutedForeground }]}>R{p.amount.toFixed(2)}</Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Cancel button — organizer only */}
        {!isInvited && booking.status === "confirmed" && (
          confirmCancel ? (
            <View style={[styles.confirmRow, { backgroundColor: colors.card, borderColor: colors.destructive }]}>
              <Text style={[styles.confirmText, { color: colors.foreground }]}>Cancel this booking?</Text>
              {booking.payment_method === "prepaid" && (
                <View style={{ flexDirection: "row", gap: 5, alignItems: "flex-start", backgroundColor: "#fff3cd", borderRadius: 8, padding: 8, marginVertical: 4 }}>
                  <Ionicons name="warning-outline" size={14} color="#a07c10" style={{ marginTop: 1 }} />
                  <Text style={{ flex: 1, fontSize: 12, color: "#7d5a00", lineHeight: 17 }}>
                    The prepaid round used for this booking is non-refundable and will not be returned to your balance.
                  </Text>
                </View>
              )}
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: colors.muted }]} onPress={() => setConfirmCancel(false)}>
                  <Text style={[styles.confirmBtnText, { color: colors.foreground }]}>Keep it</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: colors.destructive }]} onPress={handleCancel} disabled={cancelling}>
                  <Text style={[styles.confirmBtnText, { color: "#fff" }]}>{cancelling ? "…" : "Cancel"}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.cancelBtn, { borderColor: colors.destructive }]}
              onPress={() => setConfirmCancel(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="close-circle-outline" size={20} color={colors.destructive} />
              <Text style={[styles.cancelText, { color: colors.destructive }]}>Cancel Booking</Text>
            </TouchableOpacity>
          )
        )}
        <TouchableOpacity
          style={[styles.doneBtn, { backgroundColor: colors.primary }]}
          onPress={() => router.replace("/(tabs)/")}
          activeOpacity={0.85}
        >
          <Text style={styles.doneBtnText}>Done</Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: Platform.OS === "web" ? 50 : 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 16 },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  content: { padding: 20, gap: 14 },
  statusCard: { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 14, borderWidth: 1, padding: 16 },
  statusText: { fontSize: 18, fontFamily: "Inter_700Bold" },
  refText: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  invitedBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  invitedText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  payCard: { borderRadius: 16, borderWidth: 1.5, padding: 16, gap: 10 },
  payCardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
  payCardTitle: { fontSize: 16, fontFamily: "Inter_700Bold", flex: 1 },
  payCardAmount: { fontSize: 18, fontFamily: "Inter_700Bold" },
  payOption: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 12, borderWidth: 1.5, padding: 12 },
  payOptionLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  payOptionSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  payConfirmBtn: { height: 50, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 4 },
  payConfirmText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 15 },
  paidBanner: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, borderWidth: 1, padding: 12 },
  paidBannerText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  card: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 10 },
  cardTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  cardSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: -4 },
  divider: { height: 1, marginVertical: 4 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  detailLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  detailLabel: { fontSize: 14, fontFamily: "Inter_400Regular" },
  detailValue: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  amountText: { fontSize: 18, fontFamily: "Inter_700Bold" },
  playerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  playerAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  playerInitial: { fontSize: 14, fontFamily: "Inter_700Bold" },
  playerName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  playerEmail: { fontSize: 12, fontFamily: "Inter_400Regular" },
  playerAmount: { fontSize: 11, fontFamily: "Inter_400Regular" },
  paidBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  paidText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  confirmRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 14, borderWidth: 1.5, padding: 14 },
  confirmText: { fontSize: 14, fontFamily: "Inter_500Medium", flex: 1 },
  confirmBtn: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9 },
  confirmBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  cancelBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1.5, borderRadius: 14, height: 50 },
  cancelText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  errorText: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  doneBtn: { height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  doneBtnText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 16 },
  contactRow: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 12, borderWidth: 1, padding: 12 },
  contactIcon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  contactLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  contactSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
});
