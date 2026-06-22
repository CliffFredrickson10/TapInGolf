import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
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
import GolfBallLoader from "@/components/GolfBallLoader";

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
  opponent_name?: string | null;
  opponent_playing_hcp?: number;
  partner_name?: string | null;
  opponent2_name?: string | null;
  playerHoles?: Record<string, { gross_score: number | null; is_nr: number }>;
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

// ─── Match Status ─────────────────────────────────────────────────────────────
type MatchStatus = {
  holesUp: number; holesPlayed: number; holesRemaining: number;
  won: number; lost: number; halved: number;
  decided: boolean; label: string; color: string;
};
function calcMatchStatus(
  sc: ScorecardHole[],
  myHoles: Record<number, SavedHole>,
  playerHoles: Record<string, { gross_score: number | null; is_nr: number }>,
  myHcp: number,
  oppHcp: number
): MatchStatus {
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
  if (holesPlayed > 0 && holesUp > holesRemaining)
    return { holesUp, holesPlayed, holesRemaining, won, lost, halved, decided: true,  label: `Won ${holesUp}&${holesRemaining}`,   color: "#22c55e" };
  if (holesPlayed > 0 && -holesUp > holesRemaining)
    return { holesUp, holesPlayed, holesRemaining, won, lost, halved, decided: true,  label: `Lost ${-holesUp}&${holesRemaining}`, color: "#f87171" };
  if (holesPlayed === 0 || holesUp === 0)
    return { holesUp: 0, holesPlayed, holesRemaining, won, lost, halved, decided: false, label: "All Square", color: GOLD };
  if (holesUp > 0 && holesUp === holesRemaining)
    return { holesUp, holesPlayed, holesRemaining, won, lost, halved, decided: false, label: `Dormie ${holesUp}`, color: "#22c55e" };
  if (holesUp < 0 && -holesUp === holesRemaining)
    return { holesUp, holesPlayed, holesRemaining, won, lost, halved, decided: false, label: `Dormie (Down)`,    color: "#f87171" };
  if (holesUp > 0)
    return { holesUp, holesPlayed, holesRemaining, won, lost, halved, decided: false, label: `${holesUp} UP`,    color: "#22c55e" };
  return   { holesUp, holesPlayed, holesRemaining, won, lost, halved, decided: false, label: `${-holesUp} DOWN`, color: "#f87171" };
}

