import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, ViewStyle } from "react-native";
import { useColors } from "@/hooks/useColors";

interface Props {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export default function Skeleton({ width = "100%", height = 16, borderRadius = 8, style }: Props) {
  const colors = useColors();
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        { width: width as any, height, borderRadius, backgroundColor: colors.muted, opacity },
        style,
      ]}
    />
  );
}

export function ClubCardSkeleton() {
  const colors = useColors();
  return (
    <View style={[styles.skCard, { backgroundColor: colors.card }]}>
      <Skeleton width="100%" height={160} borderRadius={0} />
      <View style={{ padding: 14, gap: 8 }}>
        <Skeleton width="70%" height={16} />
        <Skeleton width="50%" height={12} />
        <Skeleton width="40%" height={12} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  skCard: {
    width: 260,
    borderRadius: 16,
    overflow: "hidden",
    marginRight: 14,
  },
});
