import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppHeader } from "@/components/AppHeader";
import GolfBallLoader from "@/components/GolfBallLoader";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/lib/api";

type Round = {
  id: number;
  club_id: number;
  club_name: string;
  club_location: string;
  tee_color: string;
  format: string;
  course_handicap: number;
  playing_handicap: number;
  allowance_pct: number;
  status: "active" | "complete" | "abandoned";
  holes_played: number;
  total_gross: number | null;
  total_net: number | null;
  total_points: number | null;
  started_at: string;
  completed_at: string | null;
  tournament_name: string | null;
};

const FORMAT_LABELS: Record<string, string> = {
  individual_stableford: "Individual Stableford",
  gross_stroke_play: "Gross Stroke Play",
  net_stroke_play: "Net Stroke Play",
  singles_match_play: "Singles Match Play",
  par_bogey: "Par / Bogey",
  fourball_stableford: "Betterball Stableford",
  fourball_gross_betterball: "Four-Ball Gross Betterball",
  fourball_net_betterball: "Four-Ball Net Betterball",
  betterball_match_play: "Betterball Match Play",
  american_scramble: "American Scramble",
  shamble: "Shamble",
  eclectic: "Eclectic",
  modified_stableford: "Modified Stableford",
  chairman: "Chairman (The Perch)",
  maximum_score: "Maximum Score",
  individual_bonus_bogey: "Individual Bonus Bogey",
  individual_par: "Individual Par",
  individual_bogey: "Individual Bogey",
  high_low: "High-Low",
  daytona: "Daytona (Las Vegas)",
  low_ball_total: "Low Ball / Total Score",
  the_ghost: "The Ghost",
  betterball_bonus_bogey: "Betterball Bonus Bogey",
  pinehurst_points: "Pinehurst",
  alliance: "Alliance",
  other: "Other",
};

const BETTERBALL_FORMATS = new Set([
  "fourball_stableford", "fourball_gross_betterball", "fourball_net_betterball",
  "betterball_match_play", "shamble", "best_ball_aggregate", "high_low", "daytona",
  "low_ball_total", "the_ghost", "betterball_bonus_bogey", "pinehurst_points",
  "alliance", "american_scramble",
]);

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-ZA", {
      day: "numeric", month: "short", year: "numeric",
    });
  } catch { return iso; }
}

