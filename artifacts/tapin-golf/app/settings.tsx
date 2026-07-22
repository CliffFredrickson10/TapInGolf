import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import GolfBallLoader from "@/components/GolfBallLoader";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/lib/api";

const LOCATION_KEY = "tapin_location_enabled";
const ANALYTICS_KEY = "tapin_analytics_consent";

type AdRemovalConfig = {
  price_zar: number;
  period_days: number;
  period_label: string;
};

type AdRemovalSubscription = {
  active: boolean;
  expires_at: string;
} | null;

type NotifPrefs = {
  bookings: boolean;
  messages: boolean;
  friend_requests: boolean;
  payments: boolean;
  club_news: boolean;
  promotions: boolean;
};

type BlockedUser = {
  id: number;
  userId: number;
  name: string;
  email: string;
  avatar: string | null;
};

type SearchUser = {
  id: number;
  name: string;
  email: string;
  avatar: string | null;
};

export default function SettingsScreen() {
  const colors = useColors();
  const { user, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 44 : insets.top;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  // Privacy toggles
  const [isPrivate, setIsPrivate] = useState(false);
  const [locationEnabled, setLocationEnabled] = useState(true);
  const [analyticsConsent, setAnalyticsConsent] = useState(true);

  // Notification prefs
  const [notifs, setNotifs] = useState<NotifPrefs>({
    bookings: true,
    messages: true,
    friend_requests: true,
    payments: true,
    club_news: true,
    promotions: false,
  });
  const [savingNotif, setSavingNotif] = useState<string | null>(null);

  // Danger zone — account deletion (2-stage)
  const [deleteStage, setDeleteStage] = useState<0 | 1 | 2>(0);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    if (!user) return;
    setDeleting(true);
    try {
      await apiFetch("/settings/account", user.token, { method: "DELETE" });
      await logout();
    } catch {
      setDeleting(false);
      setDeleteStage(0);
    }
  };

  // Ad removal
  const [adConfig, setAdConfig] = useState<AdRemovalConfig>({ price_zar: 29.99, period_days: 30, period_label: "30 days" });
  const [adSub, setAdSub] = useState<AdRemovalSubscription>(null);
  const [purchasingAds, setPurchasingAds] = useState(false);

  // Blocked accounts
  const [showBlocked, setShowBlocked] = useState(false);
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [blockedLoading, setBlockedLoading] = useState(false);
  const [unblockingId, setUnblockingId] = useState<number | null>(null);

  // Block search
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [blockingId, setBlockingId] = useState<number | null>(null);

  const loadAdRemoval = useCallback(async () => {
    if (!user) return;
    try {
      const data = await apiFetch("/settings/ad-removal", user.token);
      if (data.config) setAdConfig(data.config);
      setAdSub(data.subscription ?? null);
    } catch {}
  }, [user]);

  const handlePurchaseAdRemoval = async () => {
    if (!user) return;
    setPurchasingAds(true);
    try {
      const data = await apiFetch("/settings/ad-removal/purchase", user.token, { method: "POST" });
      if (data.payment_url && data.purchase_id) {
        router.push({
          pathname: "/payment/ad-removal",
          params: { url: data.payment_url, purchase_id: String(data.purchase_id) },
        });
      }
    } catch {}
    setPurchasingAds(false);
  };

  const loadPrivacy = useCallback(async () => {
    if (!user) return;
    try {
      const data = await apiFetch("/settings/privacy", user.token);
      setIsPrivate(data.is_private ?? false);
      setAnalyticsConsent(data.analytics_consent ?? true);
    } catch {}
    try {
      const stored = await AsyncStorage.getItem(LOCATION_KEY);
      setLocationEnabled(stored === null ? true : stored === "true");
    } catch {}
  }, [user]);

  const loadNotifs = useCallback(async () => {
    if (!user) return;
    try {
      const data = await apiFetch("/settings/notifications", user.token);
      setNotifs({
        bookings:        data.bookings        ?? true,
        messages:        data.messages        ?? true,
        friend_requests: data.friend_requests ?? true,
        payments:        data.payments        ?? true,
        club_news:       data.club_news       ?? true,
        promotions:      data.promotions      ?? false,
      });
    } catch {}
  }, [user]);

  const toggleNotif = async (key: keyof NotifPrefs, val: boolean) => {
    setNotifs((prev) => ({ ...prev, [key]: val }));
    setSavingNotif(key);
    try {
      await apiFetch("/settings/notifications", user!.token, {
        method: "PUT",
        body: JSON.stringify({ [key]: val }),
      });
      Haptics.selectionAsync();
    } catch {
      setNotifs((prev) => ({ ...prev, [key]: !val }));
    }
    setSavingNotif(null);
  };

  const loadBlocked = useCallback(async () => {
    if (!user) return;
    setBlockedLoading(true);
    try {
      const data = await apiFetch("/settings/blocked", user.token);
      setBlocked(data.blocked ?? []);
    } catch {}
    setBlockedLoading(false);
  }, [user]);

  useEffect(() => {
    Promise.all([loadPrivacy(), loadNotifs(), loadAdRemoval()]).finally(() => setLoading(false));
  }, [loadPrivacy, loadNotifs, loadAdRemoval]);

  useEffect(() => {
    if (showBlocked && blocked.length === 0) loadBlocked();
  }, [showBlocked, loadBlocked, blocked.length]);

  const updatePrivacy = async (field: "is_private" | "analytics_consent", value: boolean) => {
    if (!user) return;
    setSaving(field);
    try {
      await apiFetch("/settings/privacy", user.token, {
        method: "PUT",
        body: JSON.stringify({ [field]: value }),
      });
      Haptics.selectionAsync();
    } catch {
      // revert on failure
      if (field === "is_private") setIsPrivate(!value);
      if (field === "analytics_consent") setAnalyticsConsent(!value);
    }
    setSaving(null);
  };

  const togglePrivate = (val: boolean) => {
    setIsPrivate(val);
    updatePrivacy("is_private", val);
  };

  const toggleAnalytics = (val: boolean) => {
    setAnalyticsConsent(val);
    updatePrivacy("analytics_consent", val);
  };

  const toggleLocation = async (val: boolean) => {
    setLocationEnabled(val);
    await AsyncStorage.setItem(LOCATION_KEY, String(val));
    Haptics.selectionAsync();
    if (val) {
      await Location.requestForegroundPermissionsAsync();
    }
  };

  const handleUnblock = async (blockId: number) => {
    if (!user) return;
    setUnblockingId(blockId);
    try {
      await apiFetch(`/settings/block/${blockId}`, user.token, { method: "DELETE" });
      setBlocked((prev) => prev.filter((b) => b.id !== blockId));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
    setUnblockingId(null);
  };

  const handleSearch = async (q: string) => {
    setSearchQuery(q);
    if (q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const data = await apiFetch(`/users/search?q=${encodeURIComponent(q)}`, user!.token);
      const blockedIds = new Set(blocked.map((b) => b.userId));
      setSearchResults((data.users ?? []).filter((u: SearchUser) => !blockedIds.has(u.id)));
    } catch {}
    setSearching(false);
  };

  const handleBlock = async (target: SearchUser) => {
    if (!user) return;
    setBlockingId(target.id);
    try {
      const data = await apiFetch("/settings/block", user.token, {
        method: "POST",
        body: JSON.stringify({ target_id: target.id }),
      });
      const newBlock: BlockedUser = { id: data.id, userId: target.id, name: target.name, email: target.email, avatar: target.avatar };
      setBlocked((prev) => [newBlock, ...prev]);
      setSearchResults((prev) => prev.filter((u) => u.id !== target.id));
      setSearchQuery("");
      setShowSearch(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
    setBlockingId(null);
  };

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={[styles.backHeader, { paddingTop: topPad + 8 }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={10} activeOpacity={0.8}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.backHeaderTitle}>Settings</Text>
          <View style={{ width: 38 }} />
        </View>
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Sign in to access settings</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Back-button header */}
      <View style={[styles.backHeader, { paddingTop: topPad + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={10} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.backHeaderTitle}>Settings</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={false} onRefresh={loadPrivacy} tintColor={colors.primary} />}
      >
        {loading ? (
          <View style={styles.center}>
            <GolfBallLoader />
          </View>
        ) : (
          <View style={{ padding: 20, gap: 20 }}>

            {/* ═══════════════ PRIVACY ═══════════════ */}
            <View>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionIconWrap, { backgroundColor: colors.primary + "18" }]}>
                  <Ionicons name="shield-checkmark" size={18} color={colors.primary} />
                </View>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Privacy</Text>
              </View>

              <View style={[styles.settingsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>

                {/* Private Account */}
                <View style={styles.settingRow}>
                  <View style={[styles.settingIconWrap, { backgroundColor: colors.primary + "15" }]}>
                    <Ionicons name="lock-closed" size={18} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.settingTitle, { color: colors.foreground }]}>Private Account</Text>
                    <Text style={[styles.settingDesc, { color: colors.mutedForeground }]}>
                      Other users won't see your content or interact with you. You also won't be able to join open matches or tournaments.
                    </Text>
                  </View>
                  {saving === "is_private" ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Switch
                      value={isPrivate}
                      onValueChange={togglePrivate}
                      trackColor={{ false: colors.border, true: colors.primary + "88" }}
                      thumbColor={isPrivate ? colors.primary : colors.muted}
                      ios_backgroundColor={colors.border}
                    />
                  )}
                </View>

                <View style={[styles.divider, { backgroundColor: colors.border }]} />

                {/* Blocked Accounts */}
                <TouchableOpacity
                  style={styles.settingRow}
                  onPress={() => setShowBlocked(!showBlocked)}
                  activeOpacity={0.75}
                >
                  <View style={[styles.settingIconWrap, { backgroundColor: colors.destructive + "18" }]}>
                    <Ionicons name="ban" size={18} color={colors.destructive} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.settingTitle, { color: colors.foreground }]}>Blocked Accounts</Text>
                    <Text style={[styles.settingDesc, { color: colors.mutedForeground }]}>
                      Block users to prevent unwanted interactions and friend requests.
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    {blocked.length > 0 && (
                      <View style={[styles.countPill, { backgroundColor: colors.destructive + "22" }]}>
                        <Text style={[styles.countPillText, { color: colors.destructive }]}>{blocked.length}</Text>
                      </View>
                    )}
                    <Ionicons name={showBlocked ? "chevron-up" : "chevron-forward"} size={16} color={colors.mutedForeground} />
                  </View>
                </TouchableOpacity>

                {showBlocked && (
                  <View style={[styles.blockedExpanded, { borderTopColor: colors.border }]}>

                    {/* Search to block */}
                    <TouchableOpacity
                      style={[styles.addBlockBtn, { borderColor: showSearch ? colors.destructive : colors.border, backgroundColor: colors.background }]}
                      onPress={() => { setShowSearch(!showSearch); setSearchQuery(""); setSearchResults([]); }}
                      activeOpacity={0.8}
                    >
                      <Ionicons name={showSearch ? "close" : "person-add"} size={16} color={colors.destructive} />
                      <Text style={[styles.addBlockText, { color: colors.destructive }]}>{showSearch ? "Cancel" : "Block a user"}</Text>
                    </TouchableOpacity>

                    {showSearch && (
                      <View style={{ gap: 8 }}>
                        <View style={[styles.searchBox, { borderColor: colors.border, backgroundColor: colors.background }]}>
                          <Ionicons name="search-outline" size={16} color={colors.mutedForeground} />
                          <TextInput
                            style={[styles.searchInput, { color: colors.foreground }]}
                            value={searchQuery}
                            onChangeText={handleSearch}
                            placeholder="Search by name or email…"
                            placeholderTextColor={colors.mutedForeground}
                            autoFocus
                          />
                          {searching && <ActivityIndicator size="small" color={colors.primary} />}
                        </View>
                        {searchResults.map((u) => (
                          <View key={u.id} style={[styles.searchResultRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
                            <UserAvatar user={u} size={36} colors={colors} />
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.resultName, { color: colors.foreground }]}>{u.name}</Text>
                              <Text style={[styles.resultEmail, { color: colors.mutedForeground }]}>{u.email}</Text>
                            </View>
                            {blockingId === u.id ? (
                              <ActivityIndicator size="small" color={colors.destructive} />
                            ) : (
                              <TouchableOpacity
                                style={[styles.blockBtn, { backgroundColor: colors.destructive + "18", borderColor: colors.destructive + "44" }]}
                                onPress={() => handleBlock(u)}
                              >
                                <Text style={[styles.blockBtnText, { color: colors.destructive }]}>Block</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        ))}
                        {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
                          <Text style={[styles.noResults, { color: colors.mutedForeground }]}>No users found</Text>
                        )}
                      </View>
                    )}

                    {blockedLoading ? (
                      <ActivityIndicator color={colors.primary} style={{ marginTop: 8 }} />
                    ) : blocked.length === 0 ? (
                      <View style={styles.emptyBlocked}>
                        <Ionicons name="shield-outline" size={28} color={colors.mutedForeground} />
                        <Text style={[styles.emptyBlockedText, { color: colors.mutedForeground }]}>No blocked accounts</Text>
                      </View>
                    ) : (
                      <View style={{ gap: 8, marginTop: 4 }}>
                        {blocked.map((b) => (
                          <View key={b.id} style={[styles.blockedRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
                            <UserAvatar user={b} size={38} colors={colors} />
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.resultName, { color: colors.foreground }]}>{b.name}</Text>
                              <Text style={[styles.resultEmail, { color: colors.mutedForeground }]}>{b.email}</Text>
                            </View>
                            {unblockingId === b.id ? (
                              <ActivityIndicator size="small" color={colors.primary} />
                            ) : (
                              <TouchableOpacity
                                style={[styles.unblockBtn, { borderColor: colors.border }]}
                                onPress={() => handleUnblock(b.id)}
                              >
                                <Text style={[styles.unblockText, { color: colors.foreground }]}>Unblock</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                )}

                <View style={[styles.divider, { backgroundColor: colors.border }]} />

                {/* Location Services */}
                <View style={styles.settingRow}>
                  <View style={[styles.settingIconWrap, { backgroundColor: "#1a7a4a18" }]}>
                    <Ionicons name="location" size={18} color="#1a7a4a" />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.settingTitle, { color: colors.foreground }]}>Location Services</Text>
                    <Text style={[styles.settingDesc, { color: colors.mutedForeground }]}>
                      Allow TapIn Golf to use your device location for auto-detecting your province and nearby clubs.
                    </Text>
                  </View>
                  <Switch
                    value={locationEnabled}
                    onValueChange={toggleLocation}
                    trackColor={{ false: colors.border, true: "#1a7a4a88" }}
                    thumbColor={locationEnabled ? "#1a7a4a" : colors.muted}
                    ios_backgroundColor={colors.border}
                  />
                </View>

                <View style={[styles.divider, { backgroundColor: colors.border }]} />

                {/* Terms of Use & Privacy */}
                <View style={styles.settingRow}>
                  <View style={[styles.settingIconWrap, { backgroundColor: colors.accent + "18" }]}>
                    <Ionicons name="analytics" size={18} color={colors.accent} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.settingTitle, { color: colors.foreground }]}>Data & Analytics</Text>
                    <Text style={[styles.settingDesc, { color: colors.mutedForeground }]}>
                      TapIn Golf collects usage data to improve the app experience, such as analytics and usage statistics. Required for use of the service.
                    </Text>
                    <TouchableOpacity onPress={() => router.push("/legal/terms")}>
                      <Text style={[styles.policyLink, { color: colors.primary }]}>Terms of Use & Privacy Policy</Text>
                    </TouchableOpacity>
                  </View>
                  {saving === "analytics_consent" ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Switch
                      value={analyticsConsent}
                      onValueChange={toggleAnalytics}
                      trackColor={{ false: colors.border, true: colors.accent + "88" }}
                      thumbColor={analyticsConsent ? colors.accent : colors.muted}
                      ios_backgroundColor={colors.border}
                    />
                  )}
                </View>

              </View>
            </View>

            {/* ═══════════════ NOTIFICATIONS ═══════════════ */}
            <View>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionIconWrap, { backgroundColor: colors.accent + "18" }]}>
                  <Ionicons name="notifications" size={18} color={colors.accent} />
                </View>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Notifications</Text>
              </View>

              <View style={[styles.settingsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {([
                  {
                    key: "bookings" as const,
                    icon: "calendar",
                    iconBg: colors.primary + "15",
                    iconColor: colors.primary,
                    title: "Booking Notifications",
                    desc: "Confirmations, cancellations and player invites for your tee times.",
                  },
                  {
                    key: "messages" as const,
                    icon: "chatbubbles",
                    iconBg: "#0ea5e915",
                    iconColor: "#0ea5e9",
                    title: "Friend Messages",
                    desc: "New messages and conversations from your friends.",
                  },
                  {
                    key: "friend_requests" as const,
                    icon: "people",
                    iconBg: "#8b5cf615",
                    iconColor: "#8b5cf6",
                    title: "Friend Requests",
                    desc: "New friend requests and when someone accepts yours.",
                  },
                  {
                    key: "payments" as const,
                    icon: "card",
                    iconBg: "#22c55e15",
                    iconColor: "#22c55e",
                    title: "Payment Notifications",
                    desc: "Payment confirmations, failures and split-bill updates.",
                  },
                  {
                    key: "club_news" as const,
                    icon: "golf",
                    iconBg: "#f5970015",
                    iconColor: "#f59700",
                    title: "Club Notifications",
                    desc: "Club updates, event announcements and course arrival alerts.",
                  },
                  {
                    key: "promotions" as const,
                    icon: "megaphone",
                    iconBg: colors.accent + "15",
                    iconColor: colors.accent,
                    title: "Promotions & App Updates",
                    desc: "Special offers, app news and TapIn Golf announcements.",
                  },
                ] as const).map((item, i, arr) => (
                  <React.Fragment key={item.key}>
                    <View style={styles.settingRow}>
                      <View style={[styles.settingIconWrap, { backgroundColor: item.iconBg }]}>
                        <Ionicons name={item.icon as any} size={18} color={item.iconColor} />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={[styles.settingTitle, { color: colors.foreground }]}>{item.title}</Text>
                        <Text style={[styles.settingDesc, { color: colors.mutedForeground }]}>{item.desc}</Text>
                      </View>
                      {savingNotif === item.key ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <Switch
                          value={notifs[item.key]}
                          onValueChange={(val) => toggleNotif(item.key, val)}
                          trackColor={{ false: colors.border, true: colors.primary + "88" }}
                          thumbColor={notifs[item.key] ? colors.primary : colors.muted}
                          ios_backgroundColor={colors.border}
                        />
                      )}
                    </View>
                    {i < arr.length - 1 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
                  </React.Fragment>
                ))}
              </View>
            </View>

            {/* ═══════════════ DANGER ZONE ═══════════════ */}
            <View>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionIconWrap, { backgroundColor: colors.destructive + "18" }]}>
                  <Ionicons name="warning" size={18} color={colors.destructive} />
                </View>
                <Text style={[styles.sectionTitle, { color: colors.destructive }]}>Danger Zone</Text>
              </View>

              <View style={[styles.settingsCard, { backgroundColor: colors.card, borderColor: colors.destructive + "44" }]}>

                {deleteStage === 0 && (
                  /* ── Stage 0: entry button ── */
                  <TouchableOpacity
                    style={styles.settingRow}
                    onPress={() => setDeleteStage(1)}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.settingIconWrap, { backgroundColor: colors.destructive + "18" }]}>
                      <Ionicons name="trash" size={18} color={colors.destructive} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[styles.settingTitle, { color: colors.destructive }]}>Delete My Account</Text>
                      <Text style={[styles.settingDesc, { color: colors.mutedForeground }]}>
                        Permanently remove your account and all associated data.
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.destructive} />
                  </TouchableOpacity>
                )}

                {deleteStage === 1 && (
                  /* ── Stage 1: warning + escalation ── */
                  <View style={{ padding: 16, gap: 14 }}>
                    <View style={[styles.dangerWarningBox, { backgroundColor: colors.destructive + "10", borderColor: colors.destructive + "44" }]}>
                      <Ionicons name="warning" size={20} color={colors.destructive} style={{ flexShrink: 0 }} />
                      <View style={{ flex: 1, gap: 6 }}>
                        <Text style={[styles.dangerWarningTitle, { color: colors.destructive }]}>
                          This action is permanent and cannot be undone.
                        </Text>
                        <Text style={[styles.dangerWarningBody, { color: colors.mutedForeground }]}>
                          Deleting your account will immediately remove:
                        </Text>
                        {[
                          "Your profile and login access",
                          "All booking history and upcoming bookings",
                          "Your friends list and connections",
                          "Your reviews and club ratings",
                          "Any active ad-removal subscription",
                        ].map((item) => (
                          <View key={item} style={styles.dangerBulletRow}>
                            <Ionicons name="close-circle" size={13} color={colors.destructive} style={{ marginTop: 2, flexShrink: 0 }} />
                            <Text style={[styles.dangerBulletText, { color: colors.mutedForeground }]}>{item}</Text>
                          </View>
                        ))}
                      </View>
                    </View>

                    <TouchableOpacity
                      style={[styles.dangerConfirmBtn, { borderColor: colors.destructive }]}
                      onPress={() => setDeleteStage(2)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="trash-outline" size={17} color={colors.destructive} />
                      <Text style={[styles.dangerConfirmBtnText, { color: colors.destructive }]}>
                        I understand — continue
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={() => setDeleteStage(0)} activeOpacity={0.7}>
                      <Text style={[styles.dangerCancelText, { color: colors.mutedForeground }]}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {deleteStage === 2 && (
                  /* ── Stage 2: final irreversible confirm ── */
                  <View style={{ padding: 16, gap: 14 }}>
                    <Text style={[styles.dangerFinalTitle, { color: colors.foreground }]}>
                      Are you absolutely sure?
                    </Text>
                    <Text style={[styles.dangerFinalBody, { color: colors.mutedForeground }]}>
                      There is no recovery option. Once deleted, your account, bookings, and all data are gone forever.
                    </Text>

                    <TouchableOpacity
                      style={[styles.dangerDeleteBtn, { backgroundColor: colors.destructive, opacity: deleting ? 0.7 : 1 }]}
                      onPress={handleDeleteAccount}
                      disabled={deleting}
                      activeOpacity={0.82}
                    >
                      {deleting ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="trash" size={17} color="#fff" />
                          <Text style={styles.dangerDeleteBtnText}>Yes, permanently delete my account</Text>
                        </>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity onPress={() => setDeleteStage(0)} activeOpacity={0.7} disabled={deleting}>
                      <Text style={[styles.dangerCancelText, { color: colors.mutedForeground }]}>Cancel — keep my account</Text>
                    </TouchableOpacity>
                  </View>
                )}

              </View>
            </View>

            <Text style={[styles.versionText, { color: colors.mutedForeground }]}>TapIn Golf · Version 1.0.0</Text>

          </View>
        )}
        <View style={{ height: Platform.OS === "web" ? 140 : 74 }} />
      </ScrollView>
    </View>
  );
}

