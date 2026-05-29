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

const dobFromApi = (dateStr: string) => {
  const parts = dateStr.slice(0, 10).split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
};

const dobToApi = (dateStr: string) => {
  const parts = dateStr.split("/");
  if (parts.length === 3) return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
  return dateStr;
};

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout, updateUser } = useAuth();

  // Refresh profile from server on mount so fields added after the initial login
  // (date_of_birth, student_number, etc.) are always up to date in context.
  React.useEffect(() => {
    if (!user?.token) return;
    const token = user.token;
    apiFetch("/profile", token, { cache: "no-store" } as any)
      .then((data: any) => {
        if (data?.user) updateUser({ ...data.user, token });
      })
      .catch(() => {});
  }, [user?.token]);

  const [editing, setEditing] = useState(false);

  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [handicap, setHandicap] = useState(user?.handicap?.toString() ?? "");
  const [gender, setGender] = useState<string>(user?.gender ?? "");
  const [dob, setDob] = useState(
    user?.date_of_birth
      ? Platform.OS === "web"
        ? String(user.date_of_birth).slice(0, 10)
        : dobFromApi(String(user.date_of_birth).slice(0, 10))
      : ""
  );
  const [homeProvince, setHomeProvince] = useState(user?.home_province ?? "");
  const [showProvincePicker, setShowProvincePicker] = useState(false);
  const [locating, setLocating] = useState(false);
  const [studentNumber, setStudentNumber] = useState(user?.student_number ?? "");

  // Derive age from the DOB field so the student-number input appears/disappears live.
  // dob is YYYY-MM-DD on web (native date picker) and DD/MM/YYYY on native (typed).
  const editingAge = React.useMemo(() => {
    if (!dob) return null;
    let y: number, m: number, d: number;
    if (dob.includes("-")) {
      [y, m, d] = dob.split("-").map(Number);
    } else {
      const parts = dob.split("/");
      if (parts.length !== 3 || parts[2].length < 4) return null;
      [d, m, y] = parts.map(Number);
    }
    if (!y || !m || !d || y < 1900 || y > new Date().getFullYear()) return null;
    const birth = new Date(y, m - 1, d);
    if (isNaN(birth.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const mo = today.getMonth() - birth.getMonth();
    if (mo < 0 || (mo === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  }, [dob]);

  const isStudentAge = editingAge !== null && editingAge >= 18 && editingAge <= 24;
  const studentLocked = user?.student_number_locked === true;

  // Sync all user-derived form states whenever the user object changes OR whenever
  // the edit form opens. Runs unconditionally (no editing guard) so that even when
  // initEdit() has a stale React-Compiler closure, this effect always loads the
  // freshest user values after the editing state flip.
  React.useEffect(() => {
    if (!user) return;
    setName(user.name ?? "");
    setPhone(user.phone ?? "");
    setHandicap(user.handicap?.toString() ?? "");
    setGender(user.gender ?? "");
    const rawDob = user.date_of_birth ? String(user.date_of_birth).slice(0, 10) : "";
    setDob(rawDob && Platform.OS !== "web" ? dobFromApi(rawDob) : rawDob);
    setHomeProvince(user.home_province ?? "");
    setStudentNumber(user.student_number ?? "");
    setEmail(user.email ?? "");
  }, [user, editing]);

  const [email, setEmail] = useState(user?.email ?? "");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [uploadingPic, setUploadingPic] = useState(false);

  const topPad = Platform.OS === "web" ? 44 : insets.top;

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={[styles.backHeader, { paddingTop: topPad + 8 }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={10} activeOpacity={0.8}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.backHeaderTitle}>My Profile</Text>
          <View style={{ width: 38 }} />
        </View>
        <View style={styles.center}>
          <Ionicons name="person-circle-outline" size={64} color={colors.mutedForeground} />
          <Text style={[styles.guestTitle, { color: colors.foreground }]}>You're not signed in</Text>
          <TouchableOpacity style={[styles.authBtn, { backgroundColor: colors.primary }]} onPress={() => router.push("/(auth)/login")}>
            <Text style={styles.authBtnText}>Sign In</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push("/(auth)/register")}>
            <Text style={[styles.regLink, { color: colors.primary }]}>Create Account</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const initials = user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const handleDobChange = (text: string) => {
    const digits = text.replace(/\D/g, "").slice(0, 8);
    let formatted = digits;
    if (digits.length > 4) formatted = digits.slice(0, 2) + "/" + digits.slice(2, 4) + "/" + digits.slice(4);
    else if (digits.length > 2) formatted = digits.slice(0, 2) + "/" + digits.slice(2);
    setDob(formatted);
  };

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
        gender: gender || null,
        date_of_birth: dob
          ? dob.includes("-") ? dob : dobToApi(dob)
          : null,
        home_province: homeProvince || null,
        email: email.trim().toLowerCase(),
        student_number: isStudentAge && !studentLocked ? (studentNumber.trim() || null) : undefined,
      };
      if (newPassword) body.password = newPassword;

      const data = await apiFetch("/profile", user.token, {
        method: "PUT",
        body: JSON.stringify(body),
      });

      updateUser({ ...data.user, token: user.token });

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

  const handleLogout = async () => {
    await logout();
    router.replace("/(tabs)");
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
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
          {user.handicap != null && (
            <View style={[styles.hcpBadge, { backgroundColor: colors.accent + "22" }]}>
              <Text style={[styles.hcpText, { color: colors.accent }]}>HCP {user.handicap}</Text>
            </View>
          )}
          {user.home_province ? (
            <View style={[styles.hcpBadge, { backgroundColor: colors.primary + "15", marginTop: 2 }]}>
              <Ionicons name="location-outline" size={12} color={colors.primary} />
              <Text style={[styles.hcpText, { color: colors.primary }]}>{user.home_province}</Text>
            </View>
          ) : null}
          {user.date_of_birth ? (
            <View style={[styles.hcpBadge, { backgroundColor: colors.primary + "12", marginTop: 2 }]}>
              <Ionicons name="calendar-outline" size={12} color={colors.primary} />
              <Text style={[styles.hcpText, { color: colors.primary }]}>
                {dobFromApi(String(user.date_of_birth))}
              </Text>
            </View>
          ) : null}
          {user.student_number ? (
            <View style={[styles.hcpBadge, { backgroundColor: colors.accent + "18", marginTop: 2 }]}>
              <Ionicons name="school-outline" size={12} color={colors.accent} />
              <Text style={[styles.hcpText, { color: colors.accent }]}>Student {user.student_number}</Text>
            </View>
          ) : null}
          {user.role === "club_admin" && (
            <View style={[styles.hcpBadge, { backgroundColor: colors.primary + "22", marginTop: 2 }]}>
              <Ionicons name="shield-checkmark" size={12} color={colors.primary} />
              <Text style={[styles.hcpText, { color: colors.primary }]}>
                {user.club_id == null ? "Platform Admin" : "Club Admin"}
              </Text>
            </View>
          )}
          <Text style={[styles.tapHint, { color: colors.mutedForeground }]}>Tap photo to change</Text>
        </View>

        <View style={{ padding: 20, gap: 12 }}>
          {/* Edit profile */}
          {editing ? (
            <View style={[styles.editCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Edit Profile</Text>

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

              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Date of Birth</Text>
              {Platform.OS === "web" ? (
                <TextInput
                  style={[styles.fieldInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                  value={dob}
                  onChangeText={setDob}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.mutedForeground}
                  maxLength={10}
                />
              ) : (
                <TextInput
                  style={[styles.fieldInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                  value={dob}
                  onChangeText={handleDobChange}
                  placeholder="DD/MM/YYYY"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="numeric"
                  maxLength={10}
                />
              )}

              {isStudentAge && (
                <>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Student Number</Text>
                  {studentLocked ? (
                    <View style={[styles.fieldInput, { borderColor: colors.border, backgroundColor: colors.muted ?? colors.background + "88", flexDirection: "row", alignItems: "center", gap: 6 }]}>
                      <Ionicons name="lock-closed-outline" size={14} color={colors.mutedForeground} />
                      <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 15, flex: 1 }}>
                        {user?.student_number ?? "—"}
                      </Text>
                    </View>
                  ) : (
                    <TextInput
                      style={[styles.fieldInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                      value={studentNumber} onChangeText={setStudentNumber}
                      placeholder="e.g. 12345678"
                      placeholderTextColor={colors.mutedForeground}
                      autoCapitalize="none" autoCorrect={false}
                    />
                  )}
                  <Text style={[{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 12, marginTop: -6, marginBottom: 4 }]}>
                    Used to verify student pricing at clubs that offer it.
                  </Text>
                </>
              )}

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
});
