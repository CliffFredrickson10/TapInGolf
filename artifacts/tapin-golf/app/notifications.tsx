import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import GolfBallLoader from "@/components/GolfBallLoader";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/lib/api";
import { AppHeader } from "@/components/AppHeader";

// ─── Types ─────────────────────────────────────────────────────────────────
type AppNotification = {
  id: number;
  type: string;
  title: string;
  body: string;
  data: Record<string, any>;
  is_read: boolean;
  created_at: string;
};

// ─── Helpers ───────────────────────────────────────────────────────────────
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
}

function notifIcon(type: string): { name: any; color: string } {
  switch (type) {
    case "booking_confirmed": return { name: "checkmark-circle",   color: "#2e7d32" };
    case "booking_invited":   return { name: "golf",               color: "#1a5c38" };
    case "friend_request":    return { name: "person-add",         color: "#1565c0" };
    case "friend_accepted":   return { name: "people",             color: "#1565c0" };
    case "new_message":       return { name: "chatbubble-ellipses",color: "#6a1b9a" };
    case "club_broadcast":    return { name: "megaphone",          color: "#e65100" };
    case "score_disputed":    return { name: "warning",            color: "#dc2626" };
    case "score_verified":    return { name: "checkmark-circle",   color: "#16a34a" };
    case "event_dq":          return { name: "ban",                color: "#dc2626" };
    case "knockout_pair_request": return { name: "people",         color: "#3b82f6" };
    case "event_created":
    case "event_published":
    case "event_draw_published":
    case "event_cancelled":   return { name: "trophy",             color: "#1a5c38" };
    default:                  return { name: "notifications",      color: "#546e7a" };
  }
}

function handleTap(notif: AppNotification) {
  const d = notif.data ?? {};
  switch (notif.type) {
    case "booking_confirmed":
    case "booking_invited":
      if (d.booking_id) router.push({ pathname: "/booking/[id]", params: { id: d.booking_id } });
      break;
    case "friend_request":
    case "friend_accepted":
      router.push("/(tabs)/friends");
      break;
    case "new_message":
      if (d.conversation_id) router.push({ pathname: "/chat/[id]", params: { id: d.conversation_id } });
      break;
    case "score_disputed":
    case "score_verified":
      if (d.round_id) router.push({ pathname: "/scoring/[id]/complete", params: { id: d.round_id } });
      break;
    case "event_dq":
    case "event_created":
    case "event_published":
    case "event_cancelled":
    case "event_draw_published":
    case "knockout_draw":
    case "knockout_pair_request":
      if (d.event_id || d.eventId) router.push({ pathname: "/event/[id]", params: { id: d.event_id ?? d.eventId } });
      break;
    case "club_broadcast":
      if (d.club_id) router.push({ pathname: "/club/[id]", params: { id: d.club_id } });
      break;
    case "event_registration_update":
    case "event_payment_confirmed":
      if (d.event_id) router.push({ pathname: "/event/[id]", params: { id: d.event_id } });
      break;
    case "voucher_issued":
      router.push("/payments");
      break;
    default:
      break;
  }
}

// ─── Notification Row ──────────────────────────────────────────────────────
function NotifRow({
  notif,
  onPress,
  colors,
}: {
  notif: AppNotification;
  onPress: (n: AppNotification) => void;
  colors: any;
}) {
  const icon = notifIcon(notif.type);
  return (
    <TouchableOpacity
      style={[
        styles.row,
        {
          backgroundColor: notif.is_read ? colors.card : colors.primaryLight,
          borderBottomColor: colors.border,
          borderLeftWidth: notif.is_read ? 0 : 3,
          borderLeftColor: notif.is_read ? "transparent" : colors.primary,
        },
      ]}
      onPress={() => onPress(notif)}
      activeOpacity={0.82}
    >
      <View style={[styles.iconWrap, { backgroundColor: icon.color + "22" }]}>
        <Ionicons name={icon.name} size={22} color={icon.color} />
      </View>
      <View style={styles.rowContent}>
        <View style={styles.rowTop}>
          <Text
            style={[
              styles.rowTitle,
              {
                color: notif.is_read ? colors.foreground : colors.primary,
                fontFamily: notif.is_read ? "Inter_600SemiBold" : "Inter_700Bold",
              },
            ]}
            numberOfLines={2}
          >
            {notif.title}
          </Text>
          {!notif.is_read && (
            <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />
          )}
        </View>
        <Text
          style={[
            styles.rowBody,
            { color: notif.type === "event_dq" ? "#dc2626" : colors.mutedForeground },
          ]}
          numberOfLines={notif.type === "event_dq" ? undefined : 3}
        >
          {notif.body}
        </Text>
        <Text style={[styles.rowTime, { color: colors.mutedForeground }]}>
          {relativeTime(notif.created_at)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
export default function NotificationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    try {
      const d = await apiFetch("/notifications?limit=50", user.token);
      setNotifications(d.notifications ?? []);
    } catch {}
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const markRead = async (notif: AppNotification) => {
    if (!user) return;
    Haptics.selectionAsync();
    // Optimistically mark read
    setNotifications((prev) =>
      prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n))
    );
    try {
      await apiFetch(`/notifications/${notif.id}/read`, user.token, { method: "PATCH" });
    } catch {}
    handleTap(notif);
  };

  const markAllRead = async () => {
    if (!user) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    try {
      await apiFetch("/notifications/read-all", user.token, { method: "PATCH" });
    } catch {}
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <AppHeader />
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: 12,
            backgroundColor: colors.card,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Notifications</Text>
        {unreadCount > 0 ? (
          <TouchableOpacity onPress={markAllRead} hitSlop={8}>
            <Text style={[styles.markAll, { color: colors.primary }]}>Mark all read</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 80 }} />
        )}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <GolfBallLoader />
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="notifications-off-outline" size={56} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No notifications yet</Text>
          <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
            Booking confirmations, messages, and club announcements will appear here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(n) => String(n.id)}
          renderItem={({ item }) => (
            <NotifRow notif={item} onPress={markRead} colors={colors} />
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  markAll: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 36,
    gap: 12,
  },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },

  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  rowContent: { flex: 1, gap: 3 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  rowTitle: { flex: 1, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  unreadDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  rowBody: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  rowTime: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
});
