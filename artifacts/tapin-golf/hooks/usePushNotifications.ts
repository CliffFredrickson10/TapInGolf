import Constants from "expo-constants";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { apiFetch } from "@/lib/api";

// Remote push notifications were removed from Expo Go in SDK 53.
// Skip registration entirely when running inside Expo Go.
// expo-notifications is required lazily so its module-level console.error
// (which fires in Expo Go just from importing it) is never triggered.
const isExpoGo = Constants.appOwnership === "expo";

export async function registerForPushNotifications(userToken: string): Promise<void> {
  try {
    if (Platform.OS === "web") return;
    if (!Device.isDevice) return;
    if (isExpoGo) return;

    const Notifications: typeof import("expo-notifications") = require("expo-notifications");

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") return;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      (Constants as any).easConfig?.projectId;

    const tokenData = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();

    await apiFetch("/profile/push-token", userToken, {
      method: "PUT",
      body: JSON.stringify({ push_token: tokenData.data }),
    });
  } catch {
  }
}
