import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  FlatList,
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
import { useColors } from "@/hooks/useColors";

// ─── FAQ Database ────────────────────────────────────────────────────────────

type FAQEntry = {
  id: string;
  question: string;
  answer: string;
  keywords: string[];
  category: string;
};

const FAQ: FAQEntry[] = [
  // ── Booking ──
  {
    id: "book-1",
    category: "Booking",
    question: "How do I book a tee time?",
    answer:
      "To book a tee time:\n\n1. Tap **Explore** in the bottom tab bar.\n2. Search or browse for a golf club.\n3. Tap a club to open its detail page.\n4. Choose a date and tap an available time slot.\n5. Select 9 or 18 holes and the number of players.\n6. Optionally add partners and a cart, then tap **Continue to Payment**.\n\nOnce payment is confirmed your booking appears under **My Bookings**.",
    keywords: ["book", "booking", "tee", "time", "reserve", "slot", "schedule", "how"],
  },
  {
    id: "book-2",
    category: "Booking",
    question: "How do I add players to my booking?",
    answer:
      "During the booking flow, after choosing your tee time, you'll see an **Add Partners** section. You can:\n\n• Search your **Friends list** and tap to add them.\n• Search **all TapIn users** by name or email.\n• Add a **Guest** (name only, no account needed).\n\nYou can add up to 3 partners (4-ball total). Each partner will be notified and can pay their own share if you enable split billing.",
    keywords: ["add", "player", "partner", "friend", "guest", "fourball", "4ball", "group"],
  },
  {
    id: "book-3",
    category: "Booking",
    question: "Can I book for 9 or 18 holes?",
    answer:
      "Yes — if the club offers both options you'll see a **9 Holes / 18 Holes** toggle on the tee time selection screen. The price and availability update automatically based on your choice. Some clubs only offer 18 holes; in that case only one option will be shown.",
    keywords: ["9", "18", "holes", "nine", "eighteen", "half", "round"],
  },
  {
    id: "book-4",
    category: "Booking",
    question: "How do I cancel a booking?",
    answer:
      "To cancel a booking:\n\n1. Go to **My Bookings** (Bookings tab or the link in My Profile).\n2. Tap the booking you want to cancel.\n3. Scroll down and tap **Cancel Booking**.\n4. Confirm the cancellation in the prompt.\n\nCancellation policies are set by each club. Check the booking details for any deadlines or fees.",
    keywords: ["cancel", "cancellation", "delete", "remove", "booking", "refund"],
  },
  {
    id: "book-5",
    category: "Booking",
    question: "What does a 'Pending' booking status mean?",
    answer:
      "A **Pending** status means your booking has been submitted but payment has not yet been completed or confirmed by the club. Once your payment goes through successfully the status changes to **Confirmed**.\n\nIf a booking stays Pending for a long time, check that your payment was processed. You can retry payment from the booking detail screen.",
    keywords: ["pending", "status", "confirmed", "waiting", "payment", "confirm"],
  },
  {
    id: "book-6",
    category: "Booking",
    question: "What is a booking reference number?",
    answer:
      "Your booking reference number is a unique ID assigned to your round. You'll see it on your booking confirmation screen and in **My Bookings**. Show it to the pro shop on arrival so they can pull up your booking quickly.",
    keywords: ["reference", "number", "ref", "id", "code", "proshop", "arrival"],
  },

  // ── Payments & Split Bill ──
  {
    id: "pay-1",
    category: "Payments",
    question: "What payment methods are accepted?",
    answer:
      "TapIn Golf supports three payment methods:\n\n• **PayFast** — credit/debit card or EFT (South African bank transfer).\n• **Google Pay** — available on Android devices.\n• **Apple Pay** — available on iPhones with Apple Pay set up.\n\nAll prices are in South African Rand (ZAR).",
    keywords: ["payment", "pay", "method", "payfast", "google", "apple", "card", "eft", "credit", "debit", "rand", "zar"],
  },
  {
    id: "pay-2",
    category: "Payments",
    question: "How does split billing work?",
    answer:
      "When creating a booking, toggle **Split Bill Equally** on the payment screen. The total green fee (and cart hire if applicable) is divided equally among all players.\n\nEach invited player receives a notification and can pay their own share directly through the app from their **My Bookings** tab. The organiser only pays their portion.",
    keywords: ["split", "bill", "billing", "share", "divide", "each", "player", "separate"],
  },
  {
    id: "pay-3",
    category: "Payments",
    question: "Can other players pay their own share?",
    answer:
      "Yes! If the organiser enables **Split Bill Equally**, each player in the booking will see a **Pay My Share** button in their My Bookings screen. They can pay their portion independently using any of the supported payment methods (PayFast, Google Pay, Apple Pay).",
    keywords: ["pay", "share", "own", "individual", "player", "split", "their"],
  },
  {
    id: "pay-4",
    category: "Payments",
    question: "How do I use a voucher or discount code?",
    answer:
      "On the payment summary screen (just before confirming your booking) you'll see an **Apply Voucher** field. Enter your code and tap Apply. If the code is valid, the discount will be reflected in the total immediately.\n\nVouchers can be fixed-amount (e.g. R50 off) or percentage-based (e.g. 10% off).",
    keywords: ["voucher", "discount", "code", "promo", "coupon", "apply", "off"],
  },

  // ── Remove Ads ──
  {
    id: "ads-1",
    category: "Ads",
    question: "How do I remove ads?",
    answer:
      "Go to **Settings → Remove Ads**. You can purchase an ad-free experience for a small monthly fee (R29.99 for 30 days). Payment is processed via PayFast. Once active, all banner ads disappear across the app until your subscription expires.",
    keywords: ["remove", "ads", "ad", "free", "banner", "advert", "subscription", "noads"],
  },

  // ── Friends ──
  {
    id: "friends-1",
    category: "Friends",
    question: "How do I add a friend?",
    answer:
      "Go to the **Friends** tab in the bottom bar. Tap **Add Friend**, then search by name or email address. Tap the user you want to add and send them a friend request. They'll receive a notification and can accept or decline.",
    keywords: ["add", "friend", "request", "invite", "search", "find", "user"],
  },
  {
    id: "friends-2",
    category: "Friends",
    question: "How do I remove a friend?",
    answer:
      "Open the **Friends** tab, find the friend you want to remove, and tap on their card. You'll see a **Remove Friend** option. Confirm the removal — they won't be notified.",
    keywords: ["remove", "unfriend", "delete", "friend", "block"],
  },
  {
    id: "friends-3",
    category: "Friends",
    question: "How do I block a user?",
    answer:
      "Go to **Settings → Privacy → Blocked Users**. Tap **Block Someone**, search by name or email, and confirm. Blocked users cannot send you messages, friend requests, or add you to bookings.\n\nYou can unblock someone from the same Blocked Users screen at any time.",
    keywords: ["block", "blocked", "unblock", "user", "privacy", "report"],
  },

  // ── Messaging ──
  {
    id: "msg-1",
    category: "Messaging",
    question: "How do I message someone?",
    answer:
      "Tap the **chat bubble icon** in the top-right corner of the Home or Friends screen to open Messages. Tap the **compose** icon (pencil) to start a new conversation — you can message any friend or create a group chat.\n\nYou can also start a chat directly from someone's friend card.",
    keywords: ["message", "chat", "send", "dm", "direct", "conversation", "talk", "text"],
  },
  {
    id: "msg-2",
    category: "Messaging",
    question: "Can I send GIFs in chat?",
    answer:
      "Yes! In any chat conversation, tap the **GIF** button in the message bar to open the GIF picker. Search for a GIF and tap to send it. GIFs are a great way to celebrate after a good round! 🏌️",
    keywords: ["gif", "gifs", "image", "animated", "sticker", "fun"],
  },

  // ── Join a Game ──
  {
    id: "join-1",
    category: "Join a Game",
    question: "What is 'Join a Game'?",
    answer:
      "**Join a Game** lets you find existing bookings that have open spots and join them. It's a great way to play without organising a full group yourself, or to meet new golfers.\n\nYou'll see open games listed by club, date, and time. Tap one to view details and request to join.",
    keywords: ["join", "game", "open", "spot", "find", "play", "meet", "single"],
  },
  {
    id: "join-2",
    category: "Join a Game",
    question: "How do I make my booking open for others to join?",
    answer:
      "When creating a booking, if you have fewer than 4 players you can mark the round as **open** so other golfers can request to join. You'll receive a notification when someone wants to join and can accept or decline.",
    keywords: ["open", "join", "others", "public", "allow", "request", "accept"],
  },

  // ── Clubs & Explore ──
  {
    id: "clubs-1",
    category: "Clubs",
    question: "How do I find clubs near me?",
    answer:
      "Open the **Explore** tab. The app shows clubs across all South African provinces. You can:\n\n• **Search** by club name or suburb using the search bar.\n• **Filter by Province** to narrow results to your region.\n• **Filter by Distance** (10 km to 50 km) — requires location permission.\n• Tap **Map** to switch to a map view and see clubs around you visually.",
    keywords: ["find", "club", "near", "nearby", "search", "location", "distance", "explore", "province"],
  },
  {
    id: "clubs-2",
    category: "Clubs",
    question: "How do I view clubs on a map?",
    answer:
      "On the **Explore** tab, tap the **Map** button (top-right). The map shows all clubs as pins. Tap a pin to see the club name and distance, then tap it again to open the full club detail page.",
    keywords: ["map", "pin", "view", "location", "nearby", "see", "visual"],
  },
  {
    id: "clubs-3",
    category: "Clubs",
    question: "What information is shown for each club?",
    answer:
      "Each club page shows:\n\n• **Photos** of the course\n• **Facilities** — pro shop, restaurant, bar, driving range, etc.\n• **Cart availability** and hire rates\n• **Green fees** for 9 and 18 holes\n• **Available tee times** for the next 7 days\n• **Reviews** and ratings from other golfers\n• **Upcoming events** hosted at the club",
    keywords: ["club", "detail", "info", "facilities", "photos", "review", "rating", "events", "green", "fee"],
  },

  // ── Scoring ──
  {
    id: "score-1",
    category: "Scoring",
    question: "Is live scoring available?",
    answer:
      "Live scorecards, handicap tracking, and round history are **coming soon**! The Scoring tab is currently a placeholder. Keep the app updated — this feature will be released in an upcoming version.",
    keywords: ["score", "scoring", "scorecard", "handicap", "track", "round", "history", "live", "coming"],
  },

  // ── Profile & Account ──
  {
    id: "profile-1",
    category: "Profile",
    question: "How do I edit my profile?",
    answer:
      "Tap the **≡ menu** (top-right on the Home screen) and select **My Profile**. You'll see an **Edit Profile** button. From there you can update:\n\n• Name, phone number\n• Handicap index\n• Gender and date of birth\n• Home province (or tap Auto-detect)\n• Email address and password\n• Profile photo (tap your avatar)",
    keywords: ["edit", "profile", "update", "change", "name", "phone", "handicap", "gender", "province", "info"],
  },
  {
    id: "profile-2",
    category: "Profile",
    question: "How do I change my profile photo?",
    answer:
      "On the **My Profile** screen, tap your profile photo or the camera icon badge. Your device's photo library will open — choose a photo, crop it, and it will upload automatically.",
    keywords: ["photo", "picture", "avatar", "image", "profile", "change", "upload", "camera"],
  },
  {
    id: "profile-3",
    category: "Profile",
    question: "How do I change my email or password?",
    answer:
      "Go to **My Profile → Edit Profile**. Scroll to the **Account** section where you can update your email address. To change your password, enter a new password in the **New Password** field (at least 6 characters) and confirm it. Tap **Save** to apply.",
    keywords: ["email", "password", "change", "update", "account", "security", "login", "reset"],
  },
  {
    id: "profile-4",
    category: "Profile",
    question: "How do I delete my account?",
    answer:
      "Go to **Settings → Danger Zone → Delete My Account**. You'll be asked to confirm twice before your account is permanently deleted. This action removes all your personal data, bookings, and messages and **cannot be undone**.\n\nIf you just want a break, consider making your account private instead (Settings → Privacy).",
    keywords: ["delete", "account", "remove", "deactivate", "permanent", "data", "close", "danger"],
  },

  // ── Notifications ──
  {
    id: "notif-1",
    category: "Notifications",
    question: "What types of notifications will I receive?",
    answer:
      "TapIn Golf sends the following notifications:\n\n• **Booking Confirmed** — when your booking payment succeeds.\n• **Player Invite** — when someone adds you to their round.\n• **Friend Request** — when someone wants to connect with you.\n• **New Message** — when you receive a chat message.\n• **Club Broadcast** — urgent updates from clubs (e.g. course closures, lightning delays).\n\nManage notification preferences in **Settings → Notifications**.",
    keywords: ["notification", "notify", "alert", "push", "message", "receive", "types"],
  },
  {
    id: "notif-2",
    category: "Notifications",
    question: "How do I mark all notifications as read?",
    answer:
      "Open the **Notifications** screen (bell icon, top-right on the Home screen). Tap **Mark all as read** at the top of the list to clear all unread indicators at once.",
    keywords: ["mark", "read", "notification", "clear", "all", "unread"],
  },

  // ── Privacy & Settings ──
  {
    id: "privacy-1",
    category: "Settings",
    question: "How do I make my account private?",
    answer:
      "Go to **Settings → Privacy → Private Account** and toggle it on. When your account is private, other users cannot see your bookings, stats, or interactions. Only your confirmed friends can view your activity.",
    keywords: ["private", "account", "privacy", "hide", "public", "visible"],
  },
  {
    id: "privacy-2",
    category: "Settings",
    question: "How do I manage location permissions?",
    answer:
      "Go to **Settings → Privacy → Location Services** to toggle location access within the app. Location is used to show nearby clubs and auto-detect your home province.\n\nYou can also manage this from your device's system settings under TapIn Golf app permissions.",
    keywords: ["location", "gps", "permission", "services", "privacy", "device"],
  },
  {
    id: "general-1",
    category: "General",
    question: "Is TapIn Golf available in all South African provinces?",
    answer:
      "Yes! TapIn Golf covers golf clubs across all 9 South African provinces:\n\nGauteng · Western Cape · KwaZulu-Natal · Eastern Cape · Free State · Mpumalanga · North West · Northern Cape · Limpopo\n\nUse the Province filter on the Explore tab to browse clubs in your area.",
    keywords: ["province", "south", "africa", "available", "gauteng", "cape", "natal", "limpopo", "country", "where"],
  },
  {
    id: "general-2",
    category: "General",
    question: "How do I contact support?",
    answer:
      "For issues not covered here, you can reach the TapIn Golf support team by:\n\n• Emailing **support@tapingolf.co.za**\n• Tapping **Rate TapIn Golf** in the menu to leave feedback.\n\nWe typically respond within 1 business day.",
    keywords: ["contact", "support", "help", "email", "team", "feedback", "problem", "issue", "bug"],
  },
];

