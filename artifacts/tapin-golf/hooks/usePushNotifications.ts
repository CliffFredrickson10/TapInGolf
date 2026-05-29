import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { apiFetch } from "@/lib/api";

export async function registerForPushNotifications(userToken: string): Promise<void> {
  try {
    if (Platform.OS === "web") return;
    if (!Device.isDevice) return;

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
