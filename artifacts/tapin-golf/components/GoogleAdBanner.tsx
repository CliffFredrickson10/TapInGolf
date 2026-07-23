import Constants from "expo-constants";
import React, { useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";

// Guarded — TurboModuleRegistry.getEnforcing throws in Expo Go because the
// native binary is absent. Only attempt to load the SDK in proper native builds.
let BannerAd: any   = null;
let BannerAdSize: any = null;
let TestIds: any    = null;

if (Constants.appOwnership !== "expo") {
  try {
    const m   = require("react-native-google-mobile-ads");
    BannerAd    = m.BannerAd;
    BannerAdSize  = m.BannerAdSize;
    TestIds     = m.TestIds;
  } catch (_) {}
}

// ── Production ad unit IDs ────────────────────────────────────────────────────
const PROD_UNIT_ID = Platform.select({
  ios:     "ca-app-pub-2788464450764977/8052361350",
  android: "ca-app-pub-2788464450764977/3422851202",
  default: "ca-app-pub-2788464450764977/3422851202",
}) as string;

// In development use Google's official test unit ID so impressions are never
// counted against the live ad unit (which would flag your account).
const AD_UNIT_ID = __DEV__
  ? (TestIds?.BANNER ?? "ca-app-pub-3940256099942544/6300978111")
  : PROD_UNIT_ID;

export const AD_BANNER_H = 50;

export default function GoogleAdBanner() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const { user } = useAuth();
  const [failed, setFailed] = useState(false);

  // Suppress the banner if the user has an active ad-removal subscription
  const adFreeUntil = user?.ad_free_until ?? null;
  const isAdFree    = adFreeUntil ? new Date(adFreeUntil) > new Date() : false;

  if (failed || isAdFree) return null;

  const tabBarH = Platform.OS === "ios" ? 49 + insets.bottom : 56 + insets.bottom;

  return (
    <View style={[styles.wrap, { bottom: tabBarH }]} pointerEvents="box-none">
      {BannerAd ? (
        <BannerAd
          unitId={AD_UNIT_ID}
          size={BannerAdSize.BANNER}
          requestOptions={{ requestNonPersonalizedAdsOnly: false }}
          onAdFailedToLoad={() => setFailed(true)}
        />
      ) : (
        /* Shown in Expo Go and web — native module unavailable in those envs */
        <View style={[styles.placeholder, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.adLabel, { color: colors.mutedForeground }]}>
            Advertisement
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 100,
  },
  placeholder: {
    width: 320,
    height: AD_BANNER_H,
    borderWidth: 1,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  adLabel: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    letterSpacing: 0.5,
  },
});
