import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppHeader } from "@/components/AppHeader";
import { useColors } from "@/hooks/useColors";

const GOLD = "#c8a84b";
const GREEN = "#1a5c38";

type Format = {
  key: string;
  label: string;
  icon: string;
  howItWorks: string;
  howScored: string;
  pickup: string;
};

type Category = {
  title: string;
  iconName: string;
  formats: Format[];
};

const CATEGORIES: Category[] = [
  {
    title: "Individual Formats",
    iconName: "person-outline",
    formats: [
      {
        key: "individual_stableford",
        label: "Individual Stableford",
        icon: "star-outline",
        howItWorks:
          "Each player plays their own ball throughout the round. Scores are converted into points based on how many strokes above or below net par you score on each hole.",
        howScored:
          "Albatross (net −3) = 5 pts · Eagle (net −2) = 4 pts · Birdie (net −1) = 3 pts · Par = 2 pts · Bogey (net +1) = 1 pt · Double bogey or worse = 0 pts. Highest total points wins.",
        pickup: "Pick up once you cannot score better than 0 points (net double bogey or worse).",
      },
      {
        key: "individual_gross",
        label: "Individual Gross (Stroke Play)",
        icon: "golf-outline",
        howItWorks:
          "The most traditional format. Every stroke on every hole counts. No handicap adjustment — pure gross scores.",
        howScored:
          "Total gross strokes for 18 holes. Lowest total wins. Used for scratch competitions and club championships.",
        pickup: "No mandatory pickup — all strokes count.",
      },
      {
        key: "net_stroke_play",
        label: "Net Stroke Play",
        icon: "calculator-outline",
        howItWorks:
          "Same as stroke play but your full handicap is deducted from your gross total at the end of the round.",
        howScored:
          "Net score = Gross score − Full handicap. Lowest net total wins.",
        pickup: "No forced pickup — all strokes count towards your gross total.",
      },
      {
        key: "individual_par",
        label: "Par / Individual Par",
        icon: "remove-circle-outline",
        howItWorks:
          "Match your net score against par on each hole. Think of it as a match against the course itself — you either win, halve, or lose each hole.",
        howScored:
          "Net birdie or better = +1 · Net par = 0 (halve) · Net bogey or worse = −1. Total your hole results. A score of +2 means two holes up on the course.",
        pickup: "Pick up when you can no longer beat net par (net bogey or worse secured).",
      },
      {
        key: "individual_bogey",
        label: "Individual Bogey",
        icon: "remove-outline",
        howItWorks:
          "Same concept as Par competition, but bogey (not par) is the target on each hole.",
        howScored:
          "Net par or better = +1 · Net bogey = 0 · Net double bogey or worse = −1. Higher total wins.",
        pickup: "Pick up once you cannot beat net bogey (net double bogey secured).",
      },
      {
        key: "modified_stableford",
        label: "Modified Stableford",
        icon: "trending-up-outline",
        howItWorks:
          "A high-risk, high-reward variation of Stableford that rewards eagles and albatrosses heavily and penalises double bogeys.",
        howScored:
          "Albatross or better = +8 · Eagle = +5 · Birdie = +2 · Par = 0 · Bogey = −1 · Double bogey or worse = −3. Highest total wins.",
        pickup: "Pick up at net double bogey (−3 points — you cannot do worse).",
      },
      {
        key: "maximum_score",
        label: "Maximum Score",
        icon: "arrow-up-circle-outline",
        howItWorks:
          "Stroke play with a per-hole cap set by the committee (typically net double bogey or a fixed number like 8 or 10). Any score above the cap is recorded as the cap. Speeds up play.",
        howScored:
          "Add up all capped gross scores for 18 holes. Net score = Total − Full handicap. Lowest net wins.",
        pickup: "Stop playing once you've reached the committee's maximum score for that hole.",
      },
      {
        key: "individual_bonus_bogey",
        label: "Bonus Bogey",
        icon: "gift-outline",
        howItWorks:
          "A points-based format similar to Stableford, but birdies and eagles score bonus points while bogeys lose points.",
        howScored:
          "Eagle or better = +2 · Birdie = +1 · Par = 0 · Bogey = −1 · Double bogey or worse = −2. Highest total wins.",
        pickup: "Pick up at net double bogey (no further points can be lost).",
      },
      {
        key: "chairman",
        label: "Chairman's Prize",
        icon: "trophy-outline",
        howItWorks:
          "A prestige net stroke-play competition — typically played off 3/4 or 7/8 handicap. The format itself is net stroke play with a club-specific handicap allowance.",
        howScored:
          "Net score = Gross − (handicap allowance). Lowest net wins.",
        pickup: "No forced pickup — all strokes count.",
      },
    ],
  },
  {
    title: "Match Play Formats",
    iconName: "swap-horizontal-outline",
    formats: [
      {
        key: "singles_match_play",
        label: "Singles Match Play",
        icon: "people-outline",
        howItWorks:
          "You play hole by hole against one opponent. The player who wins the most holes wins — the total score doesn't matter. Net strokes per hole determine who wins each hole.",
        howScored:
          "Win a hole = 1 up. Lose a hole = 1 down. Halve a hole = no change. The match ends when one player leads by more holes than remain (e.g. 3&2 = 3 up with 2 to play).",
        pickup: "Concede at any point once the hole is lost. The match ends early when the result is mathematically decided.",
      },
      {
        key: "singles_stableford_match_play",
        label: "Stableford Match Play",
        icon: "star-half-outline",
        howItWorks:
          "Match play using Stableford points instead of gross/net strokes. Win the hole with more stableford points, halve with equal, lose with fewer.",
        howScored:
          "Same hole-by-hole win/lose/halve tracking as match play. The player with more holes won at the end wins the match.",
        pickup: "Pick up once you cannot score a point on the hole.",
      },
      {
        key: "singles_gross_match_play",
        label: "Gross Match Play",
        icon: "golf-outline",
        howItWorks:
          "Head-to-head match play using gross (no handicap) strokes. Fewest gross strokes on a hole wins it.",
        howScored:
          "Standard hole-by-hole win/lose/halve. Used for scratch match play competitions.",
        pickup: "Concede once the hole cannot be won.",
      },
    ],
  },
  {
    title: "Betterball & Team Formats",
    iconName: "people-circle-outline",
    formats: [
      {
        key: "betterball_match_play",
        label: "Betterball Match Play (4BBB)",
        icon: "people-outline",
        howItWorks:
          "Two teams of two. Each player plays their own ball. On each hole, the better net score from each team is compared — the team with the lower net score wins the hole.",
        howScored:
          "Match play hole-by-hole between the two teams' best balls. Team with the most holes won wins the match.",
        pickup: "A player may pick up once their team's best ball has already won or halved the hole.",
      },
      {
        key: "fourball_stableford",
        label: "Fourball Stableford",
        icon: "star-outline",
        howItWorks:
          "Teams of two. Both players play their own ball and score stableford points. The higher of the two partners' stableford points counts as the team score for that hole.",
        howScored:
          "Best stableford points from either partner on each hole. Team with the highest total points over 18 holes wins.",
        pickup: "A player may pick up once the partner has already secured a better or equal points score for that hole.",
      },
      {
        key: "fourball_net_betterball",
        label: "Fourball Net Betterball",
        icon: "ribbon-outline",
        howItWorks:
          "Teams of two. Each player plays their own ball. The better net score between the two partners counts as the team score on each hole.",
        howScored:
          "Lowest net score per hole from either partner counts. Cumulative net score over 18 holes. Lowest team net wins.",
        pickup: "No forced pickup — all strokes count towards net scoring.",
      },
      {
        key: "fourball_gross_betterball",
        label: "Fourball Gross Betterball",
        icon: "ribbon-outline",
        howItWorks:
          "Teams of two playing gross betterball — no handicap. The better gross score from each team's two players counts per hole.",
        howScored:
          "Best gross score per hole from either partner. Total over 18 holes. Lowest gross team total wins.",
        pickup: "No forced pickup.",
      },
      {
        key: "betterball_bonus_bogey",
        label: "Betterball Bonus Bogey",
        icon: "gift-outline",
        howItWorks:
          "Teams of two playing bonus bogey format. Each player scores individually; the better points score per hole counts as the team score.",
        howScored:
          "Eagle or better = +2 · Birdie = +1 · Par = 0 · Bogey = −1 · Double bogey or worse = −2. Best points from either partner per hole. Highest team total wins.",
        pickup: "Pick up once you cannot outscore your partner's already-secured points.",
      },
      {
        key: "betterball_gross_match_play",
        label: "Betterball Gross Match Play",
        icon: "swap-horizontal-outline",
        howItWorks:
          "Head-to-head match play between two teams of two using gross scores. Best gross score from each team per hole determines who wins the hole — no handicap adjustments.",
        howScored:
          "Hole-by-hole team match play. The team with the best gross score on each hole wins it. Match ends when result is decided.",
        pickup: "Concede once both your and your partner's gross score cannot beat the opposition.",
      },
      {
        key: "high_low",
        label: "High/Low",
        icon: "bar-chart-outline",
        howItWorks:
          "A team format where two separate scores are recorded per team per hole: the HIGH ball (worst net score) and the LOW ball (best net score). Both count in different ways across the round.",
        howScored:
          "Typically, low ball wins full points, high ball wins partial points. Final scores combine low-ball and high-ball tallies. Exact point allocations vary by competition.",
        pickup: "Depends on the specific competition rules.",
      },
      {
        key: "daytona",
        label: "Daytona",
        icon: "speedometer-outline",
        howItWorks:
          "A team format for two players. On each hole the best net score is the 'tens' digit and the worst is the 'units' digit, forming a two-digit number. Lower combined number is better.",
        howScored:
          "Example: scores of 4 and 6 = 46. Scores of 3 and 5 = 35. Lowest 18-hole aggregate wins. Teams always arrange scores with the better score first.",
        pickup: "No forced pickup — both scores contribute to the aggregate.",
      },
      {
        key: "best_ball_aggregate",
        label: "Best Ball Aggregate",
        icon: "podium-outline",
        howItWorks:
          "Teams of two or more. Each player plays their own ball. The best net score on each hole is added to a running team aggregate total.",
        howScored:
          "Best net score per hole from any team member, summed over 18 holes. Lowest aggregate wins.",
        pickup: "No forced pickup.",
      },
      {
        key: "low_ball_total",
        label: "Low Ball Total",
        icon: "trending-down-outline",
        howItWorks:
          "Similar to best-ball aggregate but specifically tracks the lowest gross or net ball from a group on each hole and accumulates it as the team's running total.",
        howScored:
          "Lowest (net) score per hole summed over 18 holes. Lowest total wins.",
        pickup: "No forced pickup.",
      },
    ],
  },
  {
    title: "Scramble Formats",
    iconName: "shuffle-outline",
    formats: [
      {
        key: "shamble",
        label: "Shamble",
        icon: "golf-outline",
        howItWorks:
          "All players tee off. The team selects the best drive. From that spot, each player plays their own ball to the hole independently (unlike a full scramble where you re-select every shot).",
        howScored:
          "Each player completes the hole individually from the chosen drive. The best net stableford score from the group counts as the team score for that hole.",
        pickup: "Pick up at net double bogey on your individual ball.",
      },
      {
        key: "texas_scramble",
        label: "Texas Scramble",
        icon: "repeat-outline",
        howItWorks:
          "All players in the team tee off, the best shot is selected, and all players play from that spot. This repeats for every shot until the ball is holed. A true team scramble.",
        howScored:
          "One team gross score per hole. Total over 18. Lowest team gross (or net, depending on format) wins. Some variations require a minimum number of drives from each player.",
        pickup: "No pickup rule — the team selects the best ball and continues until holed.",
      },
      {
        key: "chapman",
        label: "Chapman (Pinehurst)",
        icon: "git-merge-outline",
        howItWorks:
          "Both partners tee off. Each then plays the other's drive. The team then selects the better of the two second shots, and from there alternate shot is played to complete the hole.",
        howScored:
          "One net score per team per hole. Can be played as stroke play (aggregate net) or Stableford. Lowest net or highest Stableford points wins.",
        pickup: "Pick up once the hole is lost beyond recovery under the chosen scoring method.",
      },
    ],
  },
];