function UserAvatar({ user, size, colors }: { user: { name: string; avatar: string | null }; size: number; colors: any }) {
  const initials = user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  return user.avatar ? (
    <Image source={{ uri: user.avatar }} style={{ width: size, height: size, borderRadius: size / 2 }} />
  ) : (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.primary + "30", alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: colors.primary, fontSize: size * 0.35, fontFamily: "Inter_700Bold" }}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backHeader: {
    backgroundColor: "#1a5c38",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  backHeaderTitle: {
    flex: 1,
    textAlign: "center",
    color: "#fff",
    fontSize: 17,
    fontFamily: "Inter_700Bold",
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 200 },
  emptyText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  sectionIconWrap: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  sectionTitle: { flex: 1, fontSize: 17, fontFamily: "Inter_700Bold" },
  settingsCard: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  settingRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14 },
  settingIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", marginTop: 2, flexShrink: 0 },
  settingTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  settingDesc: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  policyLink: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginTop: 4 },
  divider: { height: 1, marginHorizontal: 14 },
  countPill: { borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  countPillText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  blockedExpanded: { borderTopWidth: 1, padding: 12, gap: 10 },
  addBlockBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1.5, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, borderStyle: "dashed" },
  addBlockText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, height: 44 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  searchResultRow: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 10, borderWidth: 1, padding: 10 },
  resultName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  resultEmail: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  blockBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  blockBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  blockedRow: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 10, borderWidth: 1, padding: 10 },
  unblockBtn: { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  unblockText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  emptyBlocked: { alignItems: "center", gap: 6, paddingVertical: 12 },
  emptyBlockedText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  noResults: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", paddingVertical: 8 },
  aboutRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  socialIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  aboutLabel: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },
  versionText: { textAlign: "center", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 4 },
  adDisclaimer: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderWidth: 1, borderRadius: 10, padding: 10 },
  adDisclaimerText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  adActiveBadge: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 10, padding: 12 },
  adActiveTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  adActiveExpiry: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  adPriceRow: { flexDirection: "row", alignItems: "baseline" },
  adPriceLabel: { fontSize: 22, fontFamily: "Inter_700Bold" },
  adPricePeriod: { fontSize: 14, fontFamily: "Inter_400Regular" },
  adPurchaseBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, paddingVertical: 14 },
  adPurchaseBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  dangerWarningBox: { flexDirection: "row", gap: 10, borderWidth: 1, borderRadius: 12, padding: 12 },
  dangerWarningTitle: { fontSize: 13, fontFamily: "Inter_700Bold", lineHeight: 18 },
  dangerWarningBody: { fontSize: 12, fontFamily: "Inter_500Medium" },
  dangerBulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  dangerBulletText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  dangerConfirmBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1.5, borderRadius: 12, paddingVertical: 13 },
  dangerConfirmBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  dangerCancelText: { textAlign: "center", fontSize: 13, fontFamily: "Inter_500Medium" },
  dangerFinalTitle: { fontSize: 17, fontFamily: "Inter_700Bold", textAlign: "center" },
  dangerFinalBody: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19, textAlign: "center" },
  dangerDeleteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, paddingVertical: 14 },
  dangerDeleteBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },
});
