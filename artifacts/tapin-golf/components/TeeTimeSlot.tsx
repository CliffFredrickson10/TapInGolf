import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";

export interface ExistingPlayer {
  name: string;
  players: number;
}

export interface TeeTime {
  id: number;
  time: string;
  price: number;
  promotional_price?: number | null;
  available_slots: number;
  total_slots: number;
  date: string;
  tee_start_type?: "first_tee" | "two_tee" | "tenth_tee";
  existing_players?: ExistingPlayer[];
  event_id?: number | null;
  event_name?: string | null;
}

interface Props {
  slot: TeeTime;
  selected?: boolean;
  onPress: () => void;
}

export default function TeeTimeSlot({ slot, selected, onPress }: Props) {
  const colors = useColors();
  const isFull = slot.available_slots === 0;
  const hasPlayers = (slot.existing_players?.length ?? 0) > 0;

  const isTournament = !!slot.event_id;

  const teeLabel =
    slot.tee_start_type === "tenth_tee"
      ? "10th Tee"
      : slot.tee_start_type === "first_tee"
      ? "1st Tee"
      : null;

  const teeLabelColor =
    slot.tee_start_type === "tenth_tee" ? "#b45309" : "#1a5c38";
  const teeLabelBg =
    slot.tee_start_type === "tenth_tee" ? "#fed7aa" : "#d1fae5";

  return (
    <TouchableOpacity
      onPress={!isFull ? onPress : undefined}
      activeOpacity={isFull ? 1 : 0.75}
      style={[
        styles.slot,
        {
          backgroundColor: selected
            ? colors.primary
            : isFull
            ? colors.muted
            : isTournament
            ? "#fffbeb"
            : colors.card,
          borderColor: selected
            ? colors.primary
            : isTournament
            ? "#c8a84b"
            : hasPlayers
            ? colors.accent
            : colors.border,
          opacity: isFull ? 0.5 : 1,
        },
      ]}
    >
      <Text
        style={[
          styles.time,
          { color: selected ? colors.primaryForeground : colors.foreground },
        ]}
      >
        {slot.time}
      </Text>

      {isTournament && (
        <View style={[styles.teeBadge, { backgroundColor: selected ? "rgba(255,255,255,0.2)" : "#fef3c7" }]}>
          <Text style={[styles.teeBadgeText, { color: selected ? "rgba(255,255,255,0.9)" : "#92400e" }]}>
            🏆 Tournament
          </Text>
        </View>
      )}

      {teeLabel && (
        <View
          style={[
            styles.teeBadge,
            {
              backgroundColor: selected ? "rgba(255,255,255,0.2)" : teeLabelBg,
            },
          ]}
        >
          <Text
            style={[
              styles.teeBadgeText,
              { color: selected ? "rgba(255,255,255,0.9)" : teeLabelColor },
            ]}
          >
            {teeLabel}
          </Text>
        </View>
      )}

      <Text
        style={[
          styles.slots,
          {
            color: selected
              ? "rgba(255,255,255,0.75)"
              : slot.available_slots <= 1
              ? colors.destructive
              : colors.mutedForeground,
          },
        ]}
      >
        {isFull ? "Full" : `${slot.available_slots} left`}
      </Text>

      {hasPlayers && !isFull && (
        <View style={styles.avatarRow}>
          {slot.existing_players!.slice(0, 3).map((p, i) => (
            <View
              key={i}
              style={[
                styles.avatar,
                {
                  backgroundColor: selected ? "rgba(255,255,255,0.3)" : colors.accent,
                  marginLeft: i > 0 ? -5 : 0,
                },
              ]}
            >
              <Text style={styles.avatarText}>
                {p.name[0].toUpperCase()}
              </Text>
            </View>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  slot: {
    borderRadius: 12,
    borderWidth: 1.5,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: "center",
    minWidth: 90,
    marginRight: 10,
    gap: 2,
    overflow: "hidden",
  },
  time: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  teeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 1,
  },
  teeBadgeText: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.3,
  },
  slots: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  avatarRow: {
    flexDirection: "row",
    marginTop: 6,
  },
  avatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  avatarText: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
});
