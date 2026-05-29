import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/lib/api";

// ─── Notification types ────────────────────────────────────────────
const TYPES = [
  {
    key: "course_closed",
    label: "Course Closed",
    icon: "rainy" as const,
    color: "#e53935",
    defaultTitle: "Course Closed",
    placeholder: "Due to flooding, the course is closed until further notice. We will notify you when it reopens.",
  },
  {
    key: "lightning",
    label: "Lightning Delay",
    icon: "flash" as const,
    color: "#f57c00",
    defaultTitle: "Lightning Delay",
    placeholder: "Play has been suspended due to lightning in the area. Please seek shelter. We will update you when it is safe to resume.",
  },
  {
    key: "course_open",
    label: "Course Reopened",
    icon: "checkmark-circle" as const,
    color: "#43a047",
    defaultTitle: "Course is Now Open",
    placeholder: "The course is now open and play can resume. Thank you for your patience.",
  },
  {
    key: "tee_shift",
    label: "Tee Time Shift",
    icon: "time" as const,
    color: "#1976d2",
    defaultTitle: "Tee Time Update",
    placeholder: "Due to a delay, your tee time has been shifted. Please see the updated details below.",
  },
  {
    key: "general",
    label: "General",
    icon: "megaphone" as const,
    color: "#546e7a",
    defaultTitle: "",
    placeholder: "Enter your message here…",
  },
] as const;

type NotifType = (typeof TYPES)[number]["key"];

// ─── Date filter options ────────────────────────────────────────────
const DATE_OPTS = [
  { key: "all",    label: "All Upcoming" },
  { key: "today",  label: "Today" },
  { key: "custom", label: "Pick Date" },
] as const;
type DateOpt = (typeof DATE_OPTS)[number]["key"];

function todayStr() { return new Date().toISOString().split("T")[0]; }

type HistoryItem = {
  id: number;
  type: string;
  title: string;
  body: string;
  tee_shift_minutes: number | null;
  affected_date: string | null;
  recipient_count: number;
  sent_at: string;
  sent_by_name: string;
};

const TYPE_META: Record<string, { color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  course_closed: { color: "#e53935", icon: "rainy" },
  lightning:     { color: "#f57c00", icon: "flash" },
  course_open:   { color: "#43a047", icon: "checkmark-circle" },
  tee_shift:     { color: "#1976d2", icon: "time" },
  general:       { color: "#546e7a", icon: "megaphone" },
};

