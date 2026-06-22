import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React from "react";
import {
  Linking,
  Modal,
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

type MenuItem = {
  icon: any;
  label: string;
  sub?: string;
  onPress: () => void;
  danger?: boolean;
  iconColor?: string;
  iconBg?: string;
};

type Section = {
  title: string;
  items: MenuItem[];
};

function Row({ item, isLast, colors }: { item: MenuItem; isLast: boolean; colors: any }) {
  const iconColor = item.danger ? "#ef4444" : (item.iconColor ?? colors.primary);
  const iconBg    = item.danger ? "#ef444415" : (item.iconBg ?? (colors.primary + "15"));
  return (
    <TouchableOpacity
      style={[styles.row, !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
      onPress={() => { Haptics.selectionAsync(); item.onPress(); }}
      activeOpacity={0.7}
    >
      <View style={[styles.iconCircle, { backgroundColor: iconBg }]}>
        <Ionicons name={item.icon} size={20} color={iconColor} />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { color: item.danger ? "#ef4444" : colors.foreground }]}>
          {item.label}
        </Text>
        {item.sub ? (
          <Text style={[styles.rowSub, { color: colors.mutedForeground }]} numberOfLines={1}>
            {item.sub}
          </Text>
        ) : null}
      </View>
      {!item.danger && (
        <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
      )}
    </TouchableOpacity>
  );
}

export function MenuDrawer({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();

  const topPad = Platform.OS === "web" ? 20 : insets.top;

  const navigate = (path: any, params?: any) => {
    onClose();
    setTimeout(() => {
      if (params) router.push({ pathname: path, params });
      else router.push(path);
    }, 300);
  };

  const initials = user
    ? user.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : "?";

  const sections: Section[] = [
    {
      title: "Your account",
      items: [
        {
          icon: "person-outline",
          label: "My profile",
          sub: "Edit name, email, phone, handicap",
          onPress: () => navigate("/profile"),
        },
        {
          icon: "calendar-outline",
          label: "My bookings",
          sub: "Upcoming and past rounds",
          onPress: () => navigate("/(tabs)/bookings"),
        },
        {
          icon: "people-outline",
          label: "My friends",
          sub: "Connections and friend requests",
          onPress: () => navigate("/(tabs)/friends"),
        },
        {
          icon: "notifications-outline",
          label: "Notifications",
          sub: "Booking alerts, messages, announcements",
          onPress: () => navigate("/notifications"),
        },
        {
          icon: "card-outline",
          label: "Your Payments",
          sub: "Wallet, saved cards, transaction history",
          onPress: () => navigate("/payments"),
        },
        {
          icon: "settings-outline",
          label: "Settings",
          sub: "Notifications, privacy, blocked accounts",
          onPress: () => navigate("/settings"),
        },
      ],
    },
    {
      title: "Discover",
      items: [
        {
          icon: "search-outline",
          label: "Explore clubs",
          sub: "Browse all 506 South African golf clubs",
          onPress: () => navigate("/(tabs)/explore"),
        },
        {
          icon: "golf-outline",
          label: "Find a game",
          sub: "Join open tee times near you",
          onPress: () => navigate("/join"),
        },
        {
          icon: "map-outline",
          label: "Club map",
          sub: "View clubs on an interactive map",
          onPress: () => navigate("/club-map"),
        },
      ],
    },
    {
      title: "Support",
      items: [
        {
          icon: "help-circle-outline",
          label: "Contact Us",
          sub: "Get in touch with the TapIn Golf team",
          onPress: () => navigate("/help"),
        },
        {
          icon: "logo-facebook",
          label: "Facebook",
          sub: "facebook.com/tapingolf",
          iconColor: "#1877F2",
          iconBg: "#1877F215",
          onPress: () => { onClose(); Linking.openURL("https://www.facebook.com/tapingolf"); },
        },
        {
          icon: "logo-instagram",
          label: "Instagram",
          sub: "instagram.com/tapingolf",
          iconColor: "#E1306C",
          iconBg: "#E1306C15",
          onPress: () => { onClose(); Linking.openURL("https://www.instagram.com/tapingolf"); },
        },
      ],
    },
    {
      title: "Legal",
      items: [
        {
          icon: "document-text-outline",
          label: "Terms of use",
          onPress: () => { onClose(); router.push("/legal/terms"); },
        },
        {
          icon: "shield-checkmark-outline",
          label: "Privacy policy",
          onPress: () => { onClose(); router.push("/legal/privacy"); },
        },
      ],
    },
  ];

  const handleLogout = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onClose();
    setTimeout(async () => {
      await logout();
    }, 300);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View
          style={[
            styles.header,
            {
              paddingTop: topPad + 16,
              backgroundColor: colors.card,
              borderBottomColor: colors.border,
            },
          ]}
        >
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={10}>
            <Ionicons name="close" size={26} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
        >
          {/* Avatar + email */}
          <View style={styles.avatarBlock}>
            <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <Text style={[styles.avatarName, { color: colors.foreground }]}>{user?.name ?? "Guest"}</Text>
            {user?.email ? (
              <Text style={[styles.avatarEmail, { color: colors.mutedForeground }]}>{user.email}</Text>
            ) : null}
            {user?.handicap != null ? (
              <View style={[styles.hcpBadge, { backgroundColor: colors.accent + "20" }]}>
                <Text style={[styles.hcpText, { color: colors.accent }]}>
                  HCP {user.handicap > 0 ? `+${user.handicap}` : user.handicap}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Sections */}
          {sections.map((section) => (
            <View key={section.title} style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{section.title}</Text>
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {section.items.map((item, i) => (
                  <Row key={item.label} item={item} isLast={i === section.items.length - 1} colors={colors} />
                ))}
              </View>
            </View>
          ))}

          {/* Sign out */}
          {user && (
            <TouchableOpacity
              style={[styles.signOutBtn, { borderColor: "#ef4444" + "40" }]}
              onPress={handleLogout}
              activeOpacity={0.75}
            >
              <Ionicons name="log-out-outline" size={18} color="#ef4444" />
              <Text style={styles.signOutText}>Sign out</Text>
            </TouchableOpacity>
          )}

          <Text style={[styles.version, { color: colors.mutedForeground }]}>TapIn Golf · v1.0.0</Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  closeBtn: { width: 40, alignItems: "flex-start" },
  headerName: { fontSize: 17, fontFamily: "Inter_700Bold", flex: 1, textAlign: "center" },

  scroll: { paddingHorizontal: 20, paddingTop: 8 },

  avatarBlock: { alignItems: "center", paddingVertical: 24, gap: 6 },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  avatarText: { color: "#fff", fontSize: 28, fontFamily: "Inter_700Bold" },
  avatarName: { fontSize: 20, fontFamily: "Inter_700Bold" },
  avatarEmail: { fontSize: 13, fontFamily: "Inter_400Regular" },
  hcpBadge: { marginTop: 4, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 4 },
  hcpText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold", marginBottom: 10 },
  card: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  rowSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },

  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 14,
    marginBottom: 20,
  },
  signOutText: { color: "#ef4444", fontSize: 15, fontFamily: "Inter_600SemiBold" },

  version: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center" },
});
