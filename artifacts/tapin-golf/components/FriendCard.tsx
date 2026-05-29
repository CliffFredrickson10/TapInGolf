import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import CachedImage from "@/components/CachedImage";
import { useColors } from "@/hooks/useColors";

export interface Friend {
  id: number;
  friendship_id?: number;
  name: string;
  email: string;
  handicap?: number;
  avatar?: string | null;
  status: "accepted" | "pending" | "requested";
}

interface Props {
  friend: Friend;
  onAction?: () => void;
  actionLabel?: string;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  onChat?: () => void;
}

export default function FriendCard({ friend, onAction, actionLabel, selectable, selected, onSelect, onChat }: Props) {
  const colors = useColors();
  const initials = friend.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <TouchableOpacity
        style={[styles.avatar, { backgroundColor: selected ? colors.primary : colors.primaryLight, overflow: "hidden" }]}
        onPress={selectable ? onSelect : undefined}
        activeOpacity={selectable ? 0.75 : 1}
      >
        {selected ? (
          <Ionicons name="checkmark" size={20} color="#fff" />
        ) : friend.avatar ? (
          <CachedImage uri={friend.avatar} style={styles.avatarImg} />
        ) : (
          <Text style={[styles.initials, { color: colors.primary }]}>{initials}</Text>
        )}
      </TouchableOpacity>
      <View style={styles.info}>
        <Text style={[styles.name, { color: colors.foreground }]}>{friend.name}</Text>
        <Text style={[styles.email, { color: colors.mutedForeground }]}>{friend.email}</Text>
        {friend.handicap != null && (
          <Text style={[styles.handicap, { color: colors.mutedForeground }]}>HCP {friend.handicap}</Text>
        )}
      </View>
      <View style={styles.actions}>
        {onChat && (
          <TouchableOpacity
            onPress={onChat}
            style={[styles.chatBtn, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "40" }]}
            activeOpacity={0.8}
          >
            <Ionicons name="chatbubble-outline" size={15} color={colors.primary} />
          </TouchableOpacity>
        )}
        {onAction && (
          <TouchableOpacity
            onPress={onAction}
            style={[
              styles.actionBtn,
              { backgroundColor: friend.status === "accepted" ? colors.destructive + "15" : colors.primary },
            ]}
            activeOpacity={0.8}
          >
            <Text style={[styles.actionText, { color: friend.status === "accepted" ? colors.destructive : "#fff" }]}>
              {actionLabel ?? (friend.status === "accepted" ? "Remove" : "Accept")}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImg: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  initials: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  info: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  email: { fontSize: 12, fontFamily: "Inter_400Regular" },
  handicap: { fontSize: 12, fontFamily: "Inter_400Regular" },
  actions: { flexDirection: "row", alignItems: "center", gap: 8 },
  chatBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtn: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  actionText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
});
