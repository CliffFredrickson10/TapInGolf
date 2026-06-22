import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/lib/api";
import GolfBallLoader from "@/components/GolfBallLoader";

type ScorecardHole = { number: number; par: number; stroke_index: number; distance_m?: number };
type SavedHole = {
  hole_number: number; gross_score: number | null; net_score: number | null;
  stableford_points: number | null; is_nr: number;
};
type Round = {
  id: number; club_name: string; format: string; tee_color: string;
  course_handicap: number; playing_handicap: number; allowance_pct: number;
  status: string; holes_played: number;
  total_gross: number | null; total_net: number | null; total_points: number | null;
  started_at: string; completed_at: string | null;
  tournament_id: number | null; tournament_name: string | null;
  score_submitted: number;
  scorecard: ScorecardHole[];
  holes: Record<number, SavedHole>;
  opponent_name?: string | null;
  opponent_playing_hcp?: number;
  partner_name?: string | null;
  partner_playing_hcp?: number;
  opponent2_name?: string | null;
  opponent2_playing_hcp?: number;
  match_id?: number | null;
  match_result?: string | null;
  match_status?: string | null;
  match_dispute?: boolean;
  match_winner_id?: number | null;
  playerHoles?: Record<string, { gross_score: number | null; is_nr: number }>;
};

const FORMAT_LABELS: Record<string, string> = {
  individual_stableford: "Individual Stableford",
  gross_stroke_play: "Gross Stroke Play",
  net_stroke_play: "Net Stroke Play",
  fourball_stableford: "Betterball Stableford",
  fourball_gross_betterball: "Four-Ball Gross Betterball",
  american_scramble: "American Scramble",
};

function getHA(si: number, ph: number) { if (ph<=0) return 0; if (ph<=18) return si<=ph?1:0; return 1+(si<=ph-18?1:0); }
function calcPts(gross: number, par: number, ha: number) { return Math.max(0,par+2-(gross-ha)); }

function buildMatchLabel(holesUp: number, holesPlayed: number, holesRemaining: number, won: number, lost: number, halved: number) {
  if (holesPlayed === 0) return { label: "No scores recorded", color: "#a3e4bc" };
  if (holesUp > holesRemaining) return { label: `Won ${holesUp}&${holesRemaining}`, color: "#22c55e" };
  if (-holesUp > holesRemaining) return { label: `Lost ${-holesUp}&${holesRemaining}`, color: "#f87171" };
  if (holesUp === 0) return { label: "All Square", color: GOLD };
  if (holesUp > 0)  return { label: `${holesUp} UP`,   color: "#22c55e" };
  return                  { label: `${-holesUp} DOWN`, color: "#f87171" };
}

function calcMatchResult(
  sc: ScorecardHole[],
  myHoles: Record<number, SavedHole>,
  playerHoles: Record<string, { gross_score: number | null; is_nr: number }>,
  myHcp: number,
  oppHcp: number
) {
  let won = 0, lost = 0, halved = 0;
  for (const h of sc) {
    const mine = myHoles[h.number];
    const opp  = playerHoles[`0_${h.number}`];
    if (!mine || !opp || mine.is_nr || opp.is_nr || mine.gross_score == null || opp.gross_score == null) continue;
    const myNet  = mine.gross_score - getHA(h.stroke_index, myHcp);
    const oppNet = opp.gross_score  - getHA(h.stroke_index, oppHcp);
    if      (myNet < oppNet) won++;
    else if (myNet > oppNet) lost++;
    else                     halved++;
  }
  const holesPlayed    = won + lost + halved;
  const holesRemaining = sc.length - holesPlayed;
  const holesUp        = won - lost;
  return { holesUp, holesPlayed, holesRemaining, won, lost, halved, ...buildMatchLabel(holesUp, holesPlayed, holesRemaining, won, lost, halved) };
}

function calcBBMatchResult(
  sc: ScorecardHole[],
  myHoles: Record<number, SavedHole>,
  playerHoles: Record<string, { gross_score: number | null; is_nr: number }>,
  myHcp: number,
  oppHcp: number
) {
  let won = 0, lost = 0, halved = 0;
  for (const h of sc) {
    const mine    = myHoles[h.number];
    if (!mine || mine.is_nr || mine.gross_score == null) continue;
    const opp1 = playerHoles[`1_${h.number}`];
    const opp2 = playerHoles[`2_${h.number}`];
    if (!opp1 && !opp2) continue;
    const partner  = playerHoles[`0_${h.number}`];
    const ha       = getHA(h.stroke_index, myHcp);
    const oppHA    = getHA(h.stroke_index, oppHcp);
    const myNet    = mine.gross_score - ha;
    const partNet  = partner?.gross_score != null && !partner.is_nr ? partner.gross_score - ha : null;
    const teamBest = partNet != null ? Math.min(myNet, partNet) : myNet;
    const opp1Net  = opp1?.gross_score != null && !opp1.is_nr ? opp1.gross_score - oppHA : null;
    const opp2Net  = opp2?.gross_score != null && !opp2.is_nr ? opp2.gross_score - oppHA : null;
    const oppBest  = opp1Net != null && opp2Net != null ? Math.min(opp1Net, opp2Net) : (opp1Net ?? opp2Net);
    if (oppBest == null) continue;
    if      (teamBest < oppBest) won++;
    else if (teamBest > oppBest) lost++;
    else                         halved++;
  }
  const holesPlayed    = won + lost + halved;
  const holesRemaining = sc.length - holesPlayed;
  const holesUp        = won - lost;
  return { holesUp, holesPlayed, holesRemaining, won, lost, halved, ...buildMatchLabel(holesUp, holesPlayed, holesRemaining, won, lost, halved) };
}

