import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { API_BASE } from "@/lib/api";
import { AppHeader } from "@/components/AppHeader";

// ─── Shared: build the map-embed URL with optional user coords ───────────────
function mapEmbedUrl(userLat?: number, userLng?: number): string {
  const params = new URLSearchParams();
  if (userLat != null) params.set("lat", String(userLat));
  if (userLng != null) params.set("lng", String(userLng));
  const qs = params.toString();
  return `${API_BASE}/map-embed${qs ? "?" + qs : ""}`;
}

// ─── Web: load map from the API endpoint inside an iframe ────────────────────
function WebLeafletMap({
  userLat,
  userLng,
  onClubPress,
}: {
  userLat?: number;
  userLng?: number;
  onClubPress: (id: number) => void;
}) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: MessageEvent) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "club" && msg.id) onClubPress(msg.id);
      } catch {}
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onClubPress]);

  return (
    <View style={StyleSheet.absoluteFillObject}>
      {/* @ts-ignore — <iframe> renders correctly via RN Web's DOM pass-through */}
      <iframe
        src={mapEmbedUrl(userLat, userLng)}
        style={{ width: "100%", height: "100%", border: "none", display: "block" } as any}
      />
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function MapScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ lat?: string; lng?: string }>();

  const [userLat, setUserLat] = useState<number | undefined>(
    params.lat ? parseFloat(String(params.lat)) : undefined,
  );
  const [userLng, setUserLng] = useState<number | undefined>(
    params.lng ? parseFloat(String(params.lng)) : undefined,
  );

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const handleClubId = (id: number) => {
    router.push({ pathname: "/club/[id]", params: { id } });
  };

  useEffect(() => {
    if (userLat != null && userLng != null) return;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setUserLat(pos.coords.latitude);
        setUserLng(pos.coords.longitude);
      } catch {}
    })();
  }, []);

  const handleNativeMessage = (event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent?.data ?? "{}");
      if (msg.type === "club" && msg.id) handleClubId(msg.id);
    } catch {}
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <AppHeader />
      {/* Header */}
      <View
        style={[
          styles.header,
          { paddingTop: 12, backgroundColor: colors.card, borderBottomColor: colors.border },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Club Map</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Body */}
      <View style={styles.body}>
        {Platform.OS === "web" ? (
          <WebLeafletMap
            userLat={userLat}
            userLng={userLng}
            onClubPress={handleClubId}
          />
        ) : (
          <WebView
            source={{ uri: mapEmbedUrl(userLat, userLng) }}
            style={styles.fill}
            onMessage={handleNativeMessage}
            javaScriptEnabled
            originWhitelist={["*"]}
            mixedContentMode="always"
          />
        )}
      </View>
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
  title: { fontSize: 18, fontFamily: "Inter_700Bold" },
  body: { flex: 1, position: "relative" },
  fill: { flex: 1 },
});
