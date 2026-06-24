import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/lib/api";
import GolfBallLoader from "@/components/GolfBallLoader";

const GOLD = "#c8a84b";

type ScorecardHole = {
  number: number;
  par: number;
  stroke_index: number;
};

type SavedHole = {
  hole_number: number;
  gross_score: number | null;
  is_nr: number;
};

type RoundDetail = {
  id: number;
  club_name: string;
  format: string;
  tournament_id: number | null;
  tournament_name: string | null;
  status: string;
  score_submitted: number;
  holes_played: number;
  total_gross: number | null;
  scorecard: ScorecardHole[];
  holes: Record<number, SavedHole>;
  marker_submitted_at?: string | null;
};

export default function MarkCardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const token = user?.token;
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [round, setRound] = useState<RoundDetail | null>(null);
  const [playerName, setPlayerName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ verified: boolean; mismatches: any[] } | null>(null);

  // Marker's entry for each hole: keyed by hole number string → gross score string
  const [scores, setScores] = useState<Record<string, string>>({});
  const inputRefs = useRef<Record<string, TextInput | null>>({});

  const loadRound = useCallback(async () => {
    if (!token || !id) return;
    try {
      // Fetch round (player's round)
      const data = await apiFetch(`/scoring/rounds/${id}`, token);
      setRound(data);
      // Pre-fill with player's submitted gross scores so marker can confirm or change
      const prefill: Record<string, string> = {};
      for (const h of data.scorecard ?? []) {
        const saved = data.holes?.[h.number];
        if (saved && !saved.is_nr && saved.gross_score != null) {
          prefill[String(h.number)] = String(saved.gross_score);
        } else {
          prefill[String(h.number)] = "";
        }
      }
      setScores(prefill);

      // Load player name from pending marks endpoint
      const pendingRes = await apiFetch("/scoring/pending-marks", token);
      const match = (pendingRes.marks ?? []).find((m: any) => m.id === parseInt(id));
      if (match) setPlayerName(match.player_name ?? "Player");
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to load round");
    } finally {
      setLoading(false);
    }
  }, [token, id]);

  useEffect(() => { loadRound(); }, [loadRound]);

  const sc = round?.scorecard ?? [];
  const front9 = sc.filter(h => h.number <= 9);
  const back9 = sc.filter(h => h.number > 9);

  const totalGross = sc.reduce((sum, h) => {
    const v = parseInt(scores[String(h.number)] ?? "");
    return isNaN(v) ? sum : sum + v;
  }, 0);

  const allFilled = sc.every(h => {
    const v = scores[String(h.number)];
    return v !== undefined && v !== "" && !isNaN(parseInt(v));
  });

  const setScore = (hole: number, val: string) => {
    // Allow only digits
    const clean = val.replace(/[^0-9]/g, "");
    setScores(prev => ({ ...prev, [String(hole)]: clean }));
  };

  const handleSubmit = async () => {
    if (!allFilled) {
      Alert.alert("Incomplete", "Please enter a score for every hole before submitting.");
      return;
    }
    setSubmitting(true);
    try {
      const holeScores: Record<string, number> = {};
      for (const h of sc) {
        holeScores[String(h.number)] = parseInt(scores[String(h.number)]);
      }
      const res = await apiFetch(`/scoring/rounds/${id}/marker-scores`, token, {
        method: "POST",
        body: JSON.stringify({ holeScores }),
      });
      setDone({ verified: res.verified, mismatches: res.mismatches ?? [] });
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to submit marker scores");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !round) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}>
        <GolfBallLoader size={60} />
      </View>
    );
  }

  // ── Result screen ──────────────────────────────────────────────────────────
  if (done) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={[styles.header, { backgroundColor: colors.primary, paddingTop: insets.top + 8 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Card Submitted</Text>
            <Text style={styles.headerSub}>{round.tournament_name ?? round.club_name}</Text>
          </View>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
          {done.verified ? (
            <View style={[styles.resultCard, { backgroundColor: "#16a34a22", borderColor: "#16a34a60" }]}>
              <Ionicons name="checkmark-circle" size={36} color="#16a34a" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.resultTitle, { color: "#16a34a" }]}>Score Verified ✓</Text>
                <Text style={[styles.resultDetail, { color: colors.mutedForeground }]}>
                  Your scores match {playerName}'s submission. The round is now verified.
                </Text>
              </View>
            </View>
          ) : (
            <View style={[styles.resultCard, { backgroundColor: "#f59e0b22", borderColor: "#f59e0b60" }]}>
              <Ionicons name="warning" size={36} color="#f59e0b" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.resultTitle, { color: "#f59e0b" }]}>Score Disputed</Text>
                <Text style={[styles.resultDetail, { color: colors.mutedForeground }]}>
                  {done.mismatches.length} hole{done.mismatches.length !== 1 ? "s" : ""} differ from {playerName}'s card.
                  The club has been notified and will adjudicate.
                </Text>
              </View>
            </View>
          )}

          {done.mismatches.length > 0 && (
            <View style={[styles.mismatchCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.mismatchTitle, { color: colors.foreground }]}>Differences</Text>
              {done.mismatches.map(m => (
                <View key={m.hole} style={[styles.mismatchRow, { borderTopColor: colors.border }]}>
                  <Text style={[styles.mismatchHole, { color: colors.mutedForeground }]}>Hole {m.hole}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <View style={{ alignItems: "center" }}>
                      <Text style={[styles.mismatchScore, { color: colors.primary }]}>{m.playerScore}</Text>
                      <Text style={[styles.mismatchLabel, { color: colors.mutedForeground }]}>{playerName}</Text>
                    </View>
                    <Ionicons name="swap-horizontal" size={14} color={colors.mutedForeground} />
                    <View style={{ alignItems: "center" }}>
                      <Text style={[styles.mismatchScore, { color: GOLD }]}>{m.markerScore}</Text>
                      <Text style={[styles.mismatchLabel, { color: colors.mutedForeground }]}>You</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 16, borderTopColor: colors.border }]}>
          <TouchableOpacity
            onPress={() => router.replace("/(tabs)/scoring")}
            style={[styles.footerBtn, { backgroundColor: colors.primary }]}
          >
            <Ionicons name="golf" size={18} color="#fff" />
            <Text style={[styles.footerBtnText, { color: "#fff" }]}>Back to Scoring</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Entry screen ───────────────────────────────────────────────────────────
  const HoleRow = ({ h }: { h: ScorecardHole }) => {
    const val = scores[String(h.number)] ?? "";
    const gross = parseInt(val);
    const diff = isNaN(gross) ? null : gross - h.par;
    let diffColor = colors.foreground;
    if (diff !== null) {
      if (diff <= -2) diffColor = "#7c3aed";
      else if (diff === -1) diffColor = "#16a34a";
      else if (diff === 0) diffColor = GOLD;
      else if (diff === 1) diffColor = "#f87171";
      else diffColor = "#dc2626";
    }
    return (
      <View style={[styles.holeRow, { borderBottomColor: colors.border }]}>
        <View style={styles.holeNumWrap}>
          <Text style={[styles.holeNum, { color: colors.mutedForeground }]}>{h.number}</Text>
          <Text style={[styles.holePar, { color: colors.mutedForeground }]}>P{h.par}</Text>
        </View>
        <TextInput
          ref={r => { inputRefs.current[String(h.number)] = r; }}
          style={[styles.scoreInput, {
            backgroundColor: colors.card,
            borderColor: val ? diffColor + "66" : colors.border,
            color: val ? diffColor : colors.foreground,
          }]}
          value={val}
          onChangeText={v => setScore(h.number, v)}
          keyboardType="numeric"
          maxLength={2}
          placeholder="—"
          placeholderTextColor={colors.mutedForeground}
          returnKeyType="next"
          onSubmitEditing={() => {
            const next = sc[sc.indexOf(h) + 1];
            if (next) inputRefs.current[String(next.number)]?.focus();
          }}
          selectTextOnFocus
        />
        {val !== "" && !isNaN(gross) && (
          <View style={[styles.diffBadge, { backgroundColor: diffColor + "22" }]}>
            <Text style={[styles.diffText, { color: diffColor }]}>
              {diff === 0 ? "E" : diff! > 0 ? `+${diff}` : `${diff}`}
            </Text>
          </View>
        )}
      </View>
    );
  };

  const NineTotal = ({ holes }: { holes: ScorecardHole[] }) => {
    const total = holes.reduce((sum, h) => {
      const v = parseInt(scores[String(h.number)] ?? "");
      return isNaN(v) ? sum : sum + v;
    }, 0);
    const par = holes.reduce((s, h) => s + h.par, 0);
    const filled = holes.filter(h => scores[String(h.number)] !== "" && !isNaN(parseInt(scores[String(h.number)] ?? ""))).length;
    return (
      <View style={[styles.nineTotal, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "30" }]}>
        <Text style={[styles.nineTotalLabel, { color: colors.mutedForeground }]}>
          {holes[0].number <= 9 ? "Front 9" : "Back 9"} · Par {par}
        </Text>
        <Text style={[styles.nineTotalVal, { color: filled === holes.length ? colors.primary : colors.mutedForeground }]}>
          {filled === holes.length ? total : `${filled}/9`}
        </Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.primary, paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Mark {playerName ? `${playerName}'s` : "Partner's"} Card</Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {round.tournament_name ?? round.club_name}
          </Text>
        </View>
      </View>

      {/* Info banner */}
      <View style={[styles.infoBanner, { backgroundColor: GOLD + "18", borderBottomColor: GOLD + "40" }]}>
        <Ionicons name="information-circle-outline" size={15} color={GOLD} />
        <Text style={[styles.infoText, { color: GOLD }]}>
          Enter the scores as you recorded them. Pre-filled from {playerName ? `${playerName}'s` : "the player's"} submission — change any you disagree with.
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Front 9 */}
        {front9.length > 0 && (
          <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
            <View style={[styles.sectionHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>FRONT 9</Text>
            </View>
            {front9.map(h => <HoleRow key={h.number} h={h} />)}
            <NineTotal holes={front9} />
          </View>
        )}

        {/* Back 9 */}
        {back9.length > 0 && (
          <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
            <View style={[styles.sectionHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>BACK 9</Text>
            </View>
            {back9.map(h => <HoleRow key={h.number} h={h} />)}
            <NineTotal holes={back9} />
          </View>
        )}

        {/* Grand total */}
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          <View style={[styles.grandTotal, { backgroundColor: colors.primary, borderColor: colors.primary }]}>
            <Text style={styles.grandTotalLabel}>TOTAL GROSS</Text>
            <Text style={styles.grandTotalVal}>
              {allFilled ? totalGross : "—"}
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16, borderTopColor: colors.border, backgroundColor: colors.background }]}>
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={submitting || !allFilled}
          style={[styles.footerBtn, {
            backgroundColor: allFilled ? colors.primary : colors.muted,
            opacity: submitting ? 0.7 : 1,
          }]}
        >
          {submitting
            ? <ActivityIndicator color="#fff" size="small" />
            : <Ionicons name="checkmark-done" size={18} color={allFilled ? "#fff" : colors.mutedForeground} />}
          <Text style={[styles.footerBtnText, { color: allFilled ? "#fff" : colors.mutedForeground }]}>
            {submitting ? "Submitting…" : "Submit Marker's Card"}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingBottom: 16,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.75)", marginTop: 1 },
  infoBanner: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1,
  },
  infoText: { flex: 1, fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 16 },
  sectionHeader: { borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 6, marginBottom: 4 },
  sectionLabel: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.8 },
  holeRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  holeNumWrap: { width: 42, alignItems: "center" },
  holeNum: { fontSize: 15, fontFamily: "Inter_700Bold" },
  holePar: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 1 },
  scoreInput: {
    flex: 1, height: 44, borderRadius: 12, borderWidth: 1.5,
    textAlign: "center", fontSize: 20, fontFamily: "Inter_700Bold",
  },
  diffBadge: { width: 40, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  diffText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  nineTotal: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    marginTop: 6, borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10,
  },
  nineTotalLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  nineTotalVal: { fontSize: 16, fontFamily: "Inter_700Bold" },
  grandTotal: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    borderRadius: 16, paddingHorizontal: 18, paddingVertical: 14, marginTop: 4,
  },
  grandTotalLabel: { fontSize: 13, fontFamily: "Inter_700Bold", color: "rgba(255,255,255,0.8)", letterSpacing: 0.5 },
  grandTotalVal: { fontSize: 28, fontFamily: "Inter_700Bold", color: "#fff" },
  footer: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  footerBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderRadius: 16, paddingVertical: 15,
  },
  footerBtnText: { fontSize: 15, fontFamily: "Inter_700Bold" },
  resultCard: {
    flexDirection: "row", alignItems: "flex-start", gap: 14,
    borderRadius: 16, borderWidth: 1.5, padding: 18,
  },
  resultTitle: { fontSize: 16, fontFamily: "Inter_700Bold", marginBottom: 6 },
  resultDetail: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  mismatchCard: {
    borderRadius: 14, borderWidth: 1, overflow: "hidden",
  },
  mismatchTitle: { fontSize: 13, fontFamily: "Inter_700Bold", padding: 14, paddingBottom: 10 },
  mismatchRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth,
  },
  mismatchHole: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  mismatchScore: { fontSize: 16, fontFamily: "Inter_700Bold" },
  mismatchLabel: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 2 },
});