const SUGGESTED = [
  { label: "Book a tee time", id: "book-1" },
  { label: "Split billing", id: "pay-2" },
  { label: "Add a friend", id: "friends-1" },
  { label: "Payment methods", id: "pay-1" },
  { label: "Remove ads", id: "ads-1" },
  { label: "Cancel a booking", id: "book-4" },
  { label: "Edit my profile", id: "profile-1" },
  { label: "Join a game", id: "join-1" },
];

// ─── Keyword Matching ─────────────────────────────────────────────────────────

function findAnswer(query: string): FAQEntry | null {
  // Strip short words (stop words like "i", "a", "do") to avoid false substring matches
  const tokens = query
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3);

  if (tokens.length === 0) return null;

  let bestEntry: FAQEntry | null = null;
  let bestScore = 0;

  for (const entry of FAQ) {
    let score = 0;
    for (const token of tokens) {
      for (const kw of entry.keywords) {
        if (kw === token) {
          score += 3; // exact match — highest weight
        } else if (kw.startsWith(token) || token.startsWith(kw)) {
          score += 1; // prefix match — e.g. "book" matches "booking"
        }
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestEntry = entry;
    }
  }

  // Require at least one meaningful match
  return bestScore >= 2 ? bestEntry : null;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Msg = {
  id: string;
  role: "user" | "bot";
  text: string;
  typing?: boolean;
};

const GREETING: Msg = {
  id: "greeting",
  role: "bot",
  text: "Hi! I'm the TapIn Golf assistant 🏌️\n\nI can answer questions about bookings, payments, friends, clubs, and more. Tap a topic below or type your question.",
};

const FALLBACK =
  "I don't have a specific answer for that yet. Try rephrasing, or tap one of the suggested topics. For further help you can email **support@tapingolf.co.za**.";

// ─── Bold-text renderer ───────────────────────────────────────────────────────

function BoldText({ text, color, style }: { text: string; color: string; style?: any }) {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return (
    <Text style={[{ color, lineHeight: 21 }, style]}>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <Text key={i} style={{ fontFamily: "Inter_700Bold" }}>
            {part}
          </Text>
        ) : (
          <Text key={i} style={{ fontFamily: "Inter_400Regular" }}>
            {part}
          </Text>
        )
      )}
    </Text>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function HelpScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const listRef = useRef<FlatList>(null);

  const topPad = Platform.OS === "web" ? 44 : insets.top;

  const scrollToEnd = () => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
  };

  useEffect(scrollToEnd, [messages]);

  const sendMessage = (text: string) => {
    if (!text.trim() || typing) return;
    Haptics.selectionAsync();
    setInput("");

    const userMsg: Msg = { id: Date.now().toString(), role: "user", text: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setTyping(true);

    const delay = 600 + Math.random() * 400;
    setTimeout(() => {
      const entry = findAnswer(text);
      const botMsg: Msg = {
        id: (Date.now() + 1).toString(),
        role: "bot",
        text: entry ? entry.answer : FALLBACK,
      };
      setMessages((prev) => [...prev, botMsg]);
      setTyping(false);
    }, delay);
  };

  const sendSuggestion = (id: string) => {
    const entry = FAQ.find((f) => f.id === id);
    if (!entry) return;
    sendMessage(entry.question);
  };

  const renderItem = ({ item }: { item: Msg }) => {
    const isUser = item.role === "user";
    return (
      <View
        style={[
          styles.bubble,
          isUser
            ? [styles.userBubble, { backgroundColor: colors.primary }]
            : [styles.botBubble, { backgroundColor: colors.card, borderColor: colors.border }],
        ]}
      >
        {isUser ? (
          <Text style={[styles.bubbleText, { color: "#fff", fontFamily: "Inter_400Regular" }]}>
            {item.text}
          </Text>
        ) : (
          <BoldText text={item.text} color={colors.foreground} style={{ fontSize: 14 }} />
        )}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: "#1a5c38" }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={10} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Help & FAQ</Text>
          <View style={styles.onlineRow}>
            <View style={styles.onlineDot} />
            <Text style={styles.onlineTxt}>TapIn Assistant</Text>
          </View>
        </View>
        <View style={{ width: 38 }} />
      </View>

      {/* Suggested chips */}
      <View style={[styles.chipsWrap, { borderBottomColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {SUGGESTED.map((s) => (
            <TouchableOpacity
              key={s.id}
              style={[styles.chip, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "44" }]}
              onPress={() => sendSuggestion(s.id)}
              activeOpacity={0.75}
            >
              <Text style={[styles.chipText, { color: colors.primary }]}>{s.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Messages */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        onContentSizeChange={scrollToEnd}
        ListFooterComponent={
          typing ? (
            <View style={[styles.bubble, styles.botBubble, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <TypingDots color={colors.mutedForeground} />
            </View>
          ) : null
        }
      />

      {/* Input bar */}
      <View
        style={[
          styles.inputBar,
          {
            backgroundColor: colors.card,
            borderTopColor: colors.border,
            paddingBottom: Platform.OS === "web" ? 16 : insets.bottom + 8,
          },
        ]}
      >
        <TextInput
          style={[styles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
          value={input}
          onChangeText={setInput}
          placeholder="Ask a question…"
          placeholderTextColor={colors.mutedForeground}
          returnKeyType="send"
          onSubmitEditing={() => sendMessage(input)}
          editable={!typing}
        />
        <TouchableOpacity
          style={[styles.sendBtn, { backgroundColor: input.trim() && !typing ? "#1a5c38" : colors.muted }]}
          onPress={() => sendMessage(input)}
          disabled={!input.trim() || typing}
          activeOpacity={0.85}
        >
          <Ionicons name="send" size={18} color={input.trim() && !typing ? "#fff" : colors.mutedForeground} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Typing indicator ─────────────────────────────────────────────────────────

function TypingDots({ color }: { color: string }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setFrame((f) => (f + 1) % 3), 500);
    return () => clearInterval(t);
  }, []);
  return (
    <View style={{ flexDirection: "row", gap: 5, paddingVertical: 4, paddingHorizontal: 2 }}>
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={{
            width: 7, height: 7, borderRadius: 4,
            backgroundColor: color,
            opacity: frame === i ? 1 : 0.35,
          }}
        />
      ))}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  headerCenter: { flex: 1, alignItems: "center", gap: 2 },
  headerTitle: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  onlineRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#4ade80" },
  onlineTxt: { color: "rgba(255,255,255,0.8)", fontSize: 11, fontFamily: "Inter_400Regular" },
  chipsWrap: { borderBottomWidth: 1, paddingVertical: 10 },
  chips: { paddingHorizontal: 14, gap: 8 },
  chip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 13, paddingVertical: 6 },
  chipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  list: { padding: 16, gap: 10, paddingBottom: 8 },
  bubble: { maxWidth: "82%", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  userBubble: { alignSelf: "flex-end", borderBottomRightRadius: 4 },
  botBubble: { alignSelf: "flex-start", borderBottomLeftRadius: 4, borderWidth: 1 },
  bubbleText: { fontSize: 14, lineHeight: 21 },
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: "center", justifyContent: "center",
  },
});
