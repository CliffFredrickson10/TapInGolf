import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Constants from "expo-constants";
import type { EventSubscription } from "expo-notifications";
import { router, Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { TermsGate } from "@/components/TermsGate";
import { AuthProvider } from "@/context/AuthContext";
// Import geofencing so the background task is registered at app startup
import "@/lib/geofencing";

// Initialise AdMob SDK once at startup.
// Metro picks lib/initAdmob.web.ts (no-op) on web and lib/initAdmob.ts on native.
import "@/lib/initAdmob";

SplashScreen.preventAutoHideAsync();

// Remote push notifications (and their handler) were removed from Expo Go in SDK 53.
// Use a runtime require() so the expo-notifications module is never imported at the
// module level in Expo Go — doing so causes an uncatchable console.error on init.
const isExpoGo = Constants.appOwnership === "expo";

if (!isExpoGo) {
  try {
    const Notifications = require("expo-notifications");
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
  } catch {}
}

const queryClient = new QueryClient();

function RootLayoutNav() {
  const notificationListener = useRef<EventSubscription>();
  const responseListener = useRef<EventSubscription>();

  useEffect(() => {
    // Notification listeners are not available in Expo Go (SDK 53+)
    if (isExpoGo) return;

    let Notifications: typeof import("expo-notifications");
    try {
      Notifications = require("expo-notifications");
    } catch {
      return;
    }

    // Foreground notification received
    notificationListener.current = Notifications.addNotificationReceivedListener(() => {
      // Notification arrives while app is open — handled by setNotificationHandler above
    });

    // User tapped a notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, any>;
      if (!data) return;

      switch (data.type) {
        case "booking_confirmed":
        case "booking_invited":
          if (data.booking_id) {
            router.push({ pathname: "/booking/[id]", params: { id: data.booking_id } });
          }
          break;
        case "friend_request":
        case "friend_accepted":
          router.push("/(tabs)/friends");
          break;
        case "new_message":
        case "new_conversation":
          if (data.conversation_id) {
            router.push({ pathname: "/chat/[id]", params: { id: data.conversation_id } });
          }
          break;
        case "tee_time_reminder":
          if (data.booking_id) {
            router.push({ pathname: "/booking/[id]", params: { id: data.booking_id } });
          }
          break;
        case "geofence_welcome":
        case "geofence_ninth_tee":
          if (data.club_id) {
            router.push({ pathname: "/club/[id]", params: { id: data.club_id } });
          }
          break;
        case "knockout_pair_request":
        case "event_created":
        case "event_published":
        case "event_cancelled":
          if (data.event_id) {
            router.push({ pathname: "/event/[id]", params: { id: data.event_id } });
          }
          break;
        case "event_draw_published":
          if (data.event_id) {
            router.push({ pathname: "/event/[id]", params: { id: data.event_id, tab: "draw" } });
          }
          break;
        case "hna_verification_update":
          router.push("/(tabs)/profile");
          break;
        default:
          break;
      }
    });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)/login" options={{ presentation: "modal", headerShown: false }} />
      <Stack.Screen name="(auth)/register" options={{ presentation: "modal", headerShown: false }} />
      <Stack.Screen name="(auth)/forgot-password" options={{ presentation: "modal", headerShown: false }} />
      <Stack.Screen name="club/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="booking/new" options={{ headerShown: false }} />
      <Stack.Screen name="booking/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="booking/payment" options={{ headerShown: false, presentation: "fullScreenModal" }} />
      <Stack.Screen name="club-map" options={{ headerShown: false }} />
      <Stack.Screen name="chat/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="chat/new" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="(super)/reminder-settings" options={{ headerShown: false }} />
      <Stack.Screen name="(admin)/geofence-config" options={{ headerShown: false }} />
      <Stack.Screen name="(admin)/broadcast" options={{ headerShown: false }} />
      <Stack.Screen name="event/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="(admin)/events" options={{ headerShown: false }} />
      <Stack.Screen name="(admin)/revenue" options={{ headerShown: false }} />
      <Stack.Screen name="notifications" options={{ headerShown: false }} />
      <Stack.Screen name="payments" options={{ headerShown: false }} />
      <Stack.Screen name="settings" options={{ headerShown: false }} />
      <Stack.Screen name="legal/terms" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="legal/privacy" options={{ headerShown: false, presentation: "modal" }} />
    </Stack>
  );
}

export default function RootLayout() {
  // Pre-load the Ionicons font explicitly using the direct TTF path.
  // In @expo/vector-icons v15 the font family name changed to 'ionicons'
  // (lowercase). The component self-loads, but that fails silently in Expo Go —
  // explicitly loading it here ensures it is registered before any icons render.
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ionicons: require("@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf"),
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <AuthProvider>
                <RootLayoutNav />
                <TermsGate />
              </AuthProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
