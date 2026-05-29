import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import CachedImage from "@/components/CachedImage";
import { useColors } from "@/hooks/useColors";
import { toAbsoluteUrl } from "@/lib/api";

const { width } = Dimensions.get("window");

export interface Club {
  id: number;
  name: string;
  location: string;
  province: string;
  image_url?: string;
  logo_url?: string;
  rating?: number;
  review_count?: number;
  price_from?: number;
  holes?: number;
  facilities?: string[];
  distance_km?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
  phone?: string | null;
  description?: string | null;
}

interface Props {
  club: Club;
  onPress: () => void;
  horizontal?: boolean;
}

export default function ClubCard({ club, onPress, horizontal }: Props) {
  const colors = useColors();

  if (horizontal) {
    const distLabel =
      club.distance_km != null
        ? club.distance_km < 1
          ? `${Math.round(club.distance_km * 1000)} m`
          : `${club.distance_km.toFixed(1)} km`
        : null;

    return (
      <TouchableOpacity
        onPress={onPress}
        style={[styles.hCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        activeOpacity={0.85}
      >
        <View style={[styles.hImageWrap, { backgroundColor: club.logo_url ? "#fff" : colors.primary + "12" }, club.logo_url ? { padding: 8 } : null]}>
          {club.logo_url ? (
            <CachedImage uri={toAbsoluteUrl(club.logo_url)} style={styles.hLogo} resizeMode="contain" />
          ) : club.image_url ? (
            <CachedImage uri={toAbsoluteUrl(club.image_url)} style={styles.hImage} />
          ) : (
            <View style={styles.hPlaceholder}>
              <Ionicons name="golf-outline" size={28} color={colors.primary + "60"} />
            </View>
          )}
        </View>
        <View style={styles.hContent}>
          <View style={styles.hNameRow}>
            <Text style={[styles.hName, { color: colors.foreground, flex: 1 }]} numberOfLines={1}>
              {club.name}
            </Text>
            {distLabel ? (
              <View style={[styles.distBadge, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "40" }]}>
                <Ionicons name="navigate" size={10} color={colors.primary} />
                <Text style={[styles.distText, { color: colors.primary }]}>{distLabel}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.row}>
            <Ionicons name="location-outline" size={12} color={colors.mutedForeground} />
            <Text style={[styles.hLocation, { color: colors.mutedForeground }]} numberOfLines={1}>
              {" "}{club.location}
            </Text>
          </View>
          <View style={styles.rowBetween}>
            {club.rating ? (
              <View style={styles.ratingRow}>
                <Ionicons name="star" size={12} color={colors.accent} />
                <Text style={[styles.rating, { color: colors.foreground }]}>
                  {" "}{club.rating.toFixed(1)}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.card, { backgroundColor: colors.card }]}
      activeOpacity={0.88}
    >
      <View style={[styles.imageWrap, { backgroundColor: club.logo_url ? "#fff" : colors.primary + "12" }, club.logo_url ? { padding: 16 } : null]}>
        {club.logo_url ? (
          <CachedImage uri={toAbsoluteUrl(club.logo_url)} style={styles.logoContain} resizeMode="contain" />
        ) : club.image_url ? (
          <CachedImage uri={toAbsoluteUrl(club.image_url)} style={styles.image} />
        ) : (
          <View style={styles.placeholder}>
            <Ionicons name="golf-outline" size={48} color={colors.primary + "60"} />
          </View>
        )}
      </View>
      <View style={[styles.badge, { backgroundColor: colors.primary }]}>
        <Text style={styles.badgeText}>{club.holes || 18} holes</Text>
      </View>
      <View style={styles.cardContent}>
        <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>
          {club.name}
        </Text>
        <View style={styles.row}>
          <Ionicons name="location-outline" size={13} color={colors.mutedForeground} />
          <Text style={[styles.location, { color: colors.mutedForeground }]}>
            {" "}{club.location}, {club.province}
          </Text>
        </View>
        <View style={styles.rowBetween}>
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={13} color={colors.accent} />
            <Text style={[styles.ratingText, { color: colors.foreground }]}>
              {" "}{club.rating?.toFixed(1) ?? "New"}
            </Text>
            {club.review_count ? (
              <Text style={[styles.reviewCount, { color: colors.mutedForeground }]}>
                {" "}({club.review_count})
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: width * 0.72,
    borderRadius: 16,
    overflow: "hidden",
    marginRight: 14,
  },
  imageWrap: {
    width: "100%",
    height: 160,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    width: "100%",
    height: 160,
    resizeMode: "cover",
  },
  logoContain: {
    width: "100%",
    height: 128,
    resizeMode: "contain",
  },
  badge: {
    position: "absolute",
    top: 12,
    right: 12,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  cardContent: {
    padding: 14,
    gap: 4,
  },
  name: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  location: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  ratingText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  reviewCount: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  priceText: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  hNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  distBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    flexShrink: 0,
  },
  distText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
  // Horizontal card
  hCard: {
    flexDirection: "row",
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 12,
    borderWidth: 1,
  },
  placeholder: {
    width: "100%",
    height: 160,
    alignItems: "center",
    justifyContent: "center",
  },
  hImageWrap: {
    width: 90,
    height: 90,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  hPlaceholder: {
    width: 90,
    height: 90,
    alignItems: "center",
    justifyContent: "center",
  },
  hImage: {
    width: 90,
    height: 90,
    resizeMode: "cover",
  },
  hLogo: {
    width: 74,
    height: 74,
    resizeMode: "contain",
  },
  hContent: {
    flex: 1,
    padding: 12,
    gap: 3,
    justifyContent: "center",
  },
  hName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  hLocation: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  rating: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  price: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
});
