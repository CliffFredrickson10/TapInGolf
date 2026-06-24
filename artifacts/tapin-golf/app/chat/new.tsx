import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/lib/api";
import { AppHeader } from "@/components/AppHeader";

type Friend = { id: number; name: string; email: string; avatar?: string | null };
type Mode = "dm" | "group";

export default function NewChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const chatDisabled = !!user?.chat_disabled;
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<Mode>("dm");

  // Group mode state
  const [selected, setSelected] = useState<number[]>([]);
  const [groupName, setGroupName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (chatDisabled) {
      setLoading(false);
      Alert.alert(
        "Chat access suspended",
        "Your chat access has been suspended for violating our Community Guidelines. You can't start new conversations.",
        [{ text: "OK", onPress: () => router.back() }],
      );
      return;
    }
    apiFetch("/friends", user.token)
      .then(d => setFriends(d.friends ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user, chatDisabled]);

  const filtered = friends.filter(f =>
    f.name.toLowerCase().includes(search.toLowerCase()) ||
    f.email.toLowerCase().includes(search.toLowerCase())
  );

  // Direct message — tap once to open
  const startDM = async (friend: Friend) => {
    if (!user || creating || chatDisabled) return;
    setCreating(true);
    Haptics.selectionAsync();
    try {
      const data = await apiFetch("/conversations", user.token, {
        method: "POST",
        body: JSON.stringify({ member_ids: [friend.id], is_group: false }),
      });
      router.replace({
        pathname: "/chat/[id]",
        params: { id: data.conversation_id, name: friend.name },
      });
    } catch {
      setCreating(false);
    }
  };

  // Group creation
  const toggleSelect = (id: number) => {
    Haptics.selectionAsync();
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const createGroup = async () => {
    if (selected.length < 1 || !user || creating || chatDisabled) return;
    setCreating(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const data = await apiFetch("/conversations", user.token, {
        method: "POST",
        body: JSON.stringify({
          member_ids: selected,
          is_group: true,
          name: groupName.trim() || "Group Chat",
        }),
      });
      router.replace({
        pathname: "/chat/[id]",
        params: { id: data.conversation_id, name: groupName.trim() || "Group Chat" },
      });
    } catch {
      setCreating(false);
    }
  };

  const enterGroupMode = () => {
    Haptics.selectionAsync();
    setMode("group");
    setSelected([]);
    setGroupName("");
    setSearch("");
  };

  const exitGroupMode = () => {
    setMode("dm");
    setSelected([]);
    setGroupName("");
    setSearch("");
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader />
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: 12, borderBottomColor: colors.border }]}>
        {mode === "dm" ? (
          <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
            <Ionicons name="close" size={24} color={colors.foreground} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={exitGroupMode} style={styles.headerBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.foreground} />
          </TouchableOpacity>
        )}

        <Text style={[styles.title, { color: colors.foreground }]}>
          {mode === "dm" ? "New Message" : "New Group"}
        </Text>

        {mode === "group" ? (
          <TouchableOpacity
            style={[
              styles.createBtn,
              { backgroundColor: selected.length > 0 && !creating ? colors.primary : colors.muted },
            ]}
            onPress={createGroup}
            disabled={selected.length === 0 || creating}
          >
            {creating
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.createBtnText}>Create</Text>
            }
          </TouchableOpacity>
        ) : (
          <View style={{ width: 64 }} />
        )}
      </View>

      {/* ── Group name input (group mode only) ── */}
      {mode === "group" && (
        <View style={[styles.groupNameWrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Ionicons name="people-outline" size={18} color={colors.mutedForeground} />
          <TextInput
            style={[styles.groupNameInput, { color: colors.foreground }]}
            value={groupName}
            onChangeText={setGroupName}
            placeholder="Group name (optional)"
            placeholderTextColor={colors.mutedForeground}
            maxLength={40}
          />
        </View>
      )}

      {/* ── Selected chips (group mode) ── */}
      {mode === "group" && selected.length > 0 && (
        <View style={styles.chips}>
          {selected.map(id => {
            const f = friends.find(fr => fr.id === id);
            if (!f) return null;
            return (
              <TouchableOpacity
                key={id}
                style={[styles.chip, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "50" }]}
                onPress={() => toggleSelect(id)}
              >
                <Text style={[styles.chipText, { color: colors.primary }]}>{f.name.split(" ")[0]}</Text>
                <Ionicons name="close-circle" size={14} color={colors.primary} />
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* ── Search ── */}
      <View style={[styles.searchWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Ionicons name="search-outline" size={16} color={colors.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: colors.foreground }]}
          value={search}
          onChangeText={setSearch}
          placeholder="Search friends…"
          placeholderTextColor={colors.mutedForeground}
        />
      </View>

      {/* ── Friends list ── */}
      <FlatList
        data={filtered}
        keyExtractor={item => item.id.toString()}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: Platform.OS === "web" ? 140 : 74, gap: 6 }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          mode === "dm" ? (
            /* Group button — shown above the friends list in DM mode */
            <TouchableOpacity
              style={[styles.groupBtn, { backgroundColor: colors.accent + "18", borderColor: colors.accent + "50" }]}
              onPress={enterGroupMode}
              activeOpacity={0.8}
            >
              <View style={[styles.groupBtnIcon, { backgroundColor: colors.accent }]}>
                <Ionicons name="people" size={18} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.groupBtnLabel, { color: colors.foreground }]}>Group</Text>
                <Text style={[styles.groupBtnSub, { color: colors.mutedForeground }]}>Chat with multiple friends</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          ) : null
        }
        renderItem={({ item }) => {
          const initials = item.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();
          const checked = mode === "group" && selected.includes(item.id);

          return (
            <TouchableOpacity
              style={[
                styles.friendRow,
                {
                  backgroundColor: checked ? colors.primary + "12" : colors.card,
                  borderColor: checked ? colors.primary : colors.border,
                },
              ]}
              onPress={() => mode === "group" ? toggleSelect(item.id) : startDM(item)}
              activeOpacity={0.8}
            >
              <View style={[
                styles.avatar,
                { backgroundColor: checked ? colors.primary : colors.primary + "22", overflow: "hidden" },
              ]}>
                {item.avatar
                  ? <Image source={{ uri: item.avatar }} style={{ width: 40, height: 40, borderRadius: 20 }} />
                  : <Text style={[styles.avatarText, { color: checked ? "#fff" : colors.primary }]}>{initials}</Text>
                }
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.friendName, { color: colors.foreground }]}>{item.name}</Text>
                <Text style={[styles.friendEmail, { color: colors.mutedForeground }]}>{item.email}</Text>
              </View>
              {mode === "group" && (
                <View style={[
                  styles.checkbox,
                  {
                    backgroundColor: checked ? colors.primary : "transparent",
                    borderColor: checked ? colors.primary : colors.border,
                  },
                ]}>
                  {checked && <Ionicons name="checkmark" size={14} color="#fff" />}
                </View>
              )}
              {mode === "dm" && (
                <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
              )}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          loading ? (
            <View style={styles.empty}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {search ? "No friends match your search" : "No friends yet — add some first"}
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  headerBtn: { padding: 4 },
  title: { flex: 1, fontSize: 17, fontFamily: "Inter_700Bold" },
  createBtn: { borderRadius: 10, paddingHorizontal: 18, paddingVertical: 8, minWidth: 64, alignItems: "center" },
  createBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 },

  groupNameWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginTop: 12,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
  },
  groupNameInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 12,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 44,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },

  groupBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 14,
    marginBottom: 6,
  },
  groupBtnIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  groupBtnLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  groupBtnSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },

  friendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 12,
  },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  friendName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  friendEmail: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },

  empty: { paddingTop: 60, alignItems: "center", gap: 12 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
});
