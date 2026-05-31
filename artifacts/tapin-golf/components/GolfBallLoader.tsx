import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

interface Props {
  size?: number;
}

const DIMPLES: { top: number; left: number; scale: number }[] = [
  { top: 0.18, left: 0.42, scale: 1 },
  { top: 0.30, left: 0.22, scale: 0.85 },
  { top: 0.30, left: 0.64, scale: 0.85 },
  { top: 0.46, left: 0.10, scale: 0.8 },
  { top: 0.46, left: 0.42, scale: 1 },
  { top: 0.46, left: 0.74, scale: 0.8 },
  { top: 0.62, left: 0.22, scale: 0.85 },
  { top: 0.62, left: 0.64, scale: 0.85 },
  { top: 0.74, left: 0.42, scale: 0.9 },
];

export default function GolfBallLoader({ size = 48 }: Props) {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1100,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    anim.start();
    return () => anim.stop();
  }, [spin]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const dimpleSize = size * 0.13;

  return (
    <Animated.View
      style={[
        styles.ball,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          transform: [{ rotate }],
        },
      ]}
    >
      <View
        style={[
          styles.highlight,
          {
            width: size * 0.32,
            height: size * 0.32,
            borderRadius: size * 0.16,
            top: size * 0.12,
            left: size * 0.14,
          },
        ]}
      />
      {DIMPLES.map((d, i) => (
        <View
          key={i}
          style={[
            styles.dimple,
            {
              width: dimpleSize * d.scale,
              height: dimpleSize * d.scale,
              borderRadius: (dimpleSize * d.scale) / 2,
              top: size * d.top,
              left: size * d.left,
            },
          ]}
        />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  ball: {
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e2e2e2",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 4,
  },
  highlight: {
    position: "absolute",
    backgroundColor: "rgba(255,255,255,0.9)",
    opacity: 0.7,
  },
  dimple: {
    position: "absolute",
    backgroundColor: "#d4d7dc",
  },
});
