import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
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

const DARK_BG  = "#f2f6f3";
const SURFACE  = "#ffffff";
const BORDER   = "#c8ddd2";
const GREEN    = "#1a5c38";
const GOLD     = "#c8a84b";
const MUTED_FG = "#5a7265";

const PLAYER_COLORS = ["#3b82f6", "#a855f7"];

type ScorecardHole = { number: number; par: number; stroke_index: number; distance_m?: number };
type SavedHole = { hole_number: number; gross_score: number | null; stableford_points: number | null; is_nr: number };
type Round = {
  id: number; club_name: string; format: string;
  playing_handicap: number; status: string;
  scorecard: ScorecardHole[];
  holes: Record<number, SavedHole>;
  playerHoles: Record<string, any>;
  opponent_name: string | null;
  partner_name: string | null;
  match_id: number | null;
};

function getHA(si: number, ph: number) { if (ph<=0) return 0; if (ph<=18) return si<=ph?1:0; return 1+(si<=ph-18?1:0); }
function calcPts(gross: number, par: number, ha: number) { return Math.max(0,par+2-(gross-ha)); }
function scoreName(g: number, p: number) { if(g===1) return "Hole-in-one"; const d=g-p; if(d<=-2) return "Eagle"; if(d===-1) return "Birdie"; if(d===0) return "Par"; if(d===1) return "Bogey"; if(d===2) return "Double"; return `+${d}`; }
function scoreColor(g: number, p: number) { const d=g-p; if(d<=-2) return GOLD; if(d===-1) return "#16a34a"; if(d===0) return "#1a5c38"; if(d===1) return "#fb923c"; return "#f87171"; }

