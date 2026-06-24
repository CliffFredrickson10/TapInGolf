import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import GolfBallLoader from "@/components/GolfBallLoader";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/lib/api";
import { AppHeader } from "@/components/AppHeader";

type Transaction = {
  id: number;
  booking_ref: string;
  my_amount: number;
  total_amount: number;
  players: number;
  split_bill: number;
  payment_method: string;
  status: string;
  created_at: string;
  tee_date: string;
  tee_time: string;
  club_name: string;
  club_id: number;
};

type Membership = {
  id: number;
  plan_name: string;
  plan_details: string | null;
  start_date: string;
  expiry_date: string | null;
  status: "active" | "expired" | "cancelled" | "suspended";
  notes: string | null;
  club_name: string;
  club_location: string;
  province: string;
};

function fmtDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

function fmtAmount(amount: number) {
  return `R ${Number(amount).toFixed(2)}`;
}

const TOPUP_PRESETS = [50, 100, 200, 500];

const STATUS_COLORS: Record<string, string> = {
  confirmed: "#1a7a4a",
  pending: "#c8a84b",
  cancelled: "#d9534f",
  completed: "#4a90d9",
};
const MEMBERSHIP_STATUS_COLORS: Record<string, string> = {
  active: "#1a7a4a",
  expired: "#888",
  cancelled: "#d9534f",
  suspended: "#c8a84b",
};

