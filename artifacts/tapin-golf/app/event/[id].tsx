import { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, RefreshControl, TextInput, Image,
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
  additional_fees: { name: string; amount: number }[] | null;
  user_registration: UserRegistration | null;
  user_eligible: boolean | null;
  user_division_preview: string | null;
}

interface DrawEntry {
  user_id: number; user_name: string;
  tee_date: string; tee_time: string; draw_group: number;
  division: string | null; frozen_handicap: number | null;
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
  stroke_play: "Stroke Play", stableford: "Stableford", match_play: "Match Play",
  fourball: "Fourball", scramble: "Scramble", alliance: "Alliance", bogey: "Bogey", other: "Other",
};
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

// ─── Score Entry ──────────────────────────────────────────────────────────────

function ScoreRow({
  hole, value, onChange, colors,
}: { hole: number; value: string; onChange: (v: string) => void; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
      <Text style={{ width: 60, fontSize: 13, color: colors.mutedForeground }}>Hole {hole}</Text>
      <TextInput
        style={{
          flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 6,
          paddingHorizontal: 10, paddingVertical: 5, fontSize: 14,
          color: colors.foreground, backgroundColor: colors.card, textAlign: "center",
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

  const [draw, setDraw]     = useState<DrawEntry[]>([]);
  const [drawLoaded, setDrawLoaded] = useState(false);

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [lbLoaded, setLbLoaded] = useState(false);

  const validTabs = ["info", "draw", "scores", "submit"] as const;
  const [activeTab, setActiveTab] = useState<"info" | "draw" | "scores" | "submit">(
    validTabs.includes(tab as any) ? (tab as "info" | "draw" | "scores" | "submit") : "info"
  );

  // Registration / payment state
  const [registering, setRegistering] = useState(false);
  const [paying, setPaying]           = useState(false);
  const [payError, setPayError]       = useState<string | null>(null);
  const [voucherCode, setVoucherCode] = useState("");

  // Score submission (18 holes)
  const [holeScores, setHoleScores]   = useState<Record<number, string>>({});
  const [submittingScore, setSubmittingScore] = useState(false);
  const [scoreRound, setScoreRound]   = useState(1);

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
    if (activeTab === "scores" && !lbLoaded) loadLeaderboard();
  }, [activeTab, lbLoaded]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleRegister = async () => {
    if (!user) { router.push("/(auth)/login"); return; }
    setRegistering(true);
    try {
      const res = await apiFetch(`/events/${id}/register`, user.token, { method: "POST", body: JSON.stringify({}) });
      await loadEvent(true);
      const msg = res.status === "pending"
        ? `Your entry has been submitted. The club will review and confirm your spot.`
        : `You're registered!${res.division ? ` Auto-assigned to ${res.division} Division (HCP ${res.frozen_handicap ?? "N/A"}).` : ""}`;
      Alert.alert("Entry Submitted", msg);
    } catch (e: any) {
      Alert.alert("Error", e.message);
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

  const handleSubmitScore = async () => {
    if (!user || !event) return;
    const filled = Object.values(holeScores).filter(v => v && v !== "");
    if (filled.length === 0) { Alert.alert("No scores entered", "Enter at least one hole score."); return; }
    const scoreArr = Object.entries(holeScores).map(([h, s]) => ({ hole: Number(h), score: Number(s) }));
    const gross = scoreArr.reduce((sum, s) => sum + (s.score || 0), 0);
    const holeScoresObj: Record<string, number> = {};
    scoreArr.forEach(s => { holeScoresObj[`h${s.hole}`] = s.score; });

    setSubmittingScore(true);
    try {
      await apiFetch(`/events/${event.id}/scores`, user.token, {
        method: "POST",
        body: JSON.stringify({ round: scoreRound, hole_scores: holeScoresObj, gross }),
      });
      Alert.alert("Score Submitted", "Your score has been submitted and is awaiting verification.");
      setHoleScores({});
      setActiveTab("scores");
      loadLeaderboard();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally { setSubmittingScore(false); }
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

  // What action should the CTA show?
  const entriesRequired = event.entries_required !== 0; // default true for existing events
  const ctaState = !user
    ? "login"
    : !entriesRequired
    ? "open_all"                // no enrollment step — open to all
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
                    onPress={() => router.push({ pathname: "/club/[id]", params: { id: event.club_id, date: String(event.event_date).slice(0, 10), event_holes: String(event.holes ?? 18) } })}
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
                  <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={handleRegister} disabled={registering}>
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
        {activeTab === "draw" && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Tee-Time Draw</Text>
            <Text style={[styles.sectionSub, { color: colors.mutedForeground }]}>Published by the club.</Text>
            {draw.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="list-outline" size={32} color={colors.mutedForeground} style={{ marginBottom: 8 }} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Draw not yet published.</Text>
              </View>
            ) : (
              Object.entries(
                draw.reduce((acc, d) => {
                  const key = `${d.tee_date} ${d.tee_time} (Group ${d.draw_group})`;
                  if (!acc[key]) acc[key] = [];
                  acc[key].push(d);
                  return acc;
                }, {} as Record<string, DrawEntry[]>)
              ).map(([slot, players]) => (
                <View key={slot} style={[styles.drawGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.drawSlotTime, { color: colors.primary }]}>{slot}</Text>
                  {players.map((p, i) => (
                    <View key={i} style={styles.drawPlayer}>
                      <Text style={[styles.drawPlayerName, { color: colors.foreground }]}>{p.user_name}</Text>
                      <Text style={[styles.drawPlayerSub, { color: colors.mutedForeground }]}>
                        {p.division ? `${p.division} Div` : ""}{p.frozen_handicap != null ? ` · HCP ${p.frozen_handicap}` : ""}
                      </Text>
                    </View>
                  ))}
                </View>
              ))
            )}
          </>
        )}

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
                    <View key={p.user_id} style={[styles.lbRow, { borderColor: colors.border, backgroundColor: p.user_id === user?.id ? colors.primaryLight + "30" : "transparent" }]}>
                      <Text style={[styles.lbPos, { color: p.position <= 3 ? colors.accent : colors.mutedForeground }]}>{p.position}</Text>
                      <Text style={[styles.lbName, { color: colors.foreground }]} numberOfLines={1}>{p.player_name}{p.user_id === user?.id ? " (you)" : ""}</Text>
                      <Text style={[styles.lbStat, { color: colors.foreground }]}>{p.gross ?? "—"}</Text>
                      <Text style={[styles.lbStat, { color: colors.foreground }]}>{p.net ?? "—"}</Text>
                      <Text style={[styles.lbStat, { color: colors.foreground }]}>{p.points ?? "—"}</Text>
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
                <Text style={[styles.sectionSub, { color: colors.mutedForeground, marginBottom: 12 }]}>
                  Enter your gross score for each hole. A club official will verify your scorecard.
                </Text>
                {/* Round selector (multi-round events) */}
                {event.rounds > 1 && (
                  <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
                    {Array.from({ length: event.rounds }, (_, i) => (
                      <TouchableOpacity key={i + 1} style={[styles.roundBtn, { backgroundColor: scoreRound === i + 1 ? colors.primary : colors.card, borderColor: scoreRound === i + 1 ? colors.primary : colors.border }]} onPress={() => setScoreRound(i + 1)}>
                        <Text style={{ fontSize: 13, color: scoreRound === i + 1 ? "#fff" : colors.foreground }}>R{i + 1}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                {Array.from({ length: 18 }, (_, i) => (
                  <ScoreRow key={i + 1} hole={i + 1} value={holeScores[i + 1] ?? ""}
                    onChange={v => setHoleScores(prev => ({ ...prev, [i + 1]: v }))}
                    colors={colors} />
                ))}
                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: colors.primary, marginTop: 16 }]}
                  onPress={handleSubmitScore} disabled={submittingScore}
                >
                  {submittingScore
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.primaryBtnText}>Submit Scorecard</Text>}
                </TouchableOpacity>
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
  ctaNote:       { fontSize: 13, lineHeight: 18 },
  statusRow:     { flexDirection: "row", alignItems: "center", gap: 10 },
  primaryBtn:    { borderRadius: 10, paddingVertical: 13, alignItems: "center", marginTop: 4 },
  primaryBtnText:{ fontSize: 15, fontWeight: "700", color: "#fff" },
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