export default function BetterballHoleScreen() {
  const { id, startHole } = useLocalSearchParams<{ id: string; startHole?: string }>();
  const { user } = useAuth();
  const token = user?.token;
  const myName = user?.name ?? "You";
  const insets = useSafeAreaInsets();

  const [round, setRound] = useState<Round | null>(null);
  const [loading, setLoading] = useState(true);
  const [holeIdx, setHoleIdx] = useState(0);
  const [g0, setG0] = useState<number | null>(null);
  const [g1, setG1] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const stripRef = useRef<ScrollView>(null);

  const loadRound = useCallback(async () => {
    if (!token || !id) return;
    try {
      const data = await apiFetch(`/scoring/rounds/${id}`, token);
      setRound(data);
      const sc: ScorecardHole[] = data.scorecard ?? [];
      const holes: Record<number, SavedHole> = data.holes ?? {};
      const isNewRound = Object.keys(holes).length === 0;
      const startHoleNum = startHole ? parseInt(startHole as string, 10) : 1;
      let startIdx: number;
      if (isNewRound) {
        const preferred = sc.findIndex((h: ScorecardHole) => h.number === startHoleNum);
        startIdx = preferred >= 0 ? preferred : 0;
      } else {
        const scoredIdxs = sc.map((h, i) => (holes[h.number] ? i : -1)).filter(i => i >= 0);
        const lastScored = Math.max(...scoredIdxs);
        const nextIdx = (lastScored + 1) % sc.length;
        startIdx = !holes[sc[nextIdx]?.number] ? nextIdx : lastScored;
      }
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

  useEffect(() => {
    if (loading) return;
    setTimeout(() => {
      stripRef.current?.scrollTo({ x: Math.max(0, (holeIdx - 3) * 42), animated: false });
    }, 80);
  }, [holeIdx, loading]);

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
      const partnerName = round.partner_name ?? "Partner";
      await apiFetch(`/scoring/rounds/${id}/holes/${hole.number}`, token, {
        method: "PUT",
        body: JSON.stringify({
          par: hole.par, strokeIndex: hole.stroke_index,
          grossScore: isNr ? null : (bbPts != null ? (pts0 != null && (pts1 == null || pts0 >= (pts1??0)) ? g0 : g1) : null),
          isNr,
          players: [
            { grossScore: isNr ? null : g0, isNr, name: myName },
            { grossScore: isNr ? null : g1, isNr, name: partnerName },
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

      // Advance to next unsaved hole (wraps for shotgun starts)
      let nextIdx = -1;
      for (let i = 1; i <= sc.length; i++) {
        const candidate = (holeIdx + i) % sc.length;
        if (updatedHoles[sc[candidate].number] == null) {
          nextIdx = candidate;
          break;
        }
      }
      if (nextIdx === -1) {
        router.replace(`/scoring/${id}/complete`);
      } else {
        goToHole(nextIdx);
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
      const idx = sc.findIndex((h: ScorecardHole) => h.number === targetHoleNum);
      setHoleIdx(idx >= 0 ? idx : targetHoleIdx);
      setG0(null);
      setG1(null);
    } catch { /* ignore */ }
    setClearing(false);
    setShowClearConfirm(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const PlayerCard = ({ g, setG, ha, pts, isWinner, idx, name }: { g: number|null; setG: (v: number|null)=>void; ha: number; pts: number|null; isWinner: boolean; idx: number; name: string }) => {
    const color = PLAYER_COLORS[idx];
    const initials = name.split(" ").slice(0,2).map(w=>w[0]?.toUpperCase()??"").join("");
    return (
      <View style={[styles.playerCard, { borderColor: isWinner && pts!=null ? color+"60" : BORDER, backgroundColor: isWinner && pts!=null ? color+"12" : SURFACE }]}>
        <View style={styles.playerHeader}>
          <View style={styles.playerRow}>
            <View style={[styles.playerAvatar, { backgroundColor: color }]}>
              <Text style={styles.playerInitials}>{initials}</Text>
            </View>
            <View>
              <Text style={styles.playerName}>{name}</Text>
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
                <Text style={styles.miniScoreLabel}>{scoreName(g,hole.par)} · net {g-ha} · <Text style={{ color: pts!=null?(pts>=3?"#16a34a":pts>=2?GOLD:pts>=1?"#fb923c":"#f87171"):MUTED_FG, fontFamily: "Inter_700Bold" }}>{pts}pts</Text></Text>
              </>
            ) : <Text style={[styles.miniScore, { color: BORDER }]}>—</Text>}
          </View>
          <TouchableOpacity onPress={() => { Haptics.selectionAsync(); setG(g==null?hole.par+1:Math.min(15,g+1)); }} style={[styles.miniStepBtn, { borderColor: GREEN, backgroundColor: "#e8f5ee" }]}>
            <Text style={[styles.miniStepText, { color: "#16a34a" }]}>+</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.quickRow}>
          {[-1,0,1,2,3].map(off => {
            const val = hole.par+off;
            const active = g===val;
            const qc = val<hole.par?"#16a34a":val===hole.par?GOLD:val===hole.par+1?"#fb923c":"#f87171";
            return (
              <TouchableOpacity key={off} onPress={() => { Haptics.selectionAsync(); setG(val); }} style={[styles.quickBtn, { backgroundColor: active?qc+"33":SURFACE, borderColor: active?qc:BORDER }]}>
                <Text style={[styles.quickScore, { color: active?qc:"#1a1f1c" }]}>{val}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  const partnerName = round.partner_name ?? "Partner";
  const isKnockout  = !!round.match_id;

  return (
    <View style={{ flex: 1, backgroundColor: DARK_BG }}>
      <AppHeader />
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color={GREEN} />
        </TouchableOpacity>
        <Text style={styles.topBarClub} numberOfLines={1}>{round.club_name} · Betterball</Text>
        <TouchableOpacity onPress={() => router.push(`/scoring/${id}/complete`)} style={styles.backBtn}>
          <Ionicons name="list" size={18} color={GOLD} />
        </TouchableOpacity>
      </View>

      {/* VS / opponent banner for knockout matches */}
      {isKnockout && round.opponent_name && (
        <View style={styles.vsBanner}>
          <View style={styles.vsTeam}>
            <View style={[styles.vsAvatar, { backgroundColor: PLAYER_COLORS[0] }]}><Text style={styles.vsAvatarText}>{myName[0]?.toUpperCase()}</Text></View>
            <View style={[styles.vsAvatar, { backgroundColor: PLAYER_COLORS[1], marginLeft: -10 }]}><Text style={styles.vsAvatarText}>{partnerName[0]?.toUpperCase()}</Text></View>
            <Text style={styles.vsTeamName} numberOfLines={1}>{myName} & {partnerName}</Text>
          </View>
          <Text style={styles.vsLabel}>VS</Text>
          <View style={[styles.vsTeam, { justifyContent: "flex-end" }]}>
            <Text style={[styles.vsTeamName, { textAlign: "right" }]} numberOfLines={1}>{round.opponent_name}</Text>
            <View style={[styles.vsAvatar, { backgroundColor: "#ef4444" }]}><Text style={styles.vsAvatarText}>{round.opponent_name[0]?.toUpperCase()}</Text></View>
          </View>
        </View>
      )}

      {/* Hole strip */}
      <ScrollView ref={stripRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.holeStrip}>
        {sc.map((h, i) => {
          const saved = round.holes[h.number];
          const active = i===holeIdx;
          const p = saved?.stableford_points;
          const dotBg = active?GREEN:saved?(p!=null&&p>=3?"#16a34a":p!=null&&p>=2?GOLD:p!=null&&p>=1?"#fb923c":"#f87171"):SURFACE;
          return (
            <TouchableOpacity key={h.number} onPress={() => goToHole(i)} style={[styles.holeChip, { backgroundColor: dotBg, borderColor: active?GREEN:BORDER, height: active?36:28 }]}>
              <Text style={{ fontSize: active?12:10, fontFamily: "Inter_700Bold", color: active?"#fff":saved?"#fff":MUTED_FG }}>{h.number}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <Text style={styles.stripMeta}>{sc.filter(h=>round.holes[h.number]!=null).length}/{sc.length} scored · {runningPts+(bbPts??0)} pts total</Text>

      {/* Hole identity */}
      <View style={styles.holeHeader}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={styles.nowLabel}>NOW SCORING</Text>
          {round.holes[hole.number] != null && (
            <TouchableOpacity
              onPress={clearHoleScore}
              hitSlop={{ top: 10, bottom: 10, left: 12, right: 12 }}
              style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: "#f8717140", backgroundColor: "#f8717110" }}
            >
              <Ionicons name="trash-outline" size={12} color="#f87171" />
              <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#f87171" }}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.holeName}>HOLE {hole.number}</Text>
        <View style={styles.statsRow}>
          {[{l:"PAR",v:String(hole.par),a:true},{l:"SI",v:String(hole.stroke_index),a:false},{l:"DIST",v:hole.distance_m?`${hole.distance_m}m`:"—",a:false}].map(s=>(
            <View key={s.l} style={[styles.statCard,{backgroundColor:s.a?GOLD+"22":SURFACE,borderColor:s.a?GOLD+"60":BORDER}]}>
              <Text style={[styles.statValue,{color:s.a?GOLD:"#111b16"}]}>{s.v}</Text>
              <Text style={styles.statLabel}>{s.l}</Text>
            </View>
          ))}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 12, gap: 10, paddingBottom: insets.bottom+100 }} showsVerticalScrollIndicator={false}>
        <PlayerCard g={g0} setG={setG0} ha={ha0} pts={pts0} isWinner={bbWinner===0} idx={0} name={myName} />
        <PlayerCard g={g1} setG={setG1} ha={ha1} pts={pts1} isWinner={bbWinner===1} idx={1} name={partnerName} />

        {bbPts != null && (
          <View style={[styles.bbSummary, { backgroundColor: SURFACE, borderColor: BORDER }]}>
            <View>
              <Text style={styles.bbLabel}>Betterball Score</Text>
              <Text style={styles.bbRunning}>Running: {runningPts + bbPts} pts</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={[styles.bbPts, { color: bbPts>=3?"#16a34a":bbPts>=2?GOLD:bbPts>=1?"#fb923c":"#f87171" }]}>{bbPts}</Text>
              <Text style={styles.bbPtsLabel}>pts this hole</Text>
            </View>
          </View>
        )}
      </ScrollView>

      <View style={[styles.actions, { paddingBottom: insets.bottom+16 }]}>
        <TouchableOpacity onPress={() => saveAndNext(true)} disabled={saving} style={[styles.nrBtn, { borderColor: BORDER }]}>
          <Text style={[styles.nrText, { color: MUTED_FG }]}>NR / Pickup</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => saveAndNext(false)} disabled={saving||(g0==null&&g1==null)} style={[styles.nextBtn, { backgroundColor: GREEN, opacity: saving?0.7:(g0!=null||g1!=null)?1:0.35 }]}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.nextText}>{sc.filter(h=>h.number!==hole.number&&round.holes[h.number]==null).length===0?"Finish Round 🏁":"Save · Next →"}</Text>}
        </TouchableOpacity>
      </View>

      {/* ── Clear score confirmation overlay ── */}
      <Modal
        visible={showClearConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowClearConfirm(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.overlayCard}>
            <Ionicons name="trash-outline" size={36} color="rgba(0,0,0,0.25)" style={{ marginBottom: 12 }} />
            <Text style={styles.overlayTitle}>Clear Score?</Text>
            <Text style={styles.overlayBody}>
              Remove the saved score for hole {hole?.number}? You can re-enter it afterwards.
            </Text>
            <TouchableOpacity onPress={doClearHole} disabled={clearing} style={[styles.overlayConfirmBtn, { backgroundColor: "#dc2626" }]}>
              {clearing ? <ActivityIndicator color="#fff" /> : <Text style={styles.overlayConfirmText}>Clear Score</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowClearConfirm(false)} style={styles.overlayCancelBtn}>
              <Text style={styles.overlayCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  vsBanner: { flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:16,paddingVertical:8,backgroundColor:SURFACE,borderBottomWidth:1,borderBottomColor:BORDER },
  vsTeam: { flex:1,flexDirection:"row",alignItems:"center",gap:6 },
  vsAvatar: { width:24,height:24,borderRadius:12,alignItems:"center",justifyContent:"center",borderWidth:1,borderColor:DARK_BG },
  vsAvatarText: { fontSize:10,fontFamily:"Inter_700Bold",color:"#fff" },
  vsTeamName: { flex:1,fontSize:12,fontFamily:"Inter_600SemiBold",color:"#111b16" },
  vsLabel: { fontSize:11,fontFamily:"Inter_700Bold",color:GOLD,paddingHorizontal:8 },
  topBar: { flexDirection:"row",alignItems:"center",paddingHorizontal:16,paddingVertical:8,gap:10 },
  backBtn: { width:36,height:36,borderRadius:10,backgroundColor:SURFACE,alignItems:"center",justifyContent:"center" },
  topBarClub: { flex:1,fontSize:13,fontFamily:"Inter_600SemiBold",color:"#1a5c38",textAlign:"center" },
  holeStrip: { paddingHorizontal:16,paddingBottom:4,gap:4,alignItems:"center" },
  holeChip: { width:38,borderRadius:8,borderWidth:1,alignItems:"center",justifyContent:"center",marginRight:4 },
  stripMeta: { textAlign:"center",fontSize:11,color:MUTED_FG,fontFamily:"Inter_400Regular",marginBottom:4 },
  holeHeader: { alignItems:"center",paddingHorizontal:20,paddingTop:4,paddingBottom:8 },
  nowLabel: { fontSize:10,fontFamily:"Inter_700Bold",color:GOLD,letterSpacing:2 },
  holeName: { fontSize:60,fontFamily:"Inter_700Bold",color:"#111b16",lineHeight:64,letterSpacing:-2 },
  statsRow: { flexDirection:"row",gap:8,marginTop:4 },
  statCard: { flex:1,borderRadius:12,padding:8,alignItems:"center",borderWidth:1 },
  statValue: { fontSize:15,fontFamily:"Inter_700Bold" },
  statLabel: { fontSize:8,fontFamily:"Inter_700Bold",color:MUTED_FG,letterSpacing:0.5,marginTop:2 },
  playerCard: { borderRadius:16,borderWidth:1.5,padding:14,gap:10 },
  playerHeader: { flexDirection:"row",justifyContent:"space-between",alignItems:"center" },
  playerRow: { flexDirection:"row",alignItems:"center",gap:10 },
  playerAvatar: { width:34,height:34,borderRadius:17,alignItems:"center",justifyContent:"center" },
  playerInitials: { fontSize:12,fontFamily:"Inter_700Bold",color:"#fff" },
  playerName: { fontSize:14,fontFamily:"Inter_700Bold",color:"#111b16" },
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
  overlay: { flex:1,backgroundColor:"rgba(0,0,0,0.45)",alignItems:"center",justifyContent:"center",padding:24 },
  overlayCard: { backgroundColor:"#fff",borderRadius:20,padding:24,width:"100%",maxWidth:340,alignItems:"center" },
  overlayTitle: { fontSize:20,fontFamily:"Inter_700Bold",color:"#111b16",marginBottom:8 },
  overlayBody: { fontSize:14,fontFamily:"Inter_400Regular",color:"#555",textAlign:"center",marginBottom:20,lineHeight:20 },
  overlayConfirmBtn: { width:"100%",paddingVertical:15,borderRadius:14,alignItems:"center",marginBottom:10 },
  overlayConfirmText: { fontSize:16,fontFamily:"Inter_700Bold",color:"#fff" },
  overlayCancelBtn: { width:"100%",paddingVertical:13,borderRadius:14,alignItems:"center",backgroundColor:"#f3f4f6" },
  overlayCancelText: { fontSize:15,fontFamily:"Inter_600SemiBold",color:"#374151" },
});
