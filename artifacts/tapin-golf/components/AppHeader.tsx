import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, usePathname } from "expo-router";
import React, { useEffect, useState } from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { initialWindowMetrics, useSafeAreaInsets } from "react-native-safe-area-context";
import { MenuDrawer } from "@/components/MenuDrawer";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";

const BG = "#1a5c38";
const WHITE = "#ffffff";
const BTN_BG = "rgba(255,255,255,0.15)";

export function AppHeader() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const pathname = usePathname();

  // Use whichever is larger: the live hook value or the synchronous window metrics.
  // On Dynamic Island iPhones, useSafeAreaInsets can briefly return 0 before
  // the native measurement propagates — initialWindowMetrics is always correct.
  const rawTop = Math.max(insets.top, initialWindowMetrics?.insets.top ?? 0);
  // On web the safe-area API returns 0 (no native measurement), so apply a
  // fixed top pad that clears the camera area in the phone-frame preview.
  const topPad = Platform.OS === "web" ? 44 : rawTop;

  useEffect(() => {
    if (!user) return;
    apiFetch("/notifications/unread-count", user.token)
      .then((d: any) => setUnreadCount(d.count ?? 0))
      .catch(() => {});
  }, [user, pathname]);

  return (
    <>
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <TouchableOpacity
          style={styles.logoRow}
          activeOpacity={0.75}
          onPress={() => { Haptics.selectionAsync(); router.push("/(tabs)/"); }}
        >
          <Ionicons name="golf" size={20} color={WHITE} />
          <Text style={styles.logoText}>
            <Text style={styles.logoTapIn}>TapIn</Text>
            {" Golf"}
          </Text>
        </TouchableOpacity>

        <View style={styles.actions}>
          {user ? (
            <TouchableOpacity
              onPress={() => { Haptics.selectionAsync(); router.push("/notifications"); }}
              style={styles.iconBtn}
              activeOpacity={0.75}
            >
              <Ionicons name="notifications-outline" size={20} color={WHITE} />
              {unreadCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {unreadCount > 99 ? "99+" : String(unreadCount)}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={() => { Haptics.selectionAsync(); router.push("/(auth)/login"); }}
              style={styles.signInBtn}
              activeOpacity={0.8}
            >
              <Text style={styles.signInText}>Sign In</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => { Haptics.selectionAsync(); setMenuOpen(true); }}
            style={styles.iconBtn}
            activeOpacity={0.75}
          >
            <View style={styles.stripe} />
            <View style={styles.stripe} />
            <View style={styles.stripe} />
          </TouchableOpacity>
        </View>
      </View>

      <MenuDrawer visible={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: BG,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  logoText: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.3,
    color: "rgba(255,255,255,0.85)",
  },
  logoTapIn: { color: WHITE, fontFamily: "Inter_700Bold" },

  actions: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: BTN_BG,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  stripe: { width: 16, height: 2, borderRadius: 1, backgroundColor: WHITE },

  signInBtn: {
    height: 34,
    paddingHorizontal: 16,
    borderRadius: 17,
    backgroundColor: BTN_BG,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  signInText: { color: WHITE, fontSize: 13, fontFamily: "Inter_600SemiBold" },

  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: { color: WHITE, fontSize: 9, fontFamily: "Inter_700Bold" },
});
