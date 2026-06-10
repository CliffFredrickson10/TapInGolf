import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import {
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import CachedImage from "@/components/CachedImage";
import { useColors } from "@/hooks/useColors";

export interface Ad {
  id: number;
  title: string;
  subtitle?: string;
  image_url?: string;
  cta_text?: string;
  link_url?: string;
  advertiser_name?: string;
  layout?: "classic" | "hero" | "bold";
}

interface Props {
  ad: Ad;
  onPress?: () => void;
}

export default function AdBanner({ ad, onPress }: Props) {
  const colors = useColors();
  const layout = ad.layout ?? "classic";

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

  const SponsoredBadge = ({ dark = true }: { dark?: boolean }) => (
    <View style={[styles.sponsoredBadge, { backgroundColor: dark ? "rgba(0,0,0,0.45)" : colors.accent + "22" }]}>
      <Text style={[styles.sponsoredText, { color: colors.accent }]}>✦ SPONSORED</Text>
    </View>
  );

  const CtaButton = ({ light = false }: { light?: boolean }) =>
    ad.cta_text ? (
      <View style={[styles.ctaBtn, { backgroundColor: light ? "#fff" : colors.primary }]}>
        <Text style={[styles.ctaBtnText, { color: light ? colors.primary : "#fff" }]}>{ad.cta_text}</Text>
        <Ionicons name="arrow-forward" size={13} color={light ? colors.primary : "#fff"} />
      </View>
    ) : null;

  // ── HERO ──────────────────────────────────────────────────────────────────
  if (layout === "hero") {
    return (
      <TouchableOpacity onPress={handlePress} activeOpacity={0.92}
        style={[styles.container, { shadowColor: colors.primary, backgroundColor: colors.card }]}>
        <View style={[styles.accentStrip, { backgroundColor: colors.accent }]} />
        {ad.image_url ? (
          <View style={styles.heroImageWrapper}>
            <CachedImage uri={ad.image_url} style={styles.fill} resizeMode="cover" />
            <LinearGradient
              colors={["transparent", "rgba(0,0,0,0.12)", "rgba(0,0,0,0.75)"]}
              locations={[0, 0.4, 1]}
              style={StyleSheet.absoluteFillObject}
            />
            <SponsoredBadge dark />
            <View style={styles.heroTextBlock}>
              <Text style={styles.heroTitle} numberOfLines={2}>{ad.title}</Text>
              {ad.subtitle ? <Text style={styles.heroSubtitle} numberOfLines={2}>{ad.subtitle}</Text> : null}
            </View>
          </View>
        ) : (
          <View style={[styles.noImageBlock, { backgroundColor: colors.primary }]}>
            <SponsoredBadge dark />
            <View style={styles.heroTextBlock}>
              <Text style={styles.heroTitle} numberOfLines={2}>{ad.title}</Text>
              {ad.subtitle ? <Text style={styles.heroSubtitle} numberOfLines={2}>{ad.subtitle}</Text> : null}
            </View>
          </View>
        )}
        {ad.cta_text ? (
          <View style={[styles.ctaRow, { borderTopColor: colors.border }]}>
            <CtaButton />
          </View>
        ) : null}
      </TouchableOpacity>
    );
  }

  // ── BOLD ──────────────────────────────────────────────────────────────────
  if (layout === "bold") {
    return (
      <TouchableOpacity onPress={handlePress} activeOpacity={0.92}
        style={[styles.container, { shadowColor: colors.primary, backgroundColor: colors.primary }]}>
        <View style={styles.boldContent}>
          <SponsoredBadge dark />
          <Text style={styles.boldTitle} numberOfLines={2}>{ad.title}</Text>
          {ad.subtitle ? <Text style={styles.boldSubtitle} numberOfLines={2}>{ad.subtitle}</Text> : null}
          {ad.cta_text ? <View style={styles.boldCtaRow}><CtaButton light /></View> : null}
        </View>
      </TouchableOpacity>
    );
  }

  // ── CLASSIC (default) ─────────────────────────────────────────────────────
  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.92}
      style={[styles.container, styles.classicBorder, { shadowColor: colors.primary, backgroundColor: colors.card, borderColor: colors.border }]}>
      {ad.image_url ? (
        <View style={styles.classicImageWrapper}>
          <CachedImage uri={ad.image_url} style={styles.fill} resizeMode="cover" />
          <SponsoredBadge dark />
        </View>
      ) : (
        <View style={[styles.classicNoImage, { backgroundColor: colors.primary + "18" }]}>
          <SponsoredBadge dark={false} />
        </View>
      )}
      <View style={[styles.classicContent, { backgroundColor: colors.card }]}>
        <View style={[styles.accentBar, { backgroundColor: colors.accent }]} />
        <View style={styles.classicTextBlock}>
          <Text style={[styles.classicTitle, { color: colors.foreground }]} numberOfLines={2}>{ad.title}</Text>
          {ad.subtitle ? <Text style={[styles.classicSubtitle, { color: colors.mutedForeground }]} numberOfLines={2}>{ad.subtitle}</Text> : null}
          {ad.cta_text ? <View style={styles.classicCtaRow}><CtaButton /></View> : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 16,
    elevation: 5,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
  },
  fill: { width: "100%", height: "100%" },
  accentStrip: { height: 4, width: "100%" },

  sponsoredBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  sponsoredText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.8,
  },

  ctaBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    alignSelf: "flex-start",
  },
  ctaBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },

  // ── Hero ──
  heroImageWrapper: { width: "100%", height: 200 },
  heroTextBlock: {
    position: "absolute",
    bottom: 0, left: 0, right: 0,
    padding: 14,
    gap: 3,
  },
  heroTitle: {
    color: "#fff",
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    lineHeight: 23,
    textShadow: "0px 1px 5px rgba(0,0,0,0.8)",
  },
  heroSubtitle: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
    textShadow: "0px 1px 4px rgba(0,0,0,0.7)",
  },
  ctaRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  noImageBlock: { width: "100%", height: 140, justifyContent: "flex-end" },

  // ── Bold ──
  boldContent: {
    padding: 28,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 150,
  },
  boldTitle: {
    color: "#fff",
    fontSize: 21,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    lineHeight: 27,
  },
  boldSubtitle: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 19,
  },
  boldCtaRow: { marginTop: 6 },

  // ── Classic ──
  classicBorder: { borderWidth: 1 },
  classicImageWrapper: { width: "100%", height: 148 },
  classicNoImage: { width: "100%", height: 52 },
  classicContent: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  accentBar: { width: 4 },
  classicTextBlock: {
    flex: 1,
    padding: 14,
    gap: 4,
  },
  classicTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    lineHeight: 21,
  },
  classicSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  classicCtaRow: { marginTop: 8 },
});
