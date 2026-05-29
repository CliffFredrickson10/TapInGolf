import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";

import { API_BASE } from "./api";

export const GEOFENCE_TASK = "TAPIN_GEOFENCE";

// -----------------------------------------------------------------
// Background task — MUST be defined at module load time (top-level)
// This file must be imported once in the app root (_layout.tsx)
// -----------------------------------------------------------------
TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }: any) => {
  if (error) return;

  const { eventType, region } = data as {
    eventType: Location.GeofencingEventType;
    region: Location.LocationRegion;
  };

  if (eventType !== Location.GeofencingEventType.Enter) return;

  let meta: { type: string; clubName: string; clubId: number };
  try {
    meta = JSON.parse(region.identifier);
  } catch {
    return;
  }

  if (meta.type === "club") {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `Welcome to ${meta.clubName}! ⛳`,
        body: "Your TapIn Golf booking is confirmed. Enjoy your round!",
        data: { type: "geofence_welcome", club_id: meta.clubId },
      },
      trigger: null,
    });
  } else if (meta.type === "ninth_tee") {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Halfway House Alert 🍽️",
        body: `Approaching the 9th tee at ${meta.clubName} — place your food & drinks order now to beat the queue!`,
        data: { type: "geofence_ninth_tee", club_id: meta.clubId },
      },
      trigger: null,
    });
  }
});

// -----------------------------------------------------------------
// Start geofencing — call after login / app restore
// -----------------------------------------------------------------
export async function startGeofencing(userToken: string): Promise<void> {
  try {
    if (Platform.OS === "web") return;

    // Stop any previously registered regions first
    const wasRunning = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK).catch(() => false);
    if (wasRunning) {
      await Location.stopGeofencingAsync(GEOFENCE_TASK).catch(() => {});
    }

    // Foreground permission is required before background can be requested
    const { status: fg } = await Location.requestForegroundPermissionsAsync();
    if (fg !== "granted") return;

    const { status: bg } = await Location.requestBackgroundPermissionsAsync();
    if (bg !== "granted") return;

    // Fetch clubs that have geofencing turned on
    const res = await fetch(`${API_BASE}/clubs/geofences`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    if (!res.ok) return;

    const data = await res.json();
    const clubs: any[] = data.clubs ?? [];
    if (clubs.length === 0) return;

    // Build Expo region array
    const regions: Location.LocationRegion[] = [];

    clubs.forEach((club) => {
      if (club.latitude && club.longitude) {
        regions.push({
          identifier: JSON.stringify({ type: "club", clubName: club.name, clubId: club.id }),
          latitude:   parseFloat(club.latitude),
          longitude:  parseFloat(club.longitude),
          radius:     club.geofence_radius_m ?? 200,
          notifyOnEnter: true,
          notifyOnExit:  false,
        });
      }

      if (club.ninth_tee_lat && club.ninth_tee_lng) {
        regions.push({
          identifier: JSON.stringify({ type: "ninth_tee", clubName: club.name, clubId: club.id }),
          latitude:   parseFloat(club.ninth_tee_lat),
          longitude:  parseFloat(club.ninth_tee_lng),
          radius:     club.ninth_tee_radius_m ?? 50,
          notifyOnEnter: true,
          notifyOnExit:  false,
        });
      }
    });

    if (regions.length === 0) return;

    await Location.startGeofencingAsync(GEOFENCE_TASK, regions);
  } catch {
    // Graceful degradation in Expo Go or when background permissions are denied
  }
}

// -----------------------------------------------------------------
// Stop geofencing — call on logout
// -----------------------------------------------------------------
export async function stopGeofencing(): Promise<void> {
  try {
    if (Platform.OS === "web") return;
    const wasRunning = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK).catch(() => false);
    if (wasRunning) {
      await Location.stopGeofencingAsync(GEOFENCE_TASK);
    }
  } catch {}
}

// -----------------------------------------------------------------
// Status helper — used by the admin geofence config screen
// -----------------------------------------------------------------
export async function getGeofencingStatus(): Promise<{ active: boolean }> {
  try {
    if (Platform.OS === "web") return { active: false };
    const active = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK).catch(() => false);
    return { active };
  } catch {
    return { active: false };
  }
}
