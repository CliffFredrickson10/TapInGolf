import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import React from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/lib/api";

const fmtDate = (dateStr?: string | null): string => {
  if (!dateStr) return "";
  const d = new Date(String(dateStr).slice(0, 10));
  if (isNaN(d.getTime())) return String(dateStr).slice(0, 10);
  return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
};

interface Submission {
  id: number;
  hna_number: string;
  status: "pending" | "approved" | "rejected";
  review_note: string | null;
  valid_until: string | null;
  created_at: string;
  reviewed_at: string | null;
}

interface HnaStatus {
  hna_number: string | null;
  hna_verified: boolean;
  hna_verified_source: "club" | "tapin" | null;
  hna_verified_club_name: string | null;
  hna_valid_until: string | null;
  submission: Submission | null;
  rejected_count: number;
}

interface ClubResult {
  id: number;
  name: string;
  location: string | null;
}

const MAX_ATTEMPTS = 2;
const SUPPORT_EMAIL = "support@tapingolf.co.za";

export default function HnaVerificationCard({
  token,
  onVerified,
}: {
  token: string;
  onVerified?: () => void;
}) {
  const colors = useColors();
  const [loading, setLoading] = React.useState(true);
  const [status, setStatus] = React.useState<HnaStatus | null>(null);
  const [hnaNumber, setHnaNumber] = React.useState("");
  const [clubSearch, setClubSearch] = React.useState("");
  const [clubResults, setClubResults] = React.useState<ClubResult[]>([]);
  const [selectedClub, setSelectedClub] = React.useState<string | null>(null);
  const [clubSearching, setClubSearching] = React.useState(false);
  const [image, setImage] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = React.useCallback(async () => {
    try {
      const data = (await apiFetch("/hna/verification", token, { cache: "no-store" } as any)) as HnaStatus;
      setStatus(data);
      if (data.hna_number && data.hna_number !== "null") setHnaNumber(data.hna_number);
      else if (data.submission?.hna_number) setHnaNumber(data.submission.hna_number);
    } catch {}
    finally { setLoading(false); }
  }, [token]);

  React.useEffect(() => { load(); }, [load]);

  const searchClubs = React.useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) { setClubResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setClubSearching(true);
      try {
        const data = (await apiFetch(`/clubs?q=${encodeURIComponent(q)}&limit=10`, token)) as any;
        setClubResults(data.clubs ?? []);
      } catch { setClubResults([]); }
      finally { setClubSearching(false); }
    }, 300);
  }, [token]);

  const pickImage = async () => {
    try {
      if (Platform.OS !== "web") {
        const { status: perm } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (perm !== "granted") return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.6,
        base64: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const b64 = asset.base64;
      if (!b64) return;
      const mimeType = asset.mimeType ?? "image/jpeg";
      setImage(`data:${mimeType};base64,${b64}`);
      Haptics.selectionAsync();
    } catch {}
  };

  const submit = async () => {
    setError("");
    if (hnaNumber.replace(/\D/g, "").length !== 10) {
      setError("HNA number must be exactly 10 digits"); return;
    }
    if (!selectedClub) {
      setError("Please select your home club"); return;
    }
    if (!image) { setError("Please attach a photo of your HNA card"); return; }
    setSubmitting(true);
    try {
      await apiFetch("/hna/verification", token, {
        method: "POST",
        body: JSON.stringify({
          hna_number: hnaNumber.replace(/\D/g, ""),
          card_image: image,
          home_club: selectedClub,
        }),
      });
      setImage(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await load();
      onVerified?.();
    } catch (err: any) {
      setError(err.message ?? "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  // ── Verified ──────────────────────────────────────────────────────────────
  if (status?.hna_verified) {
    const isClubSource = status.hna_verified_source === "club";
    const verifierLine = isClubSource
      ? status.hna_verified_club_name
        ? `Verified by ${status.hna_verified_club_name}`
        : "Verified by your club"
      : "Verified by TapIn";
    const tapinClubLine =
      !isClubSource && status.hna_verified_club_name
        ? `Home Club: ${status.hna_verified_club_name}`
        : null;

    return (
      <View style={[styles.card, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "40" }]}>
        <View style={styles.headerRow}>
          <Ionicons name="shield-checkmark" size={20} color={colors.primary} />
          <Text style={[styles.title, { color: colors.foreground }]}>HNA Verified</Text>
        </View>
        <Text style={[styles.numberText, { color: colors.foreground }]}>{status.hna_number || "—"}</Text>
        <Text style={[styles.muted, { color: colors.mutedForeground }]}>
          {verifierLine}
          {status.hna_valid_until ? ` · valid until ${fmtDate(status.hna_valid_until)}` : ""}
        </Text>
        {tapinClubLine ? (
          <Text style={[styles.muted, { color: colors.mutedForeground }]}>{tapinClubLine}</Text>
        ) : null}
      </View>
    );
  }

  // ── Pending review ─────────────────────────────────────────────────────────
  if (status?.submission?.status === "pending") {
    return (
      <View style={[styles.card, { backgroundColor: "#f59e0b14", borderColor: "#f59e0b55" }]}>
        <View style={styles.headerRow}>
          <Ionicons name="hourglass-outline" size={20} color="#b45309" />
          <Text style={[styles.title, { color: colors.foreground }]}>HNA Card Under Review</Text>
        </View>
        <Text style={[styles.numberText, { color: colors.foreground }]}>{status.submission.hna_number}</Text>
        <Text style={[styles.muted, { color: colors.mutedForeground }]}>
          TapIn is reviewing your card photo. You'll be notified once it's approved — then you get affiliated-visitor rates.
        </Text>
      </View>
    );
  }

  const rejectedCount = status?.rejected_count ?? 0;

  // ── Blocked — max attempts reached ────────────────────────────────────────
  if (rejectedCount >= MAX_ATTEMPTS) {
    return (
      <View style={[styles.card, { backgroundColor: colors.destructive + "0d", borderColor: colors.destructive + "40" }]}>
        <View style={styles.headerRow}>
          <Ionicons name="alert-circle" size={20} color={colors.destructive} />
          <Text style={[styles.title, { color: colors.foreground }]}>Verification Unavailable</Text>
        </View>
        <Text style={[styles.muted, { color: colors.mutedForeground }]}>
          You've reached the maximum number of verification attempts. Please contact TapIn support for further assistance.
        </Text>
        <TouchableOpacity
          style={[styles.supportBtn, { backgroundColor: colors.destructive }]}
          onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=HNA%20Verification%20Assistance`)}
          activeOpacity={0.85}
        >
          <Ionicons name="mail-outline" size={16} color="#fff" />
          <Text style={styles.supportBtnText}>{SUPPORT_EMAIL}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const rejected = status?.submission?.status === "rejected";
  const isFinalAttempt = rejectedCount === 1;

  // ── Submission form ────────────────────────────────────────────────────────
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.headerRow}>
        <Ionicons name="card-outline" size={20} color={colors.primary} />
        <Text style={[styles.title, { color: colors.foreground }]}>Verify your HNA card</Text>
        <View style={[
          styles.attemptBadge,
          { backgroundColor: isFinalAttempt ? colors.destructive + "20" : colors.primary + "14" },
        ]}>
          <Text style={[
            styles.attemptText,
            { color: isFinalAttempt ? colors.destructive : colors.primary },
          ]}>
            {isFinalAttempt ? "Final attempt" : `Attempt ${rejectedCount + 1} of ${MAX_ATTEMPTS}`}
          </Text>
        </View>
      </View>

      <Text style={[styles.muted, { color: colors.mutedForeground }]}>
        Submit your SA Player ID (HNA) number and a clear photo of the physical card. Once TapIn verifies it, you'll unlock affiliated-visitor rates.
      </Text>

      {rejected && status?.submission ? (
        <View style={[styles.rejectBox, { backgroundColor: colors.destructive + "12", borderColor: colors.destructive + "40" }]}>
          <Ionicons name="close-circle" size={15} color={colors.destructive} />
          <Text style={[styles.rejectText, { color: colors.destructive }]}>
            Rejected{status.submission.review_note ? `: ${status.submission.review_note}` : " — please submit a clearer photo."}
            {isFinalAttempt ? " This is your final attempt." : ""}
          </Text>
        </View>
      ) : null}

      {/* ── HNA Number ─────────────────────────────── */}
      <Text style={[styles.label, { color: colors.mutedForeground }]}>HNA Membership Number *</Text>
      <TextInput
        style={[styles.input, {
          borderColor: hnaNumber && hnaNumber.replace(/\D/g, "").length !== 10
            ? colors.destructive : colors.border,
          color: colors.foreground,
          backgroundColor: colors.background,
        }]}
        value={hnaNumber}
        onChangeText={(t) => setHnaNumber(t.replace(/\D/g, "").slice(0, 10))}
        placeholder="10-digit number"
        placeholderTextColor={colors.mutedForeground}
        keyboardType="number-pad"
        maxLength={10}
      />

      {/* ── Home Club search ───────────────────────── */}
      <Text style={[styles.label, { color: colors.mutedForeground }]}>Home Club *</Text>
      {selectedClub ? (
        <View style={[styles.selectedClub, { borderColor: colors.primary + "55", backgroundColor: colors.primary + "0a" }]}>
          <Ionicons name="golf-outline" size={15} color={colors.primary} />
          <Text style={[styles.selectedClubText, { color: colors.foreground }]} numberOfLines={1}>
            {selectedClub}
          </Text>
          <TouchableOpacity onPress={() => { setSelectedClub(null); setClubSearch(""); }}>
            <Ionicons name="close-circle" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>
      ) : (
        <View>
          <View style={[styles.inputWrapper, { borderColor: colors.border, backgroundColor: colors.background }]}>
            <Ionicons name="search-outline" size={16} color={colors.mutedForeground} />
            <TextInput
              style={[styles.searchInput, { color: colors.foreground }]}
              value={clubSearch}
              onChangeText={(t) => { setClubSearch(t); searchClubs(t); }}
              placeholder="Search all 509 SA golf clubs…"
              placeholderTextColor={colors.mutedForeground}
              returnKeyType="search"
            />
            {clubSearching ? <ActivityIndicator size="small" color={colors.primary} /> : null}
          </View>
          {clubResults.length > 0 ? (
            <View style={[styles.clubDropdown, { borderColor: colors.border, backgroundColor: colors.card }]}>
              {clubResults.map((c, i) => (
                <TouchableOpacity
                  key={c.id}
                  style={[
                    styles.clubItem,
                    i < clubResults.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                  ]}
                  onPress={() => {
                    setSelectedClub(c.name);
                    setClubSearch("");
                    setClubResults([]);
                    Haptics.selectionAsync();
                  }}
                >
                  <Text style={[styles.clubItemName, { color: colors.foreground }]}>{c.name}</Text>
                  {c.location ? (
                    <Text style={[styles.clubItemLoc, { color: colors.mutedForeground }]}>{c.location}</Text>
                  ) : null}
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </View>
      )}

      {/* ── Card Photo ─────────────────────────────── */}
      <Text style={[styles.label, { color: colors.mutedForeground }]}>Card Photo *</Text>
      <View style={[styles.photoRequirements, { backgroundColor: colors.primary + "08", borderColor: colors.primary + "25" }]}>
        <Ionicons name="information-circle-outline" size={14} color={colors.primary} style={{ marginTop: 1 }} />
        <Text style={[styles.reqText, { color: colors.mutedForeground }]}>
          {"JPEG or PNG · max 2 MB\nFull card must be visible and in focus\nHNA number must be clearly readable\nGood lighting — avoid flash glare"}
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.uploadBtn, { borderColor: colors.primary + "55", backgroundColor: colors.primary + "08" }]}
        onPress={pickImage}
        activeOpacity={0.8}
      >
        {image ? (
          <Image source={{ uri: image }} style={styles.preview} resizeMode="cover" />
        ) : (
          <>
            <Ionicons name="cloud-upload-outline" size={22} color={colors.primary} />
            <Text style={[styles.uploadText, { color: colors.primary }]}>Tap to upload a photo</Text>
          </>
        )}
      </TouchableOpacity>
      {image ? (
        <TouchableOpacity onPress={pickImage} style={{ alignSelf: "flex-start" }}>
          <Text style={[styles.muted, { color: colors.primary, marginTop: 2 }]}>Choose a different photo</Text>
        </TouchableOpacity>
      ) : null}

      {error ? <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text> : null}

      <TouchableOpacity
        style={[styles.submitBtn, { backgroundColor: submitting ? colors.muted : colors.primary }]}
        onPress={submit}
        disabled={submitting}
        activeOpacity={0.85}
      >
        <Text style={styles.submitText}>{submitting ? "Submitting…" : "Submit for verification"}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card:             { borderRadius: 14, borderWidth: 1, padding: 16, gap: 8 },
  headerRow:        { flexDirection: "row", alignItems: "center", gap: 8 },
  title:            { fontSize: 16, fontFamily: "Inter_700Bold", flex: 1 },
  numberText:       { fontSize: 18, fontFamily: "Inter_600SemiBold", letterSpacing: 1 },
  muted:            { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  label:            { fontSize: 12, fontFamily: "Inter_600SemiBold", marginTop: 6 },
  input:            { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, height: 46, fontSize: 15, fontFamily: "Inter_400Regular" },
  inputWrapper:     { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, height: 46, gap: 8 },
  searchInput:      { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  selectedClub:     { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  selectedClubText: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
  clubDropdown:     { borderWidth: 1, borderRadius: 10, marginTop: 4, overflow: "hidden" },
  clubItem:         { paddingHorizontal: 12, paddingVertical: 10 },
  clubItemName:     { fontSize: 14, fontFamily: "Inter_500Medium" },
  clubItemLoc:      { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  photoRequirements:{ flexDirection: "row", gap: 8, borderWidth: 1, borderRadius: 10, padding: 10, alignItems: "flex-start" },
  reqText:          { flex: 1, fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 17 },
  uploadBtn:        { borderWidth: 1.5, borderRadius: 10, borderStyle: "dashed", minHeight: 110, alignItems: "center", justifyContent: "center", gap: 6, overflow: "hidden" },
  uploadText:       { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  preview:          { width: "100%", height: 160, borderRadius: 8 },
  rejectBox:        { flexDirection: "row", gap: 6, alignItems: "flex-start", borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 4 },
  rejectText:       { flex: 1, fontSize: 12, fontFamily: "Inter_500Medium", lineHeight: 17 },
  errorText:        { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  submitBtn:        { height: 46, borderRadius: 10, alignItems: "center", justifyContent: "center", marginTop: 8 },
  submitText:       { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  attemptBadge:     { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  attemptText:      { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  supportBtn:       { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16, justifyContent: "center", marginTop: 4 },
  supportBtnText:   { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
});
