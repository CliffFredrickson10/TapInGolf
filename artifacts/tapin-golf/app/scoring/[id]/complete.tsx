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
  if (d === 0) return { text: "#1a5c38" };
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
      // Auto-submit score immediately after completing
      try {
        await apiFetch(`/scoring/rounds/${id}/submit`, token, { method: "POST" });
      } catch {}
      await loadRound();
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to complete round");
    } finally {
      setCompleting(false);
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

  const isMatchPlay       = round.format === "singles_match_play";
  const isBetterball      = round.format === "betterball_match_play";
  const isFourball        = round.format === "betterball_match_play";
  const isFourballNonMatch = ["fourball_stableford", "fourball_gross_betterball"].includes(round.format);
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
              let myF9G = 0, prtF9G = 0, o1F9G = 0, o2F9G = 0;
              let myF9P = 0, prtF9P = 0, o1F9P = 0, o2F9P = 0;
              let myB9G = 0, prtB9G = 0, o1B9G = 0, o2B9G = 0;
              let myB9P = 0, prtB9P = 0, o1B9P = 0, o2B9P = 0;
              let f9Won = 0, f9Lost = 0, f9Halved = 0;
              let b9Won = 0, b9Lost = 0, b9Halved = 0;

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

                const isFront = h.number <= 9;
                if (myG   != null) { myTotG   += myG;   if (isFront) myF9G   += myG;   else myB9G   += myG;   }
                if (prtG  != null) { prtTotG  += prtG;  if (isFront) prtF9G  += prtG;  else prtB9G  += prtG;  }
                if (opp1G != null) { o1TotG   += opp1G; if (isFront) o1F9G   += opp1G; else o1B9G   += opp1G; }
                if (opp2G != null) { o2TotG   += opp2G; if (isFront) o2F9G   += opp2G; else o2B9G   += opp2G; }
                if (myP   != null) { myTotP   += myP;   if (isFront) myF9P   += myP;   else myB9P   += myP;   }
                if (prtP  != null) { prtTotP  += prtP;  if (isFront) prtF9P  += prtP;  else prtB9P  += prtP;  }
                if (o1P   != null) { o1TotP   += o1P;   if (isFront) o1F9P   += o1P;   else o1B9P   += o1P;   }
                if (o2P   != null) { o2TotP   += o2P;   if (isFront) o2F9P   += o2P;   else o2B9P   += o2P;   }
                if (res === "W") { if (isFront) f9Won++;    else b9Won++;    }
                if (res === "L") { if (isFront) f9Lost++;   else b9Lost++;   }
                if (res === "H") { if (isFront) f9Halved++; else b9Halved++; }

                return { h, myG, prtG, opp1G, opp2G, myP, prtP, o1P, o2P,
                         myBest, prtBest, o1Best, o2Best, res,
                         mySaved, prtSaved, opp1Saved, opp2Saved };
              });

              const resColor = (r: "W"|"L"|"H"|null) =>
                r === "W" ? "#16a34a" : r === "L" ? "#dc2626" : r === "H" ? GOLD : colors.mutedForeground;

              // Sub-col helper: Score | Result side-by-side under one player name
              const playerPair = (
                gross: number | null, pts: number | null, nr: boolean, isBest: boolean,
                isLastInTeam: boolean
              ) => {
                const ptColor = pts == null ? colors.mutedForeground
                  : pts >= 3 ? "#16a34a" : pts >= 2 ? GOLD : pts >= 1 ? "#ea580c" : "#dc2626";
                const grossTxt = nr ? "NR" : gross != null ? String(gross) : "—";
                const ptsTxt   = pts != null ? String(pts) : "—";
                const bg       = isBest ? "#16a34a18" : "transparent";
                const rightBorder = isLastInTeam
                  ? { borderRightWidth: 1.5, borderRightColor: bdr }
                  : { borderRightWidth: HW, borderRightColor: bdr };
                return (
                  <View style={[{ flex: 2, flexDirection: "row", backgroundColor: bg }, rightBorder]}>
                    {/* Score sub-col */}
                    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 8,
                      borderRightWidth: HW, borderRightColor: bdr }}>
                      <Text style={{ fontSize: 11, fontFamily: isBest ? "Inter_700Bold" : "Inter_400Regular",
                        color: isBest ? "#16a34a" : nr ? colors.mutedForeground : gross != null ? colors.foreground : colors.mutedForeground }}>
                        {grossTxt}
                      </Text>
                    </View>
                    {/* Result sub-col */}
                    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 8 }}>
                      <Text style={{ fontSize: 11, fontFamily: isBest ? "Inter_700Bold" : "Inter_400Regular",
                        color: isBest ? "#16a34a" : ptColor }}>
                        {ptsTxt}
                      </Text>
                    </View>
                  </View>
                );
              };

              return (
                <View style={{ borderRadius: 10, borderWidth: HW, borderColor: bdr, overflow: "hidden" }}>

                  {/* ── Header row 1: H | Par | SI | player names (each spanning Score+Result) ── */}
                  <View style={{ flexDirection: "row", backgroundColor: pBg, paddingVertical: 7 }}>
                    <View style={{ width: 28, alignItems: "center", justifyContent: "center",
                      borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.25)" }}>
                      <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: "#fff" }}>H</Text>
                    </View>
                    <View style={{ width: 26, alignItems: "center", justifyContent: "center",
                      borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.25)" }}>
                      <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: "#fff" }}>Par</Text>
                    </View>
                    <View style={{ width: 24, alignItems: "center", justifyContent: "center",
                      borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.25)" }}>
                      <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: "rgba(255,255,255,0.6)" }}>SI</Text>
                    </View>
                    {/* Each player name spans flex:2 (Score + Result cols beneath) */}
                    {[
                      { lbl: meLabel,   color: "#a3e4bc", rightBorder: HW },
                      { lbl: prtLabel,  color: "#a3e4bc", rightBorder: 1.5 },
                      { lbl: opp1Label, color: "#fca5a5", rightBorder: HW },
                      { lbl: opp2Label, color: "#fca5a5", rightBorder: HW },
                    ].map(({ lbl, color, rightBorder }, i) => (
                      <View key={i} style={{ flex: 2, alignItems: "center", justifyContent: "center",
                        borderRightWidth: rightBorder, borderRightColor: "rgba(255,255,255,0.3)" }}>
                        <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color }}>{lbl}</Text>
                      </View>
                    ))}
                    <View style={{ width: 32, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: "#fff" }}>Res</Text>
                    </View>
                  </View>

                  {/* ── Header row 2: Score / Result sub-labels ── */}
                  <View style={{ flexDirection: "row", backgroundColor: pBg + "cc",
                    borderBottomWidth: 1.5, borderBottomColor: bdr }}>
                    <View style={{ width: 28, borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.15)" }} />
                    <View style={{ width: 26, borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.15)" }} />
                    <View style={{ width: 24, borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.15)" }} />
                    {[
                      { rb: HW },   // Me Score
                      { rb: 1.5 },  // Me Result (end of Me pair)
                      { rb: HW },   // Ptnr Score
                      { rb: 1.5 },  // Ptnr Result (team divider)
                      { rb: HW },   // Opp1 Score
                      { rb: HW },   // Opp1 Result
                      { rb: HW },   // Opp2 Score
                      { rb: HW },   // Opp2 Result
                    ].map(({ rb }, i) => (
                      <View key={i} style={{ flex: 1, alignItems: "center", paddingVertical: 3,
                        borderRightWidth: rb, borderRightColor: "rgba(255,255,255,0.2)" }}>
                        <Text style={{ fontSize: 7, fontFamily: "Inter_700Bold",
                          color: "rgba(255,255,255,0.55)", letterSpacing: 0.3 }}>
                          {i % 2 === 0 ? "Score" : "Res"}
                        </Text>
                      </View>
                    ))}
                    <View style={{ width: 32 }} />
                  </View>

                  {/* ── Hole rows + interleaved totals ── */}
                  {(() => {
                    const f9Par  = sc.filter(h => h.number <= 9).reduce((s,h) => s + h.par, 0);
                    const b9Par  = sc.filter(h => h.number >  9).reduce((s,h) => s + h.par, 0);
                    const totPar = f9Par + b9Par;

                    const TotPair = (g: number, p: number, lastInTeam: boolean) => (
                      <View style={[{ flex: 2, flexDirection: "row" },
                        lastInTeam
                          ? { borderRightWidth: 1.5, borderRightColor: "rgba(255,255,255,0.35)" }
                          : { borderRightWidth: HW,  borderRightColor: "rgba(255,255,255,0.2)"  }]}>
                        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 7,
                          borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.2)" }}>
                          <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: "#fff" }}>
                            {g > 0 ? String(g) : "—"}
                          </Text>
                        </View>
                        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 7 }}>
                          <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: GOLD }}>
                            {p > 0 ? String(p) : "—"}
                          </Text>
                        </View>
                      </View>
                    );

                    const TotRow = (
                      label: string, par: number, isLast: boolean,
                      mg: number, mp: number, pg: number, pp: number,
                      o1g: number, o1p: number, o2g: number, o2p: number,
                      w: number, l: number, hv: number,
                    ) => (
                      <View key={label} style={{ flexDirection: "row", backgroundColor: isLast ? pBg : pBg + "e0",
                        borderTopWidth: isLast ? 1.5 : HW,
                        borderTopColor: isLast ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.2)" }}>
                        <View style={{ width: 28, alignItems: "center", justifyContent: "center",
                          borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.2)" }}>
                          <Text style={{ fontSize: 8, fontFamily: "Inter_700Bold",
                            color: isLast ? GOLD : "rgba(255,255,255,0.8)" }}>{label}</Text>
                        </View>
                        <View style={{ width: 26, alignItems: "center", justifyContent: "center",
                          borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.2)" }}>
                          <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: "#fff" }}>{par}</Text>
                        </View>
                        <View style={{ width: 24, borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.2)" }} />
                        {TotPair(mg, mp, false)}
                        {TotPair(pg, pp, true)}
                        {TotPair(o1g, o1p, false)}
                        {TotPair(o2g, o2p, false)}
                        <View style={{ width: 32, alignItems: "center", justifyContent: "center", gap: 1 }}>
                          <Text style={{ fontSize: 8, fontFamily: "Inter_700Bold", color: "#4ade80" }}>{w}W</Text>
                          <Text style={{ fontSize: 8, fontFamily: "Inter_700Bold", color: "#f87171" }}>{l}L</Text>
                          <Text style={{ fontSize: 8, fontFamily: "Inter_700Bold", color: GOLD }}>{hv}H</Text>
                        </View>
                      </View>
                    );

                    return (
                      <>
                        {holeData.map(({ h, myG, prtG, opp1G, opp2G, myP, prtP, o1P, o2P,
                                         myBest, prtBest, o1Best, o2Best, res,
                                         mySaved, prtSaved, opp1Saved, opp2Saved }, idx) => {
                          const rowBg = idx % 2 === 0 ? colors.card
                            : (colors.card === "#fff" || colors.card === "#ffffff" ? "#f7faf8" : colors.background);
                          const rc = resColor(res);
                          return (
                            <React.Fragment key={h.number}>
                              <View style={{ flexDirection: "row", backgroundColor: rowBg,
                                borderBottomWidth: HW, borderBottomColor: bdr }}>
                                <View style={{ width: 28, alignItems: "center", justifyContent: "center",
                                  borderRightWidth: HW, borderRightColor: bdr }}>
                                  <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: colors.foreground }}>{h.number}</Text>
                                </View>
                                <View style={{ width: 26, alignItems: "center", justifyContent: "center",
                                  borderRightWidth: HW, borderRightColor: bdr }}>
                                  <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>{h.par}</Text>
                                </View>
                                <View style={{ width: 24, alignItems: "center", justifyContent: "center",
                                  borderRightWidth: HW, borderRightColor: bdr }}>
                                  <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>{h.stroke_index}</Text>
                                </View>
                                {playerPair(myG,   myP,   !!mySaved?.is_nr,   myBest,   false)}
                                {playerPair(prtG,  prtP,  !!prtSaved?.is_nr,  prtBest,  true)}
                                {playerPair(opp1G, o1P,   !!opp1Saved?.is_nr, o1Best,   false)}
                                {playerPair(opp2G, o2P,   !!opp2Saved?.is_nr, o2Best,   false)}
                                <View style={{ width: 32, alignItems: "center", justifyContent: "center" }}>
                                  <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: rc }}>{res ?? "—"}</Text>
                                </View>
                              </View>
                              {/* OUT totals after hole 9 */}
                              {h.number === 9 && TotRow(
                                "OUT", f9Par, false,
                                myF9G, myF9P, prtF9G, prtF9P,
                                o1F9G, o1F9P, o2F9G, o2F9P,
                                f9Won, f9Lost, f9Halved,
                              )}
                            </React.Fragment>
                          );
                        })}
                        {TotRow(
                          "IN", b9Par, false,
                          myB9G, myB9P, prtB9G, prtB9P,
                          o1B9G, o1B9P, o2B9G, o2B9P,
                          b9Won, b9Lost, b9Halved,
                        )}
                        {TotRow(
                          "TOT", totPar, true,
                          myTotG, myTotP, prtTotG, prtTotP,
                          o1TotG, o1TotP, o2TotG, o2TotP,
                          teamWon, teamLost, teamHalved,
                        )}
                      </>
                    );
                  })()}
                  {/* HCAP row */}
                  {[
                    { label: "HCAP", vals: [myHcp, prtHcp, opp1Hcp, opp2Hcp], fmt: (v: number) => String(v) },
                    { label: "NETT", vals: [myTotG - myHcp, prtTotG - prtHcp, o1TotG - opp1Hcp, o2TotG - opp2Hcp], fmt: (v: number, i: number) => ([myTotG, prtTotG, o1TotG, o2TotG][i] > 0 ? String(v) : "—") },
                  ].map(({ label, vals, fmt }) => (
                    <View key={label} style={{ flexDirection: "row", backgroundColor: "#f0f7f3",
                      borderTopWidth: HW, borderTopColor: bdr }}>
                      <View style={{ width: 28, alignItems: "center", justifyContent: "center", paddingVertical: 6,
                        borderRightWidth: HW, borderRightColor: bdr }}>
                        <Text style={{ fontSize: 7, fontFamily: "Inter_700Bold", letterSpacing: 0.5,
                          color: label === "HCAP" ? "#9a7a1e" : colors.primary }}>{label}</Text>
                      </View>
                      <View style={{ width: 26, borderRightWidth: HW, borderRightColor: bdr }} />
                      <View style={{ width: 24, borderRightWidth: HW, borderRightColor: bdr }} />
                      {vals.map((v, i) => (
                        <View key={i} style={{ flex: 2, alignItems: "center", justifyContent: "center", paddingVertical: 6,
                          borderRightWidth: i === 1 ? 1.5 : i < 3 ? HW : 0,
                          borderRightColor: bdr }}>
                          <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold",
                            color: i < 2 ? colors.primary : "#b91c1c" }}>{fmt(v, i)}</Text>
                        </View>
                      ))}
                      <View style={{ width: 32 }} />
                    </View>
                  ))}
                </View>
              );
            })()
          ) : isFourballNonMatch && round.playerHoles ? (
            // ── Non-match Fourball scorecard (Stableford / Gross Betterball) ──
            (() => {
              const myHcp   = round.playing_handicap;
              const prtHcp  = round.partner_playing_hcp  ?? round.playing_handicap;
              const opp1Hcp = round.opponent_playing_hcp ?? 0;
              const opp2Hcp = round.opponent2_playing_hcp ?? opp1Hcp;
              const HW  = StyleSheet.hairlineWidth;
              const bdr = colors.border;
              const pBg = colors.primary;

              const isStableford = round.format === "fourball_stableford";

              const firstName = (n?: string | null) => (n ?? "?").split(" ")[0].slice(0, 6);
              const meLabel   = "Me";
              const prtLabel  = firstName(round.partner_name)   || "Prt";
              const opp1Label = firstName(round.opponent_name)  || "Opp1";
              const opp2Label = firstName(round.opponent2_name) || "Opp2";

              let myTotG = 0, prtTotG = 0, o1TotG = 0, o2TotG = 0;
              let myF9G = 0, prtF9G = 0, o1F9G = 0, o2F9G = 0;
              let myB9G = 0, prtB9G = 0, o1B9G = 0, o2B9G = 0;
              let aBestTotG = 0, aBestTotN = 0, aBestTotP = 0;
              let aBestF9G = 0, aBestF9N = 0, aBestF9P = 0;
              let aBestB9G = 0, aBestB9N = 0, aBestB9P = 0;
              let f9Par = 0, b9Par = 0;

              const holeData = sc.map(h => {
                const mySaved   = holes[h.number];
                const prtSaved  = round.playerHoles![`0_${h.number}`];
                const opp1Saved = round.playerHoles![`1_${h.number}`];
                const opp2Saved = round.playerHoles![`2_${h.number}`];

                const myG   = mySaved?.is_nr   ? null : mySaved?.gross_score   ?? null;
                const prtG  = prtSaved?.is_nr  ? null : prtSaved?.gross_score  ?? null;
                const opp1G = opp1Saved?.is_nr ? null : opp1Saved?.gross_score ?? null;
                const opp2G = opp2Saved?.is_nr ? null : opp2Saved?.gross_score ?? null;

                const myHa   = getHA(h.stroke_index, myHcp);
                const prtHa  = getHA(h.stroke_index, prtHcp);
                const o1Ha   = getHA(h.stroke_index, opp1Hcp);
                const o2Ha   = getHA(h.stroke_index, opp2Hcp);

                const myNet  = myG   != null ? myG   - myHa  : null;
                const prtNet = prtG  != null ? prtG  - prtHa : null;

                const myP  = myG  != null ? calcPts(myG,   h.par, myHa)  : null;
                const prtP = prtG != null ? calcPts(prtG,  h.par, prtHa) : null;

                // Team A best ball
                let aBestG: number | null = null, aBestN: number | null = null, aBestP: number | null = null;
                let myBest = false, prtBest = false;
                if (isStableford) {
                  if (myP != null && (prtP == null || myP >= prtP)) { aBestP = myP; aBestG = myG; aBestN = myNet; myBest = true; }
                  else if (prtP != null) { aBestP = prtP; aBestG = prtG; aBestN = prtNet; prtBest = true; }
                } else {
                  if (myG != null && (prtG == null || myG <= prtG)) { aBestG = myG; aBestN = myNet; myBest = true; }
                  else if (prtG != null) { aBestG = prtG; aBestN = prtNet; prtBest = true; }
                  aBestP = aBestG != null ? calcPts(aBestG, h.par, myBest ? myHa : prtHa) : null;
                }

                const isFront = h.number <= 9;
                if (myG   != null) { myTotG  += myG;   if (isFront) myF9G   += myG;   else myB9G   += myG;   }
                if (prtG  != null) { prtTotG += prtG;  if (isFront) prtF9G  += prtG;  else prtB9G  += prtG;  }
                if (opp1G != null) { o1TotG  += opp1G; if (isFront) o1F9G   += opp1G; else o1B9G   += opp1G; }
                if (opp2G != null) { o2TotG  += opp2G; if (isFront) o2F9G   += opp2G; else o2B9G   += opp2G; }
                if (aBestG != null) { aBestTotG += aBestG; if (isFront) aBestF9G += aBestG; else aBestB9G += aBestG; }
                if (aBestN != null) { aBestTotN += aBestN; if (isFront) aBestF9N += aBestN; else aBestB9N += aBestN; }
                if (aBestP != null) { aBestTotP += aBestP; if (isFront) aBestF9P += aBestP; else aBestB9P += aBestP; }
                if (isFront) f9Par += h.par; else b9Par += h.par;

                return { h, myG, prtG, opp1G, opp2G, myBest, prtBest, myHa, aBestG, aBestN, aBestP,
                         myNr: !!mySaved?.is_nr, prtNr: !!prtSaved?.is_nr,
                         opp1Nr: !!opp1Saved?.is_nr, opp2Nr: !!opp2Saved?.is_nr };
              });

              const totPar = f9Par + b9Par;

              const ptsColor = (p: number | null) =>
                p == null ? colors.mutedForeground : p >= 3 ? "#22c55e" : p >= 2 ? GOLD : p >= 1 ? "#fb923c" : "#f87171";

              const scoreCell = (gross: number | null, nr: boolean, isBest: boolean, isMyTeam: boolean) => (
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 8,
                  backgroundColor: isBest ? (isMyTeam ? "#16a34a18" : "#3b82f618") : "transparent",
                  borderRightWidth: HW, borderRightColor: bdr }}>
                  <Text style={{ fontSize: 11,
                    fontFamily: isBest ? "Inter_700Bold" : "Inter_400Regular",
                    color: isBest ? (isMyTeam ? "#22c55e" : "#60a5fa") : nr ? colors.mutedForeground : gross != null ? colors.foreground : colors.mutedForeground }}>
                    {nr ? "NR" : gross != null ? String(gross) : "—"}
                  </Text>
                </View>
              );

              const TotRow = (label: string, par: number, isLast: boolean,
                mg: number, pg: number, o1g: number, o2g: number,
                ag: number, an: number, ap: number) => (
                <View key={label} style={{ flexDirection: "row",
                  backgroundColor: isLast ? pBg : pBg + "e0",
                  borderTopWidth: isLast ? 1.5 : HW,
                  borderTopColor: isLast ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.2)" }}>
                  <View style={{ width: 28, alignItems: "center", justifyContent: "center",
                    borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.2)", paddingVertical: 7 }}>
                    <Text style={{ fontSize: 8, fontFamily: "Inter_700Bold",
                      color: isLast ? GOLD : "rgba(255,255,255,0.8)" }}>{label}</Text>
                  </View>
                  <View style={{ width: 26, alignItems: "center", justifyContent: "center",
                    borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.2)" }}>
                    <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: "#fff" }}>{par}</Text>
                  </View>
                  <View style={{ width: 24, borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.2)" }} />
                  {[mg, pg, o1g, o2g].map((g, i) => (
                    <View key={i} style={{ flex: 1, alignItems: "center", justifyContent: "center",
                      borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.2)" }}>
                      <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: "#fff" }}>{g > 0 ? String(g) : "—"}</Text>
                    </View>
                  ))}
                  <View style={{ width: 26, borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.2)" }} />
                  <View style={{ flex: 1, alignItems: "center", justifyContent: "center",
                    borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.2)" }}>
                    <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: "#fff" }}>{ag > 0 ? String(ag) : "—"}</Text>
                  </View>
                  <View style={{ flex: 1, alignItems: "center", justifyContent: "center",
                    borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.2)" }}>
                    <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: "#a3e4bc" }}>{an !== 0 || ag > 0 ? String(an) : "—"}</Text>
                  </View>
                  <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: GOLD }}>{ap > 0 || (ag > 0) ? String(ap) : "—"}</Text>
                  </View>
                </View>
              );

              return (
                <View style={{ borderRadius: 10, borderWidth: HW, borderColor: bdr, overflow: "hidden" }}>
                  {/* Header row 1: group labels */}
                  <View style={{ flexDirection: "row", backgroundColor: pBg, paddingVertical: 6 }}>
                    <View style={{ width: 28, alignItems: "center", borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.25)" }}>
                      <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: "#fff" }}>H</Text>
                    </View>
                    <View style={{ width: 26, alignItems: "center", borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.25)" }}>
                      <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: "#fff" }}>Par</Text>
                    </View>
                    <View style={{ width: 24, alignItems: "center", borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.25)" }}>
                      <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: "rgba(255,255,255,0.6)" }}>SI</Text>
                    </View>
                    {/* Team A */}
                    <View style={{ flex: 2, alignItems: "center", borderRightWidth: 1.5, borderRightColor: "rgba(255,255,255,0.4)" }}>
                      <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: "#a3e4bc" }}>Team A</Text>
                    </View>
                    {/* Team B */}
                    <View style={{ flex: 2, alignItems: "center", borderRightWidth: 1.5, borderRightColor: "rgba(255,255,255,0.4)" }}>
                      <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: "#fca5a5" }}>Team B</Text>
                    </View>
                    {/* Best Ball summary header */}
                    <View style={{ width: 26, borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.25)" }} />
                    <View style={{ flex: 3, alignItems: "center" }}>
                      <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: GOLD }}>Best Ball</Text>
                    </View>
                  </View>
                  {/* Header row 2: player names + column labels */}
                  <View style={{ flexDirection: "row", backgroundColor: pBg + "cc",
                    borderBottomWidth: 1.5, borderBottomColor: bdr }}>
                    <View style={{ width: 28, borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.15)" }} />
                    <View style={{ width: 26, borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.15)" }} />
                    <View style={{ width: 24, borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.15)" }} />
                    {[meLabel, prtLabel, opp1Label, opp2Label].map((lbl, i) => (
                      <View key={i} style={{ flex: 1, alignItems: "center", paddingVertical: 3,
                        borderRightWidth: i === 1 ? 1.5 : HW,
                        borderRightColor: i === 1 ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.2)" }}>
                        <Text style={{ fontSize: 7, fontFamily: "Inter_700Bold",
                          color: i < 2 ? "#a3e4bc" : "#fca5a5", letterSpacing: 0.2 }}>{lbl}</Text>
                      </View>
                    ))}
                    <View style={{ width: 26, alignItems: "center", paddingVertical: 3,
                      borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.2)" }}>
                      <Text style={{ fontSize: 7, fontFamily: "Inter_700Bold", color: GOLD }}>HC</Text>
                    </View>
                    {["Gross","Net","Pts"].map((lbl, i) => (
                      <View key={lbl} style={{ flex: 1, alignItems: "center", paddingVertical: 3,
                        borderRightWidth: i < 2 ? HW : 0,
                        borderRightColor: "rgba(255,255,255,0.2)" }}>
                        <Text style={{ fontSize: 7, fontFamily: "Inter_700Bold",
                          color: lbl === "Pts" ? GOLD : lbl === "Net" ? "#a3e4bc" : "rgba(255,255,255,0.7)" }}>{lbl}</Text>
                      </View>
                    ))}
                  </View>

                  {/* Hole rows */}
                  {holeData.map(({ h, myG, prtG, opp1G, opp2G, myBest, prtBest, myHa, aBestG, aBestN, aBestP,
                                   myNr, prtNr, opp1Nr, opp2Nr }, idx) => {
                    const rowBg = idx % 2 === 0 ? colors.card
                      : (colors.card === "#fff" || colors.card === "#ffffff" ? "#f7faf8" : colors.background);
                    return (
                      <React.Fragment key={h.number}>
                        <View style={{ flexDirection: "row", backgroundColor: rowBg,
                          borderBottomWidth: HW, borderBottomColor: bdr, alignItems: "center" }}>
                          <View style={{ width: 28, alignItems: "center", justifyContent: "center", paddingVertical: 9,
                            borderRightWidth: HW, borderRightColor: bdr }}>
                            <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: colors.foreground }}>{h.number}</Text>
                          </View>
                          <View style={{ width: 26, alignItems: "center", justifyContent: "center",
                            borderRightWidth: HW, borderRightColor: bdr }}>
                            <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>{h.par}</Text>
                          </View>
                          <View style={{ width: 24, alignItems: "center", justifyContent: "center",
                            borderRightWidth: HW, borderRightColor: bdr }}>
                            <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>{h.stroke_index}</Text>
                          </View>
                          {scoreCell(myG,   myNr,   myBest,  true)}
                          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 8,
                            backgroundColor: prtBest ? "#16a34a18" : "transparent",
                            borderRightWidth: 1.5, borderRightColor: bdr }}>
                            <Text style={{ fontSize: 11, fontFamily: prtBest ? "Inter_700Bold" : "Inter_400Regular",
                              color: prtBest ? "#22c55e" : prtNr ? colors.mutedForeground : prtG != null ? colors.foreground : colors.mutedForeground }}>
                              {prtNr ? "NR" : prtG != null ? String(prtG) : "—"}
                            </Text>
                          </View>
                          {scoreCell(opp1G, opp1Nr, false, false)}
                          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 8,
                            borderRightWidth: 1.5, borderRightColor: bdr }}>
                            <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular",
                              color: opp2Nr ? colors.mutedForeground : opp2G != null ? colors.foreground : colors.mutedForeground }}>
                              {opp2Nr ? "NR" : opp2G != null ? String(opp2G) : "—"}
                            </Text>
                          </View>
                          {/* HC strokes for my hole */}
                          <View style={{ width: 26, alignItems: "center", justifyContent: "center",
                            borderRightWidth: HW, borderRightColor: bdr }}>
                            <Text style={{ fontSize: 11, fontFamily: myHa > 0 ? "Inter_700Bold" : "Inter_400Regular",
                              color: myHa > 0 ? GOLD : colors.mutedForeground }}>
                              {myHa > 0 ? `+${myHa}` : "0"}
                            </Text>
                          </View>
                          {/* Best Gross */}
                          <View style={{ flex: 1, alignItems: "center", justifyContent: "center",
                            borderRightWidth: HW, borderRightColor: bdr }}>
                            <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular",
                              color: aBestG != null ? colors.foreground : colors.mutedForeground }}>
                              {aBestG != null ? String(aBestG) : "—"}
                            </Text>
                          </View>
                          {/* Best Net */}
                          <View style={{ flex: 1, alignItems: "center", justifyContent: "center",
                            borderRightWidth: HW, borderRightColor: bdr }}>
                            <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular",
                              color: aBestN != null ? colors.primary : colors.mutedForeground }}>
                              {aBestN != null ? String(aBestN) : "—"}
                            </Text>
                          </View>
                          {/* Best Pts */}
                          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                            <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold",
                              color: ptsColor(aBestP) }}>
                              {aBestP != null ? String(aBestP) : "—"}
                            </Text>
                          </View>
                        </View>
                        {h.number === 9 && TotRow("OUT", f9Par, false,
                          myF9G, prtF9G, o1F9G, o2F9G, aBestF9G, aBestF9N, aBestF9P)}
                      </React.Fragment>
                    );
                  })}
                  {TotRow("IN",  b9Par, false, myB9G, prtB9G, o1B9G, o2B9G, aBestB9G, aBestB9N, aBestB9P)}
                  {TotRow("TOT", totPar, true, myTotG, prtTotG, o1TotG, o2TotG, aBestTotG, aBestTotN, aBestTotP)}
                  {[
                    { label: "HCAP", vals: [myHcp, prtHcp, opp1Hcp, opp2Hcp], fmt: (v: number) => String(v) },
                    { label: "NETT", vals: [myTotG - myHcp, prtTotG - prtHcp, o1TotG - opp1Hcp, o2TotG - opp2Hcp], fmt: (v: number, i: number) => ([myTotG, prtTotG, o1TotG, o2TotG][i] > 0 ? String(v) : "—") },
                  ].map(({ label, vals, fmt }) => (
                    <View key={label} style={{ flexDirection: "row", backgroundColor: "#f0f7f3",
                      borderTopWidth: HW, borderTopColor: bdr }}>
                      <View style={{ width: 28, alignItems: "center", justifyContent: "center", paddingVertical: 6,
                        borderRightWidth: HW, borderRightColor: bdr }}>
                        <Text style={{ fontSize: 7, fontFamily: "Inter_700Bold", letterSpacing: 0.5,
                          color: label === "HCAP" ? "#9a7a1e" : colors.primary }}>{label}</Text>
                      </View>
                      <View style={{ width: 26, borderRightWidth: HW, borderRightColor: bdr }} />
                      <View style={{ width: 24, borderRightWidth: HW, borderRightColor: bdr }} />
                      {vals.map((v, i) => (
                        <View key={i} style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 6,
                          borderRightWidth: i === 1 ? 1.5 : i < 3 ? HW : 0,
                          borderRightColor: bdr }}>
                          <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold",
                            color: i < 2 ? colors.primary : "#b91c1c" }}>{fmt(v, i)}</Text>
                        </View>
                      ))}
                      {/* HC + Best Ball cols: empty */}
                      <View style={{ width: 26, borderRightWidth: HW, borderRightColor: bdr }} />
                      <View style={{ flex: 3 }} />
                    </View>
                  ))}
                </View>
              );
            })()
          ) : isMatchPlay && round.playerHoles ? (
            // ── Singles Match Play 2-player scorecard ─────────────────────
            (() => {
              const myHcp  = round.playing_handicap;
              const oppHcp = round.opponent_playing_hcp ?? 0;
              const HW  = StyleSheet.hairlineWidth;
              const bdr = colors.border;
              const pBg = colors.primary;

              const meLabel  = "Me";
              const oppLabel = (round.opponent_name ?? "Opponent").split(" ")[0].slice(0, 7);

              let myTotG = 0, oppTotG = 0;
              let myTotN = 0, oppTotN = 0;
              let myF9G = 0, oppF9G = 0, myB9G = 0, oppB9G = 0;
              let myF9N = 0, oppF9N = 0, myB9N = 0, oppB9N = 0;
              let totW = 0, totL = 0, totH = 0;
              let f9W = 0, f9L = 0, f9H = 0;
              let b9W = 0, b9L = 0, b9H = 0;

              const holeData = sc.map(h => {
                const mySaved  = holes[h.number];
                const oppSaved = round.playerHoles![`0_${h.number}`];

                const myG  = mySaved?.is_nr  ? null : mySaved?.gross_score  ?? null;
                const oppG = oppSaved?.is_nr ? null : oppSaved?.gross_score ?? null;

                const myHa  = getHA(h.stroke_index, myHcp);
                const oppHa = getHA(h.stroke_index, oppHcp);
                const myN   = myG  != null ? myG  - myHa  : null;
                const oppN  = oppG != null ? oppG - oppHa : null;

                let res: "W" | "L" | "H" | null = null;
                if (myN != null && oppN != null) {
                  if      (myN < oppN) { res = "W"; totW++; }
                  else if (myN > oppN) { res = "L"; totL++; }
                  else                 { res = "H"; totH++; }
                }

                const isFront = h.number <= 9;
                if (myG  != null) { myTotG  += myG;  if (isFront) myF9G  += myG;  else myB9G  += myG;  }
                if (oppG != null) { oppTotG += oppG; if (isFront) oppF9G += oppG; else oppB9G += oppG; }
                if (myN  != null) { myTotN  += myN;  if (isFront) myF9N  += myN;  else myB9N  += myN;  }
                if (oppN != null) { oppTotN += oppN; if (isFront) oppF9N += oppN; else oppB9N += oppN; }
                if (res === "W") { if (isFront) f9W++; else b9W++; }
                if (res === "L") { if (isFront) f9L++; else b9L++; }
                if (res === "H") { if (isFront) f9H++; else b9H++; }

                return { h, myG, oppG, myN, oppN, res, myNr: !!mySaved?.is_nr, oppNr: !!oppSaved?.is_nr };
              });

              const resColor = (r: "W"|"L"|"H"|null) =>
                r === "W" ? "#22c55e" : r === "L" ? "#f87171" : r === "H" ? GOLD : colors.mutedForeground;

              const playerPair = (gross: number|null, net: number|null, nr: boolean, isMe: boolean, last: boolean) => {
                const rb = last
                  ? { borderRightWidth: 1.5, borderRightColor: bdr }
                  : { borderRightWidth: HW,  borderRightColor: bdr };
                const nameColor = isMe ? colors.primary : "#b91c1c";
                return (
                  <View style={[{ flex: 2, flexDirection: "row" }, rb]}>
                    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 8,
                      borderRightWidth: HW, borderRightColor: bdr }}>
                      <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular",
                        color: nr ? colors.mutedForeground : gross != null ? (isMe ? colors.primary : "#b91c1c") : colors.mutedForeground }}>
                        {nr ? "NR" : gross != null ? String(gross) : "—"}
                      </Text>
                    </View>
                    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 8 }}>
                      <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular",
                        color: net != null ? nameColor : colors.mutedForeground }}>
                        {nr ? "—" : net != null ? String(net) : "—"}
                      </Text>
                    </View>
                  </View>
                );
              };

              const f9Par  = sc.filter(h => h.number <= 9).reduce((s,h) => s+h.par, 0);
              const b9Par  = sc.filter(h => h.number >  9).reduce((s,h) => s+h.par, 0);
              const totPar = f9Par + b9Par;

              const TotRow = (label: string, par: number, isLast: boolean,
                mg: number, mn: number, og: number, on: number, w: number, l: number, hv: number) => (
                <View key={label} style={{ flexDirection: "row",
                  backgroundColor: isLast ? pBg : pBg + "e0",
                  borderTopWidth: isLast ? 1.5 : HW,
                  borderTopColor: isLast ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.2)" }}>
                  <View style={{ width: 28, alignItems: "center", justifyContent: "center",
                    borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.2)" }}>
                    <Text style={{ fontSize: 8, fontFamily: "Inter_700Bold",
                      color: isLast ? GOLD : "rgba(255,255,255,0.8)" }}>{label}</Text>
                  </View>
                  <View style={{ width: 26, alignItems: "center", justifyContent: "center",
                    borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.2)" }}>
                    <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: "#fff" }}>{par}</Text>
                  </View>
                  <View style={{ width: 24, borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.2)" }} />
                  {/* Me gross + net */}
                  <View style={{ flex: 2, flexDirection: "row", borderRightWidth: 1.5, borderRightColor: "rgba(255,255,255,0.35)" }}>
                    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 7,
                      borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.2)" }}>
                      <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: "#fff" }}>{mg > 0 ? String(mg) : "—"}</Text>
                    </View>
                    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 7 }}>
                      <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: "#a3e4bc" }}>{mn !== 0 || mg > 0 ? String(mn) : "—"}</Text>
                    </View>
                  </View>
                  {/* Opp gross + net */}
                  <View style={{ flex: 2, flexDirection: "row", borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.2)" }}>
                    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 7,
                      borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.2)" }}>
                      <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: "#fff" }}>{og > 0 ? String(og) : "—"}</Text>
                    </View>
                    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 7 }}>
                      <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: "#fca5a5" }}>{on !== 0 || og > 0 ? String(on) : "—"}</Text>
                    </View>
                  </View>
                  <View style={{ width: 32, alignItems: "center", justifyContent: "center", gap: 1 }}>
                    <Text style={{ fontSize: 8, fontFamily: "Inter_700Bold", color: "#4ade80" }}>{w}W</Text>
                    <Text style={{ fontSize: 8, fontFamily: "Inter_700Bold", color: "#f87171" }}>{l}L</Text>
                    <Text style={{ fontSize: 8, fontFamily: "Inter_700Bold", color: GOLD }}>{hv}H</Text>
                  </View>
                </View>
              );

              return (
                <View style={{ borderRadius: 10, borderWidth: HW, borderColor: bdr, overflow: "hidden" }}>
                  {/* Header row 1: player names */}
                  <View style={{ flexDirection: "row", backgroundColor: pBg, paddingVertical: 7 }}>
                    <View style={{ width: 28, alignItems: "center", borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.25)" }}>
                      <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: "#fff" }}>H</Text>
                    </View>
                    <View style={{ width: 26, alignItems: "center", borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.25)" }}>
                      <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: "#fff" }}>Par</Text>
                    </View>
                    <View style={{ width: 24, alignItems: "center", borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.25)" }}>
                      <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: "rgba(255,255,255,0.6)" }}>SI</Text>
                    </View>
                    <View style={{ flex: 2, alignItems: "center", borderRightWidth: 1.5, borderRightColor: "rgba(255,255,255,0.3)" }}>
                      <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: "#a3e4bc" }}>{meLabel}</Text>
                    </View>
                    <View style={{ flex: 2, alignItems: "center", borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.3)" }}>
                      <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: "#fca5a5" }}>{oppLabel}</Text>
                    </View>
                    <View style={{ width: 32, alignItems: "center" }}>
                      <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: "#fff" }}>Res</Text>
                    </View>
                  </View>
                  {/* Header row 2: Score / Net sub-labels */}
                  <View style={{ flexDirection: "row", backgroundColor: pBg + "cc",
                    borderBottomWidth: 1.5, borderBottomColor: bdr }}>
                    <View style={{ width: 28, borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.15)" }} />
                    <View style={{ width: 26, borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.15)" }} />
                    <View style={{ width: 24, borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.15)" }} />
                    {[{rb:HW},{rb:1.5},{rb:HW},{rb:HW}].map(({rb},i) => (
                      <View key={i} style={{ flex: 1, alignItems: "center", paddingVertical: 3,
                        borderRightWidth: rb, borderRightColor: "rgba(255,255,255,0.2)" }}>
                        <Text style={{ fontSize: 7, fontFamily: "Inter_700Bold",
                          color: "rgba(255,255,255,0.55)", letterSpacing: 0.3 }}>
                          {i % 2 === 0 ? "Score" : "Net"}
                        </Text>
                      </View>
                    ))}
                    <View style={{ width: 32 }} />
                  </View>
                  {/* Hole rows */}
                  {holeData.map(({ h, myG, oppG, myN, oppN, res, myNr, oppNr }, idx) => {
                    const rowBg = idx % 2 === 0 ? colors.card
                      : (colors.card === "#fff" || colors.card === "#ffffff" ? "#f7faf8" : colors.background);
                    const rc = resColor(res);
                    return (
                      <React.Fragment key={h.number}>
                        <View style={{ flexDirection: "row", backgroundColor: rowBg,
                          borderBottomWidth: HW, borderBottomColor: bdr }}>
                          <View style={{ width: 28, alignItems: "center", justifyContent: "center",
                            borderRightWidth: HW, borderRightColor: bdr }}>
                            <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: colors.foreground }}>{h.number}</Text>
                          </View>
                          <View style={{ width: 26, alignItems: "center", justifyContent: "center",
                            borderRightWidth: HW, borderRightColor: bdr }}>
                            <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>{h.par}</Text>
                          </View>
                          <View style={{ width: 24, alignItems: "center", justifyContent: "center",
                            borderRightWidth: HW, borderRightColor: bdr }}>
                            <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>{h.stroke_index}</Text>
                          </View>
                          {playerPair(myG,  myN,  myNr,  true,  true)}
                          {playerPair(oppG, oppN, oppNr, false, false)}
                          <View style={{ width: 32, alignItems: "center", justifyContent: "center" }}>
                            <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: rc }}>{res ?? "—"}</Text>
                          </View>
                        </View>
                        {h.number === 9 && TotRow("OUT", f9Par, false, myF9G, myF9N, oppF9G, oppF9N, f9W, f9L, f9H)}
                      </React.Fragment>
                    );
                  })}
                  {TotRow("IN",  b9Par,  false, myB9G, myB9N, oppB9G, oppB9N, b9W, b9L, b9H)}
                  {TotRow("TOT", totPar, true,  myTotG, myTotN, oppTotG, oppTotN, totW, totL, totH)}
                  {[
                    { label: "HCAP", myVal: myHcp, oppVal: oppHcp, fmt: (v: number) => String(v) },
                    { label: "NETT", myVal: myTotG - myHcp, oppVal: oppTotG - oppHcp, fmt: (v: number, gross: number) => gross > 0 ? String(v) : "—" },
                  ].map(({ label, myVal, oppVal, fmt }) => (
                    <View key={label} style={{ flexDirection: "row", backgroundColor: "#f0f7f3",
                      borderTopWidth: HW, borderTopColor: bdr }}>
                      <View style={{ width: 28, alignItems: "center", justifyContent: "center", paddingVertical: 6,
                        borderRightWidth: HW, borderRightColor: bdr }}>
                        <Text style={{ fontSize: 7, fontFamily: "Inter_700Bold", letterSpacing: 0.5,
                          color: label === "HCAP" ? "#9a7a1e" : colors.primary }}>{label}</Text>
                      </View>
                      <View style={{ width: 26, borderRightWidth: HW, borderRightColor: bdr }} />
                      <View style={{ width: 24, borderRightWidth: HW, borderRightColor: bdr }} />
                      <View style={{ flex: 2, alignItems: "center", justifyContent: "center", paddingVertical: 6,
                        borderRightWidth: 1.5, borderRightColor: bdr }}>
                        <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: colors.primary }}>
                          {label === "HCAP" ? fmt(myVal) : fmt(myVal, myTotG)}
                        </Text>
                      </View>
                      <View style={{ flex: 2, alignItems: "center", justifyContent: "center", paddingVertical: 6,
                        borderRightWidth: HW, borderRightColor: bdr }}>
                        <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: "#b91c1c" }}>
                          {label === "HCAP" ? fmt(oppVal) : fmt(oppVal, oppTotG)}
                        </Text>
                      </View>
                      <View style={{ width: 32 }} />
                    </View>
                  ))}
                </View>
              );
            })()
          ) : (
            // ── Solo scorecard (all other formats) — rich table style ──────
            (() => {
              const ph  = round.playing_handicap;
              const HW  = StyleSheet.hairlineWidth;
              const bdr = colors.border;
              const pBg = colors.primary;

              const isStableford = round.format === "individual_stableford";
              const isGross      = round.format === "gross_stroke_play";

              let f9G = 0, b9G = 0, f9N = 0, b9N = 0, f9P = 0, b9P = 0;
              let f9Par = 0, b9Par = 0;

              const holeData = sc.map(h => {
                const saved = holes[h.number];
                const ha    = getHA(h.stroke_index, ph);
                const nr    = !!saved?.is_nr;
                const gross = nr ? null : saved?.gross_score ?? null;
                const net   = nr ? null : saved?.net_score   ?? null;
                const pts   = nr ? 0    : saved?.stableford_points ?? null;
                const diff  = gross != null ? gross - h.par : null;

                const isFront = h.number <= 9;
                if (gross != null) { if (isFront) f9G += gross; else b9G += gross; }
                if (net   != null) { if (isFront) f9N += net;   else b9N += net;   }
                if (pts   != null && !nr) { if (isFront) f9P += pts; else b9P += pts; }
                if (isFront) f9Par += h.par; else b9Par += h.par;

                return { h, ha, nr, gross, net, pts, diff };
              });

              const totPar = f9Par + b9Par;

              const ptsColor = (p: number | null) =>
                p == null ? colors.mutedForeground
                : p >= 3  ? "#22c55e"
                : p >= 2  ? GOLD
                : p >= 1  ? "#fb923c"
                : "#f87171";

              const grossColor = (d: number | null) => {
                if (d == null) return colors.mutedForeground;
                const ss = scoreStyle(d);
                return ss.text;
              };
              const grossBorder = (d: number | null) =>
                d != null ? scoreStyle(d).border : undefined;

              const TotRow = (label: string, par: number, g: number, n: number, p: number, isLast: boolean) => (
                <View key={label} style={{ flexDirection: "row",
                  backgroundColor: isLast ? pBg : pBg + "e0",
                  borderTopWidth: isLast ? 1.5 : HW,
                  borderTopColor: isLast ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.2)" }}>
                  {/* Label */}
                  <View style={{ width: 28, alignItems: "center", justifyContent: "center",
                    borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.2)", paddingVertical: 7 }}>
                    <Text style={{ fontSize: 8, fontFamily: "Inter_700Bold",
                      color: isLast ? GOLD : "rgba(255,255,255,0.8)" }}>{label}</Text>
                  </View>
                  {/* Par */}
                  <View style={{ width: 26, alignItems: "center", justifyContent: "center",
                    borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.2)" }}>
                    <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: "#fff" }}>{par}</Text>
                  </View>
                  {/* SI placeholder */}
                  <View style={{ flex: 1, borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.2)" }} />
                  {/* HC placeholder */}
                  <View style={{ flex: 1, alignItems: "center", justifyContent: "center",
                    borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.2)" }}>
                    <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: GOLD }}>{ph}</Text>
                  </View>
                  {/* Gross */}
                  <View style={{ flex: 1, alignItems: "center", justifyContent: "center",
                    borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.2)" }}>
                    <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: "#fff" }}>{g || "—"}</Text>
                  </View>
                  {/* Net */}
                  {!isGross && (
                    <View style={{ flex: 1, alignItems: "center", justifyContent: "center",
                      borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.2)" }}>
                      <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: "#a3e4bc" }}>{n || "—"}</Text>
                    </View>
                  )}
                  {/* Pts */}
                  {!isGross && (
                    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: GOLD }}>{p}</Text>
                    </View>
                  )}
                </View>
              );

              const cols = isGross
                ? ["Hole","Par","SI","H/C","Gross"]
                : ["Hole","Par","SI","H/C","Gross","Net","Pts"];

              return (
                <View style={{ borderRadius: 10, borderWidth: HW, borderColor: bdr, overflow: "hidden" }}>
                  {/* Header */}
                  <View style={{ flexDirection: "row", backgroundColor: pBg, paddingVertical: 8,
                    borderBottomWidth: 1.5, borderBottomColor: bdr }}>
                    <View style={{ width: 28, alignItems: "center", borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.25)" }}>
                      <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: "#fff" }}>H</Text>
                    </View>
                    <View style={{ width: 26, alignItems: "center", borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.25)" }}>
                      <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: "#fff" }}>Par</Text>
                    </View>
                    <View style={{ flex: 1, alignItems: "center", borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.25)" }}>
                      <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: "#fff" }}>SI</Text>
                    </View>
                    <View style={{ flex: 1, alignItems: "center", borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.25)" }}>
                      <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: GOLD }}>H/C</Text>
                    </View>
                    <View style={{ flex: 1, alignItems: "center", borderRightWidth: isGross ? 0 : HW, borderRightColor: "rgba(255,255,255,0.25)" }}>
                      <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: "#fff" }}>Gross</Text>
                    </View>
                    {!isGross && (
                      <View style={{ flex: 1, alignItems: "center", borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.25)" }}>
                        <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: "#a3e4bc" }}>Net</Text>
                      </View>
                    )}
                    {!isGross && (
                      <View style={{ flex: 1, alignItems: "center" }}>
                        <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: GOLD }}>Pts</Text>
                      </View>
                    )}
                  </View>

                  {/* Hole rows */}
                  {holeData.map(({ h, ha, nr, gross, net, pts, diff }, idx) => {
                    const rowBg = idx % 2 === 0 ? colors.card
                      : (colors.card === "#fff" || colors.card === "#ffffff" ? "#f7faf8" : colors.background);
                    const gc  = grossColor(diff);
                    const gb  = grossBorder(diff);
                    return (
                      <React.Fragment key={h.number}>
                        <View style={{ flexDirection: "row", backgroundColor: rowBg,
                          borderBottomWidth: HW, borderBottomColor: bdr, alignItems: "center" }}>
                          {/* Hole */}
                          <View style={{ width: 28, alignItems: "center", justifyContent: "center", paddingVertical: 9,
                            borderRightWidth: HW, borderRightColor: bdr }}>
                            <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: colors.foreground }}>{h.number}</Text>
                          </View>
                          {/* Par */}
                          <View style={{ width: 26, alignItems: "center", justifyContent: "center",
                            borderRightWidth: HW, borderRightColor: bdr }}>
                            <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>{h.par}</Text>
                          </View>
                          {/* SI */}
                          <View style={{ flex: 1, alignItems: "center", justifyContent: "center",
                            borderRightWidth: HW, borderRightColor: bdr }}>
                            <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>{h.stroke_index}</Text>
                          </View>
                          {/* HC strokes */}
                          <View style={{ flex: 1, alignItems: "center", justifyContent: "center",
                            borderRightWidth: HW, borderRightColor: bdr }}>
                            <Text style={{ fontSize: 11,
                              fontFamily: ha > 0 ? "Inter_700Bold" : "Inter_400Regular",
                              color: ha > 0 ? GOLD : colors.mutedForeground }}>
                              {ha > 0 ? `+${ha}` : "0"}
                            </Text>
                          </View>
                          {/* Gross */}
                          <View style={{ flex: 1, alignItems: "center", justifyContent: "center",
                            borderRightWidth: isGross ? 0 : HW, borderRightColor: bdr, paddingVertical: 4 }}>
                            {gb ? (
                              <View style={{ borderWidth: 1.5, borderColor: gb, borderRadius: 5,
                                paddingHorizontal: 4, paddingVertical: 1 }}>
                                <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: gc }}>
                                  {nr ? "NR" : gross != null ? String(gross) : "—"}
                                </Text>
                              </View>
                            ) : (
                              <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: gc }}>
                                {nr ? "NR" : gross != null ? String(gross) : "—"}
                              </Text>
                            )}
                          </View>
                          {/* Net */}
                          {!isGross && (
                            <View style={{ flex: 1, alignItems: "center", justifyContent: "center",
                              borderRightWidth: HW, borderRightColor: bdr }}>
                              <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular",
                                color: net != null ? colors.primary : colors.mutedForeground }}>
                                {nr ? "—" : net != null ? String(net) : "—"}
                              </Text>
                            </View>
                          )}
                          {/* Pts */}
                          {!isGross && (
                            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                              <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold",
                                color: ptsColor(pts) }}>
                                {nr ? "0" : pts != null ? String(pts) : "—"}
                              </Text>
                            </View>
                          )}
                        </View>
                        {h.number === 9 && TotRow("OUT", f9Par, f9G, f9N, f9P, false)}
                      </React.Fragment>
                    );
                  })}
                  {TotRow("IN",  b9Par, b9G, b9N, b9P, false)}
                  {TotRow("TOT", totPar, f9G + b9G, f9N + b9N, f9P + b9P, true)}
                  {[
                    { label: "HCAP", hcVal: ph, grossVal: null as number | null },
                    { label: "NETT", hcVal: null as number | null, grossVal: (f9G + b9G) > 0 ? (f9G + b9G) - ph : null },
                  ].map(({ label, hcVal, grossVal }) => (
                    <View key={label} style={{ flexDirection: "row", backgroundColor: "#f0f7f3",
                      borderTopWidth: HW, borderTopColor: bdr }}>
                      <View style={{ width: 28, alignItems: "center", justifyContent: "center", paddingVertical: 6,
                        borderRightWidth: HW, borderRightColor: bdr }}>
                        <Text style={{ fontSize: 7, fontFamily: "Inter_700Bold", letterSpacing: 0.5,
                          color: label === "HCAP" ? "#9a7a1e" : colors.primary }}>{label}</Text>
                      </View>
                      {/* Par */}
                      <View style={{ width: 26, borderRightWidth: HW, borderRightColor: bdr }} />
                      {/* SI */}
                      <View style={{ flex: 1, borderRightWidth: HW, borderRightColor: bdr }} />
                      {/* HC */}
                      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 6,
                        borderRightWidth: HW, borderRightColor: bdr }}>
                        <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: "#9a7a1e" }}>
                          {hcVal != null ? String(hcVal) : ""}
                        </Text>
                      </View>
                      {/* Gross */}
                      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 6,
                        borderRightWidth: !isGross ? HW : 0, borderRightColor: bdr }}>
                        <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: colors.primary }}>
                          {grossVal != null ? String(grossVal) : ""}
                        </Text>
                      </View>
                      {!isGross && <View style={{ flex: 1, borderRightWidth: HW, borderRightColor: bdr }} />}
                      {!isGross && <View style={{ flex: 1 }} />}
                    </View>
                  ))}
                </View>
              );
            })()
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
            {round.tournament_id && round.score_submitted && (
              <View style={[styles.footerBtn, { backgroundColor: "#16a34a22", borderWidth: 1.5, borderColor: "#16a34a60" }]}>
                <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
                <Text style={[styles.footerBtnText, { color: "#16a34a" }]}>Score Submitted to Club ✓</Text>
              </View>
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