function scoreLabel(d: number): string {
  if (d <= -3) return "ALB";
  if (d === -2) return "EGL";
  if (d === -1) return "BRD";
  if (d === 0) return "PAR";
  if (d === 1) return "BOG";
  if (d === 2) return "DBL";
  return `+${d}`;
}
function scoreStyle(d: number): { border?: string; background?: string; text: string } {
  if (d <= -2) return { border: "#fbbf24", text: "#fbbf24" };
  if (d === -1) return { border: "#22c55e", text: "#22c55e" };
  if (d === 0) return { text: "#a3e4bc" };
  if (d === 1) return { border: "#fb923c", text: "#fb923c" };
  return { border: "#f87171", text: "#f87171" };
}

export default function RoundCompleteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const token = user?.token;
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [round, setRound] = useState<Round | null>(null);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadRound = useCallback(async () => {
    if (!token || !id) return;
    try {
      const data = await apiFetch(`/scoring/rounds/${id}`, token);
      setRound(data);
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to load round");
    } finally { setLoading(false); }
  }, [token, id]);

  useEffect(() => { loadRound(); }, [loadRound]);

  const onComplete = async () => {
    if (!round || completing) return;
    setCompleting(true);
    try {
      await apiFetch(`/scoring/rounds/${id}/complete`, token, { method: "POST" });
      await loadRound();
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to complete round");
    } finally {
      setCompleting(false);
    }
  };

  const onSubmitToClub = async () => {
    if (!round || submitting) return;
    setSubmitting(true);
    try {
      await apiFetch(`/scoring/rounds/${id}/submit`, token, { method: "POST" });
      await loadRound();
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to submit score");
    } finally {
      setSubmitting(false);
    }
  };

  const onShare = async () => {
    if (!round) return;
    const pts = round.total_points ?? 0;
    const gross = round.total_gross ?? 0;
    const msg = `🏌️ I just played ${round.club_name} on TapIn Golf!\n${pts} Stableford pts · Gross ${gross} · ${round.holes_played} holes\n#TapInGolf`;
    try { await Share.share({ message: msg }); } catch {}
  };

  if (loading || !round) {
    const { width: sw, height: sh } = Dimensions.get("window");
    return (
      <View style={{ width: sw, height: sh, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}>
        <GolfBallLoader size={60} />
      </View>
    );
  }

  const sc = round.scorecard ?? [];
  const holes = round.holes ?? {};
  const isActive = round.status === "active";

  // Recompute totals from saved holes for display
  let totalGross = 0, totalNet = 0, totalPts = 0;
  sc.forEach(h => {
    const saved = holes[h.number];
    if (saved && !saved.is_nr && saved.gross_score != null) {
      totalGross += saved.gross_score;
      totalNet += saved.net_score ?? 0;
      totalPts += saved.stableford_points ?? 0;
    }
  });

  const holesScored = sc.filter(h => holes[h.number] != null).length;

  const isMatchPlay  = round.format === "singles_match_play";
  const isBetterball = round.format === "betterball_match_play";
  const isFourball   = ["betterball_match_play", "fourball_stableford", "fourball_gross_betterball"].includes(round.format);
  const isAnyMatch   = isMatchPlay || isBetterball;
  const matchResult  = isMatchPlay && round.playerHoles
    ? calcMatchResult(sc, holes, round.playerHoles, round.playing_handicap, round.opponent_playing_hcp ?? 0)
    : isBetterball && round.playerHoles
    ? calcBBMatchResult(sc, holes, round.playerHoles, round.playing_handicap, round.opponent_playing_hcp ?? 0)
    : null;

  // Verification status
  const matchConfirmed = round.match_status === "complete" && !round.match_dispute;
  const matchDisputed  = !!round.match_dispute;
  const matchPending   = isAnyMatch && round.match_id && !matchConfirmed && !matchDisputed;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.primary, paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{isActive ? "Scorecard" : "Round Complete 🏁"}</Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {round.club_name}
            {round.tournament_name ? ` · ${round.tournament_name}` : ""}
          </Text>
        </View>
        {!isActive && (
          <TouchableOpacity onPress={onShare} style={styles.shareBtn}>
            <Ionicons name="share-outline" size={20} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 100 }} showsVerticalScrollIndicator={false}>

        {/* Summary cards */}
        <View style={[styles.summaryRow, { backgroundColor: colors.primary + "08", borderBottomColor: colors.border }]}>
          {[
            { label: "Stableford", value: String(totalPts), unit: "pts", highlight: true },
            { label: "Gross", value: String(totalGross), unit: null, highlight: false },
            { label: "Net", value: String(totalNet), unit: null, highlight: false },
            { label: "Holes", value: String(holesScored), unit: `/ ${sc.length}`, highlight: false },
          ].map(s => (
            <View key={s.label} style={[styles.summaryCard, { borderColor: s.highlight ? colors.primary + "40" : colors.border, backgroundColor: s.highlight ? colors.primary + "12" : colors.card }]}>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 3 }}>
                <Text style={[styles.summaryValue, { color: s.highlight ? colors.primary : colors.foreground }]}>{s.value}</Text>
                {s.unit && <Text style={[styles.summaryUnit, { color: colors.mutedForeground }]}>{s.unit}</Text>}
              </View>
              <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Matchplay result card */}
        {isAnyMatch && matchResult && (
          <View style={[styles.matchCard, { backgroundColor: matchResult.color + "14", borderColor: matchResult.color + "55" }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.matchCardLabel, { color: matchResult.color }]}>{matchResult.label}</Text>
              <Text style={[styles.matchCardOpp, { color: colors.mutedForeground }]}>
                vs {round.opponent_name ?? "Opponent"}
                {isBetterball && round.partner_name ? ` · Partner: ${round.partner_name}` : ""}
              </Text>
              <Text style={[styles.matchCardDetail, { color: colors.mutedForeground }]}>
                {matchResult.won}W · {matchResult.lost}L · {matchResult.halved}H  ·  {matchResult.holesPlayed} holes scored
              </Text>
            </View>
            <Ionicons
              name={matchResult.holesUp > 0 ? "trophy" : matchResult.holesUp < 0 ? "close-circle" : "remove-circle"}
              size={36}
              color={matchResult.color}
            />
          </View>
        )}

        {/* Match verification status */}
        {isAnyMatch && round.match_id && !isActive && (
          <View style={[styles.verifyCard, {
            backgroundColor: matchDisputed ? "#fef2f2" : matchConfirmed ? "#f0faf4" : colors.card,
            borderColor:     matchDisputed ? "#ef444455" : matchConfirmed ? "#16a34a55" : colors.border,
          }]}>
            <Ionicons
              name={matchDisputed ? "warning" : matchConfirmed ? "checkmark-circle" : "time-outline"}
              size={20}
              color={matchDisputed ? "#ef4444" : matchConfirmed ? "#16a34a" : colors.mutedForeground}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.verifyTitle, {
                color: matchDisputed ? "#ef4444" : matchConfirmed ? "#16a34a" : colors.foreground,
              }]}>
                {matchDisputed
                  ? "Result Disputed"
                  : matchConfirmed
                  ? "Result Confirmed ✓"
                  : round.match_result
                  ? "Waiting for opponent to submit"
                  : "Score not yet submitted"}
              </Text>
              <Text style={[styles.verifyDetail, { color: colors.mutedForeground }]}>
                {matchDisputed
                  ? "The club will adjudicate — check the tournament bracket."
                  : matchConfirmed
                  ? "Both players agreed on the result."
                  : round.match_result
                  ? "Your result is recorded. Pending your opponent completing their round."
                  : "Finish your round to record the match result."}
              </Text>
            </View>
          </View>
        )}

        {/* Round info */}
        <View style={[styles.roundInfo, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {[
            { label: "Format", value: FORMAT_LABELS[round.format] ?? round.format },
            { label: "Tee", value: round.tee_color.charAt(0).toUpperCase() + round.tee_color.slice(1) },
            { label: "Course HCP", value: String(round.course_handicap) },
            { label: "Playing HCP", value: String(round.playing_handicap) },
            { label: "Allowance", value: `${round.allowance_pct}%` },
            { label: "Date", value: new Date(round.started_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }) },
          ].map((row, i) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: colors.border, borderBottomWidth: i < 5 ? StyleSheet.hairlineWidth : 0 }]}>
              <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{row.label}</Text>
              <Text style={[styles.infoValue, { color: colors.foreground }]}>{row.value}</Text>
            </View>
          ))}
        </View>

        {/* Hole-by-hole scorecard */}
        <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Hole by Hole</Text>

          {isFourball && round.playerHoles ? (
            // ── Fourball 4-player scorecard (club-scorecard style) ────────
            (() => {
              const myHcp   = round.playing_handicap;
              const prtHcp  = round.partner_playing_hcp  ?? round.playing_handicap;
              const opp1Hcp = round.opponent_playing_hcp ?? 0;
              const opp2Hcp = round.opponent2_playing_hcp ?? opp1Hcp;

              const metric = round.format === "fourball_stableford"      ? "stableford"
                           : round.format === "fourball_gross_betterball" ? "gross"
                           : "net";
              const bestOf = (a: number | null, b: number | null) =>
                a == null ? b : b == null ? a : metric === "stableford" ? Math.max(a, b) : Math.min(a, b);
              const teamBeatsOpp = (t: number | null, o: number | null) =>
                t != null && o != null && (metric === "stableford" ? t > o : t < o);

              const firstName = (n?: string | null) => (n ?? "?").split(" ")[0].slice(0, 7);
              const meLabel   = firstName((round as any).user_name ?? "Me");
              const prtLabel  = firstName(round.partner_name)  || "Ptnr";
              const opp1Label = firstName(round.opponent_name) || "Opp1";
              const opp2Label = firstName(round.opponent2_name) || "Opp2";

              let teamWon = 0, teamLost = 0, teamHalved = 0;
              let myTotG = 0, prtTotG = 0, o1TotG = 0, o2TotG = 0;
              let myTotP = 0, prtTotP = 0, o1TotP = 0, o2TotP = 0;

              const HW = StyleSheet.hairlineWidth;
              const bdr = colors.border;
              const pBg = colors.primary;

              // Reusable cell builders
              const scoreCell = (val: string | number | null, isBest: boolean, dimmed?: boolean) => (
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 5,
                  backgroundColor: isBest ? "#16a34a22" : "transparent",
                  borderRightWidth: HW, borderRightColor: bdr }}>
                  <Text style={{ fontSize: 12, fontFamily: isBest ? "Inter_700Bold" : "Inter_400Regular",
                    color: isBest ? "#16a34a" : dimmed ? colors.mutedForeground : colors.foreground }}>
                    {val != null ? String(val) : "—"}
                  </Text>
                </View>
              );
              const resultCell = (pts: number | null, isBest: boolean) => {
                const ptColor = pts == null ? colors.mutedForeground
                  : pts >= 3 ? "#16a34a" : pts >= 2 ? GOLD : pts >= 1 ? "#ea580c" : "#dc2626";
                return (
                  <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 4,
                    backgroundColor: isBest ? "#16a34a18" : "transparent",
                    borderRightWidth: HW, borderRightColor: bdr }}>
                    <Text style={{ fontSize: 10, fontFamily: isBest ? "Inter_700Bold" : "Inter_400Regular",
                      color: isBest ? "#16a34a" : ptColor }}>
                      {pts != null ? String(pts) : "—"}
                    </Text>
                  </View>
                );
              };

              // Collect hole data to allow running totals
              const holeData = sc.map(h => {
                const mySaved   = holes[h.number];
                const prtSaved  = round.playerHoles![`0_${h.number}`];
                const opp1Saved = round.playerHoles![`1_${h.number}`];
                const opp2Saved = round.playerHoles![`2_${h.number}`];

                const myG   = mySaved?.is_nr   ? null : mySaved?.gross_score  ?? null;
                const prtG  = prtSaved?.is_nr  ? null : prtSaved?.gross_score  ?? null;
                const opp1G = opp1Saved?.is_nr ? null : opp1Saved?.gross_score ?? null;
                const opp2G = opp2Saved?.is_nr ? null : opp2Saved?.gross_score ?? null;

                const myHa   = getHA(h.stroke_index, myHcp);
                const prtHa  = getHA(h.stroke_index, prtHcp);
                const o1Ha   = getHA(h.stroke_index, opp1Hcp);
                const o2Ha   = getHA(h.stroke_index, opp2Hcp);

                const myNet  = myG   != null ? myG   - myHa  : null;
                const prtNet = prtG  != null ? prtG  - prtHa : null;
                const o1Net  = opp1G != null ? opp1G - o1Ha  : null;
                const o2Net  = opp2G != null ? opp2G - o2Ha  : null;

                const myP  = myG   != null ? calcPts(myG,   h.par, myHa)  : null;
                const prtP = prtG  != null ? calcPts(prtG,  h.par, prtHa) : null;
                const o1P  = opp1G != null ? calcPts(opp1G, h.par, o1Ha)  : null;
                const o2P  = opp2G != null ? calcPts(opp2G, h.par, o2Ha)  : null;

                const myM   = metric === "stableford" ? myP   : metric === "gross" ? myG   : myNet;
                const prtM  = metric === "stableford" ? prtP  : metric === "gross" ? prtG  : prtNet;
                const o1M   = metric === "stableford" ? o1P   : metric === "gross" ? opp1G : o1Net;
                const o2M   = metric === "stableford" ? o2P   : metric === "gross" ? opp2G : o2Net;

                const teamBest = bestOf(myM, prtM);
                const oppBest  = bestOf(o1M, o2M);

                const myBest  = teamBest != null && myM  === teamBest && myG   != null;
                const prtBest = teamBest != null && prtM === teamBest && prtG  != null && !myBest;
                const o1Best  = oppBest  != null && o1M  === oppBest  && opp1G != null;
                const o2Best  = oppBest  != null && o2M  === oppBest  && opp2G != null && !o1Best;

                let res: "W" | "L" | "H" | null = null;
                if (teamBest != null && oppBest != null) {
                  if      (teamBeatsOpp(teamBest, oppBest)) { res = "W"; teamWon++;    }
                  else if (teamBeatsOpp(oppBest, teamBest)) { res = "L"; teamLost++;   }
                  else                                      { res = "H"; teamHalved++; }
                }

                if (myG   != null) myTotG   += myG;
                if (prtG  != null) prtTotG  += prtG;
                if (opp1G != null) o1TotG   += opp1G;
                if (opp2G != null) o2TotG   += opp2G;
                if (myP   != null) myTotP   += myP;
                if (prtP  != null) prtTotP  += prtP;
                if (o1P   != null) o1TotP   += o1P;
                if (o2P   != null) o2TotP   += o2P;

                return { h, myG, prtG, opp1G, opp2G, myP, prtP, o1P, o2P,
                         myBest, prtBest, o1Best, o2Best, res,
                         mySaved, prtSaved, opp1Saved, opp2Saved };
              });

              const resColor = (r: "W"|"L"|"H"|null) =>
                r === "W" ? "#16a34a" : r === "L" ? "#dc2626" : r === "H" ? GOLD : colors.mutedForeground;

              return (
                <View style={{ borderRadius: 10, borderWidth: HW, borderColor: bdr, overflow: "hidden" }}>
                  {/* ── Header: hole/par labels + player names ── */}
                  <View style={{ flexDirection: "row", backgroundColor: pBg }}>
                    {/* H + Par fixed cols */}
                    <View style={{ width: 28, alignItems: "center", justifyContent: "center", paddingVertical: 8, borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.25)" }}>
                      <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: "#fff" }}>H</Text>
                    </View>
                    <View style={{ width: 26, alignItems: "center", justifyContent: "center", borderRightWidth: 1.5, borderRightColor: "rgba(255,255,255,0.4)" }}>
                      <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: "#fff" }}>Par</Text>
                    </View>
                    {/* Your team */}
                    <View style={{ flex: 1, flexDirection: "row" }}>
                      {[meLabel, prtLabel].map((lbl, i) => (
                        <View key={i} style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 8,
                          borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.2)",
                          backgroundColor: "rgba(255,255,255,0.06)" }}>
                          <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: "#a3e4bc" }}>{lbl}</Text>
                        </View>
                      ))}
                    </View>
                    {/* Divider */}
                    <View style={{ width: 1.5, backgroundColor: "rgba(255,255,255,0.4)" }} />
                    {/* Opponents */}
                    <View style={{ flex: 1, flexDirection: "row" }}>
                      {[opp1Label, opp2Label].map((lbl, i) => (
                        <View key={i} style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 8,
                          borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.2)",
                          backgroundColor: "rgba(255,255,255,0.03)" }}>
                          <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: "#fca5a5" }}>{lbl}</Text>
                        </View>
                      ))}
                    </View>
                    {/* Res */}
                    <View style={{ width: 32, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: "#fff" }}>Res</Text>
                    </View>
                  </View>

                  {/* ── Sub-header: Score / Result labels ── */}
                  <View style={{ flexDirection: "row", backgroundColor: pBg + "dd", borderBottomWidth: 1.5, borderBottomColor: bdr }}>
                    <View style={{ width: 28, borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.15)" }} />
                    <View style={{ width: 26, borderRightWidth: 1.5, borderRightColor: "rgba(255,255,255,0.25)" }} />
                    <View style={{ flex: 2, flexDirection: "column" }}>
                      {["SCORE", "RESULT"].map((lbl, ri) => (
                        <View key={ri} style={{ flex: 1, alignItems: "flex-start", justifyContent: "center",
                          paddingLeft: 6, paddingVertical: 3,
                          borderBottomWidth: ri === 0 ? HW : 0, borderBottomColor: "rgba(255,255,255,0.15)" }}>
                          <Text style={{ fontSize: 7, fontFamily: "Inter_700Bold", color: "rgba(255,255,255,0.5)", letterSpacing: 0.5 }}>{lbl}</Text>
                        </View>
                      ))}
                    </View>
                    <View style={{ width: 1.5 }} />
                    <View style={{ flex: 2, flexDirection: "column" }}>
                      {["SCORE", "RESULT"].map((lbl, ri) => (
                        <View key={ri} style={{ flex: 1, alignItems: "flex-start", justifyContent: "center",
                          paddingLeft: 6, paddingVertical: 3,
                          borderBottomWidth: ri === 0 ? HW : 0, borderBottomColor: "rgba(255,255,255,0.15)" }}>
                          <Text style={{ fontSize: 7, fontFamily: "Inter_700Bold", color: "rgba(255,255,255,0.5)", letterSpacing: 0.5 }}>{lbl}</Text>
                        </View>
                      ))}
                    </View>
                    <View style={{ width: 32 }} />
                  </View>

                  {/* ── Hole rows ── */}
                  {holeData.map(({ h, myG, prtG, opp1G, opp2G, myP, prtP, o1P, o2P,
                                   myBest, prtBest, o1Best, o2Best, res,
                                   mySaved, prtSaved, opp1Saved, opp2Saved }, idx) => {
                    const rowBg = idx % 2 === 0 ? colors.card : (colors.card === "#fff" || colors.card === "#ffffff" ? "#f8faf9" : colors.background);
                    const rc = resColor(res);
                    return (
                      <View key={h.number} style={{ flexDirection: "row", backgroundColor: rowBg,
                        borderBottomWidth: HW, borderBottomColor: bdr }}>
                        {/* H — spans both sub-rows */}
                        <View style={{ width: 28, alignItems: "center", justifyContent: "center",
                          borderRightWidth: HW, borderRightColor: bdr }}>
                          <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: colors.foreground }}>{h.number}</Text>
                        </View>
                        {/* Par — spans both sub-rows */}
                        <View style={{ width: 26, alignItems: "center", justifyContent: "center",
                          borderRightWidth: 1.5, borderRightColor: bdr }}>
                          <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>{h.par}</Text>
                        </View>
                        {/* Your team: 2 sub-rows stacked */}
                        <View style={{ flex: 1, flexDirection: "column" }}>
                          {/* Score row */}
                          <View style={{ flexDirection: "row", borderBottomWidth: HW, borderBottomColor: bdr }}>
                            {scoreCell(mySaved?.is_nr ? "NR" : myG, myBest, !!mySaved?.is_nr)}
                            {scoreCell(prtSaved?.is_nr ? "NR" : prtG, prtBest, !!prtSaved?.is_nr)}
                          </View>
                          {/* Result row */}
                          <View style={{ flexDirection: "row" }}>
                            {resultCell(myP, myBest)}
                            {resultCell(prtP, prtBest)}
                          </View>
                        </View>
                        {/* Team divider */}
                        <View style={{ width: 1.5, backgroundColor: bdr }} />
                        {/* Opponents: 2 sub-rows stacked */}
                        <View style={{ flex: 1, flexDirection: "column" }}>
                          <View style={{ flexDirection: "row", borderBottomWidth: HW, borderBottomColor: bdr }}>
                            {scoreCell(opp1Saved?.is_nr ? "NR" : opp1G, o1Best, !!opp1Saved?.is_nr)}
                            {scoreCell(opp2Saved?.is_nr ? "NR" : opp2G, o2Best, !!opp2Saved?.is_nr)}
                          </View>
                          <View style={{ flexDirection: "row" }}>
                            {resultCell(o1P, o1Best)}
                            {resultCell(o2P, o2Best)}
                          </View>
                        </View>
                        {/* Result */}
                        <View style={{ width: 32, alignItems: "center", justifyContent: "center" }}>
                          <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: rc }}>{res ?? "—"}</Text>
                        </View>
                      </View>
                    );
                  })}

                  {/* ── Totals row ── */}
                  <View style={{ flexDirection: "row", backgroundColor: pBg }}>
                    <View style={{ width: 28, alignItems: "center", justifyContent: "center",
                      borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.2)", paddingVertical: 7 }}>
                      <Text style={{ fontSize: 8, fontFamily: "Inter_700Bold", color: "#fff" }}>TOT</Text>
                    </View>
                    <View style={{ width: 26, alignItems: "center", justifyContent: "center",
                      borderRightWidth: 1.5, borderRightColor: "rgba(255,255,255,0.3)" }}>
                      <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: "#fff" }}>{sc.reduce((s,h)=>s+h.par,0)}</Text>
                    </View>
                    {/* Your team totals */}
                    <View style={{ flex: 1, flexDirection: "column" }}>
                      <View style={{ flexDirection: "row", borderBottomWidth: HW, borderBottomColor: "rgba(255,255,255,0.2)" }}>
                        {[myTotG, prtTotG].map((v, i) => (
                          <View key={i} style={{ flex: 1, alignItems: "center", paddingVertical: 4,
                            borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.2)" }}>
                            <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: "#a3e4bc" }}>{v || "—"}</Text>
                          </View>
                        ))}
                      </View>
                      <View style={{ flexDirection: "row" }}>
                        {[myTotP, prtTotP].map((v, i) => (
                          <View key={i} style={{ flex: 1, alignItems: "center", paddingVertical: 4,
                            borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.2)" }}>
                            <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: GOLD }}>{v || "—"}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                    <View style={{ width: 1.5, backgroundColor: "rgba(255,255,255,0.3)" }} />
                    {/* Opponents totals */}
                    <View style={{ flex: 1, flexDirection: "column" }}>
                      <View style={{ flexDirection: "row", borderBottomWidth: HW, borderBottomColor: "rgba(255,255,255,0.2)" }}>
                        {[o1TotG, o2TotG].map((v, i) => (
                          <View key={i} style={{ flex: 1, alignItems: "center", paddingVertical: 4,
                            borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.2)" }}>
                            <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: "#fca5a5" }}>{v || "—"}</Text>
                          </View>
                        ))}
                      </View>
                      <View style={{ flexDirection: "row" }}>
                        {[o1TotP, o2TotP].map((v, i) => (
                          <View key={i} style={{ flex: 1, alignItems: "center", paddingVertical: 4,
                            borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.2)" }}>
                            <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: GOLD }}>{v || "—"}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                    {/* Match summary */}
                    <View style={{ width: 32, alignItems: "center", justifyContent: "center", gap: 1 }}>
                      <Text style={{ fontSize: 8, fontFamily: "Inter_700Bold", color: "#22c55e" }}>{teamWon}W</Text>
                      <Text style={{ fontSize: 8, fontFamily: "Inter_700Bold", color: "#f87171" }}>{teamLost}L</Text>
                      <Text style={{ fontSize: 8, fontFamily: "Inter_700Bold", color: GOLD }}>{teamHalved}H</Text>
                    </View>
                  </View>
                </View>
              );
            })()
          ) : (
            // ── Standard single-player scorecard ──────────────────────────
            <>
              <View style={[styles.scHeaderRow, { backgroundColor: colors.primary, borderRadius: 10, marginBottom: 2 }]}>
                {["Hole", "Par", "SI", "H/C", "Gross", "Net", "Pts"].map(h => (
                  <Text key={h} style={styles.scHeaderCell}>{h}</Text>
                ))}
              </View>

              {sc.map(h => {
                const saved = holes[h.number];
                const ha = getHA(h.stroke_index, round.playing_handicap);
                const isNr = saved?.is_nr;
                const gross = saved?.gross_score;
                const net = saved?.net_score;
                const pts = saved?.stableford_points;
                const diff = gross != null ? gross - h.par : null;
                const ss = diff != null ? scoreStyle(diff) : null;

                return (
                  <View key={h.number} style={[styles.scRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.scCell, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>{h.number}</Text>
                    <Text style={[styles.scCell, { color: colors.mutedForeground }]}>{h.par}</Text>
                    <Text style={[styles.scCell, { color: colors.mutedForeground }]}>{h.stroke_index}</Text>
                    <Text style={[styles.scCell, { color: ha > 0 ? "#c8a84b" : colors.mutedForeground, fontFamily: ha > 0 ? "Inter_700Bold" : "Inter_400Regular" }]}>
                      {ha > 0 ? `+${ha}` : "0"}
                    </Text>
                    <View style={[styles.scCellWrap, ss?.border ? { borderColor: ss.border, borderWidth: 1.5, borderRadius: 6 } : {}]}>
                      <Text style={[styles.scCell, { color: ss?.text ?? colors.mutedForeground }]}>
                        {isNr ? "NR" : gross != null ? String(gross) : "—"}
                      </Text>
                    </View>
                    <Text style={[styles.scCell, { color: colors.mutedForeground }]}>{isNr ? "—" : net != null ? String(net) : "—"}</Text>
                    <Text style={[styles.scCell, { color: pts != null ? (pts >= 3 ? "#22c55e" : pts >= 2 ? "#c8a84b" : pts >= 1 ? "#fb923c" : "#f87171") : colors.mutedForeground, fontFamily: "Inter_700Bold" }]}>
                      {isNr ? "0" : pts != null ? String(pts) : "—"}
                    </Text>
                  </View>
                );
              })}

              <View style={[styles.scTotalsRow, { backgroundColor: colors.primary, borderRadius: 10, marginTop: 2 }]}>
                <Text style={styles.scTotalLabel}>TOTAL</Text>
                <Text style={styles.scTotalPar}>{sc.reduce((s, h) => s + h.par, 0)}</Text>
                <Text style={styles.scTotalBlank}>—</Text>
                <Text style={[styles.scTotalBlank, { color: "#c8a84b" }]}>{round.playing_handicap}</Text>
                <Text style={styles.scTotalValue}>{totalGross || "—"}</Text>
                <Text style={styles.scTotalValue}>{totalNet || "—"}</Text>
                <Text style={[styles.scTotalValue, { color: GOLD }]}>{totalPts}</Text>
              </View>
            </>
          )}
        </View>
      </ScrollView>

      {/* Footer actions */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16, backgroundColor: colors.background, borderTopColor: colors.border }]}>
        {isActive ? (
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={[styles.footerBtn, { backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border, flex: 1 }]}
            >
              <Ionicons name="arrow-back" size={18} color={colors.primary} />
              <Text style={[styles.footerBtnText, { color: colors.primary }]}>Continue Scoring</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onComplete}
              disabled={completing}
              style={[styles.footerBtn, { backgroundColor: colors.primary, flex: 1, opacity: completing ? 0.6 : 1 }]}
            >
              {completing
                ? <ActivityIndicator color="#fff" size="small" />
                : <Ionicons name="checkmark-circle" size={18} color="#fff" />}
              <Text style={[styles.footerBtnText, { color: "#fff" }]}>
                {completing ? "Finishing…" : "Finish Round"}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {round.tournament_id && (
              round.score_submitted ? (
                <View style={[styles.footerBtn, { backgroundColor: "#16a34a22", borderWidth: 1.5, borderColor: "#16a34a60" }]}>
                  <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
                  <Text style={[styles.footerBtnText, { color: "#16a34a" }]}>Score Submitted to Club ✓</Text>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={onSubmitToClub}
                  disabled={submitting}
                  style={[styles.footerBtn, { backgroundColor: GOLD, opacity: submitting ? 0.6 : 1 }]}
                >
                  {submitting
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Ionicons name="trophy" size={18} color="#fff" />}
                  <Text style={[styles.footerBtnText, { color: "#fff" }]}>
                    {submitting ? "Submitting…" : `Submit to ${round.tournament_name ?? "Club"}`}
                  </Text>
                </TouchableOpacity>
              )
            )}
            <TouchableOpacity
              onPress={() => router.replace("/(tabs)/scoring")}
              style={[styles.footerBtn, { backgroundColor: colors.primary }]}
            >
              <Ionicons name="golf" size={18} color="#fff" />
              <Text style={[styles.footerBtnText, { color: "#fff" }]}>Back to Scoring</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const GOLD = "#c8a84b";

const bbStyles = StyleSheet.create({
  headerRow: { flexDirection: "row", paddingHorizontal: 6, paddingVertical: 7, borderRadius: 10, marginBottom: 2 },
  hCell:     { fontSize: 9, fontFamily: "Inter_700Bold", color: "#fff", textAlign: "center" },
  row:       { flexDirection: "row", paddingHorizontal: 6, paddingVertical: 6, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, marginBottom: 2 },
  cellWrap:  { flex: 1, alignItems: "center", justifyContent: "center" },
  totalsRow: { flexDirection: "row", paddingHorizontal: 6, paddingVertical: 8, borderRadius: 10, marginTop: 2 },
  totalCell: { flex: 1, fontSize: 10, fontFamily: "Inter_700Bold", color: "#fff", textAlign: "center" },
});

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 16 },
  backBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.75)", marginTop: 1 },
  shareBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  summaryRow: { flexDirection: "row", padding: 16, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  summaryCard: { flex: 1, borderRadius: 14, padding: 12, alignItems: "center", borderWidth: 1, gap: 4 },
  summaryValue: { fontSize: 22, fontFamily: "Inter_700Bold" },
  summaryUnit: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  summaryLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },
  roundInfo: { margin: 16, borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 14, paddingVertical: 11 },
  infoLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  infoValue: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold", marginBottom: 10 },
  scHeaderRow: { flexDirection: "row", paddingHorizontal: 12, paddingVertical: 8 },
  scHeaderCell: { flex: 1, fontSize: 11, fontFamily: "Inter_700Bold", color: "#fff", textAlign: "center" },
  scRow: { flexDirection: "row", paddingHorizontal: 12, paddingVertical: 10, alignItems: "center", borderWidth: StyleSheet.hairlineWidth, borderRadius: 6, marginBottom: 2 },
  scCell: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  scCellWrap: { flex: 1, alignItems: "center", paddingVertical: 2 },
  scTotalsRow: { flexDirection: "row", paddingHorizontal: 12, paddingVertical: 10 },
  scTotalLabel: { flex: 1, fontSize: 11, fontFamily: "Inter_700Bold", color: "#fff", textAlign: "center" },
  scTotalPar: { flex: 1, fontSize: 13, fontFamily: "Inter_700Bold", color: "#fff", textAlign: "center" },
  scTotalBlank: { flex: 1, fontSize: 13, color: "rgba(255,255,255,0.5)", textAlign: "center" },
  scTotalValue: { flex: 1, fontSize: 13, fontFamily: "Inter_700Bold", color: "#fff", textAlign: "center" },
  matchCard: {
    flexDirection: "row", alignItems: "center",
    marginHorizontal: 16, marginTop: 4, marginBottom: 4,
    borderRadius: 16, borderWidth: 1.5, padding: 16,
  },
  matchCardLabel: { fontSize: 24, fontFamily: "Inter_700Bold" },
  matchCardOpp: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 3 },
  matchCardDetail: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 4 },
  verifyCard: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    marginHorizontal: 16, marginTop: 4, marginBottom: 4,
    borderRadius: 14, borderWidth: 1, padding: 14,
  },
  verifyTitle: { fontSize: 13, fontFamily: "Inter_700Bold" },
  verifyDetail: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 3, lineHeight: 16 },
  footer: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  footerBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 16, paddingVertical: 15 },
  footerBtnText: { fontSize: 15, fontFamily: "Inter_700Bold" },
});
