/**
 * ScorecardUnified — one standard scorecard layout for every format.
 *
 * Columns: H | Par | SI | [Me: Score|Res] | [B: Score|Res] | [A+B] | [C: Score|Res] | [D: Score|Res] | [C+D]
 * Rows:    header, holes 1–9, OUT, holes 10–18, IN, TOT, HCAP, NETT
 *
 * Player slots
 *   A = always Me
 *   B = partner (betterball) OR casual marker 1  (playerHoles[0_N])
 *   C = opp 1 (betterball/matchplay) OR casual marker 2  (playerHoles[1_N] for BB, [0_N] for singles, [1_N] for casual mkr2)
 *   D = opp 2 (betterball only)  (playerHoles[2_N])
 *   A+B / C+D = team columns, betterball formats only
 */
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

const GOLD = "#c8a84b";
const HW   = StyleSheet.hairlineWidth;

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
function fmtHcp(ph: number): string {
  return ph < 0 ? `+${-ph}` : String(ph);
}

type ScorecardHole = { number: number; par: number; stroke_index: number };
type SavedHole = { gross_score: number|null; net_score: number|null; stableford_points: number|null; is_nr: number };
type Round = {
  format: string;
  playing_handicap: number;
  partner_playing_hcp?: number;
  opponent_playing_hcp?: number;
  opponent2_playing_hcp?: number;
  partner_name?: string|null;
  opponent_name?: string|null;
  opponent2_name?: string|null;
  scorecard: ScorecardHole[];
  holes: Record<number, SavedHole>;
  playerHoles?: Record<string, { gross_score: number|null; is_nr: number }>;
};

interface Props { round: Round; colors: any; }

