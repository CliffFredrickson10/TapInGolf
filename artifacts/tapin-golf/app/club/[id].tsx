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

export default function ClubDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();

  const DAYS = useMemo(() => buildDays(), []);

  const [club, setClub] = useState<Club | null>(null);
  const [selectedDay, setSelectedDay] = useState(0);
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

  useEffect(() => {
    (async () => {
      try {
        const [clubData, adsData, reviewsData, eventsData, photosData] = await Promise.all([
          apiFetch(`/clubs/${id}`, user?.token),
          apiFetch(`/ads?placement=club&club_id=${id}`, user?.token),
          apiFetch(`/clubs/${id}/reviews`, user?.token),
          apiFetch(`/clubs/${id}/events`, user?.token),
          apiFetch(`/clubs/${id}/images`, user?.token),
        ]);
        setClub(clubData.club);
        setAds(adsData.ads ?? []);
        setReviews(reviewsData.reviews ?? []);
        setEvents(eventsData.events ?? []);
        setPhotos(photosData.images ?? []);
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
          {[`${club.holes ?? 18} holes`, ...(club.facilities ?? [])].map((f) => (
            <View key={f} style={[styles.feature, { backgroundColor: colors.primaryLight }]}>
              <Text style={[styles.featureText, { color: colors.primary }]}>{f}</Text>
            </View>
          ))}
        </ScrollView>

        {/* Description */}
        {club.description ? (
          <View style={[styles.descriptionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>About</Text>
            <Text style={[styles.descriptionText, { color: colors.mutedForeground }]}>{club.description}</Text>
          </View>
        ) : null}

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

        {/* Cart availability */}
        <View style={[styles.cartRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons
            name="car-sport"
            size={18}
            color={club.cart_available ? colors.primary : colors.mutedForeground}
          />
          {club.cart_available ? (
            <Text style={[styles.cartText, { color: colors.foreground }]}>
              Golf carts available
              {club.cart_compulsory ? " (compulsory)" : " (optional)"}
              {" · "}R{(club.cart_price ?? 0).toFixed(2)}/cart
            </Text>
          ) : (
            <Text style={[styles.cartText, { color: colors.mutedForeground }]}>
              No golf carts available at this club
            </Text>
          )}
        </View>


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
                  cart_available:  club.cart_available  ? "1" : "0",
                  cart_compulsory: club.cart_compulsory ? "1" : "0",
                  cart_price:      club.cart_price ? String(club.cart_price) : "",
                  event_id:        selectedSlot.event_id ? String(selectedSlot.event_id) : "",
                  event_name:      selectedSlot.event_name ?? "",
                },
              });
            }}
            activeOpacity={0.85}
          >
            <Text style={styles.bookBtnText}>Book {selectedSlot.time}</Text>
            <Ionicons name="arrow-forward-circle" size={28} color="#fff" />
          </TouchableOpacity>
        )}

        {/* Ad */}
        {ads.length > 0 && (
          <View style={{ marginTop: 12 }}>
            <AdBanner ad={ads[0]} onPress={() => {}} />
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
});
