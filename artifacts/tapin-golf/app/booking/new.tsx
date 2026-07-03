import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
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
import { AppHeader } from "@/components/AppHeader";

// ─── Types ────────────────────────────────────────────────────────────────────
interface AppliedVoucher {
  code: string;
  discount_type: "fixed" | "percentage";
  discount_value: number;
  discount_amount: number;
  final_amount: number;
}

interface AvailableVoucher extends AppliedVoucher {
  label: string;
  sub: string;
  is_cancellation_voucher: boolean;
  club_name: string | null;
  expires_at: string | null;
}

type AddedPlayer =
  | { type: "friend" | "user"; id: number; name: string; avatar?: string | null }
  | { type: "guest"; name: string };

type FriendUser = {
  id: number;
  name: string;
  email: string;
  avatar?: string | null;
  handicap?: number | null;
  status: string;
};

type PickerTab = "friends" | "search" | "guest";

type KnockoutMatchLink = {
  id: number;
  event_name: string;
  round_label: string;
  round_number: number;
  opponent_name: string;
  deadline: string | null;
  player_position: 1 | 2;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function initials(name: string) {
  return name.split(" ").map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase();
}

function Avatar({ name, avatar, size, colors }: { name: string; avatar?: string | null; size: number; colors: any }) {
  return avatar ? (
    <Image source={{ uri: avatar }} style={{ width: size, height: size, borderRadius: size / 2 }} />
  ) : (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: colors.primary + "22",
      alignItems: "center", justifyContent: "center",
    }}>
      <Text style={{ fontSize: size * 0.38, fontFamily: "Inter_700Bold", color: colors.primary }}>
        {initials(name)}
      </Text>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function NewBookingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    club_id: string;
    club_name: string;
    tee_time_id: string;
    time: string;
    date: string;
    price: string;
    price_9?: string;
    promo_price?: string;
    available: string;
    total_slots?: string;
    cart_available?: string;
    cart_compulsory?: string;
    cart_price?: string;
    range_balls_enabled?: string;
    range_balls_price?: string;
    club_hire_enabled?: string;
    club_hire_price?: string;
    stitch_enabled?: string;
    prepaid_enabled?: string;
    voucher_enabled?: string;
    pay_at_club_enabled?: string;
    event_id?: string;
    event_name?: string;
    event_holes?: string;
  }>();

  const maxPlayers      = Math.min(parseInt(params.available ?? "4"), 4);
  const totalSlots      = parseInt(params.total_slots ?? "4");
  const allAvailable    = maxPlayers >= totalSlots;  // all spots still open

  const price18         = parseFloat(params.price ?? "0");
  const price9Raw       = params.price_9 ? parseFloat(params.price_9) : null;
  const has9            = price9Raw !== null && !isNaN(price9Raw);

  const promoPrice      = params.promo_price ? parseFloat(params.promo_price) : null;
  const hasPromo        = promoPrice !== null && !isNaN(promoPrice);
  const isTierPriced    = !hasPromo && price18 === 0; // price determined server-side by membership

  // ── Junior status (18 years or younger) ─────────────────────────────────────
  const isJunior = React.useMemo(() => {
    if (!user?.date_of_birth) return false;
    const dob = new Date(String(user.date_of_birth));
    if (isNaN(dob.getTime())) return false;
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
    return age <= 18;
  }, [user?.date_of_birth]);

  const isStudent = React.useMemo(() => {
    if (isJunior || !user?.date_of_birth) return false;
    const dob = new Date(String(user.date_of_birth));
    if (isNaN(dob.getTime())) return false;
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
    return age >= 18 && age <= 24;
  }, [isJunior, user?.date_of_birth]);

  const isPensioner = React.useMemo(() => {
    if (isJunior || isStudent || !user?.date_of_birth) return false;
    const dob = new Date(String(user.date_of_birth));
    if (isNaN(dob.getTime())) return false;
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
    return age >= 65;
  }, [isJunior, isStudent, user?.date_of_birth]);

  // ── Holes selection ─────────────────────────────────────────────────────────
  const eventHolesLock = params.event_holes === "9" ? 9 : params.event_holes === "18" ? 18 : null;
  const [holes, setHoles] = useState<9 | 18>(eventHolesLock ?? 18);

  // ── HNA membership number (must be declared before effectivePrice refs below) ─
  const [hnaNumber, setHnaNumber]       = useState(user?.hna_number && user.hna_number !== "null" ? user.hna_number : "");
  const [hnaPrice18, setHnaPrice18]     = useState<number | null>(null);
  const [hnaPrice9, setHnaPrice9]       = useState<number | null>(null);
  const [hnaLoading, setHnaLoading]     = useState(false);
  const hnaDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // For tier-priced clubs (price=0 from server), fetch the organizer's own tier price
  const [organizerTierPrice, setOrganizerTierPrice] = useState<number | null>(null);

  const cartAvailable  = params.cart_available === "1";
  const cartCompulsory = params.cart_compulsory === "1";
  const cartUnitPrice  = params.cart_price ? parseFloat(params.cart_price) : 0;

  const rangeBallsAvailable = params.range_balls_enabled === "1";
  const rangeBallsUnitPrice = params.range_balls_price ? parseFloat(params.range_balls_price) : 0;
  const [rangeBallsOptions, setRangeBallsOptions] = useState<Array<{ label: string; price: number }>>([]);
  const clubHireAvailable   = params.club_hire_enabled === "1";
  const clubHireUnitPrice   = params.club_hire_price ? parseFloat(params.club_hire_price) : 0;

  // ── Core booking state ──────────────────────────────────────────────────────
  const [numPlayers, setNumPlayers]   = useState(1);
  const [splitBill, setSplitBill]     = useState(false);
  const [includeCart, setIncludeCart]           = useState(cartCompulsory);
  const [includeRangeBalls, setIncludeRangeBalls] = useState(false);
  const [selectedRangeBallsOption, setSelectedRangeBallsOption] = useState<{ label: string; price: number } | null>(null);
  const [includeClubHire, setIncludeClubHire]     = useState(false);
  // Default to the first enabled payment method for this club
  const [paymentMethod, setPaymentMethod] = useState<"stitch" | "prepaid" | "wallet" | "pay_at_club">(
    params.stitch_enabled  !== "0" ? "stitch"      :
    params.prepaid_enabled !== "0" ? "prepaid"     :
    params.pay_at_club_enabled === "1" ? "pay_at_club" :
    "wallet" // ultimate fallback (wallet is always on)
  );
  const [prepaidBalance, setPrepaidBalance] = useState<{ total: number; used: number; remaining: number } | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [isMember, setIsMember]       = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const [bookError, setBookError]     = useState<string | null>(null);

  // ── Player picker state ─────────────────────────────────────────────────────
  const [addedPlayers, setAddedPlayers] = useState<(AddedPlayer | null)[]>([]);
  const [addedPlayerPrices, setAddedPlayerPrices] = useState<Record<number, { price: number; tier_type: string; tier_label: string } | null>>({});
  const [friends, setFriends]           = useState<FriendUser[]>([]);
  const [pickerOpen, setPickerOpen]     = useState(false);
  const [pickerSlot, setPickerSlot]     = useState(0);
  const [pickerTab, setPickerTab]       = useState<PickerTab>("friends");
  const [searchQuery, setSearchQuery]   = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [guestName, setGuestName]       = useState("");
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Knockout match link state ────────────────────────────────────────────────
  const [isKnockoutMatch, setIsKnockoutMatch]           = useState(false);
  const [selectedKnockoutMatch, setSelectedKnockoutMatch] = useState<KnockoutMatchLink | null>(null);
  const [knockoutMatches, setKnockoutMatches]           = useState<KnockoutMatchLink[]>([]);
  const [knockoutMatchesLoading, setKnockoutMatchesLoading] = useState(false);

  // ── Voucher state ───────────────────────────────────────────────────────────
  const [availableVouchers, setAvailableVouchers] = useState<AvailableVoucher[]>([]);
  const [vouchersLoading, setVouchersLoading]     = useState(false);
  const [appliedVoucher, setAppliedVoucher]       = useState<AppliedVoucher | null>(null);
  const [vatPct, setVatPct]                 = useState(15);

  // Only a CLUB-VERIFIED HNA earns the affiliated-visitor rate. A number the golfer
  // typed themselves (unverified) is treated as a standard visitor.
  const hnaVerified = !!user?.hna_verified;

  // ── Organizer's own tier label (from age flags + membership + HNA) ─────────
  const organizerTierLabel = React.useMemo(() => {
    if (isMember) {
      if (isPensioner) return "Pensioner Member";
      if (isJunior)   return "Junior Member";
      if (isStudent)  return "Student Member";
      return "Club Member";
    }
    if (isJunior)   return "Junior Visitor";
    if (isStudent)  return "Student Visitor";
    if (isPensioner) return hnaVerified ? "Affiliated Pensioner Visitor" : "Non-Affiliated Pensioner Visitor";
    return hnaVerified ? "Affiliated Visitor" : "Non-Affiliated Visitor";
  }, [isMember, isJunior, isStudent, isPensioner, hnaVerified]);

  const stitchEnabled    = params.stitch_enabled  !== "0";  // default true
  const prepaidEnabled   = params.prepaid_enabled !== "0";  // default true
  const voucherEnabled   = params.voucher_enabled !== "0";  // default true
  const payAtClubEnabled = params.pay_at_club_enabled === "1";
  const [platformFee, setPlatformFee] = useState<number>(10);

  // ── Fetch VAT rate + platform fee ───────────────────────────────────────────
  useEffect(() => {
    apiFetch("/settings").then((d) => {
      if (d?.vat_pct != null) setVatPct(parseFloat(d.vat_pct));
      if (d?.platform_fee_flat != null) setPlatformFee(parseFloat(d.platform_fee_flat));
    }).catch(() => {});
  }, []);

  // ── HNA useEffect (after all state declarations) ─────────────────────────────
  useEffect(() => {
    if (hnaDebounce.current) clearTimeout(hnaDebounce.current);
    if (!hnaVerified || hnaNumber.length !== 10) {
      setHnaPrice18(null);
      setHnaPrice9(null);
      return;
    }
    hnaDebounce.current = setTimeout(async () => {
      setHnaLoading(true);
      try {
        const [r18, r9] = await Promise.all([
          apiFetch(`/clubs/${params.club_id}/tier-price?tier=affiliated_visitor&holes=18`),
          has9 ? apiFetch(`/clubs/${params.club_id}/tier-price?tier=affiliated_visitor&holes=9`) : Promise.resolve({ price: null }),
        ]);
        setHnaPrice18(r18.price != null ? parseFloat(r18.price) : null);
        setHnaPrice9(r9.price  != null ? parseFloat(r9.price)  : null);
      } catch {} finally { setHnaLoading(false); }
    }, 500);
    return () => { if (hnaDebounce.current) clearTimeout(hnaDebounce.current); };
  }, [hnaNumber, hnaVerified, params.club_id, has9]);

  // When the club is tier-priced (price18=0), fetch the organizer's actual tier price
  useEffect(() => {
    if (!isTierPriced || !user) return;
    setOrganizerTierPrice(null);
    const noCache: RequestInit = { cache: "no-store" };
    apiFetch(
      `/clubs/${params.club_id}/user-tier-price?user_id=${user.id}&holes=${holes}`,
      user.token,
      noCache
    )
      .then((d) => { if (d.price != null) setOrganizerTierPrice(parseFloat(d.price)); })
      .catch(() => {});
  }, [isTierPriced, user, params.club_id, holes]);

  // ── Load user's active knockout matches at this club ─────────────────────────
  useEffect(() => {
    if (!user || !params.club_id) return;
    setKnockoutMatchesLoading(true);
    apiFetch(`/knockout/my-active-matches?club_id=${params.club_id}`, user.token)
      .then((d) => setKnockoutMatches(d?.matches ?? []))
      .catch(() => {})
      .finally(() => setKnockoutMatchesLoading(false));
  }, [user, params.club_id]);

  // Effective prices: take the lowest of the server-computed tier price and the
  // HNA affiliated rate — whichever is cheaper for the user wins.
  // Members are never charged the HNA/affiliated rate — their membership tier applies.
  const effectivePrice18 = (!isMember && hnaPrice18 !== null) ? Math.min(price18, hnaPrice18) : price18;
  const effectivePrice9  = (!isMember && hnaPrice9 !== null && price9Raw !== null)
    ? Math.min(price9Raw, hnaPrice9)
    : price9Raw;
  const regularPrice     = holes === 9 && has9 ? (effectivePrice9 ?? effectivePrice18) : effectivePrice18;
  // For tier-priced clubs, override basePrice once the organizer's tier price is fetched
  const basePrice        = hasPromo ? promoPrice! : (isTierPriced && organizerTierPrice !== null ? organizerTierPrice : regularPrice);
  // True only while we still don't have the real price — controls "Membership pricing" label
  const effectiveTierPriced = isTierPriced && organizerTierPrice === null;

  // ── Totals ──────────────────────────────────────────────────────────────────
  // Organizer pays R0 greens when using a prepaid round
  const organizerGreens = (paymentMethod === "prepaid" && isMember) ? 0 : basePrice;
  // Each invited player is billed at their own tier rate (fetched per-player from the server)
  const invitedGreens = Array.from({ length: Math.max(0, numPlayers - 1) }, (_, i) => {
    const pp = addedPlayerPrices[i];
    return pp != null ? pp.price : basePrice; // fallback to organizer's rate until fetched
  });
  const subtotal    = organizerGreens + invitedGreens.reduce((a, b) => a + b, 0);

  // ── Fetch available vouchers for this user + club (after subtotal is known) ─
  useEffect(() => {
    if (!voucherEnabled || !user) return;
    let cancelled = false;
    setVouchersLoading(true);
    apiFetch(
      `/vouchers/available?club_id=${params.club_id}&amount=${subtotal}`,
      user.token
    )
      .then((d) => {
        if (cancelled) return;
        setAvailableVouchers(d?.vouchers ?? []);
        if (appliedVoucher) {
          const still = (d?.vouchers ?? []).find(
            (v: AvailableVoucher) => v.code === appliedVoucher.code
          );
          if (!still) setAppliedVoucher(null);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setVouchersLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voucherEnabled, user, params.club_id, subtotal]);

  const discount    = appliedVoucher ? appliedVoucher.discount_amount : 0;
  const greensTotal = Math.max(0, subtotal - discount);
  const numCarts    = numPlayers <= 2 ? 1 : 2;
  const cartFee       = (cartAvailable && includeCart) ? numCarts * cartUnitPrice : 0;
  const activeRangeBallsPrice = rangeBallsOptions.length > 0
    ? (selectedRangeBallsOption?.price ?? 0)
    : (includeRangeBalls ? rangeBallsUnitPrice : 0);
  const rangeBallsFee = rangeBallsAvailable && (rangeBallsOptions.length > 0 ? selectedRangeBallsOption !== null : includeRangeBalls)
    ? activeRangeBallsPrice : 0;
  const clubHireFee   = (clubHireAvailable && includeClubHire) ? clubHireUnitPrice : 0;
  const totalAmount   = greensTotal + cartFee + rangeBallsFee + clubHireFee;
  const cartShare     = numPlayers > 1 ? Math.round(cartFee / numPlayers * 100) / 100 : cartFee;
  const myAmount      = splitBill && numPlayers > 1
    ? organizerGreens + cartShare + rangeBallsFee + clubHireFee
    : totalAmount;

  // ── Per-player breakdown rows (memoised so React Compiler tracks addedPlayerPrices) ──
  const playerBreakdownRows = React.useMemo(() =>
    Array.from({ length: Math.max(0, numPlayers - 1) }, (_, i) => {
      const player = addedPlayers[i] ?? null;
      if (!player) return null;
      const pp     = addedPlayerPrices[i];
      const greens = pp === undefined ? basePrice : pp === null ? null : pp.price;
      const total  = greens != null ? greens + cartShare : null;
      const tierLabel = pp?.tier_label ?? null;
      return { player, greens, total, tierLabel };
    }),
  [numPlayers, addedPlayers, addedPlayerPrices, basePrice, cartShare]);

  // ── Load friends ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    apiFetch("/friends", user.token).then((d) => setFriends(d.friends ?? [])).catch(() => {});
  }, [user]);

  // ── Load prepaid balance for this club ──────────────────────────────────────
  useEffect(() => {
    if (!user || !params.club_id) return;
    apiFetch(`/clubs/${params.club_id}/prepaid-balance`, user.token)
      .then((d) => {
        setIsMember(!!d.is_member);
        if (d.is_member && d.total > 0) setPrepaidBalance({ total: d.total, used: d.used, remaining: d.remaining });
        else setPrepaidBalance(null);
      })
      .catch(() => { setIsMember(false); setPrepaidBalance(null); });
  }, [user, params.club_id]);

  // ── Load wallet balance ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    apiFetch("/payments/methods", user.token)
      .then((d) => setWalletBalance(parseFloat(d?.wallet?.balance ?? "0")))
      .catch(() => setWalletBalance(0));
  }, [user]);

  // ── Fetch range ball options from API (URL params can't carry JSON safely) ───
  useEffect(() => {
    if (!rangeBallsAvailable || !params.club_id) return;
    apiFetch(`/clubs/${params.club_id}`)
      .then((d) => {
        const opts = d?.club?.range_balls_options;
        if (Array.isArray(opts) && opts.length > 0) setRangeBallsOptions(opts);
      })
      .catch(() => {});
  }, [params.club_id, rangeBallsAvailable]);

  // ── User search (debounced) ─────────────────────────────────────────────────
  useEffect(() => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    if (!searchQuery.trim() || !user) { setSearchResults([]); return; }
    searchDebounce.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const data = await apiFetch(`/users/search?q=${encodeURIComponent(searchQuery)}`, user.token);
        setSearchResults(data.users ?? []);
      } catch {} finally { setSearchLoading(false); }
    }, 400);
    return () => { if (searchDebounce.current) clearTimeout(searchDebounce.current); };
  }, [searchQuery, user]);

  // ── Picker helpers ──────────────────────────────────────────────────────────
  const openPicker = useCallback((slotIdx: number) => {
    setPickerSlot(slotIdx);
    setPickerTab("friends");
    setSearchQuery("");
    setSearchResults([]);
    setGuestName("");
    setPickerOpen(true);
    Haptics.selectionAsync();
  }, []);

  const closePicker = () => setPickerOpen(false);

  const fetchPlayerPrice = useCallback(async (slotIdx: number, player: AddedPlayer) => {
    setAddedPlayerPrices(prev => ({ ...prev, [slotIdx]: null }));
    // cache: "no-store" prevents the native RN fetch stack from returning an empty-body
    // 304 response (which would cause res.json() to throw and leave the price at null).
    const noCache: RequestInit = { cache: "no-store" };
    try {
      if (player.type === "guest") {
        const data = await apiFetch(`/clubs/${params.club_id}/tier-price?tier=non_affiliated_visitor&holes=${holes}`, undefined, noCache);
        if (data.price != null) {
          setAddedPlayerPrices(prev => ({ ...prev, [slotIdx]: { price: parseFloat(data.price), tier_type: "non_affiliated_visitor", tier_label: "Non-Affiliated Visitor" } }));
        }
      } else {
        const data = await apiFetch(`/clubs/${params.club_id}/user-tier-price?user_id=${player.id}&holes=${holes}`, user?.token, noCache);
        if (data.price != null) {
          setAddedPlayerPrices(prev => ({ ...prev, [slotIdx]: { price: parseFloat(data.price), tier_type: data.tier_type, tier_label: data.tier_label ?? data.tier_type } }));
        }
      }
    } catch {}
  }, [params.club_id, holes, user?.token]);

  // ── Ensure player prices are fetched for all filled slots ────────────────────
  // Placed after fetchPlayerPrice so it's in scope. Runs when addedPlayers changes;
  // fetches any slot whose price is still missing (covers failed/missed initial fetches).
  useEffect(() => {
    addedPlayers.forEach((player, i) => {
      if (player && !(i in addedPlayerPrices)) {
        fetchPlayerPrice(i, player);
      }
    });
  // addedPlayerPrices intentionally omitted to avoid infinite loop
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addedPlayers, fetchPlayerPrice]);

  // ── Re-fetch all player prices when holes selection changes ──────────────────
  // Price differs between 9h and 18h — force a refresh for every filled slot.
  useEffect(() => {
    addedPlayers.forEach((player, i) => {
      if (player) fetchPlayerPrice(i, player);
    });
  // Only holes matters here; fetchPlayerPrice and addedPlayers are captured from
  // the current render so they always have the new holes value.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holes]);

  const selectPlayer = useCallback((player: AddedPlayer) => {
    setAddedPlayers((prev) => {
      const next = [...prev];
      next[pickerSlot] = player;
      return next;
    });
    fetchPlayerPrice(pickerSlot, player);
    Haptics.selectionAsync();
    setPickerOpen(false);
  }, [pickerSlot, fetchPlayerPrice]);

  const removePlayer = (idx: number) => {
    Haptics.selectionAsync();
    setAddedPlayers((prev) => {
      const next = [...prev];
      next[idx] = null;
      return next;
    });
    setAddedPlayerPrices(prev => { const next = { ...prev }; delete next[idx]; return next; });
  };

  const isAlreadyAdded = (id: number) =>
    addedPlayers.some((p) => p && p.type !== "guest" && (p as any).id === id);

  // ── Voucher ─────────────────────────────────────────────────────────────────
  const selectVoucher = (v: AvailableVoucher) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setAppliedVoucher(v);
  };

  const removeVoucher = () => { setAppliedVoucher(null); };

  // ── Book ────────────────────────────────────────────────────────────────────
  const handleBook = async () => {
    if (!user) { router.push("/(auth)/login"); return; }
    if (isKnockoutMatch && !selectedKnockoutMatch) {
      setBookError("Please select your knockout match to link to this booking.");
      return;
    }
    setSubmitting(true);
    const players_data = addedPlayers
      .slice(0, numPlayers - 1)
      .map((p, i) => {
        if (!p) return null;
        if (p.type === "guest") return { guest_name: p.name };
        const tierType = addedPlayerPrices[i]?.tier_type;
        return { user_id: (p as any).id, ...(tierType ? { tier_type: tierType } : {}) };
      })
      .filter(Boolean);
    try {
      const data = await apiFetch("/bookings", user.token, {
        method: "POST",
        body: JSON.stringify({
          tee_time_id:    parseInt(params.tee_time_id),
          players:        numPlayers,
          split_bill:     splitBill,
          players_data,
          payment_method: paymentMethod,
          voucher_code:   appliedVoucher?.code ?? null,
          include_cart:         cartAvailable && includeCart,
          include_range_balls:  rangeBallsAvailable && (rangeBallsOptions.length > 0 ? selectedRangeBallsOption !== null : includeRangeBalls),
          range_balls_selected_price: rangeBallsOptions.length > 0 ? (selectedRangeBallsOption?.price ?? undefined) : undefined,
          include_club_hire:    clubHireAvailable && includeClubHire,
          holes:                holes,
          hna_number:     hnaNumber.trim() || null,
          event_id:       params.event_id ? parseInt(params.event_id) : undefined,
          knockout_match_id: isKnockoutMatch && selectedKnockoutMatch ? selectedKnockoutMatch.id : undefined,
        }),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (data.payment_url) {
        router.replace({ pathname: "/booking/payment", params: { url: data.payment_url, booking_id: data.booking_id } });
      } else {
        router.replace({ pathname: "/booking/[id]", params: { id: data.booking_id } });
      }
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setBookError(err.message ?? "Booking failed. Please try again.");
    } finally { setSubmitting(false); }
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <>
      <AppHeader />
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: 12 }]}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Book Tee Time</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.content}>
          {/* Booking summary */}
          <View style={[styles.summaryCard, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "33" }]}>
            <Text style={[styles.summaryClub, { color: colors.primary }]}>{params.club_name}</Text>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Ionicons name="calendar-outline" size={16} color={colors.primary} />
                <Text style={[styles.summaryText, { color: colors.foreground }]}>{params.date}</Text>
              </View>
              <View style={styles.summaryItem}>
                <Ionicons name="time-outline" size={16} color={colors.primary} />
                <Text style={[styles.summaryText, { color: colors.foreground }]}>{params.time}</Text>
              </View>
            </View>
            {hasPromo && (
              <View style={[styles.promoBanner, { backgroundColor: colors.accent + "22", borderColor: colors.accent + "55" }]}>
                <Ionicons name="pricetag" size={14} color={colors.accent} />
                <Text style={[styles.promoBannerText, { color: colors.accent }]}>
                  Promotional rate: R{promoPrice!.toFixed(2)}/player
                </Text>
                <Text style={[styles.promoBannerOld, { color: colors.mutedForeground }]}>
                  was R{regularPrice.toFixed(2)}
                </Text>
              </View>
            )}
          </View>

          {/* Holes selection — shown when 9-hole price is set, or when an event locks the holes */}
          {(has9 || eventHolesLock) && allAvailable && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Number of Holes</Text>
              <View style={styles.ballRow}>
                {([9, 18] as const).map((h) => {
                  const locked = eventHolesLock !== null && h !== eventHolesLock;
                  return (
                    <TouchableOpacity
                      key={h}
                      onPress={() => {
                        if (locked) return;
                        Haptics.selectionAsync();
                        setHoles(h);
                        setAppliedVoucher(null);
                      }}
                      style={[
                        styles.ballBtn,
                        { flex: 1,
                          backgroundColor: holes === h ? colors.primary : colors.card,
                          borderColor:     holes === h ? colors.primary : colors.border,
                          opacity: locked ? 0.35 : 1,
                        },
                      ]}
                      activeOpacity={locked ? 1 : 0.8}
                    >
                      <Text style={[styles.ballNum, { color: holes === h ? "#fff" : colors.foreground }]}>{h}</Text>
                      <Text style={[styles.ballLabel, { color: holes === h ? "rgba(255,255,255,0.8)" : colors.mutedForeground }]}>
                        {locked ? "N/A" : h === 9 ? (price9Raw! > 0 ? `R${price9Raw!.toFixed(0)}/p` : "Tier") : (price18 > 0 ? `R${price18.toFixed(0)}/p` : "Tier")}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {/* Number of players */}
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Number of Players</Text>
          <View style={styles.ballRow}>
            {[1, 2, 3, 4].map((n) => {
              const disabled = n > maxPlayers;
              return (
                <TouchableOpacity
                  key={n}
                  onPress={() => {
                    if (disabled) return;
                    Haptics.selectionAsync();
                    setNumPlayers(n);
                    setAddedPlayers((prev) => prev.slice(0, n - 1));
                    setAppliedVoucher(null);
                    if (n > 1 && paymentMethod === "prepaid") setSplitBill(true);
                  }}
                  style={[
                    styles.ballBtn,
                    {
                      backgroundColor: numPlayers === n ? colors.primary : colors.card,
                      borderColor:     numPlayers === n ? colors.primary : colors.border,
                      opacity:         disabled ? 0.3 : 1,
                    },
                  ]}
                  activeOpacity={disabled ? 1 : 0.8}
                >
                  <Text style={[styles.ballNum, { color: numPlayers === n ? "#fff" : colors.foreground }]}>{n}</Text>
                  <Text style={[styles.ballLabel, { color: numPlayers === n ? "rgba(255,255,255,0.8)" : colors.mutedForeground }]}>
                    {n === 1 ? "Single" : n === 2 ? "2-Ball" : n === 3 ? "3-Ball" : "4-Ball"}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Player slots */}
          {numPlayers > 1 && (
            <>
              <View style={styles.playerSlotsHeader}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Playing Partners</Text>
                <Text style={[styles.playerSlotsCount, { color: colors.mutedForeground }]}>
                  {addedPlayers.filter(Boolean).length}/{numPlayers - 1} added
                </Text>
              </View>
              {Array.from({ length: numPlayers - 1 }, (_, i) => {
                const player = addedPlayers[i] ?? null;
                return player ? (
                  <View key={i} style={[styles.playerSlotFilled, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Avatar
                      name={player.name}
                      avatar={player.type !== "guest" ? (player as any).avatar : null}
                      size={42}
                      colors={colors}
                    />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={[styles.playerName, { color: colors.foreground }]}>{player.name}</Text>
                      <Text style={[styles.playerType, { color: colors.mutedForeground }]}>
                        {player.type === "guest" ? "Guest player" : player.type === "friend" ? "Friend" : "Player"}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => removePlayer(i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="close-circle" size={22} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    key={i}
                    style={[styles.playerSlotEmpty, { borderColor: colors.primary + "60", backgroundColor: colors.primary + "08" }]}
                    onPress={() => openPicker(i)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.playerAddCircle, { backgroundColor: colors.primary + "18" }]}>
                      <Ionicons name="add" size={20} color={colors.primary} />
                    </View>
                    <Text style={[styles.playerSlotLabel, { color: colors.primary }]}>Add Player {i + 2}</Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.primary + "80"} style={{ marginLeft: "auto" }} />
                  </TouchableOpacity>
                );
              })}
            </>
          )}

          {/* Add-ons section header */}
          <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 8 }]}>Add-ons</Text>

          {/* Golf Cart */}
          {!cartAvailable && (
            <View style={[styles.cartCard, { backgroundColor: colors.muted + "55", borderColor: colors.border }]}>
              <View style={styles.cartRow}>
                <View style={[styles.cartIconBadge, { backgroundColor: colors.muted }]}>
                  <Ionicons name="car-sport" size={20} color={colors.mutedForeground} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cartTitle, { color: colors.mutedForeground }]}>No Golf Carts Available</Text>
                  <Text style={[styles.cartSub, { color: colors.mutedForeground }]}>This club does not offer cart hire</Text>
                </View>
              </View>
            </View>
          )}
          {cartAvailable && (
            cartCompulsory ? (
              <View style={[styles.cartCard, { backgroundColor: colors.accent + "14", borderColor: colors.accent + "44" }]}>
                <View style={styles.cartRow}>
                  <View style={[styles.cartIconBadge, { backgroundColor: colors.accent + "22" }]}>
                    <Ionicons name="car-sport" size={20} color={colors.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cartTitle, { color: colors.foreground }]}>Golf Cart — Compulsory</Text>
                    <Text style={[styles.cartSub, { color: colors.mutedForeground }]}>
                      {numCarts} cart{numCarts > 1 ? "s" : ""} required · R{cartUnitPrice.toFixed(2)}/cart · R{cartFee.toFixed(2)} total
                    </Text>
                  </View>
                  <View style={[styles.cartBadge, { backgroundColor: colors.accent }]}>
                    <Text style={styles.cartBadgeText}>Required</Text>
                  </View>
                </View>
              </View>
            ) : (
              <View style={[styles.cartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.cartRow}>
                  <View style={[styles.cartIconBadge, { backgroundColor: colors.primary + "18" }]}>
                    <Ionicons name="car-sport" size={20} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cartTitle, { color: colors.foreground }]}>Add Golf Cart</Text>
                    <Text style={[styles.cartSub, { color: colors.mutedForeground }]}>
                      {numCarts} cart{numCarts > 1 ? "s" : ""} · R{cartUnitPrice.toFixed(2)}/cart
                      {includeCart ? ` · +R${cartFee.toFixed(2)}` : ""}
                    </Text>
                  </View>
                  <Switch
                    value={includeCart}
                    onValueChange={(v) => { Haptics.selectionAsync(); setIncludeCart(v); }}
                    trackColor={{ true: colors.primary, false: colors.muted }}
                    thumbColor="#fff"
                  />
                </View>
              </View>
            )
          )}

          {/* Driving Range Balls */}
          {rangeBallsAvailable && (
            <View style={[styles.cartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.cartRow}>
                <View style={[styles.cartIconBadge, { backgroundColor: colors.primary + "18" }]}>
                  <Ionicons name="golf" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cartTitle, { color: colors.foreground }]}>Driving Range Balls</Text>
                  <Text style={[styles.cartSub, { color: colors.mutedForeground }]}>
                    {rangeBallsOptions.length > 0
                      ? selectedRangeBallsOption
                        ? `${selectedRangeBallsOption.label} · +R${rangeBallsFee.toFixed(2)}`
                        : "Choose a package below"
                      : `Bucket of range balls · R${rangeBallsUnitPrice.toFixed(2)}${includeRangeBalls ? ` · +R${rangeBallsFee.toFixed(2)}` : ""}`}
                  </Text>
                </View>
                {rangeBallsOptions.length === 0 && (
                  <Switch
                    value={includeRangeBalls}
                    onValueChange={(v) => { Haptics.selectionAsync(); setIncludeRangeBalls(v); }}
                    trackColor={{ true: colors.primary, false: colors.muted }}
                    thumbColor="#fff"
                  />
                )}
              </View>
              {rangeBallsOptions.length > 0 && (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                  {rangeBallsOptions.map((opt, i) => {
                    const selected = selectedRangeBallsOption?.price === opt.price && selectedRangeBallsOption?.label === opt.label;
                    return (
                      <TouchableOpacity
                        key={i}
                        onPress={() => { Haptics.selectionAsync(); setSelectedRangeBallsOption(selected ? null : opt); }}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          borderRadius: 20,
                          borderWidth: 1.5,
                          borderColor: selected ? colors.primary : colors.border,
                          backgroundColor: selected ? colors.primary + "18" : colors.background,
                        }}
                        activeOpacity={0.75}
                      >
                        <Text style={{
                          fontSize: 13,
                          color: selected ? colors.primary : colors.foreground,
                          fontWeight: selected ? "600" : "400",
                        }}>
                          {opt.label} · R{opt.price.toFixed(2)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          {/* Club Hire */}
          {clubHireAvailable && (
            <View style={[styles.cartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.cartRow}>
                <View style={[styles.cartIconBadge, { backgroundColor: colors.primary + "18" }]}>
                  <Ionicons name="bag-handle" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cartTitle, { color: colors.foreground }]}>Club Hire</Text>
                  <Text style={[styles.cartSub, { color: colors.mutedForeground }]}>
                    Rental set of clubs · R{clubHireUnitPrice.toFixed(2)}
                    {includeClubHire ? ` · +R${clubHireFee.toFixed(2)}` : ""}
                  </Text>
                </View>
                <Switch
                  value={includeClubHire}
                  onValueChange={(v) => { Haptics.selectionAsync(); setIncludeClubHire(v); }}
                  trackColor={{ true: colors.primary, false: colors.muted }}
                  thumbColor="#fff"
                />
              </View>
            </View>
          )}

          {/* Knockout match link */}
          {(knockoutMatches.length > 0 || knockoutMatchesLoading) && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 8 }]}>Knockout Match</Text>
              {knockoutMatchesLoading ? (
                <View style={[styles.cartCard, { backgroundColor: colors.card, borderColor: colors.border, alignItems: "center", paddingVertical: 16 }]}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              ) : (
                <View style={[styles.cartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.cartRow}>
                    <View style={[styles.cartIconBadge, { backgroundColor: colors.primary + "18" }]}>
                      <Ionicons name="trophy-outline" size={20} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.cartTitle, { color: colors.foreground }]}>Link Knockout Match</Text>
                      <Text style={[styles.cartSub, { color: colors.mutedForeground }]}>
                        Is this booking for a knockout tournament round?
                      </Text>
                    </View>
                    <Switch
                      value={isKnockoutMatch}
                      onValueChange={(v) => {
                        Haptics.selectionAsync();
                        setIsKnockoutMatch(v);
                        if (!v) setSelectedKnockoutMatch(null);
                      }}
                      trackColor={{ true: colors.primary, false: colors.muted }}
                      thumbColor="#fff"
                    />
                  </View>
                  {isKnockoutMatch && (
                    <View style={{ marginTop: 12, gap: 8 }}>
                      {knockoutMatches.map((m) => {
                        const sel = selectedKnockoutMatch?.id === m.id;
                        return (
                          <TouchableOpacity
                            key={m.id}
                            onPress={() => { Haptics.selectionAsync(); setSelectedKnockoutMatch(sel ? null : m); }}
                            style={{
                              borderRadius: 10,
                              borderWidth: 1.5,
                              borderColor: sel ? colors.primary : colors.border,
                              backgroundColor: sel ? colors.primary + "12" : colors.background,
                              padding: 12,
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 10,
                            }}
                            activeOpacity={0.75}
                          >
                            <Ionicons
                              name={sel ? "checkmark-circle" : "ellipse-outline"}
                              size={20}
                              color={sel ? colors.primary : colors.mutedForeground}
                            />
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>
                                {m.event_name} · {m.round_label}
                              </Text>
                              <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
                                vs {m.opponent_name}{m.deadline ? `  ·  Deadline ${m.deadline}` : ""}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                      {!selectedKnockoutMatch && (
                        <Text style={{ fontSize: 12, color: "#e53e3e", marginTop: 2 }}>
                          Select a match to link to this booking.
                        </Text>
                      )}
                      {selectedKnockoutMatch && (
                        <View style={{
                          flexDirection: "row", alignItems: "flex-start", gap: 6,
                          marginTop: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border,
                        }}>
                          <Ionicons name="information-circle-outline" size={14} color={colors.primary} style={{ marginTop: 1 }} />
                          <Text style={{ fontSize: 12, color: colors.mutedForeground, flex: 1 }}>
                            You will be required to submit your match result within 6 hours of your tee time.
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              )}
            </>
          )}

          {/* Payment method */}
          <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 8 }]}>Payment Method</Text>

          {/* Split bill — first item under Payment Method */}
          {numPlayers > 1 && (
            <View style={[styles.splitRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View>
                <Text style={[styles.splitLabel, { color: colors.foreground }]}>Split Bill Equally</Text>
                <Text style={[styles.splitSub, { color: colors.mutedForeground }]}>
                  {paymentMethod === "prepaid" && isMember
                    ? "Your round is free · others pay their rate"
                    : effectiveTierPriced
                    ? "Membership pricing applies"
                    : "Each player billed at their own rate"}
                </Text>
              </View>
              <Switch
                value={splitBill}
                onValueChange={(v) => { Haptics.selectionAsync(); setSplitBill(v); }}
                trackColor={{ true: colors.primary, false: colors.muted }}
                thumbColor="#fff"
              />
            </View>
          )}
          {stitchEnabled && (
            <TouchableOpacity
              style={[
                styles.paymentOption,
                {
                  backgroundColor: paymentMethod === "stitch" ? colors.primaryLight : colors.card,
                  borderColor:     paymentMethod === "stitch" ? colors.primary : colors.border,
                },
              ]}
              onPress={() => { Haptics.selectionAsync(); setPaymentMethod("stitch"); }}
            >
              <Ionicons name="card-outline" size={22} color={paymentMethod === "stitch" ? colors.primary : colors.mutedForeground} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.payLabel, { color: colors.foreground }]}>Stitch</Text>
                <Text style={[styles.paySub, { color: colors.mutedForeground }]}>Instant EFT, Debit/Credit card</Text>
              </View>
              {paymentMethod === "stitch" && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
            </TouchableOpacity>
          )}

          {/* Pay at Club option — shown only when club has enabled it */}
          {payAtClubEnabled && (
            <TouchableOpacity
              style={[
                styles.paymentOption,
                {
                  backgroundColor: paymentMethod === "pay_at_club" ? colors.primaryLight : colors.card,
                  borderColor:     paymentMethod === "pay_at_club" ? colors.primary : colors.border,
                },
              ]}
              onPress={() => { Haptics.selectionAsync(); setPaymentMethod("pay_at_club"); }}
            >
              <Ionicons name="golf-outline" size={22} color={paymentMethod === "pay_at_club" ? colors.primary : colors.mutedForeground} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.payLabel, { color: colors.foreground }]}>Pay at Club</Text>
                <Text style={[styles.paySub, { color: colors.mutedForeground }]}>
                  Pay commitment fee online · settle greens fee at the club
                </Text>
              </View>
              {paymentMethod === "pay_at_club" && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
            </TouchableOpacity>
          )}
          {paymentMethod === "pay_at_club" && (
            <View style={{ flexDirection: "row", gap: 6, alignItems: "flex-start", paddingHorizontal: 4, marginTop: -4, backgroundColor: colors.primaryLight, borderRadius: 8, padding: 8 }}>
              <Ionicons name="information-circle-outline" size={15} color={colors.primary} style={{ marginTop: 1 }} />
              <Text style={{ flex: 1, fontSize: 12, color: colors.primary, lineHeight: 17 }}>
                A commitment fee of R{platformFee.toFixed(2)} is charged now and deducted from your greens fee. You pay R{(myAmount - platformFee).toFixed(2)} at the club on the day.
              </Text>
            </View>
          )}

          {/* Wallet option — always available; shown once balance is loaded */}
          {walletBalance !== null && (
            <TouchableOpacity
              style={[
                styles.paymentOption,
                {
                  backgroundColor: paymentMethod === "wallet" ? colors.primaryLight : colors.card,
                  borderColor:     paymentMethod === "wallet" ? colors.primary : colors.border,
                },
              ]}
              onPress={() => { Haptics.selectionAsync(); setPaymentMethod("wallet"); }}
            >
              <Ionicons name="wallet-outline" size={22} color={paymentMethod === "wallet" ? colors.primary : colors.mutedForeground} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.payLabel, { color: colors.foreground }]}>TapIn Wallet</Text>
                <Text style={[styles.paySub, { color: walletBalance >= myAmount ? colors.primary : "#e53e3e" }]}>
                  R {walletBalance.toFixed(2)} available
                  {walletBalance < myAmount ? " — insufficient balance" : ""}
                </Text>
              </View>
              {paymentMethod === "wallet" && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
            </TouchableOpacity>
          )}

          {/* Insufficient wallet balance notice */}
          {paymentMethod === "wallet" && walletBalance !== null && walletBalance < myAmount && (
            <View style={{ flexDirection: "row", gap: 6, alignItems: "flex-start", paddingHorizontal: 4, backgroundColor: "#fef3cd", borderRadius: 8, padding: 8 }}>
              <Ionicons name="warning-outline" size={14} color="#a07c10" style={{ marginTop: 1 }} />
              <Text style={{ flex: 1, fontSize: 12, color: "#7d5a00", lineHeight: 17 }}>
                Your wallet balance (R {walletBalance.toFixed(2)}) is less than the amount due (R {myAmount.toFixed(2)}). Top up your wallet in the Profile tab before booking.
              </Text>
            </View>
          )}

          {/* Prepaid rounds option — shown only when club has enabled it and member has rounds */}
          {prepaidEnabled && prepaidBalance !== null && (
            <TouchableOpacity
              style={[
                styles.paymentOption,
                {
                  backgroundColor: paymentMethod === "prepaid" ? colors.primaryLight : colors.card,
                  borderColor:     paymentMethod === "prepaid" ? colors.primary : colors.border,
                },
              ]}
              onPress={() => {
                Haptics.selectionAsync();
                setPaymentMethod("prepaid");
                if (numPlayers > 1) setSplitBill(true);
              }}
            >
              <Ionicons name="ticket-outline" size={22} color={paymentMethod === "prepaid" ? colors.primary : colors.mutedForeground} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.payLabel, { color: colors.foreground }]}>Use Prepaid Rounds</Text>
                <Text style={[styles.paySub, { color: prepaidBalance.remaining > 0 ? colors.primary : "#e53e3e" }]}>
                  {prepaidBalance.remaining} round{prepaidBalance.remaining !== 1 ? "s" : ""} remaining
                  {numPlayers > 1 ? " — covers your spot only, others pay their share" : " — covers your greens fee"}
                </Text>
              </View>
              {paymentMethod === "prepaid" && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
            </TouchableOpacity>
          )}

          {/* Prepaid + multi-player notice */}
          {paymentMethod === "prepaid" && numPlayers > 1 && (
            <View style={{ flexDirection: "row", gap: 6, alignItems: "flex-start", paddingHorizontal: 4, marginTop: -4 }}>
              <Ionicons name="information-circle-outline" size={15} color={colors.mutedForeground} style={{ marginTop: 1 }} />
              <Text style={{ flex: 1, fontSize: 12, color: colors.mutedForeground, lineHeight: 17 }}>
                Split billing is required when using prepaid rounds with other players. Each player will receive a payment request for their own share.
              </Text>
            </View>
          )}
          {/* Prepaid non-refundable notice */}
          {paymentMethod === "prepaid" && (
            <View style={{ flexDirection: "row", gap: 6, alignItems: "flex-start", paddingHorizontal: 4, backgroundColor: "#fff3cd", borderRadius: 8, padding: 8 }}>
              <Ionicons name="warning-outline" size={14} color="#a07c10" style={{ marginTop: 1 }} />
              <Text style={{ flex: 1, fontSize: 12, color: "#7d5a00", lineHeight: 17 }}>
                Prepaid rounds are non-refundable. Once confirmed, this round cannot be returned for cash, credit, or rollover — even if the booking is later cancelled.
              </Text>
            </View>
          )}

          {/* Junior pricing badge */}
          {isJunior && (
            <View style={[styles.juniorBadge, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "40" }]}>
              <Ionicons name="star" size={14} color={colors.primary} />
              <Text style={[styles.juniorBadgeText, { color: colors.primary }]}>
                Junior pricing applied (18 & under)
              </Text>
            </View>
          )}
          {isStudent && (
            <View style={[styles.juniorBadge, { backgroundColor: "#c8a84b22", borderColor: "#c8a84b66" }]}>
              <Ionicons name="school-outline" size={14} color="#c8a84b" />
              <Text style={[styles.juniorBadgeText, { color: "#c8a84b" }]}>
                Student pricing applied (18–24)
              </Text>
            </View>
          )}
          {isPensioner && (
            <View style={[styles.juniorBadge, { backgroundColor: "#6b7a9922", borderColor: "#6b7a9966" }]}>
              <Ionicons name="person-outline" size={14} color="#6b7a99" />
              <Text style={[styles.juniorBadgeText, { color: "#6b7a99" }]}>
                Pensioner pricing applied (65+)
              </Text>
            </View>
          )}

          {/* HNA / membership status — read-only, auto-populated from profile */}
          {isMember ? (
            <View style={[styles.hnaCard, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "40" }]}>
              <View style={styles.hnaRow}>
                <Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} />
                <Text style={[styles.hnaInput, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
                  Registered member — member pricing applies
                </Text>
              </View>
            </View>
          ) : hnaNumber.trim() && !hnaVerified ? (
            <View style={[styles.hnaCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.hnaRow}>
                <Ionicons name="card-outline" size={20} color={colors.mutedForeground} />
                <Text style={[styles.hnaInput, { color: colors.foreground }]}>HNA {hnaNumber}</Text>
              </View>
              <View style={[styles.hnaBadge, { backgroundColor: colors.muted + "55", borderTopColor: colors.border }]}>
                <Ionicons name="information-circle-outline" size={14} color={colors.mutedForeground} />
                <Text style={[styles.hnaBadgeText, { color: colors.mutedForeground }]}>
                  Not club-verified — standard visitor rate applies. A club verifies your HNA when they add you to their roster.
                </Text>
              </View>
            </View>
          ) : hnaNumber.trim() ? (
            <View style={[styles.hnaCard, { backgroundColor: colors.card, borderColor: colors.primary + "40" }]}>
              <View style={styles.hnaRow}>
                <Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} />
                <Text style={[styles.hnaInput, { color: colors.foreground }]}>HNA {hnaNumber} · Verified</Text>
                {hnaLoading && <ActivityIndicator size="small" color={colors.primary} />}
              </View>
              {!hnaLoading && hnaPrice18 !== null && hnaPrice18 < price18 && (
                <View style={[styles.hnaBadge, { backgroundColor: colors.primary + "12", borderTopColor: colors.primary + "25" }]}>
                  <Ionicons name="checkmark-circle" size={14} color={colors.primary} />
                  <Text style={[styles.hnaBadgeText, { color: colors.primary }]}>
                    Affiliated visitor rate applied · R{hnaPrice18.toFixed(2)}/18h
                    {effectivePrice9 != null ? ` · R${effectivePrice9.toFixed(2)}/9h` : ""}
                  </Text>
                </View>
              )}
              {!hnaLoading && hnaPrice18 !== null && hnaPrice18 >= price18 && (
                <View style={[styles.hnaBadge, { backgroundColor: colors.primary + "12", borderTopColor: colors.primary + "25" }]}>
                  <Ionicons name="checkmark-circle" size={14} color={colors.primary} />
                  <Text style={[styles.hnaBadgeText, { color: colors.primary }]}>
                    HNA on file · your current tier rate is more favourable
                  </Text>
                </View>
              )}
              {!hnaLoading && hnaPrice18 === null && (
                <View style={[styles.hnaBadge, { backgroundColor: colors.muted + "55", borderTopColor: colors.border }]}>
                  <Ionicons name="information-circle-outline" size={14} color={colors.mutedForeground} />
                  <Text style={[styles.hnaBadgeText, { color: colors.mutedForeground }]}>
                    No affiliated visitor rate set by this club
                  </Text>
                </View>
              )}
            </View>
          ) : null}

          {/* Voucher — shown only when club has enabled vouchers */}
          {voucherEnabled && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Vouchers</Text>
              {vouchersLoading ? (
                <View style={[styles.voucherEmptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={[styles.voucherEmptyText, { color: colors.mutedForeground }]}>Loading your vouchers…</Text>
                </View>
              ) : availableVouchers.length === 0 ? (
                <View style={[styles.voucherEmptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Ionicons name="ticket-outline" size={18} color={colors.mutedForeground} />
                  <Text style={[styles.voucherEmptyText, { color: colors.mutedForeground }]}>No vouchers available for this booking</Text>
                </View>
              ) : (
                availableVouchers.map((v) => {
                  const isSelected = appliedVoucher?.code === v.code;
                  return (
                    <TouchableOpacity
                      key={v.code}
                      style={[
                        styles.voucherOption,
                        {
                          backgroundColor: isSelected ? colors.primary + "10" : colors.card,
                          borderColor: isSelected ? colors.primary : colors.border,
                        },
                      ]}
                      onPress={() => isSelected ? removeVoucher() : selectVoucher(v)}
                      activeOpacity={0.75}
                    >
                      <View style={[styles.voucherOptionIcon, { backgroundColor: isSelected ? colors.primary + "20" : colors.muted }]}>
                        <Ionicons name="ticket-outline" size={18} color={isSelected ? colors.primary : colors.mutedForeground} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.voucherOptionLabel, { color: isSelected ? colors.primary : colors.foreground }]}>
                          {v.label}
                        </Text>
                        <Text style={[styles.voucherOptionSub, { color: colors.mutedForeground }]}>{v.sub}</Text>
                      </View>
                      <Ionicons
                        name={isSelected ? "checkmark-circle" : "radio-button-off"}
                        size={22}
                        color={isSelected ? colors.primary : colors.border}
                      />
                    </TouchableOpacity>
                  );
                })
              )}
            </>
          )}

          {/* Total */}
          <View style={[styles.totalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {hasPromo && (
              <>
                <View style={styles.totalLine}>
                  <Text style={[styles.totalLineLabel, { color: colors.mutedForeground }]}>Regular price</Text>
                  <Text style={[styles.totalLineVal, { color: colors.mutedForeground, textDecorationLine: "line-through" }]}>
                    R{(regularPrice * numPlayers).toFixed(2)}
                  </Text>
                </View>
                <View style={styles.totalLine}>
                  <Text style={[styles.totalLineLabel, { color: colors.accent }]}>Promo price</Text>
                  <Text style={[styles.totalLineVal, { color: colors.accent }]}>R{(promoPrice! * numPlayers).toFixed(2)}</Text>
                </View>
              </>
            )}
            {/* Per-player breakdown when split bill is on */}
            {splitBill && numPlayers > 1 && !effectiveTierPriced && !hasPromo && (
              <>
                {/* Organizer row */}
                <View style={[styles.totalLine, { alignItems: "flex-start" }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.totalLineLabel, { color: colors.foreground }]}>{user?.name ?? "You"}</Text>
                    <Text style={[styles.totalSub, { color: colors.mutedForeground }]}>
                      {[
                        paymentMethod === "prepaid" && isMember
                          ? cartShare > 0 ? `Free (prepaid) · R${cartShare.toFixed(2)} cart` : "Free (prepaid round)"
                          : cartShare > 0
                            ? `R${organizerGreens.toFixed(2)} greens · R${cartShare.toFixed(2)} cart`
                            : `R${organizerGreens.toFixed(2)} greens`,
                        organizerTierLabel,
                      ].join(" · ")}
                    </Text>
                  </View>
                  <Text style={[styles.totalLineVal, { color: colors.foreground }]}>
                    {paymentMethod === "prepaid" && isMember
                      ? cartShare > 0 ? `R${cartShare.toFixed(2)}` : "Free"
                      : `R${(organizerGreens + cartShare).toFixed(2)}`}
                  </Text>
                </View>
                {/* Invited player rows */}
                {playerBreakdownRows.map((row, i) => {
                  if (!row) return null;
                  const { player, greens, total, tierLabel } = row;
                  return (
                    <View key={i} style={[styles.totalLine, { alignItems: "flex-start", marginTop: 8 }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.totalLineLabel, { color: colors.foreground }]}>{player.name}</Text>
                        <Text style={[styles.totalSub, { color: colors.mutedForeground }]}>
                          {greens === null
                            ? "Fetching rate…"
                            : cartShare > 0
                              ? `R${greens.toFixed(2)} greens · R${cartShare.toFixed(2)} cart${tierLabel ? ` · ${tierLabel}` : ""}`
                              : `R${greens.toFixed(2)} greens${tierLabel ? ` · ${tierLabel}` : ""}`}
                        </Text>
                      </View>
                      <Text style={[styles.totalLineVal, { color: colors.foreground }]}>
                        {total === null ? "…" : `R${total.toFixed(2)}`}
                      </Text>
                    </View>
                  );
                })}
                <View style={[styles.totalDivider, { backgroundColor: colors.border, marginTop: 10 }]} />
              </>
            )}
            {appliedVoucher && (
              <View style={styles.totalLine}>
                <Text style={[styles.totalLineLabel, { color: "#4caf50" }]}>Voucher ({appliedVoucher.code})</Text>
                <Text style={[styles.totalLineVal, { color: "#4caf50" }]}>−R{appliedVoucher.discount_amount.toFixed(2)}</Text>
              </View>
            )}
            {/* Solo player breakdown row */}
            {numPlayers === 1 && !effectiveTierPriced && !hasPromo && (
              <>
                <View style={[styles.totalLine, { alignItems: "flex-start" }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.totalLineLabel, { color: colors.foreground }]}>{user?.name ?? "You"}</Text>
                    <Text style={[styles.totalSub, { color: colors.mutedForeground }]}>
                      {[
                        paymentMethod === "prepaid" && isMember
                          ? "Free (prepaid)"
                          : `R${organizerGreens.toFixed(2)} greens`,
                        cartFee > 0 ? `R${cartFee.toFixed(2)} cart` : null,
                        rangeBallsFee > 0 ? `R${rangeBallsFee.toFixed(2)} range balls` : null,
                        clubHireFee > 0 ? `R${clubHireFee.toFixed(2)} club hire` : null,
                        organizerTierLabel,
                      ].filter(Boolean).join(" · ")}
                    </Text>
                  </View>
                  <Text style={[styles.totalLineVal, { color: colors.foreground }]}>
                    {paymentMethod === "prepaid" && isMember
                      ? myAmount > 0 ? `R${myAmount.toFixed(2)}` : "Free"
                      : `R${myAmount.toFixed(2)}`}
                  </Text>
                </View>
                <View style={[styles.totalDivider, { backgroundColor: colors.border, marginTop: 10 }]} />
              </>
            )}
            {!(splitBill && numPlayers > 1 && !effectiveTierPriced && !hasPromo) && numPlayers > 1 && cartFee > 0 && (
              <View style={styles.totalLine}>
                <Text style={[styles.totalLineLabel, { color: colors.accent }]}>Golf Cart ({numCarts} × R{cartUnitPrice.toFixed(2)})</Text>
                <Text style={[styles.totalLineVal, { color: colors.accent }]}>+R{cartFee.toFixed(2)}</Text>
              </View>
            )}
            {rangeBallsFee > 0 && (
              <View style={styles.totalLine}>
                <Text style={[styles.totalLineLabel, { color: colors.accent }]}>Driving Range Balls</Text>
                <Text style={[styles.totalLineVal, { color: colors.accent }]}>+R{rangeBallsFee.toFixed(2)}</Text>
              </View>
            )}
            {clubHireFee > 0 && (
              <View style={styles.totalLine}>
                <Text style={[styles.totalLineLabel, { color: colors.accent }]}>Club Hire</Text>
                <Text style={[styles.totalLineVal, { color: colors.accent }]}>+R{clubHireFee.toFixed(2)}</Text>
              </View>
            )}
            {(hasPromo || appliedVoucher || (cartFee > 0 && numPlayers > 1 && !(splitBill && numPlayers > 1 && !effectiveTierPriced && !hasPromo))) && (
              <View style={[styles.totalDivider, { backgroundColor: colors.border }]} />
            )}
            <View style={styles.totalLine}>
              <View>
                <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>
                  {paymentMethod === "pay_at_club"
                    ? "Due now"
                    : splitBill && numPlayers > 1 ? "Your share" : "Total"}
                </Text>
                {splitBill && numPlayers > 1 && !effectiveTierPriced && paymentMethod !== "pay_at_club" && (
                  <Text style={[styles.totalSub, { color: colors.mutedForeground }]}>Full total: R{totalAmount.toFixed(2)}</Text>
                )}
              </View>
              {paymentMethod === "pay_at_club" ? (
                <Text style={[styles.totalAmount, { color: colors.primary }]}>R{platformFee.toFixed(2)}</Text>
              ) : paymentMethod === "prepaid" && isMember ? (
                <Text style={[styles.totalAmount, { color: colors.primary }]}>
                  {myAmount > 0 ? `R${myAmount.toFixed(2)}` : "Free (prepaid round)"}
                </Text>
              ) : effectiveTierPriced ? (
                <Text style={[styles.totalAmount, { color: colors.primary, fontSize: 16 }]}>Membership pricing</Text>
              ) : (
                <Text style={[styles.totalAmount, { color: colors.primary }]}>R{myAmount.toFixed(2)}</Text>
              )}
            </View>
            {paymentMethod === "pay_at_club" ? (
              <>
                <View style={[styles.totalLine, { marginTop: 4 }]}>
                  <Text style={[styles.totalSub, { color: colors.mutedForeground }]}>Full greens fee</Text>
                  <Text style={[styles.totalSub, { color: colors.mutedForeground }]}>R{myAmount.toFixed(2)}</Text>
                </View>
                <View style={[styles.totalLine, { marginTop: 2 }]}>
                  <Text style={[styles.totalSub, { color: colors.mutedForeground }]}>− Commitment fee (paid now)</Text>
                  <Text style={[styles.totalSub, { color: "#e53935" }]}>−R{platformFee.toFixed(2)}</Text>
                </View>
                <View style={[styles.totalDivider, { backgroundColor: colors.border, marginTop: 6 }]} />
                <View style={[styles.totalLine, { marginTop: 4 }]}>
                  <Text style={[styles.totalSub, { color: colors.foreground, fontWeight: "600" }]}>Due at club</Text>
                  <Text style={[styles.totalSub, { color: colors.foreground, fontWeight: "600" }]}>R{(myAmount - platformFee).toFixed(2)}</Text>
                </View>
              </>
            ) : !effectiveTierPriced && !(paymentMethod === "prepaid" && isMember) && myAmount > 0 ? (
              <View style={[styles.totalLine, { marginTop: 4 }]}>
                <Text style={[styles.totalSub, { color: colors.mutedForeground }]}>Incl. VAT ({vatPct}%)</Text>
                <Text style={[styles.totalSub, { color: colors.mutedForeground }]}>R{(myAmount * vatPct / (100 + vatPct)).toFixed(2)}</Text>
              </View>
            ) : null}
          </View>

          {/* Book error */}
          {bookError && (
            <View style={[styles.errorRow, { backgroundColor: "#ffebee", borderColor: "#e53935" }]}>
              <Ionicons name="alert-circle-outline" size={16} color="#e53935" />
              <Text style={[styles.errorText, { color: "#e53935" }]}>{bookError}</Text>
            </View>
          )}

          {/* Book button */}
          <TouchableOpacity
            style={[styles.bookBtn, { backgroundColor: (submitting || (paymentMethod === "wallet" && walletBalance !== null && walletBalance < myAmount)) ? colors.muted : colors.primary }]}
            onPress={() => { setBookError(null); handleBook(); }}
            disabled={submitting || (paymentMethod === "wallet" && walletBalance !== null && walletBalance < myAmount)}
            activeOpacity={0.85}
          >
            <Text style={styles.bookBtnText}>{submitting ? "Processing…" : "Confirm Booking"}</Text>
          </TouchableOpacity>
        </View>
        <View style={{ height: Platform.OS === "web" ? 50 : 40 }} />
      </ScrollView>

      {/* ── Player Picker Modal ─────────────────────────────────────────────── */}
      <Modal
        visible={pickerOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closePicker}
      >
        <View style={[styles.modalWrap, { backgroundColor: colors.background }]}>
          {/* Modal header */}
          <View style={[styles.modalHeader, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Add Player {pickerSlot + 2}</Text>
              <TouchableOpacity onPress={closePicker} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={24} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            {/* Tabs */}
            <View style={styles.tabRow}>
              {(["friends", "search", "guest"] as PickerTab[]).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[
                    styles.tab,
                    pickerTab === t && { borderBottomColor: colors.primary, borderBottomWidth: 2 },
                  ]}
                  onPress={() => { setPickerTab(t); setSearchQuery(""); }}
                >
                  <Text style={[styles.tabText, { color: pickerTab === t ? colors.primary : colors.mutedForeground }]}>
                    {t === "friends" ? `Friends (${friends.length})` : t === "search" ? "Search" : "Guest"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* ── Friends tab ──────────────────────────────────────────────────── */}
          {pickerTab === "friends" && (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }} keyboardShouldPersistTaps="handled">
              {friends.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="people-outline" size={48} color={colors.mutedForeground} />
                  <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No friends yet</Text>
                  <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                    Switch to Search to find any player by name or email
                  </Text>
                </View>
              ) : (
                friends.map((f) => {
                  const added = isAlreadyAdded(f.id);
                  return (
                    <TouchableOpacity
                      key={f.id}
                      style={[
                        styles.playerRow,
                        { backgroundColor: colors.card, borderColor: added ? colors.primary + "44" : colors.border },
                        added && { opacity: 0.5 },
                      ]}
                      onPress={() => !added && selectPlayer({ type: "friend", id: f.id, name: f.name, avatar: f.avatar })}
                      disabled={added}
                      activeOpacity={0.7}
                    >
                      <Avatar name={f.name} avatar={f.avatar} size={44} colors={colors} />
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={[styles.playerRowName, { color: colors.foreground }]}>{f.name}</Text>
                        <Text style={[styles.playerRowSub, { color: colors.mutedForeground }]}>
                          {f.handicap != null ? `HCP ${f.handicap}` : f.email}
                        </Text>
                      </View>
                      <Ionicons
                        name={added ? "checkmark-circle" : "add-circle-outline"}
                        size={22}
                        color={added ? colors.primary : colors.primary}
                      />
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          )}

          {/* ── Search tab ───────────────────────────────────────────────────── */}
          {pickerTab === "search" && (
            <View style={{ flex: 1 }}>
              <View style={[styles.searchBox, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
                <Ionicons name="search-outline" size={18} color={colors.mutedForeground} />
                <TextInput
                  style={[styles.searchInput, { color: colors.foreground }]}
                  placeholder="Name or email address…"
                  placeholderTextColor={colors.mutedForeground}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoFocus
                  autoCorrect={false}
                  returnKeyType="search"
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => { setSearchQuery(""); setSearchResults([]); }}>
                    <Ionicons name="close-circle" size={18} color={colors.mutedForeground} />
                  </TouchableOpacity>
                )}
              </View>
              <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }} keyboardShouldPersistTaps="handled">
                {searchLoading ? (
                  <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
                ) : searchQuery.length < 2 ? (
                  <View style={styles.emptyState}>
                    <Ionicons name="search-outline" size={48} color={colors.mutedForeground} />
                    <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Search players</Text>
                    <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>Type at least 2 characters</Text>
                  </View>
                ) : searchResults.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Ionicons name="person-outline" size={48} color={colors.mutedForeground} />
                    <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No players found</Text>
                    <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>Try a different name or use the Guest tab</Text>
                  </View>
                ) : (
                  searchResults.map((u: any) => {
                    const added = isAlreadyAdded(u.id);
                    return (
                      <TouchableOpacity
                        key={u.id}
                        style={[
                          styles.playerRow,
                          { backgroundColor: colors.card, borderColor: added ? colors.primary + "44" : colors.border },
                          added && { opacity: 0.5 },
                        ]}
                        onPress={() => !added && selectPlayer({ type: "user", id: u.id, name: u.name, avatar: u.avatar })}
                        disabled={added}
                        activeOpacity={0.7}
                      >
                        <Avatar name={u.name} avatar={u.avatar} size={44} colors={colors} />
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <Text style={[styles.playerRowName, { color: colors.foreground }]}>{u.name}</Text>
                          <Text style={[styles.playerRowSub, { color: colors.mutedForeground }]}>
                            {u.handicap != null ? `HCP ${u.handicap} · ${u.email}` : u.email}
                          </Text>
                        </View>
                        <Ionicons
                          name={added ? "checkmark-circle" : "add-circle-outline"}
                          size={22}
                          color={colors.primary}
                        />
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>
            </View>
          )}

          {/* ── Guest tab ────────────────────────────────────────────────────── */}
          {pickerTab === "guest" && (
            <View style={{ flex: 1, padding: 20, gap: 16 }}>
              <View style={[styles.guestInfoBox, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "30" }]}>
                <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
                <Text style={[styles.guestInfoText, { color: colors.primary }]}>
                  Guest players don't need a TapIn account. If split billing is on, you'll cover their share.
                </Text>
              </View>
              <View>
                <Text style={[styles.guestLabel, { color: colors.foreground }]}>Guest's Full Name</Text>
                <TextInput
                  style={[styles.guestInput, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]}
                  placeholder="e.g. John Smith"
                  placeholderTextColor={colors.mutedForeground}
                  value={guestName}
                  onChangeText={setGuestName}
                  autoCapitalize="words"
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={() => { if (guestName.trim().length >= 2) selectPlayer({ type: "guest", name: guestName.trim() }); }}
                />
              </View>
              <TouchableOpacity
                style={[
                  styles.guestAddBtn,
                  { backgroundColor: guestName.trim().length >= 2 ? colors.primary : colors.muted },
                ]}
                disabled={guestName.trim().length < 2}
                onPress={() => { if (guestName.trim().length >= 2) selectPlayer({ type: "guest", name: guestName.trim() }); }}
                activeOpacity={0.85}
              >
                <Ionicons name="person-add-outline" size={18} color="#fff" />
                <Text style={styles.guestAddBtnText}>Add Guest Player</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  header:              { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 16 },
  headerTitle:         { fontSize: 18, fontFamily: "Inter_700Bold" },
  content:             { padding: 20, gap: 16 },
  summaryCard:         { borderRadius: 14, borderWidth: 1, padding: 16, gap: 10 },
  summaryClub:         { fontSize: 18, fontFamily: "Inter_700Bold" },
  summaryRow:          { flexDirection: "row", gap: 20 },
  summaryItem:         { flexDirection: "row", alignItems: "center", gap: 6 },
  summaryText:         { fontSize: 14, fontFamily: "Inter_500Medium" },
  promoBanner:         { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
  promoBannerText:     { fontSize: 13, fontFamily: "Inter_600SemiBold", flex: 1 },
  promoBannerOld:      { fontSize: 12, fontFamily: "Inter_400Regular", textDecorationLine: "line-through" },
  sectionTitle:        { fontSize: 17, fontFamily: "Inter_700Bold", marginTop: 4 },
  ballRow:             { flexDirection: "row", gap: 10 },
  ballBtn:             { flex: 1, borderRadius: 14, borderWidth: 1.5, paddingVertical: 14, alignItems: "center", gap: 4 },
  ballNum:             { fontSize: 20, fontFamily: "Inter_700Bold" },
  ballLabel:           { fontSize: 10, fontFamily: "Inter_500Medium" },

  // Player slots
  playerSlotsHeader:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  playerSlotsCount:    { fontSize: 13, fontFamily: "Inter_500Medium" },
  playerSlotFilled:    { flexDirection: "row", alignItems: "center", borderRadius: 14, borderWidth: 1, padding: 12 },
  playerName:          { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  playerType:          { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  playerSlotEmpty:     { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 1.5, borderStyle: "dashed", padding: 14 },
  playerAddCircle:     { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  playerSlotLabel:     { fontSize: 15, fontFamily: "Inter_600SemiBold" },

  // Cart
  cartCard:            { borderRadius: 14, borderWidth: 1, padding: 14 },
  cartRow:             { flexDirection: "row", alignItems: "center", gap: 12 },
  cartIconBadge:       { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  cartTitle:           { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  cartSub:             { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  cartBadge:           { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  cartBadgeText:       { color: "#fff", fontSize: 11, fontFamily: "Inter_600SemiBold" },

  splitRow:            { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderRadius: 14, borderWidth: 1, padding: 16 },
  splitLabel:          { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  splitSub:            { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  paymentOption:       { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 14, borderWidth: 1.5, padding: 14 },
  payLabel:            { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  paySub:              { fontSize: 12, fontFamily: "Inter_400Regular" },
  juniorBadge:         { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 4 },
  juniorBadgeText:     { fontSize: 13, fontFamily: "Inter_600SemiBold", flex: 1 },
  hnaCard:             { borderWidth: 1.5, borderRadius: 12, overflow: "hidden" },
  hnaRow:              { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, height: 50 },
  hnaInput:            { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium", letterSpacing: 0.5 },
  hnaBadge:            { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 1 },
  hnaBadgeText:        { fontSize: 12, fontFamily: "Inter_500Medium", flex: 1 },
  voucherEmptyCard:    { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, borderWidth: 1, padding: 14 },
  voucherEmptyText:    { fontSize: 14, fontFamily: "Inter_400Regular", flex: 1 },
  voucherOption:       { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 1.5, padding: 14, marginBottom: 8 },
  voucherOptionIcon:   { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  voucherOptionLabel:  { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  voucherOptionSub:    { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  totalCard:           { borderRadius: 14, borderWidth: 1, padding: 16, gap: 8 },
  totalLine:           { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  totalLineLabel:      { fontSize: 13, fontFamily: "Inter_400Regular" },
  totalLineVal:        { fontSize: 13, fontFamily: "Inter_500Medium" },
  totalDivider:        { height: 1, marginVertical: 4 },
  totalLabel:          { fontSize: 14, fontFamily: "Inter_500Medium" },
  totalSub:            { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  totalAmount:         { fontSize: 24, fontFamily: "Inter_700Bold" },
  errorRow:            { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, borderWidth: 1, padding: 12 },
  errorText:           { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  bookBtn:             { borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  bookBtnText:         { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },

  // Modal
  modalWrap:           { flex: 1 },
  modalHeader:         { borderBottomWidth: 1, paddingBottom: 0 },
  modalHandle:         { width: 40, height: 4, borderRadius: 2, backgroundColor: "#ddd", alignSelf: "center", marginTop: 10, marginBottom: 6 },
  modalHeaderRow:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 12 },
  modalTitle:          { fontSize: 17, fontFamily: "Inter_700Bold" },
  tabRow:              { flexDirection: "row" },
  tab:                 { flex: 1, alignItems: "center", paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabText:             { fontSize: 14, fontFamily: "Inter_600SemiBold" },

  // Player rows in modal
  playerRow:           { flexDirection: "row", alignItems: "center", borderRadius: 14, borderWidth: 1, padding: 12 },
  playerRowName:       { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  playerRowSub:        { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },

  // Search
  searchBox:           { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  searchInput:         { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },

  // Empty states
  emptyState:          { alignItems: "center", paddingTop: 40, gap: 10 },
  emptyTitle:          { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  emptySub:            { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", paddingHorizontal: 20 },

  // Guest tab
  guestInfoBox:        { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 12, borderWidth: 1, padding: 12 },
  guestInfoText:       { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  guestLabel:          { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 8 },
  guestInput:          { height: 52, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 16, fontSize: 16, fontFamily: "Inter_400Regular" },
  guestAddBtn:         { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 15 },
  guestAddBtnText:     { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
});
