import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

const EFFECTIVE_DATE = "31 May 2026";

export default function TermsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Terms & Community Guidelines</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.effective, { color: colors.mutedForeground }]}>Effective {EFFECTIVE_DATE}</Text>

        <Text style={[styles.intro, { color: colors.foreground }]}>
          Welcome to TapIn Golf. By creating an account and using the app — including chat, messaging, reviews and any
          other features where you post or share content — you agree to these Terms of Use and Community Guidelines.
        </Text>

        {/* ── Zero tolerance: required by App Store / Play Store for user-generated content ── */}
        <View style={[styles.calloutCard, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "40" }]}>
          <View style={styles.calloutHead}>
            <Ionicons name="shield-checkmark" size={20} color={colors.primary} />
            <Text style={[styles.calloutTitle, { color: colors.primary }]}>Zero Tolerance for Objectionable Content</Text>
          </View>
          <Text style={[styles.calloutBody, { color: colors.foreground }]}>
            TapIn Golf has a strict, zero-tolerance policy toward objectionable content and abusive behaviour. By using
            this app you agree that you will not create, post, send, or share content that is offensive, harassing,
            threatening, hateful, discriminatory, sexually explicit, defamatory, or otherwise objectionable, and that you
            will not abuse, bully, or harass other users.
          </Text>
        </View>

        <Section title="1. Acceptable Use" colors={colors}>
          You are solely responsible for the content you post and the way you interact with others. Content and conduct
          that violate these guidelines are strictly prohibited, including any content that is unlawful, abusive,
          harassing, hateful, violent, sexually explicit, or that impersonates another person.
        </Section>

        <Section title="2. Reporting & Blocking" colors={colors}>
          Every member can report objectionable content and block any other user directly from the chat screen. Reports
          are reviewed by our moderation team, and you can block a user at any time to immediately stop receiving
          messages from them.
        </Section>

        <Section title="3. Moderation & Enforcement" colors={colors}>
          We review reported content and act on violations within 24 hours. Action may include removing content,
          disabling a user's chat access, suspending, or permanently terminating accounts. We may remove content or
          users that violate these terms without prior notice.
        </Section>

        <Section title="4. Your Commitments" colors={colors}>
          By continuing, you confirm that you are at least 18 years old (or have a guardian's consent), that the
          information you provide is accurate, and that you will treat other golfers with respect.
        </Section>

        <Section title="5. Bookings & Payments" colors={colors}>
          Tee-time bookings and payments are processed through our partners. You are responsible for the accuracy of your
          booking details and for any applicable club cancellation policies.
        </Section>

        <Section title="6. Account Termination" colors={colors}>
          We reserve the right to suspend or terminate any account that violates these Terms or the Community Guidelines,
          including the zero-tolerance policy above.
        </Section>

        <Section title="7. Contact" colors={colors}>
          Questions about these Terms? Contact us at support@tapingolf.co.za.
        </Section>

        <Text style={[styles.footer, { color: colors.mutedForeground }]}>
          By creating an account or continuing to use TapIn Golf, you acknowledge that you have read and agree to these
          Terms of Use and Community Guidelines.
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
  calloutCard: { borderWidth: 1.5, borderRadius: 14, padding: 16, marginBottom: 24 },
  calloutHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  calloutTitle: { fontSize: 15, fontFamily: "Inter_700Bold", flex: 1 },
  calloutBody: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", marginBottom: 6 },
  sectionBody: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21 },
  footer: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20, marginTop: 8 },
});
