import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
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
import { AppHeader } from "@/components/AppHeader";

type Club = { id: number; name: string; location: string; province: string; distance_km?: number | null };
type Tournament = { id: number; name: string; event_date: string; format: string; format2: string | null };
type MatchOpponent = { matchId: number; opponentName: string; opp2Name?: string | null; opponentHandicap: number | null; opp2Handicap?: number | null; roundLabel: string | null; partnerName?: string | null; partnerHandicap?: number | null };
type CasualPlayer = { userId?: number; name: string; hcp: string };

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
      { key: "individual_par",         label: "Individual Par Competition" },
      { key: "individual_bogey",       label: "Individual Bogey Competition" },
      { key: "modified_stableford",    label: "Modified Stableford" },
      { key: "individual_bonus_bogey", label: "Individual Bonus Bogey" },
      { key: "chairman",               label: "Chairman (The Perch)" },
      { key: "maximum_score",          label: "Maximum Score" },
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
      { key: "texas_scramble",    label: "Texas Scramble" },
      { key: "american_scramble", label: "American Scramble" },
      { key: "chapman",           label: "Chapman (Pinehurst)" },
    ],
  },
  {
    group: "Other",
    formats: [{ key: "other", label: "Other / Custom" }],
  },
];

const ALL_FORMATS = FORMAT_GROUPS.flatMap(g => g.formats);


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
  "alliance","american_scramble","texas_scramble","chapman",
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

  // Home club (from user profile)
  const [homeClub, setHomeClub] = useState<Club | null>(null);
  useEffect(() => {
    if (!user?.club_id) return;
    apiFetch(`/clubs/${user.club_id}`)
      .then(d => {
        const c = d.club;
        if (c) setHomeClub({ id: c.id, name: c.name, location: c.location ?? "", province: c.province ?? "" });
      })
      .catch(() => {});
  }, [user?.club_id]);

  // Location + nearby clubs
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [nearbyClubs, setNearbyClubs] = useState<Club[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;
        setNearbyLoading(true);
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setUserLat(lat);
        setUserLng(lng);
        const data = await apiFetch(`/clubs?lat=${lat}&lng=${lng}&limit=12`);
        setNearbyClubs(data.clubs ?? []);
      } catch {
        // location denied or unavailable — nearby list stays empty
      } finally {
        setNearbyLoading(false);
      }
    })();
  }, []);

  // Tournament
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [linkedTournamentId, setLinkedTournamentId] = useState<number | null>(null);
  const [matchOpponent, setMatchOpponent] = useState<MatchOpponent | null>(null);
  const [matchOpponentLoading, setMatchOpponentLoading] = useState(false);

  // Form
  const [teeColor, setTeeColor] = useState("white");
  const [format, setFormat] = useState("");
  const [courseHcp, setCourseHcp] = useState("0");
  const [oppHcp, setOppHcp] = useState("0");
  const [partnerHcp, setPartnerHcp] = useState("0");
  const [opp2Hcp, setOpp2Hcp] = useState("0");
  const [oppTeeColor, setOppTeeColor]         = useState("white");
  const [partnerTeeColor, setPartnerTeeColor] = useState("white");
  const [opp2TeeColor, setOpp2TeeColor]       = useState("white");
  // WHS Index from DB — shown as reference only, NOT used as course handicap
  const [oppWhsIdx, setOppWhsIdx] = useState<number | null>(null);
  const [partnerWhsIdx, setPartnerWhsIdx] = useState<number | null>(null);
  const [opp2WhsIdx, setOpp2WhsIdx] = useState<number | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showTournamentPicker, setShowTournamentPicker] = useState(false);
  const selectedFormatLabel = ALL_FORMATS.find(f => f.key === format)?.label ?? format;
  const linkedTournament = tournaments.find(t => t.id === linkedTournamentId) ?? null;
  const isBetterball = BETTERBALL_FORMATS.has(format);
  const isMatchPlay  = format === "singles_match_play";

  // Casual player picker state
  const [casualPartner, setCasualPartner] = useState<CasualPlayer | null>(null);
  const [casualOpp1, setCasualOpp1] = useState<CasualPlayer | null>(null);
  const [casualOpp2, setCasualOpp2] = useState<CasualPlayer | null>(null);
  const [pickerTarget, setPickerTarget] = useState<"partner" | "opp1" | "opp2" | null>(null);
  const [playerSearchQ, setPlayerSearchQ] = useState("");
  const [playerResults, setPlayerResults] = useState<Array<{ id: number; name: string; handicap: number | null; isMe?: boolean }>>([]); 
  const [playerSearchLoading, setPlayerSearchLoading] = useState(false);
  const [guestMode, setGuestMode] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestHcp, setGuestHcp] = useState("0");

  // Debounced TapIn player search
  useEffect(() => {
    if (!playerSearchQ || playerSearchQ.length < 2 || !token) { setPlayerResults([]); return; }
    const t = setTimeout(async () => {
      setPlayerSearchLoading(true);
      try {
        const d = await apiFetch(`/scoring/players/search?q=${encodeURIComponent(playerSearchQ)}`, token);
        setPlayerResults(d.players ?? []);
      } catch { setPlayerResults([]); }
      finally { setPlayerSearchLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [playerSearchQ, token]);

  const openPicker = (target: "partner" | "opp1" | "opp2") => {
    setPickerTarget(target);
    setPlayerSearchQ("");
    setPlayerResults([]);
    setGuestMode(false);
    setGuestName("");
    setGuestHcp("0");
  };

  const selectCasualPlayer = (p: CasualPlayer) => {
    if (pickerTarget === "partner") setCasualPartner(p);
    else if (pickerTarget === "opp1") setCasualOpp1(p);
    else if (pickerTarget === "opp2") setCasualOpp2(p);
    setPickerTarget(null);
  };

  // Search clubs
  const searchClubs = useCallback(async (q: string) => {
    if (q.length < 2) { setClubs([]); return; }
    setClubsLoading(true);
    try {
      const locParam = userLat != null && userLng != null ? `&lat=${userLat}&lng=${userLng}` : "";
      const data = await apiFetch(`/clubs?q=${encodeURIComponent(q)}${locParam}&limit=12`);
      setClubs(data.clubs ?? []);
    } catch { setClubs([]); }
    finally { setClubsLoading(false); }
  }, [userLat, userLng]);

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

  // Fetch partner/opponent/marker info whenever a tournament is linked
  useEffect(() => {
    const isKnockoutMatch = format === "singles_match_play" || format === "betterball_match_play" || format === "singles_stableford_match_play" || format === "singles_gross_match_play" || format === "betterball_gross_match_play" || format === "fourball_stableford_match_play";
    const isBetterballGroup = isBetterball && !isKnockoutMatch;
    const isIndividualTournament = !isBetterball && !isKnockoutMatch;

    if (!linkedTournamentId || !token) { setMatchOpponent(null); return; }

    if (isKnockoutMatch) {
      setMatchOpponentLoading(true);
      apiFetch(`/scoring/tournaments/${linkedTournamentId}/my-match`, token)
        .then(d => {
          const m = d.match ?? null;
          setMatchOpponent(m);
          if (m) {
            if (m.opponentHandicap != null) setOppWhsIdx(m.opponentHandicap);
            if (m.partnerHandicap  != null) setPartnerWhsIdx(m.partnerHandicap);
            if (m.opp2Handicap     != null) setOpp2WhsIdx(m.opp2Handicap);
          }
        })
        .catch(() => setMatchOpponent(null))
        .finally(() => setMatchOpponentLoading(false));
    } else if (isBetterballGroup) {
      setMatchOpponentLoading(true);
      apiFetch(`/scoring/tournaments/${linkedTournamentId}/my-betterball-group`, token)
        .then(d => {
          const g = d.group ?? null;
          if (g) {
            setMatchOpponent({
              matchId: 0,
              opponentName: g.opponentName ?? "",
              opp2Name: g.opp2Name ?? null,
              opponentHandicap: g.opponentHandicap ?? null,
              opp2Handicap: g.opp2Handicap ?? null,
              roundLabel: g.drawReleased ? null : "Draw not yet released",
              partnerName: g.partnerName ?? null,
              partnerHandicap: g.partnerHandicap ?? null,
            });
            if (g.partnerHandicap  != null) setPartnerWhsIdx(g.partnerHandicap);
            if (g.opponentHandicap != null) setOppWhsIdx(g.opponentHandicap);
            if (g.opp2Handicap     != null) setOpp2WhsIdx(g.opp2Handicap);
          } else {
            setMatchOpponent(null);
          }
        })
        .catch(() => setMatchOpponent(null))
        .finally(() => setMatchOpponentLoading(false));
    } else if (isIndividualTournament) {
      setMatchOpponentLoading(true);
      apiFetch(`/scoring/tournaments/${linkedTournamentId}/my-marker`, token)
        .then(d => {
          const m = d.marker ?? null;
          if (m) {
            setMatchOpponent({
              matchId: 0,
              opponentName: m.markerName ?? "",
              opp2Name: m.marker2Name ?? null,
              opponentHandicap: m.markerHandicap ?? null,
              opp2Handicap: m.marker2Handicap ?? null,
              roundLabel: m.drawReleased ? null : "Draw not yet released",
              partnerName: null,
              partnerHandicap: null,
            });
            if (m.markerHandicap  != null) setOppWhsIdx(m.markerHandicap);
            if (m.marker2Handicap != null) setOpp2WhsIdx(m.marker2Handicap);
          } else {
            setMatchOpponent(null);
          }
        })
        .catch(() => setMatchOpponent(null))
        .finally(() => setMatchOpponentLoading(false));
    } else {
      setMatchOpponent(null);
    }
  }, [linkedTournamentId, format, token]);

  // Map golf_events.format / knockout_scoring_format values → our scoring format keys
  const TOURNAMENT_FORMAT_MAP: Record<string, string> = {
    stroke_play:         "gross_stroke_play",
    net_stroke_play:     "net_stroke_play",
    stableford:          "individual_stableford",
    match_play:          "singles_match_play",
    fourball:            "fourball_stableford",
    scramble:            "american_scramble",
    alliance:            "alliance",
    bogey:               "individual_par",
    par_bogey:           "individual_par",
    modified_stableford: "modified_stableford",
    par:                 "individual_par",
    other:               "other",
  };

  const linkTournament = (t: any) => {
    setLinkedTournamentId(t.id);
    setCasualPartner(null); setCasualOpp1(null); setCasualOpp2(null);
    let mappedFormat: string;
    if (t.knockout_type === "individual") {
      // "stableford" is the legacy stored value; "individual_stableford" and
      // "modified_stableford" are the new full format keys from the portal dropdown.
      // Only pure Stableford pts formats get pts comparison; all others (including
      // modified_stableford, individual_par, individual_bogey, maximum_score, chairman, bonus_bogey, etc.)
      // use net comparison — hole winner is identical for those formats.
      const indivStableford = new Set(["stableford", "individual_stableford"]);
      const indivGross      = new Set(["gross_stroke_play"]);
      mappedFormat = indivStableford.has(t.knockout_scoring_format)
        ? "singles_stableford_match_play"
        : indivGross.has(t.knockout_scoring_format)
        ? "singles_gross_match_play"
        : "singles_match_play";
    } else if (t.knockout_type === "team") {
      // fourball_stableford → pts comparison (match play); daytona is gross-based.
      const teamStableford = new Set(["stableford", "fourball_stableford"]);
      const teamGross      = new Set(["fourball_gross_betterball", "daytona"]);
      mappedFormat = teamStableford.has(t.knockout_scoring_format)
        ? "fourball_stableford_match_play"
        : teamGross.has(t.knockout_scoring_format)
        ? "betterball_gross_match_play"
        : "betterball_match_play";
    } else {
      // Regular stroke/stableford event
      const raw = t.format ?? "stableford";
      mappedFormat = TOURNAMENT_FORMAT_MAP[raw] ?? raw ?? "individual_stableford";
    }
    setFormat(mappedFormat);
  };

  const unlinkTournament = () => { setLinkedTournamentId(null); setMatchOpponent(null); };

  const onStartRound = async () => {
    if (!selectedClub) { Alert.alert("Select a club", "Please choose a golf club first."); return; }

    // Validate all visible handicap fields are whole numbers
    const isKnockoutMatch = format === "singles_match_play" || format === "betterball_match_play" || format === "singles_stableford_match_play" || format === "singles_gross_match_play" || format === "betterball_gross_match_play" || format === "fourball_stableford_match_play";
    const ch = parseInt(courseHcp, 10);
    if (isNaN(ch) || String(ch) !== courseHcp.trim()) {
      Alert.alert("Handicap Required", "Please enter your Course Handicap as a whole number before starting."); return;
    }
    if (matchOpponent) {
      if (matchOpponent.opponentName) {
        const opp = parseInt(oppHcp, 10);
        if (isNaN(opp) || String(opp) !== oppHcp.trim()) {
          Alert.alert("Handicap Required", `Please confirm ${matchOpponent.opponentName}'s Course Handicap as a whole number.`); return;
        }
      }
      if (matchOpponent.partnerName) {
        const prt = parseInt(partnerHcp, 10);
        if (isNaN(prt) || String(prt) !== partnerHcp.trim()) {
          Alert.alert("Handicap Required", `Please confirm ${matchOpponent.partnerName}'s Course Handicap as a whole number.`); return;
        }
      }
      if (matchOpponent.opp2Name) {
        const o2 = parseInt(opp2Hcp, 10);
        if (isNaN(o2) || String(o2) !== opp2Hcp.trim()) {
          Alert.alert("Handicap Required", `Please confirm ${matchOpponent.opp2Name}'s Course Handicap as a whole number.`); return;
        }
      }
    }

    setSubmitting(true);
    try {
      const data = await apiFetch("/scoring/rounds", token, {
        method: "POST",
        body: JSON.stringify({
          clubId: selectedClub.id,
          teeColor,
          format,
          courseHandicap: ch,
          playingHandicap: ch,
          allowancePct: 100,
          tournamentId: linkedTournamentId,
          ...(matchOpponent ? {
            opponentPlayingHcp:  parseInt(oppHcp)     || 0,
            partnerPlayingHcp:   parseInt(partnerHcp)  || 0,
            opponent2PlayingHcp: parseInt(opp2Hcp)    || 0,
          } : {}),
          opponentTeeColor:  oppTeeColor,
          partnerTeeColor:   partnerTeeColor,
          opponent2TeeColor: opp2TeeColor,
          ...(!linkedTournamentId && casualPartner  ? { partnerName:   casualPartner.name,  partnerPlayingHcp:   parseInt(casualPartner.hcp)  || 0 } : {}),
          ...(!linkedTournamentId && casualOpp1     ? { opponentName:  casualOpp1.name,     opponentPlayingHcp:  parseInt(casualOpp1.hcp)     || 0 } : {}),
          ...(!linkedTournamentId && casualOpp2     ? { opponent2Name: casualOpp2.name,     opponent2PlayingHcp: parseInt(casualOpp2.hcp)     || 0 } : {}),
        }),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace(`/scoring/${data.id}/hole`);
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
      <AppHeader />
      {/* Sub-header */}
      <View style={[styles.subHeader, { backgroundColor: colors.primary }]}>
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
                {/* Home club pinned above search */}
                {homeClub && (
                  <TouchableOpacity
                    onPress={() => { setSelectedClub(homeClub); setClubSearch(""); setClubs([]); }}
                    style={[styles.clubRow, { borderBottomColor: colors.border }]}
                  >
                    <View style={[styles.clubIcon, { backgroundColor: colors.primary + "20" }]}>
                      <Ionicons name="home" size={16} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={[styles.clubName, { color: colors.foreground }]}>{homeClub.name}</Text>
                        <View style={{ backgroundColor: colors.primary, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                          <Text style={{ color: "#fff", fontSize: 9, fontWeight: "700" }}>HOME</Text>
                        </View>
                      </View>
                      {homeClub.location ? (
                        <Text style={[styles.clubLocation, { color: colors.mutedForeground }]}>{homeClub.location}</Text>
                      ) : null}
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
                  </TouchableOpacity>
                )}
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
                  {(clubSearch.length < 2 ? nearbyLoading : clubsLoading) && (
                    <ActivityIndicator size="small" color={colors.primary} />
                  )}
                </View>
                {clubSearch.length < 2 && nearbyClubs.length > 0 && (
                  <View style={[styles.nearbyHeader, { borderBottomColor: colors.border }]}>
                    <Ionicons name="location" size={13} color={colors.primary} />
                    <Text style={[styles.nearbyLabel, { color: colors.primary }]}>Nearest clubs</Text>
                  </View>
                )}
                {(clubSearch.length < 2 ? nearbyClubs : clubs).map(c => (
                  <TouchableOpacity
                    key={c.id}
                    onPress={() => { setSelectedClub(c); setClubSearch(""); setClubs([]); }}
                    style={[styles.clubRow, { borderBottomColor: colors.border }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.clubName, { color: colors.foreground }]}>{c.name}</Text>
                      <Text style={[styles.clubLocation, { color: colors.mutedForeground }]}>{c.location}, {c.province}</Text>
                    </View>
                    {c.distance_km != null ? (
                      <Text style={[styles.distanceBadge, { color: colors.primary }]}>{c.distance_km} km</Text>
                    ) : (
                      <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
                    )}
                  </TouchableOpacity>
                ))}
                {clubSearch.length >= 2 && clubs.length === 0 && !clubsLoading && (
                  <Text style={[styles.noResults, { color: colors.mutedForeground }]}>No clubs found</Text>
                )}
              </View>
            )}
          </Section>

          {selectedClub && (
            <>
              {/* Tournament */}
              <Section title="CLUB TOURNAMENT (OPTIONAL)">
                {linkedTournament ? (
                  <View>
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
                      <TouchableOpacity onPress={() => { unlinkTournament(); setShowTournamentPicker(false); }}>
                        <Text style={{ color: "#ef4444", fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Unlink</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Partner / opponent preview */}
                    {(() => {
                      const isKnockoutMatch = format === "singles_match_play" || format === "betterball_match_play" || format === "singles_stableford_match_play" || format === "singles_gross_match_play" || format === "betterball_gross_match_play" || format === "fourball_stableford_match_play";
                      const isBetterballGroup = isBetterball && !isKnockoutMatch;
                      if (!isKnockoutMatch && !isBetterballGroup) return null;

                      if (matchOpponentLoading) {
                        return (
                          <View style={[styles.opponentBanner, { borderColor: "#7c3aed40", backgroundColor: "#7c3aed10" }]}>
                            <ActivityIndicator size="small" color="#7c3aed" />
                          </View>
                        );
                      }

                      if (isBetterballGroup) {
                        // Betterball stableford: show partner row + optional opponents row
                        return (
                          <View style={{ gap: 6, marginTop: 6 }}>
                            {/* Partner */}
                            <View style={[styles.opponentBanner, { borderColor: "#7c3aed40", backgroundColor: "#7c3aed10" }]}>
                              <View style={[styles.opponentAvatar, { backgroundColor: "#7c3aed" }]}>
                                <Ionicons name="person" size={14} color="#fff" />
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.opponentVsLabel}>YOUR PARTNER</Text>
                                {matchOpponent?.partnerName ? (
                                  <Text style={[styles.opponentName, { color: colors.foreground }]}>
                                    {matchOpponent.partnerName}
                                    {matchOpponent.partnerHandicap != null ? `  ·  HCP ${matchOpponent.partnerHandicap}` : ""}
                                  </Text>
                                ) : (
                                  <Text style={[styles.opponentRound, { color: colors.mutedForeground }]}>No partner assigned yet</Text>
                                )}
                              </View>
                              <Ionicons name="people-outline" size={18} color="#7c3aed" />
                            </View>
                            {/* Opponents — only once draw is released */}
                            {matchOpponent?.opponentName ? (
                              <View style={[styles.opponentBanner, { borderColor: "#7c3aed40", backgroundColor: "#7c3aed10" }]}>
                                <View style={[styles.opponentAvatar, { backgroundColor: "#7c3aed" }]}>
                                  <Ionicons name="people" size={14} color="#fff" />
                                </View>
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.opponentVsLabel}>OPPONENTS</Text>
                                  <Text style={[styles.opponentName, { color: colors.foreground }]}>
                                    {matchOpponent.opponentName}{matchOpponent.opp2Name ? ` & ${matchOpponent.opp2Name}` : ""}
                                  </Text>
                                </View>
                                <Ionicons name="git-merge-outline" size={18} color="#7c3aed" />
                              </View>
                            ) : (
                              <View style={[styles.opponentBanner, { borderColor: colors.border, backgroundColor: colors.background }]}>
                                <Ionicons name="time-outline" size={16} color={colors.mutedForeground} />
                                <Text style={[styles.opponentRound, { color: colors.mutedForeground }]}>Draw not yet released</Text>
                              </View>
                            )}
                          </View>
                        );
                      }

                      // Knockout matchplay
                      return (
                        <View style={[styles.opponentBanner, { borderColor: "#7c3aed40", backgroundColor: "#7c3aed10" }]}>
                          {matchOpponent ? (
                            <>
                              <View style={[styles.opponentAvatar, { backgroundColor: "#7c3aed" }]}>
                                <Ionicons name={(format === "betterball_match_play" || format === "betterball_gross_match_play" || format === "fourball_stableford_match_play") ? "people" : "person"} size={14} color="#fff" />
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.opponentVsLabel}>
                                  {(format === "betterball_match_play" || format === "betterball_gross_match_play" || format === "fourball_stableford_match_play") ? "YOUR OPPONENTS" : "YOUR OPPONENT"}
                                </Text>
                                <Text style={[styles.opponentName, { color: colors.foreground }]}>
                                  {matchOpponent.opponentName}{matchOpponent.opp2Name ? ` & ${matchOpponent.opp2Name}` : ""}
                                </Text>
                                {matchOpponent.roundLabel && (
                                  <Text style={[styles.opponentRound, { color: colors.mutedForeground }]}>
                                    {matchOpponent.roundLabel}
                                    {matchOpponent.opponentHandicap != null ? ` · HCP ${matchOpponent.opponentHandicap}` : ""}
                                  </Text>
                                )}
                              </View>
                              <Ionicons name="git-merge-outline" size={20} color="#7c3aed" />
                            </>
                          ) : (
                            <>
                              <Ionicons name="help-circle-outline" size={18} color={colors.mutedForeground} />
                              <Text style={[styles.opponentRound, { color: colors.mutedForeground }]}>
                                No match scheduled yet
                              </Text>
                            </>
                          )}
                        </View>
                      );
                    })()}
                  </View>
                ) : (
                  <View>
                    {/* Dropdown toggle */}
                    <TouchableOpacity
                      onPress={() => setShowTournamentPicker(v => !v)}
                      style={[styles.tournamentToggle, {
                        borderColor: showTournamentPicker ? colors.primary + "60" : colors.border,
                        backgroundColor: showTournamentPicker ? colors.primary + "08" : colors.background,
                      }]}
                    >
                      <Ionicons name="trophy-outline" size={16} color={showTournamentPicker ? colors.primary : colors.mutedForeground} />
                      <Text style={[styles.tournamentToggleText, { color: showTournamentPicker ? colors.primary : colors.mutedForeground }]}>
                        {tournaments.length > 0
                          ? `${tournaments.length} tournament${tournaments.length === 1 ? "" : "s"} available`
                          : "No upcoming tournaments"}
                      </Text>
                      <Ionicons
                        name={showTournamentPicker ? "chevron-up" : "chevron-down"}
                        size={16}
                        color={showTournamentPicker ? colors.primary : colors.mutedForeground}
                      />
                    </TouchableOpacity>

                    {/* Dropdown list */}
                    {showTournamentPicker && (
                      <View style={[styles.tournamentDropdown, { borderColor: colors.border, backgroundColor: colors.background }]}>
                        {tournaments.length > 0 ? tournaments.map((t: any) => (
                          <TouchableOpacity
                            key={t.id}
                            onPress={() => { linkTournament(t); setShowTournamentPicker(false); }}
                            style={[styles.tournamentRow, { borderBottomColor: colors.border }]}
                          >
                            <Ionicons name={t.knockout_type ? "git-merge-outline" : "trophy-outline"} size={18} color={colors.primary} />
                            <View style={{ flex: 1 }}>
                              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                                <Text style={[styles.clubName, { color: colors.foreground, flex: 1 }]}>{t.name}</Text>
                                {t.knockout_type && (
                                  <View style={{ backgroundColor: "#7c3aed20", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                                    <Text style={{ fontSize: 9, color: "#7c3aed", fontFamily: "Inter_700Bold", textTransform: "uppercase" }}>
                                      Knockout
                                    </Text>
                                  </View>
                                )}
                              </View>
                              <Text style={[styles.clubLocation, { color: colors.mutedForeground }]}>
                                {t.event_date
                                  ? new Date(t.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })
                                  : "Date TBD"}
                              </Text>
                            </View>
                            <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
                          </TouchableOpacity>
                        )) : (
                          <Text style={[styles.noTournaments, { color: colors.mutedForeground }]}>
                            No upcoming tournaments at this club.
                          </Text>
                        )}
                      </View>
                    )}
                  </View>
                )}
              </Section>

              {/* Format */}
              <Section title="GAME FORMAT">
                {linkedTournamentId ? (
                  // Locked — set by tournament
                  <View style={{ gap: 10 }}>
                    <View style={[styles.selectedFormatChip, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "40" }]}>
                      <Ionicons name="golf" size={14} color={colors.primary} />
                      <Text style={[styles.selectedFormatText, { color: colors.primary }]}>{selectedFormatLabel}</Text>
                      <View style={{ flex: 1 }} />
                      <Ionicons name="lock-closed" size={13} color={colors.primary} />
                    </View>
                    <View style={[styles.infoBanner, { backgroundColor: "#fef9ee", borderColor: "#fde68a" }]}>
                      <Ionicons name="trophy" size={14} color="#92400e" />
                      <Text style={[styles.infoText, { color: "#92400e" }]}>
                        Format set by the club tournament. Unlink the tournament above to choose a different format.
                      </Text>
                    </View>
                  </View>
                ) : (
                  // Editable
                  <View>
                {format ? (
                  <View style={[styles.selectedFormatChip, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "40", marginBottom: 8 }]}>
                    <Ionicons name="golf" size={14} color={colors.primary} />
                    <Text style={[styles.selectedFormatText, { color: colors.primary }]}>{selectedFormatLabel}</Text>
                  </View>
                ) : (
                  <View style={[styles.infoBanner, { backgroundColor: "#fef3f2", borderColor: "#fca5a5", marginBottom: 8 }]}>
                    <Ionicons name="alert-circle-outline" size={14} color="#b91c1c" />
                    <Text style={[styles.infoText, { color: "#b91c1c" }]}>
                      A format is required — tap a category below to choose one.
                    </Text>
                  </View>
                )}
                <View style={{ gap: 6 }}>
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
                                onPress={() => { setFormat(f.key); setExpandedGroup(""); }}
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
                  </View>
                )}
              </Section>

              {/* Handicap */}
              <Section title="HANDICAP">
                <View style={{ gap: 14 }}>
                  {([
                    { label: "Your Course Handicap", hint: "Required — whole number", value: courseHcp, set: setCourseHcp, show: true, whsIdx: null, teeColor: teeColor as string | null, setTeeColor: setTeeColor as ((v: string) => void) | null },
                    { label: `${matchOpponent?.partnerName ?? "Partner"} (Course HCP)`, hint: "Required — enter from HNA app", value: partnerHcp, set: setPartnerHcp, show: isBetterball && !!matchOpponent?.partnerName, whsIdx: partnerWhsIdx, teeColor: partnerTeeColor, setTeeColor: setPartnerTeeColor },
                    { label: `${matchOpponent?.opponentName ?? "Opponent / Marker"} (Course HCP)`, hint: "Required — enter from HNA app", value: oppHcp, set: setOppHcp, show: !!matchOpponent?.opponentName, whsIdx: oppWhsIdx, teeColor: oppTeeColor, setTeeColor: setOppTeeColor },
                    { label: `${matchOpponent?.opp2Name ?? "Opponent 2 / Marker 2"} (Course HCP)`, hint: "Required — enter from HNA app", value: opp2Hcp, set: setOpp2Hcp, show: !!matchOpponent?.opp2Name, whsIdx: opp2WhsIdx, teeColor: opp2TeeColor, setTeeColor: setOpp2TeeColor },
                  ])
                    .filter(r => r.show)
                    .map(r => (
                      <View key={r.label}>
                        <View style={styles.hcpLabelRow}>
                          <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{r.label}</Text>
                          <View style={[styles.hintChip, { backgroundColor: colors.muted }]}>
                            <Text style={[styles.hintText, { color: colors.mutedForeground }]}>{r.hint}</Text>
                          </View>
                        </View>
                        {r.whsIdx != null && (
                          <Text style={{ fontSize: 12, color: colors.mutedForeground, marginBottom: 6, fontFamily: "Inter_400Regular" }}>
                            WHS Index on file: {r.whsIdx} — ask player for their course HCP from the HNA app
                          </Text>
                        )}
                        <View style={[styles.stepperRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
                          <TouchableOpacity
                            onPress={() => { Haptics.selectionAsync(); r.set(v => String(Math.max(0, parseInt(v || "0") - 1))); }}
                            style={[styles.stepperBtn, { borderColor: colors.border }]}
                          >
                            <Text style={[styles.stepperBtnText, { color: colors.foreground }]}>−</Text>
                          </TouchableOpacity>
                          <TextInput
                            value={r.value}
                            onChangeText={v => { const n = parseInt(v.replace(/\D/g, "") || "0"); if (n <= 54) r.set(String(n)); }}
                            style={[styles.stepperValue, { color: colors.primary }]}
                            keyboardType="number-pad"
                            textAlign="center"
                            maxLength={2}
                          />
                          <TouchableOpacity
                            onPress={() => { Haptics.selectionAsync(); r.set(v => String(Math.min(54, parseInt(v || "0") + 1))); }}
                            style={[styles.stepperBtn, { borderColor: colors.primary, backgroundColor: colors.primary }]}
                          >
                            <Text style={[styles.stepperBtnText, { color: "#fff" }]}>+</Text>
                          </TouchableOpacity>
                        </View>
                        {r.teeColor !== null && r.setTeeColor && (
                          <View style={styles.miniTeeRow}>
                            {TEE_COLORS.map(t => (
                              <TouchableOpacity key={t.key} onPress={() => r.setTeeColor!(t.key)}
                                style={[styles.miniTeeBtn, { borderColor: r.teeColor === t.key ? colors.primary : colors.border, backgroundColor: r.teeColor === t.key ? colors.primary + "12" : "transparent" }]}>
                                <View style={[styles.miniTeeDot, { backgroundColor: t.hex, borderWidth: t.key === "white" ? 1 : 0, borderColor: colors.border }]} />
                                <Text style={[styles.miniTeeLbl, { color: r.teeColor === t.key ? colors.primary : colors.mutedForeground, fontFamily: r.teeColor === t.key ? "Inter_700Bold" : "Inter_400Regular" }]}>{t.label}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        )}
                      </View>
                    ))
                  }
                </View>
              </Section>

              {/* ── Casual Players — only shown for non-tournament rounds ── */}
              {!linkedTournamentId && !!format && (
                <Section title={isBetterball ? "PARTNER & OPPONENTS" : isMatchPlay ? "OPPONENT" : "MARKING FOR (OPTIONAL)"}>
                  {/* Description text */}
                  {isBetterball ? (
                    <Text style={[styles.casualDesc, { color: colors.mutedForeground }]}>
                      Add your partner to score together. Opponents are optional.
                    </Text>
                  ) : isMatchPlay ? (
                    <Text style={[styles.casualDesc, { color: colors.mutedForeground }]}>
                      Add your opponent for this match play game.
                    </Text>
                  ) : (
                    <Text style={[styles.casualDesc, { color: colors.mutedForeground }]}>
                      Optionally add the player(s) you are keeping score for. They mark your card on their phone.
                    </Text>
                  )}

                  {/* Partner row (betterball only) */}
                  {isBetterball && (
                    <>
                      <Text style={[styles.casualSubhead, { color: colors.mutedForeground }]}>PARTNER</Text>
                      {casualPartner ? (
                        <>
                          <View style={[styles.casualCard, { borderColor: colors.primary + "50", backgroundColor: colors.primary + "0c" }]}>
                            <View style={[styles.casualAvatar, { backgroundColor: colors.primary + "25" }]}>
                              <Ionicons name="person" size={15} color={colors.primary} />
                            </View>
                            <Text style={[styles.casualCardName, { color: colors.foreground }]} numberOfLines={1}>{casualPartner.name}</Text>
                            {!casualPartner.userId && <View style={styles.guestBadge}><Text style={styles.guestBadgeTxt}>GUEST</Text></View>}
                            <View style={[styles.miniStepper, { borderColor: colors.border }]}>
                              <TouchableOpacity onPress={() => { Haptics.selectionAsync(); setCasualPartner(p => p ? { ...p, hcp: String(Math.max(0, parseInt(p.hcp || "0") - 1)) } : null); }} style={styles.miniStepBtn}>
                                <Text style={[styles.miniStepTxt, { color: colors.foreground }]}>−</Text>
                              </TouchableOpacity>
                              <TextInput value={casualPartner.hcp} onChangeText={v => { const n = parseInt(v.replace(/\D/g, "") || "0"); if (n <= 54) setCasualPartner(p => p ? { ...p, hcp: String(n) } : null); }} style={[styles.miniStepVal, { color: colors.primary }]} keyboardType="number-pad" textAlign="center" maxLength={2} />
                              <TouchableOpacity onPress={() => { Haptics.selectionAsync(); setCasualPartner(p => p ? { ...p, hcp: String(Math.min(54, parseInt(p.hcp || "0") + 1)) } : null); }} style={[styles.miniStepBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                                <Text style={[styles.miniStepTxt, { color: "#fff" }]}>+</Text>
                              </TouchableOpacity>
                            </View>
                            <TouchableOpacity onPress={() => setCasualPartner(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                              <Ionicons name="close-circle" size={20} color={colors.mutedForeground} />
                            </TouchableOpacity>
                          </View>
                          <View style={styles.miniTeeRow}>
                            {TEE_COLORS.map(t => (
                              <TouchableOpacity key={t.key} onPress={() => setPartnerTeeColor(t.key)}
                                style={[styles.miniTeeBtn, { borderColor: partnerTeeColor === t.key ? colors.primary : colors.border, backgroundColor: partnerTeeColor === t.key ? colors.primary + "12" : "transparent" }]}>
                                <View style={[styles.miniTeeDot, { backgroundColor: t.hex, borderWidth: t.key === "white" ? 1 : 0, borderColor: colors.border }]} />
                                <Text style={[styles.miniTeeLbl, { color: partnerTeeColor === t.key ? colors.primary : colors.mutedForeground, fontFamily: partnerTeeColor === t.key ? "Inter_700Bold" : "Inter_400Regular" }]}>{t.label}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </>
                      ) : (
                        <TouchableOpacity onPress={() => openPicker("partner")} style={[styles.addPlayerBtn, { borderColor: colors.primary + "60", backgroundColor: colors.primary + "08" }]}>
                          <Ionicons name="person-add-outline" size={17} color={colors.primary} />
                          <Text style={[styles.addPlayerTxt, { color: colors.primary }]}>Add Partner</Text>
                        </TouchableOpacity>
                      )}
                      <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 12 }} />
                      <Text style={[styles.casualSubhead, { color: colors.mutedForeground }]}>OPPONENTS (OPTIONAL)</Text>
                    </>
                  )}

                  {/* Opp1 / Marker1 */}
                  {casualOpp1 ? (
                    <>
                      <View style={[styles.casualCard, { borderColor: (isBetterball ? "#ea580c" : "#60a5fa") + "50", backgroundColor: (isBetterball ? "#ea580c" : "#60a5fa") + "0c" }]}>
                        <View style={[styles.casualAvatar, { backgroundColor: (isBetterball ? "#ea580c" : "#60a5fa") + "25" }]}>
                          <Ionicons name="person" size={15} color={isBetterball ? "#ea580c" : "#60a5fa"} />
                        </View>
                        <Text style={[styles.casualCardName, { color: colors.foreground }]} numberOfLines={1}>{casualOpp1.name}</Text>
                        {!casualOpp1.userId && <View style={styles.guestBadge}><Text style={styles.guestBadgeTxt}>GUEST</Text></View>}
                        <View style={[styles.miniStepper, { borderColor: colors.border }]}>
                          <TouchableOpacity onPress={() => { Haptics.selectionAsync(); setCasualOpp1(p => p ? { ...p, hcp: String(Math.max(0, parseInt(p.hcp || "0") - 1)) } : null); }} style={styles.miniStepBtn}>
                            <Text style={[styles.miniStepTxt, { color: colors.foreground }]}>−</Text>
                          </TouchableOpacity>
                          <TextInput value={casualOpp1.hcp} onChangeText={v => { const n = parseInt(v.replace(/\D/g, "") || "0"); if (n <= 54) setCasualOpp1(p => p ? { ...p, hcp: String(n) } : null); }} style={[styles.miniStepVal, { color: isBetterball ? "#ea580c" : "#60a5fa" }]} keyboardType="number-pad" textAlign="center" maxLength={2} />
                          <TouchableOpacity onPress={() => { Haptics.selectionAsync(); setCasualOpp1(p => p ? { ...p, hcp: String(Math.min(54, parseInt(p.hcp || "0") + 1)) } : null); }} style={[styles.miniStepBtn, { backgroundColor: isBetterball ? "#ea580c" : "#60a5fa", borderColor: isBetterball ? "#ea580c" : "#60a5fa" }]}>
                            <Text style={[styles.miniStepTxt, { color: "#fff" }]}>+</Text>
                          </TouchableOpacity>
                        </View>
                        <TouchableOpacity onPress={() => { setCasualOpp1(null); setCasualOpp2(null); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Ionicons name="close-circle" size={20} color={colors.mutedForeground} />
                        </TouchableOpacity>
                      </View>
                      <View style={styles.miniTeeRow}>
                        {TEE_COLORS.map(t => (
                          <TouchableOpacity key={t.key} onPress={() => setOppTeeColor(t.key)}
                            style={[styles.miniTeeBtn, { borderColor: oppTeeColor === t.key ? colors.primary : colors.border, backgroundColor: oppTeeColor === t.key ? colors.primary + "12" : "transparent" }]}>
                            <View style={[styles.miniTeeDot, { backgroundColor: t.hex, borderWidth: t.key === "white" ? 1 : 0, borderColor: colors.border }]} />
                            <Text style={[styles.miniTeeLbl, { color: oppTeeColor === t.key ? colors.primary : colors.mutedForeground, fontFamily: oppTeeColor === t.key ? "Inter_700Bold" : "Inter_400Regular" }]}>{t.label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </>
                  ) : (
                    <TouchableOpacity onPress={() => openPicker("opp1")} style={[styles.addPlayerBtn, { borderColor: colors.border }]}>
                      <Ionicons name="person-add-outline" size={17} color={colors.mutedForeground} />
                      <Text style={[styles.addPlayerTxt, { color: colors.mutedForeground }]}>
                        {isBetterball ? "Add Opponent" : "Add Player to Mark For"}
                      </Text>
                    </TouchableOpacity>
                  )}

                  {/* Opp2 / Marker2 — not shown for singles match play (one opponent only) */}
                  {casualOpp1 && !isMatchPlay && (casualOpp2 ? (
                    <>
                      <View style={[styles.casualCard, { borderColor: (isBetterball ? "#dc2626" : "#a78bfa") + "50", backgroundColor: (isBetterball ? "#dc2626" : "#a78bfa") + "0c" }]}>
                        <View style={[styles.casualAvatar, { backgroundColor: (isBetterball ? "#dc2626" : "#a78bfa") + "25" }]}>
                          <Ionicons name="person" size={15} color={isBetterball ? "#dc2626" : "#a78bfa"} />
                        </View>
                        <Text style={[styles.casualCardName, { color: colors.foreground }]} numberOfLines={1}>{casualOpp2.name}</Text>
                        {!casualOpp2.userId && <View style={styles.guestBadge}><Text style={styles.guestBadgeTxt}>GUEST</Text></View>}
                        <View style={[styles.miniStepper, { borderColor: colors.border }]}>
                          <TouchableOpacity onPress={() => { Haptics.selectionAsync(); setCasualOpp2(p => p ? { ...p, hcp: String(Math.max(0, parseInt(p.hcp || "0") - 1)) } : null); }} style={styles.miniStepBtn}>
                            <Text style={[styles.miniStepTxt, { color: colors.foreground }]}>−</Text>
                          </TouchableOpacity>
                          <TextInput value={casualOpp2.hcp} onChangeText={v => { const n = parseInt(v.replace(/\D/g, "") || "0"); if (n <= 54) setCasualOpp2(p => p ? { ...p, hcp: String(n) } : null); }} style={[styles.miniStepVal, { color: isBetterball ? "#dc2626" : "#a78bfa" }]} keyboardType="number-pad" textAlign="center" maxLength={2} />
                          <TouchableOpacity onPress={() => { Haptics.selectionAsync(); setCasualOpp2(p => p ? { ...p, hcp: String(Math.min(54, parseInt(p.hcp || "0") + 1)) } : null); }} style={[styles.miniStepBtn, { backgroundColor: isBetterball ? "#dc2626" : "#a78bfa", borderColor: isBetterball ? "#dc2626" : "#a78bfa" }]}>
                            <Text style={[styles.miniStepTxt, { color: "#fff" }]}>+</Text>
                          </TouchableOpacity>
                        </View>
                        <TouchableOpacity onPress={() => setCasualOpp2(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Ionicons name="close-circle" size={20} color={colors.mutedForeground} />
                        </TouchableOpacity>
                      </View>
                      <View style={styles.miniTeeRow}>
                        {TEE_COLORS.map(t => (
                          <TouchableOpacity key={t.key} onPress={() => setOpp2TeeColor(t.key)}
                            style={[styles.miniTeeBtn, { borderColor: opp2TeeColor === t.key ? colors.primary : colors.border, backgroundColor: opp2TeeColor === t.key ? colors.primary + "12" : "transparent" }]}>
                            <View style={[styles.miniTeeDot, { backgroundColor: t.hex, borderWidth: t.key === "white" ? 1 : 0, borderColor: colors.border }]} />
                            <Text style={[styles.miniTeeLbl, { color: opp2TeeColor === t.key ? colors.primary : colors.mutedForeground, fontFamily: opp2TeeColor === t.key ? "Inter_700Bold" : "Inter_400Regular" }]}>{t.label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </>
                  ) : (
                    <TouchableOpacity onPress={() => openPicker("opp2")} style={[styles.addPlayerBtn, { borderColor: colors.border }]}>
                      <Ionicons name="person-add-outline" size={17} color={colors.mutedForeground} />
                      <Text style={[styles.addPlayerTxt, { color: colors.mutedForeground }]}>
                        {isBetterball ? "Add 2nd Opponent" : "Add 2nd Player to Mark For"}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </Section>
              )}

            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Sticky Start Button */}
      {selectedClub && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16, backgroundColor: colors.background }]}>
          <TouchableOpacity
            onPress={onStartRound}
            disabled={submitting || !format}
            style={[styles.startBtn, { backgroundColor: (submitting || !format) ? colors.muted : colors.primary }]}
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

      {/* ── Player Picker Modal ── */}
      <Modal
        visible={pickerTarget != null}
        animationType="slide"
        transparent
        onRequestClose={() => setPickerTarget(null)}
      >
        <View style={styles.pickerOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setPickerTarget(null)} />
          <View style={[styles.pickerSheet, { backgroundColor: colors.card }]}>
            <View style={[styles.pickerHandle, { backgroundColor: colors.border }]} />
            {/* Header */}
            <View style={styles.pickerHeader}>
              <Text style={[styles.pickerTitle, { color: colors.foreground }]}>
                {guestMode ? "Add Guest" : `Add ${
                  pickerTarget === "partner" ? "Partner"
                  : pickerTarget === "opp1" ? (isBetterball ? "Opponent" : "Player to Mark For")
                  : isBetterball ? "2nd Opponent" : "2nd Player to Mark For"
                }`}
              </Text>
              <TouchableOpacity onPress={() => setPickerTarget(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            {!guestMode ? (
              <>
                {/* Search input */}
                <View style={[styles.searchRow, { borderColor: colors.border, backgroundColor: colors.background, marginBottom: 4 }]}>
                  <Ionicons name="search" size={18} color={colors.mutedForeground} />
                  <TextInput
                    value={playerSearchQ}
                    onChangeText={setPlayerSearchQ}
                    placeholder="Search by name..."
                    placeholderTextColor={colors.mutedForeground}
                    style={[styles.searchInput, { color: colors.foreground }]}
                    autoFocus
                    autoCorrect={false}
                  />
                  {playerSearchLoading && <ActivityIndicator size="small" color={colors.primary} />}
                </View>

                {/* TapIn results */}
                {playerResults.map(p => (
                  <TouchableOpacity
                    key={p.id}
                    disabled={!!p.isMe}
                    onPress={() => !p.isMe && selectCasualPlayer({ userId: p.id, name: p.name, hcp: String(p.handicap != null ? Math.round(Number(p.handicap)) : 0) })}
                    style={[styles.clubRow, { borderBottomColor: colors.border, opacity: p.isMe ? 0.5 : 1 }]}
                  >
                    <View style={[styles.clubIcon, { backgroundColor: p.isMe ? colors.mutedForeground + "20" : colors.primary + "20" }]}>
                      <Ionicons name="person" size={16} color={p.isMe ? colors.mutedForeground : colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={[styles.clubName, { color: colors.foreground }]}>{p.name}</Text>
                        {p.isMe && (
                          <View style={{ backgroundColor: colors.mutedForeground + "30", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                            <Text style={{ fontSize: 10, color: colors.mutedForeground, fontWeight: "600" }}>YOU</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.clubLocation, { color: colors.mutedForeground }]}>
                        {p.isMe ? "Can't add yourself" : `WHS Index: ${p.handicap != null ? p.handicap : "—"}`}
                      </Text>
                    </View>
                    {!p.isMe && <Ionicons name="add-circle-outline" size={22} color={colors.primary} />}
                  </TouchableOpacity>
                ))}

                {playerSearchQ.length >= 2 && !playerSearchLoading && playerResults.length === 0 && (
                  <Text style={[styles.noResults, { color: colors.mutedForeground }]}>No TapIn players found.</Text>
                )}

                {/* Add as Guest button */}
                <TouchableOpacity
                  onPress={() => { setGuestMode(true); setGuestName(playerSearchQ); }}
                  style={[styles.guestAddBtn, { borderColor: colors.border }]}
                >
                  <Ionicons name="person-add-outline" size={17} color={colors.mutedForeground} />
                  <Text style={[styles.guestAddTxt, { color: colors.mutedForeground }]}>
                    {playerSearchQ.trim() ? `Add "${playerSearchQ.trim()}" as Guest` : "Add as Guest (not on TapIn)"}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              /* Guest form */
              <View style={{ gap: 14 }}>
                <View>
                  <Text style={[styles.fieldLabel, { color: colors.foreground, marginBottom: 8 }]}>Guest Name</Text>
                  <TextInput
                    value={guestName}
                    onChangeText={setGuestName}
                    placeholder="Full name"
                    placeholderTextColor={colors.mutedForeground}
                    style={[styles.guestNameInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.foreground }]}
                    autoFocus
                    autoCorrect={false}
                  />
                </View>
                <View>
                  <Text style={[styles.fieldLabel, { color: colors.foreground, marginBottom: 8 }]}>Course Handicap</Text>
                  <View style={[styles.stepperRow, { borderColor: colors.border, backgroundColor: colors.background }]}>
                    <TouchableOpacity onPress={() => { Haptics.selectionAsync(); setGuestHcp(v => String(Math.max(0, parseInt(v || "0") - 1))); }} style={[styles.stepperBtn, { borderColor: colors.border }]}>
                      <Text style={[styles.stepperBtnText, { color: colors.foreground }]}>−</Text>
                    </TouchableOpacity>
                    <TextInput value={guestHcp} onChangeText={v => { const n = parseInt(v.replace(/\D/g, "") || "0"); if (n <= 54) setGuestHcp(String(n)); }} style={[styles.stepperValue, { color: colors.primary }]} keyboardType="number-pad" textAlign="center" maxLength={2} />
                    <TouchableOpacity onPress={() => { Haptics.selectionAsync(); setGuestHcp(v => String(Math.min(54, parseInt(v || "0") + 1))); }} style={[styles.stepperBtn, { borderColor: colors.primary, backgroundColor: colors.primary }]}>
                      <Text style={[styles.stepperBtnText, { color: "#fff" }]}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <TouchableOpacity onPress={() => setGuestMode(false)} style={[styles.guestCancelBtn, { borderColor: colors.border }]}>
                    <Text style={[styles.guestCancelTxt, { color: colors.mutedForeground }]}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      if (!guestName.trim()) { Alert.alert("Name Required", "Please enter the guest's name."); return; }
                      selectCasualPlayer({ name: guestName.trim(), hcp: guestHcp });
                    }}
                    style={[styles.guestConfirmBtn, { backgroundColor: colors.primary }]}
                  >
                    <Text style={styles.guestConfirmTxt}>Add Guest</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  subHeader: {
    flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 12,
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
  nearbyHeader: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingVertical: 6, borderBottomWidth: 1, marginBottom: 2,
  },
  nearbyLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.3 },
  distanceBadge: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginLeft: 8 },
  noResults: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", paddingVertical: 16 },
  linkedTournament: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderRadius: 12, borderWidth: 1.5, padding: 12,
  },
  trophyIcon: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  tournamentName: { fontSize: 14, fontFamily: "Inter_700Bold" },
  tournamentDate: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  opponentBanner: {
    flexDirection: "row", alignItems: "center", gap: 10,
    marginTop: 8, borderRadius: 12, borderWidth: 1.5, padding: 12,
  },
  opponentAvatar: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  opponentVsLabel: { fontSize: 9, fontFamily: "Inter_700Bold", color: "#7c3aed", letterSpacing: 1 },
  opponentName: { fontSize: 15, fontFamily: "Inter_700Bold", marginTop: 1 },
  opponentRound: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  tournamentToggle: {
    flexDirection: "row", alignItems: "center", gap: 10, padding: 12,
    borderRadius: 12, borderWidth: 1.5,
  },
  tournamentToggleText: { flex: 1, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  tournamentDropdown: {
    borderWidth: 1.5, borderTopWidth: 0, borderBottomLeftRadius: 12, borderBottomRightRadius: 12,
    overflow: "hidden", marginTop: -4,
  },
  tournamentRow: {
    flexDirection: "row", alignItems: "center", gap: 10, padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  noTournaments: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18, padding: 12 },
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
    flexDirection: "row", alignItems: "center",
    borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 8, paddingVertical: 4,
  },
  stepperBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  stepperBtnText: { fontSize: 22, fontFamily: "Inter_400Regular", lineHeight: 28 },
  stepperValue: { fontSize: 36, fontFamily: "Inter_700Bold", flex: 1, textAlign: "center", minWidth: 0 },
  footer: {
    paddingHorizontal: 16, paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#e5e7eb",
  },
  startBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, borderRadius: 16, paddingVertical: 16,
  },
  startBtnText: { fontSize: 17, fontFamily: "Inter_700Bold", color: "#fff" },

  // Casual players section
  casualDesc: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17, marginBottom: 10 },
  casualSubhead: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.6, marginBottom: 8, marginTop: 2 },
  casualCard: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderRadius: 12, borderWidth: 1.5, padding: 10, marginBottom: 8,
  },
  casualAvatar: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  casualCardName: { flex: 1, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  guestBadge: { backgroundColor: "#6b728025", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  guestBadgeTxt: { fontSize: 9, fontFamily: "Inter_700Bold", color: "#6b7280" },
  miniStepper: {
    flexDirection: "row", alignItems: "center",
    borderRadius: 8, borderWidth: 1.5, overflow: "hidden",
  },
  miniStepBtn: { width: 30, height: 30, alignItems: "center", justifyContent: "center" },
  miniStepTxt: { fontSize: 18, fontFamily: "Inter_400Regular", lineHeight: 24 },
  miniStepVal: { fontSize: 16, fontFamily: "Inter_700Bold", width: 32, textAlign: "center" },
  addPlayerBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    borderRadius: 12, borderWidth: 1.5, borderStyle: "dashed", paddingVertical: 12, marginBottom: 8,
  },
  addPlayerTxt: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  miniTeeRow: { flexDirection: "row", gap: 6, marginTop: 6, marginBottom: 8, flexWrap: "wrap" },
  miniTeeBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1.5 },
  miniTeeDot: { width: 12, height: 12, borderRadius: 6 },
  miniTeeLbl: { fontSize: 11 },

  // Player picker modal
  pickerOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  pickerSheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 36, gap: 0,
    maxHeight: "80%",
  },
  pickerHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  pickerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  pickerTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  guestAddBtn: {
    flexDirection: "row", alignItems: "center", gap: 10,
    padding: 14, borderRadius: 12, borderWidth: 1.5, borderStyle: "dashed", marginTop: 8,
  },
  guestAddTxt: { fontSize: 13, fontFamily: "Inter_600SemiBold", flex: 1 },
  guestNameInput: {
    borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, fontFamily: "Inter_400Regular",
  },
  guestCancelBtn: {
    flex: 1, alignItems: "center", justifyContent: "center",
    borderRadius: 12, borderWidth: 1.5, paddingVertical: 14,
  },
  guestCancelTxt: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  guestConfirmBtn: {
    flex: 2, alignItems: "center", justifyContent: "center",
    borderRadius: 12, paddingVertical: 14,
  },
  guestConfirmTxt: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
});
