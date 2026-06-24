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
  handicap: string;
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
        handicap:
          "Your Playing Handicap is distributed across the 18 holes by stroke index. On holes where your stroke index ≤ your playing handicap you receive one extra stroke (two if handicap exceeds 18). This lowers your net score on those holes, improving your points tally.",
        pickup: "Pick up once you cannot score better than 0 points (net double bogey or worse).",
      },
      {
        key: "gross_stroke_play",
        label: "Gross Stroke Play (Medal)",
        icon: "golf-outline",
        howItWorks:
          "The most traditional format. Every stroke on every hole counts. No handicap adjustment — pure gross scores.",
        howScored:
          "Total gross strokes for 18 holes. Lowest total wins. Used for scratch competitions and club championships.",
        handicap:
          "Handicap does not apply. All players compete off scratch — gross scores only.",
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
        handicap:
          "Your full Course Handicap (100% allowance) is subtracted from your gross 18-hole total at the end — not distributed per hole. A player with a handicap of 18 deducts 18 strokes from their gross total.",
        pickup: "No forced pickup — all strokes count towards your gross total.",
      },
      {
        key: "individual_par",
        label: "Par / Individual Par",
        icon: "remove-circle-outline",
        howItWorks:
          "Match your net score against par on each hole — you either win, halve, or lose each hole against the course.",
        howScored:
          "Net birdie or better = +1 · Net par = 0 (halve) · Net bogey or worse = −1. A score of +2 means two holes up on the course.",
        handicap:
          "Your Playing Handicap is distributed by stroke index, exactly like Stableford. You receive an extra stroke on holes where your stroke index falls within your handicap, reducing your net score and giving you a better chance of halving or winning the hole.",
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
        handicap:
          "Handicap strokes are applied per hole by stroke index, the same as Stableford. Because the target is one stroke more lenient than par, you need to reach net bogey to break even.",
        pickup: "Pick up once you cannot beat net bogey (net double bogey secured).",
      },
      {
        key: "modified_stableford",
        label: "Modified Stableford",
        icon: "trending-up-outline",
        howItWorks:
          "A high-risk, high-reward variation of Stableford that rewards eagles heavily and penalises double bogeys.",
        howScored:
          "Albatross or better = +8 · Eagle = +5 · Birdie = +2 · Par = 0 · Bogey = −1 · Double bogey or worse = −3. Highest total wins.",
        handicap:
          "Handicap strokes are distributed per hole by stroke index, exactly as in standard Stableford. Your net score on each hole is compared against par using the same extra-stroke allocation.",
        pickup: "Pick up at net double bogey (−3 points — worst possible outcome per hole).",
      },
      {
        key: "maximum_score",
        label: "Maximum Score",
        icon: "arrow-up-circle-outline",
        howItWorks:
          "Stroke play with a per-hole cap (typically net double bogey or a fixed number). Any score above the cap is recorded as the cap. Speeds up play.",
        howScored:
          "Add up all capped gross scores for 18 holes. Net score = Total − Full handicap. Lowest net wins.",
        handicap:
          "The cap is usually defined in net terms (par + 2 + your stroke allocation on that hole). Your full course handicap is then deducted from the gross total at the end.",
        pickup: "Stop playing once you've reached the committee's maximum score for that hole.",
      },
      {
        key: "individual_bonus_bogey",
        label: "Bonus Bogey",
        icon: "gift-outline",
        howItWorks:
          "A points-based format where birdies and eagles earn bonus points while bogeys lose points.",
        howScored:
          "Eagle or better = +2 · Birdie = +1 · Par = 0 · Bogey = −1 · Double bogey or worse = −2. Highest total wins.",
        handicap:
          "Handicap strokes are allocated per hole by stroke index, the same as Stableford. On holes where you receive a stroke, one is subtracted from your gross to get your net score before applying the points scale.",
        pickup: "Pick up at net double bogey (no further points can be lost).",
      },
      {
        key: "chairman",
        label: "Chairman's Prize",
        icon: "trophy-outline",
        howItWorks:
          "A prestige net stroke-play competition, typically played off a reduced handicap allowance (3/4 or 7/8) set by the club.",
        howScored:
          "Net score = Gross − (handicap allowance). Lowest net wins.",
        handicap:
          "The club sets a reduced allowance — commonly 3/4 (75%) or 7/8 (87.5%) of your course handicap. This is deducted from your gross total at the end of the round, not distributed per hole.",
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
          "You play hole by hole against one opponent. The player who wins the most holes wins — the total score doesn't matter.",
        howScored:
          "Win a hole = 1 up · Lose = 1 down · Halve = no change. Match ends when one player leads by more holes than remain (e.g. 3&2 = 3 up with 2 to play).",
        handicap:
          "The lower-handicap player gives the difference in course handicaps to the higher-handicap player. These strokes are allocated by stroke index — the higher-handicap player receives an extra stroke on the hardest holes, reducing their net score on those holes.",
        pickup: "Concede at any point once the hole is lost. Match ends when the result is mathematically decided.",
      },
      {
        key: "singles_stableford_match_play",
        label: "Stableford Match Play",
        icon: "star-half-outline",
        howItWorks:
          "Match play using Stableford points instead of gross/net strokes. Win the hole with more points, halve with equal, lose with fewer.",
        howScored:
          "Same hole-by-hole win/lose/halve tracking as match play. The player with more holes won at the end wins.",
        handicap:
          "Each player's full playing handicap is applied per hole by stroke index. Stableford points are calculated from each player's net score independently, and those points are then compared to determine who wins the hole.",
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
        handicap:
          "Handicap does not apply — gross scores only. Both players compete off scratch.",
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
          "Two teams of two. Each player plays their own ball. The better net score from each team per hole is compared — the team with the lower net score wins the hole.",
        howScored:
          "Match play hole-by-hole between the two teams' best balls. Team with the most holes won wins the match.",
        handicap:
          "All four players receive their full course handicap distributed per hole by stroke index. Each player's net score is calculated individually; the best net from each side is compared for the hole result.",
        pickup: "A player may pick up once their team's best ball has already won or halved the hole.",
      },
      {
        key: "fourball_stableford",
        label: "Fourball Stableford (4BBB)",
        icon: "star-outline",
        howItWorks:
          "Teams of two. Both players score stableford points on their own ball. The higher of the two partners' points counts as the team score for that hole.",
        howScored:
          "Best stableford points from either partner per hole. Team with the highest total points over 18 holes wins.",
        handicap:
          "Each partner uses their full playing handicap distributed by stroke index. The partner with more points on a given hole contributes that score — the team always benefits from the better handicap interaction on each hole.",
        pickup: "A player may pick up once the partner has secured a better or equal score for that hole.",
      },
      {
        key: "fourball_net_betterball",
        label: "Fourball Net Betterball",
        icon: "ribbon-outline",
        howItWorks:
          "Teams of two. The better net score between the two partners counts as the team score on each hole.",
        howScored:
          "Lowest net score per hole from either partner. Cumulative over 18 holes. Lowest team net wins.",
        handicap:
          "Both players receive their full course handicap per hole by stroke index. Net score (gross minus strokes received) is calculated per player per hole — the lower is the team's score.",
        pickup: "No forced pickup — all strokes count.",
      },
      {
        key: "fourball_gross_betterball",
        label: "Fourball Gross Betterball",
        icon: "ribbon-outline",
        howItWorks:
          "Teams of two playing gross betterball — no handicap. The better gross score from each team's two players counts per hole.",
        howScored:
          "Best gross score per hole from either partner. Total over 18 holes. Lowest gross team total wins.",
        handicap:
          "Handicap does not apply. Both players compete off scratch.",
        pickup: "No forced pickup.",
      },
      {
        key: "betterball_bonus_bogey",
        label: "Betterball Bonus Bogey",
        icon: "gift-outline",
        howItWorks:
          "Teams of two playing bonus bogey. Each player scores individually; the better points score per hole counts as the team score.",
        howScored:
          "Eagle or better = +2 · Birdie = +1 · Par = 0 · Bogey = −1 · Double bogey or worse = −2. Best points from either partner per hole. Highest team total wins.",
        handicap:
          "Each player's full playing handicap is distributed per hole by stroke index. Points are calculated from each player's net score. The partner with the higher points on a given hole contributes that score.",
        pickup: "Pick up once you cannot outscore your partner's already-secured points.",
      },
      {
        key: "betterball_gross_match_play",
        label: "Betterball Gross Match Play",
        icon: "swap-horizontal-outline",
        howItWorks:
          "Head-to-head match play between two teams of two using gross scores. Best gross score from each team per hole determines who wins — no handicap adjustments.",
        howScored:
          "Hole-by-hole team match play. Best gross score from each pair compared per hole. Match ends when result is decided.",
        handicap:
          "Handicap does not apply. All four players compete off scratch.",
        pickup: "Concede once both your and your partner's gross score cannot beat the opposition.",
      },
      {
        key: "the_ghost",
        label: "The Ghost",
        icon: "person-remove-outline",
        howItWorks:
          "A betterball format where one player is paired with a 'ghost' — a fictional partner who always scores exactly par (2 stableford points) on every hole. The player competes with the ghost as their partner; the better score per hole counts.",
        howScored:
          "Your stableford points are compared to the ghost's 2 points (par) on each hole. The better of the two counts as the team score. Highest total over 18 holes wins.",
        handicap:
          "Your full playing handicap is applied per hole by stroke index, exactly as in individual Stableford. The ghost has no handicap — it always plays to par. This means your handicap strokes only benefit you and not the ghost partner.",
        pickup: "Pick up once you cannot score better than 0 points and the ghost (par = 2 pts) already has the hole covered.",
      },
      {
        key: "pinehurst_points",
        label: "Multiplication Betterball (Pinehurst Points)",
        icon: "close-circle-outline",
        howItWorks:
          "Teams of two. Both players score stableford points on their own ball per hole. Instead of taking the best score, the two partners' stableford points are MULTIPLIED together to give the team score for that hole.",
        howScored:
          "Example: Partner A scores 3 pts (birdie), Partner B scores 2 pts (par) → team score = 3 × 2 = 6. Eagle × Birdie = 4 × 3 = 12. Total multiplied points over 18 holes — highest wins.",
        handicap:
          "Both players receive their full playing handicap per hole by stroke index, as in standard Stableford. Net scores determine each player's stableford points, which are then multiplied. Higher handicap players benefit on their allocated holes just as in Stableford.",
        pickup: "Pick up at net double bogey (0 points × any partner score = 0, so no further benefit from continuing).",
      },
      {
        key: "high_low",
        label: "High/Low",
        icon: "bar-chart-outline",
        howItWorks:
          "A team format where two scores are recorded per team per hole: the HIGH ball (worst net) and the LOW ball (best net). Both scores contribute across the round in different ways.",
        howScored:
          "Typically, the low ball wins full points and the high ball wins partial points. Final scores combine low-ball and high-ball tallies. Exact point allocations vary by competition.",
        handicap:
          "Both players receive their full playing handicap per hole by stroke index. Net scores are calculated per player. The lower net is the 'low ball' and the higher net is the 'high ball' for that hole.",
        pickup: "Depends on the specific competition rules.",
      },
      {
        key: "daytona",
        label: "Daytona (Las Vegas)",
        icon: "speedometer-outline",
        howItWorks:
          "A two-player format. On each hole the best net score is the 'tens' digit and the worst is the 'units' digit, forming a two-digit number. Lower is better.",
        howScored:
          "Example: net scores of 4 and 6 = 46. Net scores of 3 and 5 = 35. Lowest 18-hole aggregate wins. The better score always goes first.",
        handicap:
          "Both players use their full playing handicap distributed per hole by stroke index. Net scores form the two digits. Higher-handicap players receiving strokes on a hole will have a lower net score, ideally becoming the 'tens' digit.",
        pickup: "No forced pickup — both net scores contribute.",
      },
      {
        key: "best_ball_aggregate",
        label: "Best Ball Aggregate",
        icon: "podium-outline",
        howItWorks:
          "Teams of two or more. Each player plays their own ball. The best net score on each hole is added to the running team aggregate total.",
        howScored:
          "Best net score per hole from any team member, summed over 18 holes. Lowest aggregate wins.",
        handicap:
          "All players receive their full playing handicap per hole by stroke index. The lowest net score among the team counts each hole.",
        pickup: "No forced pickup.",
      },
      {
        key: "low_ball_total",
        label: "Low Ball Total",
        icon: "trending-down-outline",
        howItWorks:
          "Tracks the lowest net score from a group on each hole and accumulates it as the team's running total.",
        howScored:
          "Lowest net score per hole summed over 18 holes. Lowest total wins.",
        handicap:
          "Players receive their full playing handicap per hole by stroke index. Net scores are compared and the lowest counts.",
        pickup: "No forced pickup.",
      },
    ],
  },
  {
    title: "Scramble & Team Formats",
    iconName: "shuffle-outline",
    formats: [
      {
        key: "alliance",
        label: "Alliance",
        icon: "layers-outline",
        howItWorks:
          "A stableford team format where a specific number of players' scores count per hole based on the hole's par: 1 score counts on par 3s, 2 scores on par 4s, and 3 scores on par 5s (for a 4-player team). All players play their own ball.",
        howScored:
          "Stableford points are scored individually per player. On each hole, the required number of best scores count as the team total. Highest aggregate stableford points over 18 holes wins.",
        handicap:
          "Each player receives their full playing handicap distributed by stroke index. Stableford points are calculated from each player's net score. Higher-handicap players contribute more on holes where they receive additional strokes.",
        pickup: "Pick up once you cannot score better than 0 points (net double bogey or worse).",
      },
      {
        key: "texas_scramble",
        label: "Texas Scramble",
        icon: "repeat-outline",
        howItWorks:
          "All players tee off, the best shot is selected, and all players play their next shot from that spot. This repeats for every shot until the ball is holed. A true full-team scramble.",
        howScored:
          "One team gross score per hole. Lowest team total over 18 holes wins. Some competitions require a minimum number of drives from each player to prevent one player dominating the tee.",
        handicap:
          "The team handicap is calculated from all players' individual handicaps — typically the sum divided by the number of players, then multiplied by an allowance (often 10–25%). This team net allowance is deducted from the gross team total at the end.",
        pickup: "No pickup rule — the team selects the best ball each time and continues until holed.",
      },
      {
        key: "american_scramble",
        label: "American Scramble",
        icon: "git-merge-outline",
        howItWorks:
          "Similar to Texas Scramble. All players tee off and the best drive is selected. But then each player plays their own second shot from that spot. The best second shot is selected and all play from there — this process repeats until holed.",
        howScored:
          "One team gross score per hole. Lowest team total over 18 holes wins.",
        handicap:
          "Team handicap is calculated from the combined individual handicaps using a set formula (commonly the total of all playing handicaps divided by the number of players, multiplied by an allowance percentage). Deducted from the team gross total at the end.",
        pickup: "No pickup rule — the team plays until holed from the chosen spot.",
      },
      {
        key: "shamble",
        label: "Shamble",
        icon: "golf-outline",
        howItWorks:
          "All players tee off. The team selects the best drive. From that spot, each player plays their own ball to the hole independently (unlike a full scramble where you re-select every shot).",
        howScored:
          "Each player completes the hole from the chosen drive. The best net stableford score from the group counts as the team score for that hole.",
        handicap:
          "Each player uses their own full playing handicap distributed per hole by stroke index, applied to their individual score from the chosen drive onward.",
        pickup: "Pick up at net double bogey on your individual ball.",
      },
      {
        key: "chapman",
        label: "Chapman (Pinehurst Alternate Shot)",
        icon: "swap-vertical-outline",
        howItWorks:
          "Both partners tee off. Each then plays the other's drive. The team selects the better of the two second shots, and from there alternate shot is played to complete the hole (one player putts, the other plays the next shot, alternating).",
        howScored:
          "One net score per team per hole. Can be played as net stroke play (aggregate net) or Stableford. Lowest net or highest Stableford points wins.",
        handicap:
          "The team handicap is typically the combined course handicaps of both players multiplied by a reduced allowance (commonly 50% of the lower handicap plus 50% of the higher). The combined team allowance is deducted from the gross team total at the end.",
        pickup: "Pick up once the hole is lost beyond recovery.",
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
          <View style={s.block}>
            <Text style={[s.blockTitle, { color: "#60a5fa" }]}>Handicap</Text>
            <Text style={s.blockText}>{fmt.handicap}</Text>
          </View>
          <View style={s.pickupRow}>
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
          onPress={() => Linking.openURL("https://www.randa.org/rules/rules-of-golf-home")}
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
          Tap any format to see how it works, how it's scored, how handicap applies, and when to pick up.
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
