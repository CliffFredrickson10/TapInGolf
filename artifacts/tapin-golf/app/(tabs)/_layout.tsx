import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs, usePathname } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, View, useColorScheme } from "react-native";
import { useColors } from "@/hooks/useColors";
import GoogleAdBanner from "@/components/GoogleAdBanner";
function NativeTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "house", selected: "house.fill" }} />
        <Label>Home</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="explore">
        <Icon sf={{ default: "magnifyingglass", selected: "magnifyingglass" }} />
        <Label>Explore</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="my-golf">
        <Icon sf={{ default: "figure.golf", selected: "figure.golf" }} />
        <Label>My Golf</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="friends">
        <Icon sf={{ default: "person.2", selected: "person.2.fill" }} />
        <Label>Friends</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="scoring">
        <Icon sf={{ default: "flag", selected: "flag.fill" }} />
        <Label>Scoring</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : colors.tabBar,
          borderTopWidth: isWeb ? 1 : 0,
          borderTopColor: colors.border,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={100}
              tint={isDark ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.tabBar }]} />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) =>
            isIOS ? (
              <SymbolView name={focused ? "house.fill" : "house"} tintColor={color} size={24} />
            ) : (
              <Ionicons name={focused ? "home" : "home-outline"} size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: "Explore",
          tabBarIcon: ({ color, focused }) =>
            isIOS ? (
              <SymbolView name="magnifyingglass" tintColor={color} size={24} />
            ) : (
              <Ionicons name={focused ? "search" : "search-outline"} size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="my-golf"
        options={{
          title: "My Golf",
          tabBarIcon: ({ color, focused }) =>
            isIOS ? (
              <SymbolView name="figure.golf" tintColor={color} size={24} />
            ) : (
              <Ionicons name={focused ? "golf" : "golf-outline"} size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="friends"
        options={{
          title: "Friends",
          tabBarIcon: ({ color, focused }) =>
            isIOS ? (
              <SymbolView name={focused ? "person.2.fill" : "person.2"} tintColor={color} size={24} />
            ) : (
              <Ionicons name={focused ? "people" : "people-outline"} size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="scoring"
        options={{
          title: "Scoring",
          tabBarIcon: ({ color, focused }) =>
            isIOS ? (
              <SymbolView name={focused ? "flag.fill" : "flag"} tintColor={color} size={24} />
            ) : (
              <Ionicons name={focused ? "clipboard" : "clipboard-outline"} size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen name="bookings"     options={{ href: null }} />
      <Tabs.Screen name="tournaments"  options={{ href: null }} />
      <Tabs.Screen name="profile"      options={{ href: null }} />
    </Tabs>
  );
}

export default function TabLayout() {
  const pathname = usePathname();
  const isHome = pathname === "/" || pathname === "/index";

  return (
    <View style={{ flex: 1 }}>
      {isLiquidGlassAvailable() ? <NativeTabLayout /> : <ClassicTabLayout />}
      {!isHome && <GoogleAdBanner />}
    </View>
  );
}
