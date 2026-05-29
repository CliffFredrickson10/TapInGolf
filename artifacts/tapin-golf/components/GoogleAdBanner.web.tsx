import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";

export const AD_BANNER_H = 50;

export default function GoogleAdBanner() {
  const colors = useColors();

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={[styles.placeholder, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.adText, { color: colors.mutedForeground }]}>Advertisement</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    bottom: 84,
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
  adText: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    letterSpacing: 0.5,
  },
});
