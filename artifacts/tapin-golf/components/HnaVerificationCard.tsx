import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import React from "react";
import {
  ActivityIndicator,
  Image,
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
}

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
  const [image, setImage] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");

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
    if (!image) { setError("Please attach a photo of your HNA card"); return; }
    setSubmitting(true);
    try {
      await apiFetch("/hna/verification", token, {
        method: "POST",
        body: JSON.stringify({ hna_number: hnaNumber.replace(/\D/g, ""), card_image: image }),
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

  // Already verified — show a green confirmation card.
  if (status?.hna_verified) {
    const bySource =
      status.hna_verified_source === "club"
        ? status.hna_verified_club_name
          ? `Verified by ${status.hna_verified_club_name}`
          : "Verified by your club"
        : "Verified by TapIn";
    return (
      <View style={[styles.card, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "40" }]}>
        <View style={styles.headerRow}>
          <Ionicons name="shield-checkmark" size={20} color={colors.primary} />
          <Text style={[styles.title, { color: colors.foreground }]}>HNA Verified</Text>
        </View>
        <Text style={[styles.numberText, { color: colors.foreground }]}>{status.hna_number || "—"}</Text>
        <Text style={[styles.muted, { color: colors.mutedForeground }]}>
          {bySource}
          {status.hna_valid_until ? ` · valid until ${fmtDate(status.hna_valid_until)}` : ""}
        </Text>
      </View>
    );
  }

  const pending = status?.submission?.status === "pending";

  // Pending review — amber waiting card.
  if (pending) {
    return (
      <View style={[styles.card, { backgroundColor: "#f59e0b14", borderColor: "#f59e0b55" }]}>
        <View style={styles.headerRow}>
          <Ionicons name="hourglass-outline" size={20} color="#b45309" />
          <Text style={[styles.title, { color: colors.foreground }]}>HNA Card Under Review</Text>
        </View>
        <Text style={[styles.numberText, { color: colors.foreground }]}>{status?.submission?.hna_number}</Text>
        <Text style={[styles.muted, { color: colors.mutedForeground }]}>
          TapIn is reviewing your card photo. You'll be notified once it's approved — then you get affiliated-visitor rates.
        </Text>
      </View>
    );
  }

  const rejected = status?.submission?.status === "rejected";

  // Not verified — submission form (and rejection note if applicable).
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.headerRow}>
        <Ionicons name="card-outline" size={20} color={colors.primary} />
        <Text style={[styles.title, { color: colors.foreground }]}>Verify your HNA card</Text>
      </View>
      <Text style={[styles.muted, { color: colors.mutedForeground }]}>
        Submit your SA Player ID (HNA) number and a clear photo of the physical card. Once TapIn verifies it, you'll unlock affiliated-visitor rates.
      </Text>

      {rejected && status?.submission ? (
        <View style={[styles.rejectBox, { backgroundColor: colors.destructive + "12", borderColor: colors.destructive + "40" }]}>
          <Ionicons name="close-circle" size={15} color={colors.destructive} />
          <Text style={[styles.rejectText, { color: colors.destructive }]}>
            Previous submission rejected{status.submission.review_note ? `: ${status.submission.review_note}` : ". Please submit a clearer photo."}
          </Text>
        </View>
      ) : null}

      <Text style={[styles.label, { color: colors.mutedForeground }]}>HNA Membership Number</Text>
      <TextInput
        style={[styles.input, {
          borderColor: hnaNumber && hnaNumber.replace(/\D/g, "").length !== 10 ? colors.destructive : colors.border,
          color: colors.foreground, backgroundColor: colors.background,
        }]}
        value={hnaNumber}
        onChangeText={(t) => setHnaNumber(t.replace(/\D/g, "").slice(0, 10))}
        placeholder="10-digit number"
        placeholderTextColor={colors.mutedForeground}
        keyboardType="number-pad"
        maxLength={10}
      />

      <Text style={[styles.label, { color: colors.mutedForeground }]}>Card Photo</Text>
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
  card: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 8 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 16, fontFamily: "Inter_700Bold" },
  numberText: { fontSize: 18, fontFamily: "Inter_600SemiBold", letterSpacing: 1 },
  muted: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  label: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginTop: 6 },
  input: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, height: 46, fontSize: 15, fontFamily: "Inter_400Regular" },
  uploadBtn: { borderWidth: 1.5, borderRadius: 10, borderStyle: "dashed", minHeight: 110, alignItems: "center", justifyContent: "center", gap: 6, overflow: "hidden" },
  uploadText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  preview: { width: "100%", height: 160, borderRadius: 8 },
  rejectBox: { flexDirection: "row", gap: 6, alignItems: "flex-start", borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 4 },
  rejectText: { flex: 1, fontSize: 12, fontFamily: "Inter_500Medium", lineHeight: 17 },
  errorText: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  submitBtn: { height: 46, borderRadius: 10, alignItems: "center", justifyContent: "center", marginTop: 8 },
  submitText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
