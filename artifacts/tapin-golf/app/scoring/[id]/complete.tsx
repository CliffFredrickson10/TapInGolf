import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
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
import ScorecardUnified from "@/components/ScorecardUnified";

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
  score_disputed?: number;
  marker_name?: string | null;
  marker_hole_scores?: Record<string, number> | null;
  scorecard: ScorecardHole[];
  holes: Record<number, SavedHole>;
  opponent_name?: string | null;
  opponent_playing_hcp?: number;
  opponent_tee_color?: string | null;
  partner_name?: string | null;
  partner_playing_hcp?: number;
  partner_tee_color?: string | null;
  opponent2_name?: string | null;
  opponent2_playing_hcp?: number;
  opponent2_tee_color?: string | null;
  match_id?: number | null;
  match_result?: string | null;
  match_status?: string | null;
  match_dispute?: boolean;
  match_winner_id?: number | null;
  playerHoles?: Record<string, { gross_score: number | null; is_nr: number }>;
};

const FORMAT_LABELS: Record<string, string> = {
  individual_stableford:       "Individual Stableford",
  gross_stroke_play:           "Gross Stroke Play",
  net_stroke_play:             "Nett Stroke Play (Medal)",
  par_bogey:                   "Par / Bogey Competition",
  individual_par:              "Individual Par Competition",
  individual_bogey:            "Individual Bogey Competition",
  modified_stableford:         "Modified Stableford",
  individual_bonus_bogey:      "Individual Bonus Bogey",
  chairman:                    "Chairman (The Perch)",
  maximum_score:               "Maximum Score",
  fourball_stableford:         "Betterball Stableford (4BBB)",
  fourball_gross_betterball:   "Four-Ball Gross Betterball",
  fourball_net_betterball:     "Four-Ball Net Betterball",
  shamble:                     "Shamble",
  best_ball_aggregate:         "Best Ball Aggregate",
  high_low:                    "High-Low",
  daytona:                     "Daytona (Las Vegas)",
  low_ball_total:              "Low Ball / Total Score",
  the_ghost:                   "The Ghost",
  betterball_bonus_bogey:      "Betterball Bonus Bogey",
  pinehurst_points:            "Multiplication Betterball (Pinehurst)",
  alliance:                    "Alliance",
  american_scramble:           "American Scramble",
  texas_scramble:              "Texas Scramble",
  chapman:                     "Greensomes (Chapman/Pinehurst)",
  singles_match_play:          "Singles Match Play",
  singles_stableford_match_play: "Singles Stableford Match Play",
  singles_gross_match_play:    "Singles Gross Match Play",
  betterball_match_play:       "Betterball Match Play",
  betterball_gross_match_play: "Betterball Gross Match Play",
  fourball_stableford_match_play: "Betterball Stableford Match Play",
  other:                       "Other / Custom",
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
    // WHS standard: only handicap DIFFERENCE is applied
    const myNet  = mine.gross_score - getHA(h.stroke_index, Math.max(0, myHcp  - oppHcp));
    const oppNet = opp.gross_score  - getHA(h.stroke_index, Math.max(0, oppHcp - myHcp));
    if      (myNet < oppNet) won++;
    else if (myNet > oppNet) lost++;
    else                     halved++;
  }
  const holesPlayed    = won + lost + halved;
  const holesRemaining = sc.length - holesPlayed;
  const holesUp        = won - lost;
  return { holesUp, holesPlayed, holesRemaining, won, lost, halved, ...buildMatchLabel(holesUp, holesPlayed, holesRemaining, won, lost, halved) };
}

function calcMatchResultByPts(
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
    // WHS standard: only handicap DIFFERENCE is applied
    const myPts  = calcPts(mine.gross_score, h.par, getHA(h.stroke_index, Math.max(0, myHcp  - oppHcp)));
    const oppPts = calcPts(opp.gross_score,  h.par, getHA(h.stroke_index, Math.max(0, oppHcp - myHcp)));
    if      (myPts > oppPts) won++;
    else if (myPts < oppPts) lost++;
    else                     halved++;
  }
  const holesPlayed    = won + lost + halved;
  const holesRemaining = sc.length - holesPlayed;
  const holesUp        = won - lost;
  return { holesUp, holesPlayed, holesRemaining, won, lost, halved, ...buildMatchLabel(holesUp, holesPlayed, holesRemaining, won, lost, halved) };
}

