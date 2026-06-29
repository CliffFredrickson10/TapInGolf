import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
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
import { AppHeader } from "@/components/AppHeader";

// ─── Constants ────────────────────────────────────────────────────────────────
const DARK_BG   = "#f2f6f3";
const SURFACE   = "#ffffff";
const BORDER    = "#c8ddd2";
const GREEN     = "#1a5c38";
const GOLD      = "#c8a84b";
const MUTED_FG  = "#5a7265";

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
  partner_playing_hcp?: number;
  opponent2_name?: string | null;
  opponent2_playing_hcp?: number;
  playerHoles?: Record<string, { gross_score: number | null; is_nr: number }>;
};

// True for any format where we score all 4 players (betterball team: always has a partner)
function hasFourPlayers(r: { format: string; partner_name?: string | null }): boolean {
  return r.format === "betterball_match_play" || !!r.partner_name;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getHA(si: number, ph: number): number {
  if (ph === 0) return 0;
  if (ph > 0) {
    if (ph <= 18) return si <= ph ? 1 : 0;
    return 1 + (si <= ph - 18 ? 1 : 0);
  }
  // Plus handicapper (ph < 0): give strokes back from SI 18 downward
  const abs = -ph;
  if (abs <= 18) return si >= (19 - abs) ? -1 : 0;
  return -1 + (si >= (19 - (abs - 18)) ? -1 : 0);
}
function calcPoints(gross: number, par: number, ha: number): number {
  return Math.max(0, par + 2 - (gross - ha));
}

// Returns the gross score at which a player earns 0 points and should pick up,
// or null for formats with no stableford-style maximum (stroke play, par/bogey, gross).
function getStablefordMax(fmt: string, par: number, ha: number): number | null {
  switch (fmt) {
    // No cap — stroke play has no forced pickup without Model Local Rule E-3
    case "net_stroke_play":
    case "chairman":
    // No cap — gross match play/betterball pickup is hole-concession, not a net formula
    case "singles_gross_match_play":
    case "betterball_gross_match_play":
    case "fourball_gross_betterball":
    // No cap — scramble/alternate-shot formats use team stroke totals, not per-hole points
    case "texas_scramble":
    case "american_scramble":
    case "chapman":
      return null;
    // Modified stableford: net double bogey = -3 pts (worst possible); nothing more to lose
    case "modified_stableford":
      return par + 2 + ha;
    // Par/bogey: pickup once the hole is definitively lost (R&A Rule 21.2)
    case "par_bogey":
    case "individual_par":
      return par + 1 + ha; // net bogey = worst outcome in par game (-1 pt)
    case "individual_bogey":
      return par + 2 + ha; // net double bogey = worst outcome in bogey game (-1 pt)
    // Bonus bogey: double bogey or worse = -2 (worst score); nothing to gain by continuing
    case "individual_bonus_bogey":
      return par + 2 + ha;
    // All standard stableford formats: net double bogey = 0 pts (R&A Rule 21.1b(2))
    default:
      return par + 2 + ha;
  }
}
function calcFormatPts(fmt: string, gross: number, par: number, ha: number): number {
  const netVsPar = (gross - ha) - par;
  switch (fmt) {
    case "modified_stableford":
      if (netVsPar <= -2) return 4;
      if (netVsPar === -1) return 2;
      if (netVsPar === 0) return 0;
      if (netVsPar === 1) return -1;
      return -3;
    case "individual_bonus_bogey":
    case "betterball_bonus_bogey":
      if (netVsPar <= -2) return 2;   // eagle or better = +2
      if (netVsPar === -1) return 1;  // birdie = +1
      if (netVsPar === 0) return 0;   // par = 0 (level)
      if (netVsPar === 1) return -1;  // bogey = -1
      return -2;                       // double bogey or worse = -2
    case "par_bogey":
    case "individual_par":
      return netVsPar < 0 ? 1 : netVsPar === 0 ? 0 : -1;
    case "individual_bogey":
      return netVsPar <= 0 ? 1 : netVsPar === 1 ? 0 : -1;
    case "net_stroke_play":
    case "chairman":
    case "maximum_score":
    case "fourball_net_betterball":
    case "texas_scramble":
    case "american_scramble":
    case "chapman":
      return 0;
    default:
      return Math.max(0, par + 2 - (gross - ha));
  }
}
function dotColorForFormat(fmt: string, pts: number | null, GOLD: string): string {
  if (pts == null) return "#f87171";
  if (fmt === "par_bogey" || fmt === "individual_par" || fmt === "individual_bogey")
    return pts > 0 ? "#16a34a" : pts === 0 ? GOLD : "#f87171";
  if (fmt === "modified_stableford")
    return pts >= 4 ? "#16a34a" : pts >= 2 ? GOLD : pts >= 0 ? "#fb923c" : "#f87171";
  if (fmt === "individual_bonus_bogey" || fmt === "betterball_bonus_bogey")
    return pts > 0 ? "#16a34a" : pts === 0 ? GOLD : "#f87171";
  return pts >= 3 ? "#16a34a" : pts >= 2 ? GOLD : pts >= 1 ? "#fb923c" : "#f87171";
}
function scoreName(gross: number, par: number): string {
  if (gross === 1) return "Hole-in-one";
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
  if (d === -1) return "#16a34a";
  if (d === 0) return "#1a5c38";
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
  if (holesPlayed > 0 && holesUp > holesRemaining)
    return { holesUp, holesPlayed, holesRemaining, won, lost, halved, decided: true,  label: `Won ${holesUp}&${holesRemaining}`,   color: "#16a34a" };
  if (holesPlayed > 0 && -holesUp > holesRemaining)
    return { holesUp, holesPlayed, holesRemaining, won, lost, halved, decided: true,  label: `Lost ${-holesUp}&${holesRemaining}`, color: "#f87171" };
  if (holesPlayed === 0 || holesUp === 0)
    return { holesUp: 0, holesPlayed, holesRemaining, won, lost, halved, decided: false, label: "All Square", color: GOLD };
  if (holesUp > 0 && holesUp === holesRemaining)
    return { holesUp, holesPlayed, holesRemaining, won, lost, halved, decided: false, label: `Dormie ${holesUp}`, color: "#16a34a" };
  if (holesUp < 0 && -holesUp === holesRemaining)
    return { holesUp, holesPlayed, holesRemaining, won, lost, halved, decided: false, label: `Dormie (Down)`,    color: "#f87171" };
  if (holesUp > 0)
    return { holesUp, holesPlayed, holesRemaining, won, lost, halved, decided: false, label: `${holesUp} UP`,    color: "#16a34a" };
  return   { holesUp, holesPlayed, holesRemaining, won, lost, halved, decided: false, label: `${-holesUp} DOWN`, color: "#f87171" };
}

// ─── Stableford Singles Match Status ─────────────────────────────────────────
function calcStablefardSinglesMatchStatus(
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
    // WHS standard: only handicap DIFFERENCE is applied
    const myPts  = calcPoints(mine.gross_score, h.par, getHA(h.stroke_index, Math.max(0, myHcp  - oppHcp)));
    const oppPts = calcPoints(opp.gross_score,  h.par, getHA(h.stroke_index, Math.max(0, oppHcp - myHcp)));
    if      (myPts > oppPts) won++;
    else if (myPts < oppPts) lost++;
    else                     halved++;
  }
  const holesPlayed    = won + lost + halved;
  const holesRemaining = sc.length - holesPlayed;
  const holesUp        = won - lost;
  if (holesPlayed > 0 && holesUp > holesRemaining)
    return { holesUp, holesPlayed, holesRemaining, won, lost, halved, decided: true,  label: `Won ${holesUp}&${holesRemaining}`,   color: "#16a34a" };
  if (holesPlayed > 0 && -holesUp > holesRemaining)
    return { holesUp, holesPlayed, holesRemaining, won, lost, halved, decided: true,  label: `Lost ${-holesUp}&${holesRemaining}`, color: "#f87171" };
  if (holesPlayed === 0 || holesUp === 0)
    return { holesUp: 0, holesPlayed, holesRemaining, won, lost, halved, decided: false, label: "All Square", color: GOLD };
  if (holesUp > 0 && holesUp === holesRemaining)
    return { holesUp, holesPlayed, holesRemaining, won, lost, halved, decided: false, label: `Dormie ${holesUp}`, color: "#16a34a" };
  if (holesUp < 0 && -holesUp === holesRemaining)
    return { holesUp, holesPlayed, holesRemaining, won, lost, halved, decided: false, label: "Dormie (Down)", color: "#f87171" };
  if (holesUp > 0)
    return { holesUp, holesPlayed, holesRemaining, won, lost, halved, decided: false, label: `${holesUp} UP`,    color: "#16a34a" };
  return   { holesUp, holesPlayed, holesRemaining, won, lost, halved, decided: false, label: `${-holesUp} DOWN`, color: "#f87171" };
}

