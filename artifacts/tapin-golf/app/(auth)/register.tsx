import { Ionicons } from "@expo/vector-icons";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GoogleSignin, statusCodes } from "@react-native-google-signin/google-signin";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

GoogleSignin.configure({
  iosClientId: "378740564190-8mgibt541t6n23huldrq612ool9kt3bu.apps.googleusercontent.com", // TODO: replace with real ID
});

export default function RegisterScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { register, socialLogin } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
  }, []);

  const handleAppleSignIn = async () => {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      setLoading(true);
      const fullName = credential.fullName
        ? `${credential.fullName.givenName ?? ""} ${credential.fullName.familyName ?? ""}`.trim()
        : undefined;
      await socialLogin("apple", credential.email ?? "", fullName, credential.user);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } catch (err: any) {
      if (err.code !== "ERR_REQUEST_CANCELED") {
        Alert.alert("Error", "Apple Sign-In failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      if (Platform.OS === "android") {
        await GoogleSignin.hasPlayServices();
      }
      const response = await GoogleSignin.signIn();
      if (response.type === "success" && response.data?.user) {
        setLoading(true);
        const { email: gEmail, name: gName, id: gId } = response.data.user;
        await socialLogin("google", gEmail, gName ?? undefined, gId);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace("/(tabs)");
      }
    } catch (err: any) {
      if (err.code !== statusCodes.SIGN_IN_CANCELLED) {
        Alert.alert("Error", "Google Sign-In failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!name || !email || !password) {
      Alert.alert("Missing fields", "Please fill in all required fields.");
      return;
    }
    if (!agreed) {
      Alert.alert(
        "Agreement required",
        "Please agree to the Terms of Use and Community Guidelines, including our zero-tolerance policy for objectionable content, to create an account."
      );
      return;
    }
    setLoading(true);
    try {
      await register(name.trim(), email.trim().toLowerCase(), password, phone.trim());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Registration failed", err.message);
    } finally {
      setLoading(false);
    }
  };

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
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>

        <View style={styles.headerArea}>
          <Text style={[styles.title, { color: colors.foreground }]}>Create Account</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Join TapIn Golf and start booking
          </Text>
        </View>

        <View style={styles.form}>
          {[
            { label: "Full Name", value: name, onChange: setName, icon: "person-outline", placeholder: "John Smith", type: "default" },
            { label: "Email", value: email, onChange: setEmail, icon: "mail-outline", placeholder: "john@email.com", type: "email-address" },
            { label: "Phone Number", value: phone, onChange: setPhone, icon: "call-outline", placeholder: "+27 82 000 0000", type: "phone-pad" },
          ].map((field) => (
            <View key={field.label}>
              <Text style={[styles.label, { color: colors.foreground }]}>{field.label}</Text>
              <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <Ionicons name={field.icon as any} size={18} color={colors.mutedForeground} />
                <TextInput
                  style={[styles.input, { color: colors.foreground }]}
                  value={field.value}
                  onChangeText={field.onChange}
                  placeholder={field.placeholder}
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType={field.type as any}
                  autoCapitalize={field.type === "default" ? "words" : "none"}
                />
              </View>
            </View>
          ))}

          <Text style={[styles.label, { color: colors.foreground }]}>Password</Text>
          <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.mutedForeground} />
            <TextInput
              style={[styles.input, { color: colors.foreground }]}
              value={password}
              onChangeText={setPassword}
              placeholder="Create a password"
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
            />
            <TouchableOpacity onPress={() => setShowPassword(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons
                name={showPassword ? "eye-off-outline" : "eye-outline"}
                size={20}
                color={colors.mutedForeground}
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.agreeRow}
            onPress={() => setAgreed(v => !v)}
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.checkbox,
                { borderColor: agreed ? colors.primary : colors.border, backgroundColor: agreed ? colors.primary : "transparent" },
              ]}
            >
              {agreed && <Ionicons name="checkmark" size={14} color="#fff" />}
            </View>
            <Text style={[styles.agreeText, { color: colors.mutedForeground }]}>
              I agree to the{" "}
              <Text
                style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}
                onPress={(e) => { e.stopPropagation?.(); router.push("/legal/terms"); }}
              >
                Terms of Use & Community Guidelines
              </Text>
              {" "}and{" "}
              <Text
                style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}
                onPress={(e) => { e.stopPropagation?.(); router.push("/legal/privacy"); }}
              >
                Privacy Policy
              </Text>
              , including a zero-tolerance policy for objectionable content and abusive users.
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btn, { backgroundColor: loading || !agreed ? colors.muted : colors.primary }]}
            onPress={handleRegister}
            disabled={loading}
            activeOpacity={0.85}
          >
            <Text style={styles.btnText}>{loading ? "Creating account…" : "Create Account"}</Text>
          </TouchableOpacity>

          {/* Social Sign-In divider */}
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 24, marginBottom: 16, gap: 12 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
            <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>or sign up with</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
          </View>

          {appleAvailable && (
            <TouchableOpacity
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, height: 52, borderRadius: 14, backgroundColor: colors.foreground, marginBottom: 10 }}
              onPress={handleAppleSignIn}
              disabled={loading}
              activeOpacity={0.85}
            >
              <Ionicons name="logo-apple" size={20} color={colors.background} />
              <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.background }}>Sign up with Apple</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, height: 52, borderRadius: 14, backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1.5 }}
            onPress={handleGoogleSignIn}
            disabled={loading}
            activeOpacity={0.85}
          >
            <Ionicons name="logo-google" size={18} color="#4285F4" />
            <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>Sign up with Google</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.loginLink} onPress={() => router.back()}>
            <Text style={[styles.loginText, { color: colors.mutedForeground }]}>
              Already have an account?{" "}
              <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>Sign In</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingHorizontal: 24 },
  backBtn: { marginBottom: 24 },
  headerArea: { gap: 6, marginBottom: 32 },
  title: { fontSize: 28, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 15, fontFamily: "Inter_400Regular" },
  form: { gap: 4 },
  label: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginTop: 12, marginBottom: 4 },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    gap: 10,
    height: 52,
  },
  input: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  agreeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 20,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  agreeText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  btn: {
    height: 54,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
  },
  btnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  loginLink: { alignItems: "center", marginTop: 16 },
  loginText: { fontSize: 14, fontFamily: "Inter_400Regular" },
});
