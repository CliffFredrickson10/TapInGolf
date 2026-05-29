import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
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
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/lib/api";

type Member = { id: number; name: string; email: string; avatar?: string | null };
type Friend = { id: number; name: string; email: string; avatar?: string | null };

export default function GroupSettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [toast, setToast]     = useState<{ msg: string; error?: boolean } | null>(null);

  const [groupName, setGroupName]       = useState("");
  const [groupPicture, setGroupPicture] = useState<string | null>(null);
  const [createdBy, setCreatedBy]       = useState<number | null>(null);
  const [members, setMembers]           = useState<Member[]>([]);

  const [showAddModal, setShowAddModal]   = useState(false);
  const [friends, setFriends]             = useState<Friend[]>([]);
  const [friendSearch, setFriendSearch]   = useState("");
  const [addingId, setAddingId]           = useState<number | null>(null);
  const [removingId, setRemovingId]       = useState<number | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<number | null>(null);

  const isAdmin = !!user && createdBy === user.id;

  const showToast = (msg: string, error = false) => {
    setToast({ msg, error });
    setTimeout(() => setToast(null), 3000);
  };

  const load = async () => {
    if (!user || !id) return;
    try {
      const data = await apiFetch(`/conversations/${id}`, user.token);
      if (data.conversation) {
        setGroupName(data.conversation.name ?? "Group Chat");
        setGroupPicture(data.conversation.group_picture ?? null);
        setCreatedBy(data.conversation.created_by ?? null);
        setMembers(data.members ?? []);
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [user, id]);

  const loadFriends = async () => {
    if (!user) return;
    try {
      const data = await apiFetch("/friends", user.token);
      setFriends(data.friends ?? []);
    } catch {}
  };

  const pickImage = async () => {
    if (!isAdmin) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const base64 = asset.base64
        ? `data:image/jpeg;base64,${asset.base64}`
        : asset.uri;
      setGroupPicture(base64);
    }
  };

  const save = async () => {
    if (!user || !isAdmin) return;
    setSaving(true);
    try {
      await apiFetch(`/conversations/${id}`, user.token, {
        method: "PUT",
        body: JSON.stringify({
          name: groupName.trim() || "Group Chat",
          group_picture: groupPicture,
        }),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast("Group updated");
    } catch (e: any) {
      showToast(e.message ?? "Could not save changes", true);
    }
    setSaving(false);
  };

  const removeMember = async (memberId: number) => {
    if (!user || !isAdmin) return;
    setRemovingId(memberId);
    try {
      await apiFetch(`/conversations/${id}/members/${memberId}`, user.token, { method: "DELETE" });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setMembers(prev => prev.filter(m => m.id !== memberId));
      setConfirmRemoveId(null);
      showToast("Member removed");
    } catch (e: any) {
      showToast(e.message ?? "Could not remove member", true);
    }
    setRemovingId(null);
  };

  const addMember = async (friendId: number) => {
    if (!user || !isAdmin) return;
    setAddingId(friendId);
    try {
      await apiFetch(`/conversations/${id}/members`, user.token, {
        method: "POST",
        body: JSON.stringify({ user_id: friendId }),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await load();
      showToast("Member added");
    } catch (e: any) {
      showToast(e.message ?? "Could not add member", true);
    }
    setAddingId(null);
  };

  const openAddModal = async () => {
    await loadFriends();
    setFriendSearch("");
    setShowAddModal(true);
  };

  const groupInitials = groupName
    .split(" ")
    .map(w => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const memberIds = new Set(members.map(m => m.id));
  const availableFriends = friends.filter(
    f => !memberIds.has(f.id) &&
      (f.name.toLowerCase().includes(friendSearch.toLowerCase()) ||
       f.email.toLowerCase().includes(friendSearch.toLowerCase()))
  );

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12, backgroundColor: colors.primary }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backCircleWrap}>
          <View style={styles.backCircle}>
            <Ionicons name="arrow-back" size={20} color={colors.primary} />
          </View>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Group Info</Text>
        {isAdmin ? (
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: saving ? "#ffffff44" : "#fff" }]}
            onPress={save}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <Text style={[styles.saveBtnText, { color: colors.primary }]}>Save</Text>
            }
          </TouchableOpacity>
        ) : (
          <View style={{ width: 60 }} />
        )}
      </View>

      {/* Toast */}
      {toast && (
        <View style={[styles.toast, { backgroundColor: toast.error ? colors.destructive : colors.primary }]}>
          <Ionicons name={toast.error ? "alert-circle" : "checkmark-circle"} size={16} color="#fff" />
          <Text style={styles.toastText}>{toast.msg}</Text>
        </View>
      )}

      <ScrollView
        contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 140 : 80 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Group picture */}
        <View style={styles.pictureSection}>
          <TouchableOpacity
            onPress={isAdmin ? pickImage : undefined}
            activeOpacity={isAdmin ? 0.8 : 1}
            style={[styles.pictureTouchable, { borderColor: colors.border }]}
          >
            {groupPicture ? (
              <Image source={{ uri: groupPicture }} style={styles.groupPicture} />
            ) : (
              <View style={[styles.groupPicturePlaceholder, { backgroundColor: colors.primary + "22" }]}>
                <Text style={[styles.groupInitials, { color: colors.primary }]}>{groupInitials}</Text>
              </View>
            )}
            {isAdmin && (
              <View style={[styles.cameraOverlay, { backgroundColor: colors.primary }]}>
                <Ionicons name="camera" size={14} color="#fff" />
              </View>
            )}
          </TouchableOpacity>

          {/* Group name */}
          <View style={[
            styles.nameWrap,
            { borderColor: isAdmin ? colors.border : "transparent", backgroundColor: isAdmin ? colors.card : "transparent" },
          ]}>
            {isAdmin ? (
              <TextInput
                style={[styles.nameInput, { color: colors.foreground }]}
                value={groupName}
                onChangeText={setGroupName}
                placeholder="Group name"
                placeholderTextColor={colors.mutedForeground}
                maxLength={50}
                textAlign="center"
              />
            ) : (
              <Text style={[styles.nameReadOnly, { color: colors.foreground }]}>{groupName}</Text>
            )}
          </View>

          <Text style={[styles.memberCount, { color: colors.mutedForeground }]}>
            {members.length} member{members.length !== 1 ? "s" : ""}
            {isAdmin ? " · You are the admin" : ""}
          </Text>
        </View>

        {/* Members section */}
        <View style={[styles.sectionHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>MEMBERS</Text>
          {isAdmin && (
            <TouchableOpacity
              style={[styles.addMemberBtn, { backgroundColor: colors.primary }]}
              onPress={openAddModal}
            >
              <Ionicons name="person-add-outline" size={14} color="#fff" />
              <Text style={styles.addMemberText}>Add</Text>
            </TouchableOpacity>
          )}
        </View>

        {members.map(member => {
          const isMe = member.id === user?.id;
          const isGroupAdmin = member.id === createdBy;
          const initials = member.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

          return confirmRemoveId === member.id ? (
            <View
              key={member.id}
              style={[styles.memberRow, { backgroundColor: colors.card, borderColor: colors.destructive + "88", borderWidth: 1.5 }]}
            >
              <Text style={[styles.confirmText, { color: colors.foreground }]}>
                Remove {member.name.split(" ")[0]}?
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity
                  style={[styles.confirmBtn, { backgroundColor: colors.muted }]}
                  onPress={() => setConfirmRemoveId(null)}
                >
                  <Text style={[styles.confirmBtnText, { color: colors.foreground }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.confirmBtn, { backgroundColor: colors.destructive }]}
                  onPress={() => removeMember(member.id)}
                  disabled={removingId === member.id}
                >
                  {removingId === member.id
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={[styles.confirmBtnText, { color: "#fff" }]}>Remove</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View
              key={member.id}
              style={[styles.memberRow, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={[styles.memberAvatar, { backgroundColor: colors.primary + "22", overflow: "hidden" }]}>
                {member.avatar
                  ? <Image source={{ uri: member.avatar }} style={{ width: 44, height: 44, borderRadius: 22 }} />
                  : <Text style={[styles.memberInitials, { color: colors.primary }]}>{initials}</Text>
                }
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={[styles.memberName, { color: colors.foreground }]}>{member.name}</Text>
                  {isGroupAdmin && (
                    <View style={[styles.adminBadge, { backgroundColor: colors.accent + "22" }]}>
                      <Text style={[styles.adminBadgeText, { color: colors.accent }]}>Admin</Text>
                    </View>
                  )}
                  {isMe && (
                    <View style={[styles.adminBadge, { backgroundColor: colors.primary + "18" }]}>
                      <Text style={[styles.adminBadgeText, { color: colors.primary }]}>You</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.memberEmail, { color: colors.mutedForeground }]}>{member.email}</Text>
              </View>
              {isAdmin && !isMe && !isGroupAdmin && (
                <TouchableOpacity
                  onPress={() => { Haptics.selectionAsync(); setConfirmRemoveId(member.id); }}
                  style={styles.removeBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="remove-circle-outline" size={22} color={colors.destructive} />
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* Add member modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border, paddingTop: Platform.OS === "ios" ? 20 : 16 }]}>
            <TouchableOpacity onPress={() => setShowAddModal(false)}>
              <Ionicons name="close" size={24} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Add Members</Text>
            <View style={{ width: 28 }} />
          </View>

          <View style={[styles.modalSearch, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="search-outline" size={16} color={colors.mutedForeground} />
            <TextInput
              style={[styles.modalSearchInput, { color: colors.foreground }]}
              value={friendSearch}
              onChangeText={setFriendSearch}
              placeholder="Search friends…"
              placeholderTextColor={colors.mutedForeground}
              autoFocus
            />
          </View>

          <FlatList
            data={availableFriends}
            keyExtractor={item => item.id.toString()}
            contentContainerStyle={{ padding: 16, gap: 8 }}
            renderItem={({ item }) => {
              const initials = item.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
              const isAdding = addingId === item.id;
              return (
                <TouchableOpacity
                  style={[styles.friendRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => addMember(item.id)}
                  disabled={isAdding}
                  activeOpacity={0.8}
                >
                  <View style={[styles.memberAvatar, { backgroundColor: colors.primary + "22", overflow: "hidden" }]}>
                    {item.avatar
                      ? <Image source={{ uri: item.avatar }} style={{ width: 44, height: 44, borderRadius: 22 }} />
                      : <Text style={[styles.memberInitials, { color: colors.primary }]}>{initials}</Text>
                    }
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.memberName, { color: colors.foreground }]}>{item.name}</Text>
                    <Text style={[styles.memberEmail, { color: colors.mutedForeground }]}>{item.email}</Text>
                  </View>
                  {isAdding
                    ? <ActivityIndicator size="small" color={colors.primary} />
                    : <View style={[styles.addCircle, { backgroundColor: colors.primary }]}>
                        <Ionicons name="add" size={18} color="#fff" />
                      </View>
                  }
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyModal}>
                <Ionicons name="people-outline" size={40} color={colors.mutedForeground} />
                <Text style={[styles.emptyModalText, { color: colors.mutedForeground }]}>
                  {friendSearch ? "No friends match your search" : "All friends are already in this group"}
                </Text>
              </View>
            }
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  backCircleWrap: {},
  backCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { flex: 1, fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff" },
  saveBtn: { borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8, minWidth: 60, alignItems: "center" },
  saveBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },

  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  toastText: { color: "#fff", fontFamily: "Inter_500Medium", fontSize: 13, flex: 1 },

  pictureSection: { alignItems: "center", paddingVertical: 24, gap: 12 },
  pictureTouchable: { position: "relative" },
  groupPicture: { width: 96, height: 96, borderRadius: 48 },
  groupPicturePlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  groupInitials: { fontSize: 32, fontFamily: "Inter_700Bold" },
  cameraOverlay: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  nameWrap: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 200,
    alignItems: "center",
  },
  nameInput: { fontSize: 18, fontFamily: "Inter_600SemiBold", textAlign: "center", minWidth: 160 },
  nameReadOnly: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  memberCount: { fontSize: 13, fontFamily: "Inter_400Regular" },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  sectionTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8 },
  addMemberBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  addMemberText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },

  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  memberAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  memberInitials: { fontSize: 15, fontFamily: "Inter_700Bold" },
  memberName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  memberEmail: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  adminBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  adminBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  removeBtn: { padding: 4 },
  confirmText: { fontSize: 14, fontFamily: "Inter_500Medium", flex: 1 },
  confirmBtn: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  confirmBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  modalTitle: { flex: 1, fontSize: 17, fontFamily: "Inter_700Bold", textAlign: "center" },
  modalSearch: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginTop: 12,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 44,
  },
  modalSearchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  friendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 12,
  },
  addCircle: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  emptyModal: { paddingTop: 60, alignItems: "center", gap: 12 },
  emptyModalText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
});
