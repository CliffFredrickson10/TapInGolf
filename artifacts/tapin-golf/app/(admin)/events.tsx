import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/lib/api";

// ─── Constants ────────────────────────────────────────────────────
const EVENT_TYPES = [
  { key: "open_day",    label: "Open Day",    icon: "sunny" as const,       color: "#ff9800" },
  { key: "competition", label: "Competition", icon: "trophy" as const,      color: "#8e24aa" },
  { key: "corporate",   label: "Corporate",   icon: "business" as const,    color: "#1976d2" },
  { key: "social",      label: "Social",      icon: "people" as const,      color: "#43a047" },
  { key: "other",       label: "Other",       icon: "calendar" as const,    color: "#546e7a" },
] as const;

const RESTRICTIONS = [
  { key: "open",             label: "Open to All",      icon: "globe-outline" as const,      color: "#43a047" },
  { key: "members_only",     label: "Members Only",     icon: "ribbon-outline" as const,     color: "#1976d2" },
  { key: "invitation_only",  label: "Invite Only",      icon: "lock-closed-outline" as const, color: "#e53935" },
] as const;

const MEMBERSHIP_TYPES = ["standard", "premium", "honorary"] as const;

type EventType    = (typeof EVENT_TYPES)[number]["key"];
type Restriction  = (typeof RESTRICTIONS)[number]["key"];
type MemberType   = (typeof MEMBERSHIP_TYPES)[number];

type GolfEvent = {
  id: number;
  name: string;
  description: string | null;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  event_type: EventType;
  restriction: Restriction;
  entry_fee: number | null;
  max_participants: number | null;
  status: string;
  approved_count: number;
  pending_count: number;
};

type Member = {
  id: number;
  user_id: number;
  user_name: string;
  user_email: string;
  handicap: number | null;
  membership_type: MemberType;
  status: "active" | "suspended";
};

type SearchUser = {
  id: number;
  name: string;
  email: string;
  handicap: number | null;
  already_member: boolean;
};

type Registration = {
  id: number;
  user_id: number;
  user_name: string;
  user_email: string;
  status: "pending" | "approved" | "rejected";
  registered_at: string;
};

function todayStr() { return new Date().toISOString().split("T")[0]; }

function formatEventDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "long" });
}

// ─── Event type meta helpers ──────────────────────────────────────
function getTypeMeta(key: string) {
  return EVENT_TYPES.find((t) => t.key === key) ?? EVENT_TYPES[EVENT_TYPES.length - 1];
}
function getRestrictionMeta(key: string) {
  return RESTRICTIONS.find((r) => r.key === key) ?? RESTRICTIONS[0];
}

