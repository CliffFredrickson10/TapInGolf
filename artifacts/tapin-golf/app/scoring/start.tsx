import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
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

type Club = { id: number; name: string; location: string; province: string };
type Tournament = { id: number; name: string; event_date: string; format: string; format2: string | null };

type FormatEntry = { key: string; label: string };
type FormatGroup = { group: string; formats: FormatEntry[] };

const FORMAT_GROUPS: FormatGroup[] = [
  {
    group: "Individual",
    formats: [
      { key: "individual_stableford",  label: "Individual Stableford" },
      { key: "gross_stroke_play",      label: "Gross Stroke Play (Medal)" },
      { key: "net_stroke_play",        label: "Net Stroke Play" },
      { key: "singles_match_play",     label: "Singles Match Play" },
      { key: "par_bogey",              label: "Par / Bogey Competition" },
      { key: "individual_par",         label: "Individual Par Competition" },
      { key: "individual_bogey",       label: "Individual Bogey Competition" },
      { key: "modified_stableford",    label: "Modified Stableford" },
      { key: "individual_bonus_bogey", label: "Individual Bonus Bogey" },
      { key: "chairman",               label: "Chairman (The Perch)" },
      { key: "maximum_score",          label: "Maximum Score" },
      { key: "eclectic",               label: "Eclectic (Multi-Round)" },
    ],
  },
  {
    group: "Betterball (2 Players)",
    formats: [
      { key: "fourball_stableford",       label: "Betterball Stableford (4BBB)" },
      { key: "fourball_gross_betterball", label: "Four-Ball Gross Betterball" },
      { key: "fourball_net_betterball",   label: "Four-Ball Net Betterball" },
      { key: "betterball_match_play",     label: "Betterball Match Play" },
      { key: "shamble",                   label: "Shamble" },
      { key: "best_ball_aggregate",       label: "Best Ball Aggregate" },
      { key: "high_low",                  label: "High-Low" },
      { key: "daytona",                   label: "Daytona (Las Vegas)" },
      { key: "low_ball_total",            label: "Low Ball / Total Score" },
      { key: "the_ghost",                 label: "The Ghost" },
      { key: "betterball_bonus_bogey",    label: "Betterball Bonus Bogey" },
      { key: "pinehurst_points",          label: "Multiplication Betterball (Pinehurst)" },
    ],
  },
  {
    group: "Team (3–4 Players)",
    formats: [
      { key: "alliance",          label: "Alliance" },
      { key: "american_scramble", label: "American Scramble" },
    ],
  },
  {
    group: "Other",
    formats: [{ key: "other", label: "Other / Custom" }],
  },
];

const ALL_FORMATS = FORMAT_GROUPS.flatMap(g => g.formats);

const ALLOWANCES = [
  { value: 100, label: "100%" },
  { value: 95,  label: "95%" },
  { value: 90,  label: "90%" },
  { value: 85,  label: "85%" },
  { value: 75,  label: "75%" },
  { value: 50,  label: "50% (Foursomes)" },
];

const TEE_COLORS = [
  { key: "yellow", label: "Yellow", hex: "#F5C518" },
  { key: "white",  label: "White",  hex: "#FFFFFF" },
  { key: "blue",   label: "Blue",   hex: "#3B82F6" },
  { key: "red",    label: "Red",    hex: "#EF4444" },
];

const BETTERBALL_FORMATS = new Set([
  "fourball_stableford","fourball_gross_betterball","fourball_net_betterball",
  "betterball_match_play","shamble","best_ball_aggregate","high_low","daytona",
  "low_ball_total","the_ghost","betterball_bonus_bogey","pinehurst_points",
  "alliance","american_scramble",
]);

