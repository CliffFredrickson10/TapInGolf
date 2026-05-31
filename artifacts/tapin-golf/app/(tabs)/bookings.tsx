import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  FlatList,
  Platform,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import GolfBallLoader from "@/components/GolfBallLoader";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import BookingCard, { Booking } from "@/components/BookingCard";
import { AppHeader } from "@/components/AppHeader";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/lib/api";

type Tab = "upcoming" | "past";

export default function BookingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("upcoming");
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

  const goToPayment = (booking: Booking) => {
    router.push({ pathname: "/booking/[id]", params: { id: booking.id } });
  };

  if (!user) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Ionicons name="calendar-outline" size={48} color={colors.mutedForeground} />
        <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Sign in to view bookings</Text>
        <TouchableOpacity
          style={[styles.signInBtn, { backgroundColor: colors.primary }]}
          onPress={() => router.push("/(auth)/login")}
        >
          <Text style={styles.signInText}>Sign In</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const pendingPaymentCount = invitedBookings.filter(b => !b.my_paid && b.status === "confirmed").length;

  const allEmpty = bookings.length === 0 && invitedBookings.length === 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader />
      <View style={[styles.header, { paddingTop: 14 }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>My Bookings</Text>
        {pendingPaymentCount > 0 && (
          <View style={[styles.alertBadge, { backgroundColor: colors.accent }]}>
            <Text style={styles.alertBadgeText}>{pendingPaymentCount} payment{pendingPaymentCount > 1 ? "s" : ""} due</Text>
          </View>
        )}
      </View>

      <View style={[styles.tabRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {(["upcoming", "past"] as Tab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tabBtn, { backgroundColor: tab === t ? colors.primary : "transparent" }]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, { color: tab === t ? "#fff" : colors.mutedForeground }]}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <GolfBallLoader />
        </View>
      ) : allEmpty ? (
        <View style={styles.center}>
          <Ionicons name="calendar-outline" size={48} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No {tab} bookings</Text>
          {tab === "upcoming" && (
            <TouchableOpacity
              style={[styles.signInBtn, { backgroundColor: colors.primary }]}
              onPress={() => router.push("/(tabs)/explore")}
            >
              <Text style={styles.signInText}>Book a round</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={[
            ...(invitedBookings.length > 0
              ? [{ _section: "invited" as const, items: invitedBookings }]
              : []),
            ...(bookings.length > 0
              ? [{ _section: "mine" as const, items: bookings }]
              : []),
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
                    <Text style={[styles.sectionBadgeText, { color: colors.accent }]}>
                      {pendingPaymentCount} unpaid
                    </Text>
                  </View>
                )}
              </View>
              {section.items.map((booking) => (
                <BookingCard
                  key={booking.id}
                  booking={booking}
                  onPress={() => router.push({ pathname: "/booking/[id]", params: { id: booking.id } })}
                  onPayNow={booking.role === "invited" && !booking.my_paid ? () => goToPayment(booking) : undefined}
                />
              ))}
            </>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 16, flexDirection: "row", alignItems: "center", gap: 10 },
  title: { fontSize: 26, fontFamily: "Inter_700Bold", flex: 1 },
  alertBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  alertBadgeText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 12 },
  tabRow: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    borderWidth: 1,
    padding: 4,
  },
  tabBtn: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: "center" },
  tabText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  signInBtn: { borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, marginTop: 4 },
  signInText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 15 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.8 },
  sectionBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  sectionBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
});
