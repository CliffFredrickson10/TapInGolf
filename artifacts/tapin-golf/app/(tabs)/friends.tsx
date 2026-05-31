import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import GolfBallLoader from "@/components/GolfBallLoader";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import FriendCard, { Friend } from "@/components/FriendCard";
import { AppHeader } from "@/components/AppHeader";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/lib/api";

type Conversation = {
  id: number;
  display_name: string;
  is_group: boolean;
  last_message?: string;
  last_message_at?: string;
  last_sender_name?: string;
  member_count: number;
};

type Tab = "friends" | "messages";

export default function FriendsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("friends");

  // Friends state
  const [friends, setFriends] = useState<Friend[]>([]);
  const [pending, setPending] = useState<Friend[]>([]);
  const [requested, setRequested] = useState<Friend[]>([]);
  const [invited, setInvited] = useState<{id:number;email:string;created_at:string}[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [addEmail, setAddEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [suggestions, setSuggestions] = useState<{id:number;name:string;email:string;avatar:string|null}[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<number | null>(null);

  // Messages state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [convoLoading, setConvoLoading] = useState(true);

  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string, error = false) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, error });
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };

  const loadFriends = async () => {
    if (!user) { setFriendsLoading(false); return; }
    try {
      const data = await apiFetch("/friends", user.token);
      setFriends(data.friends ?? []);
      setPending(data.pending ?? []);
      setRequested(data.requested ?? []);
      setInvited(data.invited ?? []);
    } catch {}
    setFriendsLoading(false);
  };

  const loadConversations = async () => {
    if (!user) { setConvoLoading(false); return; }
    try {
      const data = await apiFetch("/conversations", user.token);
      setConversations(data.conversations ?? []);
    } catch {}
    setConvoLoading(false);
  };

  useEffect(() => {
    loadFriends();
    loadConversations();
  }, [user]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadFriends(), loadConversations()]);
    setRefreshing(false);
  };

  const handleEmailChange = (text: string) => {
    setAddEmail(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 2) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      if (!user) return;
      setSuggestionsLoading(true);
      try {
        const data = await apiFetch(`/users/search?q=${encodeURIComponent(text.trim())}`, user.token);
        setSuggestions(data.users ?? []);
      } catch { setSuggestions([]); }
      finally { setSuggestionsLoading(false); }
    }, 300);
  };

  const pickSuggestion = (s: {email:string}) => {
    setAddEmail(s.email);
    setSuggestions([]);
  };

  const sendRequest = async () => {
    if (!addEmail.trim() || !user) return;
    setAdding(true);
    try {
      setSuggestions([]);
      const result = await apiFetch("/friends/request", user.token, {
        method: "POST",
        body: JSON.stringify({ email: addEmail.trim().toLowerCase() }),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (result?.invited) {
        showToast(`Invitation sent to ${addEmail.trim()}`);
      } else {
        showToast(`Request sent to ${addEmail.trim()}`);
      }
      setAddEmail("");
      setShowAdd(false);
      await loadFriends();
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showToast(err.message ?? "Could not send request", true);
    } finally {
      setAdding(false);
    }
  };

  const acceptRequest = async (friendId: number) => {
    if (!user) return;
    try {
      await apiFetch(`/friends/${friendId}/accept`, user.token, { method: "PUT" });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast("Friend request accepted!");
      await loadFriends();
    } catch (err: any) {
      showToast(err.message ?? "Could not accept request", true);
    }
  };

  const removeFriend = async (friendId: number) => {
    if (!user) return;
    try {
      await apiFetch(`/friends/${friendId}`, user.token, { method: "DELETE" });
      setConfirmRemoveId(null);
      showToast("Friend removed");
      await loadFriends();
    } catch (err: any) {
      showToast(err.message ?? "Could not remove friend", true);
    }
  };

  const formatConvoTime = (iso?: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
  };

  if (!user) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Ionicons name="people-outline" size={48} color={colors.mutedForeground} />
        <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Sign in to see friends</Text>
        <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary }]} onPress={() => router.push("/(auth)/login")}>
          <Text style={styles.btnText}>Sign In</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const cancelInvitation = async (invId: number) => {
    if (!user) return;
    try {
      await apiFetch(`/friends/invitation/${invId}`, user.token, { method: "DELETE" });
      setInvited(prev => prev.filter(i => i.id !== invId));
      showToast("Invitation cancelled");
    } catch (err: any) {
      showToast(err.message ?? "Could not cancel invitation", true);
    }
  };

  const friendItems = [
    ...pending.map(f => ({ ...f, _type: "incoming" as const })),
    ...requested.map(f => ({ ...f, _type: "outgoing" as const })),
    ...invited.map(i => ({ ...i, _type: "invited" as const, id: i.id, name: i.email, avatar: null, handicap: null, friendship_id: i.id, status: "invited", direction: "invited" })),
    ...friends.map(f => ({ ...f, _type: "friend" as const })),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader />
      {toast && (
        <View style={[styles.toast, { backgroundColor: toast.error ? colors.destructive : colors.primary }]}>
          <Ionicons name={toast.error ? "alert-circle" : "checkmark-circle"} size={16} color="#fff" />
          <Text style={styles.toastText}>{toast.msg}</Text>
        </View>
      )}

      {/* Header */}
      <View style={[styles.header, { paddingTop: 14 }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>
          {tab === "friends" ? "Friends" : "Messages"}
        </Text>
        <View style={{ flexDirection: "row", gap: 10 }}>
          {tab === "friends" && (
            <TouchableOpacity
              style={[styles.iconBtn, { backgroundColor: colors.primary }]}
              onPress={() => setShowAdd(!showAdd)}
            >
              <Ionicons name={showAdd ? "close" : "person-add-outline"} size={18} color="#fff" />
            </TouchableOpacity>
          )}
          {tab === "messages" && (
            <TouchableOpacity
              style={[styles.iconBtn, { backgroundColor: colors.primary }]}
              onPress={() => { Haptics.selectionAsync(); router.push("/chat/new"); }}
            >
              <Ionicons name="create-outline" size={18} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Tab switcher */}
      <View style={[styles.tabBar, { borderColor: colors.border, backgroundColor: colors.card }]}>
        {(["friends", "messages"] as Tab[]).map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.tabItem, tab === t && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => { setTab(t); if (t === "messages") loadConversations(); }}
          >
            <Ionicons
              name={t === "friends" ? "people" : "chatbubbles"}
              size={16}
              color={tab === t ? colors.primary : colors.mutedForeground}
            />
            <Text style={[styles.tabText, { color: tab === t ? colors.primary : colors.mutedForeground }]}>
              {t === "friends" ? "Friends" : "Messages"}
            </Text>
            {t === "friends" && pending.length > 0 && (
              <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                <Text style={styles.badgeText}>{pending.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Friends tab */}
      {tab === "friends" && (
        <>
          {showAdd && (
            <View style={[styles.addBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <TextInput
                style={[styles.addInput, { color: colors.foreground, borderColor: colors.border }]}
                value={addEmail}
                onChangeText={handleEmailChange}
                placeholder="Enter friend's name or email"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="email-address"
                autoCapitalize="none"
                autoFocus
              />
              {(suggestions.length > 0 || suggestionsLoading) && (
                <View style={[styles.suggestionBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {suggestionsLoading && suggestions.length === 0 ? (
                    <View style={styles.suggestionRow}>
                      <ActivityIndicator size="small" color={colors.primary} />
                      <Text style={[styles.suggestionMeta, { color: colors.mutedForeground, marginLeft: 8 }]}>Searching…</Text>
                    </View>
                  ) : (
                    suggestions.map((s) => (
                      <TouchableOpacity
                        key={s.id}
                        style={[styles.suggestionRow, { borderBottomColor: colors.border }]}
                        onPress={() => pickSuggestion(s)}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.suggestionAvatar, { backgroundColor: colors.primary }]}>
                          {s.avatar ? (
                            <Image source={{ uri: s.avatar }} style={styles.suggestionAvatarImg} />
                          ) : (
                            <Text style={styles.suggestionAvatarText}>{s.name[0]?.toUpperCase()}</Text>
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.suggestionName, { color: colors.foreground }]}>{s.name}</Text>
                          <Text style={[styles.suggestionMeta, { color: colors.mutedForeground }]}>{s.email}</Text>
                        </View>
                        <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              )}
              <TouchableOpacity
                style={[styles.sendBtn, { backgroundColor: adding ? colors.muted : colors.primary }]}
                onPress={sendRequest}
                disabled={adding}
              >
                <Text style={styles.sendText}>{adding ? "Sending…" : "Send Request"}</Text>
              </TouchableOpacity>
            </View>
          )}
          {friendsLoading ? (
            <View style={styles.center}><GolfBallLoader /></View>
          ) : (
            <FlatList
              data={friendItems}
              keyExtractor={(item) => `${item._type}-${(item as any).friendship_id ?? item.id}`}
              showsVerticalScrollIndicator={false}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
              contentContainerStyle={{ padding: 16, paddingBottom: Platform.OS === "web" ? 140 : 74 }}
              renderItem={({ item, index }) => {
                const prevItem = index > 0 ? friendItems[index - 1] : null;
                const showSectionHeader = index === 0 || item._type !== (prevItem as any)?._type;
                const sectionTitle =
                  item._type === "incoming" ? `Requests for you (${pending.length})` :
                  item._type === "outgoing" ? `Awaiting response (${requested.length})` :
                  item._type === "invited" ? `Invited (${invited.length})` :
                  `Friends (${friends.length})`;
                return (
                  <>
                    {showSectionHeader && (
                      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{sectionTitle}</Text>
                    )}
                    {item._type === "friend" && confirmRemoveId === item.id ? (
                      <View style={[styles.confirmRow, { backgroundColor: colors.card, borderColor: colors.destructive }]}>
                        <Text style={[styles.confirmText, { color: colors.foreground }]}>Remove {item.name}?</Text>
                        <View style={{ flexDirection: "row", gap: 8 }}>
                          <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: colors.muted }]} onPress={() => setConfirmRemoveId(null)}>
                            <Text style={[styles.confirmBtnText, { color: colors.foreground }]}>Cancel</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: colors.destructive }]} onPress={() => removeFriend(item.id)}>
                            <Text style={[styles.confirmBtnText, { color: "#fff" }]}>Remove</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : item._type === "invited" ? (
                      <View style={[styles.invitedRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <View style={[styles.invitedAvatar, { backgroundColor: colors.muted }]}>
                          <Ionicons name="mail-outline" size={18} color={colors.mutedForeground} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.invitedEmail, { color: colors.foreground }]} numberOfLines={1}>{(item as any).email}</Text>
                          <Text style={[styles.invitedSub, { color: colors.mutedForeground }]}>Invitation sent · awaiting sign-up</Text>
                        </View>
                        <TouchableOpacity
                          style={[styles.invitedCancelBtn, { borderColor: colors.border }]}
                          onPress={() => cancelInvitation(item.id)}
                        >
                          <Text style={[styles.invitedCancelText, { color: colors.mutedForeground }]}>Cancel</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <FriendCard
                        friend={item}
                        onAction={
                          item._type === "incoming" ? () => acceptRequest(item.friendship_id ?? item.id) :
                          item._type === "friend" ? () => setConfirmRemoveId(item.id) :
                          undefined
                        }
                        actionLabel={item._type === "incoming" ? "Accept" : item._type === "outgoing" ? "Pending" : "Remove"}
                        onChat={item._type === "friend" ? () => {
                          Haptics.selectionAsync();
                          apiFetch("/conversations", user!.token, {
                            method: "POST",
                            body: JSON.stringify({ member_ids: [item.id], is_group: false }),
                          }).then(d => router.push({
                            pathname: "/chat/[id]",
                            params: { id: d.conversation_id, name: item.name },
                          })).catch(() => {});
                        } : undefined}
                      />
                    )}
                  </>
                );
              }}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Ionicons name="people-outline" size={48} color={colors.mutedForeground} />
                  <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No friends yet</Text>
                  <Text style={[styles.emptySubText, { color: colors.mutedForeground }]}>Add golfers to play with them</Text>
                </View>
              }
            />
          )}
        </>
      )}

      {/* Messages tab */}
      {tab === "messages" && (
        <>
          {convoLoading ? (
            <View style={styles.center}><GolfBallLoader /></View>
          ) : (
            <FlatList
              data={conversations}
              keyExtractor={item => item.id.toString()}
              showsVerticalScrollIndicator={false}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
              contentContainerStyle={{ padding: 16, paddingBottom: Platform.OS === "web" ? 140 : 74 }}
              renderItem={({ item }) => {
                const initials = item.display_name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
                return (
                  <TouchableOpacity
                    style={[styles.convoRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      router.push({ pathname: "/chat/[id]", params: { id: item.id, name: item.display_name } });
                    }}
                    activeOpacity={0.8}
                  >
                    {item.is_group ? (
                      <View style={[styles.convoAvatar, { backgroundColor: colors.accent + "22" }]}>
                        {item.group_avatars?.length >= 2 ? (
                          <>
                            <Image source={{ uri: item.group_avatars[0] }} style={styles.groupAvatarTop} />
                            <Image source={{ uri: item.group_avatars[1] }} style={[styles.groupAvatarBot, { borderColor: colors.background }]} />
                          </>
                        ) : item.group_avatars?.length === 1 ? (
                          <>
                            <Image source={{ uri: item.group_avatars[0] }} style={styles.groupAvatarTop} />
                            <View style={[styles.groupAvatarBot, { backgroundColor: colors.accent + "55", borderColor: colors.background, alignItems: "center", justifyContent: "center" }]}>
                              <Ionicons name="people" size={11} color={colors.accent} />
                            </View>
                          </>
                        ) : (
                          <Ionicons name="people" size={20} color={colors.accent} />
                        )}
                      </View>
                    ) : (
                      <View style={[styles.convoAvatar, { backgroundColor: colors.primary + "25", overflow: "hidden" }]}>
                        {item.other_avatar
                          ? <Image source={{ uri: item.other_avatar }} style={styles.convoAvatarImg} />
                          : <Text style={[styles.convoInitials, { color: colors.primary }]}>{initials}</Text>
                        }
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <View style={styles.convoNameRow}>
                        <Text style={[styles.convoName, { color: colors.foreground }]} numberOfLines={1}>{item.display_name}</Text>
                        <Text style={[styles.convoTime, { color: colors.mutedForeground }]}>{formatConvoTime(item.last_message_at)}</Text>
                      </View>
                      <Text style={[styles.convoPreview, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {item.last_message
                          ? (item.is_group && item.last_sender_name ? `${item.last_sender_name}: ` : "") + item.last_message
                          : "No messages yet"
                        }
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Ionicons name="chatbubbles-outline" size={48} color={colors.mutedForeground} />
                  <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No messages yet</Text>
                  <Text style={[styles.emptySubText, { color: colors.mutedForeground }]}>
                    Tap the compose icon to start a chat
                  </Text>
                </View>
              }
            />
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingBottom: 12 },
  title: { fontSize: 26, fontFamily: "Inter_700Bold" },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  tabBar: { flexDirection: "row", borderBottomWidth: 1, marginBottom: 0 },
  tabItem: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  badge: { width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  badgeText: { color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold" },
  addBox: { margin: 16, marginTop: 12, borderRadius: 14, borderWidth: 1, padding: 16, gap: 10 },
  addInput: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 14, height: 46, fontSize: 15, fontFamily: "Inter_400Regular" },
  sendBtn: { height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  sendText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  invitedRow: { flexDirection: "row", alignItems: "center", borderRadius: 14, borderWidth: 1, padding: 12, marginBottom: 10, gap: 12 },
  invitedAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  invitedEmail: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  invitedSub: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  invitedCancelBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  invitedCancelText: { fontFamily: "Inter_400Regular", fontSize: 12 },
  suggestionBox: { borderWidth: 1, borderRadius: 10, overflow: "hidden" },
  suggestionRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, gap: 10, borderBottomWidth: 1 },
  suggestionAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  suggestionAvatarImg: { width: 36, height: 36, borderRadius: 18 },
  suggestionAvatarText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 15 },
  suggestionName: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  suggestionMeta: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyState: { paddingTop: 60, alignItems: "center", gap: 10 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptySubText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  btn: { borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  btnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 15 },
  sectionLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 4 },
  toast: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginTop: 8, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  toastText: { color: "#fff", fontFamily: "Inter_500Medium", fontSize: 13, flex: 1 },
  confirmRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 14, borderWidth: 1.5, padding: 12, marginBottom: 10 },
  confirmText: { fontSize: 14, fontFamily: "Inter_500Medium", flex: 1 },
  confirmBtn: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  confirmBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  // Conversation list
  convoRow: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 8 },
  convoAvatar: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  convoAvatarImg: { width: 46, height: 46, borderRadius: 23 },
  groupAvatarTop: { position: "absolute", top: 2, left: 2, width: 26, height: 26, borderRadius: 13 },
  groupAvatarBot: { position: "absolute", bottom: 2, right: 2, width: 26, height: 26, borderRadius: 13, borderWidth: 2, overflow: "hidden" },
  convoInitials: { fontSize: 16, fontFamily: "Inter_700Bold" },
  convoNameRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 3 },
  convoName: { fontSize: 15, fontFamily: "Inter_600SemiBold", flex: 1, marginRight: 8 },
  convoTime: { fontSize: 11, fontFamily: "Inter_400Regular", flexShrink: 0 },
  convoPreview: { fontSize: 13, fontFamily: "Inter_400Regular" },
});