function FormatCard({ fmt, colors }: { fmt: Format; colors: any }) {
  const [open, setOpen] = useState(false);
  const s = cardStyles(colors);
  return (
    <View style={s.card}>
      <TouchableOpacity
        style={s.header}
        onPress={() => setOpen(v => !v)}
        activeOpacity={0.75}
      >
        <View style={s.iconWrap}>
          <Ionicons name={fmt.icon as any} size={18} color={GOLD} />
        </View>
        <Text style={s.label}>{fmt.label}</Text>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={16}
          color={colors.mutedForeground}
        />
      </TouchableOpacity>

      {open && (
        <View style={s.body}>
          <View style={s.divider} />
          <View style={s.block}>
            <Text style={s.blockTitle}>How it works</Text>
            <Text style={s.blockText}>{fmt.howItWorks}</Text>
          </View>
          <View style={s.block}>
            <Text style={s.blockTitle}>How it's scored</Text>
            <Text style={s.blockText}>{fmt.howScored}</Text>
          </View>
          <View style={[s.pickupRow]}>
            <Ionicons name="hand-left-outline" size={13} color={GOLD} />
            <Text style={s.pickupText}>{fmt.pickup}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const cardStyles = (c: any) =>
  StyleSheet.create({
    card: {
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 10,
      overflow: "hidden",
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    iconWrap: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: GOLD + "18",
      alignItems: "center",
      justifyContent: "center",
    },
    label: { flex: 1, fontSize: 15, fontFamily: "Inter_600SemiBold", color: c.foreground },
    divider: { height: 1, backgroundColor: c.border, marginHorizontal: 14 },
    body: { paddingHorizontal: 14, paddingBottom: 14, paddingTop: 0 },
    block: { marginTop: 12 },
    blockTitle: {
      fontSize: 11,
      fontFamily: "Inter_700Bold",
      color: GOLD,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      marginBottom: 4,
    },
    blockText: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: c.foreground,
      lineHeight: 21,
    },
    pickupRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 6,
      marginTop: 12,
      backgroundColor: GOLD + "12",
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    pickupText: {
      flex: 1,
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: c.foreground,
      lineHeight: 18,
    },
  });

export default function RulesScreen() {
  const colors = useColors();
  const { bottom } = useSafeAreaInsets();
  const s = styles(colors);

  return (
    <View style={s.root}>
      <AppHeader />

      <View style={s.subHeader}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <Text style={s.subHeaderTitle}>Rules & Formats</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* R&A Rule Book link */}
        <TouchableOpacity
          style={s.rnaCard}
          onPress={() => Linking.openURL("https://www.randa.org/rog/2024/en/the-rules-of-golf")}
          activeOpacity={0.8}
        >
          <View style={s.rnaLeft}>
            <View style={s.rnaIconWrap}>
              <Ionicons name="library-outline" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rnaTitle}>R&A Rules of Golf</Text>
              <Text style={s.rnaSub}>Official complete rule book — randa.org</Text>
            </View>
          </View>
          <Ionicons name="open-outline" size={18} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>

        <Text style={s.intro}>
          Tap any format below to see how it works and how it's scored.
        </Text>

        {CATEGORIES.map(cat => (
          <View key={cat.title} style={s.section}>
            <View style={s.catHeader}>
              <Ionicons name={cat.iconName as any} size={16} color={colors.primary} />
              <Text style={s.catTitle}>{cat.title}</Text>
            </View>
            {cat.formats.map(fmt => (
              <FormatCard key={fmt.key} fmt={fmt} colors={colors} />
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = (c: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    subHeader: {
      backgroundColor: c.primary,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 14,
    },
    backBtn: {
      width: 38, height: 38, borderRadius: 19,
      backgroundColor: "rgba(255,255,255,0.15)",
      alignItems: "center", justifyContent: "center",
    },
    subHeaderTitle: { color: "#fff", fontSize: 17, fontFamily: "Inter_700Bold" },
    scroll: { padding: 16 },

    rnaCard: {
      backgroundColor: GREEN,
      borderRadius: 16,
      padding: 16,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 20,
      gap: 12,
    },
    rnaLeft: { flexDirection: "row", alignItems: "center", gap: 14, flex: 1 },
    rnaIconWrap: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: "rgba(255,255,255,0.15)",
      alignItems: "center",
      justifyContent: "center",
    },
    rnaTitle: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
    rnaSub: { color: "rgba(255,255,255,0.75)", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },

    intro: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: c.subtext,
      marginBottom: 20,
      lineHeight: 19,
    },

    section: { marginBottom: 8 },
    catHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      marginBottom: 10,
    },
    catTitle: {
      fontSize: 13,
      fontFamily: "Inter_700Bold",
      color: c.primary,
      textTransform: "uppercase",
      letterSpacing: 0.6,
    },
  });
