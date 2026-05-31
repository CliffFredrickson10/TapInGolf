import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

const EFFECTIVE_DATE = "31 May 2026";

export default function PrivacyScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Privacy Policy</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.effective, { color: colors.mutedForeground }]}>Effective {EFFECTIVE_DATE}</Text>

        <Text style={[styles.intro, { color: colors.foreground }]}>
          This Privacy Policy explains what information TapIn Golf collects, how we use it, and the choices you have. By
          using the app you agree to the practices described below.
        </Text>

        <Section title="1. Information We Collect" colors={colors}>
          We collect the details you provide when you create an account (such as your name, email, phone number and
          golfing details), the bookings you make, messages you send, and basic usage and device data needed to operate
          and improve the app.
        </Section>

        <Section title="2. How We Use Your Information" colors={colors}>
          We use your information to provide tee-time bookings, process payments through our partners, connect you with
          friends and clubs, send relevant notifications, and keep the service safe — including reviewing reported
          content and enforcing our Community Guidelines.
        </Section>

        <Section title="3. Sharing" colors={colors}>
          We share information with golf clubs you book with and with the payment and infrastructure providers needed to
          run the service. We do not sell your personal information.
        </Section>

        <Section title="4. Data Retention" colors={colors}>
          We keep your information for as long as your account is active or as needed to provide the service and meet our
          legal obligations. You can request deletion of your account at any time.
        </Section>

        <Section title="5. Your Rights" colors={colors}>
          You may access, correct, or delete your personal information, and you can manage notification and privacy
          settings in the app. Contact us to exercise any of these rights.
        </Section>

        <Section title="6. Security" colors={colors}>
          We use reasonable technical and organisational measures to protect your information. No method of transmission
          or storage is completely secure, but we work to safeguard your data.
        </Section>

        <Section title="7. Children" colors={colors}>
          TapIn Golf is intended for users who are at least 18 years old, or who use the app with a guardian's consent.
        </Section>

        <Section title="8. Contact" colors={colors}>
          Questions about this Privacy Policy? Contact us at support@tapingolf.co.za.
        </Section>

        <Text style={[styles.footer, { color: colors.mutedForeground }]}>
          By creating an account or continuing to use TapIn Golf, you acknowledge that you have read and understood this
          Privacy Policy.
        </Text>
      </ScrollView>
    </View>
  );
}

function Section({ title, children, colors }: { title: string; children: React.ReactNode; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.sectionBody, { color: colors.mutedForeground }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backBtn: { width: 24 },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", flex: 1, textAlign: "center" },
  container: { paddingHorizontal: 24, paddingTop: 16 },
  effective: { fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 16 },
  intro: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 22, marginBottom: 20 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", marginBottom: 6 },
  sectionBody: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21 },
  footer: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20, marginTop: 8 },
});
