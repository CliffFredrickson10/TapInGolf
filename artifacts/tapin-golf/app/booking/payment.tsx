import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/lib/api";

// Matches ONLY the navigation target's path — never the `redirect_url` query
// param embedded in the Stitch payment URL. react-native-webview often reports
// request.url with the query string decoded, so a naive substring check on the
// initial page load would match the `redirect_url=.../booking/success` param and
// instantly bounce the user out before the Stitch page ever renders.
function matchRedirect(rawUrl: string): "success" | "cancel" | null {
  if (!rawUrl) return null;
  let path = rawUrl;
  try {
    path = new URL(rawUrl).pathname;
  } catch {
    // Fallback: strip query/fragment manually if URL() is unavailable
    path = rawUrl.split("?")[0].split("#")[0];
  }
  if (path.endsWith("/booking/success")) return "success";
  if (path.endsWith("/booking/cancel")) return "cancel";
  return null;
}

export default function PaymentScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { url, booking_id, is_player_pay, mode, topup_id } = useLocalSearchParams<{
    url: string;
    booking_id: string;
    is_player_pay?: string;
    mode?: string;
    topup_id?: string;
  }>();

  const handled      = useRef(false);
  const pollTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showDoneBtn, setShowDoneBtn] = useState(false);
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const isPlayerPay = is_player_pay === "1";
  const isWalletTopup = mode === "wallet";

  // ── Single entry-point for confirmed payment ─────────────────────────────────
  const handleSuccess = async () => {
    if (handled.current) return;
    handled.current = true;
    if (pollTimer.current) clearTimeout(pollTimer.current);
    if (isWalletTopup) {
      router.replace("/payments" as any);
      return;
    }
    if (isPlayerPay && user) {
      try {
        await apiFetch(`/bookings/${booking_id}/player-paid`, user.token, { method: "PUT" });
      } catch {}
    }
    // Confirm the booking server-side immediately on return from the payment page.
    // This is the most reliable path in dev (where the webhook URL may be stale)
    // and is idempotent — the webhook can still arrive later with no harm done.
    if (booking_id && user && !isPlayerPay) {
      try {
        await apiFetch(`/bookings/${booking_id}/confirm-payment`, user.token, { method: "POST" });
      } catch {}
    }
    router.replace({ pathname: "/booking/[id]", params: { id: booking_id } });
  };

  const handleCancel = () => {
    if (handled.current) return;
    handled.current = true;
    if (pollTimer.current) clearTimeout(pollTimer.current);
    router.back();
  };

  // ── Background status polling (most reliable — ITN confirms server-side) ─────
  useEffect(() => {
    if (Platform.OS === "web" || !user) return;
    // Wallet top-up polling
    if (isWalletTopup && topup_id) {
      let cancelled = false;
      const poll = async () => {
        if (cancelled || handled.current) return;
        try {
          const data = await apiFetch(`/payments/wallet/topup-status/${topup_id}`, user.token);
          if (data.status === "completed" && !handled.current) {
            if (!cancelled) handleSuccess();
            return;
          }
        } catch {}
        if (!cancelled && !handled.current) pollTimer.current = setTimeout(poll, 3000);
      };
      pollTimer.current = setTimeout(poll, 5000);
      const btnTimer = setTimeout(() => { if (!cancelled && !handled.current) setShowDoneBtn(true); }, 8000);
      return () => { cancelled = true; if (pollTimer.current) clearTimeout(pollTimer.current); clearTimeout(btnTimer); };
    }
    if (!booking_id) return;

    let cancelled = false;

    const poll = async () => {
      if (cancelled || handled.current) return;
      try {
        const data = await apiFetch(`/bookings/${booking_id}`, user.token);
        const status = data.booking?.status;
        if ((status === "confirmed" || status === "completed") && !handled.current) {
          if (!cancelled) handleSuccess();
          return;
        }
        // Organizer path: drive confirmation server-side. confirm-payment now
        // verifies the payment with Stitch, so this self-heals any brief lag
        // between the success redirect and Stitch reporting PAID — without the
        // user having to retry (which would mint a second payment link).
        if (!isPlayerPay && status === "pending" && !cancelled && !handled.current) {
          try {
            await apiFetch(`/bookings/${booking_id}/confirm-payment`, user.token, { method: "POST" });
          } catch {}
        }
      } catch {}
      if (!cancelled && !handled.current) {
        pollTimer.current = setTimeout(poll, 3000);
      }
    };

    // Start polling after 6 s (give PayFast time to complete ITN)
    pollTimer.current = setTimeout(poll, 6000);

    // Show manual "done" button after 8 s in case polling/redirect both stall
    const btnTimer = setTimeout(() => {
      if (!cancelled && !handled.current) setShowDoneBtn(true);
    }, 8000);

    return () => {
      cancelled = true;
      if (pollTimer.current) clearTimeout(pollTimer.current);
      clearTimeout(btnTimer);
    };
  }, [booking_id, user?.token]);

  const [stitchOpened, setStitchOpened] = useState(false);

  const openStitch = () => {
    Linking.openURL(url);
    setStitchOpened(true);
  };

  // ── Web branch ────────────────────────────────────────────────────────────────
  if (Platform.OS === "web") {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topPad + 12 }]}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="close" size={24} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            {isPlayerPay ? "Pay Your Share" : "Complete Payment"}
          </Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.center}>
          <View style={[styles.iconCircle, { backgroundColor: colors.primary + "18" }]}>
            <Ionicons name="card-outline" size={40} color={colors.primary} />
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>
            {isWalletTopup ? "Top Up Wallet" : "PayFast Payment"}
          </Text>
          <Text style={[styles.sub, { color: colors.mutedForeground }]}>
            Tap the button below to open the PayFast secure payment page.{"\n"}
            Return here once your payment is complete.
          </Text>

          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            onPress={openStitch}
          >
            <Ionicons name="open-outline" size={18} color="#fff" />
            <Text style={styles.primaryBtnText}>Open PayFast</Text>
          </TouchableOpacity>

          {stitchOpened && (
            <TouchableOpacity
              style={[styles.secondaryBtn, { borderColor: colors.primary }]}
              onPress={handleSuccess}
            >
              <Ionicons name="checkmark-circle-outline" size={18} color={colors.primary} />
              <Text style={[styles.secondaryBtnText, { color: colors.primary }]}>
                I&apos;ve completed my payment
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 8 }}>
            <Text style={[styles.cancelLink, { color: colors.mutedForeground }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Native branch (WebView) ───────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <TouchableOpacity onPress={handleCancel}>
          <Ionicons name="close" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          {isWalletTopup ? "Top Up Wallet" : isPlayerPay ? "Pay Your Share" : "Complete Payment"}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <WebView
        source={{ uri: url }}
        style={{ flex: 1 }}
        // Layer 1: intercept before the page loads (works for most GET redirects)
        onShouldStartLoadWithRequest={(request) => {
          const result = matchRedirect(request.url);
          if (result === "success") { handleSuccess(); return false; }
          if (result === "cancel")  { handleCancel();  return false; }
          return true;
        }}
        // Layer 2: fallback for server-side 302 redirects that bypass layer 1
        onNavigationStateChange={(nav) => {
          const result = matchRedirect(nav.url);
          if (result === "success") handleSuccess();
          if (result === "cancel")  handleCancel();
        }}
      />

      {/* Layer 3: visible manual button — appears after 8 s if polling/redirect stall */}
      {showDoneBtn && (
        <View style={[styles.doneBanner, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.doneBannerText, { color: colors.mutedForeground }]}>
            Payment completed?
          </Text>
          <TouchableOpacity
            style={[styles.doneBtn, { backgroundColor: colors.primary }]}
            onPress={handleSuccess}
          >
            <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
            <Text style={styles.doneBtnText}>Confirm &amp; Continue</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 16,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: { fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center" },
  sub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 14,
    paddingHorizontal: 32,
    paddingVertical: 15,
    width: "100%",
    justifyContent: "center",
    marginTop: 4,
  },
  primaryBtnText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 16 },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 24,
    paddingVertical: 13,
    width: "100%",
    justifyContent: "center",
  },
  secondaryBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  cancelLink: { fontSize: 14, fontFamily: "Inter_400Regular" },
  doneBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    gap: 10,
  },
  doneBannerText: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  doneBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  doneBtnText: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#fff" },
});
