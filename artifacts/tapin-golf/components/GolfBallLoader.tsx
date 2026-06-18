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

export default function GolfBallLoader({ size = 56 }: Props) {
  const bounce = useRef(new Animated.Value(0)).current;
  const spin   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const bounceAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(bounce, {
          toValue: 1,
          duration: 420,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(bounce, {
          toValue: 0,
          duration: 420,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    const spinAnim = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 840,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    bounceAnim.start();
    spinAnim.start();
    return () => { bounceAnim.stop(); spinAnim.stop(); };
  }, [bounce, spin]);

  const translateY = bounce.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -(size * 1.4)],
  });

  const shadowScaleX = bounce.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.45],
  });
  const shadowOpacity = bounce.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0.1],
  });

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const dimpleSize = size * 0.13;

  return (
    <View style={[styles.container, { width: size, height: size * 2.8 }]}>
      {/* Bouncing ball */}
      <Animated.View
        style={[
          styles.ball,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            transform: [{ translateY }, { rotate }],
            shadowRadius: size * 0.12,
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

      {/* Ground shadow */}
      <Animated.View
        style={[
          styles.shadow,
          {
            width: size * 0.7,
            height: size * 0.14,
            borderRadius: size * 0.07,
            opacity: shadowOpacity,
            transform: [{ scaleX: shadowScaleX }],
            marginTop: size * 0.08,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "flex-end",
  },
  ball: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e0e0e0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    elevation: 6,
  },
  highlight: {
    position: "absolute",
    backgroundColor: "rgba(255,255,255,0.85)",
  },
  dimple: {
    position: "absolute",
    backgroundColor: "#c8cdd4",
  },
  shadow: {
    backgroundColor: "#000",
  },
});
