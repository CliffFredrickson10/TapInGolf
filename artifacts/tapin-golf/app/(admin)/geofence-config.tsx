import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import GolfBallLoader from "@/components/GolfBallLoader";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/lib/api";
import { getGeofencingStatus, startGeofencing } from "@/lib/geofencing";
import { AppHeader } from "@/components/AppHeader";

type ClubGeo = {
  id: number;
  name: string;
  location: string;
  province: string;
  latitude: string | null;
  longitude: string | null;
  geofence_enabled: boolean;
  geofence_radius_m: number;
  ninth_tee_lat: number | null;
  ninth_tee_lng: number | null;
  ninth_tee_radius_m: number;
};

type EditState = {
  geofence_enabled: boolean;
  geofence_radius_m: string;
  ninth_tee_enabled: boolean;
  ninth_tee_lat: string;
  ninth_tee_lng: string;
  ninth_tee_radius_m: string;
};

export default function GeofenceConfigScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [clubs, setClubs]               = useState<ClubGeo[]>([]);
  const [loading, setLoading]           = useState(true);
  const [expandedId, setExpandedId]     = useState<number | null>(null);
  const [edits, setEdits]               = useState<Record<number, EditState>>({});
  const [saving, setSaving]             = useState<Record<number, boolean>>({});
  const [geoActive, setGeoActive]       = useState(false);
  const [search, setSearch]             = useState("");

  const fetchClubs = useCallback(async () => {
    if (!user) return;
    try {
      const data = await apiFetch("/admin/clubs", user.token);
      setClubs(data.clubs ?? []);
      // Prime edit state for each club
      const initial: Record<number, EditState> = {};
      (data.clubs ?? []).forEach((c: ClubGeo) => {
        initial[c.id] = {
          geofence_enabled:  c.geofence_enabled,
          geofence_radius_m: String(c.geofence_radius_m ?? 200),
          ninth_tee_enabled: !!(c.ninth_tee_lat && c.ninth_tee_lng),
          ninth_tee_lat:     c.ninth_tee_lat  != null ? String(c.ninth_tee_lat)  : "",
          ninth_tee_lng:     c.ninth_tee_lng  != null ? String(c.ninth_tee_lng)  : "",
          ninth_tee_radius_m: String(c.ninth_tee_radius_m ?? 50),
        };
      });
      setEdits(initial);
    } catch {}
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchClubs();
    getGeofencingStatus().then((s) => setGeoActive(s.active));
  }, [fetchClubs]);

  const patchEdit = (clubId: number, patch: Partial<EditState>) => {
    setEdits((prev) => ({ ...prev, [clubId]: { ...prev[clubId], ...patch } }));
  };

  const handleSave = async (club: ClubGeo) => {
    if (!user) return;
    const e = edits[club.id];
    if (!e) return;
    setSaving((s) => ({ ...s, [club.id]: true }));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await apiFetch(`/admin/clubs/${club.id}/geofence`, user.token, {
        method: "PATCH",
        body: JSON.stringify({
          geofence_enabled:  e.geofence_enabled,
          geofence_radius_m: parseInt(e.geofence_radius_m) || 200,
          ninth_tee_lat:     e.ninth_tee_enabled && e.ninth_tee_lat  ? parseFloat(e.ninth_tee_lat)  : null,
          ninth_tee_lng:     e.ninth_tee_enabled && e.ninth_tee_lng  ? parseFloat(e.ninth_tee_lng)  : null,
          ninth_tee_radius_m: parseInt(e.ninth_tee_radius_m) || 50,
        }),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Refresh geofences on device
      startGeofencing(user.token);
      await fetchClubs();
    } catch {
      Alert.alert("Save failed", "Could not update geofence settings. Please try again.");
    } finally {
      setSaving((s) => ({ ...s, [club.id]: false }));
    }
  };

  const filtered = clubs.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.location.toLowerCase().includes(search.toLowerCase()) ||
      c.province.toLowerCase().includes(search.toLowerCase())
  );

  const enabledCount = clubs.filter((c) => edits[c.id]?.geofence_enabled).length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader />
      {/* Header */}
      <View
        style={[
          styles.header,
          { paddingTop: 12, backgroundColor: colors.primary },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Geofence Configuration</Text>
          <Text style={styles.headerSub}>
            {user?.club_id != null
              ? clubs[0]?.name ?? "Your club"
              : `${enabledCount} club${enabledCount !== 1 ? "s" : ""} with geofencing enabled`}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: geoActive ? "#4caf50" : "#ff9800" }]}>
          <View style={[styles.statusDot, { backgroundColor: "#fff" }]} />
          <Text style={styles.statusText}>{geoActive ? "Active" : "Inactive"}</Text>
        </View>
      </View>

      {/* Info banner */}
      <View style={[styles.infoBanner, { backgroundColor: colors.accent + "18", borderColor: colors.accent + "44" }]}>
        <Ionicons name="information-circle-outline" size={18} color={colors.accent} />
        <Text style={[styles.infoText, { color: colors.foreground }]}>
          Enable geofencing per club to send automatic push notifications when golfers arrive at the club or approach the 9th tee. Requires a development build for full background support.
        </Text>
      </View>

      {/* Search — only shown for platform admins with many clubs */}
      {user?.club_id == null && (
        <View style={[styles.searchRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="search" size={18} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search clubs…"
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <GolfBallLoader />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {filtered.map((club) => {
            const e = edits[club.id];
            if (!e) return null;
            const isExpanded = expandedId === club.id;
            const hasCoords  = !!club.latitude && !!club.longitude;

            return (
              <View
                key={club.id}
                style={[
                  styles.clubCard,
                  { backgroundColor: colors.card, borderColor: e.geofence_enabled ? colors.primary + "55" : colors.border },
                  e.geofence_enabled && { borderWidth: 1.5 },
                ]}
              >
                {/* Club header row */}
                <TouchableOpacity
                  style={styles.clubRow}
                  onPress={() => setExpandedId(isExpanded ? null : club.id)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.clubIcon, { backgroundColor: e.geofence_enabled ? colors.primary + "18" : colors.muted }]}>
                    <Ionicons
                      name={e.geofence_enabled ? "radio" : "radio-outline"}
                      size={20}
                      color={e.geofence_enabled ? colors.primary : colors.mutedForeground}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.clubName, { color: colors.foreground }]}>{club.name}</Text>
                    <Text style={[styles.clubSub, { color: colors.mutedForeground }]}>
                      {club.location} · {club.province}
                      {!hasCoords ? " · ⚠ No GPS coordinates" : ""}
                    </Text>
                  </View>
                  <Switch
                    value={e.geofence_enabled}
                    onValueChange={(v) => {
                      Haptics.selectionAsync();
                      patchEdit(club.id, { geofence_enabled: v });
                      if (v && !isExpanded) setExpandedId(club.id);
                    }}
                    trackColor={{ true: colors.primary, false: colors.muted }}
                    thumbColor="#fff"
                  />
                </TouchableOpacity>

                {/* Expanded config */}
                {isExpanded && (
                  <View style={[styles.expandedSection, { borderTopColor: colors.border }]}>
                    {/* Club perimeter */}
                    <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
                      CLUB PERIMETER NOTIFICATION
                    </Text>
                    <Text style={[styles.helpText, { color: colors.mutedForeground }]}>
                      Triggers a welcome notification when a golfer enters this radius around the club entrance.
                    </Text>
                    <View style={styles.inputRow}>
                      <Text style={[styles.inputLabel, { color: colors.foreground }]}>Radius (metres)</Text>
                      <TextInput
                        style={[styles.inputField, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                        value={e.geofence_radius_m}
                        onChangeText={(v) => patchEdit(club.id, { geofence_radius_m: v })}
                        keyboardType="number-pad"
                        placeholder="200"
                        placeholderTextColor={colors.mutedForeground}
                      />
                    </View>
                    {club.latitude && club.longitude && (
                      <Text style={[styles.coordsHint, { color: colors.mutedForeground }]}>
                        Club GPS: {parseFloat(club.latitude).toFixed(5)}, {parseFloat(club.longitude).toFixed(5)}
                      </Text>
                    )}

                    {/* 9th tee */}
                    <View style={[styles.divider, { backgroundColor: colors.border }]} />
                    <View style={styles.toggleRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
                          9TH TEE FOOD ORDER ALERT
                        </Text>
                        <Text style={[styles.helpText, { color: colors.mutedForeground }]}>
                          Prompts golfers to place their halfway house order before reaching the 9th tee.
                        </Text>
                      </View>
                      <Switch
                        value={e.ninth_tee_enabled}
                        onValueChange={(v) => { Haptics.selectionAsync(); patchEdit(club.id, { ninth_tee_enabled: v }); }}
                        trackColor={{ true: colors.primary, false: colors.muted }}
                        thumbColor="#fff"
                      />
                    </View>

                    {e.ninth_tee_enabled && (
                      <>
                        <Text style={[styles.helpText, { color: colors.mutedForeground, marginTop: 4 }]}>
                          Enter the GPS coordinates of the 9th tee box. Use Google Maps → long-press to copy coordinates.
                        </Text>
                        {[
                          { label: "Latitude",  key: "ninth_tee_lat" as const,  placeholder: "-26.1234567" },
                          { label: "Longitude", key: "ninth_tee_lng" as const,  placeholder: "28.0567890" },
                        ].map((f) => (
                          <View key={f.key} style={styles.inputRow}>
                            <Text style={[styles.inputLabel, { color: colors.foreground }]}>{f.label}</Text>
                            <TextInput
                              style={[styles.inputField, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                              value={e[f.key]}
                              onChangeText={(v) => patchEdit(club.id, { [f.key]: v })}
                              keyboardType="decimal-pad"
                              placeholder={f.placeholder}
                              placeholderTextColor={colors.mutedForeground}
                            />
                          </View>
                        ))}
                        <View style={styles.inputRow}>
                          <Text style={[styles.inputLabel, { color: colors.foreground }]}>Alert Radius (m)</Text>
                          <TextInput
                            style={[styles.inputField, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                            value={e.ninth_tee_radius_m}
                            onChangeText={(v) => patchEdit(club.id, { ninth_tee_radius_m: v })}
                            keyboardType="number-pad"
                            placeholder="50"
                            placeholderTextColor={colors.mutedForeground}
                          />
                        </View>
                      </>
                    )}

                    {/* Save */}
                    <TouchableOpacity
                      style={[styles.saveBtn, { backgroundColor: saving[club.id] ? colors.muted : colors.primary }]}
                      onPress={() => handleSave(club)}
                      disabled={!!saving[club.id]}
                      activeOpacity={0.85}
                    >
                      {saving[club.id] ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.saveBtnText}>Save Changes</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}

          {filtered.length === 0 && (
            <View style={styles.center}>
              <Ionicons name="search-outline" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No clubs match "{search}"</Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header:        { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingBottom: 16 },
  backBtn:       { padding: 4 },
  headerTitle:   { color: "#fff", fontSize: 18, fontFamily: "Inter_700Bold" },
  headerSub:     { color: "rgba(255,255,255,0.75)", fontSize: 12, fontFamily: "Inter_400Regular" },
  statusBadge:   { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  statusDot:     { width: 6, height: 6, borderRadius: 3 },
  statusText:    { color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold" },
  infoBanner:    { flexDirection: "row", gap: 10, alignItems: "flex-start", borderWidth: 1, borderRadius: 12, margin: 16, marginBottom: 0, padding: 12 },
  infoText:      { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
  searchRow:     { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 12, marginHorizontal: 16, marginTop: 12, marginBottom: 4, paddingHorizontal: 12, height: 44 },
  searchInput:   { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  center:        { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingTop: 40 },
  emptyText:     { fontSize: 15, fontFamily: "Inter_400Regular" },
  clubCard:      { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  clubRow:       { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  clubIcon:      { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  clubName:      { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  clubSub:       { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  expandedSection: { borderTopWidth: 1, padding: 14, gap: 8 },
  sectionLabel:  { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.5, marginTop: 4 },
  helpText:      { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  inputRow:      { flexDirection: "row", alignItems: "center", gap: 12 },
  inputLabel:    { width: 130, fontSize: 13, fontFamily: "Inter_500Medium" },
  inputField:    { flex: 1, height: 40, borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 10, fontSize: 14, fontFamily: "Inter_400Regular" },
  coordsHint:    { fontSize: 11, fontFamily: "Inter_400Regular" },
  divider:       { height: 1, marginVertical: 4 },
  toggleRow:     { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  saveBtn:       { height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 8 },
  saveBtnText:   { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
});
