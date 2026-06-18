import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
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

const DARK_BG  = "#0d1f14";
const SURFACE  = "#162a1e";
const BORDER   = "#1f3826";
const GREEN    = "#1a5c38";
const GOLD     = "#c8a84b";
const MUTED_FG = "#4a6550";

const PLAYER_COLORS = ["#3b82f6", "#a855f7"];

type ScorecardHole = { number: number; par: number; stroke_index: number; distance_m?: number };
type SavedHole = { hole_number: number; gross_score: number | null; stableford_points: number | null; is_nr: number };
type Round = {
  id: number; club_name: string; format: string;
  playing_handicap: number; status: string;
  scorecard: ScorecardHole[];
  holes: Record<number, SavedHole>;
  playerHoles: Record<string, any>;
};

function getHA(si: number, ph: number) { if (ph<=0) return 0; if (ph<=18) return si<=ph?1:0; return 1+(si<=ph-18?1:0); }
function calcPts(gross: number, par: number, ha: number) { return Math.max(0,par+2-(gross-ha)); }
function scoreName(g: number, p: number) { const d=g-p; if(d<=-2) return "Eagle"; if(d===-1) return "Birdie"; if(d===0) return "Par"; if(d===1) return "Bogey"; if(d===2) return "Double"; return `+${d}`; }
function scoreColor(g: number, p: number) { const d=g-p; if(d<=-2) return GOLD; if(d===-1) return "#22c55e"; if(d===0) return "#a3e4bc"; if(d===1) return "#fb923c"; return "#f87171"; }