// ─── Screen ────────────────────────────────────────────────────────
export default function BroadcastScreen() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const { user } = useAuth();

  // Compose state
  const [tab, setTab]             = useState<"compose" | "history">("compose");
  const [selectedType, setType]   = useState<NotifType>("course_closed");
  const [title, setTitle]         = useState("Course Closed");
  const [body, setBody]           = useState("");
  const [dateOpt, setDateOpt]     = useState<DateOpt>("all");
  const [customDate, setCustomDate] = useState(todayStr());
  const [shiftMins, setShiftMins] = useState("40");
  const [sending, setSending]     = useState(false);

  // Preview recipient count
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const previewDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // History
  const [history, setHistory]     = useState<HistoryItem[]>([]);
  const [histLoading, setHistLoading] = useState(false);

  const effectiveDate =
    dateOpt === "all"    ? null :
    dateOpt === "today"  ? todayStr() :
    customDate;

  // Fetch preview count whenever date changes
  const fetchPreview = useCallback(async () => {
    if (!user) return;
    try {
      const params = effectiveDate ? `?date=${effectiveDate}` : "";
      const data = await apiFetch(`/admin/notifications/preview${params}`, user.token);
      setPreviewCount(data.count ?? 0);
    } catch { setPreviewCount(null); }
  }, [user, effectiveDate]);

  useEffect(() => {
    clearTimeout(previewDebounce.current);
    previewDebounce.current = setTimeout(fetchPreview, 400);
    return () => clearTimeout(previewDebounce.current);
  }, [fetchPreview]);

  // Fetch history
  const fetchHistory = useCallback(async () => {
    if (!user) return;
    setHistLoading(true);
    try {
      const data = await apiFetch("/admin/notifications", user.token);
      setHistory(data.notifications ?? []);
    } catch {} finally { setHistLoading(false); }
  }, [user]);

  useEffect(() => { if (tab === "history") fetchHistory(); }, [tab, fetchHistory]);

  // When type changes, pre-fill title
  const handleTypeSelect = (t: NotifType) => {
    const meta = TYPES.find((x) => x.key === t)!;
    setType(t);
    setTitle(meta.defaultTitle);
    setBody("");
    Haptics.selectionAsync();
  };

  const currentTypeMeta = TYPES.find((t) => t.key === selectedType)!;

  const handleSend = async () => {
    if (!user) return;
    if (!title.trim() || !body.trim()) {
      Alert.alert("Missing fields", "Please enter both a title and a message.");
      return;
    }
    if (selectedType === "tee_shift" && (!shiftMins || isNaN(parseInt(shiftMins)))) {
      Alert.alert("Missing field", "Please enter the shift amount in minutes.");
      return;
    }
    if (dateOpt === "custom" && !/^\d{4}-\d{2}-\d{2}$/.test(customDate)) {
      Alert.alert("Invalid date", "Please enter a date in YYYY-MM-DD format.");
      return;
    }

    const recipientDesc =
      effectiveDate
        ? `golfers with bookings on ${effectiveDate}`
        : "all golfers with upcoming bookings";

    Alert.alert(
      "Send Notification",
      `This will send "${title}" to ${previewCount != null ? previewCount : "all"} ${recipientDesc}. Proceed?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send",
          style: "default",
          onPress: async () => {
            setSending(true);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            try {
              const data = await apiFetch("/admin/notifications/broadcast", user.token, {
                method: "POST",
                body: JSON.stringify({
                  type:              selectedType,
                  title:             title.trim(),
                  body:              body.trim(),
                  tee_shift_minutes: selectedType === "tee_shift" ? parseInt(shiftMins) : null,
                  affected_date:     effectiveDate,
                }),
              });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert(
                "Sent!",
                `Notification delivered to ${data.recipient_count} golfer${data.recipient_count !== 1 ? "s" : ""}.`,
                [{ text: "OK", onPress: () => { setTab("history"); fetchHistory(); } }]
              );
            } catch (err: any) {
              Alert.alert("Send failed", err.message ?? "Could not send notification.");
            } finally {
              setSending(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12, backgroundColor: colors.primary }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Broadcast Notification</Text>
          <Text style={styles.headerSub}>Send updates to booked golfers</Text>
        </View>
        <Ionicons name="megaphone" size={22} color="rgba(255,255,255,0.7)" />
      </View>

      {/* Tabs */}
      <View style={[styles.tabs, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {(["compose", "history"] as const).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => { setTab(t); Haptics.selectionAsync(); }}
          >
            <Text style={[styles.tabText, { color: tab === t ? colors.primary : colors.mutedForeground }]}>
              {t === "compose" ? "Compose" : "History"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === "compose" ? (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Type selector */}
          <View>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>NOTIFICATION TYPE</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 8 }}>
              {TYPES.map((t) => {
                const active = selectedType === t.key;
                return (
                  <TouchableOpacity
                    key={t.key}
                    style={[
                      styles.typePill,
                      { borderColor: active ? t.color : colors.border, backgroundColor: active ? t.color + "18" : colors.card },
                    ]}
                    onPress={() => handleTypeSelect(t.key)}
                    activeOpacity={0.75}
                  >
                    <Ionicons name={t.icon} size={16} color={active ? t.color : colors.mutedForeground} />
                    <Text style={[styles.typePillText, { color: active ? t.color : colors.mutedForeground }]}>{t.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Who to notify */}
          <View>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>NOTIFY GOLFERS WITH BOOKINGS ON</Text>
            <View style={styles.dateOptRow}>
              {DATE_OPTS.map((opt) => {
                const active = dateOpt === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[styles.dateOptBtn, {
                      backgroundColor: active ? colors.primary : colors.card,
                      borderColor:     active ? colors.primary : colors.border,
                    }]}
                    onPress={() => { setDateOpt(opt.key); Haptics.selectionAsync(); }}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.dateOptText, { color: active ? "#fff" : colors.foreground }]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {dateOpt === "custom" && (
              <TextInput
                style={[styles.dateInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                value={customDate}
                onChangeText={setCustomDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="numbers-and-punctuation"
              />
            )}
            {/* Recipient count badge */}
            <View style={[styles.recipientBadge, { backgroundColor: colors.primary + "14", borderColor: colors.primary + "44" }]}>
              <Ionicons name="people" size={16} color={colors.primary} />
              <Text style={[styles.recipientText, { color: colors.primary }]}>
                {previewCount == null
                  ? "Loading recipient count…"
                  : previewCount === 0
                    ? "No booked golfers match this filter"
                    : `${previewCount} golfer${previewCount !== 1 ? "s" : ""} will receive this notification`}
              </Text>
            </View>
          </View>

          {/* Tee shift input */}
          {selectedType === "tee_shift" && (
            <View>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>TEE TIME SHIFT</Text>
              <Text style={[styles.helpText, { color: colors.mutedForeground }]}>
                Enter the shift in minutes. Use a positive number to push times later (e.g. 40 = 40 min delay), or negative to bring them forward (e.g. -20 = 20 min earlier).
              </Text>
              <View style={styles.shiftRow}>
                <TouchableOpacity
                  style={[styles.shiftBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => { setShiftMins((v) => String(Math.max(-120, (parseInt(v) || 0) - 5))); Haptics.selectionAsync(); }}
                >
                  <Ionicons name="remove" size={20} color={colors.foreground} />
                </TouchableOpacity>
                <TextInput
                  style={[styles.shiftInput, { borderColor: colors.primary, color: colors.foreground, backgroundColor: colors.background }]}
                  value={shiftMins}
                  onChangeText={setShiftMins}
                  keyboardType="numbers-and-punctuation"
                  textAlign="center"
                />
                <Text style={[styles.shiftLabel, { color: colors.mutedForeground }]}>minutes</Text>
                <TouchableOpacity
                  style={[styles.shiftBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => { setShiftMins((v) => String(Math.min(240, (parseInt(v) || 0) + 5))); Haptics.selectionAsync(); }}
                >
                  <Ionicons name="add" size={20} color={colors.foreground} />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Title */}
          <View>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>TITLE</Text>
            <TextInput
              style={[styles.inputField, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
              value={title}
              onChangeText={setTitle}
              placeholder="Notification title"
              placeholderTextColor={colors.mutedForeground}
              maxLength={80}
            />
            <Text style={[styles.charCount, { color: colors.mutedForeground }]}>{title.length}/80</Text>
          </View>

          {/* Body */}
          <View>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>MESSAGE</Text>
            <TextInput
              style={[styles.bodyField, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
              value={body}
              onChangeText={setBody}
              placeholder={currentTypeMeta.placeholder}
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={4}
              maxLength={400}
              textAlignVertical="top"
            />
            <Text style={[styles.charCount, { color: colors.mutedForeground }]}>{body.length}/400</Text>
          </View>

          {/* Preview card */}
          {(title.trim() || body.trim()) && (
            <View style={[styles.previewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.previewLabel, { color: colors.mutedForeground }]}>PREVIEW</Text>
              <View style={styles.previewRow}>
                <View style={[styles.previewIcon, { backgroundColor: currentTypeMeta.color + "18" }]}>
                  <Ionicons name={currentTypeMeta.icon} size={22} color={currentTypeMeta.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.previewTitle, { color: colors.foreground }]} numberOfLines={1}>
                    {title.trim() || "Notification title"}
                  </Text>
                  <Text style={[styles.previewBody, { color: colors.mutedForeground }]} numberOfLines={3}>
                    {body.trim() || "Your message will appear here."}
                    {selectedType === "tee_shift" && shiftMins
                      ? parseInt(shiftMins) > 0
                        ? ` (pushed out by ${shiftMins} min)`
                        : ` (brought forward by ${Math.abs(parseInt(shiftMins))} min)`
                      : ""}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Send button */}
          <TouchableOpacity
            style={[
              styles.sendBtn,
              {
                backgroundColor:
                  sending || previewCount === 0
                    ? colors.muted
                    : currentTypeMeta.color,
              },
            ]}
            onPress={handleSend}
            disabled={sending || previewCount === 0}
            activeOpacity={0.85}
          >
            {sending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="send" size={18} color="#fff" />
                <Text style={styles.sendBtnText}>
                  Send to {previewCount ?? "…"} Golfer{previewCount !== 1 ? "s" : ""}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      ) : (
        /* History tab */
        <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {histLoading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : history.length === 0 ? (
            <View style={styles.center}>
              <Ionicons name="megaphone-outline" size={44} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No broadcasts sent yet</Text>
            </View>
          ) : (
            history.map((item) => {
              const meta = TYPE_META[item.type] ?? TYPE_META.general;
              const dateLabel = item.affected_date ?? "All upcoming";
              const sentDate  = new Date(item.sent_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
              const shiftLabel =
                item.tee_shift_minutes != null
                  ? item.tee_shift_minutes > 0
                    ? ` · +${item.tee_shift_minutes} min shift`
                    : ` · ${item.tee_shift_minutes} min shift`
                  : "";
              return (
                <View key={item.id} style={[styles.historyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.historyHeader}>
                    <View style={[styles.historyIcon, { backgroundColor: meta.color + "18" }]}>
                      <Ionicons name={meta.icon} size={18} color={meta.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.historyTitle, { color: colors.foreground }]}>{item.title}</Text>
                      <Text style={[styles.historyMeta, { color: colors.mutedForeground }]}>
                        {sentDate} · {dateLabel}{shiftLabel}
                      </Text>
                    </View>
                    <View style={[styles.recipientPill, { backgroundColor: meta.color + "18" }]}>
                      <Text style={[styles.recipientPillText, { color: meta.color }]}>{item.recipient_count}</Text>
                    </View>
                  </View>
                  <Text style={[styles.historyBody, { color: colors.mutedForeground }]} numberOfLines={2}>
                    {item.body}
                  </Text>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header:         { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingBottom: 16 },
  backBtn:        { padding: 4 },
  headerTitle:    { color: "#fff", fontSize: 18, fontFamily: "Inter_700Bold" },
  headerSub:      { color: "rgba(255,255,255,0.75)", fontSize: 12, fontFamily: "Inter_400Regular" },
  tabs:           { flexDirection: "row", borderBottomWidth: 1 },
  tab:            { flex: 1, alignItems: "center", paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabText:        { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  sectionLabel:   { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.5, marginBottom: 6 },
  helpText:       { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17, marginBottom: 8 },
  typePill:       { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  typePillText:   { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  dateOptRow:     { flexDirection: "row", gap: 8, marginBottom: 8 },
  dateOptBtn:     { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 10, borderWidth: 1 },
  dateOptText:    { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  dateInput:      { height: 42, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, fontSize: 15, fontFamily: "Inter_400Regular", marginBottom: 8 },
  recipientBadge: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 10, padding: 10 },
  recipientText:  { fontSize: 13, fontFamily: "Inter_500Medium", flex: 1 },
  shiftRow:       { flexDirection: "row", alignItems: "center", gap: 10 },
  shiftBtn:       { width: 40, height: 40, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  shiftInput:     { width: 72, height: 44, borderWidth: 2, borderRadius: 10, fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  shiftLabel:     { fontSize: 13, fontFamily: "Inter_400Regular" },
  inputField:     { height: 46, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, fontSize: 15, fontFamily: "Inter_400Regular" },
  bodyField:      { minHeight: 100, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, fontFamily: "Inter_400Regular" },
  charCount:      { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "right", marginTop: 3 },
  previewCard:    { borderRadius: 14, borderWidth: 1, padding: 14 },
  previewLabel:   { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.5, marginBottom: 8 },
  previewRow:     { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  previewIcon:    { width: 42, height: 42, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  previewTitle:   { fontSize: 14, fontFamily: "Inter_700Bold", marginBottom: 3 },
  previewBody:    { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  sendBtn:        { height: 54, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  sendBtnText:    { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  center:         { paddingTop: 48, alignItems: "center", gap: 12 },
  emptyText:      { fontSize: 15, fontFamily: "Inter_400Regular" },
  historyCard:    { borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
  historyHeader:  { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  historyIcon:    { width: 36, height: 36, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  historyTitle:   { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  historyMeta:    { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  historyBody:    { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  recipientPill:  { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, minWidth: 32, alignItems: "center" },
  recipientPillText: { fontSize: 13, fontFamily: "Inter_700Bold" },
});