// ─── Gross Singles Match Status ───────────────────────────────────────────────
function calcGrossMatchStatus(
  sc: ScorecardHole[],
  myHoles: Record<number, SavedHole>,
  playerHoles: Record<string, { gross_score: number | null; is_nr: number }>
): MatchStatus {
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
  if (holesPlayed > 0 && holesUp > holesRemaining)
    return { holesUp, holesPlayed, holesRemaining, won, lost, halved, decided: true,  label: `Won ${holesUp}&${holesRemaining}`,   color: "#16a34a" };
  if (holesPlayed > 0 && -holesUp > holesRemaining)
    return { holesUp, holesPlayed, holesRemaining, won, lost, halved, decided: true,  label: `Lost ${-holesUp}&${holesRemaining}`, color: "#f87171" };
  if (holesPlayed === 0 || holesUp === 0)
    return { holesUp: 0, holesPlayed, holesRemaining, won, lost, halved, decided: false, label: "All Square", color: GOLD };
  if (holesUp > 0 && holesUp === holesRemaining)
    return { holesUp, holesPlayed, holesRemaining, won, lost, halved, decided: false, label: `Dormie ${holesUp}`, color: "#16a34a" };
  if (holesUp < 0 && -holesUp === holesRemaining)
    return { holesUp, holesPlayed, holesRemaining, won, lost, halved, decided: false, label: `Dormie (Down)`,    color: "#f87171" };
  if (holesUp > 0)
    return { holesUp, holesPlayed, holesRemaining, won, lost, halved, decided: false, label: `${holesUp} UP`,    color: "#16a34a" };
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
    return { holesUp, holesPlayed, holesRemaining, won, lost, halved, decided: true,  label: `Won ${holesUp}&${holesRemaining}`,   color: "#16a34a" };
  if (holesPlayed > 0 && -holesUp > holesRemaining)
    return { holesUp, holesPlayed, holesRemaining, won, lost, halved, decided: true,  label: `Lost ${-holesUp}&${holesRemaining}`, color: "#f87171" };
  if (holesPlayed === 0 || holesUp === 0)
    return { holesUp: 0, holesPlayed, holesRemaining, won, lost, halved, decided: false, label: "All Square", color: GOLD };
  if (holesUp > 0 && holesUp === holesRemaining)
    return { holesUp, holesPlayed, holesRemaining, won, lost, halved, decided: false, label: `Dormie ${holesUp}`, color: "#16a34a" };
  if (holesUp < 0 && -holesUp === holesRemaining)
    return { holesUp, holesPlayed, holesRemaining, won, lost, halved, decided: false, label: "Dormie (Down)", color: "#f87171" };
  if (holesUp > 0)
    return { holesUp, holesPlayed, holesRemaining, won, lost, halved, decided: false, label: `${holesUp} UP`,    color: "#16a34a" };
  return   { holesUp, holesPlayed, holesRemaining, won, lost, halved, decided: false, label: `${-holesUp} DOWN`, color: "#f87171" };
}

