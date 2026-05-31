import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
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

const PRESETS = [
  { label: "30 min", value: 30 },
  { label: "1 hour", value: 60 },
  { label: "90 min", value: 90 },
  { label: "2 hours", value: 120 },
  { label: "3 hours", value: 180 },
  { label: "6 hours", value: 360 },
  { label: "12 hours", value: 720 },
  { label: "24 hours", value: 1440 },
];

export default function ReminderSettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [currentMinutes, setCurrentMinutes] = useState<number>(120);
  const [customInput, setCustomInput]       = useState("");
  const [loading, setLoading]               = useState(true);
  const [saving, setSaving]                 = useState(false);
  const [toast, setToast]                   = useState<{ msg: string; error?: boolean } | null>(null);

  const showToast = (msg: string, error = false) => {
    setToast({ msg, error });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    if (!user?.is_super_user) return;
    apiFetch("/super/settings", user.token)
      .then((data) => {
        const v = parseInt(data.settings?.notify_minutes_before ?? "120", 10);
        setCurrentMinutes(isNaN(v) ? 120 : v);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  const save = async (minutes: number) => {
    if (!user) return;
    if (minutes < 5 || minutes > 1440) {
      showToast("Must be between 5 and 1440 minutes", true);
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/super/settings", user.token, {
        method: "PUT",
        body: JSON.stringify({ notify_minutes_before: String(minutes) }),
      });
      setCurrentMinutes(minutes);
      setCustomInput("");
      showToast(`Reminder set to ${formatMinutes(minutes)} before tee-off`);
    } catch (e: any) {
      showToast(e.message ?? "Could not save", true);
    }
    setSaving(false);
  };

  const handleCustomSave = () => {
    const n = parseInt(customInput.trim(), 10);
    if (isNaN(n)) { showToast("Enter a valid number", true); return; }
    save(n);
  };

  if (!user?.is_super_user) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Ionicons name="lock-closed-outline" size={48} color={colors.mutedForeground} />
        <Text style={[styles.blockedText, { color: colors.mutedForeground }]}>Access denied</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12, backgroundColor: colors.primary }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <View style={styles.backCircle}>
            <Ionicons name="arrow-back" size={20} color={colors.primary} />
          </View>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Reminder Settings</Text>
          <Text style={styles.headerSub}>Tee-time push notification timing</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: "#fff2" }]}>
          <Ionicons name="shield-checkmark" size={14} color="#fff" />
          <Text style={styles.badgeText}>SUPER</Text>
        </View>
      </View>

      {/* Toast */}
      {toast && (
        <View style={[styles.toast, { backgroundColor: toast.error ? colors.destructive : "#1a5c38" }]}>
          <Ionicons name={toast.error ? "alert-circle" : "checkmark-circle"} size={16} color="#fff" />
          <Text style={styles.toastText}>{toast.msg}</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <GolfBallLoader />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: Platform.OS === "web" ? 140 : 80, gap: 16 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Current value card */}
          <View style={[styles.currentCard, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "30" }]}>
            <View style={[styles.currentIcon, { backgroundColor: colors.primary }]}>
              <Ionicons name="alarm" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.currentLabel, { color: colors.mutedForeground }]}>Current reminder lead time</Text>
              <Text style={[styles.currentValue, { color: colors.primary }]}>
                {saving ? "Saving…" : formatMinutes(currentMinutes)} before tee-off
              </Text>
            </View>
          </View>

          {/* Description */}
          <View style={[styles.infoBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="information-circle-outline" size={18} color={colors.mutedForeground} />
            <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
              The background worker checks every minute and sends a push notification to each golfer
              with an upcoming confirmed booking. Each booking is notified exactly once.
              User notification preferences are respected — golfers who have turned off booking
              notifications will not receive reminders.
            </Text>
          </View>

          {/* Preset grid */}
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>QUICK PRESETS</Text>
          <View style={styles.presetGrid}>
            {PRESETS.map((p) => {
              const selected = p.value === currentMinutes;
              return (
                <TouchableOpacity
                  key={p.value}
                  style={[
                    styles.presetBtn,
                    {
                      backgroundColor: selected ? colors.primary : colors.card,
                      borderColor:     selected ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => save(p.value)}
                  disabled={saving}
                  activeOpacity={0.8}
                >
                  {saving && selected
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={[styles.presetText, { color: selected ? "#fff" : colors.foreground }]}>
                        {p.label}
                      </Text>
                  }
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Custom input */}
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>CUSTOM (MINUTES)</Text>
          <View style={[styles.customRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <TextInput
              style={[styles.customInput, { color: colors.foreground }]}
              value={customInput}
              onChangeText={setCustomInput}
              placeholder={`e.g. ${currentMinutes}`}
              placeholderTextColor={colors.mutedForeground}
              keyboardType="number-pad"
              maxLength={4}
              returnKeyType="done"
              onSubmitEditing={handleCustomSave}
            />
            <Text style={[styles.customUnit, { color: colors.mutedForeground }]}>min</Text>
            <TouchableOpacity
              style={[styles.customSaveBtn, { backgroundColor: colors.primary, opacity: customInput.length ? 1 : 0.4 }]}
              onPress={handleCustomSave}
              disabled={!customInput.length || saving}
            >
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.customSaveBtnText}>Set</Text>
              }
            </TouchableOpacity>
          </View>
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            Valid range: 5 – 1440 minutes (24 hours)
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins  = minutes % 60;
  if (hours === 0) return `${mins} min`;
  if (mins === 0)  return `${hours} hour${hours > 1 ? "s" : ""}`;
  return `${hours}h ${mins}m`;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  blockedText: { fontSize: 16, fontFamily: "Inter_500Medium" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 14,
  },
  backCircle: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "#fff",
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff" },
  headerSub:   { fontSize: 11, fontFamily: "Inter_400Regular", color: "#ffffff99", marginTop: 1 },
  badge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
  },
  badgeText: { color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },

  toast: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: 16, marginTop: 8,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
  },
  toastText: { color: "#fff", fontFamily: "Inter_500Medium", fontSize: 13, flex: 1 },

  currentCard: {
    flexDirection: "row", alignItems: "center", gap: 14,
    borderRadius: 16, borderWidth: 1.5, padding: 16,
  },
  currentIcon: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  currentLabel: { fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 2 },
  currentValue: { fontSize: 17, fontFamily: "Inter_700Bold" },

  infoBox: {
    flexDirection: "row", gap: 10,
    borderRadius: 12, borderWidth: 1, padding: 14,
    alignItems: "flex-start",
  },
  infoText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },

  sectionLabel: {
    fontSize: 11, fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8, textTransform: "uppercase",
  },

  presetGrid: {
    flexDirection: "row", flexWrap: "wrap", gap: 10,
  },
  presetBtn: {
    borderRadius: 12, borderWidth: 1.5,
    paddingHorizontal: 16, paddingVertical: 12,
    minWidth: 84, alignItems: "center", justifyContent: "center",
  },
  presetText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },

  customRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderRadius: 14, borderWidth: 1.5,
    paddingHorizontal: 14, height: 52,
  },
  customInput: { flex: 1, fontSize: 18, fontFamily: "Inter_600SemiBold" },
  customUnit:  { fontSize: 14, fontFamily: "Inter_400Regular" },
  customSaveBtn: {
    borderRadius: 10, paddingHorizontal: 18, paddingVertical: 8,
  },
  customSaveBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },
  hint: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: -8 },
});
