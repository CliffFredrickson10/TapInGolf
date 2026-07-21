import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import SignatureScreen, { SignatureViewRef } from "react-native-signature-canvas";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/lib/api";
import { AppHeader } from "@/components/AppHeader";

export default function CartIndemnityScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    club_id: string;
    club_name: string;
    booking_id: string;
    payment_url?: string;
  }>();

  const signatureRef = useRef<SignatureViewRef>(null);
  const [indemnityText, setIndemnityText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fullName, setFullName] = useState(user?.name ?? "");
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scrollEnabled, setScrollEnabled] = useState(true);

  useEffect(() => {
    if (!params.club_id) return;
    apiFetch(`/clubs/${params.club_id}/cart-indemnity`, user?.token)
      .then((data) => setIndemnityText(data.indemnity_text))
      .catch(() => setIndemnityText(null))
      .finally(() => setLoading(false));
  }, [params.club_id]);

  const handleSignatureEnd = () => {
    signatureRef.current?.readSignature();
  };

  const handleSignatureOK = (sig: string) => {
    setSignatureData(sig);
  };

  const handleClear = () => {
    signatureRef.current?.clearSignature();
    setSignatureData(null);
  };

  const handleSubmit = async () => {
    if (!fullName.trim()) { setError("Please enter your full name"); return; }
    if (!signatureData) { setError("Please sign the form"); return; }
    if (!agreed) { setError("Please agree to the terms"); return; }
    if (!user) { router.push("/(auth)/login"); return; }

    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/bookings/${params.booking_id}/cart-indemnity`, user.token, {
        method: "POST",
        body: JSON.stringify({ full_name: fullName.trim(), signature_data: signatureData }),
      });

      // Navigate to payment or booking confirmation
      if (params.payment_url) {
        router.replace({
          pathname: "/booking/payment",
          params: { url: params.payment_url, booking_id: params.booking_id },
        });
      } else {
        router.replace({ pathname: "/booking/[id]", params: { id: params.booking_id } });
      }
    } catch (err: any) {
      setError(err.message ?? "Failed to submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const signatureWebStyle = `.m-signature-pad { box-shadow: none; border: none; }
    .m-signature-pad--body { border: none; }
    .m-signature-pad--footer { display: none; }
    body,html { width: 100%; height: 100%; margin: 0; padding: 0; }`;

  return (
    <>
      <AppHeader />
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={scrollEnabled}
      >
        {/* Title */}
        <View style={styles.titleSection}>
          <View style={[styles.iconBadge, { backgroundColor: colors.accent + "22" }]}>
            <Ionicons name="document-text-outline" size={28} color={colors.accent} />
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Golf Cart Indemnity Form
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {params.club_name ?? "Club"}
          </Text>
        </View>

        {/* Indemnity Text */}
        <View style={[styles.formBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ScrollView style={styles.indemnityScroll} nestedScrollEnabled>
            <Text style={[styles.indemnityText, { color: colors.foreground }]}>
              {indemnityText ?? "No indemnity form available for this club."}
            </Text>
          </ScrollView>
        </View>

        {/* Full Name Input */}
        <Text style={[styles.label, { color: colors.foreground }]}>Full Name</Text>
        <TextInput
          style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
          placeholder="Enter your full legal name"
          placeholderTextColor={colors.mutedForeground}
          value={fullName}
          onChangeText={setFullName}
          autoCapitalize="words"
        />

        {/* Signature Pad */}
        <Text style={[styles.label, { color: colors.foreground }]}>Signature</Text>
        <View style={[styles.signatureBox, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <SignatureScreen
            ref={signatureRef}
            onBegin={() => setScrollEnabled(false)}
            onEnd={() => { setScrollEnabled(true); handleSignatureEnd(); }}
            onOK={handleSignatureOK}
            webStyle={signatureWebStyle}
            backgroundColor="transparent"
            penColor={colors.foreground}
            style={styles.signaturePad}
          />
        </View>
        <TouchableOpacity onPress={handleClear} style={styles.clearBtn}>
          <Ionicons name="refresh-outline" size={16} color={colors.primary} />
          <Text style={[styles.clearText, { color: colors.primary }]}>Clear Signature</Text>
        </TouchableOpacity>

        {/* Agreement Checkbox */}
        <TouchableOpacity
          style={styles.checkboxRow}
          onPress={() => setAgreed(!agreed)}
          activeOpacity={0.7}
        >
          <View style={[styles.checkbox, { borderColor: agreed ? colors.primary : colors.border, backgroundColor: agreed ? colors.primary : "transparent" }]}>
            {agreed && <Ionicons name="checkmark" size={14} color="#fff" />}
          </View>
          <Text style={[styles.checkboxLabel, { color: colors.foreground }]}>
            I have read, understood, and agree to the terms and conditions above.
          </Text>
        </TouchableOpacity>

        {/* Error */}
        {error && (
          <View style={[styles.errorBox, { backgroundColor: colors.destructive + "15" }]}>
            <Ionicons name="alert-circle" size={16} color={colors.destructive} />
            <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
          </View>
        )}

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitBtn, { backgroundColor: submitting ? colors.muted : colors.primary }]}
          onPress={handleSubmit}
          disabled={submitting}
          activeOpacity={0.8}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="pencil-outline" size={20} color="#fff" />
              <Text style={styles.submitText}>Sign & Continue to Payment</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { padding: 20 },
  titleSection: { alignItems: "center", marginBottom: 20 },
  iconBadge: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  title: { fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center" },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 4 },
  formBox: { borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 20, maxHeight: 300 },
  indemnityScroll: { maxHeight: 260 },
  indemnityText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  label: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 8 },
  input: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: "Inter_400Regular", marginBottom: 20 },
  signatureBox: { borderRadius: 12, borderWidth: 1, height: 180, overflow: "hidden", marginBottom: 8 },
  signaturePad: { flex: 1, width: "100%", height: 180 },
  clearBtn: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-end", marginBottom: 20, paddingVertical: 4 },
  clearText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  checkboxRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 20 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: "center", justifyContent: "center", marginTop: 1 },
  checkboxLabel: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 10, marginBottom: 16 },
  errorText: { fontSize: 13, fontFamily: "Inter_500Medium", flex: 1 },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 16, borderRadius: 14 },
  submitText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
});
