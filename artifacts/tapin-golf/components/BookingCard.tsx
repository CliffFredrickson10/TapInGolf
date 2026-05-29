import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";

export interface Booking {
  id: number;
  club_name: string;
  club_location: string;
  date: string;
  time: string;
  players: number;
  total_amount: number;
  status: "confirmed" | "pending" | "cancelled" | "completed";
  booking_ref: string;
  my_amount?: number;
  role?: "organizer" | "invited";
  my_paid?: boolean;
  split_bill?: boolean | number;
  payment_method?: string;
}

interface Props {
  booking: Booking;
  onPress: () => void;
  onPayNow?: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  confirmed: "#1a5c38",
  pending: "#f57f17",
  cancelled: "#e53935",
  completed: "#546e7a",
};

const STATUS_BG: Record<string, string> = {
  confirmed: "#e8f5ee",
  pending: "#fff8e1",
  cancelled: "#ffebee",
  completed: "#eceff1",
};

function formatDate(raw: string | null | undefined): string {
  if (!raw) return "Date unavailable";
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return raw;
  }
}

function formatTime(raw: string | null | undefined): string {
  if (!raw) return "—";
  return String(raw).slice(0, 5);
}

export default function BookingCard({ booking, onPress, onPayNow }: Props) {
  const colors = useColors();
  const statusColor = STATUS_COLORS[booking.status] ?? colors.mutedForeground;
  const statusBg = STATUS_BG[booking.status] ?? colors.muted;

  const isInvited = booking.role === "invited";
  const needsPayment = isInvited && !booking.my_paid && booking.status === "confirmed";

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: needsPayment ? colors.accent : colors.border },
        needsPayment && styles.cardHighlight,
      ]}
    >
      {/* ── Header: club info (left) | players + status (right) ── */}
      <View style={styles.header}>
        <View style={styles.clubInfo}>
          <Text style={[styles.clubName, { color: colors.foreground }]} numberOfLines={1}>
            {booking.club_name}
          </Text>
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={12} color={colors.mutedForeground} />
            <Text style={[styles.location, { color: colors.mutedForeground }]} numberOfLines={1}>
              {" "}{booking.club_location}
            </Text>
          </View>
        </View>

        <View style={styles.rightColumn}>
          {isInvited && (
            <View style={[styles.roleBadge, { backgroundColor: colors.accent + "22" }]}>
              <Text style={[styles.roleText, { color: colors.accent }]}>Invited</Text>
            </View>
          )}
          <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
            <Text style={[styles.status, { color: statusColor }]}>
              {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
            </Text>
          </View>
          <View style={styles.playersBadge}>
            <Ionicons name="people-outline" size={13} color={colors.primary} />
            <Text style={[styles.playersText, { color: colors.primary }]}>
              {booking.players} {booking.players === 1 ? "player" : "players"}
            </Text>
          </View>
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      {/* ── Details: date + time only ── */}
      <View style={styles.details}>
        <View style={styles.detailItem}>
          <Ionicons name="calendar-outline" size={15} color={colors.primary} />
          <Text style={[styles.detailText, { color: colors.foreground }]}>
            {formatDate(booking.date)}
          </Text>
        </View>
        <View style={styles.detailItem}>
          <Ionicons name="time-outline" size={15} color={colors.primary} />
          <Text style={[styles.detailText, { color: colors.foreground }]}>
            {formatTime(booking.time)}
          </Text>
        </View>
      </View>

      {/* ── Footer: ref + price ── */}
      <View style={styles.footer}>
        <Text style={[styles.ref, { color: colors.mutedForeground }]}>
          Ref: {booking.booking_ref}
        </Text>
        <Text style={[styles.amount, { color: colors.primary }]}>
          R{(booking.my_amount ?? booking.total_amount).toFixed(2)}
        </Text>
      </View>

      {needsPayment && (
        <TouchableOpacity
          style={[styles.payBtn, { backgroundColor: colors.accent }]}
          onPress={(e) => { e.stopPropagation?.(); onPayNow?.(); }}
          activeOpacity={0.85}
        >
          <Ionicons name="card-outline" size={16} color="#fff" />
          <Text style={styles.payBtnText}>Pay your share — R{(booking.my_amount ?? 0).toFixed(2)}</Text>
        </TouchableOpacity>
      )}

      {isInvited && booking.my_paid && (
        <View style={[styles.paidBanner, { backgroundColor: colors.success + "18" }]}>
          <Ionicons name="checkmark-circle" size={15} color={colors.success} />
          <Text style={[styles.paidText, { color: colors.success }]}>Your share is paid</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
    gap: 12,
  },
  cardHighlight: { borderWidth: 1.5 },

  header: { flexDirection: "row", alignItems: "flex-start" },
  clubInfo: { flex: 1, gap: 3, marginRight: 10 },
  clubName: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  locationRow: { flexDirection: "row", alignItems: "center" },
  location: { fontSize: 12, fontFamily: "Inter_400Regular", flexShrink: 1 },

  rightColumn: { alignItems: "flex-end", gap: 5 },
  roleBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  roleText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  status: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  playersBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  playersText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  divider: { height: 1 },

  details: { flexDirection: "row", gap: 20 },
  detailItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  detailText: { fontSize: 13, fontFamily: "Inter_500Medium" },

  footer: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  ref: { fontSize: 11, fontFamily: "Inter_400Regular" },
  amount: { fontSize: 16, fontFamily: "Inter_700Bold" },

  payBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 10,
    paddingVertical: 11,
  },
  payBtnText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 14 },

  paidBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  paidText: { fontSize: 13, fontFamily: "Inter_500Medium" },
});