export default function ScoringScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const token = user?.token;
  const insets = useSafeAreaInsets();
  const [rounds, setRounds] = useState<Round[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadRounds = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiFetch("/scoring/rounds", token);
      setRounds(data.rounds ?? []);
    } catch {
      // silent
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { loadRounds(); }, [loadRounds]);

  const activeRound = rounds.find(r => r.status === "active") ?? null;
  const completedRounds = rounds.filter(r => r.status === "complete");

  const onContinue = () => {
    if (!activeRound) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const isBetterball = BETTERBALL_FORMATS.has(activeRound.format);
    router.push(isBetterball
      ? `/scoring/${activeRound.id}/betterball`
      : `/scoring/${activeRound.id}/hole`
    );
  };

  const onStart = () => {
    if (activeRound) {
      Alert.alert(
        "Active Round",
        "You have a round in progress. Starting a new one will abandon it. Continue?",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Start New", style: "destructive", onPress: () => router.push("/scoring/start") },
        ]
      );
    } else {
      router.push("/scoring/start");
    }
  };

  const onViewRound = (round: Round) => {
    router.push(`/scoring/${round.id}/complete`);
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <AppHeader />
        <GolfBallLoader />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadRounds(); }} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={[styles.hero, { backgroundColor: colors.primary }]}>
          <Text style={styles.heroTitle}>Scoring</Text>
          <Text style={styles.heroSub}>Track scores, Stableford points & round history</Text>
        </View>

        <View style={{ padding: 16, gap: 16 }}>
          {/* Active round card */}
          {activeRound && (
            <TouchableOpacity
              onPress={onContinue}
              activeOpacity={0.85}
              style={[styles.activeCard, { backgroundColor: colors.primary }]}
            >
              <View style={styles.activeCardHeader}>
                <View style={[styles.activeBadge]}>
                  <View style={styles.activeDot} />
                  <Text style={styles.activeBadgeText}>IN PROGRESS</Text>
                </View>
                <Text style={[styles.activeHoles, { color: "rgba(255,255,255,0.75)" }]}>
                  {activeRound.holes_played} / 18 holes
                </Text>
              </View>
              <Text style={styles.activeClub}>{activeRound.club_name}</Text>
              <Text style={styles.activeFormat}>
                {FORMAT_LABELS[activeRound.format] ?? activeRound.format}
                {activeRound.tournament_name ? ` · ${activeRound.tournament_name}` : ""}
              </Text>
              <View style={[styles.continueBtn]}>
                <Ionicons name="golf" size={18} color={colors.primary} />
                <Text style={[styles.continueBtnText, { color: colors.primary }]}>Continue Round</Text>
                <Ionicons name="arrow-forward" size={16} color={colors.primary} />
              </View>
            </TouchableOpacity>
          )}

          {/* Start new round */}
          <TouchableOpacity
            onPress={onStart}
            activeOpacity={0.85}
            style={[styles.startBtn, { backgroundColor: activeRound ? colors.card : colors.primary, borderWidth: activeRound ? 1.5 : 0, borderColor: colors.border }]}
          >
            <Ionicons name="add-circle" size={22} color={activeRound ? colors.primary : "#fff"} />
            <Text style={[styles.startBtnText, { color: activeRound ? colors.primary : "#fff" }]}>
              {activeRound ? "Start New Round" : "⛳  Start New Round"}
            </Text>
          </TouchableOpacity>

          {/* Recent rounds */}
          {completedRounds.length > 0 && (
            <View>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Recent Rounds</Text>
              <View style={{ gap: 10 }}>
                {completedRounds.map(round => (
                  <TouchableOpacity
                    key={round.id}
                    onPress={() => onViewRound(round)}
                    activeOpacity={0.85}
                    style={[styles.roundCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.roundClub, { color: colors.foreground }]} numberOfLines={1}>
                        {round.club_name}
                      </Text>
                      <Text style={[styles.roundFormat, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {FORMAT_LABELS[round.format] ?? round.format}
                        {round.tournament_name ? ` · ${round.tournament_name}` : ""}
                      </Text>
                      <Text style={[styles.roundDate, { color: colors.mutedForeground }]}>
                        {formatDate(round.started_at)} · {round.holes_played} holes
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 4 }}>
                      {round.total_points != null && (
                        <View style={[styles.pointsBadge, { backgroundColor: colors.primary + "18" }]}>
                          <Text style={[styles.pointsValue, { color: colors.primary }]}>{round.total_points}</Text>
                          <Text style={[styles.pointsLabel, { color: colors.primary }]}>pts</Text>
                        </View>
                      )}
                      {round.total_gross != null && (
                        <Text style={[styles.grossScore, { color: colors.mutedForeground }]}>
                          Gross {round.total_gross}
                        </Text>
                      )}
                      <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Empty state */}
          {completedRounds.length === 0 && !activeRound && (
            <View style={[styles.emptyState, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={{ fontSize: 40 }}>🏌️</Text>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No rounds yet</Text>
              <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                Start a round to track your scores, handicap strokes, and Stableford points.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    paddingTop: 20, paddingBottom: 28, paddingHorizontal: 20,
  },
  heroTitle: {
    fontSize: 28, fontFamily: "Inter_700Bold", color: "#fff", marginBottom: 4,
  },
  heroSub: {
    fontSize: 14, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.75)",
  },
  activeCard: {
    borderRadius: 20, padding: 20, gap: 6,
  },
  activeCardHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4,
  },
  activeBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(255,255,255,0.18)", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4,
  },
  activeDot: {
    width: 7, height: 7, borderRadius: 4, backgroundColor: "#4ade80",
  },
  activeBadgeText: {
    fontSize: 10, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: 0.8,
  },
  activeHoles: {
    fontSize: 12, fontFamily: "Inter_600SemiBold",
  },
  activeClub: {
    fontSize: 22, fontFamily: "Inter_700Bold", color: "#fff",
  },
  activeFormat: {
    fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.75)", marginBottom: 8,
  },
  continueBtn: {
    flexDirection: "row", alignItems: "center", gap: 8, justifyContent: "center",
    backgroundColor: "#fff", borderRadius: 14, paddingVertical: 14, marginTop: 4,
  },
  continueBtnText: {
    fontSize: 15, fontFamily: "Inter_700Bold", flex: 1, textAlign: "center",
  },
  startBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, borderRadius: 16, paddingVertical: 16,
  },
  startBtnText: {
    fontSize: 16, fontFamily: "Inter_700Bold",
  },
  sectionTitle: {
    fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 10,
  },
  roundCard: {
    flexDirection: "row", alignItems: "center", padding: 14,
    borderRadius: 14, borderWidth: 1, gap: 12,
  },
  roundClub: {
    fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 2,
  },
  roundFormat: {
    fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 2,
  },
  roundDate: {
    fontSize: 11, fontFamily: "Inter_400Regular",
  },
  pointsBadge: {
    flexDirection: "row", alignItems: "baseline", gap: 2,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
  },
  pointsValue: {
    fontSize: 18, fontFamily: "Inter_700Bold",
  },
  pointsLabel: {
    fontSize: 11, fontFamily: "Inter_600SemiBold",
  },
  grossScore: {
    fontSize: 11, fontFamily: "Inter_400Regular",
  },
  emptyState: {
    alignItems: "center", gap: 12, padding: 32,
    borderRadius: 20, borderWidth: 1,
  },
  emptyTitle: {
    fontSize: 18, fontFamily: "Inter_700Bold",
  },
  emptySub: {
    fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20,
  },
});