// ─── Betterball Gross Match Status ────────────────────────────────────────────
function calcBetterballGrossMatchStatus(
  sc: ScorecardHole[],
  myHoles: Record<number, SavedHole>,
  playerHoles: Record<string, { gross_score: number | null; is_nr: number }>
): MatchStatus {
  let won = 0, lost = 0, halved = 0;
  for (const h of sc) {
    const mine    = myHoles[h.number];
    const partner = playerHoles[`0_${h.number}`];
    const opp1    = playerHoles[`1_${h.number}`];
    const opp2    = playerHoles[`2_${h.number}`];
    if (!mine || mine.gross_score == null || mine.is_nr) continue;
    if (!opp1 && !opp2) continue;
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
  if (holesPlayed > 0 && holesUp > holesRemaining)
    return { holesUp, holesPlayed, holesRemaining, won, lost, halved, decided: true,  label: `Won ${holesUp}&${holesRemaining}`,   color: "#16a34a" };
  if (holesPlayed > 0 && -holesUp > holesRemaining)
    return { holesUp, holesPlayed, holesRemaining, won, lost, halved, decided: true,  label: `Lost ${-holesUp}&${holesRemaining}`, color: "#f87171" };
  if (holesPlayed === 0 || holesUp === 0)
    return { holesUp: 0, holesPlayed, holesRemaining, won, lost, halved, decided: false, label: "All Square", color: GOLD };
  if (holesUp > 0 && holesUp === holesRemaining)
    return { holesUp, holesPlayed, holesRemaining, won, lost, halved, decided: false, label: `Dormie ${holesUp}`, color: "#16a34a" };
  if (holesUp < 0 && -holesUp === holesRemaining)
    return { holesUp, holesPlayed, holesRemaining, won, lost, halved, decided: false, label: "Dormie (Down)", color: "#f87171" };
  if (holesUp > 0)
    return { holesUp, holesPlayed, holesRemaining, won, lost, halved, decided: false, label: `${holesUp} UP`,    color: "#16a34a" };
  return   { holesUp, holesPlayed, holesRemaining, won, lost, halved, decided: false, label: `${-holesUp} DOWN`, color: "#f87171" };
}

function calcBetterballStablefordMatchStatus(
  sc: ScorecardHole[],
  myHoles: Record<number, SavedHole>,
  playerHoles: Record<string, { gross_score: number | null; is_nr: number }>,
  myHcp: number,
  oppHcp: number
): MatchStatus {
  const calcPtsLocal = (gross: number, par: number, ha: number) => Math.max(0, par + 2 - (gross - ha));
  let won = 0, lost = 0, halved = 0;
  for (const h of sc) {
    const mine    = myHoles[h.number];
    const partner = playerHoles[`0_${h.number}`];
    const opp1    = playerHoles[`1_${h.number}`];
    const opp2    = playerHoles[`2_${h.number}`];
    if (!mine || mine.gross_score == null || mine.is_nr) continue;
    if (!opp1 && !opp2) continue;
    const ha       = getHA(h.stroke_index, myHcp);
    const oppHA    = getHA(h.stroke_index, oppHcp);
    const myPts    = calcPtsLocal(mine.gross_score, h.par, ha);
    const partPts  = partner?.gross_score != null && !partner.is_nr ? calcPtsLocal(partner.gross_score, h.par, ha) : null;
    const teamBest = partPts != null ? Math.max(myPts, partPts) : myPts;
    const opp1Pts  = opp1?.gross_score != null && !opp1.is_nr ? calcPtsLocal(opp1.gross_score, h.par, oppHA) : null;
    const opp2Pts  = opp2?.gross_score != null && !opp2.is_nr ? calcPtsLocal(opp2.gross_score, h.par, oppHA) : null;
    const oppBest  = opp1Pts != null && opp2Pts != null ? Math.max(opp1Pts, opp2Pts) : (opp1Pts ?? opp2Pts);
    if (oppBest == null) continue;
    if      (teamBest > oppBest) won++;
    else if (teamBest < oppBest) lost++;
    else                         halved++;
  }
  const holesPlayed    = won + lost + halved;
  const holesRemaining = sc.length - holesPlayed;
  const holesUp        = won - lost;
  if (holesPlayed > 0 && holesUp > holesRemaining)
    return { holesUp, holesPlayed, holesRemaining, won, lost, halved, decided: true,  label: `Won ${holesUp}&${holesRemaining}`,   color: "#16a34a" };
  if (holesPlayed > 0 && -holesUp > holesRemaining)
    return { holesUp, holesPlayed, holesRemaining, won, lost, halved, decided: true,  label: `Lost ${-holesUp}&${holesRemaining}`, color: "#f87171" };
  if (holesPlayed === 0 || holesUp === 0)
    return { holesUp: 0, holesPlayed, holesRemaining, won, lost, halved, decided: false, label: "All Square", color: GOLD };
  if (holesUp > 0 && holesUp === holesRemaining)
    return { holesUp, holesPlayed, holesRemaining, won, lost, halved, decided: false, label: `Dormie ${holesUp}`, color: "#16a34a" };
  if (holesUp < 0 && -holesUp === holesRemaining)
    return { holesUp, holesPlayed, holesRemaining, won, lost, halved, decided: false, label: "Dormie (Down)", color: "#f87171" };
  if (holesUp > 0)
    return { holesUp, holesPlayed, holesRemaining, won, lost, halved, decided: false, label: `${holesUp} UP`,    color: "#16a34a" };
  return   { holesUp, holesPlayed, holesRemaining, won, lost, halved, decided: false, label: `${-holesUp} DOWN`, color: "#f87171" };
}

// ─── BbPlayerInput — module-level so React sees a stable component type ──────
// (Defining this inside HoleEntryScreen would give it a new reference on every
//  render, causing unmount/remount and resetting the ScrollView position.)
function BbPlayerInput({
  label, color, bgColor, gross: g, setGross: sg, ha: playerHA, par, isBest, flat, quickRef, maxGross,
}: {
  label: string; color: string; bgColor: string;
  gross: number | null; setGross: (v: number | null) => void;
  ha: number; par: number; isBest?: boolean; flat?: boolean;
  quickRef?: React.RefObject<ScrollView>;
  maxGross?: number | null;
}) {
  return (
    <View style={[styles.oppStepperSection, { backgroundColor: bgColor, paddingVertical: 8 }, flat ? { marginHorizontal: 0, borderRadius: 0 } : { marginHorizontal: 12 }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6, paddingLeft: 16 }}>
        <View style={[styles.sectionDot, { backgroundColor: color }]} />
        <Text style={[styles.sectionLabel, { color }]}>{label.toUpperCase()}</Text>
      </View>
      <View style={[styles.stepper, { paddingHorizontal: 16 }]}>
        <TouchableOpacity
          onPress={() => { Haptics.selectionAsync(); sg(v => v == null ? par + 1 : Math.max(1, v - 1)); }}
          style={[styles.stepBtn, styles.stepBtnMinus, { borderColor: g != null && g > 1 ? "#f87171" : BORDER, width: 52, height: 52, borderRadius: 26 }]}
        >
          <Text style={[styles.stepBtnText, { color: g != null && g > 1 ? "#f87171" : MUTED_FG, fontSize: 24 }]}>−</Text>
        </TouchableOpacity>
        <View style={styles.scoreDisplay}>
          {g != null ? (
            <>
              <Text style={[styles.scoreValue, { color: scoreColor(g, par), fontSize: 60, lineHeight: 64 }]}>{g}</Text>
              <Text style={styles.scoreNet}>Net {g - playerHA}</Text>
            </>
          ) : (
            <Text style={[styles.scoreValue, { color: BORDER, fontSize: 60, lineHeight: 64 }]}>—</Text>
          )}
        </View>
        <TouchableOpacity
          onPress={() => { Haptics.selectionAsync(); sg(v => v == null ? par + 1 : Math.min(15, v + 1)); }}
          style={[styles.stepBtn, { borderColor: color, backgroundColor: color + "22", width: 52, height: 52, borderRadius: 26 }]}
        >
          <Text style={[styles.stepBtnText, { color, fontSize: 24 }]}>+</Text>
        </TouchableOpacity>
      </View>
      <ScrollView ref={quickRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRow}>
        {[-4, -3, -2, -1, 0, 1, 2, 3, 4, 5].map(offset => {
          const val = par + offset;
          if (val < 1) return null;
          const active = g === val;
          const qColor = val < par ? "#16a34a" : val === par ? GOLD : val === par + 1 ? "#fb923c" : "#f87171";
          const labelMap: Record<number, string> = { [-4]: "Condor", [-3]: "Albatross", [-2]: "Eagle", [-1]: "Birdie", [0]: "Par", [1]: "Bogey", [2]: "Double", [3]: "+3", [4]: "+4", [5]: "+5" };
          const scoreLabel = val === 1 ? "Hole-in-one" : labelMap[offset];
          return (
            <TouchableOpacity key={offset} onPress={() => { Haptics.selectionAsync(); sg(val); }}
              style={[styles.quickBtn, { backgroundColor: active ? qColor + "33" : SURFACE, borderColor: active ? qColor : BORDER }]}>
              <Text style={[styles.quickBtnScore, { color: active ? qColor : "#1a1f1c" }]}>{val}</Text>
              <Text style={[styles.quickBtnLabel, { color: active ? qColor : MUTED_FG }]}>{scoreLabel}</Text>
            </TouchableOpacity>
          );
        })}
        {/* Pickup — format's max Stableford score (0 pts threshold) */}
        {maxGross != null && (() => {
          const active = g === maxGross;
          return (
            <TouchableOpacity key="pickup" onPress={() => { Haptics.selectionAsync(); sg(maxGross); }}
              style={[styles.quickBtn, { backgroundColor: active ? MUTED_FG + "33" : SURFACE, borderColor: active ? MUTED_FG : BORDER, width: 80 }]}>
              <Text style={[styles.quickBtnScore, { color: active ? "#1a1f1c" : MUTED_FG, fontSize: 11 }]}>{maxGross}</Text>
              <Text style={[styles.quickBtnLabel, { color: active ? "#1a1f1c" : MUTED_FG }]}>Pickup</Text>
            </TouchableOpacity>
          );
        })()}
      </ScrollView>
    </View>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function HoleEntryScreen() {
  const { id, startHole } = useLocalSearchParams<{ id: string; startHole?: string }>();
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
  const [pendingCount, setPendingCount] = useState(0);
  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false);
  const [abandoning, setAbandoning] = useState(false);
  const [showHcpModal, setShowHcpModal] = useState(false);
  const [hcpDraft, setHcpDraft] = useState({ my: 0, opp: 0, partner: 0, opp2: 0 });
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [savingHcp, setSavingHcp] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const mainScrollRef = useRef<ScrollView>(null);
  const holeStripRef = useRef<ScrollView>(null);
  const quickRowRef = useRef<ScrollView>(null);
  const partnerQuickRef = useRef<ScrollView>(null);
  const opp1QuickRef = useRef<ScrollView>(null);
  const opp2QuickRef = useRef<ScrollView>(null);

  // Centre the Par button in the quick-tap row whenever the hole changes.
  // PAR_INDEX is dynamic: offset array is [-4..5] with val<1 items filtered,
  // so the number of buttons before par = min(4, par-1).
  useEffect(() => {
    const currentPar = round?.scorecard?.[holeIdx]?.par ?? 4;
    const PAR_INDEX = Math.min(4, currentPar - 1);
    const BTN_WIDTH = 68;
    const GAP = 6;
    const ROW_PADDING = 20;   // quickRow contentContainerStyle paddingHorizontal
    const SECTION_PAD = 20;   // stepperSection paddingHorizontal (shrinks viewport)
    const screenWidth = Dimensions.get("window").width;
    const viewportWidth = screenWidth - SECTION_PAD * 2;
    const parCenter = ROW_PADDING + PAR_INDEX * (BTN_WIDTH + GAP) + BTN_WIDTH / 2;
    const scrollX = Math.max(0, parCenter - viewportWidth / 2);
    // BbPlayerInput + betterball user box: group box marginHorizontal:12×2 + borderWidth:1×2 = 26px narrower
    const bbViewportWidth = screenWidth - 26;
    const bbScrollX = Math.max(0, parCenter - bbViewportWidth / 2);
    const isBbRound = hasFourPlayers(round ?? { format: "", partner_name: null });
    setTimeout(() => {
      // Main player is now always in a card (same width as bb card: screenWidth-26)
      quickRowRef.current?.scrollTo({ x: bbScrollX, animated: false });
      partnerQuickRef.current?.scrollTo({ x: bbScrollX, animated: false });
      // Singles opponent uses oppStepperSection (marginHorizontal:12, no border) → scrollX
      opp1QuickRef.current?.scrollTo({ x: isBbRound ? bbScrollX : scrollX, animated: false });
      opp2QuickRef.current?.scrollTo({ x: bbScrollX, animated: false });
      // Keep hole strip centred on the active chip
      holeStripRef.current?.scrollTo({ x: Math.max(0, (holeIdx - 3) * 42), animated: false });
    }, 80);
  }, [holeIdx, round]);

  const loadRound = useCallback(async () => {
    if (!token || !id) return;
    try {
      const data = await apiFetch(`/scoring/rounds/${id}`, token);
      setRound(data);
      const scorecard: ScorecardHole[] = data.scorecard ?? [];
      const holes: Record<number, SavedHole> = data.holes ?? {};
      const isNewRound = Object.keys(holes).length === 0;
      const startHoleNum = startHole ? parseInt(startHole as string, 10) : 1;
      let startIdx: number;
      if (isNewRound) {
        // New round: respect shotgun start hole
        const preferred = scorecard.findIndex((h: ScorecardHole) => h.number === startHoleNum);
        startIdx = preferred >= 0 ? preferred : 0;
      } else {
        // Resuming: go to the hole after the last scored one (handles shotgun & normal)
        const scoredIdxs = scorecard
          .map((h, i) => (holes[h.number] ? i : -1))
          .filter(i => i >= 0);
        const lastScored = Math.max(...scoredIdxs);
        const nextIdx = (lastScored + 1) % scorecard.length;
        startIdx = !holes[scorecard[nextIdx]?.number] ? nextIdx : lastScored;
      }
      setHoleIdx(startIdx);
      setGross(holes[scorecard[startIdx]?.number]?.gross_score ?? null);
      const ph0 = data.playerHoles as Record<string, any> | undefined;
      if (hasFourPlayers(data)) {
        setPartnerGross(ph0?.[`0_${scorecard[startIdx]?.number}`]?.gross_score ?? null);
        setOppGross(ph0?.[`1_${scorecard[startIdx]?.number}`]?.gross_score ?? null);
        setOpp2Gross(ph0?.[`2_${scorecard[startIdx]?.number}`]?.gross_score ?? null);
      } else {
        setOppGross(ph0?.[`0_${scorecard[startIdx]?.number}`]?.gross_score ?? null);
        if (data.opponent2_name) {
          setOpp2Gross(ph0?.[`1_${scorecard[startIdx]?.number}`]?.gross_score ?? null);
        }
      }
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to load round");
    } finally {
      setLoading(false);
    }
  }, [token, id]);

  useEffect(() => { loadRound(); }, [loadRound]);

  // ── Offline queue — hooks MUST live before any early return ──────────────
  const QUEUE_KEY = `scoring_queue_${id}`;

  const readQueue = useCallback(async (): Promise<Array<{ holeNumber: number; body: Record<string, unknown> }>> => {
    try { return JSON.parse((await AsyncStorage.getItem(QUEUE_KEY)) ?? "[]"); } catch { return []; }
  }, [QUEUE_KEY]);

  const queueScore = useCallback(async (holeNumber: number, body: Record<string, unknown>) => {
    const queue = await readQueue();
    const filtered = queue.filter(q => q.holeNumber !== holeNumber);
    filtered.push({ holeNumber, body });
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(filtered));
    setPendingCount(filtered.length);
  }, [QUEUE_KEY, readQueue]);

  const flushQueue = useCallback(async () => {
    if (!token) return;
    const queue = await readQueue();
    if (queue.length === 0) return;
    const remaining: typeof queue = [];
    for (const item of queue) {
      try {
        await apiFetch(`/scoring/rounds/${id}/holes/${item.holeNumber}`, token, {
          method: "PUT", body: JSON.stringify(item.body),
        });
      } catch {
        remaining.push(item);
      }
    }
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
    setPendingCount(remaining.length);
  }, [QUEUE_KEY, id, token, readQueue]);

  useEffect(() => {
    readQueue().then(q => setPendingCount(q.length));
    flushQueue();
  }, [flushQueue, readQueue]);

  // Auto-clear error banner when the user enters any score
  useEffect(() => { setScoreError(null); }, [gross, partnerGross, oppGross, opp2Gross]);

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
  const isParOrBogeyFormat = round.format === "par_bogey" || round.format === "individual_par" || round.format === "individual_bogey";
  const isNetOnlyFormat    = round.format === "net_stroke_play" || round.format === "chairman" || round.format === "maximum_score" || round.format === "fourball_net_betterball" || round.format === "texas_scramble" || round.format === "american_scramble" || round.format === "chapman";
  const stablefordMax  = getStablefordMax(round.format ?? "individual_stableford", hole.par, ha);
  const effectiveGross = stablefordMax != null && gross != null ? Math.min(gross, stablefordMax) : gross;
  const pts      = effectiveGross != null ? calcFormatPts(round.format ?? "individual_stableford", effectiveGross, hole.par, ha) : null;
  const netScore = effectiveGross != null ? effectiveGross - ha : null;

  const totalPts = scorecard.reduce((sum, h) => {
    const saved = round.holes[h.number];
    if (saved && saved.gross_score != null && !saved.is_nr) {
      return sum + (saved.stableford_points ?? 0);
    }
    return sum;
  }, 0);

  const goToHole = (idx: number) => {
    setScoreError(null);
    setHoleIdx(idx);
    setGross(round.holes[scorecard[idx].number]?.gross_score ?? null);
    if (hasFourPlayers(round)) {
      setPartnerGross(round.playerHoles?.[`0_${scorecard[idx].number}`]?.gross_score ?? null);
      setOppGross(round.playerHoles?.[`1_${scorecard[idx].number}`]?.gross_score ?? null);
      setOpp2Gross(round.playerHoles?.[`2_${scorecard[idx].number}`]?.gross_score ?? null);
    } else {
      setOppGross(round.playerHoles?.[`0_${scorecard[idx].number}`]?.gross_score ?? null);
      if (round.opponent2_name) {
        setOpp2Gross(round.playerHoles?.[`1_${scorecard[idx].number}`]?.gross_score ?? null);
      }
    }
    holeStripRef.current?.scrollTo({ x: Math.max(0, (idx - 3) * 42), animated: true });
    mainScrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  const isNetworkError = (err: any) =>
    err instanceof TypeError ||
    /network request failed|failed to fetch|networkerror|no internet/i.test(err?.message ?? "");

  // ── Save current hole and advance ────────────────────────────────────────
  const saveAndNext = async (isNr = false) => {
    const isMP = round.format === "singles_match_play";
    const isBB = hasFourPlayers(round);
    const isMR = !isBB && !isMP && !!round.opponent_name;

    if (!isNr) {
      const missing: string[] = [];
      if (gross == null)
        missing.push("You");
      if (isBB && round.partner_name && partnerGross == null)
        missing.push(round.partner_name);
      if ((isBB || isMP || isMR) && round.opponent_name && oppGross == null)
        missing.push(round.opponent_name);
      if ((isBB || isMR) && round.opponent2_name && opp2Gross == null)
        missing.push(round.opponent2_name);

      if (missing.length > 0) {
        const isSelf = missing.length === 1 && missing[0] === "You";
        setScoreError(
          isSelf
            ? "Enter your score before proceeding."
            : `Enter a score for: ${missing.join(", ")}`
        );
        return;
      }
    }

    setSaving(true);
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
        { name: round.opponent2_name ?? "Opp 2", grossScore: isNr ? null : opp2Gross   },
      ];
    }
    if (isMR && oppGross != null) {
      body.players = [
        { name: round.opponent_name ?? "Marker", grossScore: isNr ? null : oppGross },
        ...(round.opponent2_name ? [{ name: round.opponent2_name, grossScore: isNr ? null : opp2Gross }] : []),
      ];
    }

    // Update local state immediately (optimistic) so navigation feels instant
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
    if (isMR) {
      updatedPlayerHoles[`0_${hole.number}`] = { gross_score: isNr ? null : oppGross, is_nr: isNr ? 1 : 0 };
      if (round.opponent2_name) {
        updatedPlayerHoles[`1_${hole.number}`] = { gross_score: isNr ? null : opp2Gross, is_nr: isNr ? 1 : 0 };
      }
    }
    setRound({ ...round, holes: updatedHoles, playerHoles: updatedPlayerHoles });

    try {
      await apiFetch(`/scoring/rounds/${id}/holes/${hole.number}`, token, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      // Hole saved — remove from queue if it was queued previously
      const queue = await readQueue();
      const updated = queue.filter(q => q.holeNumber !== hole.number);
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(updated));
      setPendingCount(updated.length);
    } catch (err: any) {
      if (err?.message?.includes("404") || err?.status === 404 || err?.message?.includes("not found")) {
        router.replace(`/scoring/${id}/complete`);
        return;
      }
      if (isNetworkError(err)) {
        // No signal — queue locally and continue without blocking
        await queueScore(hole.number, body);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } else {
        Alert.alert("Error", err.message || "Failed to save score");
        setSaving(false);
        return;
      }
    } finally {
      setSaving(false);
    }

    // Advance to next unsaved hole (wraps around for shotgun starts)
    let nextIdx = -1;
    for (let i = 1; i <= scorecard.length; i++) {
      const candidate = (holeIdx + i) % scorecard.length;
      if (updatedHoles[scorecard[candidate].number] == null) {
        nextIdx = candidate;
        break;
      }
    }
    if (nextIdx === -1) {
      router.replace(`/scoring/${id}/complete`);
    } else {
      goToHole(nextIdx);
    }
  };

  const clearHoleScore = () => {
    if (!Object.values(round.holes).find(h => h.hole_number === hole.number)) return;
    setShowClearConfirm(true);
  };

  const doClearHole = async () => {
    const targetHoleNum = hole.number;
    const targetHoleIdx = holeIdx;
    setClearing(true);
    try {
      await apiFetch(`/scoring/rounds/${id}/holes/${targetHoleNum}`, token, { method: "DELETE" });
    } catch { /* best-effort */ }
    try {
      const data = await apiFetch(`/scoring/rounds/${id}`, token);
      setRound(data);
      const sc: ScorecardHole[] = data.scorecard ?? [];
      const idx = sc.findIndex(h => h.number === targetHoleNum);
      setHoleIdx(idx >= 0 ? idx : targetHoleIdx);
      setGross(null);
      setPartnerGross(null);
      setOppGross(null);
      setOpp2Gross(null);
    } catch { /* ignore */ }
    setClearing(false);
    setShowClearConfirm(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const confirmAndFinish = () => {
    router.replace(`/scoring/${id}/complete`);
  };

  const onAbandon = () => setShowAbandonConfirm(true);

  const openHcpModal = () => {
    if (!round) return;
    setHcpDraft({
      my:      round.playing_handicap,
      opp:     round.opponent_playing_hcp  ?? 0,
      partner: round.partner_playing_hcp   ?? 0,
      opp2:    round.opponent2_playing_hcp ?? 0,
    });
    setShowHcpModal(true);
  };

  const saveHcp = async () => {
    setSavingHcp(true);
    try {
      await apiFetch(`/scoring/rounds/${id}/handicaps`, token, {
        method: "PATCH",
        body: JSON.stringify({
          playingHandicap:     hcpDraft.my,
          opponentPlayingHcp:  hcpDraft.opp,
          partnerPlayingHcp:   hcpDraft.partner,
          opponent2PlayingHcp: hcpDraft.opp2,
        }),
      });
      setShowHcpModal(false);
      await loadRound();
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to update handicap");
    } finally {
      setSavingHcp(false);
    }
  };

  const doAbandon = async () => {
    setAbandoning(true);
    try {
      await apiFetch(`/scoring/rounds/${id}/abandon`, token, { method: "POST" });
    } catch {}
    setAbandoning(false);
    setShowAbandonConfirm(false);
    router.replace("/(tabs)/scoring");
  };

  const isLastUnsaved      = scorecard.filter(h => h.number !== hole.number && round.holes[h.number] == null).length === 0;
  const isMatchPlay        = round.format === "singles_match_play" || round.format === "singles_stableford_match_play" || round.format === "singles_gross_match_play";
  const isKnockoutBetterball = round.format === "betterball_match_play" || round.format === "betterball_gross_match_play" || round.format === "fourball_stableford_match_play";
  // isBetterball = any round with 4-player input (knockout betterball OR regular betterball with group)
  const isBetterball       = hasFourPlayers(round);
  // isAnyMatch = true only for actual match-play formats (drives match-status banner / End Match button)
  const isAnyMatch         = isMatchPlay || isKnockoutBetterball;
  // isMarkerRound = individual tournament: player records their own score + their marker's score for validation
  const isMarkerRound      = !isBetterball && !isAnyMatch && !!round.opponent_name;
  // hasOpponents = show any additional score inputs (match play + betterball + marker)
  const hasOpponents       = isAnyMatch || isBetterball || isMarkerRound;

  const matchSt: MatchStatus | null = isMatchPlay
    ? (round.format === "singles_stableford_match_play"
        ? calcStablefardSinglesMatchStatus(scorecard, round.holes, round.playerHoles ?? {}, round.playing_handicap, round.opponent_playing_hcp ?? 0)
        : round.format === "singles_gross_match_play"
        ? calcGrossMatchStatus(scorecard, round.holes, round.playerHoles ?? {})
        : calcMatchStatus(scorecard, round.holes, round.playerHoles ?? {}, round.playing_handicap, round.opponent_playing_hcp ?? 0))
    : isKnockoutBetterball
    ? (round.format === "betterball_gross_match_play"
        ? calcBetterballGrossMatchStatus(scorecard, round.holes, round.playerHoles ?? {})
        : round.format === "fourball_stableford_match_play"
        ? calcBetterballStablefordMatchStatus(scorecard, round.holes, round.playerHoles ?? {}, round.playing_handicap, round.opponent_playing_hcp ?? 0)
        : calcBetterballMatchStatus(scorecard, round.holes, round.playerHoles ?? {}, round.playing_handicap, round.opponent_playing_hcp ?? 0))
    : null;

  // Betterball per-hole helpers (current hole being entered)
  const partnerHA  = isBetterball ? getHA(hole.stroke_index, round.partner_playing_hcp ?? round.playing_handicap) : 0;
  const opp2HA     = isBetterball ? getHA(hole.stroke_index, round.opponent2_playing_hcp ?? round.opponent_playing_hcp ?? 0) : 0;
  const partnerNet = partnerGross != null ? partnerGross - partnerHA : null;
  const opp1Net    = oppGross     != null ? oppGross     - oppHA     : null;
  const opp2Net    = opp2Gross    != null ? opp2Gross    - opp2HA    : null;
  // Which player is carrying the team? (lower net = better)
  const bbTeamWinner = netScore != null && partnerNet != null
    ? (netScore <= partnerNet ? 0 : 1) : netScore != null ? 0 : 1;
  const bbOppWinner  = opp1Net != null && opp2Net != null
    ? (opp1Net  <= opp2Net   ? 0 : 1) : opp1Net  != null ? 0 : 1;

  // Best-ball Stableford points for regular betterball competitions
  const partnerPts = isBetterball && partnerGross != null ? calcPoints(partnerGross, hole.par, partnerHA) : null;
  const bbPts = isBetterball
    ? (pts != null && partnerPts != null ? Math.max(pts, partnerPts) : (pts ?? partnerPts ?? null))
    : null;
  const runningBbPts = isBetterball && !isKnockoutBetterball
    ? scorecard.slice(0, holeIdx).reduce((sum, h) => sum + (round.holes[h.number]?.stableford_points ?? 0), 0)
    : 0;

  return (
    <View style={{ flex: 1, backgroundColor: DARK_BG }}>
      <AppHeader />
      {/* Top bar — back + club name + round controls */}
      <View style={[styles.topBar, { paddingTop: 8 }]}>
        {/* Row 1: back + club name + HCP */}
        <View style={styles.topBarRow1}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={20} color={GREEN} />
          </TouchableOpacity>
          <Text style={styles.topBarClub} numberOfLines={1}>{round.club_name}</Text>
          <TouchableOpacity
            onPress={openHcpModal}
            style={[styles.topActionBtn, { borderColor: GREEN + "55" }]}
          >
            <Ionicons name="golf-outline" size={13} color={GREEN} />
            <Text style={[styles.topActionText, { color: GREEN }]}>HCP {ph < 0 ? `+${-ph}` : ph}</Text>
          </TouchableOpacity>
        </View>
        {/* Row 2: action buttons */}
        <View style={styles.topBarRow2}>
          <TouchableOpacity
            onPress={onAbandon}
            style={[styles.topActionBtn, { borderColor: "rgba(0,0,0,0.15)" }]}
          >
            <Ionicons name="close-circle-outline" size={13} color="rgba(0,0,0,0.4)" />
            <Text style={[styles.topActionText, { color: "rgba(0,0,0,0.4)" }]}>Abandon</Text>
          </TouchableOpacity>
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
          const dotBg = active ? GREEN
            : played ? dotColorForFormat(round.format ?? "", p, GOLD)
            : SURFACE;
          return (
            <TouchableOpacity key={h.number} onPress={() => goToHole(i)} style={[styles.holeChip, { backgroundColor: dotBg, borderColor: active ? GREEN : BORDER, height: active ? 36 : 28 }]}>
              <Text style={{ fontSize: active ? 12 : 10, fontFamily: "Inter_700Bold", color: active ? "#fff" : played ? "#fff" : MUTED_FG }}>
                {h.number}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      </View>
      <Text style={styles.stripMeta}>
        {scorecard.filter(h => round.holes[h.number] != null).length} / {scorecard.length} scored ·{" "}
        {isParOrBogeyFormat
          ? (totalPts > 0 ? `${totalPts} UP` : totalPts < 0 ? `${Math.abs(totalPts)} DOWN` : "All Square")
          : `${totalPts} pts`}
      </Text>
      {pendingCount > 0 && (
        <TouchableOpacity
          onPress={flushQueue}
          style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#78350f", paddingVertical: 6, paddingHorizontal: 14 }}
        >
          <Ionicons name="cloud-offline-outline" size={14} color="#fbbf24" />
          <Text style={{ fontSize: 12, color: "#fbbf24", fontFamily: "Inter_600SemiBold", flex: 1 }}>
            {pendingCount} hole{pendingCount > 1 ? "s" : ""} saved offline — tap to sync
          </Text>
          <Ionicons name="sync-outline" size={14} color="#fbbf24" />
        </TouchableOpacity>
      )}

      {/* Scrollable scoring content */}
      <ScrollView
        ref={mainScrollRef}
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 8 }}
      >
        {/* Hole identity */}
        <View style={[styles.holeHeader, { paddingTop: 20, paddingBottom: 4 }]}>
          <Text style={[styles.holeName, { fontSize: 44, lineHeight: 48 }]}>HOLE {hole.number}</Text>
          <View style={styles.statsRow}>
            {[
              { label: "PAR",          value: String(hole.par),          accent: true },
              { label: "STROKE INDEX", value: String(hole.stroke_index), accent: false },
              { label: "DISTANCE",     value: hole.distance_m ? `${hole.distance_m}m` : "—", accent: false },
              { label: "STROKES",      value: ha > 0 ? `+${ha}` : "0", accent: ha > 0 },
            ].map(s => (
              <View key={s.label} style={[styles.statCard, { backgroundColor: s.accent ? GOLD + "22" : SURFACE, borderColor: s.accent ? GOLD + "60" : BORDER }]}>
                <Text style={[styles.statValue, { color: s.accent ? GOLD : "#111b16" }]}>{s.value}</Text>
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
        <View style={[styles.scoringSectionHeader, { paddingTop: 6, paddingBottom: 2 }]}>
          <View style={[styles.sectionDot, { backgroundColor: GREEN }]} />
          <Text style={[styles.sectionLabel, { color: GREEN }]}>
            {isBetterball ? "YOUR TEAM" : "YOUR SCORE"}
          </Text>
          {round.holes[hole.number] != null && (
            <TouchableOpacity
              onPress={clearHoleScore}
              hitSlop={{ top: 10, bottom: 10, left: 12, right: 12 }}
              style={{ marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: "#f8717140", backgroundColor: "#f8717110" }}
            >
              <Ionicons name="trash-outline" size={12} color="#f87171" />
              <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#f87171" }}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={[styles.teamGroupBox, { borderColor: isBetterball ? "#1a5c3860" : "#16a34a40" }]}>
          <View style={[styles.stepperSection, { paddingHorizontal: 0, paddingVertical: 8, backgroundColor: "#eef5f0" }]}>
            {isBetterball && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6, paddingLeft: 16 }}>
                <View style={[styles.sectionDot, { backgroundColor: "#16a34a" }]} />
                <Text style={[styles.sectionLabel, { color: "#16a34a" }]}>{(user?.name ?? "You").toUpperCase()}</Text>
              </View>
            )}
            {!isBetterball && (
              <View style={{ height: 24, alignItems: "center", justifyContent: "center", marginBottom: 4 }}>
                {gross != null && (
                  <View style={[styles.scoreBadge, { backgroundColor: scoreColor(gross, hole.par) + "22", borderColor: scoreColor(gross, hole.par) + "60" }]}>
                    <Text style={[styles.scoreBadgeText, { color: scoreColor(gross, hole.par) }]}>
                      {scoreName(gross, hole.par)}
                    </Text>
                  </View>
                )}
              </View>
            )}

            <View style={[styles.stepper, isBetterball && { paddingHorizontal: 16 }]}>
              <TouchableOpacity
                onPress={() => { Haptics.selectionAsync(); setGross(v => v == null ? hole.par + 1 : Math.max(1, v - 1)); }}
                style={[styles.stepBtn, styles.stepBtnMinus, { borderColor: gross != null && gross > 1 ? "#f87171" : isBetterball ? "#16a34a55" : BORDER, width: 52, height: 52, borderRadius: 26 }]}
              >
                <Text style={[styles.stepBtnText, { color: gross != null && gross > 1 ? "#f87171" : isBetterball ? "#16a34a99" : MUTED_FG, fontSize: 24 }]}>−</Text>
              </TouchableOpacity>
              <View style={styles.scoreDisplay}>
                {gross != null ? (
                  <>
                    <Text style={[styles.scoreValue, { color: scoreColor(gross, hole.par), fontSize: 60, lineHeight: 64 }]}>{gross}</Text>
                    <Text style={[styles.scoreNet, isBetterball && { color: "#16a34a80" }]}>
                      {`Net ${netScore ?? "—"}`}
                      {!isBetterball && !isNetOnlyFormat && (
                        isParOrBogeyFormat
                          ? ` · ${pts === 1 ? "WIN" : pts === 0 ? "HALVE" : "LOSS"}`
                          : ` · ${pts}pts`
                      )}
                    </Text>
                  </>
                ) : (
                  <Text style={[styles.scoreValue, { color: isBetterball ? "#16a34a30" : BORDER, fontSize: 60, lineHeight: 64 }]}>—</Text>
                )}
              </View>
              <TouchableOpacity
                onPress={() => { Haptics.selectionAsync(); setGross(v => v == null ? hole.par + 1 : Math.min(15, v + 1)); }}
                style={[styles.stepBtn, { borderColor: "#16a34a", backgroundColor: isBetterball ? "#16a34a33" : "#e8f5ee", width: 52, height: 52, borderRadius: 26 }]}
              >
                <Text style={[styles.stepBtnText, { color: "#16a34a", fontSize: 24 }]}>+</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              ref={quickRowRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quickRow}
            >
              {[-4, -3, -2, -1, 0, 1, 2, 3, 4, 5].map(offset => {
                const val = hole.par + offset;
                if (val < 1) return null;
                const active = gross === val;
                const qColor = val < hole.par ? "#16a34a" : val === hole.par ? GOLD : val === hole.par + 1 ? "#fb923c" : "#f87171";
                const labelMap: Record<number, string> = { [-4]: "Condor", [-3]: "Albatross", [-2]: "Eagle", [-1]: "Birdie", [0]: "Par", [1]: "Bogey", [2]: "Double", [3]: "+3", [4]: "+4", [5]: "+5" };
                const scoreLabel = val === 1 ? "Hole-in-one" : labelMap[offset];
                return (
                  <TouchableOpacity
                    key={offset}
                    onPress={() => { Haptics.selectionAsync(); setGross(val); }}
                    style={[styles.quickBtn, { backgroundColor: active ? qColor + "33" : SURFACE, borderColor: active ? qColor : BORDER }]}
                  >
                    <Text style={[styles.quickBtnScore, { color: active ? qColor : "#1a1f1c" }]}>{val}</Text>
                    <Text style={[styles.quickBtnLabel, { color: active ? qColor : MUTED_FG }]}>{scoreLabel}</Text>
                  </TouchableOpacity>
                );
              })}
              {/* Pickup — sets gross to the format's max Stableford score (0 pts threshold) */}
              {stablefordMax != null && (() => {
                const pickupVal = stablefordMax;
                const active = gross === pickupVal;
                return (
                  <TouchableOpacity
                    key="pickup"
                    onPress={() => { Haptics.selectionAsync(); setGross(pickupVal); }}
                    style={[styles.quickBtn, { backgroundColor: active ? MUTED_FG + "33" : SURFACE, borderColor: active ? MUTED_FG : BORDER, width: 80 }]}
                  >
                    <Text style={[styles.quickBtnScore, { color: active ? "#1a1f1c" : MUTED_FG, fontSize: 11 }]}>{pickupVal}</Text>
                    <Text style={[styles.quickBtnLabel, { color: active ? "#1a1f1c" : MUTED_FG }]}>Pickup</Text>
                  </TouchableOpacity>
                );
              })()}
            </ScrollView>
          </View>

          {/* ── PARTNER (betterball only, inside team box) ─────── */}
          {isBetterball && (
            <>
              <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: BORDER, marginHorizontal: 8 }} />
              <BbPlayerInput flat
                label={round.partner_name ?? "Partner"}
                color="#c8a84b" bgColor="#fdf8ee"
                gross={partnerGross} setGross={setPartnerGross}
                ha={partnerHA} par={hole.par} isBest={bbTeamWinner === 1}
                quickRef={partnerQuickRef}
                maxGross={getStablefordMax(round.format ?? "individual_stableford", hole.par, partnerHA)}
              />
            </>
          )}
        </View>

        {/* Points summary — individual (including marker rounds; NOT matchplay / betterball) */}
        {pts != null && (!hasOpponents || isMarkerRound) && (() => {
          const isBonusBogey = round.format === "individual_bonus_bogey";
          const ptsLabel = isBonusBogey ? "Bonus Bogey Points" : "Stableford Points";
          const ptsTxt   = isBonusBogey ? (pts > 0 ? `+${pts}` : `${pts}`) : String(pts);
          const ptsClr   = isBonusBogey
            ? (pts > 0 ? "#16a34a" : pts === 0 ? GOLD : "#f87171")
            : (pts >= 3 ? "#16a34a" : pts >= 2 ? GOLD : pts >= 1 ? "#fb923c" : "#f87171");
          return (
            <View style={styles.ptsSummary}>
              <Text style={styles.ptsSummaryLabel}>{ptsLabel}</Text>
              <Text style={[styles.ptsSummaryValue, { color: ptsClr }]}>{ptsTxt}</Text>
            </View>
          );
        })()}

        {/* Best-ball points summary for regular (non-knockout) betterball competitions */}
        {isBetterball && !isKnockoutBetterball && bbPts != null && (
          <View style={[styles.ptsSummary, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]}>
            <View>
              <Text style={styles.ptsSummaryLabel}>Best Ball Points</Text>
              <Text style={{ fontSize: 11, color: MUTED_FG, fontFamily: "Inter_400Regular", marginTop: 2 }}>Running: {runningBbPts + bbPts} pts</Text>
            </View>
            <Text style={[styles.ptsSummaryValue, { color: bbPts >= 3 ? "#16a34a" : bbPts >= 2 ? GOLD : bbPts >= 1 ? "#fb923c" : "#f87171" }]}>{bbPts}</Text>
          </View>
        )}

        {/* ── MARKER section — individual tournament rounds ─────── */}
        {isMarkerRound && (
          <>
            <View style={[styles.scoringSectionHeader, { paddingTop: 10, paddingBottom: 2 }]}>
              <View style={[styles.sectionDot, { backgroundColor: "#60a5fa" }]} />
              <Text style={[styles.sectionLabel, { color: "#60a5fa" }]}>MARKING FOR</Text>
            </View>
            <View style={styles.oppGroupBox}>
              <BbPlayerInput flat
                label={round.opponent_name ?? "Marker"}
                color="#60a5fa" bgColor="#eef1f8"
                gross={oppGross} setGross={setOppGross}
                ha={oppHA} par={hole.par}
                quickRef={opp1QuickRef}
                maxGross={getStablefordMax(round.format ?? "individual_stableford", hole.par, oppHA)}
              />
              {round.opponent2_name && (
                <>
                  <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: BORDER }} />
                  <BbPlayerInput flat
                    label={round.opponent2_name}
                    color="#a78bfa" bgColor="#f5f0fc"
                    gross={opp2Gross} setGross={setOpp2Gross}
                    ha={opp2HA} par={hole.par}
                    quickRef={opp2QuickRef}
                    maxGross={getStablefordMax(round.format ?? "individual_stableford", hole.par, opp2HA)}
                  />
                </>
              )}
            </View>
          </>
        )}

        {/* ── OPPONENT score section (matchplay + betterball) ─────── */}
        {(isAnyMatch || isBetterball) && (
          <>
            {isAnyMatch && (
              <View style={{ alignItems: "center", justifyContent: "center", paddingTop: 14, paddingBottom: 8 }}>
                <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: MUTED_FG, letterSpacing: 3 }}>VS</Text>
              </View>
            )}
            <View style={[styles.scoringSectionHeader, { paddingTop: isAnyMatch ? 2 : 10, paddingBottom: 2 }]}>
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
                  color="#ef4444" bgColor="#fef2f2"
                  gross={oppGross} setGross={setOppGross}
                  ha={oppHA} par={hole.par} isBest={bbOppWinner === 0}
                  quickRef={opp1QuickRef}
                  maxGross={getStablefordMax(round.format ?? "individual_stableford", hole.par, oppHA)}
                />
                <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: BORDER }} />
                <BbPlayerInput flat
                  label={round.opponent2_name ?? "Opp 2"}
                  color="#60a5fa" bgColor="#eef2fb"
                  gross={opp2Gross} setGross={setOpp2Gross}
                  ha={opp2HA} par={hole.par} isBest={bbOppWinner === 1}
                  quickRef={opp2QuickRef}
                  maxGross={getStablefordMax(round.format ?? "individual_stableford", hole.par, opp2HA)}
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
                      <Text style={[styles.scoreValue, { color: BORDER, fontSize: 60, lineHeight: 64 }]}>—</Text>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={() => { Haptics.selectionAsync(); setOppGross(v => v == null ? hole.par + 1 : Math.min(15, v + 1)); }}
                    style={[styles.stepBtn, { borderColor: "#7c3aed", backgroundColor: "#f3eeff", width: 52, height: 52, borderRadius: 26 }]}
                  >
                    <Text style={[styles.stepBtnText, { color: "#7c3aed", fontSize: 24 }]}>+</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView
                  ref={opp1QuickRef}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.quickRow}
                >
                  {[-4, -3, -2, -1, 0, 1, 2, 3, 4, 5].map(offset => {
                    const val = hole.par + offset;
                    if (val < 1) return null;
                    const active = oppGross === val;
                    const qColor = val < hole.par ? "#16a34a" : val === hole.par ? GOLD : val === hole.par + 1 ? "#fb923c" : "#f87171";
                    const labelMap: Record<number, string> = { [-4]: "Condor", [-3]: "Albatross", [-2]: "Eagle", [-1]: "Birdie", [0]: "Par", [1]: "Bogey", [2]: "Double", [3]: "+3", [4]: "+4", [5]: "+5" };
                    const scoreLabel = val === 1 ? "Hole-in-one" : labelMap[offset];
                    return (
                      <TouchableOpacity
                        key={offset}
                        onPress={() => { Haptics.selectionAsync(); setOppGross(val); }}
                        style={[styles.quickBtn, { backgroundColor: active ? qColor + "33" : SURFACE, borderColor: active ? qColor : BORDER }]}
                      >
                        <Text style={[styles.quickBtnScore, { color: active ? qColor : "#1a1f1c" }]}>{val}</Text>
                        <Text style={[styles.quickBtnLabel, { color: active ? qColor : MUTED_FG }]}>{scoreLabel}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Score error banner */}
      {scoreError && (
        <View style={styles.scoreErrorBanner}>
          <Ionicons name="alert-circle" size={15} color="#fff" />
          <Text style={styles.scoreErrorText}>{scoreError}</Text>
        </View>
      )}

      {/* Action buttons — fixed at bottom */}
      <View style={[styles.actions, { paddingBottom: insets.bottom + 16 }]}>
        {/* Previous Hole — hidden on hole 1 */}
        {holeIdx > 0 && (
          <TouchableOpacity
            onPress={() => goToHole(holeIdx - 1)}
            disabled={saving}
            style={[styles.prevBtn, { backgroundColor: "#e8f5ee", borderColor: "#9dc4ae" }]}
          >
            <Text style={[styles.prevBtnText, { color: "#1a5c38" }]}>← Previous Hole</Text>
          </TouchableOpacity>
        )}
        {isAnyMatch && matchSt?.decided ? (
          <TouchableOpacity
            onPress={confirmAndFinish}
            disabled={saving}
            style={[styles.nextBtn, { backgroundColor: GREEN, opacity: saving ? 0.7 : 1 }]}
          >
            <Text style={styles.nextBtnText}>End Match 🏆</Text>
          </TouchableOpacity>
        ) : isLastUnsaved ? (
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
            disabled={saving}
            style={[styles.nextBtn, { backgroundColor: GREEN, borderWidth: 0, opacity: saving ? 0.7 : gross != null ? 1 : 0.45 }]}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.nextBtnText}>Next Hole →</Text>
            }
          </TouchableOpacity>
        )}
      </View>

      {/* ── Handicap edit modal ── */}
      <Modal
        visible={showHcpModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowHcpModal(false)}
      >
        <View style={styles.abandonOverlay}>
          <View style={[styles.abandonCard, { paddingHorizontal: 20 }]}>
            <Ionicons name="golf-outline" size={32} color={GOLD} style={{ marginBottom: 10 }} />
            <Text style={styles.abandonTitle}>Edit Handicaps</Text>
            <Text style={[styles.abandonBody, { marginBottom: 18 }]}>
              Correct a wrong handicap — all saved hole scores will recalculate automatically.
            </Text>

            {/* ── My HCP ── */}
            {[
              { label: "My Playing HCP",     key: "my"      as const, show: true },
              { label: `${round.opponent_name ?? "Opponent"} HCP`, key: "opp" as const, show: !!round.opponent_name || isAnyMatch },
              { label: `${round.partner_name ?? "Partner"} HCP`,   key: "partner" as const, show: isBetterball },
              { label: `${round.opponent2_name ?? "Opponent 2"} HCP`, key: "opp2" as const, show: !!round.opponent2_name || isBetterball },
            ].filter(r => r.show).map(row => (
              <View key={row.key} style={styles.hcpRow}>
                <Text style={styles.hcpRowLabel}>{row.label}</Text>
                <View style={styles.hcpStepper}>
                  <TouchableOpacity
                    onPress={() => setHcpDraft(d => ({ ...d, [row.key]: Math.max(-10, d[row.key] - 1) }))}
                    style={styles.hcpStepBtn}
                  >
                    <Text style={styles.hcpStepBtnText}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.hcpStepValue}>
                    {hcpDraft[row.key] < 0 ? `+${-hcpDraft[row.key]}` : hcpDraft[row.key]}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setHcpDraft(d => ({ ...d, [row.key]: Math.min(54, d[row.key] + 1) }))}
                    style={styles.hcpStepBtn}
                  >
                    <Text style={styles.hcpStepBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            <TouchableOpacity
              onPress={saveHcp}
              disabled={savingHcp}
              style={[styles.abandonConfirmBtn, { backgroundColor: GREEN, marginTop: 18 }]}
            >
              {savingHcp
                ? <ActivityIndicator color="#fff" />
                : <Text style={[styles.abandonConfirmText, { color: "#fff" }]}>Save Handicaps</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowHcpModal(false)}
              style={styles.abandonCancelBtn}
            >
              <Text style={styles.abandonCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Abandon confirmation overlay ── */}
      <Modal
        visible={showAbandonConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAbandonConfirm(false)}
      >
        <View style={styles.abandonOverlay}>
          <View style={styles.abandonCard}>
            <Ionicons name="cloud-offline-outline" size={36} color="rgba(0,0,0,0.25)" style={{ marginBottom: 12 }} />
            <Text style={styles.abandonTitle}>Abandon Round?</Text>
            <Text style={styles.abandonBody}>
              The round will be marked as abandoned with no result recorded. This cannot be undone.
            </Text>
            <TouchableOpacity
              onPress={doAbandon}
              disabled={abandoning}
              style={styles.abandonConfirmBtn}
            >
              {abandoning
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.abandonConfirmText}>Abandon Round</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowAbandonConfirm(false)}
              style={styles.abandonCancelBtn}
            >
              <Text style={styles.abandonCancelText}>Keep Playing</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Clear score confirmation overlay ── */}
      <Modal
        visible={showClearConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowClearConfirm(false)}
      >
        <View style={styles.abandonOverlay}>
          <View style={styles.abandonCard}>
            <Ionicons name="trash-outline" size={36} color="rgba(0,0,0,0.25)" style={{ marginBottom: 12 }} />
            <Text style={styles.abandonTitle}>Clear Score?</Text>
            <Text style={styles.abandonBody}>
              Remove the saved score for hole {hole?.number}? You can re-enter it afterwards.
            </Text>
            <TouchableOpacity
              onPress={doClearHole}
              disabled={clearing}
              style={[styles.abandonConfirmBtn, { backgroundColor: "#dc2626" }]}
            >
              {clearing
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.abandonConfirmText}>Clear Score</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowClearConfirm(false)}
              style={styles.abandonCancelBtn}
            >
              <Text style={styles.abandonCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    paddingHorizontal: 16, paddingBottom: 8,
  },
  topBarRow1: {
    flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8,
  },
  topBarRow2: {
    flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap",
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: SURFACE,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  topBarClub: {
    flex: 1, fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#1a5c38",
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
    fontSize: 72, fontFamily: "Inter_700Bold", color: "#111b16",
    lineHeight: 76, letterSpacing: -2,
  },
  hcpChip: {
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20,
    backgroundColor: GREEN + "66", borderWidth: 1, borderColor: GREEN,
    marginTop: -4, marginBottom: 6,
  },
  hcpChipText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#1a5c38" },
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
  stepBtnPlus: { backgroundColor: "#e8f5ee" },
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
    backgroundColor: "#fef2f2",
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
  scoreErrorBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: 16, marginBottom: 6, borderRadius: 10,
    backgroundColor: "#b91c1c", paddingVertical: 9, paddingHorizontal: 12,
  },
  scoreErrorText: { flex: 1, fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" },
  actions: {
    flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 12,
  },
  prevBtn: {
    flex: 1, paddingVertical: 15, borderRadius: 16, borderWidth: 1.5, alignItems: "center",
  },
  prevBtnText: { fontSize: 16, fontFamily: "Inter_700Bold" },
  nextBtn: {
    flex: 1, paddingVertical: 15, borderRadius: 16, alignItems: "center",
  },
  nextBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
  matchBanner: {
    marginHorizontal: 16, marginTop: 8, borderRadius: 12, borderWidth: 1.5,
    paddingVertical: 10, paddingHorizontal: 14,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  matchBannerLabel: { fontSize: 20, fontFamily: "Inter_700Bold" },
  matchBannerSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: MUTED_FG, marginTop: 2 },
  abandonOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.75)",
    alignItems: "center", justifyContent: "center", padding: 32,
  },
  abandonCard: {
    width: "100%", backgroundColor: SURFACE, borderRadius: 20,
    borderWidth: 1, borderColor: BORDER,
    padding: 28, alignItems: "center",
  },
  abandonTitle: {
    fontSize: 20, fontFamily: "Inter_700Bold", color: "#111b16", marginBottom: 10,
  },
  abandonBody: {
    fontSize: 14, fontFamily: "Inter_400Regular", color: MUTED_FG,
    textAlign: "center", lineHeight: 20, marginBottom: 24,
  },
  abandonConfirmBtn: {
    width: "100%", backgroundColor: "#7f1d1d", borderRadius: 14,
    paddingVertical: 14, alignItems: "center", marginBottom: 10,
  },
  abandonConfirmText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fca5a5" },
  abandonCancelBtn: {
    width: "100%", backgroundColor: GREEN, borderRadius: 14,
    paddingVertical: 14, alignItems: "center",
  },
  abandonCancelText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
  hcpRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    width: "100%", marginBottom: 12,
  },
  hcpRowLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#111b16", flex: 1 },
  hcpStepper: {
    flexDirection: "row", alignItems: "center", gap: 0,
    backgroundColor: "#f0f4f1", borderRadius: 12, borderWidth: 1, borderColor: BORDER, overflow: "hidden",
  },
  hcpStepBtn: {
    width: 40, height: 40, alignItems: "center", justifyContent: "center",
    backgroundColor: SURFACE,
  },
  hcpStepBtnText: { fontSize: 22, fontFamily: "Inter_700Bold", color: GOLD, lineHeight: 26 },
  hcpStepValue: {
    width: 44, textAlign: "center",
    fontSize: 17, fontFamily: "Inter_700Bold", color: "#111b16",
  },
});
