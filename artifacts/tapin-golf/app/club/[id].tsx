import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import GolfBallLoader from "@/components/GolfBallLoader";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import CachedImage from "@/components/CachedImage";
import TeeTimeSlot, { TeeTime } from "@/components/TeeTimeSlot";
import AdBanner, { Ad } from "@/components/AdBanner";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { apiFetch, toAbsoluteUrl } from "@/lib/api";
import { Club } from "@/components/ClubCard";

function openDirections(club: { name: string; latitude?: number | null; longitude?: number | null; location?: string; province?: string }) {
  const hasCoords = club.latitude && club.longitude;
  const label = encodeURIComponent(club.name);

  if (hasCoords) {
    const lat = club.latitude!;
    const lng = club.longitude!;
    if (Platform.OS === "ios") {
      // Apple Maps — opens natively on iOS
      Linking.openURL(`maps://?q=${label}&ll=${lat},${lng}`);
    } else {
      // Google Maps / default maps app on Android
      Linking.openURL(`geo:${lat},${lng}?q=${lat},${lng}(${label})`);
    }
  } else {
    // Fallback: search by address text (universal Google Maps URL)
    const address = encodeURIComponent(`${club.name}, ${club.location ?? ""}, ${club.province ?? ""}`);
    Linking.openURL(`https://maps.google.com/?q=${address}`);
  }
}

function nextWeekdayIndex(weekday: string, days: Date[]): number {
  const map: Record<string, number> = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
    thursday: 4, friday: 5, saturday: 6,
  };
  const target = map[weekday.toLowerCase()];
  if (target === undefined) return 0;
  const idx = days.findIndex(d => d.getDay() === target);
  return idx >= 0 ? idx : 0;
}

function buildDays() {
  const days = [];
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    days.push(d);
  }
  return days;
}

// Use local date parts — toISOString() converts to UTC which is wrong in UTC+2 (SAST)
const formatDate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

type Review = {
  id: number;
  rating: number;
  comment: string | null;
  created_at: string;
  reviewer_name: string;
  response?: string | null;
  responded_at?: string | null;
};

type HoleRow = {
  number: number;
  par: number | null;
  stroke_index: number | null;
  yellow: number | null;
  white: number | null;
  blue: number | null;
  red: number | null;
  [key: string]: number | null | undefined;
};

type TeeColor = {
  key: string;
  name: string;
  color: string;
  enabled: boolean;
};

type Scorecard = {
  holes: HoleRow[];
  tee_colors: TeeColor[];
};

type LocalRule = {
  id: string;
  title: string;
  body: string;
};

type CourseRating = {
  id: string;
  tee: string;
  color: string;
  course_rating: string;
  slope_rating: string;
};

type LocalRules = {
  rules: LocalRule[];
  course_ratings: CourseRating[];
  footer_notes: string;
};

function StarRow({ rating, size = 14, onPress }: { rating: number; size?: number; onPress?: (r: number) => void }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((s) => (
        <TouchableOpacity key={s} onPress={() => onPress?.(s)} disabled={!onPress} activeOpacity={0.7}>
          <Ionicons
            name={s <= rating ? "star" : "star-outline"}
            size={size}
            color={s <= rating ? colors.accent : colors.mutedForeground}
          />
        </TouchableOpacity>
      ))}
    </View>
  );
}

