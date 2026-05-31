import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { Ionicons } from "@expo/vector-icons";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { router, Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/context/AuthContext";
// Import geofencing so the background task is registered at app startup
import "@/lib/geofencing";

// Initialise AdMob SDK once at startup.
// Metro picks lib/initAdmob.web.ts (no-op) on web and lib/initAdmob.ts on native.
import "@/lib/initAdmob";

SplashScreen.preventAutoHideAsync();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const queryClient = new QueryClient();

function RootLayoutNav() {
  const notificationListener = useRef<Notifications.EventSubscription>();
  const responseListener = useRef<Notifications.EventSubscription>();

  useEffect(() => {
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
      <Stack.Screen name="(admin)/events" options={{ headerShown: false }} />
      <Stack.Screen name="(admin)/revenue" options={{ headerShown: false }} />
      <Stack.Screen name="notifications" options={{ headerShown: false }} />
      <Stack.Screen name="payments" options={{ headerShown: false }} />
      <Stack.Screen name="settings" options={{ headerShown: false }} />
      <Stack.Screen name="legal/terms" options={{ headerShown: false, presentation: "modal" }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    ...Ionicons.font,
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
              </AuthProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
