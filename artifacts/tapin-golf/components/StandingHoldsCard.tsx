import React, { useCallback, useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

interface StandingHold {
  id: number;
  status: string;
  confirm_by: string;
  slot_id: number;
  booking_id: number | null;
  date: string;
  tee_time: string;
  club_id: number;
  club_name: string;
  club_location: string | null;
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" });
}

function formatDeadline(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("en-ZA", {
    timeZone: "Africa/Johannesburg",
    weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function StandingHoldsCard() {
  const colors = useColors();
  const { user } = useAuth();
  const [holds, setHolds] = useState<StandingHold[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!user?.token) { setHolds([]); return; }
    try {
      const data = await apiFetch("/standing/mine", user.token);
      setHolds((Array.isArray(data) ? data : []).filter((h: StandingHold) => h.status === "held"));
    } catch {}
  }, [user]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const confirm = async (hold: StandingHold) => {
    if (!user?.token) return;
    setBusyId(hold.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const [clubData, slotsData] = await Promise.all([
        apiFetch(`/clubs/${hold.club_id}`, user.token),
        apiFetch(`/clubs/${hold.club_id}/tee-times?date=${hold.date}`, user.token),
      ]);
      const club = clubData.club;
      const slot = (slotsData.tee_times ?? []).find((s: any) => String(s.id) === String(hold.slot_id));
      if (!club || !slot) {
        Alert.alert("Tee time unavailable", "This tee time is no longer available. Please contact your club.");
        return;
      }
      router.push({
        pathname: "/booking/new",
        params: {
          club_id: club.id,
          club_name: club.name,
          tee_time_id: slot.id,
          time: slot.time,
          date: hold.date,
          price: slot.price,
          price_9: slot.price_9 != null ? String(slot.price_9) : "",
          promo_price: slot.promotional_price ?? "",
          available: slot.available_slots,
          total_slots: slot.total_slots,
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
          event_id: "",
          event_name: "",
          event_holes: "",
        },
      });
    } catch {
      Alert.alert("Error", "Could not load this tee time. Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  const decline = (hold: StandingHold) => {
    Alert.alert(
      "Release tee time?",
      `Your reserved seat at ${hold.club_name} on ${formatDateLabel(hold.date)} at ${hold.tee_time} will be released so others can book it.`,
      [
        { text: "Keep it", style: "cancel" },
        {
          text: "Release",
          style: "destructive",
          onPress: async () => {
            if (!user?.token) return;
            setBusyId(hold.id);
            try {
              await apiFetch(`/standing/holds/${hold.id}/decline`, user.token, { method: "POST" });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              await load();
            } catch (e: any) {
              Alert.alert("Error", e?.message ?? "Could not release the tee time.");
            } finally {
              setBusyId(null);
            }
          },
        },
      ]
    );
  };

  if (!user || holds.length === 0) return null;

  return (
    <View style={{ gap: 10 }}>
      {holds.map((hold) => (
        <View key={hold.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.accent }]}>
          <View style={styles.headerRow}>
            <View style={[styles.iconWrap, { backgroundColor: colors.accent + "22" }]}>
              <Ionicons name="repeat" size={20} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: colors.accent }]}>Standing Tee Time</Text>
              <Text style={[styles.club, { color: colors.foreground }]} numberOfLines={1}>{hold.club_name}</Text>
              <Text style={[styles.meta, { color: colors.mutedForeground }]}>
                {formatDateLabel(hold.date)} • {hold.tee_time}
              </Text>
            </View>
          </View>
          <Text style={[styles.deadline, { color: colors.mutedForeground }]}>
            Confirm by {formatDeadline(hold.confirm_by)} or your seat will be released.
          </Text>
          <View style={styles.btnRow}>
            <TouchableOpacity
              style={[styles.declineBtn, { borderColor: colors.border }]}
              onPress={() => decline(hold)}
              disabled={busyId === hold.id}
            >
              <Text style={[styles.declineText, { color: colors.mutedForeground }]}>Release</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, { backgroundColor: colors.primary }]}
              onPress={() => confirm(hold)}
              disabled={busyId === hold.id}
            >
              {busyId === hold.id
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.confirmText}>Confirm & Book</Text>}
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 14,
    gap: 10,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconWrap: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: "center", justifyContent: "center",
  },
  label: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 },
  club: { fontSize: 16, fontWeight: "700", marginTop: 1 },
  meta: { fontSize: 13, marginTop: 1 },
  deadline: { fontSize: 12.5, lineHeight: 17 },
  btnRow: { flexDirection: "row", gap: 10 },
  declineBtn: {
    flex: 1, borderWidth: 1, borderRadius: 10,
    paddingVertical: 10, alignItems: "center",
  },
  declineText: { fontSize: 14, fontWeight: "600" },
  confirmBtn: {
    flex: 2, borderRadius: 10,
    paddingVertical: 10, alignItems: "center", justifyContent: "center",
  },
  confirmText: { color: "#fff", fontSize: 14, fontWeight: "700" },
});
