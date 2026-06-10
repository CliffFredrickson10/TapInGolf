import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
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
    if (!ad.link_url) return;
    if (ad.link_url.startsWith("tapin://")) {
      const match = ad.link_url.match(/^tapin:\/\/clubs\/(\w+)(?:\?(.*))?$/);
      if (match) {
        const clubId = match[1];
        const params: Record<string, string> = {};
        if (match[2]) new URLSearchParams(match[2]).forEach((v, k) => { params[k] = v; });
        router.push({ pathname: `/club/${clubId}`, params } as any);
      }
    } else {
      Linking.openURL(ad.link_url);
    }
  };

  const hasAction = !!(onPress || ad.link_url);

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.92}
      style={[
        styles.container,
        {
          shadowColor: colors.primary,
          backgroundColor: colors.card,
        },
      ]}
    >
      {/* Gold accent strip along the top edge */}
      <View style={[styles.accentStrip, { backgroundColor: colors.accent }]} />

      {/* Hero image — full bleed */}
      {ad.image_url ? (
        <View style={styles.imageWrapper}>
          <CachedImage uri={ad.image_url} style={styles.image} resizeMode="cover" />

          {/* Gradient overlay: transparent top → dark bottom */}
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.18)", "rgba(0,0,0,0.72)"]}
            locations={[0, 0.45, 1]}
            style={StyleSheet.absoluteFillObject}
          />

          {/* SPONSORED badge — top right */}
          <View style={styles.sponsoredBadge}>
            <Text style={[styles.sponsoredText, { color: colors.accent }]}>✦ SPONSORED</Text>
          </View>

          {/* Title + subtitle overlaid at the bottom of the image */}
          <View style={styles.imageTextBlock}>
            <Text style={styles.imageTitle} numberOfLines={2}>{ad.title}</Text>
            {ad.subtitle ? (
              <Text style={styles.imageSubtitle} numberOfLines={2}>{ad.subtitle}</Text>
            ) : null}
          </View>
        </View>
      ) : (
        /* No-image fallback — solid branded block */
        <View style={[styles.noImageBlock, { backgroundColor: colors.primary }]}>
          <View style={styles.sponsoredBadge}>
            <Text style={[styles.sponsoredText, { color: colors.accent }]}>✦ SPONSORED</Text>
          </View>
          <View style={styles.imageTextBlock}>
            <Text style={styles.imageTitle} numberOfLines={2}>{ad.title}</Text>
            {ad.subtitle ? (
              <Text style={styles.imageSubtitle} numberOfLines={2}>{ad.subtitle}</Text>
            ) : null}
          </View>
        </View>
      )}

      {/* CTA row at the bottom */}
      {ad.cta_text ? (
        <View style={[styles.ctaRow, { borderTopColor: colors.border }]}>
          <Text style={[styles.ctaLabel, { color: colors.mutedForeground }]}>
            Tap to find out more
          </Text>
          <View style={[styles.ctaBtn, { backgroundColor: colors.primary }]}>
            <Text style={styles.ctaBtnText}>{ad.cta_text}</Text>
            <Ionicons name="arrow-forward" size={13} color="#fff" />
          </View>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 18,
    overflow: "hidden",
    marginBottom: 16,
    elevation: 6,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
  },
  accentStrip: {
    height: 4,
    width: "100%",
  },
  imageWrapper: {
    width: "100%",
    height: 210,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  noImageBlock: {
    width: "100%",
    height: 160,
    justifyContent: "flex-end",
  },
  sponsoredBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
  },
  sponsoredText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.8,
  },
  imageTextBlock: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    gap: 4,
  },
  imageTitle: {
    color: "#ffffff",
    fontSize: 19,
    fontFamily: "Inter_700Bold",
    lineHeight: 24,
    textShadow: "0px 1px 4px rgba(0,0,0,0.6)",
  },
  imageSubtitle: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
    textShadow: "0px 1px 3px rgba(0,0,0,0.5)",
  },
  ctaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  ctaLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  ctaBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  ctaBtnText: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
});