// ═══════════════════════════════════════════════════════════════════
// Main screen
// ═══════════════════════════════════════════════════════════════════
export default function EventsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [tab, setTab] = useState<"events" | "members">("events");

  // Events state
  const [events, setEvents]               = useState<GolfEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [showUpcoming, setShowUpcoming]   = useState(true);

  // Form modal (create/edit)
  const [formOpen, setFormOpen]           = useState(false);
  const [editingEvent, setEditingEvent]   = useState<GolfEvent | null>(null);
  const [formName, setFormName]           = useState("");
  const [formDesc, setFormDesc]           = useState("");
  const [formDate, setFormDate]           = useState(todayStr());
  const [formStartTime, setFormStartTime] = useState("");
  const [formEndTime, setFormEndTime]     = useState("");
  const [formType, setFormType]           = useState<EventType>("open_day");
  const [formRestriction, setFormRestriction] = useState<Restriction>("open");
  const [formEntryFee, setFormEntryFee]   = useState("");
  const [formMaxPax, setFormMaxPax]       = useState("");
  const [formSaving, setFormSaving]       = useState(false);

  // Registrations modal
  const [regsEvent, setRegsEvent]         = useState<GolfEvent | null>(null);
  const [regs, setRegs]                   = useState<Registration[]>([]);
  const [regsLoading, setRegsLoading]     = useState(false);

  // Members state
  const [members, setMembers]             = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [memberSearch, setMemberSearch]   = useState("");
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch events ──────────────────────────────────────────────
  const fetchEvents = useCallback(async () => {
    if (!user) return;
    setEventsLoading(true);
    try {
      const data = await apiFetch(`/admin/events?upcoming=${showUpcoming}`, user.token);
      setEvents(data.events ?? []);
    } catch {} finally { setEventsLoading(false); }
  }, [user, showUpcoming]);

  useEffect(() => { if (tab === "events") fetchEvents(); }, [tab, fetchEvents]);

  // ── Fetch members ─────────────────────────────────────────────
  const fetchMembers = useCallback(async () => {
    if (!user) return;
    setMembersLoading(true);
    try {
      const data = await apiFetch("/admin/members", user.token);
      setMembers(data.members ?? []);
    } catch {} finally { setMembersLoading(false); }
  }, [user]);

  useEffect(() => { if (tab === "members") fetchMembers(); }, [tab, fetchMembers]);

  // ── Member search ─────────────────────────────────────────────
  const doSearch = useCallback(async (q: string) => {
    if (!user || q.length < 2) { setSearchResults([]); return; }
    setSearchLoading(true);
    try {
      const data = await apiFetch(`/admin/members/search?q=${encodeURIComponent(q)}`, user.token);
      setSearchResults(data.users ?? []);
    } catch {} finally { setSearchLoading(false); }
  }, [user]);

  const handleSearchChange = (q: string) => {
    setMemberSearch(q);
    clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => doSearch(q), 350);
  };

  // ── Add member ────────────────────────────────────────────────
  const addMember = async (targetUser: SearchUser, type: MemberType = "standard") => {
    if (!user) return;
    try {
      await apiFetch("/admin/members", user.token, {
        method: "POST",
        body: JSON.stringify({ user_id: targetUser.id, membership_type: type }),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setMemberSearch("");
      setSearchResults([]);
      fetchMembers();
    } catch (err: any) {
      Alert.alert("Error", err.message ?? "Failed to add member");
    }
  };

  // ── Remove member ─────────────────────────────────────────────
  const removeMember = (m: Member) => {
    Alert.alert("Remove Member", `Remove ${m.user_name} from the club membership list?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove", style: "destructive",
        onPress: async () => {
          if (!user) return;
          try {
            await apiFetch(`/admin/members/${m.user_id}`, user.token, { method: "DELETE" });
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            fetchMembers();
          } catch (err: any) { Alert.alert("Error", err.message); }
        },
      },
    ]);
  };

  // ── Open create form ──────────────────────────────────────────
  const openCreate = () => {
    setEditingEvent(null);
    setFormName(""); setFormDesc(""); setFormDate(todayStr());
    setFormStartTime(""); setFormEndTime("");
    setFormType("open_day"); setFormRestriction("open");
    setFormEntryFee(""); setFormMaxPax("");
    setFormOpen(true);
  };

  // ── Open edit form ────────────────────────────────────────────
  const openEdit = (ev: GolfEvent) => {
    setEditingEvent(ev);
    setFormName(ev.name);
    setFormDesc(ev.description ?? "");
    setFormDate(String(ev.event_date).split("T")[0]);
    setFormStartTime(ev.start_time ? String(ev.start_time).slice(0, 5) : "");
    setFormEndTime(ev.end_time ? String(ev.end_time).slice(0, 5) : "");
    setFormType(ev.event_type);
    setFormRestriction(ev.restriction);
    setFormEntryFee(ev.entry_fee != null ? String(ev.entry_fee) : "");
    setFormMaxPax(ev.max_participants != null ? String(ev.max_participants) : "");
    setFormOpen(true);
  };

  // ── Save event ────────────────────────────────────────────────
  const saveEvent = async () => {
    if (!user || !formName.trim()) {
      Alert.alert("Missing field", "Event name is required."); return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(formDate)) {
      Alert.alert("Invalid date", "Date must be YYYY-MM-DD."); return;
    }
    setFormSaving(true);
    const body = {
      name: formName.trim(),
      description: formDesc.trim() || null,
      event_date: formDate,
      start_time: formStartTime || null,
      end_time: formEndTime || null,
      event_type: formType,
      restriction: formRestriction,
      entry_fee: formEntryFee ? parseFloat(formEntryFee) : null,
      max_participants: formMaxPax ? parseInt(formMaxPax) : null,
    };
    try {
      if (editingEvent) {
        await apiFetch(`/admin/events/${editingEvent.id}`, user.token, { method: "PUT", body: JSON.stringify(body) });
      } else {
        await apiFetch("/admin/events", user.token, { method: "POST", body: JSON.stringify(body) });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setFormOpen(false);
      fetchEvents();
    } catch (err: any) {
      Alert.alert("Error", err.message ?? "Failed to save event");
    } finally { setFormSaving(false); }
  };

  // ── Cancel event ──────────────────────────────────────────────
  const cancelEvent = (ev: GolfEvent) => {
    Alert.alert("Cancel Event", `Cancel "${ev.name}"? This cannot be undone.`, [
      { text: "Keep Event", style: "cancel" },
      {
        text: "Cancel Event", style: "destructive",
        onPress: async () => {
          if (!user) return;
          try {
            await apiFetch(`/admin/events/${ev.id}`, user.token, { method: "DELETE" });
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            fetchEvents();
          } catch (err: any) { Alert.alert("Error", err.message); }
        },
      },
    ]);
  };

  // ── Open registrations ────────────────────────────────────────
  const openRegistrations = async (ev: GolfEvent) => {
    if (!user) return;
    setRegsEvent(ev);
    setRegsLoading(true);
    try {
      const data = await apiFetch(`/admin/events/${ev.id}/registrations`, user.token);
      setRegs(data.registrations ?? []);
    } catch {} finally { setRegsLoading(false); }
  };

  // ── Decide registration ───────────────────────────────────────
  const decideReg = async (reg: Registration, status: "approved" | "rejected") => {
    if (!user || !regsEvent) return;
    try {
      await apiFetch(`/admin/events/${regsEvent.id}/registrations/${reg.user_id}`, user.token, {
        method: "PUT", body: JSON.stringify({ status }),
      });
      Haptics.selectionAsync();
      setRegs((prev) => prev.map((r) => r.user_id === reg.user_id ? { ...r, status } : r));
    } catch (err: any) { Alert.alert("Error", err.message); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12, backgroundColor: colors.primary }]}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Events &amp; Members</Text>
          <Text style={styles.headerSub}>Manage golf days and memberships</Text>
        </View>
        {tab === "events" && (
          <TouchableOpacity style={styles.headerBtn} onPress={openCreate}>
            <Ionicons name="add" size={20} color={colors.primary} />
            <Text style={[styles.headerBtnText, { color: colors.primary }]}>New</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Tabs */}
      <View style={[styles.tabs, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {(["events", "members"] as const).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => { setTab(t); Haptics.selectionAsync(); }}
          >
            <Text style={[styles.tabText, { color: tab === t ? colors.primary : colors.mutedForeground }]}>
              {t === "events" ? "Golf Events" : "Club Members"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Events Tab ── */}
      {tab === "events" && (
        <>
          {/* Upcoming / Past toggle */}
          <View style={[styles.toggleRow, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
            <Text style={[styles.toggleLabel, { color: colors.foreground }]}>Upcoming events</Text>
            <Switch
              value={showUpcoming}
              onValueChange={(v) => { setShowUpcoming(v); Haptics.selectionAsync(); }}
              trackColor={{ true: colors.primary }}
              thumbColor="#fff"
            />
          </View>

          {eventsLoading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : events.length === 0 ? (
            <View style={styles.center}>
              <Ionicons name="calendar-outline" size={48} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {showUpcoming ? "No upcoming events" : "No past events"}
              </Text>
              {showUpcoming && (
                <TouchableOpacity style={[styles.emptyCreateBtn, { backgroundColor: colors.primary }]} onPress={openCreate}>
                  <Text style={styles.emptyCreateBtnText}>Create First Event</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
              {events.map((ev) => {
                const tm = getTypeMeta(ev.event_type);
                const rm = getRestrictionMeta(ev.restriction);
                return (
                  <View key={ev.id} style={[styles.eventCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    {/* Card header */}
                    <View style={styles.eventCardHeader}>
                      <View style={[styles.eventTypeIcon, { backgroundColor: tm.color + "18" }]}>
                        <Ionicons name={tm.icon} size={20} color={tm.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.eventName, { color: colors.foreground }]} numberOfLines={1}>{ev.name}</Text>
                        <Text style={[styles.eventDate, { color: colors.mutedForeground }]}>
                          {formatEventDate(String(ev.event_date).split("T")[0])}
                          {ev.start_time ? ` · ${String(ev.start_time).slice(0, 5)}` : ""}
                          {ev.end_time ? ` – ${String(ev.end_time).slice(0, 5)}` : ""}
                        </Text>
                      </View>
                      {ev.status === "cancelled" && (
                        <View style={[styles.statusBadge, { backgroundColor: "#e5393518" }]}>
                          <Text style={[styles.statusBadgeText, { color: "#e53935" }]}>Cancelled</Text>
                        </View>
                      )}
                    </View>

                    {/* Badges */}
                    <View style={styles.badgeRow}>
                      <View style={[styles.badge, { backgroundColor: tm.color + "15", borderColor: tm.color + "44" }]}>
                        <Text style={[styles.badgeText, { color: tm.color }]}>{tm.label}</Text>
                      </View>
                      <View style={[styles.badge, { backgroundColor: rm.color + "15", borderColor: rm.color + "44" }]}>
                        <Ionicons name={rm.icon} size={11} color={rm.color} />
                        <Text style={[styles.badgeText, { color: rm.color }]}>{rm.label}</Text>
                      </View>
                      {ev.entry_fee != null && (
                        <View style={[styles.badge, { backgroundColor: colors.accent + "15", borderColor: colors.accent + "44" }]}>
                          <Text style={[styles.badgeText, { color: colors.accent }]}>R{ev.entry_fee.toFixed(2)} entry</Text>
                        </View>
                      )}
                      {ev.max_participants != null && (
                        <View style={[styles.badge, { backgroundColor: colors.muted + "60", borderColor: colors.border }]}>
                          <Ionicons name="people-outline" size={11} color={colors.mutedForeground} />
                          <Text style={[styles.badgeText, { color: colors.mutedForeground }]}>
                            {ev.approved_count}/{ev.max_participants}
                          </Text>
                        </View>
                      )}
                    </View>

                    {ev.description ? (
                      <Text style={[styles.eventDesc, { color: colors.mutedForeground }]} numberOfLines={2}>{ev.description}</Text>
                    ) : null}

                    {/* Actions */}
                    <View style={[styles.cardActions, { borderTopColor: colors.border }]}>
                      <TouchableOpacity style={styles.cardAction} onPress={() => openEdit(ev)}>
                        <Ionicons name="pencil-outline" size={16} color={colors.primary} />
                        <Text style={[styles.cardActionText, { color: colors.primary }]}>Edit</Text>
                      </TouchableOpacity>
                      {ev.restriction === "invitation_only" && (
                        <TouchableOpacity style={styles.cardAction} onPress={() => openRegistrations(ev)}>
                          <Ionicons name="person-add-outline" size={16} color={colors.primary} />
                          <Text style={[styles.cardActionText, { color: colors.primary }]}>
                            Requests{ev.pending_count > 0 ? ` (${ev.pending_count})` : ""}
                          </Text>
                        </TouchableOpacity>
                      )}
                      {ev.status !== "cancelled" && (
                        <TouchableOpacity style={styles.cardAction} onPress={() => cancelEvent(ev)}>
                          <Ionicons name="close-circle-outline" size={16} color="#e53935" />
                          <Text style={[styles.cardActionText, { color: "#e53935" }]}>Cancel</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </>
      )}

      {/* ── Members Tab ── */}
      {tab === "members" && (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Search to add */}
          <View>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>ADD NEW MEMBER</Text>
            <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="search" size={18} color={colors.mutedForeground} />
              <TextInput
                style={[styles.searchInput, { color: colors.foreground }]}
                value={memberSearch}
                onChangeText={handleSearchChange}
                placeholder="Search by name or email…"
                placeholderTextColor={colors.mutedForeground}
                autoCorrect={false}
              />
              {searchLoading && <ActivityIndicator size="small" color={colors.primary} />}
            </View>

            {searchResults.length > 0 && (
              <View style={[styles.searchResults, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {searchResults.map((su) => (
                  <View key={su.id} style={[styles.searchResult, { borderBottomColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.searchResultName, { color: colors.foreground }]}>{su.name}</Text>
                      <Text style={[styles.searchResultSub, { color: colors.mutedForeground }]}>
                        {su.email}{su.handicap != null ? ` · HCP ${su.handicap}` : ""}
                      </Text>
                    </View>
                    {su.already_member ? (
                      <View style={[styles.alreadyBadge, { backgroundColor: colors.primary + "18" }]}>
                        <Text style={[styles.alreadyBadgeText, { color: colors.primary }]}>Member</Text>
                      </View>
                    ) : (
                      <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={() => addMember(su)}>
                        <Ionicons name="add" size={16} color="#fff" />
                        <Text style={styles.addBtnText}>Add</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Members list */}
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
            CURRENT MEMBERS ({members.filter((m) => m.status === "active").length})
          </Text>
          {membersLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : members.length === 0 ? (
            <View style={styles.center}>
              <Ionicons name="ribbon-outline" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No members yet — search above to add</Text>
            </View>
          ) : (
            members.map((m) => (
              <View key={m.id} style={[styles.memberCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.memberAvatar, { backgroundColor: colors.primary + "18" }]}>
                  <Text style={[styles.memberAvatarText, { color: colors.primary }]}>
                    {m.user_name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.memberName, { color: colors.foreground }]}>{m.user_name}</Text>
                  <Text style={[styles.memberEmail, { color: colors.mutedForeground }]}>
                    {m.user_email}{m.handicap != null ? ` · HCP ${m.handicap}` : ""}
                  </Text>
                </View>
                <View style={[styles.memberTypeBadge, {
                  backgroundColor:
                    m.membership_type === "premium" ? colors.accent + "18" :
                    m.membership_type === "honorary" ? "#8e24aa18" : colors.primary + "12",
                }]}>
                  <Text style={[styles.memberTypeText, {
                    color: m.membership_type === "premium" ? colors.accent :
                           m.membership_type === "honorary" ? "#8e24aa" : colors.primary,
                  }]}>
                    {m.membership_type}
                  </Text>
                </View>
                {m.status === "suspended" && (
                  <View style={[styles.memberTypeBadge, { backgroundColor: "#e5393518" }]}>
                    <Text style={[styles.memberTypeText, { color: "#e53935" }]}>suspended</Text>
                  </View>
                )}
                <TouchableOpacity onPress={() => removeMember(m)} style={{ padding: 6 }}>
                  <Ionicons name="trash-outline" size={18} color="#e53935" />
                </TouchableOpacity>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* ── Create / Edit Modal ── */}
      <Modal visible={formOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setFormOpen(false)}>
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={[styles.modalHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setFormOpen(false)}>
              <Ionicons name="close" size={24} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {editingEvent ? "Edit Event" : "New Event"}
            </Text>
            <TouchableOpacity onPress={saveEvent} disabled={formSaving}>
              {formSaving
                ? <ActivityIndicator color={colors.primary} />
                : <Text style={[styles.modalSave, { color: colors.primary }]}>Save</Text>}
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Name */}
            <View>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>EVENT NAME *</Text>
              <TextInput style={[styles.field, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                value={formName} onChangeText={setFormName} placeholder="e.g. Club Championship 2026" placeholderTextColor={colors.mutedForeground} />
            </View>

            {/* Date */}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>DATE (YYYY-MM-DD) *</Text>
                <TextInput style={[styles.field, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                  value={formDate} onChangeText={setFormDate} placeholder="2026-06-15" placeholderTextColor={colors.mutedForeground} keyboardType="numbers-and-punctuation" />
              </View>
            </View>

            {/* Times */}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>START TIME</Text>
                <TextInput style={[styles.field, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                  value={formStartTime} onChangeText={setFormStartTime} placeholder="07:00" placeholderTextColor={colors.mutedForeground} keyboardType="numbers-and-punctuation" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>END TIME</Text>
                <TextInput style={[styles.field, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                  value={formEndTime} onChangeText={setFormEndTime} placeholder="14:00" placeholderTextColor={colors.mutedForeground} keyboardType="numbers-and-punctuation" />
              </View>
            </View>

            {/* Event type */}
            <View>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>EVENT TYPE</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 6 }}>
                {EVENT_TYPES.map((t) => (
                  <TouchableOpacity
                    key={t.key}
                    style={[styles.pill, { borderColor: formType === t.key ? t.color : colors.border, backgroundColor: formType === t.key ? t.color + "18" : colors.card }]}
                    onPress={() => { setFormType(t.key); Haptics.selectionAsync(); }}
                  >
                    <Ionicons name={t.icon} size={14} color={formType === t.key ? t.color : colors.mutedForeground} />
                    <Text style={[styles.pillText, { color: formType === t.key ? t.color : colors.mutedForeground }]}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Restriction */}
            <View>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>ACCESS RESTRICTION</Text>
              {RESTRICTIONS.map((r) => (
                <TouchableOpacity
                  key={r.key}
                  style={[styles.restrictionRow, {
                    borderColor: formRestriction === r.key ? r.color : colors.border,
                    backgroundColor: formRestriction === r.key ? r.color + "10" : colors.card,
                    marginBottom: 6,
                  }]}
                  onPress={() => { setFormRestriction(r.key); Haptics.selectionAsync(); }}
                  activeOpacity={0.8}
                >
                  <Ionicons name={r.icon} size={18} color={formRestriction === r.key ? r.color : colors.mutedForeground} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.restrictionLabel, { color: formRestriction === r.key ? r.color : colors.foreground }]}>{r.label}</Text>
                    <Text style={[styles.restrictionDesc, { color: colors.mutedForeground }]}>
                      {r.key === "open"            ? "Anyone can book tee times on this day" :
                       r.key === "members_only"    ? "Only registered club members can book" :
                                                    "Golfers must request an invitation from you"}
                    </Text>
                  </View>
                  {formRestriction === r.key && <Ionicons name="checkmark-circle" size={20} color={r.color} />}
                </TouchableOpacity>
              ))}
            </View>

            {/* Entry fee & max participants */}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>ENTRY FEE (R)</Text>
                <TextInput style={[styles.field, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                  value={formEntryFee} onChangeText={setFormEntryFee} placeholder="0.00" placeholderTextColor={colors.mutedForeground} keyboardType="decimal-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>MAX PARTICIPANTS</Text>
                <TextInput style={[styles.field, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                  value={formMaxPax} onChangeText={setFormMaxPax} placeholder="Unlimited" placeholderTextColor={colors.mutedForeground} keyboardType="number-pad" />
              </View>
            </View>

            {/* Description */}
            <View>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>DESCRIPTION</Text>
              <TextInput style={[styles.fieldArea, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                value={formDesc} onChangeText={setFormDesc} placeholder="Optional event details…" placeholderTextColor={colors.mutedForeground} multiline numberOfLines={3} textAlignVertical="top" />
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Registrations Modal ── */}
      <Modal visible={!!regsEvent} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setRegsEvent(null)}>
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={[styles.modalHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setRegsEvent(null)}>
              <Ionicons name="close" size={24} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]} numberOfLines={1}>
              {regsEvent?.name ?? "Registrations"}
            </Text>
            <View style={{ width: 36 }} />
          </View>

          {regsLoading ? (
            <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
          ) : regs.length === 0 ? (
            <View style={styles.center}>
              <Ionicons name="person-add-outline" size={44} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No registration requests yet</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
              {(["pending", "approved", "rejected"] as const).map((status) => {
                const group = regs.filter((r) => r.status === status);
                if (!group.length) return null;
                const label = status === "pending" ? "Pending Approval" : status === "approved" ? "Approved" : "Rejected";
                const color = status === "pending" ? "#ff9800" : status === "approved" ? "#43a047" : "#e53935";
                return (
                  <View key={status}>
                    <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginBottom: 6 }]}>{label.toUpperCase()} ({group.length})</Text>
                    {group.map((reg) => (
                      <View key={reg.id} style={[styles.regCard, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: color }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.regName, { color: colors.foreground }]}>{reg.user_name}</Text>
                          <Text style={[styles.regEmail, { color: colors.mutedForeground }]}>{reg.user_email}</Text>
                        </View>
                        {status === "pending" && (
                          <View style={styles.regActions}>
                            <TouchableOpacity style={[styles.regBtn, { backgroundColor: "#43a04718", borderColor: "#43a04744" }]} onPress={() => decideReg(reg, "approved")}>
                              <Ionicons name="checkmark" size={16} color="#43a047" />
                              <Text style={[styles.regBtnText, { color: "#43a047" }]}>Approve</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.regBtn, { backgroundColor: "#e5393518", borderColor: "#e5393544" }]} onPress={() => decideReg(reg, "rejected")}>
                              <Ionicons name="close" size={16} color="#e53935" />
                              <Text style={[styles.regBtnText, { color: "#e53935" }]}>Reject</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                        {status !== "pending" && (
                          <View style={[styles.statusBadge, { backgroundColor: color + "18" }]}>
                            <Text style={[styles.statusBadgeText, { color }]}>{status}</Text>
                          </View>
                        )}
                      </View>
                    ))}
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header:             { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 16 },
  headerTitle:        { color: "#fff", fontSize: 18, fontFamily: "Inter_700Bold" },
  headerSub:          { color: "rgba(255,255,255,0.75)", fontSize: 12, fontFamily: "Inter_400Regular" },
  headerBtn:          { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#fff", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  headerBtnText:      { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  tabs:               { flexDirection: "row", borderBottomWidth: 1 },
  tab:                { flex: 1, alignItems: "center", paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabText:            { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  toggleRow:          { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  toggleLabel:        { fontSize: 14, fontFamily: "Inter_500Medium" },
  center:             { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  emptyText:          { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center" },
  emptyCreateBtn:     { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 20, marginTop: 4 },
  emptyCreateBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 15 },
  sectionLabel:       { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  eventCard:          { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  eventCardHeader:    { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14 },
  eventTypeIcon:      { width: 42, height: 42, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  eventName:          { fontSize: 15, fontFamily: "Inter_700Bold" },
  eventDate:          { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  eventDesc:          { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18, paddingHorizontal: 14, paddingBottom: 10 },
  badgeRow:           { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: 14, paddingBottom: 10 },
  badge:              { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText:          { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  statusBadge:        { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  statusBadgeText:    { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  cardActions:        { flexDirection: "row", borderTopWidth: 1, paddingTop: 10, paddingBottom: 10, paddingHorizontal: 14, gap: 16 },
  cardAction:         { flexDirection: "row", alignItems: "center", gap: 4 },
  cardActionText:     { fontSize: 13, fontFamily: "Inter_500Medium" },
  searchBar:          { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 44 },
  searchInput:        { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  searchResults:      { borderWidth: 1, borderRadius: 12, marginTop: 4, overflow: "hidden" },
  searchResult:       { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderBottomWidth: 1 },
  searchResultName:   { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  searchResultSub:    { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  alreadyBadge:       { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  alreadyBadgeText:   { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  addBtn:             { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  addBtnText:         { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  memberCard:         { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 14, padding: 12 },
  memberAvatar:       { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  memberAvatarText:   { fontSize: 16, fontFamily: "Inter_700Bold" },
  memberName:         { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  memberEmail:        { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  memberTypeBadge:    { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  memberTypeText:     { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  modalHeader:        { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1 },
  modalTitle:         { fontSize: 17, fontFamily: "Inter_700Bold", flex: 1, textAlign: "center" },
  modalSave:          { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  fieldLabel:         { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.5, marginBottom: 5 },
  field:              { height: 46, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, fontSize: 15, fontFamily: "Inter_400Regular" },
  fieldArea:          { minHeight: 80, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, fontFamily: "Inter_400Regular" },
  pill:               { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  pillText:           { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  restrictionRow:     { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1.5, borderRadius: 12, padding: 12 },
  restrictionLabel:   { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  restrictionDesc:    { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  regCard:            { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderLeftWidth: 3, borderRadius: 12, padding: 12, marginBottom: 8 },
  regName:            { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  regEmail:           { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  regActions:         { flexDirection: "row", gap: 8 },
  regBtn:             { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  regBtnText:         { fontSize: 12, fontFamily: "Inter_600SemiBold" },
});