// ─── Betterball Match Status ──────────────────────────────────────────────────
function calcBetterballMatchStatus(
  sc: ScorecardHole[],
  myHoles: Record<number, SavedHole>,
  playerHoles: Record<string, { gross_score: number | null; is_nr: number }>,
  myHcp: number,
  oppHcp: number
): MatchStatus {
  let won = 0, lost = 0, halved = 0;
  for (const h of sc) {
    const mine    = myHoles[h.number];
    const partner = playerHoles[`0_${h.number}`];
    const opp1    = playerHoles[`1_${h.number}`];
    const opp2    = playerHoles[`2_${h.number}`];
    if (!mine || mine.gross_score == null || mine.is_nr) continue;
    if (!opp1 && !opp2) continue;
    const ha      = getHA(h.stroke_index, myHcp);
    const oppHa   = getHA(h.stroke_index, oppHcp);
    const myNet   = mine.gross_score - ha;
    const partNet = partner?.gross_score != null && !partner.is_nr ? partner.gross_score - ha : null;
    const teamBest = partNet != null ? Math.min(myNet, partNet) : myNet;
    const opp1Net = opp1?.gross_score != null && !opp1.is_nr ? opp1.gross_score - oppHa : null;
    const opp2Net = opp2?.gross_score != null && !opp2.is_nr ? opp2.gross_score - oppHa : null;
    const oppBest = opp1Net != null && opp2Net != null ? Math.min(opp1Net, opp2Net) : (opp1Net ?? opp2Net);
    if (oppBest == null) continue;
    if      (teamBest < oppBest) won++;
    else if (teamBest > oppBest) lost++;
    else                         halved++;
  }
  const holesPlayed    = won + lost + halved;
  const holesRemaining = sc.length - holesPlayed;
  const holesUp        = won - lost;
  if (holesPlayed > 0 && holesUp > holesRemaining)
    return { holesUp, holesPlayed, holesRemaining, won, lost, halved, decided: true,  label: `Won ${holesUp}&${holesRemaining}`,   color: "#22c55e" };
  if (holesPlayed > 0 && -holesUp > holesRemaining)
    return { holesUp, holesPlayed, holesRemaining, won, lost, halved, decided: true,  label: `Lost ${-holesUp}&${holesRemaining}`, color: "#f87171" };
  if (holesPlayed === 0 || holesUp === 0)
    return { holesUp: 0, holesPlayed, holesRemaining, won, lost, halved, decided: false, label: "All Square", color: GOLD };
  if (holesUp > 0 && holesUp === holesRemaining)
    return { holesUp, holesPlayed, holesRemaining, won, lost, halved, decided: false, label: `Dormie ${holesUp}`, color: "#22c55e" };
  if (holesUp < 0 && -holesUp === holesRemaining)
    return { holesUp, holesPlayed, holesRemaining, won, lost, halved, decided: false, label: "Dormie (Down)", color: "#f87171" };
  if (holesUp > 0)
    return { holesUp, holesPlayed, holesRemaining, won, lost, halved, decided: false, label: `${holesUp} UP`,    color: "#22c55e" };
  return   { holesUp, holesPlayed, holesRemaining, won, lost, halved, decided: false, label: `${-holesUp} DOWN`, color: "#f87171" };
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
  const [oppGross, setOppGross]       = useState<number | null>(null);
  const [partnerGross, setPartnerGross] = useState<number | null>(null);
  const [opp2Gross, setOpp2Gross]       = useState<number | null>(null);
  const holeStripRef = useRef<ScrollView>(null);
  const quickRowRef = useRef<ScrollView>(null);
  const partnerQuickRef = useRef<ScrollView>(null);
  const opp1QuickRef = useRef<ScrollView>(null);
  const opp2QuickRef = useRef<ScrollView>(null);

  // Centre the Par button in the quick-tap row whenever the hole changes.
  // stepperSection has paddingHorizontal:20, so the ScrollView viewport is
  // screenWidth-40 wide. We must use that viewport width, not screenWidth.
  useEffect(() => {
    const PAR_INDEX = 3;      // index of offset=0 in [-3,-2,-1,0,1,2,3,4,5]
    const BTN_WIDTH = 68;
    const GAP = 6;
    const ROW_PADDING = 20;   // quickRow contentContainerStyle paddingHorizontal
    const SECTION_PAD = 20;   // stepperSection paddingHorizontal (shrinks viewport)
    const screenWidth = Dimensions.get("window").width;
    const viewportWidth = screenWidth - SECTION_PAD * 2;
    const parCenter = ROW_PADDING + PAR_INDEX * (BTN_WIDTH + GAP) + BTN_WIDTH / 2;
    const scrollX = Math.max(0, parCenter - viewportWidth / 2);
    // BbPlayerInput boxes: group box marginHorizontal:12 × 2 + borderWidth:1 × 2 = 26px narrower
    const bbViewportWidth = screenWidth - 26;
    const bbScrollX = Math.max(0, parCenter - bbViewportWidth / 2);
    setTimeout(() => {
      quickRowRef.current?.scrollTo({ x: scrollX, animated: false });
      partnerQuickRef.current?.scrollTo({ x: bbScrollX, animated: false });
      opp1QuickRef.current?.scrollTo({ x: bbScrollX, animated: false });
      opp2QuickRef.current?.scrollTo({ x: bbScrollX, animated: false });
    }, 80);
  }, [holeIdx, round]);

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
      const ph0 = data.playerHoles as Record<string, any> | undefined;
      if (data.format === "betterball_match_play") {
        setPartnerGross(ph0?.[`0_${scorecard[startIdx]?.number}`]?.gross_score ?? null);
        setOppGross(ph0?.[`1_${scorecard[startIdx]?.number}`]?.gross_score ?? null);
        setOpp2Gross(ph0?.[`2_${scorecard[startIdx]?.number}`]?.gross_score ?? null);
      } else {
        setOppGross(ph0?.[`0_${scorecard[startIdx]?.number}`]?.gross_score ?? null);
      }
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to load round");
    } finally {
      setLoading(false);
    }
  }, [token, id]);

  useEffect(() => { loadRound(); }, [loadRound]);

  if (loading || !round) {
    const { width: sw, height: sh } = Dimensions.get("window");
    return (
      <View style={{ width: sw, height: sh, backgroundColor: DARK_BG, alignItems: "center", justifyContent: "center" }}>
        <GolfBallLoader size={60} />
      </View>
    );
  }

  const scorecard = round.scorecard;
  const hole = scorecard[holeIdx];
  if (!hole) return null;

  const ph = round.playing_handicap;
  const ha = getHA(hole.stroke_index, ph);
  const oppHA = getHA(hole.stroke_index, round.opponent_playing_hcp ?? 0);
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
    const isBB = round.format === "betterball_match_play";
    if (isBB) {
      setPartnerGross(round.playerHoles?.[`0_${scorecard[idx].number}`]?.gross_score ?? null);
      setOppGross(round.playerHoles?.[`1_${scorecard[idx].number}`]?.gross_score ?? null);
      setOpp2Gross(round.playerHoles?.[`2_${scorecard[idx].number}`]?.gross_score ?? null);
    } else {
      setOppGross(round.playerHoles?.[`0_${scorecard[idx].number}`]?.gross_score ?? null);
    }
    holeStripRef.current?.scrollTo({ x: Math.max(0, (idx - 3) * 42), animated: true });
  };

  const saveAndNext = async (isNr = false) => {
    if (!isNr && gross == null) return;
    setSaving(true);
    try {
      const isMP = round.format === "singles_match_play";
      const isBB = round.format === "betterball_match_play";
      const body: Record<string, unknown> = {
        par: hole.par,
        strokeIndex: hole.stroke_index,
        grossScore: isNr ? null : gross,
        isNr,
      };
      if (isMP && oppGross != null) {
        body.players = [{ name: round.opponent_name ?? "Opponent", grossScore: oppGross }];
      }
      if (isBB) {
        body.players = [
          { name: round.partner_name ?? "Partner", grossScore: isNr ? null : partnerGross },
          { name: round.opponent_name ?? "Opp 1",  grossScore: isNr ? null : oppGross    },
          { name: round.opponent2_name ?? "Opp 2",  grossScore: isNr ? null : opp2Gross   },
        ];
      }
      await apiFetch(`/scoring/rounds/${id}/holes/${hole.number}`, token, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      // Update local state
      const updatedHoles = { ...round.holes };
      updatedHoles[hole.number] = {
        hole_number: hole.number,
        gross_score: isNr ? null : gross,
        net_score:   isNr ? null : netScore,
        stableford_points: isNr ? null : pts,
        is_nr: isNr ? 1 : 0,
      };
      const updatedPlayerHoles = { ...(round.playerHoles ?? {}) };
      if (isMP && oppGross != null) {
        updatedPlayerHoles[`0_${hole.number}`] = { gross_score: oppGross, is_nr: 0 };
      }
      if (isBB) {
        updatedPlayerHoles[`0_${hole.number}`] = { gross_score: isNr ? null : partnerGross, is_nr: isNr ? 1 : 0 };
        updatedPlayerHoles[`1_${hole.number}`] = { gross_score: isNr ? null : oppGross,     is_nr: isNr ? 1 : 0 };
        updatedPlayerHoles[`2_${hole.number}`] = { gross_score: isNr ? null : opp2Gross,    is_nr: isNr ? 1 : 0 };
      }
      setRound({ ...round, holes: updatedHoles, playerHoles: updatedPlayerHoles });

      if (holeIdx < scorecard.length - 1) {
        goToHole(holeIdx + 1);
      } else {
        router.replace(`/scoring/${id}/complete`);
      }
    } catch (err: any) {
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

  const isLastHole   = holeIdx === scorecard.length - 1;
  const isMatchPlay  = round.format === "singles_match_play";
  const isBetterball = round.format === "betterball_match_play";
  const isAnyMatch   = isMatchPlay || isBetterball;
  const matchSt: MatchStatus | null = isMatchPlay
    ? calcMatchStatus(scorecard, round.holes, round.playerHoles ?? {}, round.playing_handicap, round.opponent_playing_hcp ?? 0)
    : isBetterball
    ? calcBetterballMatchStatus(scorecard, round.holes, round.playerHoles ?? {}, round.playing_handicap, round.opponent_playing_hcp ?? 0)
    : null;

  // Betterball per-hole helpers (current hole being entered)
  const partnerHA  = isBetterball ? getHA(hole.stroke_index, round.playing_handicap) : 0;
  const opp2HA     = isBetterball ? getHA(hole.stroke_index, round.opponent_playing_hcp ?? 0) : 0;
  const partnerNet = partnerGross != null ? partnerGross - partnerHA : null;
  const opp1Net    = oppGross     != null ? oppGross     - oppHA     : null;
  const opp2Net    = opp2Gross    != null ? opp2Gross    - opp2HA    : null;
  // Which player is carrying the team? (lower net = better in matchplay)
  const bbTeamWinner = netScore != null && partnerNet != null
    ? (netScore <= partnerNet ? 0 : 1) : netScore != null ? 0 : 1;
  const bbOppWinner  = opp1Net != null && opp2Net != null
    ? (opp1Net  <= opp2Net   ? 0 : 1) : opp1Net  != null ? 0 : 1;

  // Inline compact player stepper used for partner + opp2 in betterball
  const BbPlayerInput = ({
    label, color, bgColor, gross: g, setGross: sg, ha: playerHA, isBest, flat, quickRef,
  }: {
    label: string; color: string; bgColor: string;
    gross: number | null; setGross: (v: number | null) => void;
    ha: number; isBest?: boolean; flat?: boolean;
    quickRef?: React.RefObject<ScrollView>;
  }) => (
    <View style={[styles.oppStepperSection, { backgroundColor: bgColor, paddingVertical: 8 }, flat ? { marginHorizontal: 0, borderRadius: 0 } : { marginHorizontal: 12 }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6, paddingLeft: 16 }}>
        <View style={[styles.sectionDot, { backgroundColor: color }]} />
        <Text style={[styles.sectionLabel, { color }]}>{label.toUpperCase()}</Text>
      </View>
      <View style={[styles.stepper, { paddingHorizontal: 16 }]}>
        <TouchableOpacity
          onPress={() => { Haptics.selectionAsync(); sg(v => v == null ? hole.par + 1 : Math.max(1, v - 1)); }}
          style={[styles.stepBtn, styles.stepBtnMinus, { borderColor: g != null && g > 1 ? "#f87171" : BORDER, width: 52, height: 52, borderRadius: 26 }]}
        >
          <Text style={[styles.stepBtnText, { color: g != null && g > 1 ? "#f87171" : MUTED_FG, fontSize: 24 }]}>−</Text>
        </TouchableOpacity>
        <View style={styles.scoreDisplay}>
          {g != null ? (
            <>
              <Text style={[styles.scoreValue, { color: scoreColor(g, hole.par), fontSize: 60, lineHeight: 64 }]}>{g}</Text>
              <Text style={styles.scoreNet}>Net {g - playerHA}</Text>
            </>
          ) : (
            <Text style={[styles.scoreValue, { color: SURFACE, fontSize: 60, lineHeight: 64 }]}>—</Text>
          )}
        </View>
        <TouchableOpacity
          onPress={() => { Haptics.selectionAsync(); sg(v => v == null ? hole.par + 1 : Math.min(15, v + 1)); }}
          style={[styles.stepBtn, { borderColor: color, backgroundColor: color + "22", width: 52, height: 52, borderRadius: 26 }]}
        >
          <Text style={[styles.stepBtnText, { color, fontSize: 24 }]}>+</Text>
        </TouchableOpacity>
      </View>
      <ScrollView ref={quickRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRow}>
        {[-3, -2, -1, 0, 1, 2, 3, 4, 5].map(offset => {
          const val = hole.par + offset;
          const active = g === val;
          const qColor = val < hole.par ? "#22c55e" : val === hole.par ? GOLD : val === hole.par + 1 ? "#fb923c" : "#f87171";
          const labelMap: Record<number, string> = { [-3]: "Albatross", [-2]: "Eagle", [-1]: "Birdie", [0]: "Par", [1]: "Bogey", [2]: "Double", [3]: "+3", [4]: "+4", [5]: "+5" };
          return (
            <TouchableOpacity key={offset} onPress={() => { Haptics.selectionAsync(); sg(val); }}
              style={[styles.quickBtn, { backgroundColor: active ? qColor + "33" : SURFACE, borderColor: active ? qColor : BORDER }]}>
              <Text style={[styles.quickBtnScore, { color: active ? qColor : "#fff" }]}>{val}</Text>
              <Text style={[styles.quickBtnLabel, { color: active ? qColor : MUTED_FG }]}>{labelMap[offset]}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: DARK_BG }}>
      {/* Top bar — clears notch/Dynamic Island on device; min-36 for web sim */}
      <View style={[styles.topBar, { paddingTop: Math.max(insets.top + 8, 36), paddingBottom: isMatchPlay ? 8 : 8 }]}>
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

      {/* Hole strip — View wrapper pins height so flexbox can't stretch the horizontal ScrollView */}
      <View style={{ height: 40, overflow: "hidden", marginTop: 10, marginBottom: 6 }}>
      <ScrollView
        ref={holeStripRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.holeStrip}
        style={{ flex: 1 }}
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
      </View>
      <Text style={styles.stripMeta}>
        {scorecard.filter(h => round.holes[h.number] != null).length} / {scorecard.length} scored · {totalPts} pts total
      </Text>

      {/* Scrollable scoring content */}
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 8 }}
      >
        {/* Hole identity */}
        <View style={[styles.holeHeader, isAnyMatch && { paddingTop: 20, paddingBottom: 4 }]}>
          {!isAnyMatch && <Text style={styles.nowScoringLabel}>NOW SCORING</Text>}
          <Text style={[styles.holeName, isAnyMatch && { fontSize: 44, lineHeight: 48 }]}>HOLE {hole.number}</Text>
          <View style={styles.hcpChip}>
            <Text style={styles.hcpChipText}>Playing HCP {ph}</Text>
          </View>
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

        {/* Match status banner */}
        {isAnyMatch && matchSt && matchSt.holesPlayed > 0 && (
          <View style={[styles.matchBanner, { borderColor: matchSt.color + "55", backgroundColor: matchSt.color + "18", paddingVertical: 8 }]}>
            <Text numberOfLines={1} style={{ flexShrink: 1 }}>
              <Text style={[styles.matchBannerLabel, { color: matchSt.color }]}>{matchSt.label}</Text>
              <Text style={styles.matchBannerSub}>{"  ·  "}{matchSt.won}W · {matchSt.lost}L · {matchSt.halved}H{"  ·  "}{matchSt.holesRemaining > 0 ? `${matchSt.holesRemaining} to play` : "Done"}</Text>
            </Text>
            {matchSt.decided && (
              <Ionicons name={matchSt.holesUp > 0 ? "trophy" : "close-circle"} size={18} color={matchSt.color} />
            )}
          </View>
        )}

        {/* ── YOUR SCORE / YOUR TEAM section ─────────────────────── */}
        {isAnyMatch && (
          <View style={[styles.scoringSectionHeader, { paddingTop: 6, paddingBottom: 2 }]}>
            <View style={[styles.sectionDot, { backgroundColor: GREEN }]} />
            <Text style={[styles.sectionLabel, { color: GREEN }]}>
              {isBetterball ? "YOUR TEAM" : "YOUR SCORE"}
            </Text>
          </View>
        )}

        <View style={isBetterball ? styles.teamGroupBox : undefined}>
          <View style={[styles.stepperSection, isBetterball && { paddingVertical: 8, backgroundColor: "#163020" }]}>
            {isBetterball && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <View style={[styles.sectionDot, { backgroundColor: GREEN }]} />
                <Text style={[styles.sectionLabel, { color: GREEN }]}>{(user?.name ?? "You").toUpperCase()}</Text>
              </View>
            )}
            {!isBetterball && (
              <View style={{ height: isAnyMatch ? 24 : 32, alignItems: "center", justifyContent: "center", marginBottom: isAnyMatch ? 4 : 8 }}>
                {gross != null && (
                  <View style={[styles.scoreBadge, { backgroundColor: scoreColor(gross, hole.par) + "22", borderColor: scoreColor(gross, hole.par) + "60" }]}>
                    <Text style={[styles.scoreBadgeText, { color: scoreColor(gross, hole.par) }]}>
                      {scoreName(gross, hole.par)}
                    </Text>
                  </View>
                )}
              </View>
            )}

            <View style={styles.stepper}>
              <TouchableOpacity
                onPress={() => { Haptics.selectionAsync(); setGross(v => v == null ? hole.par + 1 : Math.max(1, v - 1)); }}
                style={[styles.stepBtn, styles.stepBtnMinus, { borderColor: gross != null && gross > 1 ? "#f87171" : BORDER, width: isAnyMatch ? 52 : 64, height: isAnyMatch ? 52 : 64, borderRadius: isAnyMatch ? 26 : 32 }]}
              >
                <Text style={[styles.stepBtnText, { color: gross != null && gross > 1 ? "#f87171" : MUTED_FG, fontSize: isAnyMatch ? 24 : 30 }]}>−</Text>
              </TouchableOpacity>
              <View style={styles.scoreDisplay}>
                {gross != null ? (
                  <>
                    <Text style={[styles.scoreValue, { color: scoreColor(gross, hole.par), fontSize: isAnyMatch ? 60 : 84, lineHeight: isAnyMatch ? 64 : 88 }]}>{gross}</Text>
                    <Text style={styles.scoreNet}>Net {gross - ha}{!isBetterball ? ` · ${pts}pts` : ""}</Text>
                  </>
                ) : (
                  <Text style={[styles.scoreValue, { color: SURFACE, fontSize: isAnyMatch ? 60 : 84, lineHeight: isAnyMatch ? 64 : 88 }]}>—</Text>
                )}
              </View>
              <TouchableOpacity
                onPress={() => { Haptics.selectionAsync(); setGross(v => v == null ? hole.par + 1 : Math.min(15, v + 1)); }}
                style={[styles.stepBtn, { borderColor: GREEN, backgroundColor: isBetterball ? GREEN + "33" : "#1a4028", width: isAnyMatch ? 52 : 64, height: isAnyMatch ? 52 : 64, borderRadius: isAnyMatch ? 26 : 32 }]}
              >
                <Text style={[styles.stepBtnText, { color: "#22c55e", fontSize: isAnyMatch ? 24 : 30 }]}>+</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              ref={quickRowRef}
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

          {/* ── PARTNER (betterball only, inside team box) ─────── */}
          {isBetterball && (
            <>
              <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: BORDER, marginHorizontal: 8 }} />
              <BbPlayerInput flat
                label={round.partner_name ?? "Partner"}
                color="#c8a84b" bgColor="#17130a"
                gross={partnerGross} setGross={setPartnerGross}
                ha={partnerHA} isBest={bbTeamWinner === 1}
                quickRef={partnerQuickRef}
              />
            </>
          )}
        </View>

        {/* Points summary — non-matchplay only */}
        {pts != null && !isAnyMatch && (
          <View style={styles.ptsSummary}>
            <Text style={styles.ptsSummaryLabel}>Stableford Points</Text>
            <Text style={[styles.ptsSummaryValue, { color: pts >= 3 ? "#22c55e" : pts >= 2 ? GOLD : pts >= 1 ? "#fb923c" : "#f87171" }]}>{pts}</Text>
          </View>
        )}

        {/* ── OPPONENT score section (matchplay + betterball) ─────── */}
        {isAnyMatch && (
          <>
            <View style={{ alignItems: "center", justifyContent: "center", paddingTop: 14, paddingBottom: 8 }}>
              <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: MUTED_FG, letterSpacing: 3 }}>VS</Text>
            </View>
            <View style={[styles.scoringSectionHeader, { paddingTop: 2, paddingBottom: 2 }]}>
              <View style={[styles.sectionDot, { backgroundColor: "#ef4444" }]} />
              <Text style={[styles.sectionLabel, { color: "#ef4444" }]}>
                {isBetterball ? "OPPONENTS" : (round.opponent_name ?? "OPPONENT").toUpperCase()}
              </Text>
            </View>

            {/* For betterball, group both opps in oppGroupBox; for singles use the large stepper */}
            {isBetterball ? (
              <View style={styles.oppGroupBox}>
                <BbPlayerInput flat
                  label={round.opponent_name ?? "Opp 1"}
                  color="#ef4444" bgColor="#180606"
                  gross={oppGross} setGross={setOppGross}
                  ha={oppHA} isBest={bbOppWinner === 0}
                  quickRef={opp1QuickRef}
                />
                <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: BORDER }} />
                <BbPlayerInput flat
                  label={round.opponent2_name ?? "Opp 2"}
                  color="#60a5fa" bgColor="#060f18"
                  gross={opp2Gross} setGross={setOpp2Gross}
                  ha={opp2HA} isBest={bbOppWinner === 1}
                  quickRef={opp2QuickRef}
                />
              </View>
            ) : (
              <View style={[styles.stepperSection, styles.oppStepperSection]}>
                <View style={{ height: 24, alignItems: "center", justifyContent: "center", marginBottom: 4 }}>
                  {oppGross != null && (
                    <View style={[styles.scoreBadge, { backgroundColor: scoreColor(oppGross, hole.par) + "22", borderColor: scoreColor(oppGross, hole.par) + "60" }]}>
                      <Text style={[styles.scoreBadgeText, { color: scoreColor(oppGross, hole.par) }]}>
                        {scoreName(oppGross, hole.par)}
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.stepper}>
                  <TouchableOpacity
                    onPress={() => { Haptics.selectionAsync(); setOppGross(v => v == null ? hole.par + 1 : Math.max(1, v - 1)); }}
                    style={[styles.stepBtn, styles.stepBtnMinus, { borderColor: oppGross != null && oppGross > 1 ? "#f87171" : BORDER, width: 52, height: 52, borderRadius: 26 }]}
                  >
                    <Text style={[styles.stepBtnText, { color: oppGross != null && oppGross > 1 ? "#f87171" : MUTED_FG, fontSize: 24 }]}>−</Text>
                  </TouchableOpacity>
                  <View style={styles.scoreDisplay}>
                    {oppGross != null ? (
                      <>
                        <Text style={[styles.scoreValue, { color: scoreColor(oppGross, hole.par), fontSize: 60, lineHeight: 64 }]}>{oppGross}</Text>
                        <Text style={styles.scoreNet}>Net {oppGross - oppHA}</Text>
                      </>
                    ) : (
                      <Text style={[styles.scoreValue, { color: SURFACE, fontSize: 60, lineHeight: 64 }]}>—</Text>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={() => { Haptics.selectionAsync(); setOppGross(v => v == null ? hole.par + 1 : Math.min(15, v + 1)); }}
                    style={[styles.stepBtn, { borderColor: "#a78bfa", backgroundColor: "#2d1f4a", width: 52, height: 52, borderRadius: 26 }]}
                  >
                    <Text style={[styles.stepBtnText, { color: "#a78bfa", fontSize: 24 }]}>+</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.quickRow}
                >
                  {[-3, -2, -1, 0, 1, 2, 3, 4, 5].map(offset => {
                    const val = hole.par + offset;
                    const active = oppGross === val;
                    const qColor = val < hole.par ? "#22c55e" : val === hole.par ? GOLD : val === hole.par + 1 ? "#fb923c" : "#f87171";
                    const labelMap: Record<number, string> = { [-3]: "Albatross", [-2]: "Eagle", [-1]: "Birdie", [0]: "Par", [1]: "Bogey", [2]: "Double", [3]: "+3", [4]: "+4", [5]: "+5" };
                    return (
                      <TouchableOpacity
                        key={offset}
                        onPress={() => { Haptics.selectionAsync(); setOppGross(val); }}
                        style={[styles.quickBtn, { backgroundColor: active ? qColor + "33" : SURFACE, borderColor: active ? qColor : BORDER }]}
                      >
                        <Text style={[styles.quickBtnScore, { color: active ? qColor : "#fff" }]}>{val}</Text>
                        <Text style={[styles.quickBtnLabel, { color: active ? qColor : MUTED_FG }]}>{labelMap[offset]}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Action buttons — fixed at bottom */}
      <View style={[styles.actions, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          onPress={() => saveAndNext(true)}
          disabled={saving}
          style={[styles.nrBtn, { borderColor: BORDER }]}
        >
          <Text style={[styles.nrBtnText, { color: MUTED_FG }]}>NR / Pickup</Text>
        </TouchableOpacity>
        {isAnyMatch && matchSt?.decided ? (
          <TouchableOpacity
            onPress={confirmAndFinish}
            disabled={saving}
            style={[styles.nextBtn, { backgroundColor: GREEN, opacity: saving ? 0.7 : 1 }]}
          >
            <Text style={styles.nextBtnText}>End Match 🏆</Text>
          </TouchableOpacity>
        ) : isLastHole ? (
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
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 8, gap: 10,
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
  scoringSectionHeader: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4,
  },
  sectionDot: { width: 8, height: 8, borderRadius: 4 },
  sectionLabel: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1.5 },
  oppStepperSection: {
    borderTopWidth: 0,
    backgroundColor: "#1a0e2e",
    borderRadius: 16,
    marginHorizontal: 12,
    paddingVertical: 8,
  },
  teamGroupBox: {
    borderWidth: 1,
    borderColor: "#1a5c3860",
    borderRadius: 16,
    marginHorizontal: 12,
    marginBottom: 4,
    overflow: "hidden",
  },
  oppGroupBox: {
    borderWidth: 1,
    borderColor: "#ef444440",
    borderRadius: 16,
    marginHorizontal: 12,
    overflow: "hidden",
  },
  actions: {
    flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 12,
  },
  nrBtn: {
    flex: 1, paddingVertical: 15, borderRadius: 16, borderWidth: 1.5, alignItems: "center",
  },
  nrBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  nextBtn: {
    flex: 3, paddingVertical: 15, borderRadius: 16, alignItems: "center",
  },
  nextBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
  matchBanner: {
    marginHorizontal: 16, marginTop: 8, borderRadius: 12, borderWidth: 1.5,
    paddingVertical: 10, paddingHorizontal: 14,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  matchBannerLabel: { fontSize: 20, fontFamily: "Inter_700Bold" },
  matchBannerSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: MUTED_FG, marginTop: 2 },
});
