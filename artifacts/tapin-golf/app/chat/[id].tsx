import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import GifPicker from "@/components/GifPicker";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/lib/api";
import { AppHeader } from "@/components/AppHeader";

const GIF_PREFIX = "[GIF]:";

function isGif(content: string) {
  return content.startsWith(GIF_PREFIX);
}

function gifUrl(content: string) {
  return content.slice(GIF_PREFIX.length);
}

type Message = {
  id: number;
  sender_id: number;
  sender_name: string;
  sender_avatar?: string | null;
  content: string;
  created_at: string;
};

type Member = {
  id: number;
  name: string;
  email: string;
  avatar?: string | null;
};

export default function ChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const chatDisabled = !!user?.chat_disabled;
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [messages, setMessages]       = useState<Message[]>([]);
  const [members, setMembers]         = useState<Member[]>([]);
  const [isGroup, setIsGroup]         = useState(false);
  const [displayName, setDisplayName] = useState(name ?? "Chat");
  const [createdBy, setCreatedBy]     = useState<number | null>(null);
  const [groupPicture, setGroupPicture] = useState<string | null>(null);
  const [muted, setMuted]             = useState(false);
  const [text, setText]               = useState("");
  const [sending, setSending]         = useState(false);
  const [gifOpen, setGifOpen]         = useState(false);
  const [menuOpen, setMenuOpen]       = useState(false);
  const [reportOpen, setReportOpen]   = useState(false);
  const [reportReason, setReportReason] = useState<string | null>(null);
  const [reportNote, setReportNote]   = useState("");
  const [submitting, setSubmitting]   = useState(false);
  const flatRef     = useRef<FlatList>(null);
  const pollRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const latestIdRef = useRef(0);

  const loadMessages = useCallback(async (initial = false) => {
    if (!user || !id) return;
    try {
      if (initial || latestIdRef.current === 0) {
        // First load: fetch the last 60 messages in full
        const data = await apiFetch(`/conversations/${id}/messages?limit=60`, user.token);
        const msgs: Message[] = data.messages ?? [];
        if (msgs.length > 0) {
          latestIdRef.current = msgs[msgs.length - 1].id;
          setMessages(msgs);
        }
      } else {
        // Poll: only fetch messages newer than the last known id — very cheap
        const data = await apiFetch(
          `/conversations/${id}/messages?after=${latestIdRef.current}&limit=50`,
          user.token
        );
        const newMsgs: Message[] = data.messages ?? [];
        if (newMsgs.length > 0) {
          latestIdRef.current = newMsgs[newMsgs.length - 1].id;
          setMessages(prev => [...prev, ...newMsgs]);
          setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
        }
      }
    } catch {}
  }, [user, id]);

  useEffect(() => {
    if (!user || !id) return;
    apiFetch(`/conversations/${id}`, user.token).then((data) => {
      if (data.conversation) {
        setDisplayName(data.conversation.display_name ?? name ?? "Chat");
        setIsGroup(data.conversation.is_group);
        setCreatedBy(data.conversation.created_by ?? null);
        setGroupPicture(data.conversation.group_picture ?? null);
        setMuted(!!data.conversation.is_muted);
        setMembers(data.members ?? []);
      }
    }).catch(() => {});
    loadMessages(true);
    pollRef.current = setInterval(() => loadMessages(false), 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [user, id, loadMessages]);

  const sendContent = async (content: string) => {
    if (!content || !user || sending) return;
    setSending(true);
    try {
      const msg = await apiFetch(`/conversations/${id}/messages`, user.token, {
        method: "POST",
        body: JSON.stringify({ content }),
      });
      setMessages(prev => [...prev, msg]);
      latestIdRef.current = msg.id;
      Haptics.selectionAsync();
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {}
    finally {
      setSending(false);
    }
  };

  const sendMessage = async () => {
    const content = text.trim();
    if (!content || sending) return;
    setText("");
    await sendContent(content);
    if (!content) setText(content); // restore on failure handled inside sendContent
  };

  const sendGif = async (url: string) => {
    await sendContent(`${GIF_PREFIX}${url}`);
  };

  const REPORT_REASONS: { value: string; label: string }[] = [
    { value: "harassment", label: "Harassment or bullying" },
    { value: "spam", label: "Spam" },
    { value: "hate_speech", label: "Hate speech" },
    { value: "inappropriate", label: "Inappropriate content" },
    { value: "threat", label: "Threats or violence" },
    { value: "impersonation", label: "Impersonation" },
    { value: "other", label: "Something else" },
  ];

  const confirmBlock = () => {
    setMenuOpen(false);
    const targetName = otherMember?.name ?? "this user";
    const doBlock = async () => {
      if (!user || !otherMember) return;
      try {
        await apiFetch(`/settings/block`, user.token, {
          method: "POST",
          body: JSON.stringify({ target_id: otherMember.id }),
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.back();
      } catch {
        Alert.alert("Couldn't block", "Please try again.");
      }
    };
    Alert.alert(
      `Block ${targetName}?`,
      "You won't be able to message each other. You can unblock them later in Settings.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Block", style: "destructive", onPress: doBlock },
      ]
    );
  };

  const toggleMute = async () => {
    setMenuOpen(false);
    if (!user || !id) return;
    const next = !muted;
    setMuted(next); // optimistic
    try {
      await apiFetch(`/conversations/${id}/mute`, user.token, {
        method: "PUT",
        body: JSON.stringify({ muted: next }),
      });
      Haptics.selectionAsync();
    } catch {
      setMuted(!next); // revert on failure
      Alert.alert("Couldn't update", "Please try again.");
    }
  };

  const submitReport = async () => {
    if (!user || !otherMember || !reportReason || submitting) return;
    setSubmitting(true);
    try {
      await apiFetch(`/reports`, user.token, {
        method: "POST",
        body: JSON.stringify({
          reported_user_id: otherMember.id,
          conversation_id: id ? Number(id) : undefined,
          reason: reportReason,
          note: reportNote.trim() || undefined,
        }),
      });
      setReportOpen(false);
      setReportReason(null);
      setReportNote("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Report submitted", "Thanks — our team will review this shortly.");
    } catch {
      Alert.alert("Couldn't submit report", "Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
  };

  const formatDay = (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return "Today";
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "short" });
  };

  const otherMember = !isGroup ? members.find(m => m.id !== user?.id) : null;
  const groupMemberPhotos = isGroup
    ? members.filter(m => m.id !== user?.id && m.avatar).slice(0, 2).map(m => m.avatar!)
    : [];

  const renderItem = ({ item, index }: { item: Message; index: number }) => {
    const isMine    = item.sender_id === user?.id;
    const prevMsg   = index > 0 ? messages[index - 1] : null;
    const showDay   = !prevMsg || formatDay(item.created_at) !== formatDay(prevMsg.created_at);
    const showAvatar = isGroup && !isMine && (
      index === messages.length - 1 ||
      messages[index + 1]?.sender_id !== item.sender_id ||
      formatDay(messages[index + 1]?.created_at) !== formatDay(item.created_at)
    );
    const showName = isGroup && !isMine && (!prevMsg || prevMsg.sender_id !== item.sender_id || showDay);
    const initials = item.sender_name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
    const gif = isGif(item.content);

    return (
      <>
        {showDay && (
          <View style={styles.dayDivider}>
            <View style={[styles.dayLine, { backgroundColor: colors.border }]} />
            <Text style={[styles.dayText, { color: colors.mutedForeground, backgroundColor: colors.background }]}>
              {formatDay(item.created_at)}
            </Text>
            <View style={[styles.dayLine, { backgroundColor: colors.border }]} />
          </View>
        )}
        <View style={[styles.msgRow, isMine && styles.msgRowMine]}>
          {!isMine && isGroup && (
            <View style={styles.avatarSlot}>
              {showAvatar ? (
                item.sender_avatar ? (
                  <Image source={{ uri: item.sender_avatar }} style={styles.avatar} contentFit="cover" />
                ) : (
                  <View style={[styles.avatar, { backgroundColor: colors.primary + "30", alignItems: "center", justifyContent: "center" }]}>
                    <Text style={[styles.avatarText, { color: colors.primary }]}>{initials}</Text>
                  </View>
                )
              ) : null}
            </View>
          )}

          <View style={[styles.msgGroup, isMine && styles.msgGroupMine]}>
            {showName && (
              <Text style={[styles.senderName, { color: colors.mutedForeground }]}>{item.sender_name}</Text>
            )}

            {gif ? (
              <View style={[styles.gifBubble, isMine && styles.gifBubbleMine]}>
                <Image
                  source={{ uri: gifUrl(item.content) }}
                  style={styles.gifImage}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  accessibilityLabel="GIF"
                />
              </View>
            ) : (
              <View style={[
                styles.bubble,
                isMine
                  ? [styles.bubbleMine, { backgroundColor: colors.primary }]
                  : [styles.bubbleOther, { backgroundColor: colors.card, borderColor: colors.border }],
              ]}>
                <Text style={[styles.bubbleText, { color: isMine ? "#fff" : colors.foreground }]}>
                  {item.content}
                </Text>
              </View>
            )}

            <Text style={[styles.time, { color: colors.mutedForeground }, isMine && styles.timeMine]}>
              {formatTime(item.created_at)}
            </Text>
          </View>
        </View>
      </>
    );
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <AppHeader />
      {/* Header */}
      <View style={[styles.header, { paddingTop: 12, borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          {isGroup ? (
            <View style={[styles.headerAvatar, { backgroundColor: colors.accent + "22" }]}>
              {groupMemberPhotos.length >= 2 ? (
                <>
                  <Image source={{ uri: groupMemberPhotos[0] }} style={styles.headerGroupTop} contentFit="cover" />
                  <Image source={{ uri: groupMemberPhotos[1] }} style={[styles.headerGroupBot, { borderColor: colors.background }]} contentFit="cover" />
                </>
              ) : groupMemberPhotos.length === 1 ? (
                <>
                  <Image source={{ uri: groupMemberPhotos[0] }} style={styles.headerGroupTop} contentFit="cover" />
                  <View style={[styles.headerGroupBot, { backgroundColor: colors.accent + "55", borderColor: colors.background, alignItems: "center", justifyContent: "center" }]}>
                    <Ionicons name="people" size={9} color={colors.accent} />
                  </View>
                </>
              ) : (
                <Ionicons name="people" size={16} color={colors.accent} />
              )}
            </View>
          ) : otherMember?.avatar ? (
            <Image source={{ uri: otherMember.avatar }} style={[styles.headerAvatar, { borderRadius: 18 }]} contentFit="cover" />
          ) : (
            <View style={[styles.headerAvatar, { backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }]}>
              <Ionicons name="person" size={16} color="#fff" />
            </View>
          )}

          <View style={{ flex: 1 }}>
            <Text style={[styles.headerName, { color: colors.foreground }]} numberOfLines={1}>
              {displayName}
            </Text>
            {members.length > 0 && (
              <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
                {isGroup ? `${members.length} members` : otherMember?.email ?? ""}
              </Text>
            )}
          </View>
        </View>

        {/* Group settings button — only shown for groups */}
        {isGroup && (
          <TouchableOpacity
            style={styles.settingsBtn}
            onPress={() => router.push({
              pathname: "/chat/group-settings",
              params: { id, name: displayName },
            })}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="people-circle-outline" size={28} color={colors.primary} />
          </TouchableOpacity>
        )}

        {/* Options menu — mute for all chats; report/block for DMs */}
        <TouchableOpacity
          style={styles.settingsBtn}
          onPress={() => setMenuOpen(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Conversation options"
        >
          <Ionicons name="ellipsis-vertical" size={22} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatRef}
        data={messages}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderItem}
        contentContainerStyle={[styles.msgList, { paddingBottom: Platform.OS === "web" ? 16 : 8 }]}
        onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: false })}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="chatbubbles-outline" size={48} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              No messages yet. Say hello!
            </Text>
          </View>
        }
      />

      {/* Input bar — replaced with a suspension notice when chat is disabled */}
      {chatDisabled ? (
        <View style={[
          styles.disabledBar,
          {
            backgroundColor: colors.card,
            borderTopColor: colors.border,
            paddingBottom: Platform.OS === "web" ? 16 : insets.bottom + 8,
          },
        ]}>
          <Ionicons name="lock-closed-outline" size={16} color={colors.mutedForeground} />
          <Text style={[styles.disabledText, { color: colors.mutedForeground }]}>
            Your chat access has been suspended for violating our Community Guidelines.
          </Text>
        </View>
      ) : (
        <View style={[
          styles.inputBar,
          {
            backgroundColor: colors.background,
            borderTopColor: colors.border,
            paddingBottom: Platform.OS === "web" ? 16 : insets.bottom + 8,
          },
        ]}>
          {/* GIF button */}
          <TouchableOpacity
            onPress={() => setGifOpen(true)}
            style={[styles.gifBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            activeOpacity={0.7}
          >
            <Text style={[styles.gifBtnLabel, { color: colors.primary }]}>GIF</Text>
          </TouchableOpacity>

          <TextInput
            style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
            value={text}
            onChangeText={setText}
            placeholder="Message…"
            placeholderTextColor={colors.mutedForeground}
            multiline
            maxLength={500}
            returnKeyType="default"
          />
          <TouchableOpacity
            style={[styles.sendBtn, { backgroundColor: text.trim() ? colors.primary : colors.muted }]}
            onPress={sendMessage}
            disabled={!text.trim() || sending}
            activeOpacity={0.8}
          >
            <Ionicons name="send" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      <GifPicker
        visible={gifOpen}
        onClose={() => setGifOpen(false)}
        onSelect={sendGif}
      />

      {/* Moderation action sheet */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={() => setMenuOpen(false)}>
          <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TouchableOpacity style={styles.sheetItem} onPress={toggleMute}>
              <Ionicons name={muted ? "notifications-outline" : "notifications-off-outline"} size={20} color={colors.foreground} />
              <Text style={[styles.sheetItemText, { color: colors.foreground }]}>
                {muted ? "Unmute notifications" : "Mute notifications"}
              </Text>
            </TouchableOpacity>
            {!isGroup && otherMember && (
              <>
                <View style={[styles.sheetDivider, { backgroundColor: colors.border }]} />
                <TouchableOpacity
                  style={styles.sheetItem}
                  onPress={() => { setMenuOpen(false); setReportReason(null); setReportNote(""); setReportOpen(true); }}
                >
                  <Ionicons name="flag-outline" size={20} color={colors.foreground} />
                  <Text style={[styles.sheetItemText, { color: colors.foreground }]}>Report {otherMember?.name ?? "user"}</Text>
                </TouchableOpacity>
                <View style={[styles.sheetDivider, { backgroundColor: colors.border }]} />
                <TouchableOpacity style={styles.sheetItem} onPress={confirmBlock}>
                  <Ionicons name="ban-outline" size={20} color="#d14343" />
                  <Text style={[styles.sheetItemText, { color: "#d14343" }]}>Block {otherMember?.name ?? "user"}</Text>
                </TouchableOpacity>
              </>
            )}
            <View style={[styles.sheetDivider, { backgroundColor: colors.border }]} />
            <TouchableOpacity style={styles.sheetItem} onPress={() => setMenuOpen(false)}>
              <Ionicons name="close-outline" size={20} color={colors.mutedForeground} />
              <Text style={[styles.sheetItemText, { color: colors.mutedForeground }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Report modal */}
      <Modal visible={reportOpen} transparent animationType="slide" onRequestClose={() => setReportOpen(false)}>
        <View style={styles.sheetBackdrop}>
          <View style={[styles.reportCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <View style={styles.reportHeader}>
              <Text style={[styles.reportTitle, { color: colors.foreground }]}>Report {otherMember?.name ?? "user"}</Text>
              <TouchableOpacity onPress={() => setReportOpen(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={24} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.reportSub, { color: colors.mutedForeground }]}>
              Tell us what's wrong. Our team reviews every report.
            </Text>
            <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
              {REPORT_REASONS.map(r => {
                const active = reportReason === r.value;
                return (
                  <TouchableOpacity
                    key={r.value}
                    style={[
                      styles.reasonRow,
                      { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary + "12" : "transparent" },
                    ]}
                    onPress={() => setReportReason(r.value)}
                  >
                    <Text style={[styles.reasonText, { color: colors.foreground }]}>{r.label}</Text>
                    <Ionicons
                      name={active ? "radio-button-on" : "radio-button-off"}
                      size={20}
                      color={active ? colors.primary : colors.mutedForeground}
                    />
                  </TouchableOpacity>
                );
              })}
              <TextInput
                style={[styles.reportNote, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                value={reportNote}
                onChangeText={setReportNote}
                placeholder="Add details (optional)"
                placeholderTextColor={colors.mutedForeground}
                multiline
                maxLength={1000}
              />
            </ScrollView>
            <TouchableOpacity
              style={[styles.reportSubmit, { backgroundColor: reportReason ? colors.primary : colors.muted }]}
              onPress={submitReport}
              disabled={!reportReason || submitting}
              activeOpacity={0.85}
            >
              <Text style={styles.reportSubmitText}>{submitting ? "Submitting…" : "Submit report"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  backBtn: { padding: 4 },
  settingsBtn: { padding: 4, marginLeft: 4 },
  headerCenter: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  headerAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  headerGroupTop: { position: "absolute", top: 1, left: 1, width: 20, height: 20, borderRadius: 10 },
  headerGroupBot: { position: "absolute", bottom: 1, right: 1, width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, overflow: "hidden" },
  headerName: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  headerSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  msgList: { padding: 16, gap: 2 },
  dayDivider: { flexDirection: "row", alignItems: "center", marginVertical: 12, gap: 8 },
  dayLine: { flex: 1, height: 1 },
  dayText: { fontSize: 11, fontFamily: "Inter_500Medium", paddingHorizontal: 8 },
  msgRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginVertical: 2 },
  msgRowMine: { justifyContent: "flex-end" },
  avatarSlot: { width: 28, flexShrink: 0 },
  avatar: { width: 28, height: 28, borderRadius: 14 },
  avatarText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  msgGroup: { maxWidth: "75%", gap: 2 },
  msgGroupMine: { alignItems: "flex-end" },
  senderName: { fontSize: 11, fontFamily: "Inter_500Medium", marginLeft: 4 },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9 },
  bubbleMine: { borderBottomRightRadius: 4 },
  bubbleOther: { borderWidth: 1, borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 21 },
  gifBubble: {
    borderRadius: 14,
    overflow: "hidden",
    borderBottomRightRadius: 14,
    borderBottomLeftRadius: 14,
  },
  gifBubbleMine: {
    borderBottomRightRadius: 4,
  },
  gifImage: {
    width: 200,
    height: 160,
  },
  time: { fontSize: 10, fontFamily: "Inter_400Regular", marginLeft: 4 },
  timeMine: { marginRight: 4 },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    gap: 8,
  },
  disabledBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 12,
    borderTopWidth: 1,
    gap: 8,
  },
  disabledText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  gifBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  gifBtnLabel: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  input: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    maxHeight: 120,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
    padding: 16,
  },
  sheet: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 8,
  },
  sheetItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  sheetItemText: { fontSize: 16, fontFamily: "Inter_500Medium" },
  sheetDivider: { height: 1 },
  reportCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    marginBottom: 8,
  },
  reportHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  reportTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  reportSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 4, marginBottom: 12 },
  reasonRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 8,
  },
  reasonText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  reportNote: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    minHeight: 72,
    textAlignVertical: "top",
    marginTop: 4,
    marginBottom: 4,
  },
  reportSubmit: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 12,
  },
  reportSubmitText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
