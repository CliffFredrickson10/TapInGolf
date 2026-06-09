import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { router } from "expo-router";

import React, { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import CachedImage from "@/components/CachedImage";
import HnaVerificationCard from "@/components/HnaVerificationCard";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/lib/api";

const SA_PROVINCES = [
  "Gauteng",
  "Western Cape",
  "KwaZulu-Natal",
  "Eastern Cape",
  "Free State",
  "Mpumalanga",
  "North West",
  "Northern Cape",
  "Limpopo",
];

const GENDER_OPTIONS: { value: "male" | "female" | "prefer_not_to_say"; label: string }[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

// Convert YYYY-MM-DD (from API) → YYYY/MM/DD (for display/input)
const dobFromApi = (dateStr: string): string => dateStr.slice(0, 10).replace(/-/g, "/");

// Convert YYYY/MM/DD (from input) → YYYY-MM-DD (for API)
const dobToApi = (dateStr: string): string => dateStr.replace(/\//g, "-");

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout, updateUser } = useAuth();

  const [editing, setEditing] = useState(false);

  // Personal info
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [handicap, setHandicap] = useState(user?.handicap?.toString() ?? "");
  const [studentNumber, setStudentNumber] = useState(user?.student_number ?? "");
  const [gender, setGender] = useState<string>(user?.gender ?? "");
  const [dob, setDob] = useState(user?.date_of_birth ? dobFromApi(user.date_of_birth) : "");
  const [homeProvince, setHomeProvince] = useState(user?.home_province ?? "");
  const [showProvincePicker, setShowProvincePicker] = useState(false);
  const [locating, setLocating] = useState(false);

  // Account
  const [email, setEmail] = useState(user?.email ?? "");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [uploadingPic, setUploadingPic] = useState(false);

  // All my vouchers (cancellation + discount combined)
  const [vouchersOpen, setVouchersOpen]       = useState(false);
  const [voucherList, setVoucherList]         = useState<any[]>([]);
  const [discountList, setDiscountList]       = useState<any[]>([]);
  const [loadingVouchers, setLoadingVouchers] = useState(false);
  const [vouchersFetched, setVouchersFetched] = useState(false);

  // Club bans
  const [myBans, setMyBans]               = useState<any[]>([]);
  const [appealBan, setAppealBan]         = useState<any | null>(null);
  const [appealText, setAppealText]       = useState("");
  const [submittingAppeal, setSubmittingAppeal] = useState(false);

  React.useEffect(() => {
    if (!user?.token) return;
    apiFetch("/bans/me", user.token)
      .then((data: any) => setMyBans(Array.isArray(data) ? data.filter((b: any) => b.status !== "lifted") : []))
      .catch(() => {});
  }, [user?.token]);

  const handleSubmitAppeal = async () => {
    if (!appealBan || !user?.token || appealText.trim().length < 10) return;
    setSubmittingAppeal(true);
    try {
      await apiFetch(`/bans/${appealBan.id}/appeal`, user.token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: appealText.trim() }),
      });
      setMyBans(prev => prev.map(b => b.id === appealBan.id ? { ...b, status: "appealing", appeal_message: appealText.trim() } : b));
      setAppealBan(null);
      setAppealText("");
    } catch {}
    setSubmittingAppeal(false);
  };

  const fetchVouchers = React.useCallback(async () => {
    if (!user?.token) return;
    setLoadingVouchers(true);
    try {
      const [cancData, discData]: any[] = await Promise.all([
        apiFetch("/profile/cancellation-vouchers", user.token),
        apiFetch("/vouchers/my-discount", user.token),
      ]);
      setVoucherList(cancData?.vouchers ?? []);
      setDiscountList(Array.isArray(discData) ? discData : []);
      setVouchersFetched(true);
    } catch {}
    setLoadingVouchers(false);
  }, [user?.token]);

  const handleToggleVouchers = () => {
    if (!vouchersOpen && !vouchersFetched) fetchVouchers();
    setVouchersOpen(v => !v);
  };

  // Fetch fresh profile data from server whenever the token changes (e.g. after login).
  // This ensures fields like date_of_birth that are missing from the cached login token
  // are always populated in context before we try to render or edit them.
  React.useEffect(() => {
    if (!user?.token) return;
    const token = user.token;
    apiFetch("/profile", token, { cache: "no-store" } as any)
      .then((data: any) => {
        if (data?.user) updateUser({ ...data.user, token });
      })
      .catch(() => {});
  }, [user?.token]);

  // Sync all form fields whenever any user field changes or editing mode opens.
  // Using explicit individual deps (not the whole user object) so the React Compiler
  // can track each field precisely and never miss an update.
  React.useEffect(() => {
    if (!user) return;
    setName(user.name ?? "");
    setPhone(user.phone ?? "");
    setHandicap(user.handicap?.toString() ?? "");
    setStudentNumber(user.student_number ?? "");
    setGender(user.gender ?? "");
    setDob(user.date_of_birth ? dobFromApi(user.date_of_birth) : "");
    setHomeProvince(user.home_province ?? "");
    setEmail(user.email ?? "");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    user?.name, user?.phone, user?.handicap, user?.hna_number,
    user?.student_number, user?.gender, user?.date_of_birth,
    user?.home_province, user?.email,
    editing,
  ]);

  // Student: age 18–24 based on the live dob text input (YYYY/MM/DD)
  const isStudent = React.useMemo(() => {
    if (!dob) return false;
    const parts = dob.split("/");
    if (parts.length !== 3 || parts[0].length < 4) return false;
    const [y, m, d] = parts.map(Number);
    if (!y || !m || !d) return false;
    const birth = new Date(y, m - 1, d);
    if (isNaN(birth.getTime())) return false;
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const mo = today.getMonth() - birth.getMonth();
    if (mo < 0 || (mo === 0 && today.getDate() < birth.getDate())) age--;
    return age >= 18 && age <= 24;
  }, [dob]);

  // Junior: 18 or younger based on the user's stored DOB (shown as a profile badge)
  const isJuniorBadge = React.useMemo(() => {
    const dobStr = user?.date_of_birth ? String(user.date_of_birth) : null;
    if (!dobStr) return false;
    const birth = new Date(dobStr);
    if (isNaN(birth.getTime())) return false;
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const mo = today.getMonth() - birth.getMonth();
    if (mo < 0 || (mo === 0 && today.getDate() < birth.getDate())) age--;
    return age <= 18;
  }, [user?.date_of_birth]);

  // Pensioner: age 65+ based on the user's stored DOB (shown as a profile badge)
  const isPensioner = React.useMemo(() => {
    const dobStr = user?.date_of_birth ? String(user.date_of_birth) : null;
    if (!dobStr) return false;
    const birth = new Date(dobStr);
    if (isNaN(birth.getTime())) return false;
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const mo = today.getMonth() - birth.getMonth();
    if (mo < 0 || (mo === 0 && today.getDate() < birth.getDate())) age--;
    return age >= 65;
  }, [user?.date_of_birth]);

  if (!user) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Ionicons name="person-circle-outline" size={64} color={colors.mutedForeground} />
        <Text style={[styles.guestTitle, { color: colors.foreground }]}>You're not signed in</Text>
        <TouchableOpacity style={[styles.authBtn, { backgroundColor: colors.primary }]} onPress={() => router.push("/(auth)/login")}>
          <Text style={styles.authBtnText}>Sign In</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push("/(auth)/register")}>
          <Text style={[styles.regLink, { color: colors.primary }]}>Create Account</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const initials = user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const detectProvince = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const geocode = await Location.reverseGeocodeAsync(pos.coords);
      if (geocode.length > 0) {
        const region = geocode[0].region ?? "";
        const matched = SA_PROVINCES.find((p) =>
          region.toLowerCase().includes(p.toLowerCase().split(" ")[0])
        );
        if (matched) setHomeProvince(matched);
      }
    } catch {}
    setLocating(false);
  };

  const pickProfilePicture = async () => {
    try {
      if (Platform.OS !== "web") {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
        base64: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const mimeType = asset.mimeType ?? "image/jpeg";
      const b64 = asset.base64;
      if (!b64) return;
      setUploadingPic(true);
      const data = await apiFetch("/profile/picture", user.token, {
        method: "PUT",
        body: JSON.stringify({ picture: `data:${mimeType};base64,${b64}` }),
      });
      updateUser({ avatar: data.avatar });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
    finally { setUploadingPic(false); }
  };

  const saveProfile = async () => {
    if (!user) return;
    if (newPassword && newPassword !== confirmPassword) {
      setSaveError("Passwords do not match"); return;
    }
    if (newPassword && newPassword.length < 6) {
      setSaveError("Password must be at least 6 characters"); return;
    }
    setSaving(true);
    setSaveError("");
    try {
      const body: Record<string, any> = {
        name: name.trim(),
        phone: phone.trim(),
        handicap: handicap ? parseFloat(handicap) : null,
        student_number: isStudent ? (studentNumber.trim() || null) : null,
        gender: gender || null,
        date_of_birth: dob ? dobToApi(dob) : null,
        home_province: homeProvince || null,
        email: email.trim().toLowerCase(),
      };
      if (newPassword) body.password = newPassword;

      const data = await apiFetch("/profile", user.token, {
        method: "PUT",
        body: JSON.stringify(body),
      });

      updateUser({
        ...data.user,
        token: user.token,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setNewPassword("");
      setConfirmPassword("");
      setShowProvincePicker(false);
      setEditing(false);
    } catch (err: any) {
      setSaveError(err.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  // Only handle UI bookkeeping here — field values are synced by the useEffect above
  // so that a stale React-Compiler closure on this function can't clobber them.
  const initEdit = () => {
    setNewPassword("");
    setConfirmPassword("");
    setSaveError("");
    setShowProvincePicker(false);
    setEditing(true);
  };

  // Auto-format DOB text input as YYYY/MM/DD while the user types
  const handleDobChange = (text: string) => {
    const digits = text.replace(/\D/g, "").slice(0, 8);
    let formatted = digits;
    if (digits.length > 6) formatted = digits.slice(0, 4) + "/" + digits.slice(4, 6) + "/" + digits.slice(6);
    else if (digits.length > 4) formatted = digits.slice(0, 4) + "/" + digits.slice(4);
    setDob(formatted);
  };

  const handleLogout = async () => {
    await logout();
    router.replace("/(tabs)");
  };

  const topPad = Platform.OS === "web" ? 44 : insets.top;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Back-button header */}
      <View style={[styles.backHeader, { paddingTop: topPad + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={10} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.backHeaderTitle}>My Profile</Text>
        <View style={{ width: 38 }} />
      </View>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Avatar section */}
        <View style={[styles.avatarSection, { paddingTop: 20, backgroundColor: colors.primary + "12" }]}>
          <TouchableOpacity onPress={pickProfilePicture} disabled={uploadingPic} style={styles.avatarWrap}>
            {user.avatar ? (
              <CachedImage uri={user.avatar} style={styles.avatarImg} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
            )}
            <View style={[styles.cameraBadge, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {uploadingPic ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="camera" size={14} color={colors.primary} />
              )}
            </View>
          </TouchableOpacity>
          <Text style={[styles.userName, { color: colors.foreground }]}>{user.name}</Text>
          <Text style={[styles.userEmail, { color: colors.mutedForeground }]}>{user.email}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6, marginTop: 6 }}>
            {user.handicap != null && (
              <View style={[styles.hcpBadge, { backgroundColor: colors.accent + "22" }]}>
                <Text style={[styles.hcpText, { color: colors.accent }]}>HCP {user.handicap}</Text>
              </View>
            )}
            {user.home_province ? (
              <View style={[styles.hcpBadge, { backgroundColor: colors.primary + "15" }]}>
                <Ionicons name="location-outline" size={12} color={colors.primary} />
                <Text style={[styles.hcpText, { color: colors.primary }]}>{user.home_province}</Text>
              </View>
            ) : null}
            {isJuniorBadge ? (
              <View style={[styles.hcpBadge, { backgroundColor: "#1976d222" }]}>
                <Ionicons name="ribbon-outline" size={12} color="#1976d2" />
                <Text style={[styles.hcpText, { color: "#1976d2" }]}>Junior</Text>
              </View>
            ) : null}
            {user.student_number ? (
              <View style={[styles.hcpBadge, { backgroundColor: colors.accent + "18" }]}>
                <Ionicons name="school-outline" size={12} color={colors.accent} />
                <Text style={[styles.hcpText, { color: colors.accent }]}>Student</Text>
              </View>
            ) : null}
            {isPensioner ? (
              <View style={[styles.hcpBadge, { backgroundColor: "#c8a84b22" }]}>
                <Ionicons name="accessibility-outline" size={12} color="#c8a84b" />
                <Text style={[styles.hcpText, { color: "#c8a84b" }]}>Pensioner</Text>
              </View>
            ) : null}
            {user.role === "club_admin" && (
              <View style={[styles.hcpBadge, { backgroundColor: colors.primary + "22" }]}>
                <Ionicons name="shield-checkmark" size={12} color={colors.primary} />
                <Text style={[styles.hcpText, { color: colors.primary }]}>
                  {user.club_id == null ? "Platform Admin" : "Club Admin"}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={{ padding: 20, gap: 12 }}>
          {/* Edit profile */}
          {editing ? (
            <View style={[styles.editCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Edit Profile</Text>

              {/* ── Personal info ── */}
              <View style={styles.sectionDivider}>
                <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                <Text style={[styles.dividerLabel, { color: colors.mutedForeground }]}>Personal Info</Text>
                <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
              </View>

              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Name</Text>
              <TextInput
                style={[styles.fieldInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                value={name} onChangeText={setName} placeholder="Your name"
                placeholderTextColor={colors.mutedForeground}
              />

              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Phone</Text>
              <TextInput
                style={[styles.fieldInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                value={phone} onChangeText={setPhone} placeholder="+27 82 000 0000"
                placeholderTextColor={colors.mutedForeground} keyboardType="phone-pad"
              />

              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Handicap</Text>
              <TextInput
                style={[styles.fieldInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                value={handicap} onChangeText={setHandicap} placeholder="e.g. 18"
                placeholderTextColor={colors.mutedForeground} keyboardType="decimal-pad"
              />

              {isStudent && (
                <>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Student Number</Text>
                  {user?.student_number_locked ? (
                    <View style={[styles.lockedField, { borderColor: colors.border, backgroundColor: colors.muted ?? colors.card }]}>
                      <Text style={[styles.lockedFieldValue, { color: colors.foreground }]}>
                        {studentNumber || "—"}
                      </Text>
                      <View style={[styles.lockedBadge, { backgroundColor: colors.primary + "15" }]}>
                        <Ionicons name="lock-closed" size={10} color={colors.primary} />
                        <Text style={[styles.lockedBadgeText, { color: colors.primary }]}>Set by your club</Text>
                      </View>
                    </View>
                  ) : (
                    <TextInput
                      style={[styles.fieldInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                      value={studentNumber}
                      onChangeText={setStudentNumber}
                      placeholder="Your student number"
                      placeholderTextColor={colors.mutedForeground}
                      autoCapitalize="characters"
                      autoCorrect={false}
                    />
                  )}
                </>
              )}

              {/* HNA membership is verified via the dedicated HNA card below (TapIn card review or club roster). */}

              {/* Gender */}
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Gender</Text>
              <View style={styles.genderRow}>
                {GENDER_OPTIONS.map((opt) => {
                  const active = gender === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.genderPill, { backgroundColor: active ? colors.primary : colors.background, borderColor: active ? colors.primary : colors.border }]}
                      onPress={() => { Haptics.selectionAsync(); setGender(active ? "" : opt.value); }}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.genderPillText, { color: active ? "#fff" : colors.foreground }]}>{opt.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Date of Birth */}
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Date of Birth</Text>
              <TextInput
                style={[styles.fieldInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                value={dob}
                onChangeText={handleDobChange}
                placeholder="YYYY/MM/DD"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="numeric"
                maxLength={10}
              />

              {/* Home Province */}
              <View style={styles.fieldLabelRow}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginBottom: 0 }]}>Where do you play?</Text>
                <TouchableOpacity onPress={detectProvince} disabled={locating} style={styles.autoDetectBtn}>
                  {locating
                    ? <ActivityIndicator size="small" color={colors.primary} style={{ width: 14, height: 14 }} />
                    : <Ionicons name="location-outline" size={14} color={colors.primary} />
                  }
                  <Text style={[styles.autoDetectText, { color: colors.primary }]}>Auto-detect</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={[styles.fieldInput, { borderColor: showProvincePicker ? colors.primary : colors.border, backgroundColor: colors.background, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}
                onPress={() => setShowProvincePicker(!showProvincePicker)}
                activeOpacity={0.8}
              >
                <Text style={{ color: homeProvince ? colors.foreground : colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 15 }}>
                  {homeProvince || "Select province…"}
                </Text>
                <Ionicons name={showProvincePicker ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
              {showProvincePicker && (
                <View style={[styles.provinceList, { borderColor: colors.border, backgroundColor: colors.background }]}>
                  {SA_PROVINCES.map((p, i) => (
                    <TouchableOpacity
                      key={p}
                      style={[styles.provinceItem, { backgroundColor: homeProvince === p ? colors.primary + "18" : "transparent", borderBottomWidth: i < SA_PROVINCES.length - 1 ? 1 : 0, borderBottomColor: colors.border }]}
                      onPress={() => { Haptics.selectionAsync(); setHomeProvince(p); setShowProvincePicker(false); }}
                    >
                      <Text style={{ color: homeProvince === p ? colors.primary : colors.foreground, fontFamily: homeProvince === p ? "Inter_600SemiBold" : "Inter_400Regular", fontSize: 14 }}>
                        {p}
                      </Text>
                      {homeProvince === p && <Ionicons name="checkmark" size={16} color={colors.primary} />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* ── Account ── */}
              <View style={styles.sectionDivider}>
                <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                <Text style={[styles.dividerLabel, { color: colors.mutedForeground }]}>Account</Text>
                <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
              </View>

              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Email Address</Text>
              <TextInput
                style={[styles.fieldInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                value={email} onChangeText={setEmail} placeholder="email@example.com"
                placeholderTextColor={colors.mutedForeground} keyboardType="email-address"
                autoCapitalize="none" autoCorrect={false}
              />

              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>New Password</Text>
              <View style={[styles.fieldInput, { borderColor: colors.border, backgroundColor: colors.background, flexDirection: "row", alignItems: "center" }]}>
                <TextInput
                  style={{ flex: 1, color: colors.foreground, fontFamily: "Inter_400Regular", fontSize: 15 }}
                  value={newPassword} onChangeText={setNewPassword}
                  placeholder="Leave blank to keep current"
                  placeholderTextColor={colors.mutedForeground}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={18} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>

              {newPassword.length > 0 && (
                <>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Confirm New Password</Text>
                  <View style={[styles.fieldInput, { borderColor: confirmPassword && confirmPassword !== newPassword ? colors.destructive : colors.border, backgroundColor: colors.background, flexDirection: "row", alignItems: "center" }]}>
                    <TextInput
                      style={{ flex: 1, color: colors.foreground, fontFamily: "Inter_400Regular", fontSize: 15 }}
                      value={confirmPassword} onChangeText={setConfirmPassword}
                      placeholder="Confirm new password"
                      placeholderTextColor={colors.mutedForeground}
                      secureTextEntry={!showConfirmPassword}
                    />
                    <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                      <Ionicons name={showConfirmPassword ? "eye-off-outline" : "eye-outline"} size={18} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {saveError ? (
                <Text style={[styles.errorText, { color: colors.destructive }]}>{saveError}</Text>
              ) : null}

              <View style={styles.editBtns}>
                <TouchableOpacity
                  style={[styles.cancelBtn, { borderColor: colors.border }]}
                  onPress={() => { setEditing(false); setSaveError(""); setShowProvincePicker(false); }}
                >
                  <Text style={[styles.cancelText, { color: colors.foreground }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: saving ? colors.muted : colors.primary }]}
                  onPress={saveProfile} disabled={saving}
                >
                  <Text style={styles.saveBtnText}>{saving ? "Saving…" : "Save"}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.menuItem, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={initEdit}
              activeOpacity={0.8}
            >
              <Ionicons name="person-outline" size={20} color={colors.primary} />
              <Text style={[styles.menuText, { color: colors.foreground }]}>Edit Profile</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}

          {/* HNA card verification */}
          <HnaVerificationCard
            token={user.token}
            onVerified={() => {
              apiFetch("/profile", user.token, { cache: "no-store" } as any)
                .then((data: any) => { if (data?.user) updateUser({ ...data.user, token: user.token }); })
                .catch(() => {});
            }}
          />

          {/* Club bans */}
          {myBans.length > 0 && (
            <View style={{ gap: 8 }}>
              <View style={styles.sectionDivider}>
                <View style={[styles.dividerLine, { backgroundColor: colors.destructive + "40" }]} />
                <Text style={[styles.dividerLabel, { color: colors.destructive }]}>Club Restrictions</Text>
                <View style={[styles.dividerLine, { backgroundColor: colors.destructive + "40" }]} />
              </View>
              {myBans.map((ban) => (
                <View key={ban.id} style={[styles.editCard, { borderColor: colors.destructive + "50", backgroundColor: colors.destructive + "08" }]}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                    <Text style={[styles.cardTitle, { color: colors.destructive, fontSize: 14 }]}>{ban.club_name}</Text>
                    <View style={{ backgroundColor: ban.status === "appealing" ? "#92400e20" : colors.destructive + "20", borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: ban.status === "appealing" ? "#92400e" : colors.destructive }}>
                        {ban.status === "appealing" ? "Appeal Pending" : "Restricted"}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.fieldLabel, { color: colors.foreground, marginTop: 0, marginBottom: 4 }]}>{ban.reason}</Text>
                  {ban.status === "appealing" && ban.appeal_response && (
                    <View style={{ backgroundColor: colors.muted, borderRadius: 8, padding: 10, marginTop: 4 }}>
                      <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, marginBottom: 2 }}>Club's response:</Text>
                      <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.foreground }}>{ban.appeal_response}</Text>
                    </View>
                  )}
                  {ban.status === "active" && (
                    <TouchableOpacity
                      style={{ marginTop: 8, borderRadius: 10, borderWidth: 1.5, borderColor: colors.destructive + "60", paddingVertical: 10, alignItems: "center" }}
                      onPress={() => { setAppealBan(ban); setAppealText(""); }}
                      activeOpacity={0.8}
                    >
                      <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.destructive }}>Submit Appeal</Text>
                    </TouchableOpacity>
                  )}
                  {ban.status === "appealing" && !ban.appeal_response && (
                    <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 6 }}>
                      Your appeal has been submitted. The club will review it and respond.
                    </Text>
                  )}
                </View>
              ))}
            </View>
          )}

          {/* Appeal modal */}
          {appealBan && (
            <View style={[styles.editCard, { borderColor: colors.primary + "50", backgroundColor: colors.card }]}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Appeal to {appealBan.club_name}</Text>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 0 }]}>
                Explain why you believe the ban should be lifted. The club will review your appeal.
              </Text>
              <TextInput
                style={[styles.fieldInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background, height: 100, textAlignVertical: "top", paddingTop: 12, marginTop: 4 }]}
                value={appealText}
                onChangeText={setAppealText}
                placeholder="Describe your appeal…"
                placeholderTextColor={colors.mutedForeground}
                multiline
              />
              <View style={styles.editBtns}>
                <TouchableOpacity style={[styles.cancelBtn, { borderColor: colors.border }]} onPress={() => { setAppealBan(null); setAppealText(""); }}>
                  <Text style={[styles.cancelText, { color: colors.foreground }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: appealText.trim().length >= 10 ? colors.primary : colors.muted }]}
                  onPress={handleSubmitAppeal}
                  disabled={submittingAppeal || appealText.trim().length < 10}
                  activeOpacity={0.8}
                >
                  <Text style={styles.saveBtnText}>{submittingAppeal ? "Submitting…" : "Submit Appeal"}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Super User tools */}
          {user.is_super_user && (
            <TouchableOpacity
              style={[styles.menuItem, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "55" }]}
              onPress={() => router.push("/(super)/dashboard")}
              activeOpacity={0.8}
            >
              <Ionicons name="shield-checkmark" size={20} color={colors.primary} />
              <Text style={[styles.menuText, { color: colors.foreground }]}>Super User</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}

          {/* Club Admin tools */}
          {user.role === "club_admin" && (
            <>
              <TouchableOpacity
                style={[styles.menuItem, { backgroundColor: colors.accent + "18", borderColor: colors.accent + "55" }]}
                onPress={() => router.push("/(admin)/revenue")} activeOpacity={0.8}
              >
                <Ionicons name="bar-chart" size={20} color={colors.accent} />
                <Text style={[styles.menuText, { color: colors.foreground }]}>Revenue Dashboard</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.menuItem, { backgroundColor: colors.accent + "18", borderColor: colors.accent + "55" }]}
                onPress={() => router.push("/(admin)/events")} activeOpacity={0.8}
              >
                <Ionicons name="calendar" size={20} color={colors.accent} />
                <Text style={[styles.menuText, { color: colors.foreground }]}>Golf Events &amp; Members</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.menuItem, { backgroundColor: colors.accent + "18", borderColor: colors.accent + "55" }]}
                onPress={() => router.push("/(admin)/broadcast")} activeOpacity={0.8}
              >
                <Ionicons name="megaphone" size={20} color={colors.accent} />
                <Text style={[styles.menuText, { color: colors.foreground }]}>Broadcast Notification</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
              {user.club_id != null && (
                <TouchableOpacity
                  style={[styles.menuItem, { backgroundColor: colors.accent + "18", borderColor: colors.accent + "55" }]}
                  onPress={() => router.push("/(admin)/geofence-config")} activeOpacity={0.8}
                >
                  <Ionicons name="radio" size={20} color={colors.accent} />
                  <Text style={[styles.menuText, { color: colors.foreground }]}>Geofence Configuration</Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
                </TouchableOpacity>
              )}
            </>
          )}

          {[
            { icon: "calendar-outline", label: "My Bookings", onPress: () => router.push("/(tabs)/bookings") },
            { icon: "people-outline", label: "My Friends", onPress: () => router.push("/(tabs)/friends") },
          ].map((item) => (
            <TouchableOpacity
              key={item.label}
              style={[styles.menuItem, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={item.onPress} activeOpacity={0.8}
            >
              <Ionicons name={item.icon as any} size={20} color={colors.primary} />
              <Text style={[styles.menuText, { color: colors.foreground }]}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          ))}

          {/* My Vouchers (cancellation + personal discount — auto-applied at checkout) */}
          <TouchableOpacity
            style={[styles.menuItem, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={handleToggleVouchers} activeOpacity={0.8}
          >
            <Ionicons name="ticket-outline" size={20} color={colors.primary} />
            <Text style={[styles.menuText, { color: colors.foreground }]}>My Vouchers</Text>
            {loadingVouchers
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <Ionicons name={vouchersOpen ? "chevron-down" : "chevron-forward"} size={18} color={colors.mutedForeground} />
            }
          </TouchableOpacity>
          {vouchersOpen && (
            <View style={[styles.voucherPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {voucherList.length === 0 && discountList.length === 0 && !loadingVouchers ? (
                <Text style={[styles.voucherEmpty, { color: colors.mutedForeground }]}>
                  No vouchers yet. Vouchers issued by clubs will appear here and be applied automatically at checkout.
                </Text>
              ) : (
                <>
                  {voucherList.map((v) => {
                    const isExpired  = v.expires_at && new Date(v.expires_at) < new Date();
                    const isRedeemed = !!v.redeemed_at;
                    const statusColor = isRedeemed ? "#6b7280" : isExpired ? colors.destructive : "#16a34a";
                    const statusLabel = isRedeemed ? "Redeemed" : isExpired ? "Expired" : "Active";
                    const expDate = v.expires_at
                      ? new Date(v.expires_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })
                      : null;
                    return (
                      <View key={`cv-${v.id}`} style={[styles.voucherCard, { borderColor: colors.border, opacity: isRedeemed || isExpired ? 0.6 : 1 }]}>
                        <View style={styles.voucherCardTop}>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.voucherClub, { color: colors.foreground }]}>{v.club_name}</Text>
                            {v.reason ? <Text style={[styles.voucherReason, { color: colors.mutedForeground }]}>{v.reason}</Text> : null}
                          </View>
                          <View style={[styles.voucherStatus, { backgroundColor: statusColor + "20" }]}>
                            <Text style={[styles.voucherStatusText, { color: statusColor }]}>{statusLabel}</Text>
                          </View>
                        </View>
                        <View style={[styles.voucherCodeRow, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "40" }]}>
                          <Text style={[styles.voucherCode, { color: colors.primary }]}>{v.code}</Text>
                          <Text style={[styles.voucherCopyHint, { color: colors.mutedForeground }]}>Auto-applied at checkout</Text>
                        </View>
                        <View style={styles.voucherCardMeta}>
                          {v.value_rands != null && (
                            <Text style={[styles.voucherMeta, { color: colors.foreground }]}>
                              {v.value_remaining != null && Number(v.value_remaining) < Number(v.value_rands)
                                ? `R${Number(v.value_remaining).toFixed(2)} remaining (of R${Number(v.value_rands).toFixed(2)})`
                                : `R${Number(v.value_rands).toFixed(2)} off`}
                            </Text>
                          )}
                          {expDate && (
                            <Text style={[styles.voucherMeta, { color: colors.mutedForeground }]}>
                              {isExpired ? "Expired " : "Expires "}{expDate}
                            </Text>
                          )}
                        </View>
                      </View>
                    );
                  })}
                  {discountList.map((v) => {
                    const isExpired     = v.expires_at && new Date(v.expires_at) < new Date();
                    const usesRemaining = v.max_uses != null ? (Number(v.max_uses) - Number(v.uses_count)) : null;
                    const isUsedUp      = usesRemaining !== null && usesRemaining <= 0;
                    const isInactive    = !v.active;
                    const dim           = isExpired || isUsedUp || isInactive;
                    const statusColor   = dim ? "#6b7280" : "#16a34a";
                    const statusLabel   = isInactive ? "Inactive" : isUsedUp ? "Used" : isExpired ? "Expired" : "Active";
                    const discountValue = Number(v.discount_value);
                    const valueText     = v.discount_type === "percentage"
                      ? `${discountValue}% off`
                      : `R${discountValue.toFixed(2)} off`;
                    const remainingText = usesRemaining != null
                      ? `${usesRemaining} use${usesRemaining === 1 ? "" : "s"} remaining`
                      : null;
                    const expDate = v.expires_at
                      ? new Date(v.expires_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })
                      : null;
                    return (
                      <View key={`dv-${v.id}`} style={[styles.voucherCard, { borderColor: colors.border, opacity: dim ? 0.6 : 1 }]}>
                        <View style={styles.voucherCardTop}>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.voucherClub, { color: colors.foreground }]}>{v.club_name ?? "Any Club"}</Text>
                            <Text style={[styles.voucherReason, { color: colors.mutedForeground }]}>Discount voucher</Text>
                          </View>
                          <View style={[styles.voucherStatus, { backgroundColor: statusColor + "20" }]}>
                            <Text style={[styles.voucherStatusText, { color: statusColor }]}>{statusLabel}</Text>
                          </View>
                        </View>
                        <View style={[styles.voucherCodeRow, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "40" }]}>
                          <Text style={[styles.voucherCode, { color: colors.primary }]}>{v.code}</Text>
                          <Text style={[styles.voucherCopyHint, { color: colors.mutedForeground }]}>Auto-applied at checkout</Text>
                        </View>
                        <View style={styles.voucherCardMeta}>
                          <Text style={[styles.voucherMeta, { color: colors.foreground }]}>
                            {remainingText ? `${valueText} · ${remainingText}` : valueText}
                          </Text>
                          {v.min_amount != null && Number(v.min_amount) > 0 && (
                            <Text style={[styles.voucherMeta, { color: colors.mutedForeground }]}>
                              Min booking R{Number(v.min_amount).toFixed(2)}
                            </Text>
                          )}
                          {expDate && (
                            <Text style={[styles.voucherMeta, { color: colors.mutedForeground }]}>
                              {isExpired ? "Expired " : "Expires "}{expDate}
                            </Text>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </>
              )}
            </View>
          )}

          {confirmLogout ? (
            <View style={[styles.menuItem, { backgroundColor: colors.card, borderColor: colors.destructive, borderWidth: 1.5 }]}>
              <Ionicons name="log-out-outline" size={20} color={colors.destructive} />
              <Text style={[styles.menuText, { color: colors.destructive }]}>Are you sure?</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: colors.muted }]} onPress={() => setConfirmLogout(false)}>
                  <Text style={[styles.confirmBtnText, { color: colors.foreground }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: colors.destructive }]} onPress={handleLogout}>
                  <Text style={[styles.confirmBtnText, { color: "#fff" }]}>Sign Out</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.menuItem, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => setConfirmLogout(true)} activeOpacity={0.8}
            >
              <Ionicons name="log-out-outline" size={20} color={colors.destructive} />
              <Text style={[styles.menuText, { color: colors.destructive }]}>Sign Out</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>
        <View style={{ height: Platform.OS === "web" ? 140 : 74 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
  guestTitle: { fontSize: 20, fontFamily: "Inter_600SemiBold" },
  authBtn: { borderRadius: 12, paddingHorizontal: 32, paddingVertical: 14 },
  authBtnText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 16 },
  regLink: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  avatarSection: { alignItems: "center", paddingBottom: 24, gap: 6 },
  avatarWrap: { position: "relative", marginBottom: 4 },
  avatar: { width: 88, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center" },
  avatarImg: { width: 88, height: 88, borderRadius: 44 },
  avatarText: { color: "#fff", fontSize: 30, fontFamily: "Inter_700Bold" },
  cameraBadge: { position: "absolute", bottom: 0, right: 0, width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  tapHint: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  userName: { fontSize: 22, fontFamily: "Inter_700Bold" },
  userEmail: { fontSize: 14, fontFamily: "Inter_400Regular" },
  hcpBadge: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4, marginTop: 4 },
  hcpText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  menuItem: { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 14, borderWidth: 1, padding: 16 },
  menuText: { flex: 1, fontSize: 16, fontFamily: "Inter_500Medium" },
  editCard: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 8 },
  cardTitle: { fontSize: 16, fontFamily: "Inter_700Bold", marginBottom: 4 },
  sectionDivider: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 6 },
  dividerLine: { flex: 1, height: 1 },
  dividerLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },
  fieldLabelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6, marginBottom: 4 },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginBottom: 4, marginTop: 6 },
  fieldInput: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, height: 46, fontSize: 15, fontFamily: "Inter_400Regular" },
  lockedField: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, height: 46, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  lockedFieldValue: { fontSize: 15, fontFamily: "Inter_400Regular", flex: 1 },
  lockedBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20 },
  lockedBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  autoDetectBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  autoDetectText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  genderRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  genderPill: { borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  genderPillText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  provinceList: { borderWidth: 1.5, borderRadius: 10, overflow: "hidden", marginTop: -4 },
  provinceItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 12 },
  editBtns: { flexDirection: "row", gap: 10, marginTop: 8 },
  cancelBtn: { flex: 1, height: 44, borderRadius: 10, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  cancelText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  saveBtn: { flex: 1, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  saveBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  confirmBtn: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  confirmBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  errorText: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 4 },
  backHeader: {
    backgroundColor: "#1a5c38",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  backHeaderTitle: {
    flex: 1, textAlign: "center", color: "#fff",
    fontSize: 17, fontFamily: "Inter_700Bold",
  },
  voucherPanel: {
    borderWidth: 1, borderRadius: 14, padding: 12, gap: 10, marginTop: -8,
  },
  voucherEmpty: {
    fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", paddingVertical: 8, lineHeight: 20,
  },
  voucherCard: {
    borderWidth: 1, borderRadius: 10, padding: 12, gap: 8,
  },
  voucherCardTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  voucherClub: { fontSize: 14, fontFamily: "Inter_700Bold" },
  voucherReason: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2, lineHeight: 16 },
  voucherStatus: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  voucherStatusText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  voucherCodeRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
  },
  voucherCode: { fontSize: 13, fontFamily: "Inter_700Bold", letterSpacing: 1.5 },
  voucherCopyHint: { fontSize: 11, fontFamily: "Inter_500Medium" },
  voucherCardMeta: { flexDirection: "row", gap: 12, flexWrap: "wrap" },
  voucherMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
});
