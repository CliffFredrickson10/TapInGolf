import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
  tournament_name: string | null;
  scorecard: ScorecardHole[];
  holes: Record<number, SavedHole>;
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

  const onShare = async () => {
    if (!round) return;
    const pts = round.total_points ?? 0;
    const gross = round.total_gross ?? 0;
    const msg = `🏌️ I just played ${round.club_name} on TapIn Golf!\n${pts} Stableford pts · Gross ${gross} · ${round.holes_played} holes\n#TapInGolf`;
    try { await Share.share({ message: msg }); } catch {}
  };

  if (loading || !round) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} size="large" />
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

          {/* Header */}
          <View style={[styles.scHeaderRow, { backgroundColor: colors.primary, borderRadius: 10, marginBottom: 2 }]}>
            {["Hole", "Par", "SI", "Gross", "Net", "Pts"].map(h => (
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

          {/* Totals */}
          <View style={[styles.scTotalsRow, { backgroundColor: colors.primary, borderRadius: 10, marginTop: 2 }]}>
            <Text style={styles.scTotalLabel}>TOTAL</Text>
            <Text style={styles.scTotalPar}>{sc.reduce((s, h) => s + h.par, 0)}</Text>
            <Text style={styles.scTotalBlank}>—</Text>
            <Text style={styles.scTotalValue}>{totalGross || "—"}</Text>
            <Text style={styles.scTotalValue}>{totalNet || "—"}</Text>
            <Text style={[styles.scTotalValue, { color: GOLD }]}>{totalPts}</Text>
          </View>
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
          <TouchableOpacity
            onPress={() => router.replace("/(tabs)/scoring")}
            style={[styles.footerBtn, { backgroundColor: colors.primary }]}
          >
            <Ionicons name="golf" size={18} color="#fff" />
            <Text style={[styles.footerBtnText, { color: "#fff" }]}>Back to Scoring</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const GOLD = "#c8a84b";

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
  footer: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  footerBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 16, paddingVertical: 15 },
  footerBtnText: { fontSize: 15, fontFamily: "Inter_700Bold" },
});