function ScorecardSection({
  scorecard, expanded, onToggle, colors,
}: {
  scorecard: Scorecard;
  expanded: boolean;
  onToggle: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const { width: screenW } = useWindowDimensions();
  const LABEL_W = 56; const SUB_W = 36; const ROW_H = 28;
  const HOLE_W = Math.floor((screenW - 158) / 9);
  const enabledTees = scorecard.tee_colors.filter(t => t.enabled);
  const front = scorecard.holes.slice(0, 9);
  const back  = scorecard.holes.slice(9, 18);

  const sumHoles = (holes: HoleRow[], key: string): number | null =>
    holes.some(h => h[key] != null)
      ? holes.reduce((s, h) => s + (Number(h[key]) || 0), 0)
      : null;

  const rows: { label: string; color: string; key: string; bold?: boolean }[] = [
    { label: "Hole", color: colors.primary,          key: "number",       bold: true },
    { label: "Par",  color: colors.mutedForeground,  key: "par" },
    { label: "SI",   color: colors.mutedForeground,  key: "stroke_index" },
    ...enabledTees.map(t => ({ label: t.name, color: t.color, key: t.key })),
  ];

  const renderTable = (holes: HoleRow[], subtotalLabel: string) => (
    <View style={{ marginTop: 6 }}>
      <View style={[scStyles.wrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {rows.map((row, ri) => {
          const isHole   = row.key === "number";
          const isTee    = enabledTees.some(t => t.key === row.key);
          const subtotal = (isTee || row.key === "par") ? sumHoles(holes, row.key) : null;
          return (
            <View
              key={row.key}
              style={[
                scStyles.row,
                { height: ROW_H, borderBottomWidth: ri < rows.length - 1 ? 1 : 0, borderBottomColor: colors.border + "60" },
                isHole && { backgroundColor: colors.primary + "18" },
              ]}
            >
              <View style={[scStyles.labelCell, { width: LABEL_W, borderRightColor: colors.border }]}>
                {isTee ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                    <View style={[scStyles.teeDot, { backgroundColor: row.color }]} />
                    <Text style={[scStyles.label, { color: colors.foreground }]}>{row.label}</Text>
                  </View>
                ) : (
                  <Text style={[scStyles.label, row.bold && scStyles.bold, { color: row.color }]}>{row.label}</Text>
                )}
              </View>
              {holes.map((h, hi) => (
                <Text
                  key={h.number}
                  style={[
                    scStyles.cell,
                    { width: HOLE_W, color: isHole ? colors.primary : isTee ? colors.foreground : colors.mutedForeground },
                    (isHole || row.bold) && scStyles.bold,
                    hi % 2 === 1 && { backgroundColor: colors.primary + "06" },
                  ]}
                >
                  {h[row.key] != null ? String(h[row.key]) : "—"}
                </Text>
              ))}
              <Text style={[scStyles.cell, scStyles.bold, { width: SUB_W, color: colors.primary, borderLeftWidth: 1, borderLeftColor: colors.border }]}>
                {isHole ? subtotalLabel : subtotal != null ? String(subtotal) : "—"}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );

  return (
    <View style={[scStyles.dropdown, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <TouchableOpacity style={scStyles.toggle} onPress={onToggle} activeOpacity={0.7}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Ionicons name="golf-outline" size={18} color={colors.primary} />
          <Text style={[scStyles.title, { color: colors.foreground }]}>Scorecard</Text>
        </View>
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={20} color={colors.mutedForeground} />
      </TouchableOpacity>
      {expanded ? (
        <View style={[scStyles.body, { borderTopColor: colors.border }]}>
          {front.length > 0 && (
            <View>
              <Text style={[scStyles.halfLabel, { color: colors.mutedForeground }]}>Front Nine</Text>
              {renderTable(front, "Out")}
            </View>
          )}
          {back.length > 0 && (
            <View style={{ marginTop: 16 }}>
              <Text style={[scStyles.halfLabel, { color: colors.mutedForeground }]}>Back Nine</Text>
              {renderTable(back, "In")}
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

const scStyles = StyleSheet.create({
  dropdown:  { borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  toggle:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 10 },
  body:      { borderTopWidth: 1, paddingHorizontal: 12, paddingBottom: 12, paddingTop: 8 },
  halfLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 2 },
  title:     { fontSize: 14, fontFamily: "Inter_700Bold" },
  wrap:      { borderRadius: 10, borderWidth: 1, overflow: "hidden" },
  row:       { flexDirection: "row", alignItems: "center" },
  labelCell: { justifyContent: "center", paddingHorizontal: 8, borderRightWidth: 1 },
  teeDot:    { width: 9, height: 9, borderRadius: 5, borderWidth: 1, borderColor: "rgba(0,0,0,0.18)" },
  label:     { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  cell:      { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center", paddingHorizontal: 1 },
  bold:      { fontFamily: "Inter_700Bold" },
});

export default function ClubDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { id, date: dateParam, weekday: weekdayParam, event_holes: eventHolesParam } = useLocalSearchParams<{ id: string; date?: string; weekday?: string; event_holes?: string }>();

  const DAYS = useMemo(() => buildDays(), []);

  const initialDay = useMemo(() => {
    if (dateParam) {
      const idx = DAYS.findIndex(d => formatDate(d) === dateParam);
      return idx >= 0 ? idx : 0;
    }
    if (weekdayParam) return nextWeekdayIndex(weekdayParam, DAYS);
    return 0;
  }, [DAYS, dateParam, weekdayParam]);

  const [club, setClub] = useState<Club | null>(null);
  const [selectedDay, setSelectedDay] = useState(initialDay);
  const [teeTimes, setTeeTimes] = useState<TeeTime[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<TeeTime | null>(null);
  const [loading, setLoading] = useState(true);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [ads, setAds] = useState<Ad[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [events, setEvents] = useState<any[]>([]);
  const [reviewError, setReviewError] = useState("");
  const [photos, setPhotos] = useState<{ id: number; url: string; caption: string | null }[]>([]);
  const [lightboxPhoto, setLightboxPhoto] = useState<{ url: string; caption: string | null } | null>(null);
  const [expandedReviews, setExpandedReviews] = useState<Record<number, boolean>>({});
  const [scorecard, setScorecard] = useState<Scorecard | null>(null);
  const [localRules, setLocalRules] = useState<LocalRules | null>(null);
  const [scorecardExpanded, setScorecardExpanded] = useState(false);
  const [aboutExpanded, setAboutExpanded] = useState(false);
  const [localRulesExpanded, setLocalRulesExpanded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [clubData, adsData, reviewsData, eventsData, photosData, scorecardData, localRulesData] = await Promise.all([
          apiFetch(`/clubs/${id}`, user?.token),
          apiFetch(`/ads?placement=club&club_id=${id}`, user?.token),
          apiFetch(`/clubs/${id}/reviews`, user?.token),
          apiFetch(`/clubs/${id}/events`, user?.token),
          apiFetch(`/clubs/${id}/images`, user?.token),
          apiFetch(`/clubs/${id}/scorecard`, user?.token).catch(() => ({ scorecard: null })),
          apiFetch(`/clubs/${id}/local-rules`, user?.token).catch(() => ({ local_rules: null })),
        ]);
        setClub(clubData.club);
        setAds(adsData.ads ?? []);
        setReviews(reviewsData.reviews ?? []);
        setEvents(eventsData.events ?? []);
        setPhotos(photosData.images ?? []);
        setScorecard(scorecardData.scorecard ?? null);
        setLocalRules(localRulesData.local_rules ?? null);
      } catch {}
      setLoading(false);
    })();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setSlotsLoading(true);
    setSelectedSlot(null);
    const date = formatDate(DAYS[selectedDay]);
    apiFetch(`/clubs/${id}/tee-times?date=${date}`, user?.token)
      .then((data) => setTeeTimes(data.tee_times ?? []))
      .catch(() => setTeeTimes([]))
      .finally(() => setSlotsLoading(false));
  }, [selectedDay, id]);

  const submitReview = async () => {
    if (!user) { router.push("/(auth)/login"); return; }
    setSubmittingReview(true);
    setReviewError("");
    try {
      await apiFetch(`/clubs/${id}/reviews`, user.token, {
        method: "POST",
        body: JSON.stringify({ rating: reviewRating, comment: reviewComment.trim() || undefined }),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Refresh reviews and club rating
      const [reviewsData, clubData] = await Promise.all([
        apiFetch(`/clubs/${id}/reviews`, user.token),
        apiFetch(`/clubs/${id}`, user.token),
      ]);
      setReviews(reviewsData.reviews ?? []);
      setClub(clubData.club);
      setShowReviewModal(false);
      setReviewComment("");
      setReviewRating(5);
    } catch (err: any) {
      setReviewError(err.message ?? "Failed to submit review");
    } finally {
      setSubmittingReview(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <GolfBallLoader />
      </View>
    );
  }

  if (!club) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.mutedForeground} />
        <Text style={[styles.errorText, { color: colors.foreground }]}>Club not found</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} showsVerticalScrollIndicator={false}>
      {/* Hero image */}
      <View style={[styles.heroWrap, club.logo_url ? { backgroundColor: "#fff", padding: 32 } : { backgroundColor: colors.primary + "12" }]}>
        {club.logo_url ? (
          <CachedImage uri={toAbsoluteUrl(club.logo_url)} style={styles.heroLogo} resizeMode="contain" />
        ) : club.image_url ? (
          <CachedImage uri={toAbsoluteUrl(club.image_url)} style={styles.hero} />
        ) : (
          <View style={styles.heroPlaceholder}>
            <Ionicons name="golf-outline" size={64} color={colors.primary + "50"} />
            <Text style={[styles.heroPlaceholderText, { color: colors.primary + "80" }]}>{club.name}</Text>
          </View>
        )}
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backBtn, { top: (Platform.OS === "web" ? 67 : insets.top) + 12, backgroundColor: "rgba(0,0,0,0.4)" }]}
        >
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {/* Club info */}
        <View style={styles.infoRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.clubName, { color: colors.foreground }]}>{club.name}</Text>
            <TouchableOpacity
              style={[styles.locationRow, { backgroundColor: colors.primary + "18", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, alignSelf: "flex-start", marginTop: 4 }]}
              onPress={() => { Haptics.selectionAsync(); openDirections(club); }}
              activeOpacity={0.7}
            >
              <Ionicons name="location" size={13} color={colors.primary} />
              <Text style={[styles.locationText, { color: colors.primary, textDecorationLine: "underline", marginLeft: 4 }]}>
                {club.location}, {club.province}
              </Text>
              <Ionicons name="navigate" size={12} color={colors.primary} style={{ marginLeft: 5 }} />
            </TouchableOpacity>
            {club.address ? (
              <View style={[styles.locationRow, { marginTop: 4, paddingHorizontal: 2 }]}>
                <Ionicons name="home-outline" size={13} color={colors.mutedForeground} />
                <Text style={[styles.locationText, { color: colors.mutedForeground, marginLeft: 4 }]}>
                  {club.address}
                </Text>
              </View>
            ) : null}
            {club.phone ? (
              <TouchableOpacity
                style={[styles.locationRow, { marginTop: 4, paddingHorizontal: 2 }]}
                onPress={() => { Haptics.selectionAsync(); Linking.openURL(`tel:${club.phone!.replace(/\s/g, "")}`); }}
                activeOpacity={0.7}
              >
                <Ionicons name="call-outline" size={13} color={colors.mutedForeground} />
                <Text style={[styles.locationText, { color: colors.mutedForeground, textDecorationLine: "underline", marginLeft: 4 }]}>
                  {club.phone}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <TouchableOpacity style={styles.ratingBox} onPress={() => { if (user) setShowReviewModal(true); else router.push("/(auth)/login"); }} activeOpacity={0.8}>
            <Ionicons name="star" size={14} color={colors.accent} />
            <Text style={[styles.ratingText, { color: colors.foreground }]}>
              {" "}{club.rating?.toFixed(1) ?? "New"}
            </Text>
            {club.review_count > 0 && (
              <Text style={[styles.reviewCount, { color: colors.mutedForeground }]}>
                {" "}({club.review_count})
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Features */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {[...(club.cart_available ? ["Golf carts"] : []), `${club.holes ?? 18} holes`, ...(club.facilities ?? [])].map((f) => (
            <View key={f} style={[styles.feature, { backgroundColor: colors.primaryLight }]}>
              <Text style={[styles.featureText, { color: colors.primary }]}>{f}</Text>
            </View>
          ))}
        </ScrollView>

        {/* Info dropdowns — About / Scorecard / Local Rules */}
        <View style={{ gap: 6 }}>

        {/* About — collapsible */}
        {club.description ? (
          <View style={[scStyles.dropdown, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <TouchableOpacity
              style={scStyles.toggle}
              onPress={() => { Haptics.selectionAsync(); setAboutExpanded(e => !e); }}
              activeOpacity={0.7}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
                <Text style={[scStyles.title, { color: colors.foreground }]}>About</Text>
              </View>
              <Ionicons name={aboutExpanded ? "chevron-up" : "chevron-down"} size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
            {aboutExpanded ? (
              <View style={[scStyles.body, { borderTopColor: colors.border }]}>
                <Text style={[styles.descriptionText, { color: colors.mutedForeground }]}>{club.description}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Scorecard — collapsible */}
        {scorecard && scorecard.holes.length > 0 && (
          <ScorecardSection
            scorecard={scorecard}
            expanded={scorecardExpanded}
            onToggle={() => { Haptics.selectionAsync(); setScorecardExpanded(e => !e); }}
            colors={colors}
          />
        )}

        {/* Local Rules — collapsible */}
        {localRules && (
          <View style={[scStyles.dropdown, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <TouchableOpacity
              style={scStyles.toggle}
              onPress={() => { Haptics.selectionAsync(); setLocalRulesExpanded(e => !e); }}
              activeOpacity={0.7}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="document-text-outline" size={18} color={colors.primary} />
                <Text style={[scStyles.title, { color: colors.foreground }]}>Local Rules</Text>
              </View>
              <Ionicons name={localRulesExpanded ? "chevron-up" : "chevron-down"} size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
            {localRulesExpanded ? (
              <View style={[scStyles.body, { borderTopColor: colors.border }]}>
                {localRules.rules.map((rule, idx) => (
                  <View key={rule.id ?? idx} style={[styles.localRuleItem, idx > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                    {rule.title ? (
                      <Text style={[styles.localRuleTitle, { color: colors.foreground }]}>{rule.title}</Text>
                    ) : null}
                    {rule.body ? (
                      <Text style={[styles.localRuleBody, { color: colors.mutedForeground }]}>{rule.body}</Text>
                    ) : null}
                  </View>
                ))}
                {localRules.course_ratings.length > 0 && (
                  <View style={[styles.courseRatingsWrap, { borderTopColor: colors.border }]}>
                    <Text style={[styles.courseRatingsTitle, { color: colors.foreground }]}>Course Ratings</Text>
                    <View style={[styles.crHeader, { backgroundColor: colors.primary + "18" }]}>
                      <Text style={[styles.crHdrCell, { color: colors.primary, flex: 2 }]}>Tee</Text>
                      <Text style={[styles.crHdrCell, { color: colors.primary, flex: 1 }]}>Rating</Text>
                      <Text style={[styles.crHdrCell, { color: colors.primary, flex: 1 }]}>Slope</Text>
                    </View>
                    {localRules.course_ratings.map((cr, idx) => (
                      <View key={cr.id ?? idx} style={[styles.crRow, idx % 2 === 1 && { backgroundColor: colors.primary + "06" }]}>
                        <View style={{ flex: 2, flexDirection: "row", alignItems: "center", gap: 6 }}>
                          {cr.color ? (
                            <View style={[styles.crColorDot, { backgroundColor: cr.color, borderWidth: 1, borderColor: "rgba(0,0,0,0.18)" }]} />
                          ) : null}
                          <Text style={[styles.crCell, { color: colors.foreground }]}>{cr.tee}</Text>
                        </View>
                        <Text style={[styles.crCell, { flex: 1, color: colors.mutedForeground }]}>{cr.course_rating ?? "—"}</Text>
                        <Text style={[styles.crCell, { flex: 1, color: colors.mutedForeground }]}>{cr.slope_rating ?? "—"}</Text>
                      </View>
                    ))}
                  </View>
                )}
                {localRules.footer_notes ? (
                  <Text style={[styles.localRulesFooter, { color: colors.mutedForeground, borderTopColor: colors.border }]}>
                    {localRules.footer_notes}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        )}

        </View>{/* end info dropdowns */}

        {/* Photo Gallery */}
        {photos.length > 0 && (
          <View>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Photos</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              {photos.map((photo) => (
                <TouchableOpacity
                  key={photo.id}
                  activeOpacity={0.88}
                  onPress={() => { Haptics.selectionAsync(); setLightboxPhoto(photo); }}
                >
                  <CachedImage
                    uri={photo.url}
                    style={styles.galleryThumb}
                    resizeMode="cover"
                  />
                  {photo.caption ? (
                    <View style={[styles.galleryCaption, { backgroundColor: colors.card }]}>
                      <Text style={[styles.galleryCaptionText, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {photo.caption}
                      </Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}



        {/* Upcoming Events */}
        {events.length > 0 && (
          <View>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Upcoming Events</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 4 }}>
              {events.map((ev) => {
                const typeColors: Record<string, string> = { open_day: "#ff9800", competition: "#8e24aa", corporate: "#1976d2", social: "#43a047", other: "#546e7a" };
                const typeIcons: Record<string, string>  = { open_day: "sunny", competition: "trophy", corporate: "business", social: "people", other: "calendar" };
                const restrictColors: Record<string, string> = { open: "#43a047", members_only: "#1976d2", invitation_only: "#e53935" };
                const restrictLabels: Record<string, string> = { open: "Open", members_only: "Members Only", invitation_only: "Invite Only" };
                const tc = typeColors[ev.event_type] ?? "#546e7a";
                const rc = restrictColors[ev.restriction] ?? "#43a047";
                const dateLabel = new Date(String(ev.event_date).split("T")[0] + "T00:00:00").toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
                return (
                  <TouchableOpacity
                    key={ev.id}
                    style={[styles.eventCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                    activeOpacity={0.82}
                    onPress={() => router.push({ pathname: "/event/[id]", params: { id: ev.id } })}
                  >
                    <View style={styles.eventCardTop}>
                      <View style={[styles.eventTypeChip, { backgroundColor: tc + "18" }]}>
                        <Text style={[styles.eventTypeChipText, { color: tc }]}>{String(ev.event_type).replace("_", " ")}</Text>
                      </View>
                      <View style={[styles.eventRestrictChip, { backgroundColor: rc + "18" }]}>
                        {ev.restriction !== "open" && <Ionicons name="lock-closed" size={10} color={rc} />}
                        <Text style={[styles.eventRestrictText, { color: rc }]}>{restrictLabels[ev.restriction] ?? "Open"}</Text>
                      </View>
                    </View>
                    <Text style={[styles.eventCardName, { color: colors.foreground }]} numberOfLines={2}>{ev.name}</Text>
                    <Text style={[styles.eventCardDate, { color: colors.mutedForeground }]}>{dateLabel}{ev.start_time ? ` · ${String(ev.start_time).slice(0, 5)}` : ""}</Text>
                    {ev.entry_fee != null && (
                      <Text style={[styles.eventCardFee, { color: colors.accent }]}>R{parseFloat(ev.entry_fee).toFixed(2)} entry</Text>
                    )}
                    {!ev.user_eligible && ev.user_eligible !== null && (
                      <View style={[styles.eventIneligible, { backgroundColor: rc + "10" }]}>
                        <Ionicons name="lock-closed" size={11} color={rc} />
                        <Text style={[styles.eventIneligibleText, { color: rc }]}>
                          {ev.user_registration?.status === "pending" ? "Awaiting approval" : "Restricted — contact club"}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Day selector */}
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Select Date</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
          {DAYS.map((d, i) => (
            <TouchableOpacity
              key={i}
              style={[
                styles.dayBtn,
                {
                  backgroundColor: selectedDay === i ? colors.primary : colors.card,
                  borderColor: selectedDay === i ? colors.primary : colors.border,
                },
              ]}
              onPress={() => { Haptics.selectionAsync(); setSelectedDay(i); }}
            >
              <Text style={[styles.dayText, { color: selectedDay === i ? "#fff" : colors.foreground }]}>
                {i === 0 ? "Today" : i === 1 ? "Tmrw" : d.toLocaleDateString("en-ZA", { weekday: "short" })}
              </Text>
              <Text style={[styles.dayNum, { color: selectedDay === i ? "rgba(255,255,255,0.8)" : colors.mutedForeground }]}>
                {d.getDate()} {d.toLocaleDateString("en-ZA", { month: "short" })}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Tee times */}
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Available Tee Times</Text>
        {slotsLoading ? (
          <View style={styles.slotsLoading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : teeTimes.length === 0 ? (
          <View style={styles.noSlots}>
            <Ionicons name="time-outline" size={32} color={colors.mutedForeground} />
            <Text style={[styles.noSlotsText, { color: colors.mutedForeground }]}>
              No tee times available for this date
            </Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 4 }}>
            {teeTimes.map((slot) => (
              <TeeTimeSlot
                key={slot.id}
                slot={slot}
                selected={selectedSlot?.id === slot.id}
                onPress={() => { Haptics.selectionAsync(); setSelectedSlot(slot); }}
              />
            ))}
          </ScrollView>
        )}

        {/* Who's joining panel — shown when slot has existing players */}
        {selectedSlot && (selectedSlot.existing_players?.length ?? 0) > 0 && (
          <View style={[styles.joiningCard, { backgroundColor: colors.card, borderColor: colors.accent }]}>
            <View style={styles.joiningHeader}>
              <Ionicons name="people" size={16} color={colors.accent} />
              <Text style={[styles.joiningTitle, { color: colors.foreground }]}>
                Already booked this slot
              </Text>
              <View style={[styles.spotsChip, { backgroundColor: colors.accent + "22" }]}>
                <Text style={[styles.spotsChipText, { color: colors.accent }]}>
                  {selectedSlot.total_slots - selectedSlot.available_slots}/{selectedSlot.total_slots} spots taken
                </Text>
              </View>
            </View>
            {selectedSlot.existing_players!.map((p, i) => (
              <View key={i} style={[styles.joiningRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                <View style={[styles.joiningAvatar, { backgroundColor: colors.accent }]}>
                  <Text style={styles.joiningAvatarText}>{p.name[0].toUpperCase()}</Text>
                </View>
                <Text style={[styles.joiningName, { color: colors.foreground }]}>{p.name}</Text>
                <View style={[styles.joiningBadge, { backgroundColor: colors.muted }]}>
                  <Text style={[styles.joiningBadgeText, { color: colors.mutedForeground }]}>
                    {p.players} {p.players === 1 ? "player" : "players"}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Book button */}
        {selectedSlot && (
          <TouchableOpacity
            style={[styles.bookBtn, { backgroundColor: colors.primary }]}
            onPress={() => {
              if (!user) { router.push("/(auth)/login"); return; }
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.push({
                pathname: "/booking/new",
                params: {
                  club_id: club.id,
                  club_name: club.name,
                  tee_time_id: selectedSlot.id,
                  time: selectedSlot.time,
                  date: formatDate(DAYS[selectedDay]),
                  price: selectedSlot.price,
                  price_9: selectedSlot.price_9 != null ? String(selectedSlot.price_9) : "",
                  promo_price: selectedSlot.promotional_price ?? "",
                  available: selectedSlot.available_slots,
                  total_slots: selectedSlot.total_slots,
                  cart_available:      club.cart_available  ? "1" : "0",
                  cart_compulsory:     club.cart_compulsory ? "1" : "0",
                  cart_price:          club.cart_price ? String(club.cart_price) : "",
                  range_balls_enabled: (club as any).range_balls_enabled ? "1" : "0",
                  range_balls_price:   (club as any).range_balls_price ? String((club as any).range_balls_price) : "",
                  club_hire_enabled:   (club as any).club_hire_enabled ? "1" : "0",
                  club_hire_price:     (club as any).club_hire_price ? String((club as any).club_hire_price) : "",
                  stitch_enabled:      (club as any).stitch_enabled  === false ? "0" : "1",
                  prepaid_enabled:     (club as any).prepaid_enabled === false ? "0" : "1",
                  voucher_enabled:     (club as any).voucher_enabled  === false ? "0" : "1",
                  pay_at_club_enabled: (club as any).pay_at_club_enabled ? "1" : "0",
                  event_id:            selectedSlot.event_id ? String(selectedSlot.event_id) : "",
                  event_name:          selectedSlot.event_name ?? "",
                  event_holes:         eventHolesParam ?? "",
                },
              });
            }}
            activeOpacity={0.85}
          >
            <Text style={styles.bookBtnText}>Book {selectedSlot.time}</Text>
            <Ionicons name="arrow-forward-circle" size={28} color="#fff" />
          </TouchableOpacity>
        )}

        {/* Ads */}
        {ads.length > 0 && (
          <View style={{ marginTop: 12, gap: 10 }}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Advertisements</Text>
            {ads.map((ad) => (
              <AdBanner key={ad.id} ad={ad} />
            ))}
          </View>
        )}

        {/* Reviews section */}
        <View style={styles.reviewsHeader}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Reviews{reviews.length > 0 ? ` (${reviews.length})` : ""}
          </Text>
          <TouchableOpacity
            style={[styles.writeReviewBtn, { backgroundColor: colors.primaryLight }]}
            onPress={() => {
              Haptics.selectionAsync();
              if (user) setShowReviewModal(true);
              else router.push("/(auth)/login");
            }}
          >
            <Ionicons name="pencil-outline" size={14} color={colors.primary} />
            <Text style={[styles.writeReviewText, { color: colors.primary }]}>Write a Review</Text>
          </TouchableOpacity>
        </View>

        {reviews.length === 0 ? (
          <View style={[styles.noReviews, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="chatbubble-outline" size={28} color={colors.mutedForeground} />
            <Text style={[styles.noReviewsText, { color: colors.mutedForeground }]}>
              No reviews yet. Be the first!
            </Text>
          </View>
        ) : (
          reviews.slice(0, 5).map((rev) => {
            const hasResponse = !!rev.response;
            const expanded = !!expandedReviews[rev.id];
            return (
            <TouchableOpacity
              key={rev.id}
              activeOpacity={hasResponse ? 0.7 : 1}
              onPress={() => {
                if (!hasResponse) return;
                Haptics.selectionAsync();
                setExpandedReviews((prev) => ({ ...prev, [rev.id]: !prev[rev.id] }));
              }}
              style={[styles.reviewCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={styles.reviewTop}>
                <View style={[styles.reviewAvatar, { backgroundColor: colors.primary }]}>
                  <Text style={styles.reviewAvatarText}>
                    {rev.reviewer_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.reviewerName, { color: colors.foreground }]}>{rev.reviewer_name}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <StarRow rating={rev.rating} size={12} />
                    <Text style={[styles.reviewDate, { color: colors.mutedForeground }]}>
                      {new Date(rev.created_at).toLocaleDateString("en-ZA", { month: "short", year: "numeric" })}
                    </Text>
                  </View>
                </View>
              </View>
              {rev.comment ? (
                <Text style={[styles.reviewComment, { color: colors.foreground }]}>{rev.comment}</Text>
              ) : null}
              {hasResponse ? (
                <>
                  {!expanded ? (
                    <View style={styles.responseHint}>
                      <Ionicons name="chatbubble-ellipses-outline" size={13} color={colors.primary} />
                      <Text style={[styles.responseHintText, { color: colors.primary }]}>
                        Response from {club.name}
                      </Text>
                      <Ionicons name="chevron-down" size={13} color={colors.primary} />
                    </View>
                  ) : (
                    <View style={[styles.responseBox, { backgroundColor: colors.primaryLight, borderLeftColor: colors.primary }]}>
                      <View style={styles.responseHeader}>
                        <Ionicons name="chatbubble-ellipses" size={13} color={colors.primary} />
                        <Text style={[styles.responseTitle, { color: colors.primary }]}>
                          Response from {club.name}
                        </Text>
                      </View>
                      <Text style={[styles.responseText, { color: colors.foreground }]}>{rev.response}</Text>
                      {rev.responded_at ? (
                        <Text style={[styles.reviewDate, { color: colors.mutedForeground, marginTop: 4 }]}>
                          {new Date(rev.responded_at).toLocaleDateString("en-ZA", { month: "short", year: "numeric" })}
                        </Text>
                      ) : null}
                    </View>
                  )}
                </>
              ) : null}
            </TouchableOpacity>
            );
          })
        )}
      </View>

      <View style={{ height: Platform.OS === "web" ? 50 : 40 }} />

      {/* Review Modal */}
      <Modal visible={showReviewModal} transparent animationType="slide" onRequestClose={() => setShowReviewModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Rate {club.name}</Text>
            <View style={styles.starPicker}>
              <StarRow rating={reviewRating} size={36} onPress={(r) => { setReviewRating(r); Haptics.selectionAsync(); }} />
            </View>
            <TextInput
              style={[styles.reviewInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
              placeholder="Share your experience (optional)"
              placeholderTextColor={colors.mutedForeground}
              value={reviewComment}
              onChangeText={setReviewComment}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            {reviewError ? (
              <Text style={[styles.reviewErrorText, { color: colors.destructive }]}>{reviewError}</Text>
            ) : null}
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { borderColor: colors.border }]}
                onPress={() => { setShowReviewModal(false); setReviewError(""); }}
              >
                <Text style={[styles.modalCancelText, { color: colors.foreground }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmitBtn, { backgroundColor: submittingReview ? colors.muted : colors.primary }]}
                onPress={submitReview}
                disabled={submittingReview}
              >
                <Text style={styles.modalSubmitText}>{submittingReview ? "Submitting…" : "Submit"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Photo Lightbox */}
      <Modal visible={!!lightboxPhoto} transparent animationType="fade" onRequestClose={() => setLightboxPhoto(null)}>
        <View style={styles.lightboxOverlay}>
          <TouchableOpacity
            style={styles.lightboxClose}
            onPress={() => setLightboxPhoto(null)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <View style={styles.lightboxCloseInner}>
              <Ionicons name="close" size={22} color="#fff" />
            </View>
          </TouchableOpacity>
          {lightboxPhoto && (
            <>
              <CachedImage
                uri={lightboxPhoto.url}
                style={styles.lightboxImage}
                resizeMode="contain"
              />
              {lightboxPhoto.caption ? (
                <View style={styles.lightboxCaptionWrap}>
                  <Text style={styles.lightboxCaptionText}>{lightboxPhoto.caption}</Text>
                </View>
              ) : null}
            </>
          )}
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  heroWrap: { width: "100%", height: 260, alignItems: "center", justifyContent: "center" },
  hero: { width: "100%", height: 260, resizeMode: "cover" },
  heroLogo: { width: "100%", height: 196, resizeMode: "contain" },
  heroPlaceholder: { width: "100%", height: 260, alignItems: "center", justifyContent: "center", gap: 10 },
  heroPlaceholderText: { fontSize: 16, fontFamily: "Inter_600SemiBold", textAlign: "center", paddingHorizontal: 24 },
  backBtn: {
    position: "absolute",
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  content: { padding: 20, gap: 16 },
  infoRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  clubName: { fontSize: 22, fontFamily: "Inter_700Bold", marginBottom: 4 },
  locationRow: { flexDirection: "row", alignItems: "center" },
  locationText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  ratingBox: { flexDirection: "row", alignItems: "center" },
  ratingText: { fontSize: 15, fontFamily: "Inter_700Bold" },
  reviewCount: { fontSize: 13, fontFamily: "Inter_400Regular" },
  feature: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  featureText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  cartRow:    { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  cartText:   { fontSize: 13, fontFamily: "Inter_500Medium", flex: 1 },
  priceLabel: { fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 2 },
  priceValue: { fontSize: 22, fontFamily: "Inter_700Bold" },
  priceNote: { fontSize: 13, fontFamily: "Inter_400Regular" },
  sectionTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  descriptionCard: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 8 },
  descriptionText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22 },
  dayBtn: { borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 10, alignItems: "center", minWidth: 70 },
  dayText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  dayNum: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  slotsLoading: { height: 80, alignItems: "center", justifyContent: "center" },
  noSlots: { alignItems: "center", paddingVertical: 24, gap: 8 },
  noSlotsText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  bookBtn: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 18,
    marginTop: 4,
  },
  bookBtnText: { color: "#fff", fontSize: 18, fontFamily: "Inter_700Bold" },
  bookBtnSub: { color: "rgba(255,255,255,0.8)", fontSize: 13, fontFamily: "Inter_400Regular" },
  errorText: { fontSize: 18, fontFamily: "Inter_600SemiBold", marginTop: 12 },
  reviewsHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  writeReviewBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  writeReviewText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  noReviews: { alignItems: "center", borderRadius: 12, borderWidth: 1, paddingVertical: 24, gap: 8 },
  noReviewsText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  reviewCard: { borderRadius: 12, borderWidth: 1, padding: 14, gap: 10 },
  reviewTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  reviewAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  reviewAvatarText: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },
  reviewerName: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  reviewDate: { fontSize: 11, fontFamily: "Inter_400Regular" },
  reviewComment: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  responseHint: { flexDirection: "row", alignItems: "center", gap: 5 },
  responseHintText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  responseBox: { borderLeftWidth: 3, borderRadius: 8, padding: 10, gap: 2 },
  responseHeader: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 2 },
  responseTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  responseText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 16, paddingBottom: 40 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
  starPicker: { alignItems: "center", paddingVertical: 8 },
  reviewInput: { borderWidth: 1.5, borderRadius: 12, padding: 14, fontSize: 15, fontFamily: "Inter_400Regular", minHeight: 100 },
  reviewErrorText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  modalBtns: { flexDirection: "row", gap: 12 },
  modalCancelBtn: { flex: 1, height: 48, borderRadius: 12, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  modalCancelText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  modalSubmitBtn: { flex: 1, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  modalSubmitText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  joiningCard: {
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 14,
    gap: 10,
  },
  joiningHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  joiningTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
  },
  spotsChip: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  spotsChipText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  joiningRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 8,
  },
  joiningAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  joiningAvatarText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  joiningName: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    flex: 1,
  },
  joiningBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  joiningBadgeText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  eventCard:           { width: 180, borderRadius: 14, borderWidth: 1, padding: 12, gap: 6 },
  eventCardTop:        { flexDirection: "row", flexWrap: "wrap", gap: 5, marginBottom: 2 },
  eventTypeChip:       { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  eventTypeChipText:   { fontSize: 10, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" },
  eventRestrictChip:   { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  eventRestrictText:   { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  eventCardName:       { fontSize: 14, fontFamily: "Inter_700Bold", lineHeight: 19 },
  eventCardDate:       { fontSize: 12, fontFamily: "Inter_400Regular" },
  eventCardFee:        { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  eventIneligible:     { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginTop: 2 },
  eventIneligibleText: { fontSize: 11, fontFamily: "Inter_500Medium", flex: 1 },

  // Photo gallery
  galleryThumb: { width: 160, height: 120, borderRadius: 12 },
  galleryCaption: { width: 160, borderBottomLeftRadius: 12, borderBottomRightRadius: 12, paddingHorizontal: 8, paddingVertical: 4, marginTop: -4 },
  galleryCaptionText: { fontSize: 11, fontFamily: "Inter_400Regular" },

  // Lightbox
  lightboxOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.95)", alignItems: "center", justifyContent: "center" },
  lightboxClose: { position: "absolute", top: 56, right: 20, zIndex: 10 },
  lightboxCloseInner: { backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 20, padding: 8 },
  lightboxImage: { width: "100%", height: "75%" },
  lightboxCaptionWrap: { position: "absolute", bottom: 60, left: 24, right: 24, alignItems: "center" },
  lightboxCaptionText: { color: "#fff", fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", opacity: 0.9 },

  // Scorecard
  scorecardDropdown: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  scorecardToggle:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14 },
  scorecardBody:     { borderTopWidth: 1, paddingHorizontal: 12, paddingBottom: 14, paddingTop: 10 },
  scHalfLabel:       { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 2 },
  scorecardWrap:     { borderRadius: 10, borderWidth: 1, overflow: "hidden" },
  scRow:             { flexDirection: "row", alignItems: "center" },
  scLabelCell:       { justifyContent: "center", paddingHorizontal: 8, borderRightWidth: 1 },
  scTeeDot:          { width: 9, height: 9, borderRadius: 5 },
  scLabel:           { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  scHdr:             { fontSize: 11, fontFamily: "Inter_700Bold", textAlign: "center", paddingHorizontal: 4 },
  scCell:            { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", paddingHorizontal: 2 },
  scCellBold:        { fontFamily: "Inter_700Bold" },
  scSubtotal:        { borderTopWidth: 1 },
  scTotal:           { borderTopWidth: 2 },

  // Local Rules
  localRulesCard:       { borderRadius: 14, borderWidth: 1, padding: 16, gap: 0 },
  localRulesHeaderRow:  { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  localRuleItem:        { paddingVertical: 10, gap: 4 },
  localRuleTitle:       { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  localRuleBody:        { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  courseRatingsWrap:    { borderTopWidth: 1, marginTop: 10, paddingTop: 10, gap: 0 },
  courseRatingsTitle:   { fontSize: 13, fontFamily: "Inter_600SemiBold", marginBottom: 8 },
  crHeader:             { flexDirection: "row", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  crHdrCell:            { fontSize: 11, fontFamily: "Inter_700Bold" },
  crRow:                { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 7, borderRadius: 4 },
  crCell:               { fontSize: 12, fontFamily: "Inter_400Regular" },
  crColorDot:           { width: 10, height: 10, borderRadius: 5 },
  localRulesFooter:     { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18, borderTopWidth: 1, marginTop: 10, paddingTop: 10 },
});
