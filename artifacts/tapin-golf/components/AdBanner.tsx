import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  Dimensions,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import CachedImage from "@/components/CachedImage";
import { useColors } from "@/hooks/useColors";

const { width } = Dimensions.get("window");

export interface Ad {
  id: number;
  title: string;
  subtitle?: string;
  image_url?: string;
  cta_text?: string;
  link_url?: string;
  advertiser_name?: string;
}

interface Props {
  ad: Ad;
  onPress?: () => void;
}

export default function AdBanner({ ad, onPress }: Props) {
  const colors = useColors();

  const handlePress = () => {
    if (onPress) { onPress(); return; }
    if (ad.link_url) Linking.openURL(ad.link_url);
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.88}
      style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      {ad.image_url && (
        <CachedImage uri={ad.image_url} style={styles.image} resizeMode="cover" />
      )}
      <View style={styles.content}>
        <View style={[styles.sponsoredBadge, { backgroundColor: colors.accent + "22" }]}>
          <Text style={[styles.sponsored, { color: colors.accent }]}>Sponsored</Text>
        </View>
        <Text style={[styles.title, { color: colors.foreground }]}>{ad.title}</Text>
        {ad.subtitle ? (
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]} numberOfLines={2}>
            {ad.subtitle}
          </Text>
        ) : null}
        {ad.cta_text ? (
          <View style={[styles.ctaBtn, { backgroundColor: colors.primary }]}>
            <Text style={styles.ctaText}>{ad.cta_text}</Text>
            <Ionicons name="arrow-forward" size={14} color="#fff" />
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    marginBottom: 16,
  },
  image: {
    width: "100%",
    height: 140,
  },
  content: {
    padding: 16,
    gap: 6,
  },
  sponsoredBadge: {
    alignSelf: "flex-start",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  sponsored: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
  },
  subtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  ctaBtn: {
    flexDirection: "row",
    alignSelf: "flex-start",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 4,
  },
  ctaText: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
});