export default function ScorecardUnified({ round, colors }: Props) {
  const bdr = colors.border;
  const FG  = colors.foreground;
  const MFG = colors.mutedForeground;
  const fmt = round.format;
  const ph  = round.playerHoles ?? {};
  const sc  = round.scorecard ?? [];
  const holes = round.holes ?? {};

  /* ── Format flags ─────────────────────────────────────────── */
  const isBBFmt = ["fourball_stableford","fourball_gross_betterball",
                   "betterball_match_play","betterball_gross_match_play",
                   "fourball_stableford_match_play"].includes(fmt);
  const isMP    = ["singles_match_play","singles_stableford_match_play",
                   "singles_gross_match_play"].includes(fmt);
  const isBBMP  = ["betterball_match_play","betterball_gross_match_play",
                   "fourball_stableford_match_play"].includes(fmt);
  const isBBStb = fmt === "fourball_stableford" || fmt === "fourball_stableford_match_play";
  const isBBGrs = fmt === "fourball_gross_betterball" || fmt === "betterball_gross_match_play";
  const isGrOnly  = fmt === "gross_stroke_play";
  const isNetOny  = fmt === "net_stroke_play" || fmt === "chairman";
  const isPar     = ["par_bogey","individual_par","individual_bogey"].includes(fmt);
  const isBonusB  = fmt === "individual_bonus_bogey";
  const isMod     = fmt === "modified_stableford";
  const isMaxSc = fmt === "maximum_score";
  const hasPH   = !!round.playerHoles;

  /* ── Handicaps ────────────────────────────────────────────── */
  const myHcp  = round.playing_handicap;
  const prtHcp = round.partner_playing_hcp  ?? myHcp;
  const o1Hcp  = round.opponent_playing_hcp ?? 0;
  const o2Hcp  = round.opponent2_playing_hcp ?? o1Hcp;
  const fn = (n?: string|null, fb = "?") => (n ?? "").split(" ")[0].slice(0, 7) || fb;

  /* ── Player presence ──────────────────────────────────────── */
  const isMkr1 = !isBBFmt && !isMP && !!round.opponent_name && hasPH;
  const isMkr2 = isMkr1 && !!round.opponent2_name;

  const showB  = (isBBFmt && !!round.partner_name && hasPH) || isMkr1;
  const bLabel = isBBFmt ? fn(round.partner_name, "Ptnr") : fn(round.opponent_name, "Mkr");
  const bHcp   = isBBFmt ? prtHcp : o1Hcp;

  const showC  = (isBBFmt && !!round.opponent_name && hasPH)
              || (isMP && !!round.opponent_name && hasPH)
              || isMkr2;
  const cLabel = (isBBFmt || isMP) ? fn(round.opponent_name, "Opp") : fn(round.opponent2_name, "Mkr2");
  const cHcp   = (isBBFmt || isMP) ? o1Hcp : o2Hcp;
  // playerHoles index for C: BB opp1=1, singles opp=0, casual mkr2=1
  const cPhIdx = (isBBFmt || isMkr2) ? 1 : 0;

  const showD  = isBBFmt && !!round.opponent2_name && hasPH;
  const dLabel = fn(round.opponent2_name, "Opp2");
  const dHcp   = o2Hcp;

  const showTeam = isBBFmt;
  const showRes  = true;

  /* ── Individual result per player per hole ────────────────── */
  function calcR(g: number, par: number, ha: number): number {
    if (isNetOny)  return g - ha;
    if (isMaxSc)   return Math.min(g, par + 2 + ha) - ha;
    if (isPar)     { const n = g - ha; return n < par ? 1 : n === par ? 0 : -1; }
    if (isMod)     { const d = g - ha - par; return d <= -2 ? 3 : d === -1 ? 1 : d === 0 ? 0 : d === 1 ? -1 : -3; }
    if (isBonusB)  {
      const d = g - ha - par;
      if (d <= -2) return 2;   // eagle or better = +2
      if (d === -1) return 1;  // birdie = +1
      if (d === 0)  return 0;  // par = 0
      if (d === 1)  return -1; // bogey = -1
      return -2;                // double bogey or worse = -2
    }
    return Math.max(0, par + 2 - (g - ha));  // stableford default
  }

  /* ── Running totals ───────────────────────────────────────── */
  let [aF9G, aB9G, aF9R, aB9R] = [0, 0, 0, 0];
  let [bF9G, bB9G, bF9R, bB9R] = [0, 0, 0, 0];
  let [cF9G, cB9G, cF9R, cB9R] = [0, 0, 0, 0];
  let [dF9G, dB9G, dF9R, dB9R] = [0, 0, 0, 0];
  let [abF9, abB9, cdF9, cdB9] = [0, 0, 0, 0];
  let [f9Par, b9Par] = [0, 0];

  const getPH = (idx: number, hn: number) => {
    const s = ph[`${idx}_${hn}`];
    return { g: s?.is_nr ? null : (s?.gross_score ?? null), nr: !!s?.is_nr };
  };

  /* ── Hole data ────────────────────────────────────────────── */
  const holeData = sc.map(h => {
    const hn = h.number; const fr = hn <= 9;
    if (fr) f9Par += h.par; else b9Par += h.par;

    const aSv = holes[hn];
    const aNr = !!aSv?.is_nr;
    const aG  = aNr ? null : aSv?.gross_score ?? null;
    const aHa = getHA(h.stroke_index, myHcp);
    const aR  = (!isGrOnly && !isMP && aG != null) ? calcR(aG, h.par, aHa) : null;
    if (aG != null) { if (fr) aF9G += aG; else aB9G += aG; }
    if (aR != null) { if (fr) aF9R += aR; else aB9R += aR; }

    const bD  = showB ? getPH(0, hn) : { g: null as number|null, nr: false };
    const bHa = getHA(h.stroke_index, bHcp);
    const bG  = bD.g; const bNr = bD.nr;
    const bR  = (showB && !isGrOnly && !isMP && bG != null) ? calcR(bG, h.par, bHa) : null;
    if (bG != null) { if (fr) bF9G += bG; else bB9G += bG; }
    if (bR != null) { if (fr) bF9R += bR; else bB9R += bR; }

    const cD  = showC ? getPH(cPhIdx, hn) : { g: null as number|null, nr: false };
    const cHa = getHA(h.stroke_index, cHcp);
    const cG  = cD.g; const cNr = cD.nr;
    const cR  = (showC && !isGrOnly && !isMP && cG != null) ? calcR(cG, h.par, cHa) : null;
    if (cG != null) { if (fr) cF9G += cG; else cB9G += cG; }
    if (cR != null) { if (fr) cF9R += cR; else cB9R += cR; }

    const dD  = showD ? getPH(2, hn) : { g: null as number|null, nr: false };
    const dHa = getHA(h.stroke_index, dHcp);
    const dG  = dD.g; const dNr = dD.nr;
    const dR  = (showD && !isGrOnly && dG != null) ? calcR(dG, h.par, dHa) : null;
    if (dG != null) { if (fr) dF9G += dG; else dB9G += dG; }
    if (dR != null) { if (fr) dF9R += dR; else dB9R += dR; }

    /* Singles match play hole result (+1 = A wins, 0 = halved, -1 = A loses) */
    let mpRes: 1|0|-1|null = null;
    if (isMP && aG != null && cG != null && !aNr && !cNr) {
      const cHa2 = getHA(h.stroke_index, cHcp);
      const av = fmt === "singles_gross_match_play" ? aG
        : fmt === "singles_stableford_match_play" ? -(Math.max(0, h.par + 2 - (aG - aHa)))
        : aG - aHa;
      const cv = fmt === "singles_gross_match_play" ? cG
        : fmt === "singles_stableford_match_play" ? -(Math.max(0, h.par + 2 - (cG - cHa2)))
        : cG - cHa2;
      mpRes = av < cv ? 1 : av > cv ? -1 : 0;
      if (fr) aF9R += mpRes; else aB9R += mpRes;
    }

    /* Betterball team result per hole */
    let abWHL: "W"|"H"|"L"|null = null;
    let abPts: number|null = null, cdPts: number|null = null;
    if (isBBFmt) {
      const bestOf = (x: number|null, y: number|null, hi: boolean) =>
        x == null ? y : y == null ? x : hi ? Math.max(x, y) : Math.min(x, y);
      const hi = isBBStb;
      const aHa2 = getHA(h.stroke_index, myHcp);
      const bHa2 = getHA(h.stroke_index, bHcp);
      const cHa2 = getHA(h.stroke_index, cHcp);
      const dHa2 = getHA(h.stroke_index, dHcp);
      const aM = isBBGrs ? aG : isBBStb ? aR : (aG != null ? aG - aHa2 : null);
      const bM = bG != null ? (isBBGrs ? bG : isBBStb ? bR : bG - bHa2) : null;
      const cM = cG != null ? (isBBGrs ? cG : isBBStb ? cR : cG - cHa2) : null;
      const dM = dG != null ? (isBBGrs ? dG : isBBStb ? dR : dG - dHa2) : null;
      const teamAB = bestOf(aM, bM, hi);
      const teamCD = bestOf(cM, dM, hi);
      abPts = isBBStb ? teamAB : null;
      cdPts = isBBStb ? teamCD : null;
      if (teamAB != null && teamCD != null) {
        abWHL = (hi ? teamAB > teamCD : teamAB < teamCD) ? "W"
              : (hi ? teamCD > teamAB : teamCD < teamAB) ? "L" : "H";
      }
      if (abPts != null) { if (fr) abF9 += abPts; else abB9 += abPts; }
      if (cdPts != null) { if (fr) cdF9 += cdPts; else cdB9 += cdPts; }
    }

    return { h, aG, aR, aNr, bG, bR, bNr, cG, cR, cNr, dG, dR, dNr, mpRes, abWHL, abPts, cdPts };
  });

  const totPar = f9Par + b9Par;
  const [aTotG, bTotG, cTotG, dTotG] = [aF9G+aB9G, bF9G+bB9G, cF9G+cB9G, dF9G+dB9G];
  const [aTotR, bTotR, cTotR, dTotR] = [aF9R+aB9R, bF9R+bB9R, cF9R+cB9R, dF9R+dB9R];
  const [abTot, cdTot] = [abF9+abB9, cdF9+cdB9];

  /* Betterball cumulative match status for OUT / IN / TOT rows */
  let [f9bbW, f9bbL, b9bbW, b9bbL] = [0, 0, 0, 0];
  holeData.forEach(({ h, abWHL }) => {
    if (!abWHL) return;
    const fr = h.number <= 9;
    if (abWHL === "W") { fr ? f9bbW++ : b9bbW++; }
    else if (abWHL === "L") { fr ? f9bbL++ : b9bbL++; }
  });
  const net2whl = (w: number, l: number): "W"|"H"|"L"|null =>
    w === 0 && l === 0 ? null : w > l ? "W" : w < l ? "L" : "H";
  const f9BBWHL  = net2whl(f9bbW, f9bbL);
  const b9BBWHL  = net2whl(b9bbW, b9bbL);
  const totBBWHL = net2whl(f9bbW + b9bbW, f9bbL + b9bbL);

  /* ── Display helpers ──────────────────────────────────────── */
  const resLbl = isGrOnly ? "—" : isNetOny || isMaxSc ? "Net" : isPar ? "+/−" : isMP ? "Res" : "Pts";
  const whlC = (w: "W"|"H"|"L"|null) => !w ? MFG : w === "W" ? "#22c55e" : w === "H" ? GOLD : "#f87171";

  const rTxt = (r: number|null, nr: boolean): string => {
    if (nr || r == null) return "—";
    if (isMP)  return r === 1 ? "W" : r === 0 ? "H" : "L";
    if (isPar) return r > 0 ? `+${r}` : r === 0 ? "0" : `${r}`;
    if (isMod || isBonusB) return r > 0 ? `+${r}` : `${r}`;
    return String(r);
  };
  const rClr = (r: number|null, nr: boolean) => {
    if (nr || r == null) return MFG;
    if (isPar || isMP) return r > 0 ? "#22c55e" : r < 0 ? "#f87171" : GOLD;
    if (isMod) return r > 0 ? "#22c55e" : r < 0 ? "#f87171" : FG;
    // Bonus bogey: +2/+1 = green, 0 = gold, −1/−2 = red
    if (isBonusB) return r > 0 ? "#22c55e" : r === 0 ? GOLD : "#f87171";
    // Standard stableford
    return r >= 3 ? "#22c55e" : r >= 2 ? GOLD : r >= 1 ? "#fb923c" : "#f87171";
  };

  /* ── Layout constants ─────────────────────────────────────── */
  const W_H = 26, W_P = 24, W_SI = 22;
  const W_SC = 34, W_RS = showRes ? 30 : 0, W_TM = showTeam ? 26 : 0;
  const pairW = W_SC + W_RS;
  const hdrBg = colors.primary;

  /* ── Sub-components ───────────────────────────────────────── */
  const PairHdr = (name: string) => (
    <View style={{ width: pairW, borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.25)" }}>
      <View style={{ alignItems: "center", paddingVertical: 2, paddingHorizontal: 2,
        borderBottomWidth: HW, borderBottomColor: "rgba(255,255,255,0.2)" }}>
        <Text numberOfLines={1} style={{ fontSize: 8, fontFamily: "Inter_700Bold", color: "#fff" }}>{name}</Text>
      </View>
      <View style={{ flexDirection: "row" }}>
        <View style={{ width: W_SC, alignItems: "center", paddingVertical: 2,
          borderRightWidth: showRes ? HW : 0, borderRightColor: "rgba(255,255,255,0.2)" }}>
          <Text style={{ fontSize: 7, color: "rgba(255,255,255,0.55)" }}>Score</Text>
        </View>
        {showRes && (
          <View style={{ width: W_RS, alignItems: "center", paddingVertical: 2 }}>
            <Text style={{ fontSize: 7, color: "rgba(255,255,255,0.55)" }}>{resLbl}</Text>
          </View>
        )}
      </View>
    </View>
  );

  const PairCell = (
    gross: number|null, res: number|null,
    mpR: 1|0|-1|null, forA: boolean,
    nr: boolean, bold: boolean,
  ) => {
    const effR = isMP ? (mpR != null ? (forA ? mpR : -mpR as 1|0|-1) : null) : res;
    const rt = rTxt(effR, nr);
    const rc = rClr(effR, nr);
    return (
      <View style={{ width: pairW, flexDirection: "row", borderRightWidth: HW, borderRightColor: bdr }}>
        <View style={{ width: W_SC, alignItems: "center", justifyContent: "center", paddingVertical: 7,
          borderRightWidth: showRes ? HW : 0, borderRightColor: bdr }}>
          <Text style={{ fontSize: 11, fontFamily: bold ? "Inter_700Bold" : "Inter_400Regular",
            color: nr || gross == null ? MFG : FG }}>
            {nr ? "NR" : gross != null ? String(gross) : "—"}
          </Text>
        </View>
        {showRes && (
          <View style={{ width: W_RS, alignItems: "center", justifyContent: "center", paddingVertical: 7 }}>
            <Text style={{ fontSize: 11, fontFamily: bold ? "Inter_700Bold" : "Inter_400Regular",
              color: rc }}>{rt}</Text>
          </View>
        )}
      </View>
    );
  };

  const TeamHoleCell = (pts: number|null, whl: "W"|"H"|"L"|null, myTeam: boolean, thick: boolean) => (
    <View style={{ width: W_TM, alignItems: "center", justifyContent: "center",
      paddingVertical: 7,
      borderRightWidth: thick ? 1.5 : HW, borderRightColor: bdr }}>
      <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold",
        color: isBBMP ? whlC(whl) : pts != null ? (myTeam ? "#a3e4bc" : "#f87171") : MFG }}>
        {isBBMP ? (whl ?? "—") : pts != null ? String(pts) : "—"}
      </Text>
    </View>
  );

  /* Best-ball bold indicator */
  const bbBold = (
    aG: number|null, bG: number|null, cG: number|null, dG: number|null,
    aR: number|null, bR: number|null, cR: number|null, dR: number|null,
    h: ScorecardHole,
  ) => {
    if (!isBBFmt) return { aBold: false, bBold: false, cBold: false, dBold: false };
    const ha = (hcp: number) => getHA(h.stroke_index, hcp);
    const mAt = (g: number|null, r: number|null, hcp: number) =>
      isBBGrs ? g : isBBStb ? r : (g != null ? g - ha(hcp) : null);
    const aM = mAt(aG, aR, myHcp), bM = mAt(bG, bR, bHcp);
    const cM = mAt(cG, cR, cHcp), dM = mAt(dG, dR, dHcp);
    const hi = isBBStb;
    const best = (x: number|null, y: number|null) =>
      x == null ? y : y == null ? x : hi ? Math.max(x, y) : Math.min(x, y);
    const tAB = best(aM, bM), tCD = best(cM, dM);
    const aBold = tAB != null && aM === tAB && aG != null;
    const bBold = !aBold && tAB != null && bM === tAB && bG != null;
    const cBold = tCD != null && cM === tCD && cG != null;
    const dBold = !cBold && tCD != null && dM === tCD && dG != null;
    return { aBold, bBold, cBold, dBold };
  };

  /* Summary row (OUT / IN / TOT / HCAP / NETT) */
  type SRMode = "score"|"hcap"|"nett";
  const SumRow = (
    label: string, par: number|string, isLast: boolean,
    ag: number, ar: number, bg: number, br: number,
    cg: number, cr: number, dg: number, dr: number,
    ab: number, cd: number, abwhl: "W"|"H"|"L"|null,
    mode: SRMode = "score",
  ) => {
    const bgc  = isLast ? hdrBg : hdrBg + "e0";
    const bTop = isLast ? 1.5 : HW;
    const bTopC = isLast ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.2)";

    const scr = (g: number, hcp: number) =>
      mode === "hcap" ? hcp : mode === "nett" ? g - hcp : g;

    const cdwhl = abwhl === "W" ? "L" : abwhl === "L" ? "W" : abwhl;

    const PairS = (g: number, r: number, hcp: number) => {
      const v = scr(g, hcp);
      return (
        <View style={{ width: pairW, flexDirection: "row",
          borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.25)" }}>
          <View style={{ width: W_SC, alignItems: "center", justifyContent: "center",
            paddingVertical: 6,
            borderRightWidth: showRes ? HW : 0, borderRightColor: "rgba(255,255,255,0.2)" }}>
            <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: "#fff" }}>
              {mode === "hcap" ? fmtHcp(v) : (v !== 0 ? String(v) : "—")}
            </Text>
          </View>
          {showRes && (
            <View style={{ width: W_RS, alignItems: "center", justifyContent: "center", paddingVertical: 6 }}>
              {mode === "score" && r !== 0
                ? <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: "#fff" }}>{rTxt(r || null, false)}</Text>
                : <Text style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>—</Text>
              }
            </View>
          )}
        </View>
      );
    };

    const TeamS = (v: number, whl: "W"|"H"|"L"|null, myT: boolean, thick: boolean) => (
      <View style={{ width: W_TM, alignItems: "center", justifyContent: "center",
        paddingVertical: 6,
        borderRightWidth: thick ? 1.5 : HW, borderRightColor: "rgba(255,255,255,0.35)" }}>
        <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold",
          color: mode === "score"
            ? (isBBMP ? whlC(whl) : (myT ? "#a3e4bc" : "#f87171"))
            : "rgba(255,255,255,0.3)" }}>
          {mode === "score"
            ? (isBBMP ? (whl ?? "—") : (v > 0 ? String(v) : "—"))
            : "—"}
        </Text>
      </View>
    );

    return (
      <View key={label} style={{ flexDirection: "row", backgroundColor: bgc,
        borderTopWidth: bTop, borderTopColor: bTopC }}>
        <View style={{ width: W_H, alignItems: "center", justifyContent: "center",
          borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.2)", paddingVertical: 6 }}>
          <Text style={{ fontSize: 8, fontFamily: "Inter_700Bold",
            color: isLast ? GOLD : "rgba(255,255,255,0.8)" }}>{label}</Text>
        </View>
        <View style={{ width: W_P, alignItems: "center", justifyContent: "center",
          borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.2)" }}>
          <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: "#fff" }}>{par}</Text>
        </View>
        <View style={{ width: W_SI, borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.2)" }} />
        {PairS(ag, ar, myHcp)}
        {showB && PairS(bg, br, bHcp)}
        {showTeam && TeamS(ab, abwhl, true, true)}
        {showC && PairS(cg, cr, cHcp)}
        {showD && PairS(dg, dr, dHcp)}
        {showTeam && TeamS(cd, cdwhl, false, false)}
      </View>
    );
  };

  /* ── Render ───────────────────────────────────────────────── */
  return (
    <View style={{ borderRadius: 12, overflow: "hidden", marginBottom: 24,
      borderWidth: 1, borderColor: colors.border }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} bounces={false}>
        <View>
          {/* Header row */}
          <View style={{ flexDirection: "row", backgroundColor: hdrBg }}>
            {[{w: W_H, lbl: "H"}, {w: W_P, lbl: "Par"}, {w: W_SI, lbl: "SI"}].map(({w, lbl}) => (
              <View key={lbl} style={{ width: w, alignItems: "center", justifyContent: "center",
                paddingVertical: 4, borderRightWidth: HW, borderRightColor: "rgba(255,255,255,0.25)" }}>
                <Text style={{ fontSize: 8, fontFamily: "Inter_700Bold",
                  color: "rgba(255,255,255,0.7)" }}>{lbl}</Text>
              </View>
            ))}
            {PairHdr("Me")}
            {showB && PairHdr(bLabel)}
            {showTeam && (
              <View style={{ width: W_TM, alignItems: "center", justifyContent: "center",
                borderRightWidth: 1.5, borderRightColor: "rgba(255,255,255,0.4)",
                paddingVertical: 4 }}>
                <Text style={{ fontSize: 7, fontFamily: "Inter_700Bold",
                  color: "rgba(255,255,255,0.7)" }}>A+B</Text>
              </View>
            )}
            {showC && PairHdr(cLabel)}
            {showD && PairHdr(dLabel)}
            {showTeam && (
              <View style={{ width: W_TM, alignItems: "center", justifyContent: "center",
                paddingVertical: 4 }}>
                <Text style={{ fontSize: 7, fontFamily: "Inter_700Bold",
                  color: "rgba(255,255,255,0.7)" }}>C+D</Text>
              </View>
            )}
          </View>

          {/* Hole rows */}
          {holeData.map(({ h, aG, aR, aNr, bG, bR, bNr, cG, cR, cNr, dG, dR, dNr,
                           mpRes, abWHL, abPts, cdPts }, idx) => {
            const rowBg = idx % 2 === 0 ? colors.card
              : (colors.card === "#fff" || colors.card === "#ffffff" ? "#f7faf8" : colors.background);
            const { aBold, bBold, cBold, dBold } = bbBold(aG, bG, cG, dG, aR, bR, cR, dR, h);
            const cdwhl2 = abWHL === "W" ? "L" : abWHL === "L" ? "W" : abWHL;
            return (
              <React.Fragment key={h.number}>
                <View style={{ flexDirection: "row", backgroundColor: rowBg,
                  borderBottomWidth: HW, borderBottomColor: bdr }}>
                  <View style={{ width: W_H, alignItems: "center", justifyContent: "center",
                    paddingVertical: 9, borderRightWidth: HW, borderRightColor: bdr }}>
                    <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: FG }}>{h.number}</Text>
                  </View>
                  <View style={{ width: W_P, alignItems: "center", justifyContent: "center",
                    borderRightWidth: HW, borderRightColor: bdr }}>
                    <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: MFG }}>{h.par}</Text>
                  </View>
                  <View style={{ width: W_SI, alignItems: "center", justifyContent: "center",
                    borderRightWidth: HW, borderRightColor: bdr, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: MFG }}>{h.stroke_index}</Text>
                    {getHA(h.stroke_index, myHcp) < 0 && (
                      <Text style={{ fontSize: 7, fontFamily: "Inter_700Bold", color: "#f87171", lineHeight: 9 }}>+1</Text>
                    )}
                  </View>
                  {PairCell(aG, aR, mpRes, true,  aNr, aBold)}
                  {showB && PairCell(bG, bR, null,  true,  bNr, bBold)}
                  {showTeam && TeamHoleCell(abPts, abWHL, true,  true)}
                  {showC && PairCell(cG, cR, mpRes, false, cNr, cBold)}
                  {showD && PairCell(dG, dR, null,  true,  dNr, dBold)}
                  {showTeam && (
                    <View style={{ width: W_TM, alignItems: "center", justifyContent: "center",
                      paddingVertical: 7 }}>
                      <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold",
                        color: isBBMP ? whlC(cdwhl2) : (cdPts != null ? "#f87171" : MFG) }}>
                        {isBBMP
                          ? (abWHL != null ? (abWHL === "W" ? "L" : abWHL === "L" ? "W" : "H") : "—")
                          : cdPts != null ? String(cdPts) : "—"}
                      </Text>
                    </View>
                  )}
                </View>
                {h.number === 9 && SumRow(
                  "OUT", f9Par, false,
                  aF9G, aF9R, bF9G, bF9R, cF9G, cF9R, dF9G, dF9R,
                  abF9, cdF9, f9BBWHL,
                )}
              </React.Fragment>
            );
          })}

          {/* IN */}
          {SumRow("IN",   b9Par,  false,
            aB9G, aB9R, bB9G, bB9R, cB9G, cB9R, dB9G, dB9R, abB9, cdB9, b9BBWHL)}
          {/* TOT */}
          {SumRow("TOT",  totPar, true,
            aTotG, aTotR, bTotG, bTotR, cTotG, cTotR, dTotG, dTotR, abTot, cdTot, totBBWHL)}
          {/* HCAP */}
          {SumRow("HCAP", "", false,
            aTotG, aTotR, bTotG, bTotR, cTotG, cTotR, dTotG, dTotR, 0, 0, null, "hcap")}
          {/* NETT */}
          {SumRow("NETT", "", false,
            aTotG, aTotR, bTotG, bTotR, cTotG, cTotR, dTotG, dTotR, 0, 0, null, "nett")}
        </View>
      </ScrollView>
    </View>
  );
}
