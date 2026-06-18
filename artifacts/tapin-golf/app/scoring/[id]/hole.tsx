import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";

// ─── Constants ────────────────────────────────────────────────────────────────
const DARK_BG   = "#0d1f14";
const SURFACE   = "#162a1e";
const BORDER    = "#1f3826";
const GREEN     = "#1a5c38";
const GOLD      = "#c8a84b";
const MUTED_FG  = "#4a6550";

// ─── Types ────────────────────────────────────────────────────────────────────
type ScorecardHole = {
  number: number;
  par: number;
  stroke_index: number;
  distance_m?: number;
};

type SavedHole = {
  hole_number: number;
  gross_score: number | null;
  net_score: number | null;
  stableford_points: number | null;
  is_nr: number;
};

type Round = {
  id: number;
  club_name: string;
  format: string;
  playing_handicap: number;
  status: string;
  scorecard: ScorecardHole[];
  holes: Record<number, SavedHole>;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getHA(si: number, ph: number): number {
  if (ph <= 0) return 0;
  if (ph <= 18) return si <= ph ? 1 : 0;
  return 1 + (si <= ph - 18 ? 1 : 0);
}
function calcPoints(gross: number, par: number, ha: number): number {
  return Math.max(0, par + 2 - (gross - ha));
}
function scoreName(gross: number, par: number): string {
  const d = gross - par;
  if (d <= -3) return "Albatross";
  if (d === -2) return "Eagle";
  if (d === -1) return "Birdie";
  if (d === 0) return "Par";
  if (d === 1) return "Bogey";
  if (d === 2) return "Double Bogey";
  if (d === 3) return "Triple Bogey";
  return `+${d}`;
}
function scoreColor(gross: number, par: number): string {
  const d = gross - par;
  if (d <= -2) return GOLD;
  if (d === -1) return "#22c55e";
  if (d === 0) return "#a3e4bc";
  if (d === 1) return "#fb923c";
  return "#f87171";
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function HoleEntryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const token = user?.token;
  const insets = useSafeAreaInsets();

  const [round, setRound] = useState<Round | null>(null);
  const [loading, setLoading] = useState(true);
  const [holeIdx, setHoleIdx] = useState(0);
  const [gross, setGross] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const holeStripRef = useRef<ScrollView>(null);

  const loadRound = useCallback(async () => {
    if (!token || !id) return;
    try {
      const data = await apiFetch(`/scoring/rounds/${id}`, token);
      setRound(data);
      // Start at first unscored hole
      const scorecard: ScorecardHole[] = data.scorecard ?? [];
      const holes: Record<number, SavedHole> = data.holes ?? {};
      const firstUnsaved = scorecard.findIndex((h: ScorecardHole) => !holes[h.number]);
      const startIdx = firstUnsaved >= 0 ? firstUnsaved : scorecard.length - 1;
      setHoleIdx(startIdx);
      setGross(holes[scorecard[startIdx]?.number]?.gross_score ?? null);
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to load round");
    } finally {
      setLoading(false);
    }
  }, [token, id]);

  useEffect(() => { loadRound(); }, [loadRound]);

  if (loading || !round) {
    return (
      <View style={{ flex: 1, backgroundColor: DARK_BG, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={GOLD} size="large" />
      </View>
    );
  }

  const scorecard = round.scorecard;
  const hole = scorecard[holeIdx];
  if (!hole) return null;

  const ph = round.playing_handicap;
  const ha = getHA(hole.stroke_index, ph);
  const pts = gross != null ? calcPoints(gross, hole.par, ha) : null;
  const netScore = gross != null ? gross - ha : null;

  const totalPts = scorecard.reduce((sum, h) => {
    const saved = round.holes[h.number];
    if (saved && saved.gross_score != null && !saved.is_nr) {
      return sum + (saved.stableford_points ?? 0);
    }
    return sum;
  }, 0);

  const goToHole = (idx: number) => {
    setHoleIdx(idx);
    setGross(round.holes[scorecard[idx].number]?.gross_score ?? null);
    holeStripRef.current?.scrollTo({ x: Math.max(0, (idx - 3) * 42), animated: true });
  };

  const saveAndNext = async (isNr = false) => {
    if (!isNr && gross == null) return;
    setSaving(true);
    try {
      await apiFetch(`/scoring/rounds/${id}/holes/${hole.number}`, token, {
        method: "PUT",
        body: JSON.stringify({
          par: hole.par,
          strokeIndex: hole.stroke_index,
          grossScore: isNr ? null : gross,
          isNr,
        }),
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      // Update local state
      const updatedHoles = { ...round.holes };
      updatedHoles[hole.number] = {
        hole_number: hole.number,
        gross_score: isNr ? null : gross,
        net_score: isNr ? null : netScore,
        stableford_points: isNr ? null : pts,
        is_nr: isNr ? 1 : 0,
      };
      setRound({ ...round, holes: updatedHoles });

      if (holeIdx < scorecard.length - 1) {
        goToHole(holeIdx + 1);
      } else {
        // Last hole saved → go to complete screen to review + finish
        router.replace(`/scoring/${id}/complete`);
      }
    } catch (err: any) {
      // If the round is already complete, navigate to the scorecard instead of showing an error
      if (err?.message?.includes("404") || err?.status === 404 || err?.message?.includes("not found")) {
        router.replace(`/scoring/${id}/complete`);
      } else {
        Alert.alert("Error", err.message || "Failed to save score");
      }
    } finally {
      setSaving(false);
    }
  };

  const confirmAndFinish = () => {
    router.replace(`/scoring/${id}/complete`);
  };

  const isLastHole = holeIdx === scorecard.length - 1;

  return (
    <View style={{ flex: 1, backgroundColor: DARK_BG }}>
      {/* Status bar spacer */}
      <View style={{ height: insets.top }} />

      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.topBarClub} numberOfLines={1}>{round.club_name}</Text>
        <TouchableOpacity
          onPress={confirmAndFinish}
          style={[styles.topActionBtn, { borderColor: "#f87171" + "55" }]}
        >
          <Ionicons name="flag" size={13} color="#f87171" />
          <Text style={[styles.topActionText, { color: "#f87171" }]}>End Round</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.push(`/scoring/${id}/complete`)}
          style={[styles.topActionBtn, { borderColor: GOLD + "55" }]}
        >
          <Ionicons name="list" size={13} color={GOLD} />
          <Text style={[styles.topActionText, { color: GOLD }]}>Scorecard</Text>
        </TouchableOpacity>
      </View>

      {/* Hole strip */}
      <ScrollView
        ref={holeStripRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.holeStrip}
      >
        {scorecard.map((h, i) => {
          const saved = round.holes[h.number];
          const active = i === holeIdx;
          const played = saved != null;
          const p = played && !saved.is_nr ? (saved.stableford_points ?? 0) : null;
          const dotBg = active ? "#fff"
            : played ? (p == null ? "#f87171" : p >= 3 ? "#22c55e" : p >= 2 ? GOLD : p >= 1 ? "#fb923c" : "#f87171")
            : SURFACE;
          return (
            <TouchableOpacity key={h.number} onPress={() => goToHole(i)} style={[styles.holeChip, { backgroundColor: dotBg, borderColor: active ? "#fff" : BORDER, height: active ? 36 : 28 }]}>
              <Text style={{ fontSize: active ? 12 : 10, fontFamily: "Inter_700Bold", color: active ? DARK_BG : played ? "#fff" : MUTED_FG }}>
                {h.number}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <Text style={styles.stripMeta}>
        {scorecard.filter(h => round.holes[h.number] != null).length} / {scorecard.length} scored · {totalPts} pts total
      </Text>

      {/* Hole identity */}
      <View style={styles.holeHeader}>
        <Text style={styles.nowScoringLabel}>NOW SCORING</Text>
        <Text style={styles.holeName}>HOLE {hole.number}</Text>
        <View style={styles.hcpChip}>
          <Text style={styles.hcpChipText}>Playing HCP {ph}</Text>
        </View>
        {/* Stats row */}
        <View style={styles.statsRow}>
          {[
            { label: "PAR",          value: String(hole.par),          accent: true },
            { label: "STROKE INDEX", value: String(hole.stroke_index), accent: false },
            { label: "DISTANCE",     value: hole.distance_m ? `${hole.distance_m}m` : "—", accent: false },
            { label: "STROKES",      value: ha > 0 ? `+${ha}` : "0", accent: ha > 0 },
          ].map(s => (
            <View key={s.label} style={[styles.statCard, { backgroundColor: s.accent ? GOLD + "22" : SURFACE, borderColor: s.accent ? GOLD + "60" : BORDER }]}>
              <Text style={[styles.statValue, { color: s.accent ? GOLD : "#fff" }]}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Score stepper */}
      <View style={styles.stepperSection}>
        {/* Score name badge */}
        <View style={{ height: 32, alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
          {gross != null && (
            <View style={[styles.scoreBadge, { backgroundColor: scoreColor(gross, hole.par) + "22", borderColor: scoreColor(gross, hole.par) + "60" }]}>
              <Text style={[styles.scoreBadgeText, { color: scoreColor(gross, hole.par) }]}>
                {scoreName(gross, hole.par)}
              </Text>
            </View>
          )}
        </View>

        {/* +/− stepper */}
        <View style={styles.stepper}>
          <TouchableOpacity
            onPress={() => { Haptics.selectionAsync(); setGross(v => v == null ? hole.par + 1 : Math.max(1, v - 1)); }}
            style={[styles.stepBtn, styles.stepBtnMinus, { borderColor: gross != null && gross > 1 ? "#f87171" : BORDER }]}
          >
            <Text style={[styles.stepBtnText, { color: gross != null && gross > 1 ? "#f87171" : MUTED_FG }]}>−</Text>
          </TouchableOpacity>

          <View style={styles.scoreDisplay}>
            {gross != null ? (
              <>
                <Text style={[styles.scoreValue, { color: scoreColor(gross, hole.par) }]}>{gross}</Text>
                <Text style={styles.scoreNet}>Net {gross - ha} · {pts}pts</Text>
              </>
            ) : (
              <Text style={[styles.scoreValue, { color: SURFACE }]}>—</Text>
            )}
          </View>

          <TouchableOpacity
            onPress={() => { Haptics.selectionAsync(); setGross(v => v == null ? hole.par + 1 : Math.min(15, v + 1)); }}
            style={[styles.stepBtn, styles.stepBtnPlus, { borderColor: GREEN }]}
          >
            <Text style={[styles.stepBtnText, { color: "#22c55e" }]}>+</Text>
          </TouchableOpacity>
        </View>

        {/* Quick-tap row — scrollable */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickRow}
        >
          {[-3, -2, -1, 0, 1, 2, 3, 4, 5].map(offset => {
            const val = hole.par + offset;
            const active = gross === val;
            const qColor = val < hole.par ? "#22c55e" : val === hole.par ? GOLD : val === hole.par + 1 ? "#fb923c" : "#f87171";
            const labelMap: Record<number, string> = { [-3]: "Albatross", [-2]: "Eagle", [-1]: "Birdie", [0]: "Par", [1]: "Bogey", [2]: "Double", [3]: "+3", [4]: "+4", [5]: "+5" };
            return (
              <TouchableOpacity
                key={offset}
                onPress={() => { Haptics.selectionAsync(); setGross(val); }}
                style={[styles.quickBtn, { backgroundColor: active ? qColor + "33" : SURFACE, borderColor: active ? qColor : BORDER }]}
              >
                <Text style={[styles.quickBtnScore, { color: active ? qColor : "#fff" }]}>{val}</Text>
                <Text style={[styles.quickBtnLabel, { color: active ? qColor : MUTED_FG }]}>{labelMap[offset]}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Points summary */}
      {pts != null && (
        <View style={styles.ptsSummary}>
          <Text style={styles.ptsSummaryLabel}>Stableford Points</Text>
          <Text style={[styles.ptsSummaryValue, { color: pts >= 3 ? "#22c55e" : pts >= 2 ? GOLD : pts >= 1 ? "#fb923c" : "#f87171" }]}>{pts}</Text>
        </View>
      )}

      {/* Action buttons */}
      <View style={[styles.actions, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          onPress={() => saveAndNext(true)}
          disabled={saving}
          style={[styles.nrBtn, { borderColor: BORDER }]}
        >
          <Text style={[styles.nrBtnText, { color: MUTED_FG }]}>NR / Pickup</Text>
        </TouchableOpacity>
        {isLastHole ? (
          <TouchableOpacity
            onPress={() => gross != null ? saveAndNext(false) : confirmAndFinish()}
            disabled={saving}
            style={[styles.nextBtn, { backgroundColor: GREEN, opacity: saving ? 0.7 : 1 }]}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.nextBtnText}>Finish Round 🏁</Text>
            }
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={() => saveAndNext(false)}
            disabled={saving || gross == null}
            style={[styles.nextBtn, { backgroundColor: gross != null ? GREEN : SURFACE, opacity: saving ? 0.7 : 1 }]}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.nextBtnText}>Save · Next →</Text>
            }
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 8, gap: 10,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: SURFACE,
    alignItems: "center", justifyContent: "center",
  },
  topBarClub: {
    flex: 1, fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#a3e4bc", textAlign: "center",
  },
  cardBtn: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: SURFACE,
    alignItems: "center", justifyContent: "center",
  },
  topActionBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10,
    backgroundColor: SURFACE, borderWidth: 1,
  },
  topActionText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  holeStrip: {
    paddingHorizontal: 16, paddingBottom: 4, gap: 4, alignItems: "center",
  },
  holeChip: {
    width: 38, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center",
    marginRight: 4,
  },
  stripMeta: {
    textAlign: "center", fontSize: 11, color: MUTED_FG, fontFamily: "Inter_400Regular", marginBottom: 4,
  },
  holeHeader: {
    alignItems: "center", paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8,
  },
  nowScoringLabel: {
    fontSize: 10, fontFamily: "Inter_700Bold", color: GOLD, letterSpacing: 2,
  },
  holeName: {
    fontSize: 72, fontFamily: "Inter_700Bold", color: "#fff",
    lineHeight: 76, letterSpacing: -2,
  },
  hcpChip: {
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20,
    backgroundColor: GREEN + "66", borderWidth: 1, borderColor: GREEN,
    marginTop: -4, marginBottom: 6,
  },
  hcpChipText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#a3e4bc" },
  statsRow: {
    flexDirection: "row", gap: 8, marginTop: 4,
  },
  statCard: {
    flex: 1, borderRadius: 12, padding: 8, alignItems: "center", borderWidth: 1,
  },
  statValue: { fontSize: 16, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 8, fontFamily: "Inter_700Bold", color: MUTED_FG, letterSpacing: 0.5, marginTop: 2 },
  stepperSection: {
    paddingHorizontal: 20,
  },
  scoreBadge: {
    paddingHorizontal: 16, paddingVertical: 5, borderRadius: 20, borderWidth: 1.5,
  },
  scoreBadgeText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  stepper: {
    flexDirection: "row", alignItems: "center", gap: 0, justifyContent: "space-between",
  },
  stepBtn: {
    width: 64, height: 64, borderRadius: 32, borderWidth: 2,
    alignItems: "center", justifyContent: "center",
  },
  stepBtnMinus: { backgroundColor: "transparent" },
  stepBtnPlus: { backgroundColor: "#1a4028" },
  stepBtnText: { fontSize: 30, fontFamily: "Inter_400Regular", lineHeight: 36 },
  scoreDisplay: { flex: 1, alignItems: "center" },
  scoreValue: { fontSize: 84, fontFamily: "Inter_700Bold", lineHeight: 88, letterSpacing: -3 },
  scoreNet: { fontSize: 12, color: MUTED_FG, fontFamily: "Inter_400Regular", marginTop: -4 },
  quickRow: {
    flexDirection: "row", gap: 6, marginTop: 8, paddingHorizontal: 20, paddingBottom: 4,
  },
  quickBtn: {
    width: 68, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, alignItems: "center", gap: 2,
  },
  quickBtnScore: { fontSize: 16, fontFamily: "Inter_700Bold" },
  quickBtnLabel: { fontSize: 9, fontFamily: "Inter_600SemiBold" },
  ptsSummary: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, marginTop: 8,
  },
  ptsSummaryLabel: { fontSize: 12, color: MUTED_FG, fontFamily: "Inter_400Regular" },
  ptsSummaryValue: { fontSize: 22, fontFamily: "Inter_700Bold" },
  actions: {
    flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 12, marginTop: "auto",
  },
  nrBtn: {
    flex: 1, paddingVertical: 15, borderRadius: 16, borderWidth: 1.5, alignItems: "center",
  },
  nrBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  nextBtn: {
    flex: 3, paddingVertical: 15, borderRadius: 16, alignItems: "center",
  },
  nextBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
});
