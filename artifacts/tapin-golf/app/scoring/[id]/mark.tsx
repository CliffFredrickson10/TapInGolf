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
const GREEN_MATCH = "#16a34a";
const RED_MISMATCH = "#dc2626";

type ScorecardHole = { number: number; par: number; stroke_index: number };
type SavedHole = { hole_number: number; gross_score: number | null; is_nr: number };

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
  // Scores the marker captured for this player live during the round
  markerCapturedHoles?: Record<number, { gross_score: number | null; is_nr: number }>;
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ verified: boolean; mismatches: any[] } | null>(null);
  // Review step: shown when mismatches exist before final submit
  const [reviewing, setReviewing] = useState(false);

  // Marker's entry — keyed by hole number string → gross score string (blank until Megan types)
  const [scores, setScores] = useState<Record<string, string>>({});
  const inputRefs = useRef<Record<string, TextInput | null>>({});

  const loadRound = useCallback(async () => {
    if (!token || !id) return;
    try {
      const data = await apiFetch(`/scoring/rounds/${id}`, token);
      setRound(data);
      // Pre-fill from the scores the marker captured live during the round.
      // Falls back to blank for any hole not yet captured.
      const prefill: Record<string, string> = {};
      for (const h of data.scorecard ?? []) {
        const captured = data.markerCapturedHoles?.[h.number];
        if (captured && !captured.is_nr && captured.gross_score != null) {
          prefill[String(h.number)] = String(captured.gross_score);
        } else {
          prefill[String(h.number)] = "";
        }
      }
      setScores(prefill);

      const pendingRes = await apiFetch("/scoring/pending-marks", token);
      const match = (pendingRes.marks ?? []).find((m: any) => m.id === parseInt(id));
      if (match) setPlayerName(match.player_name ?? "Player");
    } catch (err: any) {
      setLoadError(err.message || "Failed to load round");
    } finally {
      setLoading(false);
    }
  }, [token, id]);

  useEffect(() => { loadRound(); }, [loadRound]);

  const sc = round?.scorecard ?? [];
  const front9 = sc.filter(h => h.number <= 9);
  const back9  = sc.filter(h => h.number > 9);

  // Player's submitted score per hole (read-only reference)
  // Use String(holeNum) to guarantee the key matches JSON-parsed string keys.
  const playerScore = (holeNum: number): number | null => {
    const holes = round?.holes ?? {};
    const saved = (holes as any)[String(holeNum)] ?? (holes as any)[holeNum];
    if (!saved || saved.is_nr || saved.gross_score == null) return null;
    return Number(saved.gross_score);
  };

  const allFilled = sc.every(h => {
    const v = scores[String(h.number)];
    return v !== undefined && v !== "" && !isNaN(parseInt(v));
  });

  const mismatches = sc.reduce<Array<{ hole: number; markerScore: number; playerScore: number }>>((acc, h) => {
    const v = parseInt(scores[String(h.number)] ?? "");
    const ps = playerScore(h.number);
    if (!isNaN(v) && ps !== null && v !== ps) acc.push({ hole: h.number, markerScore: v, playerScore: ps });
    return acc;
  }, []);

  const setScore = (hole: number, val: string) => {
    setScores(prev => ({ ...prev, [String(hole)]: val.replace(/[^0-9]/g, "") }));
  };

  // Tapping Submit — if mismatches exist, go to review step first
  const handleSubmitPress = () => {
    if (!allFilled) {
      Alert.alert("Incomplete", "Please enter a score for every hole before submitting.");
      return;
    }
    if (mismatches.length > 0) {
      setReviewing(true);
    } else {
      doSubmit();
    }
  };

  const doSubmit = async () => {
    setReviewing(false);
    setSubmitting(true);
    try {
      const holeScores: Record<string, number> = {};
      for (const h of sc) holeScores[String(h.number)] = parseInt(scores[String(h.number)]);
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

  // ── Loading / error ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}>
        <GolfBallLoader size={60} />
      </View>
    );
  }

  if (!round) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", padding: 32 }}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.mutedForeground} style={{ marginBottom: 12 }} />
        <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: colors.foreground, textAlign: "center", marginBottom: 8 }}>
          Card not found
        </Text>
        <Text style={{ fontSize: 13, color: colors.mutedForeground, textAlign: "center", marginBottom: 24 }}>
          {loadError ?? "This scorecard could not be loaded."}
        </Text>
        <TouchableOpacity onPress={() => router.back()} style={{ backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 }}>
          <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Done screen ─────────────────────────────────────────────────────────────
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
            <View style={[styles.resultCard, { backgroundColor: "#dc262622", borderColor: "#dc262660" }]}>
              <Ionicons name="warning" size={36} color="#dc2626" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.resultTitle, { color: "#dc2626" }]}>Score Disputed</Text>
                <Text style={[styles.resultDetail, { color: colors.mutedForeground }]}>
                  {done.mismatches.length} hole{done.mismatches.length !== 1 ? "s" : ""} differ from {playerName}'s card. The club has been notified and will adjudicate.
                </Text>
              </View>
            </View>
          )}

          {done.mismatches.length > 0 && (
            <View style={[styles.compareCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.compareHeader, { borderBottomColor: colors.border }]}>
                <Text style={[styles.compareHeaderCell, { color: colors.mutedForeground, flex: 0, width: 60 }]}>Hole</Text>
                <Text style={[styles.compareHeaderCell, { color: GOLD }]}>Your Score</Text>
                <Text style={[styles.compareHeaderCell, { color: colors.primary }]}>{playerName}'s Score</Text>
              </View>
              {done.mismatches.map(m => (
                <View key={m.hole} style={[styles.compareRow, { borderTopColor: colors.border }]}>
                  <Text style={[styles.compareHole, { color: colors.mutedForeground, width: 60 }]}>Hole {m.hole}</Text>
                  <Text style={[styles.compareScore, { color: GOLD }]}>{m.markerScore}</Text>
                  <Text style={[styles.compareScore, { color: colors.primary }]}>{m.playerScore}</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16, borderTopColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.replace("/(tabs)/scoring")} style={[styles.footerBtn, { backgroundColor: colors.primary }]}>
            <Ionicons name="golf" size={18} color="#fff" />
            <Text style={[styles.footerBtnText, { color: "#fff" }]}>Back to Scoring</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Review step — confirm mismatches before submitting ──────────────────────
  if (reviewing) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={[styles.header, { backgroundColor: colors.primary, paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={() => setReviewing(false)} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Review Differences</Text>
            <Text style={styles.headerSub}>{round.tournament_name ?? round.club_name}</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          <View style={{ backgroundColor: "#f59e0b18", borderRadius: 12, borderWidth: 1, borderColor: "#f59e0b40", padding: 14, flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
            <Ionicons name="warning-outline" size={18} color="#f59e0b" style={{ marginTop: 1 }} />
            <Text style={{ flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: colors.foreground, lineHeight: 18 }}>
              <Text style={{ fontFamily: "Inter_600SemiBold" }}>{mismatches.length} hole{mismatches.length !== 1 ? "s" : ""} differ</Text> between your card and {playerName}'s submission.{"\n"}
              Fix any data entry errors and re-submit, or submit your scores as-is to send a dispute to the club.
            </Text>
          </View>

          {/* Comparison table */}
          <View style={[styles.compareCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.compareHeader, { borderBottomColor: colors.border, backgroundColor: colors.primary + "12" }]}>
              <Text style={[styles.compareHeaderCell, { color: colors.mutedForeground, width: 60, flex: 0 }]}>Hole</Text>
              <Text style={[styles.compareHeaderCell, { color: GOLD }]}>Your Card</Text>
              <Text style={[styles.compareHeaderCell, { color: colors.primary }]}>{playerName}'s Card</Text>
              <Text style={[styles.compareHeaderCell, { color: colors.mutedForeground, width: 40, flex: 0 }]}>Diff</Text>
            </View>
            {mismatches.map(m => {
              const diff = m.markerScore - m.playerScore;
              return (
                <View key={m.hole} style={[styles.compareRow, { borderTopColor: colors.border, backgroundColor: "#dc262608" }]}>
                  <Text style={[styles.compareHole, { color: colors.mutedForeground, width: 60 }]}>Hole {m.hole}</Text>
                  <Text style={[styles.compareScore, { color: GOLD }]}>{m.markerScore}</Text>
                  <Text style={[styles.compareScore, { color: colors.primary }]}>{m.playerScore}</Text>
                  <Text style={[styles.compareScore, { color: RED_MISMATCH, width: 40 }]}>
                    {diff > 0 ? `+${diff}` : `${diff}`}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Also show matching holes as a summary */}
          <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center" }}>
            {sc.length - mismatches.length} of {sc.length} holes match {playerName}'s card.
          </Text>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 16, borderTopColor: colors.border, backgroundColor: colors.background, gap: 10 }]}>
          <TouchableOpacity onPress={() => setReviewing(false)} style={[styles.footerBtn, { backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border }]}>
            <Ionicons name="pencil" size={18} color={colors.foreground} />
            <Text style={[styles.footerBtnText, { color: colors.foreground }]}>Edit My Scores</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={doSubmit}
            disabled={submitting}
            style={[styles.footerBtn, { backgroundColor: RED_MISMATCH, opacity: submitting ? 0.7 : 1 }]}
          >
            {submitting
              ? <ActivityIndicator color="#fff" size="small" />
              : <Ionicons name="flag" size={18} color="#fff" />}
            <Text style={[styles.footerBtnText, { color: "#fff" }]}>
              {submitting ? "Submitting…" : `Submit & Dispute ${mismatches.length} Hole${mismatches.length !== 1 ? "s" : ""}`}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Entry screen ────────────────────────────────────────────────────────────
  const HoleRow = ({ h, ps }: { h: ScorecardHole; ps: number | null }) => {
    const myVal  = scores[String(h.number)] ?? "";
    const myNum  = parseInt(myVal);
    const filled = myVal !== "" && !isNaN(myNum);
    const matches = filled && ps !== null && myNum === ps;
    const differs = filled && ps !== null && myNum !== ps;

    return (
      <View style={[styles.holeRow, { borderBottomColor: colors.border, backgroundColor: differs ? "#dc262606" : "transparent" }]}>
        {/* Hole number + par */}
        <View style={styles.holeNumWrap}>
          <Text style={[styles.holeNum, { color: colors.mutedForeground }]}>{h.number}</Text>
          <Text style={[styles.holePar, { color: colors.mutedForeground }]}>P{h.par}</Text>
        </View>

        {/* Marker's input */}
        <TextInput
          ref={r => { inputRefs.current[String(h.number)] = r; }}
          style={[styles.scoreInput, {
            backgroundColor: colors.card,
            borderColor: differs ? RED_MISMATCH + "99" : matches ? GREEN_MATCH + "99" : colors.border,
            color: differs ? RED_MISMATCH : matches ? GREEN_MATCH : colors.foreground,
          }]}
          value={myVal}
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

        {/* Match / mismatch indicator */}
        <View style={[styles.matchIndicator, {
          backgroundColor: matches ? GREEN_MATCH + "18" : differs ? RED_MISMATCH + "18" : colors.muted + "40",
        }]}>
          {matches && <Ionicons name="checkmark" size={14} color={GREEN_MATCH} />}
          {differs && <Ionicons name="close" size={14} color={RED_MISMATCH} />}
          {!filled && <View style={{ width: 14 }} />}
        </View>

        {/* Player's submitted score — static badge */}
        <View style={[styles.playerScoreWrap, {
          backgroundColor: ps === null ? colors.muted + "30" : differs ? RED_MISMATCH : GREEN_MATCH,
          borderRadius: 10,
          height: 42,
          justifyContent: "center",
        }]}>
          <Text style={[styles.playerScoreVal, {
            color: ps === null ? colors.mutedForeground : "#fff",
            fontFamily: "Inter_700Bold",
            textAlign: "center",
          }]}>
            {ps != null ? String(ps) : "—"}
          </Text>
        </View>
      </View>
    );
  };

  const NineTotal = ({ holes }: { holes: ScorecardHole[] }) => {
    const myTotal = holes.reduce((sum, h) => {
      const v = parseInt(scores[String(h.number)] ?? "");
      return isNaN(v) ? sum : sum + v;
    }, 0);
    const playerTotal = holes.reduce((sum, h) => {
      const ps = playerScore(h.number);
      return ps !== null ? sum + ps : sum;
    }, 0);
    const par = holes.reduce((s, h) => s + h.par, 0);
    const filled = holes.filter(h => scores[String(h.number)] !== "" && !isNaN(parseInt(scores[String(h.number)] ?? ""))).length;
    const allFilled9 = filled === holes.length;
    const nineMatches = allFilled9 && myTotal === playerTotal;
    const nineDiffers = allFilled9 && myTotal !== playerTotal;

    return (
      <View style={[styles.nineTotal, {
        backgroundColor: nineDiffers ? RED_MISMATCH + "12" : nineMatches ? GREEN_MATCH + "12" : colors.primary + "12",
        borderColor: nineDiffers ? RED_MISMATCH + "40" : nineMatches ? GREEN_MATCH + "40" : colors.primary + "30",
      }]}>
        <Text style={[styles.nineTotalLabel, { color: colors.mutedForeground }]}>
          {holes[0].number <= 9 ? "Front 9" : "Back 9"} · Par {par}
        </Text>
        <View style={{ flexDirection: "row", gap: 16, alignItems: "center" }}>
          {allFilled9 && (
            <Text style={[styles.nineTotalVal, { color: colors.primary, fontSize: 13, fontFamily: "Inter_600SemiBold" }]}>
              {playerName.split(" ")[0]}: {playerTotal}
            </Text>
          )}
          <Text style={[styles.nineTotalVal, { color: nineDiffers ? RED_MISMATCH : nineMatches ? GREEN_MATCH : colors.mutedForeground }]}>
            {allFilled9 ? `You: ${myTotal}` : `${filled}/9`}
          </Text>
        </View>
      </View>
    );
  };

  const myTotal = sc.reduce((sum, h) => {
    const v = parseInt(scores[String(h.number)] ?? "");
    return isNaN(v) ? sum : sum + v;
  }, 0);
  const playerTotal = round.total_gross ?? 0;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.primary, paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Mark {playerName ? `${playerName}'s` : "Partner's"} Card</Text>
          <Text style={styles.headerSub} numberOfLines={1}>{round.tournament_name ?? round.club_name}</Text>
        </View>
      </View>

      {/* Column header */}
      <View style={[styles.colHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={styles.holeNumWrap}>
          <Text style={[styles.colLabel, { color: colors.mutedForeground }]}>Hole</Text>
        </View>
        <Text style={[styles.colLabel, { flex: 1, textAlign: "center", color: GOLD }]}>
          Your Score for {playerName.split(" ")[0]}
        </Text>
        <View style={styles.matchIndicator} />
        <View style={styles.playerScoreWrap}>
          <Text style={[styles.colLabel, { textAlign: "center", color: colors.primary }]}>{playerName.split(" ")[0]}'s Score</Text>
        </View>
      </View>

      {/* Info banner — pre-populated explanation */}
      <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 }}>
        <View style={[styles.infoBanner, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="information-circle-outline" size={16} color={GOLD} style={{ marginTop: 1, flexShrink: 0 }} />
          <Text style={[styles.infoBannerText, { color: colors.mutedForeground }]}>
            Pre-filled from your scorecard. Correct any errors, then submit — differences will be sent to the club.
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        {front9.length > 0 && (
          <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
            <View style={[styles.sectionHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>FRONT 9</Text>
            </View>
            {front9.map(h => <HoleRow key={h.number} h={h} ps={playerScore(h.number)} />)}
            <NineTotal holes={front9} />
          </View>
        )}
        {back9.length > 0 && (
          <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
            <View style={[styles.sectionHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>BACK 9</Text>
            </View>
            {back9.map(h => <HoleRow key={h.number} h={h} ps={playerScore(h.number)} />)}
            <NineTotal holes={back9} />
          </View>
        )}

        {allFilled && (
          <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
            <View style={[styles.grandTotal, {
              backgroundColor: mismatches.length === 0 ? GREEN_MATCH : RED_MISMATCH,
              borderColor: mismatches.length === 0 ? GREEN_MATCH : RED_MISMATCH,
            }]}>
              <View>
                <Text style={styles.grandTotalLabel}>YOUR TOTAL</Text>
                <Text style={[styles.grandTotalLabel, { fontSize: 10, opacity: 0.7 }]}>
                  {playerName.split(" ")[0]}'s total: {playerTotal}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.grandTotalVal}>{myTotal}</Text>
                {mismatches.length > 0 && (
                  <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 11, fontFamily: "Inter_600SemiBold" }}>
                    {mismatches.length} hole{mismatches.length !== 1 ? "s" : ""} differ
                  </Text>
                )}
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16, borderTopColor: colors.border, backgroundColor: colors.background }]}>
        <TouchableOpacity
          onPress={handleSubmitPress}
          disabled={submitting || !allFilled}
          style={[styles.footerBtn, {
            backgroundColor: !allFilled ? colors.muted : mismatches.length > 0 ? RED_MISMATCH : GREEN_MATCH,
            opacity: submitting ? 0.7 : 1,
          }]}
        >
          {submitting
            ? <ActivityIndicator color="#fff" size="small" />
            : <Ionicons
                name={!allFilled ? "checkmark-done" : mismatches.length > 0 ? "warning" : "checkmark-circle"}
                size={18}
                color={!allFilled ? colors.mutedForeground : "#fff"}
              />}
          <Text style={[styles.footerBtnText, { color: !allFilled ? colors.mutedForeground : "#fff" }]}>
            {submitting
              ? "Submitting…"
              : !allFilled
              ? "Complete Missing Holes"
              : mismatches.length > 0
              ? `Review ${mismatches.length} Difference${mismatches.length !== 1 ? "s" : ""}`
              : "Submit — All Scores Match ✓"}
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
  colHeader: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  colLabel: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  sectionHeader: { borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 6, marginBottom: 4 },
  sectionLabel: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.8 },
  holeRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  holeNumWrap: { width: 38, alignItems: "center" },
  holeNum: { fontSize: 14, fontFamily: "Inter_700Bold" },
  holePar: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 1 },
  scoreInput: {
    flex: 1, minWidth: 0, height: 42, borderRadius: 10, borderWidth: 1.5,
    textAlign: "center", fontSize: 20, fontFamily: "Inter_700Bold",
  },
  matchIndicator: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: "center", justifyContent: "center",
  },
  playerScoreWrap: { width: 58, flexShrink: 0, alignItems: "center" },
  playerScoreLabel: { fontSize: 9, fontFamily: "Inter_400Regular" },
  playerScoreVal: { fontSize: 18, marginTop: 1 },
  nineTotal: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    marginTop: 6, borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10,
  },
  nineTotalLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  nineTotalVal: { fontSize: 15, fontFamily: "Inter_700Bold" },
  grandTotal: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    borderRadius: 16, paddingHorizontal: 18, paddingVertical: 14, marginTop: 4,
  },
  grandTotalLabel: { fontSize: 12, fontFamily: "Inter_700Bold", color: "rgba(255,255,255,0.85)", letterSpacing: 0.5 },
  grandTotalVal: { fontSize: 28, fontFamily: "Inter_700Bold", color: "#fff" },
  footer: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  footerBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderRadius: 16, paddingVertical: 15,
  },
  footerBtnText: { fontSize: 15, fontFamily: "Inter_700Bold" },
  infoBanner: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 9,
  },
  infoBannerText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  resultCard: {
    flexDirection: "row", alignItems: "flex-start", gap: 14,
    borderRadius: 16, borderWidth: 1.5, padding: 18,
  },
  resultTitle: { fontSize: 16, fontFamily: "Inter_700Bold", marginBottom: 6 },
  resultDetail: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  compareCard: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  compareHeader: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  compareHeaderCell: { flex: 1, fontSize: 11, fontFamily: "Inter_700Bold", textAlign: "center" },
  compareRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  compareHole: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  compareScore: { flex: 1, fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
});
