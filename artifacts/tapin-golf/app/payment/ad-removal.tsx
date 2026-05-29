import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useRef, useState } from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/lib/api";

export default function AdRemovalPaymentScreen() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const { user, updateUser } = useAuth();
  const { url, purchase_id } = useLocalSearchParams<{ url: string; purchase_id: string }>();

  const handled     = useRef(false);
  const topPad      = Platform.OS === "web" ? 67 : insets.top;
  const [showDone, setShowDone] = useState(false);

  const handleSuccess = async () => {
    if (handled.current) return;
    handled.current = true;
    try {
      const data = await apiFetch(`/settings/ad-removal/confirm/${purchase_id}`, user!.token, { method: "POST" });
      if (data.expires_at) {
        updateUser({ ad_free_until: data.expires_at });
      }
    } catch {}
    router.replace("/settings");
  };

  const handleCancel = () => {
    if (handled.current) return;
    handled.current = true;
    router.back();
  };

  const handleNavChange = (navState: { url: string }) => {
    const u = navState.url;
    if (u.includes("/payment/ad-removal/success")) { handleSuccess(); return; }
    if (u.includes("/payment/ad-removal/cancel"))  { handleCancel();  return; }
    if (u.includes("payfast.co.za")) setShowDone(true);
  };

  if (Platform.OS === "web") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: colors.primary }]}>
          <TouchableOpacity onPress={handleCancel} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Remove Ads Payment</Text>
          <View style={{ width: 38 }} />
        </View>
        <View style={styles.center}>
          <Text style={[styles.webNote, { color: colors.mutedForeground }]}>
            Open your TapIn Golf app on your phone to complete payment.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: colors.primary }]}>
        <TouchableOpacity onPress={handleCancel} style={styles.backBtn} hitSlop={10} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Remove Ads Payment</Text>
        {showDone ? (
          <TouchableOpacity onPress={handleSuccess} style={styles.doneBtn} hitSlop={10} activeOpacity={0.8}>
            <Text style={styles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 60 }} />
        )}
      </View>
      <WebView
        source={{ uri: url as string }}
        onNavigationStateChange={handleNavChange}
        startInLoadingState
        javaScriptEnabled
        style={{ flex: 1 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    color: "#fff",
    fontSize: 17,
    fontFamily: "Inter_700Bold",
  },
  doneBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 10,
  },
  doneBtnText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  webNote: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22 },
});