function calcMatchResultByGross(
  sc: ScorecardHole[],
  myHoles: Record<number, SavedHole>,
  playerHoles: Record<string, { gross_score: number | null; is_nr: number }>
) {
  let won = 0, lost = 0, halved = 0;
  for (const h of sc) {
    const mine = myHoles[h.number];
    const opp  = playerHoles[`0_${h.number}`];
    if (!mine || !opp || mine.is_nr || opp.is_nr || mine.gross_score == null || opp.gross_score == null) continue;
    if      (mine.gross_score < opp.gross_score) won++;
    else if (mine.gross_score > opp.gross_score) lost++;
    else                                         halved++;
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

function calcBBGrossMatchResult(
  sc: ScorecardHole[],
  myHoles: Record<number, SavedHole>,
  playerHoles: Record<string, { gross_score: number | null; is_nr: number }>
) {
  let won = 0, lost = 0, halved = 0;
  for (const h of sc) {
    const mine = myHoles[h.number];
    if (!mine || mine.is_nr || mine.gross_score == null) continue;
    const opp1    = playerHoles[`1_${h.number}`];
    const opp2    = playerHoles[`2_${h.number}`];
    if (!opp1 && !opp2) continue;
    const partner   = playerHoles[`0_${h.number}`];
    const myGross   = mine.gross_score;
    const partGross = partner?.gross_score != null && !partner.is_nr ? partner.gross_score : null;
    const teamBest  = partGross != null ? Math.min(myGross, partGross) : myGross;
    const opp1Gross = opp1?.gross_score != null && !opp1.is_nr ? opp1.gross_score : null;
    const opp2Gross = opp2?.gross_score != null && !opp2.is_nr ? opp2.gross_score : null;
    const oppBest   = opp1Gross != null && opp2Gross != null ? Math.min(opp1Gross, opp2Gross) : (opp1Gross ?? opp2Gross);
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

function calcBBStablefordMatchResult(
  sc: ScorecardHole[],
  myHoles: Record<number, SavedHole>,
  playerHoles: Record<string, { gross_score: number | null; is_nr: number }>,
  myHcp: number,
  oppHcp: number
) {
  let won = 0, lost = 0, halved = 0;
  for (const h of sc) {
    const mine = myHoles[h.number];
    if (!mine || mine.is_nr || mine.gross_score == null) continue;
    const opp1    = playerHoles[`1_${h.number}`];
    const opp2    = playerHoles[`2_${h.number}`];
    if (!opp1 && !opp2) continue;
    const partner  = playerHoles[`0_${h.number}`];
    const ha       = getHA(h.stroke_index, myHcp);
    const oppHA    = getHA(h.stroke_index, oppHcp);
    const myPts    = calcPts(mine.gross_score, h.par, ha);
    const partPts  = partner?.gross_score != null && !partner.is_nr ? calcPts(partner.gross_score, h.par, ha) : null;
    const teamBest = partPts != null ? Math.max(myPts, partPts) : myPts;
    const opp1Pts  = opp1?.gross_score != null && !opp1.is_nr ? calcPts(opp1.gross_score, h.par, oppHA) : null;
    const opp2Pts  = opp2?.gross_score != null && !opp2.is_nr ? calcPts(opp2.gross_score, h.par, oppHA) : null;
    const oppBest  = opp1Pts != null && opp2Pts != null ? Math.max(opp1Pts, opp2Pts) : (opp1Pts ?? opp2Pts);
    if (oppBest == null) continue;
    if      (teamBest > oppBest) won++;
    else if (teamBest < oppBest) lost++;
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
  const [eclecticImprovements, setEclecticImprovements] = useState<Array<{ hole: number; oldGross: number | null; newGross: number }>>([]);
  const [eclecticEventName, setEclecticEventName] = useState<string | null>(null);
  const [pendingMarks, setPendingMarks] = useState<Array<{ id: number; player_name: string; tournament_name: string | null; club_name: string }>>([]);

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

  const checkPendingMarks = useCallback(async () => {
    if (!token) return;
    try {
      const res = await apiFetch("/scoring/pending-marks", token);
      setPendingMarks(res.marks ?? []);
    } catch {}
  }, [token]);

  // Re-check pending marks and dispute status every time this screen comes into focus
  // (e.g. the other player submitted their round after this screen was first opened)
  useFocusEffect(useCallback(() => {
    checkPendingMarks();
    loadRound();
  }, [checkPendingMarks, loadRound]));

  const onComplete = async () => {
    if (!round || completing) return;
    setCompleting(true);
    try {
      await apiFetch(`/scoring/rounds/${id}/complete`, token, { method: "POST" });
      // Auto-submit score immediately after completing
      try {
        const submitRes = await apiFetch(`/scoring/rounds/${id}/submit`, token, { method: "POST" });
        if (submitRes?.eclecticImprovements?.length > 0) {
          setEclecticImprovements(submitRes.eclecticImprovements);
        }
        if (submitRes?.eclecticEventName) {
          setEclecticEventName(submitRes.eclecticEventName);
        }
      } catch {}
      await loadRound();
      // Check whether this player is someone else's marker
      await checkPendingMarks();
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

  const isShambleRound  = round.format === "shamble";
  const isAllianceRound = round.format === "alliance";
  const isScrambleFmt   = ["texas_scramble","american_scramble","chapman","shamble","alliance"].includes(round.format);
  let teamTotal = 0;
  let teamUnit: string | null = null;
  if (isScrambleFmt) {
    const ph = round.playerHoles ?? {};
    const getHA2 = (si: number, hcp: number): number => {
      if (hcp <= 0) return 0;
      if (hcp <= 18) return si <= hcp ? 1 : 0;
      return 1 + (si <= hcp - 18 ? 1 : 0);
    };
    const calcPts2 = (gross: number, par: number, ha: number) =>
      Math.max(0, par + 2 - (gross - ha));
    sc.forEach(h => {
      const saved = holes[h.number];
      if (isShambleRound || isAllianceRound) {
        const myG = (saved && !saved.is_nr && saved.gross_score != null) ? saved.gross_score : null;
        const myHA = getHA2(h.stroke_index, round.playing_handicap);
        const myPts = myG != null ? calcPts2(myG, h.par, myHA) : null;
        const others = ([
          { idx: 0, hcp: round.partner_playing_hcp   ?? round.playing_handicap },
          { idx: 1, hcp: round.opponent_playing_hcp  ?? 0 },
          { idx: 2, hcp: round.opponent2_playing_hcp ?? 0 },
        ] as const).map(({ idx, hcp }) => {
          const s = ph[`${idx}_${h.number}`];
          if (!s || s.is_nr || s.gross_score == null) return null;
          return calcPts2(s.gross_score, h.par, getHA2(h.stroke_index, hcp));
        });
        const allPts = ([myPts, ...others] as (number | null)[]).filter((p): p is number => p != null);
        if (isAllianceRound) {
          const n = h.par <= 3 ? 1 : h.par === 4 ? 2 : 3;
          const top = [...allPts].sort((a, b) => b - a).slice(0, n);
          if (top.length > 0) teamTotal += top.reduce((s, p) => s + p, 0);
        } else {
          if (allPts.length > 0) teamTotal += Math.max(...allPts);
        }
      } else {
        const myG = (saved && !saved.is_nr && saved.gross_score != null) ? saved.gross_score : null;
        const others = ([0, 1, 2] as const).map(i => {
          const s = ph[`${i}_${h.number}`];
          return (s && !s.is_nr && s.gross_score != null) ? s.gross_score : null;
        });
        const allScores = ([myG, ...others] as (number | null)[]).filter((g): g is number => g != null);
        if (allScores.length > 0) teamTotal += Math.min(...allScores);
      }
    });
    teamUnit = (isShambleRound || isAllianceRound) ? "pts" : null;
  }

  const isMatchPlay  = round.format === "singles_match_play" || round.format === "singles_stableford_match_play" || round.format === "singles_gross_match_play";
  const singleMetric = round.format === "singles_stableford_match_play" ? "stableford" : round.format === "singles_gross_match_play" ? "gross" : "net";
  const isBetterball = round.format === "betterball_match_play" || round.format === "betterball_gross_match_play" || round.format === "fourball_stableford_match_play";
  const isAnyMatch   = isMatchPlay || isBetterball;
  const matchResult  = isMatchPlay && round.playerHoles
    ? (singleMetric === "stableford"
        ? calcMatchResultByPts(sc, holes, round.playerHoles, round.playing_handicap, round.opponent_playing_hcp ?? 0)
        : singleMetric === "gross"
        ? calcMatchResultByGross(sc, holes, round.playerHoles)
        : calcMatchResult(sc, holes, round.playerHoles, round.playing_handicap, round.opponent_playing_hcp ?? 0))
    : isBetterball && round.playerHoles
    ? (round.format === "betterball_gross_match_play"
        ? calcBBGrossMatchResult(sc, holes, round.playerHoles)
        : round.format === "fourball_stableford_match_play"
        ? calcBBStablefordMatchResult(sc, holes, round.playerHoles, round.playing_handicap, round.opponent_playing_hcp ?? 0)
        : calcBBMatchResult(sc, holes, round.playerHoles, round.playing_handicap, round.opponent_playing_hcp ?? 0))
    : null;

  // Verification status
  const matchConfirmed = round.match_status === "complete" && !round.match_dispute;
  const matchDisputed  = !!round.match_dispute;

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
          {(isScrambleFmt
            ? [
                { label: "Team", value: String(teamTotal || "—"), unit: teamUnit, highlight: true },
                { label: "My Gross", value: String(totalGross), unit: null, highlight: false },
                { label: "My Net", value: String(totalNet), unit: null, highlight: false },
                { label: "Holes", value: String(holesScored), unit: `/ ${sc.length}`, highlight: false },
              ]
            : [
                { label: "Stableford", value: String(totalPts), unit: "pts", highlight: true },
                { label: "Gross", value: String(totalGross), unit: null, highlight: false },
                { label: "Net", value: String(totalNet), unit: null, highlight: false },
                { label: "Holes", value: String(holesScored), unit: `/ ${sc.length}`, highlight: false },
              ]
          ).map(s => (
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

        {/* Eclectic ringer board — shown when this round updated (or counted for) an eclectic competition */}
        {(eclecticImprovements.length > 0 || eclecticEventName !== null) && (
          <View style={{ marginHorizontal: 16, marginTop: 4, marginBottom: 4, borderRadius: 14, borderWidth: 1.5, borderColor: "#c8a84b55", backgroundColor: "#c8a84b0d", padding: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: eclecticEventName ? 4 : 10 }}>
              <Ionicons name="trophy" size={18} color="#c8a84b" />
              <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: "#c8a84b" }}>
                {eclecticImprovements.length > 0 ? "Ringer Board Updated!" : "Round Counted!"}
              </Text>
            </View>
            {eclecticEventName && (
              <Text style={{ fontSize: 12, color: colors.mutedForeground, marginBottom: 8 }}>
                Applied to <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.foreground }}>{eclecticEventName}</Text>
              </Text>
            )}
            {eclecticImprovements.length > 0 ? (
              <>
                <Text style={{ fontSize: 12, color: colors.mutedForeground, marginBottom: 8 }}>
                  New personal bests on your eclectic card:
                </Text>
                {eclecticImprovements.map(imp => (
                  <View key={imp.hole} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 3 }}>
                    <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: "#fff" }}>{imp.hole}</Text>
                    </View>
                    <Text style={{ flex: 1, fontSize: 13, color: colors.foreground }}>Hole {imp.hole}</Text>
                    {imp.oldGross !== null ? (
                      <Text style={{ fontSize: 13, color: colors.mutedForeground }}>
                        {imp.oldGross}{" → "}
                        <Text style={{ color: "#16a34a", fontFamily: "Inter_700Bold" }}>{imp.newGross}</Text>
                      </Text>
                    ) : (
                      <Text style={{ fontSize: 13, color: "#16a34a", fontFamily: "Inter_700Bold" }}>
                        {imp.newGross} ✓
                      </Text>
                    )}
                  </View>
                ))}
              </>
            ) : (
              <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
                No new personal bests this time — your round has been recorded.
              </Text>
            )}
          </View>
        )}

        {/* Round info */}
        <View style={[styles.roundInfo, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Format row */}
          <View style={[styles.infoRow, { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
            <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Format</Text>
            <Text style={[styles.infoValue, { color: colors.foreground }]}>{FORMAT_LABELS[round.format] ?? round.format}</Text>
          </View>
          {/* Date row */}
          <View style={[styles.infoRow, { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
            <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Date</Text>
            <Text style={[styles.infoValue, { color: colors.foreground }]}>{new Date(round.started_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}</Text>
          </View>
          {/* Players section label */}
          <View style={[styles.infoRow, { paddingBottom: 2 }]}>
            <Text style={[styles.infoLabel, { color: colors.mutedForeground, fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.8 }]}>PLAYERS</Text>
          </View>
          {/* One row per player */}
          {([
            { name: user?.name ?? "Me",         hcp: round.course_handicap,         tee: round.tee_color,                  accent: colors.primary },
            ...(round.partner_name   ? [{ name: round.partner_name,   hcp: round.partner_playing_hcp   ?? 0, tee: round.partner_tee_color   ?? "white", accent: "#22c55e" }] : []),
            ...(round.opponent_name  ? [{ name: round.opponent_name,  hcp: round.opponent_playing_hcp  ?? 0, tee: round.opponent_tee_color  ?? "white", accent: "#f87171" }] : []),
            ...(round.opponent2_name ? [{ name: round.opponent2_name, hcp: round.opponent2_playing_hcp ?? 0, tee: round.opponent2_tee_color ?? "white", accent: "#fb923c" }] : []),
          ] as { name: string; hcp: number; tee: string; accent: string }[]).map((p, i, arr) => (
            <View key={p.name + i} style={[styles.playerCard, { borderBottomWidth: i < arr.length - 1 ? StyleSheet.hairlineWidth : 0, borderBottomColor: colors.border }]}>
              <View style={[styles.playerAvatar, { backgroundColor: p.accent + "22" }]}>
                <Ionicons name="person" size={13} color={p.accent} />
              </View>
              <Text style={[styles.playerName, { color: colors.foreground }]} numberOfLines={1}>{p.name}</Text>
              <Text style={[styles.playerMeta, { color: colors.mutedForeground }]}>
                HCP {p.hcp < 0 ? `+${-p.hcp}` : p.hcp}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <View style={[styles.playerTeeDot, {
                  backgroundColor: TEE_HEX[p.tee] ?? "#fff",
                  borderWidth: p.tee === "white" ? StyleSheet.hairlineWidth : 0,
                  borderColor: colors.border,
                }]} />
                <Text style={[styles.playerMeta, { color: colors.mutedForeground }]}>
                  {p.tee.charAt(0).toUpperCase() + p.tee.slice(1)}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Hole-by-hole scorecard */}
        <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Hole by Hole</Text>
          <ScorecardUnified round={round} colors={colors} />
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
            {round.tournament_id && round.score_submitted && !round.score_disputed && (
              <View style={[styles.footerBtn, { backgroundColor: "#16a34a22", borderWidth: 1.5, borderColor: "#16a34a60" }]}>
                <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
                <Text style={[styles.footerBtnText, { color: "#16a34a" }]}>Score Submitted to Club ✓</Text>
              </View>
            )}
            {round.tournament_id && round.score_disputed === 1 && (() => {
              const mhs = round.marker_hole_scores ?? {};
              const disputes = Object.keys(mhs)
                .map(k => ({ hole: Number(k), markerScore: Number(mhs[k]), myScore: round.holes[Number(k)]?.gross_score ?? null }))
                .filter(d => d.myScore !== null && d.markerScore !== d.myScore)
                .sort((a, b) => a.hole - b.hole);
              const markerFirst = (round.marker_name ?? "Your marker").split(" ")[0];
              return (
                <View style={{ backgroundColor: "#dc262608", borderWidth: 1.5, borderColor: "#dc262640", borderRadius: 12, padding: 12, gap: 8 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Ionicons name="warning" size={18} color="#dc2626" />
                    <Text style={[styles.footerBtnText, { color: "#dc2626" }]}>
                      {disputes.length} Score{disputes.length !== 1 ? "s" : ""} Disputed ⚠
                    </Text>
                  </View>
                  <Text style={{ fontSize: 11, color: "#dc2626aa", fontFamily: "Inter_400Regular", paddingLeft: 26 }}>
                    {markerFirst} recorded different scores on {disputes.length} hole{disputes.length !== 1 ? "s" : ""}. Contact the club to resolve.
                  </Text>
                  {disputes.length > 0 && (
                    <View style={{ marginTop: 4, borderTopWidth: 1, borderTopColor: "#dc262630", paddingTop: 8, gap: 0 }}>
                      <View style={{ flexDirection: "row", paddingHorizontal: 4, paddingBottom: 4 }}>
                        <Text style={{ width: 52, fontSize: 10, fontFamily: "Inter_700Bold", color: "#dc262680" }}>HOLE</Text>
                        <Text style={{ flex: 1, fontSize: 10, fontFamily: "Inter_700Bold", color: "#dc262680", textAlign: "center" }}>YOU</Text>
                        <Text style={{ flex: 1, fontSize: 10, fontFamily: "Inter_700Bold", color: "#dc262680", textAlign: "center" }}>{markerFirst.toUpperCase()}</Text>
                        <Text style={{ width: 40, fontSize: 10, fontFamily: "Inter_700Bold", color: "#dc262680", textAlign: "center" }}>DIFF</Text>
                      </View>
                      {disputes.map(d => {
                        const diff = d.markerScore - (d.myScore ?? 0);
                        return (
                          <View key={d.hole} style={{ flexDirection: "row", paddingHorizontal: 4, paddingVertical: 5, borderTopWidth: 1, borderTopColor: "#dc262618" }}>
                            <Text style={{ width: 52, fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#dc2626" }}>Hole {d.hole}</Text>
                            <Text style={{ flex: 1, fontSize: 15, fontFamily: "Inter_700Bold", color: GOLD, textAlign: "center" }}>{d.myScore}</Text>
                            <Text style={{ flex: 1, fontSize: 15, fontFamily: "Inter_700Bold", color: "#dc2626", textAlign: "center" }}>{d.markerScore}</Text>
                            <Text style={{ width: 40, fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#dc2626", textAlign: "center" }}>{diff > 0 ? `+${diff}` : `${diff}`}</Text>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })()}
            {pendingMarks.length > 0 && (
              <TouchableOpacity
                onPress={() => router.push(`/scoring/${pendingMarks[0].id}/mark`)}
                style={[styles.footerBtn, { backgroundColor: GOLD + "22", borderWidth: 1.5, borderColor: GOLD + "80" }]}
              >
                <Ionicons name="pencil" size={18} color={GOLD} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.footerBtnText, { color: GOLD, fontSize: 13 }]}>
                    Mark {pendingMarks[0].player_name}'s Card
                  </Text>
                  <Text style={{ fontSize: 11, color: GOLD + "aa", fontFamily: "Inter_400Regular" }}>
                    {pendingMarks[0].tournament_name ?? pendingMarks[0].club_name} · Tap to countersign
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={GOLD} />
              </TouchableOpacity>
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
const TEE_HEX: Record<string, string> = {
  yellow: "#F5C518", white: "#FFFFFF", blue: "#3B82F6", red: "#EF4444",
};

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
  playerCard: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 11 },
  playerAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  playerName: { flex: 1, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  playerMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  playerTeeDot: { width: 14, height: 14, borderRadius: 7 },
});
