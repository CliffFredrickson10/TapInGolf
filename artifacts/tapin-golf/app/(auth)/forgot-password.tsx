import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useRef, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ellipse, Polygon, Rect, Svg } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { API_BASE } from "@/lib/api";

type Step = "email" | "otp" | "password";

export default function ForgotPasswordScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [step, setStep]             = useState<Step>("email");
  const [email, setEmail]           = useState("");
  const [otp, setOtp]               = useState("");
  const [resetToken, setResetToken] = useState("");
  const [password, setPassword]     = useState("");
  const [confirm, setConfirm]       = useState("");
  const [showPw, setShowPw]         = useState(false);
  const [showCf, setShowCf]         = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");
  const [success, setSuccess]       = useState(false);
  const [devOtp, setDevOtp]         = useState<string | null>(null);

  const otpRef = useRef<TextInput>(null);

  // ── Step 1: request OTP via email ────────────────────────────────────
  const requestOtp = async () => {
    Keyboard.dismiss();
    setError("");
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) { setError("Please enter your email address."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Please enter a valid email address."); return;
    }
    setLoading(true);
    try {
      const res  = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Failed to send code");
      if (data.dev_otp) setDevOtp(data.dev_otp);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStep("otp");
      setTimeout(() => otpRef.current?.focus(), 400);
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(e.message);
    }
    setLoading(false);
  };

  // ── Step 2: verify OTP ───────────────────────────────────────────────
  const verifyOtp = async () => {
    Keyboard.dismiss();
    setError("");
    if (otp.length !== 6) { setError("Please enter the 6-digit code."); return; }
    setLoading(true);
    try {
      const res  = await fetch(`${API_BASE}/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), otp }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Invalid code");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setResetToken(data.reset_token);
      setStep("password");
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(e.message);
    }
    setLoading(false);
  };

  // ── Step 3: set new password ─────────────────────────────────────────
  const resetPassword = async () => {
    Keyboard.dismiss();
    setError("");
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setLoading(true);
    try {
      const res  = await fetch(`${API_BASE}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset_token: resetToken, new_password: password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Reset failed");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSuccess(true);
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(e.message);
    }
    setLoading(false);
  };

  const stepIndex = step === "email" ? 0 : step === "otp" ? 1 : 2;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Back */}
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.foreground} />
        </TouchableOpacity>

        {/* Logo */}
        <View style={styles.logoArea}>
          <Svg width={72} height={72} viewBox="0 0 100 100">
            <Rect x={47} y={10} width={5} height={68} fill={colors.primary} />
            <Polygon points="50,10 84,24 50,38" fill={colors.primary} />
            <Ellipse cx={50} cy={80} rx={15} ry={6} fill={colors.primary} />
          </Svg>
          <Text style={[styles.logoTitle, { color: colors.primary }]}>TapIn Golf</Text>
        </View>

        {/* Step indicator */}
        <View style={styles.steps}>
          {[0, 1, 2].map(i => (
            <View key={i} style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={[
                styles.dot,
                {
                  backgroundColor: i <= stepIndex ? colors.primary : colors.border,
                  width: i === stepIndex ? 28 : 10,
                },
              ]} />
              {i < 2 && (
                <View style={[styles.line, {
                  backgroundColor: i < stepIndex ? colors.primary : colors.border,
                }]} />
              )}
            </View>
          ))}
        </View>

        {success ? (
          /* ── Success ── */
          <View style={styles.successWrap}>
            <View style={[styles.successIcon, { backgroundColor: colors.primary + "18" }]}>
              <Ionicons name="checkmark-circle" size={56} color={colors.primary} />
            </View>
            <Text style={[styles.heading, { color: colors.foreground }]}>Password reset!</Text>
            <Text style={[styles.sub, { color: colors.mutedForeground }]}>
              Your password has been updated. You can now sign in with your new password.
            </Text>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: colors.primary }]}
              onPress={() => router.replace("/(auth)/login")}
            >
              <Text style={styles.btnText}>Back to Sign In</Text>
            </TouchableOpacity>
          </View>

        ) : step === "email" ? (
          /* ── Step 1: Email ── */
          <>
            <Text style={[styles.heading, { color: colors.foreground }]}>Forgot password?</Text>
            <Text style={[styles.sub, { color: colors.mutedForeground }]}>
              Enter the email address linked to your account and we'll send you a verification code.
            </Text>

            <Text style={[styles.label, { color: colors.foreground }]}>Email address</Text>
            <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Ionicons name="mail-outline" size={18} color={colors.mutedForeground} />
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                value={email}
                onChangeText={setEmail}
                placeholder="golfer@email.com"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={requestOtp}
              />
            </View>

            {error ? <ErrorBox msg={error} /> : null}

            <TouchableOpacity
              style={[styles.btn, { backgroundColor: loading ? colors.muted : colors.primary }]}
              onPress={requestOtp}
              disabled={loading}
              activeOpacity={0.85}
            >
              <Ionicons name="mail" size={18} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.btnText}>{loading ? "Sending code…" : "Send Code"}</Text>
            </TouchableOpacity>
          </>

        ) : step === "otp" ? (
          /* ── Step 2: OTP ── */
          <>
            <Text style={[styles.heading, { color: colors.foreground }]}>Check your email</Text>
            <Text style={[styles.sub, { color: colors.mutedForeground }]}>
              We sent a 6-digit code to{"\n"}
              <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.foreground }}>{email}</Text>
              {"\n"}It expires in 10 minutes.
            </Text>

            {devOtp && (
              <View style={[styles.devBanner, { backgroundColor: colors.accent + "22", borderColor: colors.accent + "44" }]}>
                <Ionicons name="code-slash-outline" size={14} color={colors.accent} />
                <Text style={[styles.devText, { color: colors.accent }]}>
                  Dev mode — OTP: <Text style={{ fontFamily: "Inter_700Bold" }}>{devOtp}</Text>
                </Text>
              </View>
            )}

            <Text style={[styles.label, { color: colors.foreground }]}>6-digit code</Text>
            <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Ionicons name="keypad-outline" size={18} color={colors.mutedForeground} />
              <TextInput
                ref={otpRef}
                style={[styles.input, styles.otpInput, { color: colors.foreground }]}
                value={otp}
                onChangeText={v => setOtp(v.replace(/\D/g, "").slice(0, 6))}
                placeholder="• • • • • •"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="number-pad"
                maxLength={6}
                returnKeyType="done"
                onSubmitEditing={verifyOtp}
              />
            </View>

            {error ? <ErrorBox msg={error} /> : null}

            <TouchableOpacity
              style={[styles.btn, {
                backgroundColor: otp.length === 6 && !loading ? colors.primary : colors.muted,
              }]}
              onPress={verifyOtp}
              disabled={otp.length !== 6 || loading}
              activeOpacity={0.85}
            >
              <Text style={styles.btnText}>{loading ? "Verifying…" : "Verify Code"}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.resendLink}
              onPress={() => { setStep("email"); setOtp(""); setError(""); setDevOtp(null); }}
            >
              <Text style={[styles.resendText, { color: colors.mutedForeground }]}>
                Didn't get it?{" "}
                <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>
                  Try a different email
                </Text>
              </Text>
            </TouchableOpacity>
          </>

        ) : (
          /* ── Step 3: New password ── */
          <>
            <Text style={[styles.heading, { color: colors.foreground }]}>New password</Text>
            <Text style={[styles.sub, { color: colors.mutedForeground }]}>
              Choose a strong password for your TapIn Golf account.
            </Text>

            <Text style={[styles.label, { color: colors.foreground }]}>New password</Text>
            <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Ionicons name="lock-closed-outline" size={18} color={colors.mutedForeground} />
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                value={password}
                onChangeText={setPassword}
                placeholder="Min. 6 characters"
                placeholderTextColor={colors.mutedForeground}
                secureTextEntry={!showPw}
                autoFocus
              />
              <TouchableOpacity onPress={() => setShowPw(p => !p)}>
                <Ionicons
                  name={showPw ? "eye-off-outline" : "eye-outline"}
                  size={18}
                  color={colors.mutedForeground}
                />
              </TouchableOpacity>
            </View>

            <Text style={[styles.label, { color: colors.foreground }]}>Confirm password</Text>
            <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Ionicons name="lock-closed-outline" size={18} color={colors.mutedForeground} />
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                value={confirm}
                onChangeText={setConfirm}
                placeholder="Repeat password"
                placeholderTextColor={colors.mutedForeground}
                secureTextEntry={!showCf}
                returnKeyType="done"
                onSubmitEditing={resetPassword}
              />
              <TouchableOpacity onPress={() => setShowCf(p => !p)}>
                <Ionicons
                  name={showCf ? "eye-off-outline" : "eye-outline"}
                  size={18}
                  color={colors.mutedForeground}
                />
              </TouchableOpacity>
            </View>

            {error ? <ErrorBox msg={error} /> : null}

            <TouchableOpacity
              style={[styles.btn, { backgroundColor: loading ? colors.muted : colors.primary }]}
              onPress={resetPassword}
              disabled={loading}
              activeOpacity={0.85}
            >
              <Text style={styles.btnText}>{loading ? "Resetting…" : "Reset Password"}</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <View style={[styles.errorBox, { backgroundColor: "#fef2f2", borderColor: "#fca5a5" }]}>
      <Ionicons name="alert-circle-outline" size={16} color="#dc2626" />
      <Text style={styles.errorText}>{msg}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 12 },
  backBtn:   { marginBottom: 8, padding: 4, alignSelf: "flex-start" },
  logoArea:  { alignItems: "center", marginBottom: 20 },
  logoTitle: { fontSize: 20, fontFamily: "Inter_700Bold", marginTop: 6 },

  steps: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
  },
  dot:  { height: 10, borderRadius: 5 },
  line: { width: 24, height: 2, marginHorizontal: 4 },

  heading: { fontSize: 26, fontFamily: "Inter_700Bold", marginBottom: 8 },
  sub:     { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21, marginBottom: 20, opacity: 0.8 },

  label: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginTop: 12, marginBottom: 4 },
  inputWrap: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1.5, borderRadius: 12,
    paddingHorizontal: 14, gap: 10, height: 52,
  },
  input:    { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  otpInput: { fontSize: 22, fontFamily: "Inter_700Bold", letterSpacing: 8 },

  devBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 4,
  },
  devText: { fontSize: 13, fontFamily: "Inter_500Medium" },

  errorBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, marginTop: 12,
  },
  errorText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: "#dc2626" },

  btn: {
    height: 54, borderRadius: 14,
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    marginTop: 20,
  },
  btnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },

  resendLink: { alignItems: "center", marginTop: 16 },
  resendText: { fontSize: 14, fontFamily: "Inter_400Regular" },

  successWrap: { flex: 1, alignItems: "center", paddingTop: 20, gap: 16 },
  successIcon: {
    width: 100, height: 100, borderRadius: 50,
    alignItems: "center", justifyContent: "center",
  },
});