export default function StartRoundScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const token = user?.token;
  const params = useLocalSearchParams<{ clubId?: string; clubName?: string }>();

  // Club selection
  const [clubSearch, setClubSearch] = useState("");
  const [clubs, setClubs] = useState<Club[]>([]);
  const [clubsLoading, setClubsLoading] = useState(false);
  const [selectedClub, setSelectedClub] = useState<Club | null>(
    params.clubId ? { id: parseInt(params.clubId), name: params.clubName ?? "", location: "", province: "" } : null
  );

  // Tournament
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [linkedTournamentId, setLinkedTournamentId] = useState<number | null>(null);

  // Form
  const [teeColor, setTeeColor] = useState("white");
  const [format, setFormat] = useState("individual_stableford");
  const [courseHcp, setCourseHcp] = useState("0");
  const [allowancePct, setAllowancePct] = useState(95);
  const [expandedGroup, setExpandedGroup] = useState("Individual");
  const [submitting, setSubmitting] = useState(false);
  const [showAllowancePicker, setShowAllowancePicker] = useState(false);

  const ph = Math.round((parseInt(courseHcp) || 0) * (allowancePct / 100));
  const selectedFormatLabel = ALL_FORMATS.find(f => f.key === format)?.label ?? format;
  const linkedTournament = tournaments.find(t => t.id === linkedTournamentId) ?? null;
  const isBetterball = BETTERBALL_FORMATS.has(format);

  // Search clubs
  const searchClubs = useCallback(async (q: string) => {
    if (q.length < 2) { setClubs([]); return; }
    setClubsLoading(true);
    try {
      const data = await apiFetch(`/clubs?search=${encodeURIComponent(q)}&limit=10`);
      setClubs(data.clubs ?? []);
    } catch { setClubs([]); }
    finally { setClubsLoading(false); }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchClubs(clubSearch), 300);
    return () => clearTimeout(t);
  }, [clubSearch, searchClubs]);

  // Load tournaments when club is selected
  useEffect(() => {
    if (!selectedClub || !token) return;
    apiFetch(`/scoring/clubs/${selectedClub.id}/tournaments`, token)
      .then(d => setTournaments(d.tournaments ?? []))
      .catch(() => setTournaments([]));
  }, [selectedClub, token]);

  const linkTournament = (t: Tournament) => {
    setLinkedTournamentId(t.id);
    setFormat(t.format || "individual_stableford");
    const grp = FORMAT_GROUPS.find(g => g.formats.some(f => f.key === t.format));
    if (grp) setExpandedGroup(grp.group);
  };

  const unlinkTournament = () => setLinkedTournamentId(null);

  const onStartRound = async () => {
    if (!selectedClub) { Alert.alert("Select a club", "Please choose a golf club first."); return; }
    const ch = parseInt(courseHcp) || 0;
    setSubmitting(true);
    try {
      const data = await apiFetch("/scoring/rounds", token, {
        method: "POST",
        body: JSON.stringify({
          clubId: selectedClub.id,
          teeColor,
          format,
          courseHandicap: ch,
          playingHandicap: ph,
          allowancePct,
          tournamentId: linkedTournamentId,
        }),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace(isBetterball
        ? `/scoring/${data.id}/betterball`
        : `/scoring/${data.id}/hole`
      );
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to start round");
    } finally {
      setSubmitting(false);
    }
  };

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{title}</Text>
      {children}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.primary, paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Start Round</Text>
          <Text style={styles.headerSub}>Set up your scoring session</Text>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 120, gap: 14 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Club selection */}
          <Section title="GOLF CLUB">
            {selectedClub ? (
              <View style={styles.selectedClub}>
                <View style={[styles.clubIcon, { backgroundColor: colors.primary + "20" }]}>
                  <Ionicons name="golf" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.clubName, { color: colors.foreground }]}>{selectedClub.name}</Text>
                  {selectedClub.location ? (
                    <Text style={[styles.clubLocation, { color: colors.mutedForeground }]}>{selectedClub.location}</Text>
                  ) : null}
                </View>
                <TouchableOpacity onPress={() => { setSelectedClub(null); setTournaments([]); setLinkedTournamentId(null); }}>
                  <Text style={[styles.changeLink, { color: colors.primary }]}>Change</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View>
                <View style={[styles.searchRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <Ionicons name="search" size={18} color={colors.mutedForeground} />
                  <TextInput
                    value={clubSearch}
                    onChangeText={setClubSearch}
                    placeholder="Search clubs..."
                    placeholderTextColor={colors.mutedForeground}
                    style={[styles.searchInput, { color: colors.foreground }]}
                    autoFocus
                  />
                  {clubsLoading && <ActivityIndicator size="small" color={colors.primary} />}
                </View>
                {clubs.map(c => (
                  <TouchableOpacity
                    key={c.id}
                    onPress={() => { setSelectedClub(c); setClubSearch(""); setClubs([]); }}
                    style={[styles.clubRow, { borderBottomColor: colors.border }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.clubName, { color: colors.foreground }]}>{c.name}</Text>
                      <Text style={[styles.clubLocation, { color: colors.mutedForeground }]}>{c.location}, {c.province}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </Section>

          {selectedClub && (
            <>
              {/* Tournament */}
              <Section title="CLUB TOURNAMENT (OPTIONAL)">
                {linkedTournament ? (
                  <View style={[styles.linkedTournament, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "40" }]}>
                    <View style={[styles.trophyIcon, { backgroundColor: colors.primary }]}>
                      <Ionicons name="trophy" size={16} color="#fff" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.tournamentName, { color: colors.primary }]}>{linkedTournament.name}</Text>
                      <Text style={[styles.tournamentDate, { color: colors.mutedForeground }]}>
                        {new Date(linkedTournament.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={unlinkTournament}>
                      <Text style={{ color: "#ef4444", fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Unlink</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={{ gap: 8 }}>
                    {tournaments.length > 0 ? tournaments.map(t => (
                      <TouchableOpacity
                        key={t.id}
                        onPress={() => linkTournament(t)}
                        style={[styles.tournamentRow, { borderColor: colors.border, backgroundColor: colors.background }]}
                      >
                        <Ionicons name="trophy-outline" size={18} color={colors.primary} />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.clubName, { color: colors.foreground }]}>{t.name}</Text>
                          <Text style={[styles.clubLocation, { color: colors.mutedForeground }]}>
                            {new Date(t.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
                      </TouchableOpacity>
                    )) : (
                      <Text style={[styles.noTournaments, { color: colors.mutedForeground }]}>
                        No upcoming tournaments at this club. Tap below to play casually.
                      </Text>
                    )}
                  </View>
                )}
              </Section>

              {/* Tee colour */}
              <Section title="TEE COLOUR">
                <View style={styles.teeRow}>
                  {TEE_COLORS.map(t => (
                    <TouchableOpacity
                      key={t.key}
                      onPress={() => setTeeColor(t.key)}
                      style={[styles.teeBtn, {
                        borderColor: teeColor === t.key ? colors.primary : colors.border,
                        backgroundColor: teeColor === t.key ? colors.primary + "12" : colors.background,
                      }]}
                    >
                      <View style={[styles.teeDot, {
                        backgroundColor: t.hex,
                        borderColor: t.key === "white" ? colors.border : "transparent",
                      }]} />
                      <Text style={[styles.teeLabel, { color: teeColor === t.key ? colors.primary : colors.mutedForeground, fontFamily: teeColor === t.key ? "Inter_700Bold" : "Inter_400Regular" }]}>
                        {t.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </Section>

              {/* Format */}
              <Section title="GAME FORMAT">
                <View style={[styles.selectedFormatChip, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "40" }]}>
                  <Ionicons name="golf" size={14} color={colors.primary} />
                  <Text style={[styles.selectedFormatText, { color: colors.primary }]}>{selectedFormatLabel}</Text>
                </View>
                <View style={{ gap: 6, marginTop: 8 }}>
                  {FORMAT_GROUPS.map(g => {
                    const isOpen = expandedGroup === g.group;
                    const hasSelected = g.formats.some(f => f.key === format);
                    return (
                      <View key={g.group}>
                        <TouchableOpacity
                          onPress={() => setExpandedGroup(isOpen ? "" : g.group)}
                          style={[styles.groupHeader, {
                            borderColor: hasSelected ? colors.primary + "50" : colors.border,
                            backgroundColor: hasSelected ? colors.primary + "10" : colors.background,
                          }]}
                        >
                          <Text style={[styles.groupLabel, { color: hasSelected ? colors.primary : colors.foreground }]}>
                            {g.group} {hasSelected ? "✓" : ""}
                          </Text>
                          <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
                        </TouchableOpacity>
                        {isOpen && (
                          <View style={{ gap: 4, marginTop: 4, paddingLeft: 8 }}>
                            {g.formats.map(f => (
                              <TouchableOpacity
                                key={f.key}
                                onPress={() => setFormat(f.key)}
                                style={[styles.formatRow, {
                                  borderColor: format === f.key ? colors.primary : colors.border,
                                  backgroundColor: format === f.key ? colors.primary + "10" : colors.background,
                                }]}
                              >
                                <View style={[styles.radio, {
                                  borderColor: format === f.key ? colors.primary : colors.border,
                                  backgroundColor: format === f.key ? colors.primary : "transparent",
                                }]}>
                                  {format === f.key && <View style={styles.radioInner} />}
                                </View>
                                <Text style={[styles.formatLabel, { color: format === f.key ? colors.primary : colors.foreground, fontFamily: format === f.key ? "Inter_600SemiBold" : "Inter_400Regular" }]}>
                                  {f.label}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
                {isBetterball && (
                  <View style={[styles.infoBanner, { backgroundColor: "#eff6ff", borderColor: "#bfdbfe" }]}>
                    <Ionicons name="people" size={16} color="#1d4ed8" />
                    <Text style={[styles.infoText, { color: "#1d4ed8" }]}>
                      You'll be prompted to enter your partner's score on each hole.
                    </Text>
                  </View>
                )}
              </Section>

              {/* Handicap */}
              <Section title="HANDICAP">
                <View style={{ gap: 14 }}>
                  {/* Course HCP */}
                  <View>
                    <View style={styles.hcpLabelRow}>
                      <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Course Handicap</Text>
                      <View style={[styles.hintChip, { backgroundColor: colors.muted }]}>
                        <Text style={[styles.hintText, { color: colors.mutedForeground }]}>From HNA app</Text>
                      </View>
                    </View>
                    <View style={[styles.stepperRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <TouchableOpacity
                        onPress={() => { Haptics.selectionAsync(); setCourseHcp(v => String(Math.max(0, parseInt(v || "0") - 1))); }}
                        style={[styles.stepperBtn, { borderColor: colors.border }]}
                      >
                        <Text style={[styles.stepperBtnText, { color: colors.foreground }]}>−</Text>
                      </TouchableOpacity>
                      <TextInput
                        value={courseHcp}
                        onChangeText={v => { const n = parseInt(v.replace(/\D/g, "") || "0"); if (n <= 54) setCourseHcp(String(n)); }}
                        style={[styles.stepperValue, { color: colors.primary }]}
                        keyboardType="number-pad"
                        textAlign="center"
                        maxLength={2}
                      />
                      <TouchableOpacity
                        onPress={() => { Haptics.selectionAsync(); setCourseHcp(v => String(Math.min(54, parseInt(v || "0") + 1))); }}
                        style={[styles.stepperBtn, { borderColor: colors.primary, backgroundColor: colors.primary }]}
                      >
                        <Text style={[styles.stepperBtnText, { color: "#fff" }]}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Allowance */}
                  <View>
                    <View style={styles.hcpLabelRow}>
                      <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Playing Allowance</Text>
                      <View style={[styles.hintChip, { backgroundColor: "#fef9ee", borderWidth: 1, borderColor: "#fde68a" }]}>
                        <Text style={[styles.hintText, { color: "#92400e" }]}>Set by club</Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={() => setShowAllowancePicker(v => !v)}
                      style={[styles.allowancePicker, { borderColor: colors.border, backgroundColor: colors.background }]}
                    >
                      <Text style={[styles.allowanceValue, { color: colors.primary }]}>
                        {ALLOWANCES.find(a => a.value === allowancePct)?.label ?? `${allowancePct}%`}
                      </Text>
                      <Ionicons name={showAllowancePicker ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
                    </TouchableOpacity>
                    {showAllowancePicker && (
                      <View style={[styles.allowanceDropdown, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        {ALLOWANCES.map((a, i) => (
                          <TouchableOpacity
                            key={a.value}
                            onPress={() => { setAllowancePct(a.value); setShowAllowancePicker(false); }}
                            style={[styles.allowanceOption, {
                              backgroundColor: allowancePct === a.value ? colors.primary + "10" : "transparent",
                              borderBottomColor: i < ALLOWANCES.length - 1 ? colors.border : "transparent",
                            }]}
                          >
                            <Text style={[styles.allowanceOptionText, { color: allowancePct === a.value ? colors.primary : colors.foreground, fontFamily: allowancePct === a.value ? "Inter_700Bold" : "Inter_400Regular" }]}>
                              {a.label}
                            </Text>
                            {allowancePct === a.value && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>

                  {/* Summary */}
                  {(parseInt(courseHcp) || 0) > 0 && (
                    <View style={[styles.hcpSummary, { backgroundColor: "#c8a84b20", borderColor: "#c8a84b50" }]}>
                      <View style={styles.hcpSummaryItem}>
                        <Text style={styles.hcpSummaryValue}>{parseInt(courseHcp) || 0}</Text>
                        <Text style={styles.hcpSummaryLabel}>Course HCP</Text>
                      </View>
                      <Ionicons name="close" size={14} color="#92400e" style={{ marginTop: 8 }} />
                      <View style={styles.hcpSummaryItem}>
                        <Text style={styles.hcpSummaryValue}>{allowancePct}%</Text>
                        <Text style={styles.hcpSummaryLabel}>Allowance</Text>
                      </View>
                      <Ionicons name="remove" size={14} color="#92400e" style={{ marginTop: 8 }} />
                      <View style={[styles.hcpSummaryItem, styles.hcpSummaryHighlight]}>
                        <Text style={[styles.hcpSummaryValue, { color: "#fff" }]}>{ph}</Text>
                        <Text style={[styles.hcpSummaryLabel, { color: "rgba(255,255,255,0.75)" }]}>Playing HCP</Text>
                      </View>
                    </View>
                  )}
                </View>
              </Section>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Sticky Start Button */}
      {selectedClub && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16, backgroundColor: colors.background }]}>
          <TouchableOpacity
            onPress={onStartRound}
            disabled={submitting}
            style={[styles.startBtn, { backgroundColor: submitting ? colors.muted : colors.primary }]}
            activeOpacity={0.85}
          >
            {submitting
              ? <ActivityIndicator color="#fff" />
              : <>
                  <Ionicons name="golf" size={20} color="#fff" />
                  <Text style={styles.startBtnText}>Start Round</Text>
                </>
            }
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingBottom: 16,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff" },
  headerSub: { fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.75)" },
  section: {
    borderRadius: 16, padding: 16, borderWidth: 1, gap: 0,
  },
  sectionLabel: {
    fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.8, marginBottom: 12,
  },
  selectedClub: { flexDirection: "row", alignItems: "center", gap: 12 },
  clubIcon: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  clubName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  clubLocation: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  changeLink: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  searchRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 10,
    marginBottom: 8,
  },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  clubRow: {
    flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1,
  },
  linkedTournament: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderRadius: 12, borderWidth: 1.5, padding: 12,
  },
  trophyIcon: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  tournamentName: { fontSize: 14, fontFamily: "Inter_700Bold" },
  tournamentDate: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  tournamentRow: {
    flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 12, borderWidth: 1.5,
  },
  noTournaments: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  teeRow: { flexDirection: "row", gap: 10 },
  teeBtn: {
    flex: 1, alignItems: "center", gap: 6, padding: 10, borderRadius: 12, borderWidth: 1.5,
  },
  teeDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5 },
  teeLabel: { fontSize: 11 },
  selectedFormatChip: {
    flexDirection: "row", alignItems: "center", gap: 8,
    padding: 10, borderRadius: 10, borderWidth: 1, marginBottom: 4,
  },
  selectedFormatText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  groupHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: 12, borderRadius: 10, borderWidth: 1,
  },
  groupLabel: { fontSize: 13, fontFamily: "Inter_700Bold" },
  formatRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    padding: 11, borderRadius: 10, borderWidth: 1.5,
  },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  radioInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#fff" },
  formatLabel: { fontSize: 13, flex: 1 },
  infoBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    padding: 10, borderRadius: 10, borderWidth: 1, marginTop: 8,
  },
  infoText: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  hcpLabelRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  fieldLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  hintChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  hintText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  stepperRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 8, paddingVertical: 4,
  },
  stepperBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  stepperBtnText: { fontSize: 22, fontFamily: "Inter_400Regular", lineHeight: 28 },
  stepperValue: { fontSize: 36, fontFamily: "Inter_700Bold", flex: 1, textAlign: "center" },
  allowancePicker: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: 14, borderRadius: 12, borderWidth: 1.5,
  },
  allowanceValue: { fontSize: 18, fontFamily: "Inter_700Bold" },
  allowanceDropdown: {
    marginTop: 4, borderRadius: 14, borderWidth: 1, overflow: "hidden",
  },
  allowanceOption: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: 14, borderBottomWidth: 1,
  },
  allowanceOptionText: { fontSize: 15 },
  hcpSummary: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, padding: 14, borderRadius: 14, borderWidth: 1,
  },
  hcpSummaryItem: { alignItems: "center" },
  hcpSummaryHighlight: {
    backgroundColor: "#1a5c38", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 6,
  },
  hcpSummaryValue: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#92400e" },
  hcpSummaryLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#b45309", marginTop: 2 },
  footer: {
    paddingHorizontal: 16, paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#e5e7eb",
  },
  startBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, borderRadius: 16, paddingVertical: 16,
  },
  startBtnText: { fontSize: 17, fontFamily: "Inter_700Bold", color: "#fff" },
});