export default function BetterballHoleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const token = user?.token;
  const insets = useSafeAreaInsets();

  const [round, setRound] = useState<Round | null>(null);
  const [loading, setLoading] = useState(true);
  const [holeIdx, setHoleIdx] = useState(0);
  const [g0, setG0] = useState<number | null>(null);
  const [g1, setG1] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const stripRef = useRef<ScrollView>(null);

  const loadRound = useCallback(async () => {
    if (!token || !id) return;
    try {
      const data = await apiFetch(`/scoring/rounds/${id}`, token);
      setRound(data);
      const sc: ScorecardHole[] = data.scorecard ?? [];
      const holes: Record<number, SavedHole> = data.holes ?? {};
      const first = sc.findIndex((h: ScorecardHole) => !holes[h.number]);
      const startIdx = first >= 0 ? first : sc.length - 1;
      setHoleIdx(startIdx);
      setG0(data.playerHoles?.[`0_${sc[startIdx]?.number}`]?.gross_score ?? null);
      setG1(data.playerHoles?.[`1_${sc[startIdx]?.number}`]?.gross_score ?? null);
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to load round");
    } finally {
      setLoading(false);
    }
  }, [token, id]);

  useEffect(() => { loadRound(); }, [loadRound]);

  if (loading || !round) {
    const { width: sw, height: sh } = Dimensions.get("window");
    return <View style={{ width: sw, height: sh, backgroundColor: DARK_BG, alignItems: "center", justifyContent: "center" }}><GolfBallLoader size={60} /></View>;
  }

  const sc = round.scorecard;
  const hole = sc[holeIdx];
  if (!hole) return null;

  const ph = round.playing_handicap;
  const ha0 = getHA(hole.stroke_index, ph);
  const ha1 = getHA(hole.stroke_index, Math.round(ph * 0.9));
  const pts0 = g0 != null ? calcPts(g0, hole.par, ha0) : null;
  const pts1 = g1 != null ? calcPts(g1, hole.par, ha1) : null;
  const bbPts = pts0 != null && pts1 != null ? Math.max(pts0, pts1) : (pts0 ?? pts1 ?? null);
  const bbWinner = pts0 != null && pts1 != null ? (pts0 >= pts1 ? 0 : 1) : pts0 != null ? 0 : 1;

  const runningPts = sc.slice(0, holeIdx).reduce((sum, h) => {
    const saved = round.holes[h.number];
    return sum + (saved?.stableford_points ?? 0);
  }, 0);

  const goToHole = (idx: number) => {
    setHoleIdx(idx);
    setG0(round.playerHoles?.[`0_${sc[idx].number}`]?.gross_score ?? null);
    setG1(round.playerHoles?.[`1_${sc[idx].number}`]?.gross_score ?? null);
    stripRef.current?.scrollTo({ x: Math.max(0, (idx - 3) * 42), animated: true });
  };

  const saveAndNext = async (isNr = false) => {
    setSaving(true);
    try {
      await apiFetch(`/scoring/rounds/${id}/holes/${hole.number}`, token, {
        method: "PUT",
        body: JSON.stringify({
          par: hole.par, strokeIndex: hole.stroke_index,
          grossScore: isNr ? null : (bbPts != null ? (pts0 != null && (pts1 == null || pts0 >= (pts1??0)) ? g0 : g1) : null),
          isNr,
          players: [
            { grossScore: isNr ? null : g0, isNr, name: "Player 1" },
            { grossScore: isNr ? null : g1, isNr, name: "Player 2" },
          ],
        }),
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const updatedHoles = { ...round.holes };
      updatedHoles[hole.number] = {
        hole_number: hole.number,
        gross_score: isNr ? null : (pts0 != null && (pts1 == null || pts0 >= (pts1??0)) ? g0 : g1),
        stableford_points: isNr ? 0 : (bbPts ?? 0),
        is_nr: isNr ? 1 : 0,
      };
      setRound({ ...round, holes: updatedHoles });

      if (holeIdx < sc.length - 1) {
        goToHole(holeIdx + 1);
      } else {
        Alert.alert("Round Complete?", "Finish the round?", [
          { text: "Not Yet", style: "cancel" },
          { text: "Finish", onPress: finishRound },
        ]);
      }
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to save");
    } finally { setSaving(false); }
  };

  const finishRound = async () => {
    try {
      await apiFetch(`/scoring/rounds/${id}/complete`, token, { method: "POST" });
      router.replace(`/scoring/${id}/complete`);
    } catch (err: any) { Alert.alert("Error", err.message || "Failed to complete"); }
  };

  const PlayerCard = ({ g, setG, ha, pts, isWinner, idx }: { g: number|null; setG: (v: number|null)=>void; ha: number; pts: number|null; isWinner: boolean; idx: number }) => {
    const color = PLAYER_COLORS[idx];
    const names = ["Player 1", "Player 2"];
    return (
      <View style={[styles.playerCard, { borderColor: isWinner && pts!=null ? color+"60" : BORDER, backgroundColor: isWinner && pts!=null ? color+"12" : SURFACE }]}>
        <View style={styles.playerHeader}>
          <View style={styles.playerRow}>
            <View style={[styles.playerAvatar, { backgroundColor: color }]}>
              <Text style={styles.playerInitials}>{names[idx][0]+names[idx].split(" ")[1][0]}</Text>
            </View>
            <View>
              <Text style={styles.playerName}>{names[idx]}</Text>
              <Text style={styles.playerMeta}>PH {idx===0?ph:Math.round(ph*0.9)} · {ha>0?`+${ha} stroke`:"no stroke"}</Text>
            </View>
          </View>
          {isWinner && pts!=null && (
            <View style={[styles.bestBallBadge, { backgroundColor: GOLD+"22", borderColor: GOLD+"50" }]}>
              <Text style={[styles.bestBallText, { color: GOLD }]}>Best Ball ⭐</Text>
            </View>
          )}
        </View>
        <View style={styles.playerStepper}>
          <TouchableOpacity onPress={() => { Haptics.selectionAsync(); setG(g==null?hole.par+1:Math.max(1,g-1)); }} style={[styles.miniStepBtn, { borderColor: g!=null&&g>1?"#f87171":BORDER }]}>
            <Text style={[styles.miniStepText, { color: g!=null&&g>1?"#f87171":MUTED_FG }]}>−</Text>
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: "center" }}>
            {g != null ? (
              <>
                <Text style={[styles.miniScore, { color: scoreColor(g, hole.par) }]}>{g}</Text>
                <Text style={styles.miniScoreLabel}>{scoreName(g,hole.par)} · net {g-ha} · <Text style={{ color: pts!=null?(pts>=3?"#22c55e":pts>=2?GOLD:pts>=1?"#fb923c":"#f87171"):"#fff", fontFamily: "Inter_700Bold" }}>{pts}pts</Text></Text>
              </>
            ) : <Text style={[styles.miniScore, { color: SURFACE }]}>—</Text>}
          </View>
          <TouchableOpacity onPress={() => { Haptics.selectionAsync(); setG(g==null?hole.par+1:Math.min(15,g+1)); }} style={[styles.miniStepBtn, { borderColor: GREEN, backgroundColor: "#1a4028" }]}>
            <Text style={[styles.miniStepText, { color: "#22c55e" }]}>+</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.quickRow}>
          {[-1,0,1,2,3].map(off => {
            const val = hole.par+off;
            const active = g===val;
            const qc = val<hole.par?"#22c55e":val===hole.par?GOLD:val===hole.par+1?"#fb923c":"#f87171";
            return (
              <TouchableOpacity key={off} onPress={() => { Haptics.selectionAsync(); setG(val); }} style={[styles.quickBtn, { backgroundColor: active?qc+"33":DARK_BG, borderColor: active?qc:BORDER }]}>
                <Text style={[styles.quickScore, { color: active?qc:"#fff" }]}>{val}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: DARK_BG }}>
      <View style={{ height: insets.top }} />
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.topBarClub} numberOfLines={1}>{round.club_name} · Betterball</Text>
        <TouchableOpacity onPress={() => router.push(`/scoring/${id}/complete`)} style={styles.backBtn}>
          <Ionicons name="list" size={18} color={GOLD} />
        </TouchableOpacity>
      </View>

      {/* Hole strip */}
      <ScrollView ref={stripRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.holeStrip}>
        {sc.map((h, i) => {
          const saved = round.holes[h.number];
          const active = i===holeIdx;
          const p = saved?.stableford_points;
          const dotBg = active?"#fff":saved?(p!=null&&p>=3?"#22c55e":p!=null&&p>=2?GOLD:p!=null&&p>=1?"#fb923c":"#f87171"):SURFACE;
          return (
            <TouchableOpacity key={h.number} onPress={() => goToHole(i)} style={[styles.holeChip, { backgroundColor: dotBg, borderColor: active?"#fff":BORDER, height: active?36:28 }]}>
              <Text style={{ fontSize: active?12:10, fontFamily: "Inter_700Bold", color: active?DARK_BG:saved?"#fff":MUTED_FG }}>{h.number}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <Text style={styles.stripMeta}>{sc.filter(h=>round.holes[h.number]!=null).length}/{sc.length} scored · {runningPts+(bbPts??0)} pts total</Text>

      {/* Hole identity */}
      <View style={styles.holeHeader}>
        <Text style={styles.nowLabel}>NOW SCORING</Text>
        <Text style={styles.holeName}>HOLE {hole.number}</Text>
        <View style={styles.statsRow}>
          {[{l:"PAR",v:String(hole.par),a:true},{l:"SI",v:String(hole.stroke_index),a:false},{l:"DIST",v:hole.distance_m?`${hole.distance_m}m`:"—",a:false}].map(s=>(
            <View key={s.l} style={[styles.statCard,{backgroundColor:s.a?GOLD+"22":SURFACE,borderColor:s.a?GOLD+"60":BORDER}]}>
              <Text style={[styles.statValue,{color:s.a?GOLD:"#fff"}]}>{s.v}</Text>
              <Text style={styles.statLabel}>{s.l}</Text>
            </View>
          ))}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 12, gap: 10, paddingBottom: insets.bottom+100 }} showsVerticalScrollIndicator={false}>
        <PlayerCard g={g0} setG={setG0} ha={ha0} pts={pts0} isWinner={bbWinner===0} idx={0} />
        <PlayerCard g={g1} setG={setG1} ha={ha1} pts={pts1} isWinner={bbWinner===1} idx={1} />

        {bbPts != null && (
          <View style={[styles.bbSummary, { backgroundColor: SURFACE, borderColor: BORDER }]}>
            <View>
              <Text style={styles.bbLabel}>Betterball Score</Text>
              <Text style={styles.bbRunning}>Running: {runningPts + bbPts} pts</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={[styles.bbPts, { color: bbPts>=3?"#22c55e":bbPts>=2?GOLD:bbPts>=1?"#fb923c":"#f87171" }]}>{bbPts}</Text>
              <Text style={styles.bbPtsLabel}>pts this hole</Text>
            </View>
          </View>
        )}
      </ScrollView>

      <View style={[styles.actions, { paddingBottom: insets.bottom+16 }]}>
        <TouchableOpacity onPress={() => saveAndNext(true)} disabled={saving} style={[styles.nrBtn, { borderColor: BORDER }]}>
          <Text style={[styles.nrText, { color: MUTED_FG }]}>NR / Pickup</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => saveAndNext(false)} disabled={saving||(g0==null&&g1==null)} style={[styles.nextBtn, { backgroundColor: (g0!=null||g1!=null)?GREEN:SURFACE, opacity: saving?0.7:1 }]}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.nextText}>{holeIdx<sc.length-1?"Save · Next →":"Finish Round 🏁"}</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection:"row",alignItems:"center",paddingHorizontal:16,paddingVertical:8,gap:10 },
  backBtn: { width:36,height:36,borderRadius:10,backgroundColor:SURFACE,alignItems:"center",justifyContent:"center" },
  topBarClub: { flex:1,fontSize:13,fontFamily:"Inter_600SemiBold",color:"#a3e4bc",textAlign:"center" },
  holeStrip: { paddingHorizontal:16,paddingBottom:4,gap:4,alignItems:"center" },
  holeChip: { width:38,borderRadius:8,borderWidth:1,alignItems:"center",justifyContent:"center",marginRight:4 },
  stripMeta: { textAlign:"center",fontSize:11,color:MUTED_FG,fontFamily:"Inter_400Regular",marginBottom:4 },
  holeHeader: { alignItems:"center",paddingHorizontal:20,paddingTop:4,paddingBottom:8 },
  nowLabel: { fontSize:10,fontFamily:"Inter_700Bold",color:GOLD,letterSpacing:2 },
  holeName: { fontSize:60,fontFamily:"Inter_700Bold",color:"#fff",lineHeight:64,letterSpacing:-2 },
  statsRow: { flexDirection:"row",gap:8,marginTop:4 },
  statCard: { flex:1,borderRadius:12,padding:8,alignItems:"center",borderWidth:1 },
  statValue: { fontSize:15,fontFamily:"Inter_700Bold" },
  statLabel: { fontSize:8,fontFamily:"Inter_700Bold",color:MUTED_FG,letterSpacing:0.5,marginTop:2 },
  playerCard: { borderRadius:16,borderWidth:1.5,padding:14,gap:10 },
  playerHeader: { flexDirection:"row",justifyContent:"space-between",alignItems:"center" },
  playerRow: { flexDirection:"row",alignItems:"center",gap:10 },
  playerAvatar: { width:34,height:34,borderRadius:17,alignItems:"center",justifyContent:"center" },
  playerInitials: { fontSize:12,fontFamily:"Inter_700Bold",color:"#fff" },
  playerName: { fontSize:14,fontFamily:"Inter_700Bold",color:"#fff" },
  playerMeta: { fontSize:11,color:MUTED_FG,fontFamily:"Inter_400Regular" },
  bestBallBadge: { paddingHorizontal:10,paddingVertical:3,borderRadius:20,borderWidth:1 },
  bestBallText: { fontSize:11,fontFamily:"Inter_700Bold" },
  playerStepper: { flexDirection:"row",alignItems:"center",gap:0 },
  miniStepBtn: { width:44,height:44,borderRadius:22,borderWidth:2,alignItems:"center",justifyContent:"center" },
  miniStepText: { fontSize:22,fontFamily:"Inter_400Regular",lineHeight:28 },
  miniScore: { fontSize:52,fontFamily:"Inter_700Bold",lineHeight:56,letterSpacing:-2 },
  miniScoreLabel: { fontSize:11,color:MUTED_FG,fontFamily:"Inter_400Regular",marginTop:-4 },
  quickRow: { flexDirection:"row",gap:5 },
  quickBtn: { flex:1,paddingVertical:7,borderRadius:10,borderWidth:1.5,alignItems:"center" },
  quickScore: { fontSize:14,fontFamily:"Inter_700Bold" },
  bbSummary: { flexDirection:"row",alignItems:"center",justifyContent:"space-between",padding:14,borderRadius:14,borderWidth:1 },
  bbLabel: { fontSize:12,fontFamily:"Inter_600SemiBold",color:MUTED_FG },
  bbRunning: { fontSize:11,color:MUTED_FG,fontFamily:"Inter_400Regular",marginTop:2 },
  bbPts: { fontSize:36,fontFamily:"Inter_700Bold",lineHeight:40 },
  bbPtsLabel: { fontSize:11,color:MUTED_FG,fontFamily:"Inter_400Regular" },
  actions: { flexDirection:"row",gap:10,paddingHorizontal:16,paddingTop:12 },
  nrBtn: { flex:1,paddingVertical:15,borderRadius:16,borderWidth:1.5,alignItems:"center" },
  nrText: { fontSize:13,fontFamily:"Inter_600SemiBold" },
  nextBtn: { flex:3,paddingVertical:15,borderRadius:16,alignItems:"center" },
  nextText: { fontSize:16,fontFamily:"Inter_700Bold",color:"#fff" },
});
