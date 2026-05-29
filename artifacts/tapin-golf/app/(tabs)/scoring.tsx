import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { AppHeader } from "@/components/AppHeader";
import { useColors } from "@/hooks/useColors";

export default function ScoringScreen() {
  const colors = useColors();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader />
      <View style={styles.body}>
        <View style={[styles.iconWrap, { backgroundColor: colors.primary + "15" }]}>
          <Ionicons name="golf" size={48} color={colors.primary} />
        </View>
        <Text style={[styles.title, { color: colors.foreground }]}>Scoring</Text>
        <Text style={[styles.sub, { color: colors.mutedForeground }]}>
          Live scorecards, handicap tracking and round history — coming soon.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 40,
  },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  title: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
  },
  sub: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
    textAlign: "center",
  },
});
