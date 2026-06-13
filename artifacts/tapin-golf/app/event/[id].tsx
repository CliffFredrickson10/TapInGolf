import { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, RefreshControl, TextInput, Image, Modal,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { useColors } from "@/hooks/useColors";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Division {
  label: string; key: string;
  min_hcp: number; max_hcp: number;
  format: string; tees: string;
}

interface UserRegistration {
  status: string; division: string | null;
  frozen_handicap: number | null;
  payment_status: string; payment_url: string | null;
  team_id: number | null; team_name: string | null;
  teammates: Array<{ user_id: number; name: string }> | null;
}

interface PartnerResult {
  id: number; name: string; handicap_index: number | null;
  has_partner: boolean; already_registered: boolean;
}

interface EventDetail {
  id: number; name: string; description: string | null;
  club_id: number; club_name: string;
  event_date: string; end_date: string | null;
  start_time: string | null;
  event_type: string; format: string; restriction: string;
  image_url: string | null;
  entry_fee: number | null; max_participants: number | null;
  status: string; approved_count: number;
  divisions: Division[];
  entries_open: string | null; entries_close: string | null;
  ballot: number; scoring_enabled: number; payment_required: number; entries_required: number;
  use_tiered_pricing: number; allow_wallet: number; allow_prepaid: number; allow_voucher: number;
  rounds: number; holes: number;
  shotgun_start: number;
  additional_fees: { name: string; amount: number }[] | null;
  user_registration: UserRegistration | null;
  user_eligible: boolean | null;
  user_division_preview: string | null;
  team_format: "pair" | "group" | "individual";
}

interface DrawEntry {
  user_id: number; user_name: string;
  tee_date: string; tee_time: string; draw_group: number; starting_tee: number;
  division: string | null; frozen_handicap: number | null;
  seed_metric: string | null; seed_value: number | null;
}

interface LeaderboardEntry {
  division: string;
  players: Array<{
    user_id: number; player_name: string; position: number;
    gross: number | null; net: number | null; points: number | null;
    frozen_handicap: number | null; division: string; verified: number;
  }>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const FORMAT_LABELS: Record<string, string> = {
  // Individual formats
  gross_stroke_play: "Gross Stroke Play", net_stroke_play: "Net Stroke Play",
  singles_match_play: "Singles Match Play", individual_stableford: "Individual Stableford",
  modified_stableford: "Individual Modified Stableford", par_bogey: "Par / Bogey",
  maximum_score: "Maximum Score", chairman: "Chairman (The Perch)",
  individual_bonus_bogey: "Individual Bonus Bogey", individual_par: "Individual Par",
  individual_bogey: "Individual Bogey", eclectic: "Eclectic (Multi-Round)",
  // Legacy keys
  stroke_play: "Stroke Play", stableford: "Stableford", match_play: "Match Play",
  fourball: "Fourball", scramble: "Scramble", alliance: "Alliance", bogey: "Bogey",
  // Betterball / Two-Player Team
  fourball_gross_betterball: "Four-Ball Gross Betterball",
  fourball_net_betterball: "Four-Ball Net Betterball",
  betterball_match_play: "Betterball Match Play",
  fourball_stableford: "Four-Ball Stableford",
  shamble: "Shamble", best_ball_aggregate: "Best Ball Aggregate",
  high_low: "High-Low", daytona: "Daytona (Las Vegas)",
  low_ball_total: "Low Ball / Total Score", the_ghost: "The Ghost",
  betterball_bonus_bogey: "Betterball Bonus Bogey",
  pinehurst_points: "Multiplication Betterball (Pinehurst)",
  // Full-Group Team
  american_scramble: "American Scramble",
  other: "Other",
};

// Mirror of the server-side teamSize() — used as a local fallback if team_format
// is not returned by the API (e.g. stale cache or older API version)
const PAIR_FORMATS_LOCAL = new Set([
  "betterball","fourball","fourball_gross_betterball","fourball_net_betterball",
  "betterball_match_play","fourball_stableford","shamble","best_ball_aggregate",
  "high_low","daytona","low_ball_total","the_ghost","betterball_bonus_bogey","pinehurst_points",
]);
const GROUP_FORMATS_LOCAL = new Set(["american_scramble","scramble"]);
function localTeamSize(fmt: string): "pair" | "group" | "individual" {
  if (PAIR_FORMATS_LOCAL.has(fmt)) return "pair";
  if (GROUP_FORMATS_LOCAL.has(fmt)) return "group";
  return "individual";
}
const RESTRICT_LABELS: Record<string, string> = {
  open: "Open", members_only: "Members Only", invitation_only: "Invite Only", whs_players_only: "WHS Index Players Only",
};

function fmtDate(d: string | null | undefined) {
  if (!d) return "";
  try {
    return new Date(String(d).slice(0, 10) + "T00:00:00").toLocaleDateString("en-ZA", {
      day: "numeric", month: "short", year: "numeric",
    });
  } catch { return d; }
}

// ─── Score Field ──────────────────────────────────────────────────────────────

function ScoreField({
  label, value, onChange, colors,
}: { label: string; value: string; onChange: (v: string) => void; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 11, color: colors.mutedForeground, marginBottom: 4, textAlign: "center" }}>{label}</Text>
      <TextInput
        style={{
          borderWidth: 1, borderColor: colors.border, borderRadius: 8,
          paddingHorizontal: 8, paddingVertical: 9, fontSize: 16, fontWeight: "600",
          color: colors.foreground, backgroundColor: colors.background, textAlign: "center",
        }}
        keyboardType="numeric" value={value} onChangeText={onChange} placeholder="—"
        placeholderTextColor={colors.mutedForeground}
      />
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function EventDetailScreen() {
  const { id, tab } = useLocalSearchParams<{ id: string; tab?: string }>();
  const { user } = useAuth();
  const colors   = useColors();

  const [event, setEvent]   = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [draw, setDraw]       = useState<DrawEntry[]>([]);
  const [drawLoaded, setDrawLoaded] = useState(false);
  const [drawRound, setDrawRound]   = useState(1);

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [lbLoaded, setLbLoaded] = useState(false);

  const validTabs = ["info", "draw", "scores", "submit"] as const;
  const [activeTab, setActiveTab] = useState<"info" | "draw" | "scores" | "submit">(
    validTabs.includes(tab as any) ? (tab as "info" | "draw" | "scores" | "submit") : "info"
  );

  // Registration / payment state
  const [registering, setRegistering]     = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [paying, setPaying]               = useState(false);
  const [payError, setPayError]           = useState<string | null>(null);
  const [voucherCode, setVoucherCode] = useState("");

  // Score submission — one card per round: { gross, net, points }
  const [roundScores, setRoundScores] = useState<Record<number, { gross: string; net: string; points: string }>>({});
  const [submittingScore, setSubmittingScore] = useState(false);
  const [confirmScoreVisible, setConfirmScoreVisible] = useState(false);
  const [myScores, setMyScores] = useState<Record<number, { gross: number | null; net: number | null; points: number | null }>>({});
  const [myScoresLoaded, setMyScoresLoaded] = useState(false);

  // Partner picker (betterball / team formats)
  const [partnerQuery, setPartnerQuery] = useState("");
  const [partnerResults, setPartnerResults] = useState<PartnerResult[]>([]);
  const [selectedPartner, setSelectedPartner] = useState<PartnerResult | null>(null);
  const [selectedGroupPartners, setSelectedGroupPartners] = useState<PartnerResult[]>([]);
  const [partnerSearching, setPartnerSearching] = useState(false);

  // ── Loaders ────────────────────────────────────────────────────────────────

  const loadEvent = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const data = await apiFetch(`/events/${id}`, user?.token);
      setEvent(data);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id, user?.token]);

  const loadDraw = useCallback(async () => {
    if (!event || drawLoaded) return;
    try {
      const data = await apiFetch(`/events/${event.id}/draw`, user?.token);
      setDraw(Array.isArray(data) ? data : []);
      setDrawLoaded(true);
    } catch {
      setDrawLoaded(true);
    }
  }, [event, drawLoaded]);

  const loadLeaderboard = useCallback(async () => {
    if (!event) return;
    try {
      const data = await apiFetch(`/events/${event.id}/leaderboard`, user?.token);
      setLeaderboard(data.leaderboard ?? []);
      setLbLoaded(true);
    } catch {}
  }, [event]);

  useEffect(() => { loadEvent(); }, [loadEvent]);

  useEffect(() => {
    if (activeTab === "draw" && !drawLoaded) loadDraw();
  }, [activeTab, drawLoaded, loadDraw]);

  useEffect(() => {
    if (activeTab === "scores") loadLeaderboard();
  }, [activeTab, lbLoaded]);

  useEffect(() => {
    if (activeTab === "submit" && !myScoresLoaded && user && event) {
      apiFetch(`/events/${event.id}/my-scores`, user.token)
        .then((res: any) => {
          const map: Record<number, any> = {};
          for (const s of res.scores ?? []) map[s.round] = s;
          setMyScores(map);
          setMyScoresLoaded(true);
        })
        .catch(() => setMyScoresLoaded(true));
    }
  }, [activeTab, myScoresLoaded, user, event]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const searchPartners = async (q: string) => {
    if (!user || !event || q.length < 2) { setPartnerResults([]); return; }
    setPartnerSearching(true);
    try {
      const res = await apiFetch(`/events/${event.id}/partner-search?q=${encodeURIComponent(q)}`, user.token);
      setPartnerResults(res.players ?? []);
    } catch { setPartnerResults([]); }
    finally { setPartnerSearching(false); }
  };

  const handleRegister = async () => {
    if (!user) { router.push("/(auth)/login"); return; }
    // Compute team format with local fallback so enforcement never depends solely
    // on the API having returned team_format (guards race conditions on first load)
    const tf = event?.team_format ?? localTeamSize(event?.format ?? "");
    if (tf === "pair" && !selectedPartner) {
      setRegisterError("A partner is required for this team format event. Search for your playing partner above.");
      return;
    }
    if (tf === "group" && selectedGroupPartners.length === 0) {
      setRegisterError("At least one teammate is required for this team format event. Search for your playing partners above.");
      return;
    }
    setRegistering(true);
    setRegisterError(null);
    try {
      const body: Record<string, any> = {};
      if (selectedPartner) body.partner_id = selectedPartner.id;
      if (selectedGroupPartners.length > 0) body.partner_ids = selectedGroupPartners.map(p => p.id);
      const res = await apiFetch(`/events/${id}/register`, user.token, { method: "POST", body: JSON.stringify(body) });
      await loadEvent(true);
      const msg = res.status === "pending"
        ? `Your entry has been submitted. The club will review and confirm your spot.`
        : `You're registered!${res.division ? ` Auto-assigned to ${res.division} Division (HCP ${res.frozen_handicap ?? "N/A"}).` : ""}`;
      Alert.alert("Entry Submitted", msg);
    } catch (e: any) {
      setRegisterError(e.message ?? "Registration failed. Please try again.");
    } finally { setRegistering(false); }
  };

  const handlePay = async (method: string, vcode?: string) => {
    if (!user || !event) return;
    setPaying(true);
    setPayError(null);
    try {
      const res = await apiFetch(`/events/${event.id}/pay`, user.token, {
        method: "POST",
        body: JSON.stringify({ payment_method: method, voucher_code: vcode || undefined }),
      });
      if (res.payment_url) {
        router.push({ pathname: "/booking/payment", params: { payment_url: res.payment_url, type: "event" } });
      } else if (res.paid) {
        await loadEvent(true);
      }
    } catch (e: any) {
      setPayError(e.message ?? "Payment failed. Please try again.");
    } finally { setPaying(false); }
  };

  const setRoundField = (round: number, field: "gross" | "net" | "points", value: string) => {
    setRoundScores(prev => ({
      ...prev,
      [round]: { gross: "", net: "", points: "", ...prev[round], [field]: value },
    }));
  };

  const doSubmitScore = async () => {
    if (!user || !event) return;
    const rounds = event.rounds ?? 1;
    const toSubmit = Array.from({ length: rounds }, (_, i) => i + 1).filter(r => {
      const s = roundScores[r];
      return s && (s.gross || s.net || s.points);
    });
    if (toSubmit.length === 0) {
      Alert.alert("No scores entered", "Enter at least one score field.");
      return;
    }
    setSubmittingScore(true);
    try {
      for (const r of toSubmit) {
        const s = roundScores[r];
        await apiFetch(`/events/${event.id}/scores`, user.token, {
          method: "POST",
          body: JSON.stringify({
            round: r,
            gross:  s.gross  ? Number(s.gross)  : undefined,
            net:    s.net    ? Number(s.net)    : undefined,
            points: s.points ? Number(s.points) : undefined,
          }),
        });
      }
      Alert.alert("Score Submitted", "Your scores have been submitted and are awaiting verification.");
      setRoundScores({});
      setActiveTab("scores");
      loadLeaderboard();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally { setSubmittingScore(false); }
  };

  const handleSubmitScore = () => {
    if (!user || !event) return;
    const rounds = event.rounds ?? 1;
    const hasScores = Array.from({ length: rounds }, (_, i) => i + 1).some(r => {
      const s = roundScores[r];
      return s && (s.gross || s.net || s.points);
    });
    if (!hasScores) { doSubmitScore(); return; }
    setConfirmScoreVisible(true);
  };

  // ── UI ─────────────────────────────────────────────────────────────────────

  if (loading || !event) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const reg      = event.user_registration;
  const division = reg?.division ?? event.user_division_preview;

  // team_format is always returned by the API now; local fallback guards against
  // stale caches or a first load that races before the auth token is attached
  const teamFormat: "pair" | "group" | "individual" =
    event.team_format ?? localTeamSize(event.format ?? "");

  // What action should the CTA show?
  const entriesRequired = event.entries_required !== 0; // default true for existing events
  // Team-format events always need a registration step to link partners — open_all
  // ("book a tee time directly") only applies to individual-format events.
  const isTeamFormat = teamFormat !== "individual";
  const ctaState = !user
    ? "login"
    : (!entriesRequired && !isTeamFormat)
    ? "open_all"                // no enrollment step — open to all (individual formats only)
    : !reg
    ? (event.status === "active" ? "register" : "closed")
    : reg.status === "pending"
    ? "pending"
    : reg.status === "rejected"
    ? "rejected"
    : event.payment_required && reg.payment_status !== "paid"
    ? "pay"
    : "confirmed";

  const today = new Date().toISOString().split("T")[0];
  const entriesOpen   = !event.entries_open   || today >= String(event.entries_open).slice(0, 10);
  const entriesOpen2  = !event.entries_close  || today <= String(event.entries_close).slice(0, 10);
  const canRegister   = ctaState === "register" && entriesOpen && entriesOpen2;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>

      {/* Score submission confirmation modal */}
      <Modal transparent animationType="fade" visible={confirmScoreVisible} onRequestClose={() => setConfirmScoreVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Confirm Score Submission</Text>
            <Text style={[styles.modalBody, { color: colors.mutedForeground }]}>
              Submitted scores <Text style={{ fontWeight: "700", color: colors.foreground }}>cannot be edited or deleted</Text> once submitted.{"\n\n"}
              By submitting you confirm that this score is correct and has been verified by your marker.{"\n\n"}
              <Text style={{ color: "#c0392b", fontWeight: "600" }}>Incorrect scores may result in disqualification.</Text>
            </Text>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.modalBtn, { borderColor: colors.border, borderWidth: 1 }]} onPress={() => setConfirmScoreVisible(false)}>
                <Text style={[styles.modalBtnText, { color: colors.foreground }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: "#c0392b" }]}
                onPress={() => { setConfirmScoreVisible(false); doSubmitScore(); }}
              >
                <Text style={[styles.modalBtnText, { color: "#fff" }]}>Submit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.primary }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={2}>{event.name}</Text>
      </View>

      {/* Tabs */}
      <View style={[styles.tabBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {(["info","draw","scores","submit"] as const).map(t => (
          <TouchableOpacity key={t} style={[styles.tab, activeTab === t && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]} onPress={() => setActiveTab(t)}>
            <Text style={[styles.tabText, { color: activeTab === t ? colors.primary : colors.mutedForeground }]}>
              {t === "info" ? "Info" : t === "draw" ? "Draw" : t === "scores" ? "Leaderboard" : "Submit Score"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadEvent(true); }} />}
      >

        {/* ── INFO TAB ───────────────────────────────────────────────────────── */}
        {activeTab === "info" && (
          <>
            {/* Banner image */}
            {event.image_url ? (
              <Image
                source={{ uri: event.image_url }}
                style={{ width: "100%", height: 180, borderRadius: 12, marginBottom: 12 }}
                resizeMode="cover"
              />
            ) : null}

            {/* Event meta card */}
            <View style={[styles.metaCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.metaRow}>
                <Ionicons name="calendar-outline" size={15} color={colors.mutedForeground} />
                <Text style={[styles.metaText, { color: colors.foreground }]}>
                  {fmtDate(event.event_date)}{event.end_date ? ` – ${fmtDate(event.end_date)}` : ""}
                  {event.start_time ? ` · ${String(event.start_time).slice(0, 5)}` : ""}
                </Text>
              </View>
              <View style={styles.metaRow}>
                <Ionicons name="golf-outline" size={15} color={colors.mutedForeground} />
                <Text style={[styles.metaText, { color: colors.foreground }]}>
                  {FORMAT_LABELS[event.format] ?? event.format} · {event.rounds} round{event.rounds !== 1 ? "s" : ""}
                </Text>
              </View>
              <View style={styles.metaRow}>
                <Ionicons name="people-outline" size={15} color={colors.mutedForeground} />
                <Text style={[styles.metaText, { color: colors.foreground }]}>
                  {RESTRICT_LABELS[event.restriction] ?? event.restriction}
                  {event.max_participants ? ` · Max ${event.max_participants} players` : ""}
                  {" · "}{event.approved_count} confirmed
                </Text>
              </View>
              {(event.entry_fee != null || (event.additional_fees && event.additional_fees.length > 0)) && (
                <View style={styles.metaRow}>
                  <Ionicons name="card-outline" size={15} color={colors.mutedForeground} />
                  <View style={{ flex: 1 }}>
                    {event.entry_fee != null && (
                      <Text style={[styles.metaText, { color: colors.foreground }]}>
                        {event.use_tiered_pricing ? "Greens fee (club rate applies)" : `Entry fee: R${event.entry_fee.toFixed(2)}`}
                        {event.payment_required ? " · payment via app" : ""}
                      </Text>
                    )}
                    {(event.additional_fees ?? []).map((f, i) => (
                      <Text key={i} style={[styles.metaText, { color: colors.foreground }]}>
                        {`+ ${f.name}: R${f.amount.toFixed(2)}`}
                      </Text>
                    ))}
                  </View>
                </View>
              )}
              {(event.entries_open || event.entries_close) && (
                <View style={styles.metaRow}>
                  <Ionicons name="time-outline" size={15} color={colors.mutedForeground} />
                  <Text style={[styles.metaText, { color: colors.foreground }]}>
                    Entries{event.entries_open ? ` open ${fmtDate(event.entries_open)}` : ""}
                    {event.entries_close ? ` · close ${fmtDate(event.entries_close)}` : ""}
                  </Text>
                </View>
              )}
              {event.ballot ? (
                <View style={styles.metaRow}>
                  <Ionicons name="shuffle-outline" size={15} color={colors.mutedForeground} />
                  <Text style={[styles.metaText, { color: colors.mutedForeground }]}>Ballot if oversubscribed</Text>
                </View>
              ) : null}
            </View>

            {event.description ? (
              <View style={[styles.descCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>About this event</Text>
                <Text style={[styles.descText, { color: colors.mutedForeground }]}>{event.description}</Text>
              </View>
            ) : null}

            {/* Divisions */}
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Divisions</Text>
            <Text style={[styles.sectionSub, { color: colors.mutedForeground }]}>
              Division is auto-assigned from your HNA Handicap Index at time of registration.
            </Text>
            {event.divisions.map(d => (
              <View key={d.key} style={[styles.divisionCard, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: d.key === "A" ? colors.primary : d.key === "B" ? colors.accent : "#546e7a" }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.divLabel, { color: colors.foreground }]}>{d.label}</Text>
                  <Text style={[styles.divSub, { color: colors.mutedForeground }]}>
                    HCP {d.min_hcp} – {d.max_hcp} · {FORMAT_LABELS[d.format] ?? d.format} · {d.tees} tees
                  </Text>
                </View>
                {division === d.key && (
                  <View style={[styles.yourDivBadge, { backgroundColor: colors.primary + "18" }]}>
                    <Text style={[styles.yourDivText, { color: colors.primary }]}>Your division</Text>
                  </View>
                )}
              </View>
            ))}

            {/* Registration status / CTA */}
            <View style={[styles.ctaCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {ctaState === "open_all" && (
                <>
                  <Text style={[styles.ctaNote, { color: colors.mutedForeground }]}>
                    No formal entry needed — book a tee time at the club to secure your spot.
                  </Text>
                  <TouchableOpacity
                    style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                    onPress={() => router.push({
                      pathname: "/tee-times",
                      params: {
                        club_id:    String(event.club_id),
                        club_name:  event.club_name,
                        date:       String(event.event_date).slice(0, 10),
                        event_id:   String(event.id),
                        event_name: event.name,
                        event_holes: String(event.holes ?? 18),
                      },
                    })}
                  >
                    <Text style={styles.primaryBtnText}>Book Your Spot</Text>
                  </TouchableOpacity>
                </>
              )}
              {ctaState === "login" && (
                <>
                  <Text style={[styles.ctaTitle, { color: colors.foreground }]}>Sign in to enter</Text>
                  <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={() => router.push("/(auth)/login")}>
                    <Text style={styles.primaryBtnText}>Sign In</Text>
                  </TouchableOpacity>
                </>
              )}
              {ctaState === "register" && !canRegister && (
                <Text style={[styles.ctaNote, { color: colors.mutedForeground }]}>
                  {!entriesOpen ? `Entries open ${fmtDate(event.entries_open)}` : "Entries are closed"}
                </Text>
              )}
              {ctaState === "register" && canRegister && (
                <>
                  {division && (
                    <Text style={[styles.ctaNote, { color: colors.mutedForeground }]}>
                      Based on your handicap you'll be placed in <Text style={{ color: colors.primary, fontWeight: "700" }}>{division} Division</Text>
                    </Text>
                  )}

                  {/* Partner / team picker — required for all team format events */}
                  {teamFormat !== "individual" && (
                    <View style={{ marginBottom: 8 }}>
                      {/* Header */}
                      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6, gap: 6 }}>
                        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>
                          {teamFormat === "pair" ? "Select your partner" : "Select your teammates"}
                        </Text>
                        <View style={{ backgroundColor: "#dc2626", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                          <Text style={{ fontSize: 10, fontWeight: "700", color: "#fff" }}>REQUIRED</Text>
                        </View>
                      </View>
                      <Text style={{ fontSize: 11, color: colors.mutedForeground, marginBottom: 8 }}>
                        {teamFormat === "pair"
                          ? "This is a Betterball/team format — you must enter with a partner. Your partner must have an account on TapIn Golf."
                          : "This is a team format — you must enter with at least one teammate. Teammates must have accounts on TapIn Golf."}
                      </Text>

                      {/* PAIR: single partner select */}
                      {teamFormat === "pair" && (
                        <>
                          {selectedPartner ? (
                            <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.primary + "18", borderRadius: 8, padding: 10, gap: 10, marginBottom: 4 }}>
                              <Ionicons name="people-outline" size={16} color={colors.primary} />
                              <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color: colors.primary }}>{selectedPartner.name}</Text>
                              <TouchableOpacity onPress={() => { setSelectedPartner(null); setPartnerQuery(""); }}>
                                <Ionicons name="close-circle" size={18} color={colors.mutedForeground} />
                              </TouchableOpacity>
                            </View>
                          ) : (
                            <>
                              <TextInput
                                style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: colors.foreground, backgroundColor: colors.card }}
                                placeholder="Search by name…"
                                placeholderTextColor={colors.mutedForeground}
                                value={partnerQuery}
                                onChangeText={q => { setPartnerQuery(q); searchPartners(q); }}
                              />
                              {partnerSearching && <Text style={{ fontSize: 11, color: colors.mutedForeground, marginTop: 4 }}>Searching…</Text>}
                              {partnerResults.map(p => (
                                <TouchableOpacity key={p.id}
                                  style={{ flexDirection: "row", alignItems: "center", padding: 10, borderBottomWidth: 1, borderColor: colors.border, gap: 8 }}
                                  onPress={() => { setSelectedPartner(p); setPartnerResults([]); setPartnerQuery(""); }}
                                >
                                  <Ionicons name="person-outline" size={14} color={colors.mutedForeground} />
                                  <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: 13, color: colors.foreground }}>{p.name}{p.handicap_index != null ? ` (HCP ${p.handicap_index})` : ""}</Text>
                                    {p.already_registered
                                      ? <Text style={{ fontSize: 10, color: "#16a34a" }}>Already entered</Text>
                                      : <Text style={{ fontSize: 10, color: colors.mutedForeground }}>Will be auto-entered as your partner</Text>
                                    }
                                  </View>
                                  {p.has_partner && <Text style={{ fontSize: 10, color: "#f59e0b" }}>Has partner</Text>}
                                </TouchableOpacity>
                              ))}
                            </>
                          )}
                        </>
                      )}

                      {/* GROUP: multi-partner select (up to 3 teammates for a 4-ball) */}
                      {teamFormat === "group" && (
                        <>
                          {selectedGroupPartners.map(p => (
                            <View key={p.id} style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.primary + "18", borderRadius: 8, padding: 10, gap: 10, marginBottom: 4 }}>
                              <Ionicons name="person-outline" size={16} color={colors.primary} />
                              <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color: colors.primary }}>{p.name}{p.handicap_index != null ? ` · HCP ${p.handicap_index}` : ""}</Text>
                              <TouchableOpacity onPress={() => setSelectedGroupPartners(prev => prev.filter(g => g.id !== p.id))}>
                                <Ionicons name="close-circle" size={18} color={colors.mutedForeground} />
                              </TouchableOpacity>
                            </View>
                          ))}
                          {selectedGroupPartners.length < 3 && (
                            <>
                              <TextInput
                                style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: colors.foreground, backgroundColor: colors.card, marginTop: selectedGroupPartners.length > 0 ? 6 : 0 }}
                                placeholder={selectedGroupPartners.length === 0 ? "Search for a teammate…" : "Add another teammate…"}
                                placeholderTextColor={colors.mutedForeground}
                                value={partnerQuery}
                                onChangeText={q => { setPartnerQuery(q); searchPartners(q); }}
                              />
                              {partnerSearching && <Text style={{ fontSize: 11, color: colors.mutedForeground, marginTop: 4 }}>Searching…</Text>}
                              {partnerResults
                                .filter(p => !selectedGroupPartners.find(g => g.id === p.id))
                                .map(p => (
                                  <TouchableOpacity key={p.id}
                                    style={{ flexDirection: "row", alignItems: "center", padding: 10, borderBottomWidth: 1, borderColor: colors.border, gap: 8 }}
                                    onPress={() => { setSelectedGroupPartners(prev => [...prev, p]); setPartnerResults([]); setPartnerQuery(""); }}
                                  >
                                    <Ionicons name="person-add-outline" size={14} color={colors.mutedForeground} />
                                    <Text style={{ flex: 1, fontSize: 13, color: colors.foreground }}>{p.name}{p.handicap_index != null ? ` (HCP ${p.handicap_index})` : ""}</Text>
                                    {p.has_partner && <Text style={{ fontSize: 10, color: "#f59e0b" }}>Has team</Text>}
                                  </TouchableOpacity>
                                ))}
                            </>
                          )}
                        </>
                      )}
                    </View>
                  )}

                  {registerError && (
                    <View style={[styles.inlineError, { backgroundColor: "#fef2f2", borderColor: "#fca5a5" }]}>
                      <Ionicons name="alert-circle-outline" size={15} color="#dc2626" />
                      <Text style={[styles.inlineErrorText, { color: "#dc2626" }]}>{registerError}</Text>
                    </View>
                  )}
                  <TouchableOpacity
                    style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: registering ? 0.7 : 1 }]}
                    onPress={handleRegister}
                    disabled={registering}
                  >
                    {registering ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.primaryBtnText}>Enter This Event</Text>}
                  </TouchableOpacity>
                </>
              )}
              {ctaState === "pending" && (
                <View style={styles.statusRow}>
                  <Ionicons name="time-outline" size={18} color="#f59e0b" />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.ctaTitle, { color: colors.foreground }]}>Entry pending review</Text>
                    <Text style={[styles.ctaNote, { color: colors.mutedForeground }]}>The club is reviewing your entry. You'll be notified once approved.</Text>
                  </View>
                </View>
              )}
              {ctaState === "rejected" && (
                <View style={styles.statusRow}>
                  <Ionicons name="close-circle-outline" size={18} color="#ef4444" />
                  <Text style={[styles.ctaTitle, { color: "#ef4444" }]}>Entry not accepted</Text>
                </View>
              )}
              {ctaState === "pay" && (
                <>
                  <View style={styles.statusRow}>
                    <Ionicons name="checkmark-circle-outline" size={18} color="#22c55e" />
                    <Text style={[styles.ctaTitle, { color: colors.foreground }]}>
                      Spot confirmed — payment required
                    </Text>
                  </View>
                  <Text style={[styles.ctaNote, { color: colors.mutedForeground }]}>
                    {event.use_tiered_pricing
                      ? "Your club rate applies."
                      : `Entry fee: R${event.entry_fee?.toFixed(2)}`}
                    {reg?.division ? `  ·  Division: ${reg.division}` : ""}
                  </Text>

                  {/* Stitch — always available */}
                  <TouchableOpacity
                    style={[styles.primaryBtn, { backgroundColor: colors.accent }]}
                    onPress={() => handlePay("stitch")}
                    disabled={paying}
                  >
                    {paying
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={styles.primaryBtnText}>
                          Pay via Stitch
                          {!event.use_tiered_pricing && event.entry_fee ? ` — R${event.entry_fee.toFixed(2)}` : ""}
                        </Text>
                    }
                  </TouchableOpacity>

                  {/* Wallet */}
                  {!!event.allow_wallet && (
                    <TouchableOpacity
                      style={[styles.outlineBtn, { borderColor: colors.primary }]}
                      onPress={() => handlePay("wallet")}
                      disabled={paying}
                    >
                      <Ionicons name="wallet-outline" size={15} color={colors.primary} />
                      <Text style={[styles.outlineBtnText, { color: colors.primary }]}>Pay with Wallet</Text>
                    </TouchableOpacity>
                  )}

                  {/* Prepaid round */}
                  {!!event.allow_prepaid && (
                    <TouchableOpacity
                      style={[styles.outlineBtn, { borderColor: colors.primary }]}
                      onPress={() => handlePay("prepaid")}
                      disabled={paying}
                    >
                      <Ionicons name="golf-outline" size={15} color={colors.primary} />
                      <Text style={[styles.outlineBtnText, { color: colors.primary }]}>Use Prepaid Round</Text>
                    </TouchableOpacity>
                  )}

                  {/* Voucher */}
                  {!!event.allow_voucher && (
                    <View style={{ gap: 6 }}>
                      <TextInput
                        style={[styles.voucherInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]}
                        placeholder="Voucher code"
                        placeholderTextColor={colors.mutedForeground}
                        value={voucherCode}
                        onChangeText={setVoucherCode}
                        autoCapitalize="characters"
                      />
                      <TouchableOpacity
                        style={[styles.outlineBtn, { borderColor: colors.accent, opacity: voucherCode.trim() ? 1 : 0.45 }]}
                        onPress={() => handlePay("voucher", voucherCode)}
                        disabled={paying || !voucherCode.trim()}
                      >
                        <Ionicons name="pricetag-outline" size={15} color={colors.accent} />
                        <Text style={[styles.outlineBtnText, { color: colors.accent }]}>Apply Voucher</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {payError ? <Text style={{ fontSize: 12, color: colors.destructive, textAlign: "center", marginTop: 4 }}>{payError}</Text> : null}
                </>
              )}
              {ctaState === "confirmed" && (
                <View style={styles.statusRow}>
                  <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.ctaTitle, { color: "#22c55e" }]}>You're in!</Text>
                    {reg?.division && <Text style={[styles.ctaNote, { color: colors.mutedForeground }]}>Division: {reg.division} · HCP {reg.frozen_handicap ?? "N/A"}</Text>}
                  </View>
                </View>
              )}
              {ctaState === "closed" && (
                <Text style={[styles.ctaNote, { color: colors.mutedForeground }]}>This event is no longer accepting entries.</Text>
              )}
            </View>
          </>
        )}

        {/* ── DRAW TAB ───────────────────────────────────────────────────────── */}
        {activeTab === "draw" && (() => {
          const totalRounds = event?.rounds ?? 1;
          const publishedRounds = [...new Set(draw.map(d => d.round))].sort((a, b) => a - b);
          const roundDraw = draw.filter(d => d.round === drawRound);
          return (
            <>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Tee-Time Draw</Text>
              <Text style={[styles.sectionSub, { color: colors.mutedForeground }]}>Published by the club.</Text>

              {/* Round tabs — only shown for multi-round events */}
              {totalRounds > 1 && (
                <View style={{ flexDirection: "row", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                  {Array.from({ length: totalRounds }, (_, i) => i + 1).map(r => {
                    const published = publishedRounds.includes(r);
                    const active = drawRound === r;
                    return (
                      <TouchableOpacity
                        key={r}
                        onPress={() => setDrawRound(r)}
                        style={{
                          paddingHorizontal: 14, paddingVertical: 6,
                          borderRadius: 20, borderWidth: 1.5,
                          borderColor: active ? colors.primary : colors.border,
                          backgroundColor: active ? colors.primary : colors.card,
                          opacity: published ? 1 : 0.5,
                        }}>
                        <Text style={{ fontSize: 12, fontWeight: "600", color: active ? "#fff" : colors.mutedForeground }}>
                          Round {r}{!published ? " —" : ""}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {roundDraw.length > 0 && (() => {
                const metric = roundDraw.find(d => d.seed_metric)?.seed_metric ?? null;
                const label = !metric ? "Random Draw"
                  : metric === "handicap" ? "Seeded Draw · Handicap"
                  : metric === "points"   ? "Seeded Draw · Stableford Points"
                  : metric === "gross"    ? "Seeded Draw · Gross Score"
                  :                        "Seeded Draw · Net Score";
                return (
                  <Text style={{ fontSize: 11, color: colors.mutedForeground, marginBottom: 10, marginTop: -4 }}>
                    {label}
                  </Text>
                );
              })()}

              {roundDraw.length === 0 ? (
                <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Ionicons name="list-outline" size={32} color={colors.mutedForeground} style={{ marginBottom: 8 }} />
                  <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                    {draw.length === 0 ? "Draw not yet published." : `Round ${drawRound} draw not yet published.`}
                  </Text>
                </View>
              ) : event.shotgun_start ? (() => {
                // ── Shotgun draw: grouped by hole, labelled 1st off / 2nd off ──────────
                const byGroup: Record<number, DrawEntry[]> = {};
                for (const d of roundDraw) { (byGroup[d.draw_group] ??= []).push(d); }
                const groupKeys = Object.keys(byGroup).map(Number).sort((a, b) => a - b);
                const byHole: Record<number, number[]> = {};
                for (const gk of groupKeys) {
                  const hole = byGroup[gk]![0]!.starting_tee ?? 1;
                  (byHole[hole] ??= []).push(gk);
                }
                const holeKeys = Object.keys(byHole).map(Number).sort((a, b) => a - b);

                const renderPlayerRow = (p: DrawEntry, i: number) => {
                  const isMe = user && Number(p.user_id) === Number(user.id);
                  return (
                    <View key={i} style={[styles.drawPlayer, isMe && { backgroundColor: colors.primary + "12", marginHorizontal: -4, paddingHorizontal: 4, borderRadius: 6, alignItems: "flex-start", flexDirection: "column" }]}>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                        <Text style={[styles.drawPlayerName, { color: isMe ? colors.primary : colors.foreground }]}>{p.user_name}</Text>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <Text style={[styles.drawPlayerSub, { color: colors.mutedForeground }]}>
                            {p.division ? `${p.division} Div` : ""}{p.frozen_handicap != null ? ` · HCP ${p.frozen_handicap}` : ""}
                          </Text>
                          {p.seed_metric && p.seed_value != null && p.seed_metric !== "handicap" && (
                            <View style={{ backgroundColor: "#fef3c7", borderColor: "#fcd34d", borderWidth: 1, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                              <Text style={{ fontSize: 10, color: "#92400e", fontFamily: "monospace" }}>
                                {p.seed_metric === "points" ? `${p.seed_value} pts` : p.seed_metric === "gross" ? `${p.seed_value} gross` : `${p.seed_value} net`}
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>
                      {isMe && (
                        <View style={{ backgroundColor: colors.primary, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, marginTop: 3 }}>
                          <Text style={{ fontSize: 9, color: "#fff", fontWeight: "700", letterSpacing: 0.5 }}>YOUR TEE TIME</Text>
                        </View>
                      )}
                    </View>
                  );
                };

                return (
                  <>
                    {holeKeys.map(hole => {
                      const holeGroupKeys = (byHole[hole] ?? []).sort((a, b) => a - b);
                      return (
                        <View key={hole} style={{ marginBottom: 14 }}>
                          {/* Hole header */}
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 }}>
                            <View style={{ backgroundColor: colors.primary, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5 }}>
                              <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>🕳️ Hole {hole}</Text>
                            </View>
                            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
                          </View>
                          {/* 1st off / 2nd off groups */}
                          {holeGroupKeys.map((gk, posIdx) => {
                            const grp = byGroup[gk]!;
                            const isFirst = posIdx === 0;
                            const posLabel = isFirst ? "1st off" : "2nd off";
                            const accentColor = isFirst ? colors.primary : "#c8a84b";
                            return (
                              <View key={gk} style={[styles.drawGroup, {
                                backgroundColor: colors.card, borderColor: colors.border,
                                borderLeftWidth: 4, borderLeftColor: accentColor,
                                marginLeft: 8, marginBottom: 8,
                              }]}>
                                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                                  <Text style={{ fontSize: 12, fontWeight: "700", color: accentColor }}>{posLabel}</Text>
                                  <Text style={{ fontSize: 11, color: colors.mutedForeground, marginLeft: 8 }}>
                                    {String(grp[0]!.tee_time).slice(0, 5)}
                                  </Text>
                                  <View style={{ flex: 1 }} />
                                  <Text style={{ fontSize: 11, color: colors.mutedForeground }}>
                                    {grp.length} player{grp.length !== 1 ? "s" : ""}
                                  </Text>
                                </View>
                                {grp.map((p, i) => renderPlayerRow(p, i))}
                              </View>
                            );
                          })}
                        </View>
                      );
                    })}
                  </>
                );
              })() : (
                // ── Regular (non-shotgun) draw ──────────────────────────────────────
                Object.entries(
                  roundDraw.reduce((acc, d) => {
                    const date = fmtDate(d.tee_date);
                    const time = String(d.tee_time).slice(0, 5);
                    const key = `${d.tee_date}__${d.tee_time}__${d.draw_group}__${d.starting_tee}`;
                    if (!acc[key]) acc[key] = { label: `${date} · ${time} · Tee ${d.starting_tee ?? 1} · Group ${d.draw_group}`, players: [] };
                    acc[key].players.push(d);
                    return acc;
                  }, {} as Record<string, { label: string; players: DrawEntry[] }>)
                ).map(([key, { label, players }]) => (
                  <View key={key} style={[styles.drawGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.drawSlotTime, { color: colors.primary }]}>{label}</Text>
                    {players.map((p, i) => {
                      const isMe = user && Number(p.user_id) === Number(user.id);
                      return (
                        <View key={i} style={[styles.drawPlayer, isMe && { backgroundColor: colors.primary + "12", marginHorizontal: -4, paddingHorizontal: 4, borderRadius: 6, alignItems: "flex-start", flexDirection: "column" }]}>
                          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                            <Text style={[styles.drawPlayerName, { color: isMe ? colors.primary : colors.foreground }]}>{p.user_name}</Text>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              <Text style={[styles.drawPlayerSub, { color: colors.mutedForeground }]}>
                                {p.division ? `${p.division} Div` : ""}{p.frozen_handicap != null ? ` · HCP ${p.frozen_handicap}` : ""}
                              </Text>
                              {p.seed_metric && p.seed_value != null && p.seed_metric !== "handicap" && (
                                <View style={{ backgroundColor: "#fef3c7", borderColor: "#fcd34d", borderWidth: 1, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                                  <Text style={{ fontSize: 10, color: "#92400e", fontFamily: "monospace" }}>
                                    {p.seed_metric === "points" ? `${p.seed_value} pts` : p.seed_metric === "gross" ? `${p.seed_value} gross` : `${p.seed_value} net`}
                                  </Text>
                                </View>
                              )}
                            </View>
                          </View>
                          {isMe && (
                            <View style={{ backgroundColor: colors.primary, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, marginTop: 3 }}>
                              <Text style={{ fontSize: 9, color: "#fff", fontWeight: "700", letterSpacing: 0.5 }}>YOUR TEE TIME</Text>
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                ))
              )}
            </>
          );
        })()}

        {/* ── LEADERBOARD TAB ─────────────────────────────────────────────────── */}
        {activeTab === "scores" && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Leaderboard</Text>
            {!event.scoring_enabled ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Live scoring not enabled for this event.</Text>
              </View>
            ) : leaderboard.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="podium-outline" size={32} color={colors.mutedForeground} style={{ marginBottom: 8 }} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No scores yet.</Text>
              </View>
            ) : (
              leaderboard.map(div => (
                <View key={div.division} style={{ marginBottom: 16 }}>
                  <Text style={[styles.divGroupTitle, { color: colors.foreground }]}>{div.division} Division</Text>
                  {/* header */}
                  <View style={[styles.lbHeader, { backgroundColor: colors.muted }]}>
                    <Text style={[styles.lbHeaderText, { color: colors.mutedForeground, flex: 1 }]}>#</Text>
                    <Text style={[styles.lbHeaderText, { color: colors.mutedForeground, flex: 3 }]}>Player</Text>
                    <Text style={[styles.lbHeaderText, { color: colors.mutedForeground, flex: 1, textAlign: "right" }]}>Gross</Text>
                    <Text style={[styles.lbHeaderText, { color: colors.mutedForeground, flex: 1, textAlign: "right" }]}>Net</Text>
                    <Text style={[styles.lbHeaderText, { color: colors.mutedForeground, flex: 1, textAlign: "right" }]}>Pts</Text>
                  </View>
                  {div.players.map(p => (
                    <View key={p.user_id} style={[styles.lbRow, { borderColor: colors.border, backgroundColor: p.dq ? "#fee2e2" : p.user_id === user?.id ? colors.primaryLight + "30" : "transparent" }]}>
                      <Text style={[styles.lbPos, { color: p.dq ? "#dc2626" : p.position <= 3 ? colors.accent : colors.mutedForeground }]}>{p.dq ? "DQ" : p.position}</Text>
                      <Text style={[styles.lbName, { color: p.dq ? "#dc2626" : colors.foreground }]} numberOfLines={1}>{p.player_name}{p.user_id === user?.id ? " (you)" : ""}</Text>
                      <Text style={[styles.lbStat, { color: p.dq ? "#dc2626" : colors.foreground }]}>{p.dq ? "—" : (p.gross ?? "—")}</Text>
                      <Text style={[styles.lbStat, { color: p.dq ? "#dc2626" : colors.foreground }]}>{p.dq ? "—" : (p.net ?? "—")}</Text>
                      <Text style={[styles.lbStat, { color: p.dq ? "#dc2626" : colors.foreground }]}>{p.dq ? "—" : (p.points ?? "—")}</Text>
                    </View>
                  ))}
                </View>
              ))
            )}
          </>
        )}

        {/* ── SUBMIT SCORE TAB ─────────────────────────────────────────────────── */}
        {activeTab === "submit" && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Submit Score</Text>
            {!event.scoring_enabled ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Scoring not enabled for this event.</Text>
              </View>
            ) : ctaState !== "confirmed" ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>You must be a confirmed participant to submit a score.</Text>
              </View>
            ) : (
              <>
                {/* Team banner */}
                {reg?.team_name && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.primary + "14", borderRadius: 10, padding: 12, marginBottom: 12 }}>
                    <Ionicons name="people" size={16} color={colors.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: "700", color: colors.primary }}>{reg.team_name}</Text>
                      <Text style={{ fontSize: 11, color: colors.mutedForeground }}>
                        {teamFormat === "pair" ? "Betterball pair — one shared score" : "Team — one shared score for the group"}
                      </Text>
                    </View>
                  </View>
                )}
                {teamFormat !== "individual" && !reg?.team_name && (
                  <View style={{ backgroundColor: "#fef3c7", borderRadius: 10, padding: 12, marginBottom: 12 }}>
                    <Text style={{ fontSize: 12, color: "#92400e" }}>
                      ⚠️ You haven't been linked to a partner/team yet. Submit your score individually and the club can group teams later.
                    </Text>
                  </View>
                )}

                <Text style={[styles.sectionSub, { color: colors.mutedForeground, marginBottom: 12 }]}>
                  {reg?.team_name
                    ? "Any team member can submit — the score is shared for your team."
                    : "Enter your scores for each round. A club official will verify your scorecard."}
                </Text>

                {Array.from({ length: event.rounds ?? 1 }, (_, i) => {
                  const r = i + 1;
                  const submitted = myScores[r];
                  const s = roundScores[r] ?? { gross: "", net: "", points: "" };
                  const isDQ = submitted?.dq === true || submitted?.dq === 1;
                  return (
                    <View key={r} style={[styles.metaCard, { backgroundColor: isDQ ? "#fee2e2" : submitted ? colors.muted + "80" : colors.card, borderColor: isDQ ? "#fca5a5" : submitted ? colors.primary + "40" : colors.border, marginBottom: 12 }]}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                        <Text style={{ fontSize: 13, fontWeight: "700", color: isDQ ? "#dc2626" : colors.foreground }}>Day {r}</Text>
                        {isDQ ? (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#fca5a5", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                            <Ionicons name="ban" size={12} color="#dc2626" />
                            <Text style={{ fontSize: 11, color: "#dc2626", fontWeight: "700" }}>DISQUALIFIED</Text>
                          </View>
                        ) : submitted ? (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                            <Ionicons name="lock-closed" size={12} color={colors.primary} />
                            <Text style={{ fontSize: 11, color: colors.primary, fontWeight: "600" }}>Submitted</Text>
                          </View>
                        ) : null}
                      </View>
                      {isDQ ? (
                        <>
                          {submitted?.dq_reason ? (
                            <Text style={{ fontSize: 12, color: "#dc2626", marginBottom: 8 }}>Reason: {submitted.dq_reason}</Text>
                          ) : (
                            <Text style={{ fontSize: 12, color: "#dc2626", marginBottom: 8 }}>You have been disqualified. Contact the club for details.</Text>
                          )}
                          {submitted?.original_gross != null && (
                            <View style={{ backgroundColor: "#fef2f2", borderRadius: 8, padding: 10, marginBottom: 4 }}>
                              <Text style={{ fontSize: 11, color: "#9ca3af", marginBottom: 6, fontWeight: "600" }}>Submitted scores (corrected by club)</Text>
                              <View style={{ flexDirection: "row", gap: 10 }}>
                                {[["Gross", submitted.original_gross, submitted.gross], ["Nett", submitted.original_net, submitted.net], ["Stableford Pts", submitted.original_points, submitted.points]].map(([label, orig, corrected]) => (
                                  <View key={String(label)} style={{ flex: 1, alignItems: "center" }}>
                                    <Text style={{ fontSize: 10, color: "#9ca3af", marginBottom: 2 }}>{label}</Text>
                                    <Text style={{ fontSize: 14, color: "#dc2626", textDecorationLine: "line-through" }}>{orig ?? "—"}</Text>
                                    <Text style={{ fontSize: 16, fontWeight: "700", color: "#374151" }}>{corrected ?? "—"}</Text>
                                  </View>
                                ))}
                              </View>
                            </View>
                          )}
                        </>
                      ) : submitted ? (
                        <View style={{ flexDirection: "row", gap: 10 }}>
                          {[["Gross", submitted.gross], ["Nett", submitted.net], ["Stableford Pts", submitted.points]].map(([label, val]) => (
                            <View key={String(label)} style={{ flex: 1, alignItems: "center" }}>
                              <Text style={{ fontSize: 10, color: colors.mutedForeground, marginBottom: 4 }}>{label}</Text>
                              <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground }}>{val ?? "—"}</Text>
                            </View>
                          ))}
                        </View>
                      ) : (
                        <View style={{ flexDirection: "row", gap: 10 }}>
                          <ScoreField label="Gross" value={s.gross} onChange={v => setRoundField(r, "gross", v)} colors={colors} />
                          <ScoreField label="Nett" value={s.net} onChange={v => setRoundField(r, "net", v)} colors={colors} />
                          <ScoreField label="Stableford Pts" value={s.points} onChange={v => setRoundField(r, "points", v)} colors={colors} />
                        </View>
                      )}
                    </View>
                  );
                })}

                {(() => {
                  const totalRounds = event.rounds ?? 1;
                  const allSubmitted = Array.from({ length: totalRounds }, (_, i) => i + 1).every(r => myScores[r]);
                  if (allSubmitted) {
                    return (
                      <View style={[styles.emptyCard, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "30" }]}>
                        <Ionicons name="checkmark-circle" size={24} color={colors.primary} style={{ marginBottom: 6 }} />
                        <Text style={{ fontSize: 13, color: colors.primary, fontWeight: "600", textAlign: "center" }}>
                          All scores submitted. Contact the club if there is an error.
                        </Text>
                      </View>
                    );
                  }
                  return (
                    <TouchableOpacity
                      style={[styles.primaryBtn, { backgroundColor: colors.primary, marginTop: 8 }]}
                      onPress={handleSubmitScore} disabled={submittingScore}
                    >
                      {submittingScore
                        ? <ActivityIndicator color="#fff" size="small" />
                        : <Text style={styles.primaryBtnText}>Submit Scores</Text>}
                    </TouchableOpacity>
                  );
                })()}
              </>
            )}
          </>
        )}

      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  modalOverlay:  { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center", padding: 24 },
  modalBox:      { borderRadius: 16, padding: 24, width: "100%", maxWidth: 400, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 12, elevation: 8 },
  modalTitle:    { fontSize: 17, fontWeight: "700", marginBottom: 12 },
  modalBody:     { fontSize: 14, lineHeight: 21, marginBottom: 20 },
  modalBtns:     { flexDirection: "row", gap: 10 },
  modalBtn:      { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  modalBtnText:  { fontSize: 15, fontWeight: "600" },
  container:     { flex: 1 },
  centered:      { flex: 1, justifyContent: "center", alignItems: "center" },
  header:        { paddingTop: 52, paddingBottom: 16, paddingHorizontal: 16, flexDirection: "row", alignItems: "flex-start", gap: 12 },
  headerTitle:   { flex: 1, fontSize: 18, fontWeight: "700", color: "#fff", lineHeight: 24 },
  backBtn:       { paddingTop: 2 },
  tabBar:        { flexDirection: "row", borderBottomWidth: 1 },
  tab:           { flex: 1, paddingVertical: 10, alignItems: "center" },
  tabText:       { fontSize: 12, fontWeight: "600" },
  metaCard:      { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 12, gap: 8 },
  metaRow:       { flexDirection: "row", alignItems: "center", gap: 8 },
  metaText:      { fontSize: 13, flex: 1 },
  descCard:      { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 12 },
  sectionTitle:  { fontSize: 15, fontWeight: "700", marginBottom: 6, marginTop: 8 },
  sectionSub:    { fontSize: 12, marginBottom: 10 },
  descText:      { fontSize: 13, lineHeight: 20 },
  divisionCard:  { borderRadius: 10, borderWidth: 1, borderLeftWidth: 4, padding: 12, marginBottom: 8, flexDirection: "row", alignItems: "center" },
  divLabel:      { fontSize: 14, fontWeight: "700", marginBottom: 2 },
  divSub:        { fontSize: 12 },
  yourDivBadge:  { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  yourDivText:   { fontSize: 11, fontWeight: "700" },
  ctaCard:       { borderRadius: 12, borderWidth: 1, padding: 16, marginTop: 8, gap: 10 },
  ctaTitle:      { fontSize: 14, fontWeight: "700" },
  ctaNote:        { fontSize: 13, lineHeight: 18 },
  statusRow:      { flexDirection: "row", alignItems: "center", gap: 10 },
  primaryBtn:     { borderRadius: 10, paddingVertical: 13, alignItems: "center", marginTop: 4 },
  primaryBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  inlineError:    { flexDirection: "row", alignItems: "flex-start", gap: 7, borderRadius: 8, borderWidth: 1, padding: 10, marginTop: 8 },
  inlineErrorText:{ flex: 1, fontSize: 13, lineHeight: 18, fontFamily: "Inter_400Regular" },
  outlineBtn:    { borderRadius: 10, borderWidth: 1.5, paddingVertical: 11, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 4 },
  outlineBtnText:{ fontSize: 14, fontWeight: "600" },
  voucherInput:  { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, marginTop: 4 },
  emptyCard:     { borderRadius: 12, borderWidth: 1, padding: 32, alignItems: "center", marginTop: 8 },
  emptyText:     { fontSize: 13, textAlign: "center" },
  drawGroup:     { borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 10 },
  drawSlotTime:  { fontSize: 13, fontWeight: "700", marginBottom: 8 },
  drawPlayer:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4, borderTopWidth: 0.5, borderTopColor: "#e5e7eb" },
  drawPlayerName:{ fontSize: 13, fontWeight: "600", flex: 1 },
  drawPlayerSub: { fontSize: 12 },
  divGroupTitle: { fontSize: 14, fontWeight: "700", marginBottom: 6 },
  lbHeader:      { flexDirection: "row", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, marginBottom: 4 },
  lbHeaderText:  { fontSize: 11, fontWeight: "600" },
  lbRow:         { flexDirection: "row", alignItems: "center", paddingVertical: 9, paddingHorizontal: 10, borderBottomWidth: 0.5, gap: 4 },
  lbPos:         { width: 24, fontSize: 13, fontWeight: "700" },
  lbName:        { flex: 3, fontSize: 13 },
  lbStat:        { flex: 1, fontSize: 13, textAlign: "right" },
  roundBtn:      { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
});