export default function PaymentsScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 44 : insets.top;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [walletBalance, setWalletBalance] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);

  // Top-up state
  const [showTopup, setShowTopup] = useState(false);
  const [topupAmount, setTopupAmount] = useState("");
  const [toppingUp, setToppingUp] = useState(false);
  const [topupError, setTopupError] = useState("");
  // Voucher redemption state
  const [showVoucher, setShowVoucher] = useState(false);
  const [voucherCode, setVoucherCode] = useState("");
  const [redeemingVoucher, setRedeemingVoucher] = useState(false);
  const [voucherError, setVoucherError] = useState("");
  const [voucherSuccess, setVoucherSuccess] = useState("");

  const [vatPct, setVatPct] = useState(15);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [methodsData, txData, memberData] = await Promise.all([
        apiFetch("/payments/methods", user.token),
        apiFetch("/payments/transactions", user.token),
        apiFetch("/payments/memberships", user.token),
      ]);
      setWalletBalance(methodsData.wallet?.balance ?? 0);
      setTransactions(txData.transactions ?? []);
      setMemberships(memberData.memberships ?? []);
    } catch {}
  }, [user]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    apiFetch("/settings").then((d) => { if (d?.vat_pct != null) setVatPct(parseFloat(d.vat_pct)); }).catch(() => {});
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };



  const handleRedeemVoucher = async () => {
    if (!voucherCode.trim()) { setVoucherError("Enter a voucher code"); return; }
    if (!user) return;
    setRedeemingVoucher(true);
    setVoucherError("");
    setVoucherSuccess("");
    try {
      const data = await apiFetch("/payments/wallet/redeem-voucher", user.token, {
        method: "POST",
        body: JSON.stringify({ code: voucherCode.trim() }),
      });
      setWalletBalance(data.new_balance);
      setVoucherSuccess(`R${data.credit_amount.toFixed(2)} added to your wallet!`);
      setVoucherCode("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      setVoucherError(err.message ?? "Invalid voucher code");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setRedeemingVoucher(false);
    }
  };

  const handleStitchTopup = async () => {
    const amount = parseFloat(topupAmount);
    if (!user) return;
    setToppingUp(true);
    setTopupError("");
    try {
      const data = await apiFetch("/payments/wallet/topup-url", user.token, {
        method: "POST",
        body: JSON.stringify({ amount }),
      });
      setShowPaymentPicker(false);
      setShowTopup(false);
      router.push({ pathname: "/booking/payment", params: { url: data.payment_url, booking_id: "0", mode: "wallet", topup_id: String(data.topup_id) } } as any);
    } catch (err: any) {
      setTopupError(err.message ?? "Failed to start payment");
    } finally {
      setToppingUp(false);
    }
  };

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <AppHeader />
        <View style={[styles.backHeader, { paddingTop: 8 }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={10} activeOpacity={0.8}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.backHeaderTitle}>Your Payments</Text>
          <View style={{ width: 38 }} />
        </View>
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Sign in to view payments</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader />
      <View style={[styles.backHeader, { paddingTop: 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={10} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.backHeaderTitle}>Your Payments</Text>
        <View style={{ width: 38 }} />
      </View>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {loading ? (
          <View style={styles.center}>
            <GolfBallLoader />
          </View>
        ) : (
          <View style={{ padding: 20, gap: 24 }}>

            {/* ═══════════════ PAYMENT METHODS ═══════════════ */}
            <View>
              <SectionHeader icon="card" title="Payment Methods" colors={colors} />

              {/* Wallet Card */}
              <View style={[styles.walletCard, { backgroundColor: colors.primary }]}>
                <View style={styles.walletTop}>
                  <View>
                    <Text style={styles.walletLabel}>TapIn Wallet</Text>
                    <Text style={styles.walletBalance}>{fmtAmount(walletBalance)}</Text>
                  </View>
                  <View style={[styles.walletIcon, { backgroundColor: "rgba(255,255,255,0.15)" }]}>
                    <Ionicons name="wallet" size={28} color="#fff" />
                  </View>
                </View>
                <View style={styles.walletBtnRow}>
                  <TouchableOpacity
                    style={[styles.topupBtn, { flex: 1 }]}
                    onPress={() => { setShowTopup(!showTopup); setTopupError(""); setTopupAmount(""); setShowVoucher(false); }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name={showTopup ? "remove" : "add"} size={16} color={colors.primary} />
                    <Text style={[styles.topupBtnText, { color: colors.primary }]}>
                      {showTopup ? "Cancel" : "Top Up"}
                    </Text>
                  </TouchableOpacity>
                  <View style={styles.walletBtnDivider} />
                  <TouchableOpacity
                    style={[styles.topupBtn, { flex: 1 }]}
                    onPress={() => { setShowVoucher(!showVoucher); setVoucherCode(""); setVoucherError(""); setVoucherSuccess(""); setShowTopup(false); }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="pricetag-outline" size={16} color={colors.primary} />
                    <Text style={[styles.topupBtnText, { color: colors.primary }]}>
                      {showVoucher ? "Cancel" : "Voucher"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Voucher redemption form */}
              {showVoucher && (
                <View style={[styles.subCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.subCardTitle, { color: colors.foreground }]}>Redeem a voucher</Text>
                  <Text style={[styles.voucherHint, { color: colors.mutedForeground }]}>
                    Enter your voucher code below to add credit to your TapIn Wallet.
                  </Text>
                  <View style={[styles.voucherInputRow, { borderColor: colors.border, backgroundColor: colors.background }]}>
                    <Ionicons name="pricetag-outline" size={18} color={colors.mutedForeground} style={{ marginLeft: 12 }} />
                    <TextInput
                      style={[styles.voucherTextInput, { color: colors.foreground }]}
                      value={voucherCode}
                      onChangeText={(t) => { setVoucherCode(t.toUpperCase()); setVoucherError(""); setVoucherSuccess(""); }}
                      placeholder="e.g. WALLET100"
                      placeholderTextColor={colors.mutedForeground}
                      autoCapitalize="characters"
                      autoCorrect={false}
                    />
                  </View>
                  {voucherError ? (
                    <View style={styles.voucherFeedbackRow}>
                      <Ionicons name="close-circle" size={16} color={colors.destructive} />
                      <Text style={[styles.voucherFeedbackText, { color: colors.destructive }]}>{voucherError}</Text>
                    </View>
                  ) : null}
                  {voucherSuccess ? (
                    <View style={styles.voucherFeedbackRow}>
                      <Ionicons name="checkmark-circle" size={16} color="#1a7a4a" />
                      <Text style={[styles.voucherFeedbackText, { color: "#1a7a4a" }]}>{voucherSuccess}</Text>
                    </View>
                  ) : null}
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: redeemingVoucher ? colors.muted : colors.accent }]}
                    onPress={handleRedeemVoucher}
                    disabled={redeemingVoucher}
                  >
                    {redeemingVoucher
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={styles.actionBtnText}>Redeem Voucher</Text>
                    }
                  </TouchableOpacity>
                </View>
              )}

              {/* Top-up form */}
              {showTopup && (
                <View style={[styles.subCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.subCardTitle, { color: colors.foreground }]}>Add funds to wallet</Text>
                  <View style={styles.presetRow}>
                    {TOPUP_PRESETS.map((p) => (
                      <TouchableOpacity
                        key={p}
                        style={[styles.presetBtn, { borderColor: topupAmount === String(p) ? colors.primary : colors.border, backgroundColor: topupAmount === String(p) ? colors.primary + "18" : colors.background }]}
                        onPress={() => { setTopupAmount(String(p)); Haptics.selectionAsync(); }}
                      >
                        <Text style={[styles.presetText, { color: topupAmount === String(p) ? colors.primary : colors.foreground }]}>R{p}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={[styles.amountInput, { borderColor: colors.border, backgroundColor: colors.background }]}>
                    <Text style={[styles.rPrefix, { color: colors.mutedForeground }]}>R</Text>
                    <TextInput
                      style={[styles.amountTextInput, { color: colors.foreground }]}
                      value={topupAmount}
                      onChangeText={(t) => setTopupAmount(t.replace(/[^0-9.]/g, ""))}
                      placeholder="Custom amount"
                      placeholderTextColor={colors.mutedForeground}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  {topupError ? <Text style={[styles.errText, { color: colors.destructive }]}>{topupError}</Text> : null}

                  <TouchableOpacity
                    style={[styles.payMethodBtn, { backgroundColor: colors.card, borderColor: colors.primary }]}
                    onPress={handleStitchTopup}
                    disabled={toppingUp}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="card-outline" size={20} color={colors.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.payMethodLabel, { color: colors.foreground }]}>Pay with Stitch</Text>
                      <Text style={[styles.payMethodSub, { color: colors.mutedForeground }]}>Instant EFT, Debit/Credit card</Text>
                    </View>
                    {toppingUp ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />}
                  </TouchableOpacity>
                </View>
              )}

            </View>

            {/* ═══════════════ TRANSACTION HISTORY ═══════════════ */}
            <View>
              <SectionHeader icon="receipt" title="Transaction History" count={transactions.length} colors={colors} />

              {transactions.length === 0 ? (
                <EmptyState icon="receipt-outline" text="No transactions yet" sub="Your booking payments will appear here" colors={colors} />
              ) : (
                <View style={{ gap: 8 }}>
                  {transactions.map((tx) => {
                    const statusColor = STATUS_COLORS[tx.status] ?? colors.mutedForeground;
                    const pmLabel = tx.payment_method === "payfast" ? "PayFast" : tx.payment_method === "wallet" ? "Wallet" : tx.payment_method ?? "PayFast";
                    return (
                      <TouchableOpacity
                        key={tx.id}
                        style={[styles.txItem, { backgroundColor: colors.card, borderColor: colors.border }]}
                        onPress={() => router.push(`/booking/${tx.id}` as any)}
                        activeOpacity={0.8}
                      >
                        <View style={[styles.txIconWrap, { backgroundColor: colors.primary + "18" }]}>
                          <Ionicons name="golf" size={18} color={colors.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.txClub, { color: colors.foreground }]} numberOfLines={1}>{tx.club_name}</Text>
                          <Text style={[styles.txMeta, { color: colors.mutedForeground }]}>
                            {fmtDate(tx.tee_date)}  ·  {tx.booking_ref}  ·  {pmLabel}
                          </Text>
                        </View>
                        <View style={{ alignItems: "flex-end", gap: 4 }}>
                          <Text style={[styles.txAmount, { color: colors.foreground }]}>{fmtAmount(tx.my_amount)}</Text>
                          <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
                            incl. VAT R{(tx.my_amount * vatPct / (100 + vatPct)).toFixed(2)}
                          </Text>
                          <View style={[styles.statusBadge, { backgroundColor: statusColor + "22" }]}>
                            <Text style={[styles.statusText, { color: statusColor }]}>{tx.status}</Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>

            {/* ═══════════════ CLUB MEMBERSHIP ═══════════════ */}
            <View>
              <SectionHeader icon="shield-checkmark" title="Club Membership" count={memberships.length} colors={colors} />
              <View style={[styles.infoNote, { backgroundColor: colors.accent + "15", borderColor: colors.accent + "40" }]}>
                <Ionicons name="information-circle-outline" size={16} color={colors.accent} />
                <Text style={[styles.infoNoteText, { color: colors.accent }]}>
                  Membership details are managed by your club. Contact your club admin to update your plan.
                </Text>
              </View>

              {memberships.length === 0 ? (
                <EmptyState icon="shield-outline" text="No memberships" sub="Your club memberships will appear here once your club admin links your account" colors={colors} />
              ) : (
                <View style={{ gap: 8, marginTop: 8 }}>
                  {memberships.map((m) => {
                    const statusColor = MEMBERSHIP_STATUS_COLORS[m.status] ?? colors.mutedForeground;
                    return (
                      <View key={m.id} style={[styles.memberCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <View style={styles.memberTop}>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.memberClub, { color: colors.foreground }]}>{m.club_name}</Text>
                            <Text style={[styles.memberLocation, { color: colors.mutedForeground }]}>{m.club_location}</Text>
                          </View>
                          <View style={[styles.statusBadge, { backgroundColor: statusColor + "22" }]}>
                            <Text style={[styles.statusText, { color: statusColor }]}>{m.status}</Text>
                          </View>
                        </View>
                        <View style={[styles.memberDivider, { backgroundColor: colors.border }]} />
                        <View style={styles.memberGrid}>
                          <MemberField label="Plan" value={m.plan_name} colors={colors} />
                          <MemberField label="Member since" value={fmtDate(m.start_date)} colors={colors} />
                          {m.expiry_date && <MemberField label="Expires" value={fmtDate(m.expiry_date)} colors={colors} />}
                        </View>
                        {m.plan_details ? (
                          <Text style={[styles.planDetails, { color: colors.mutedForeground }]}>{m.plan_details}</Text>
                        ) : null}
                        {m.notes ? (
                          <Text style={[styles.memberNotes, { color: colors.mutedForeground }]}>{m.notes}</Text>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>

          </View>
        )}
        <View style={{ height: Platform.OS === "web" ? 140 : 74 }} />
      </ScrollView>
    </View>
  );
}

function SectionHeader({ icon, title, count, colors }: { icon: string; title: string; count?: number; colors: any }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={[styles.sectionIconWrap, { backgroundColor: colors.primary + "18" }]}>
        <Ionicons name={icon as any} size={18} color={colors.primary} />
      </View>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
      {count != null && count > 0 && (
        <View style={[styles.countBadge, { backgroundColor: colors.primary + "22" }]}>
          <Text style={[styles.countText, { color: colors.primary }]}>{count}</Text>
        </View>
      )}
    </View>
  );
}

function EmptyState({ icon, text, sub, colors }: { icon: string; text: string; sub: string; colors: any }) {
  return (
    <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Ionicons name={icon as any} size={32} color={colors.mutedForeground} />
      <Text style={[styles.emptyText, { color: colors.foreground }]}>{text}</Text>
      <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>{sub}</Text>
    </View>
  );
}

function MemberField({ label, value, colors }: { label: string; value: string; colors: any }) {
  return (
    <View style={styles.memberFieldWrap}>
      <Text style={[styles.memberFieldLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.memberFieldValue, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backHeader: {
    backgroundColor: "#1a5c38",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  backHeaderTitle: {
    flex: 1,
    textAlign: "center",
    color: "#fff",
    fontSize: 17,
    fontFamily: "Inter_700Bold",
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 200 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  sectionIconWrap: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  sectionTitle: { flex: 1, fontSize: 17, fontFamily: "Inter_700Bold" },
  countBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  countText: { fontSize: 12, fontFamily: "Inter_700Bold" },

  walletCard: { borderRadius: 16, padding: 20, gap: 14 },
  walletTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  walletLabel: { color: "rgba(255,255,255,0.75)", fontSize: 13, fontFamily: "Inter_500Medium", marginBottom: 4 },
  walletBalance: { color: "#fff", fontSize: 32, fontFamily: "Inter_700Bold" },
  walletIcon: { width: 50, height: 50, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  topupBtn: { backgroundColor: "#fff", borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  topupBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  walletBtnRow: { flexDirection: "row", alignItems: "center", gap: 0 },
  walletBtnDivider: { width: 1, height: 32, backgroundColor: "rgba(0,0,0,0.12)" },
  voucherHint: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  voucherInputRow: { flexDirection: "row", alignItems: "center", borderRadius: 10, borderWidth: 1, height: 48, gap: 8 },
  voucherTextInput: { flex: 1, fontSize: 15, fontFamily: "Inter_600SemiBold", letterSpacing: 1, paddingRight: 12 },
  voucherFeedbackRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  voucherFeedbackText: { fontSize: 13, fontFamily: "Inter_500Medium", flex: 1 },

  subCard: { borderWidth: 1.5, borderRadius: 14, padding: 14, gap: 10, marginTop: 10 },
  subCardTitle: { fontSize: 14, fontFamily: "Inter_700Bold" },
  presetRow: { flexDirection: "row", gap: 8 },
  presetBtn: { flex: 1, borderWidth: 1.5, borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  presetText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  amountInput: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, height: 46 },
  rPrefix: { fontSize: 16, fontFamily: "Inter_600SemiBold", marginRight: 4 },
  amountTextInput: { flex: 1, fontSize: 16, fontFamily: "Inter_400Regular" },
  actionBtn: { borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  actionBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  errText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  cancelLink: { fontSize: 14, fontFamily: "Inter_400Regular" },
  payMethodBtn: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 12, borderWidth: 1.5, padding: 14 },
  payMethodLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  payMethodSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },

  listLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  cardItem: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 12, borderWidth: 1, padding: 12 },
  cardBrandBadge: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  cardBrandText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  cardLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  cardSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  defaultBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  defaultText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  iconBtn: { padding: 4 },

  addCardBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1.5, borderRadius: 12, paddingVertical: 12, borderStyle: "dashed" },
  addCardText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  inputLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginBottom: 4, marginTop: 4 },
  fieldInput: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, height: 46, fontSize: 15, fontFamily: "Inter_400Regular" },
  checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  checkboxLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },

  txItem: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 12, borderWidth: 1, padding: 12 },
  txIconWrap: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  txClub: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  txMeta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  txAmount: { fontSize: 15, fontFamily: "Inter_700Bold" },
  statusBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" },

  infoNote: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 8 },
  infoNoteText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },

  memberCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 0 },
  memberTop: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 10 },
  memberClub: { fontSize: 15, fontFamily: "Inter_700Bold" },
  memberLocation: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  memberDivider: { height: 1, marginBottom: 10 },
  memberGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  memberFieldWrap: { minWidth: "40%" },
  memberFieldLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2 },
  memberFieldValue: { fontSize: 13, fontFamily: "Inter_500Medium" },
  planDetails: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 10, lineHeight: 18 },
  memberNotes: { fontSize: 12, fontFamily: "Inter_400Regular", fontStyle: "italic", marginTop: 4 },

  emptyCard: { borderRadius: 14, borderWidth: 1, padding: 24, alignItems: "center", gap: 6 },
  emptyText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 18 },
});
