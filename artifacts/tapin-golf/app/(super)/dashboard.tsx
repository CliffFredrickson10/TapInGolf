import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import {
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

const MENU_ITEMS = [
  {
    icon: "people-outline" as const,
    label: "User Management",
    sub: "View, search and manage all users",
    route: "/(super)/users",
    color: "#1a5c38",
  },
  {
    icon: "golf-outline" as const,
    label: "Club Management",
    sub: "Add, edit or deactivate clubs",
    route: "/(super)/clubs",
    color: "#1a5c38",
  },
  {
    icon: "bar-chart-outline" as const,
    label: "Platform Analytics",
    sub: "Bookings, revenue and activity overview",
    route: "/(super)/analytics",
    color: "#1a5c38",
  },
  {
    icon: "megaphone-outline" as const,
    label: "Ads & Promotions",
    sub: "Manage sponsored placements",
    route: "/(super)/ads",
    color: "#c8a84b",
  },
  {
    icon: "ticket-outline" as const,
    label: "Vouchers",
    sub: "Create and manage discount vouchers",
    route: "/(super)/vouchers",
    color: "#c8a84b",
  },
  {
    icon: "notifications-outline" as const,
    label: "Push Notifications",
    sub: "Broadcast messages to all users",
    route: "/(super)/notifications",
    color: "#c8a84b",
  },
  {
    icon: "alarm-outline" as const,
    label: "Reminder Settings",
    sub: "Configure tee-time reminder lead time",
    route: "/(super)/reminder-settings",
    color: "#c8a84b",
  },
];

export default function SuperDashboard() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  if (!user?.is_super_user) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Ionicons name="lock-closed-outline" size={48} color={colors.mutedForeground} />
        <Text style={[styles.blockedText, { color: colors.mutedForeground }]}>Access denied</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12, backgroundColor: colors.primary }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <View style={styles.backCircle}>
            <Ionicons name="arrow-back" size={20} color={colors.primary} />
          </View>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Super User</Text>
          <Text style={styles.headerSub}>TapIn Golf Admin Console</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: "#fff2" }]}>
          <Ionicons name="shield-checkmark" size={14} color="#fff" />
          <Text style={styles.badgeText}>SUPER</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: Platform.OS === "web" ? 140 : 80, gap: 12 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Welcome card */}
        <View style={[styles.welcomeCard, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "30" }]}>
          <Ionicons name="shield-checkmark" size={28} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.welcomeTitle, { color: colors.foreground }]}>
              Welcome, {user.name.split(" ")[0]}
            </Text>
            <Text style={[styles.welcomeSub, { color: colors.mutedForeground }]}>
              You have full platform access
            </Text>
          </View>
        </View>

        {/* Section label */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Management Tools</Text>

        {MENU_ITEMS.map((item) => (
          <TouchableOpacity
            key={item.label}
            style={[styles.menuItem, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => router.push(item.route as any)}
            activeOpacity={0.8}
          >
            <View style={[styles.iconWrap, { backgroundColor: item.color + "18" }]}>
              <Ionicons name={item.icon} size={22} color={item.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuLabel, { color: colors.foreground }]}>{item.label}</Text>
              <Text style={[styles.menuSub, { color: colors.mutedForeground }]}>{item.sub}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  blockedText: { fontSize: 16, fontFamily: "Inter_500Medium" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 14,
  },
  backBtn: {},
  backCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#ffffff99", marginTop: 1 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  badgeText: { color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  welcomeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  welcomeTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  welcomeSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  sectionLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 4,
    marginBottom: 2,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  menuLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  menuSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
});
