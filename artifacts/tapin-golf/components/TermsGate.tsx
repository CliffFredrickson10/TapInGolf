import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

export function TermsGate() {
  const { user, acceptTerms, logout } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [submitting, setSubmitting] = useState(false);

  const visible = !!user && user.terms_accepted === false;

  const handleAgree = async () => {
    setSubmitting(true);
    try {
      await acceptTerms();
    } catch {
      // Keep the gate up; the user can retry. Reset so the button is tappable again.
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={[styles.header, { paddingTop: insets.top + 16, borderBottomColor: colors.border }]}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Updated Terms</Text>
        </View>

        <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
          <Text style={[styles.intro, { color: colors.foreground }]}>
            We've introduced Terms of Use and Community Guidelines for chat and other features where members post or
            share content. Please review and accept them to continue using TapIn Golf.
          </Text>

          <View style={[styles.calloutCard, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "40" }]}>
            <View style={styles.calloutHead}>
              <Ionicons name="shield-checkmark" size={20} color={colors.primary} />
              <Text style={[styles.calloutTitle, { color: colors.primary }]}>Zero Tolerance for Objectionable Content</Text>
            </View>
            <Text style={[styles.calloutBody, { color: colors.foreground }]}>
              TapIn Golf has a strict, zero-tolerance policy toward objectionable content and abusive behaviour. You can
              report content and block any user directly from chat, and our team reviews reports within 24 hours.
            </Text>
          </View>

          <View style={styles.links}>
            <TouchableOpacity onPress={() => router.push("/legal/terms")}>
              <Text style={[styles.link, { color: colors.primary }]}>Read the full Terms of Use</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push("/legal/privacy")}>
              <Text style={[styles.link, { color: colors.primary }]}>Read the Privacy Policy</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 16, borderTopColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.agreeBtn, { backgroundColor: colors.primary, opacity: submitting ? 0.7 : 1 }]}
            onPress={handleAgree}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.agreeText}>I Agree & Continue</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.declineBtn} onPress={() => logout()} disabled={submitting}>
            <Text style={[styles.declineText, { color: colors.mutedForeground }]}>Decline & Sign Out</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  container: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 32 },
  intro: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 22, marginBottom: 20 },
  calloutCard: { borderWidth: 1.5, borderRadius: 14, padding: 16, marginBottom: 24 },
  calloutHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  calloutTitle: { fontSize: 15, fontFamily: "Inter_700Bold", flex: 1 },
  calloutBody: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21 },
  links: { gap: 14 },
  link: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    gap: 10,
  },
  agreeBtn: { height: 54, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  agreeText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  declineBtn: { height: 44, alignItems: "center", justifyContent: "center" },
  declineText: { fontSize: 14, fontFamily: "Inter_500Medium" },
});
