import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
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
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { AppHeader } from "@/components/AppHeader";

const SUBJECTS = [
  "Booking issue",
  "Payment issue",
  "Account & profile",
  "Technical problem",
  "Club or tee time query",
  "Other",
];

export default function HelpScreen() {
  const colors = useColors();
  const { bottom } = useSafeAreaInsets();
  const { user } = useAuth();

  const [name,         setName]         = useState(user?.name  ?? "");
  const [email,        setEmail]        = useState(user?.email ?? "");
  const [subject,      setSubject]      = useState(SUBJECTS[0]);
  const [message,      setMessage]      = useState("");
  const [showSubjects, setShowSubjects] = useState(false);
  const [sending,      setSending]      = useState(false);
  const [sent,         setSent]         = useState(false);
  const [error,        setError]        = useState("");

  async function handleSend() {
    setError("");
    if (!email.trim())   { setError("Please enter your email address."); return; }
    if (!message.trim()) { setError("Please describe your issue."); return; }

    setSending(true);
    try {
      await apiFetch("/support/contact", user?.token, {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), email: email.trim(), subject, message: message.trim() }),
      });
      setSent(true);
    } catch (e: any) {
      setError(e.message || "Something went wrong. Please try again.");
    } finally {
      setSending(false);
    }
  }

  const s = styles(colors);

  return (
    <View style={s.root}>
      <AppHeader />

      {/* Sub-header: back button + page title */}
      <View style={s.subHeader}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <Text style={s.subHeaderTitle}>Contact Us</Text>
        <View style={{ width: 38 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={[s.scroll, { paddingBottom: bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
        >
          {sent ? (
            <View style={s.successBox}>
              <Ionicons name="checkmark-circle" size={56} color={colors.primary} />
              <Text style={s.successTitle}>Message sent!</Text>
              <Text style={s.successSub}>
                Thanks for reaching out. Our team will get back to you at{" "}
                <Text style={{ fontFamily: "Inter_600SemiBold" }}>{email}</Text> within one business day.
              </Text>
              <TouchableOpacity style={s.doneBtn} onPress={() => router.back()}>
                <Text style={s.doneTxt}>Done</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={s.intro}>
                Have a question or issue? Send us a message and we'll get back to you as soon as possible.
              </Text>

              {/* Name */}
              <View style={s.field}>
                <Text style={s.label}>Your name</Text>
                <TextInput
                  style={s.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="Jane Smith"
                  placeholderTextColor={colors.subtext}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </View>

              {/* Email */}
              <View style={s.field}>
                <Text style={s.label}>Email address <Text style={s.req}>*</Text></Text>
                <TextInput
                  style={s.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="jane@example.com"
                  placeholderTextColor={colors.subtext}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  returnKeyType="next"
                />
              </View>

              {/* Subject picker */}
              <View style={s.field}>
                <Text style={s.label}>Subject</Text>
                <TouchableOpacity style={s.picker} onPress={() => setShowSubjects(v => !v)} activeOpacity={0.8}>
                  <Text style={s.pickerText}>{subject}</Text>
                  <Ionicons name={showSubjects ? "chevron-up" : "chevron-down"} size={16} color={colors.subtext} />
                </TouchableOpacity>
                {showSubjects && (
                  <View style={s.dropdown}>
                    {SUBJECTS.map(opt => (
                      <TouchableOpacity
                        key={opt}
                        style={[s.dropItem, opt === subject && s.dropItemActive]}
                        onPress={() => { setSubject(opt); setShowSubjects(false); }}
                      >
                        <Text style={[s.dropItemText, opt === subject && { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
                          {opt}
                        </Text>
                        {opt === subject && <Ionicons name="checkmark" size={16} color={colors.primary} />}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              {/* Message */}
              <View style={s.field}>
                <Text style={s.label}>Message <Text style={s.req}>*</Text></Text>
                <TextInput
                  style={[s.input, s.textarea]}
                  value={message}
                  onChangeText={setMessage}
                  placeholder="Describe your issue or question…"
                  placeholderTextColor={colors.subtext}
                  multiline
                  numberOfLines={6}
                  textAlignVertical="top"
                />
              </View>

              {!!error && (
                <View style={s.errorBox}>
                  <Ionicons name="alert-circle-outline" size={16} color="#dc2626" />
                  <Text style={s.errorText}>{error}</Text>
                </View>
              )}

              <TouchableOpacity
                style={[s.sendBtn, sending && { opacity: 0.6 }]}
                onPress={handleSend}
                disabled={sending}
                activeOpacity={0.85}
              >
                {sending
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.sendTxt}>Send Message</Text>
                }
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = (c: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    subHeader: {
      backgroundColor: c.primary,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 14,
    },
    backBtn: {
      width: 38, height: 38, borderRadius: 19,
      backgroundColor: "rgba(255,255,255,0.15)",
      alignItems: "center", justifyContent: "center",
    },
    subHeaderTitle: { color: "#fff", fontSize: 17, fontFamily: "Inter_700Bold" },
    scroll: { padding: 20, gap: 4 },
    intro: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: c.subtext,
      lineHeight: 21,
      marginBottom: 12,
    },
    field: { marginBottom: 16 },
    label: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: c.text, marginBottom: 6 },
    req: { color: "#dc2626" },
    input: {
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: c.text,
    },
    textarea: { height: 130, paddingTop: 12 },
    picker: {
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 13,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    pickerText: { fontSize: 15, fontFamily: "Inter_400Regular", color: c.text },
    dropdown: {
      marginTop: 4,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      overflow: "hidden",
    },
    dropItem: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 14,
      paddingVertical: 13,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    dropItemActive: { backgroundColor: c.primary + "10" },
    dropItemText: { fontSize: 15, fontFamily: "Inter_400Regular", color: c.text },
    errorBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: "#fef2f2",
      borderRadius: 8,
      padding: 10,
      marginBottom: 8,
    },
    errorText: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#dc2626", flex: 1 },
    sendBtn: {
      backgroundColor: c.primary,
      borderRadius: 12,
      paddingVertical: 15,
      alignItems: "center",
      marginTop: 4,
    },
    sendTxt: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
    successBox: {
      flex: 1,
      alignItems: "center",
      paddingTop: 48,
      gap: 16,
    },
    successTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: c.text },
    successSub: {
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: c.subtext,
      textAlign: "center",
      lineHeight: 22,
      paddingHorizontal: 16,
    },
    doneBtn: {
      marginTop: 8,
      backgroundColor: c.primary,
      borderRadius: 12,
      paddingHorizontal: 40,
      paddingVertical: 14,
    },
    doneTxt: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  });
