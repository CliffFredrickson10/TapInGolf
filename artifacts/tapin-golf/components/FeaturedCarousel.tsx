import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import ClubCard, { Club } from "@/components/ClubCard";
import { useColors } from "@/hooks/useColors";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH   = SCREEN_WIDTH * 0.72;
const CARD_MARGIN  = 14;
const SNAP         = CARD_WIDTH + CARD_MARGIN;
const DEFAULT_SECS = 8;
const LOOP_COUNT   = 200; // 100 reps each side — practically infinite

export type FeaturedClub = Club & { slot_seconds?: number | null };

interface Props {
  clubs: FeaturedClub[];
}

export default function FeaturedCarousel({ clubs }: Props) {
  const n = clubs.length;
  const CENTER = useMemo(() => Math.floor(LOOP_COUNT / 2) * n, [n]);

  // Build a flat looped array so the user can scroll forever to the right
  const loopedClubs = useMemo<FeaturedClub[]>(() => {
    const arr: FeaturedClub[] = [];
    for (let i = 0; i < LOOP_COUNT; i++) arr.push(...clubs);
    return arr;
  }, [clubs]);

  const colors = useColors();
  const listRef      = useRef<FlatList>(null);
  const loopIndexRef = useRef(CENTER);  // index into loopedClubs
  const pausedRef    = useRef(false);
  const initializedRef = useRef(false);

  const [loopIndex, setLoopIndex] = useState(CENTER);
  const progressAnim    = useRef(new Animated.Value(0)).current;
  const progressAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  const dotIndex = loopIndex % n; // which real club is "current"

  const slotMs = useCallback(
    (li: number) => (clubs[li % n]?.slot_seconds ?? DEFAULT_SECS) * 1000,
    [clubs, n]
  );

  // Scroll to a position in the looped array (no animation flip, always right)
  const scrollTo = useCallback((li: number, animated = true) => {
    listRef.current?.scrollToOffset({ offset: li * SNAP, animated });
  }, []);

  const startProgress = useCallback(
    (li: number) => {
      progressAnimRef.current?.stop();
      progressAnim.setValue(0);
      if (n < 2) return;
      const anim = Animated.timing(progressAnim, {
        toValue: 1,
        duration: slotMs(li),
        useNativeDriver: false,
      });
      progressAnimRef.current = anim;
      anim.start(({ finished }) => {
        if (!finished || pausedRef.current) return;
        const next = loopIndexRef.current + 1; // always go RIGHT — infinite
        loopIndexRef.current = next;
        setLoopIndex(next);
        scrollTo(next);
      });
    },
    [n, progressAnim, slotMs, scrollTo]
  );

  useEffect(() => {
    if (!pausedRef.current) startProgress(loopIndex);
  }, [loopIndex]);

  useEffect(() => () => { progressAnimRef.current?.stop(); }, []);

  if (n === 0) return null;

  // Tap a dot → jump forward to nearest occurrence of that real index
  const goTo = (realI: number) => {
    const curMod = loopIndexRef.current % n;
    const diff = (realI - curMod + n) % n;
    const target = loopIndexRef.current + (diff === 0 ? 0 : diff);
    pausedRef.current = false;
    loopIndexRef.current = target;
    setLoopIndex(target);
    scrollTo(target);
  };

  return (
    <View>
      <FlatList
        ref={listRef}
        data={loopedClubs}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(_, i) => i.toString()}
        contentContainerStyle={{ paddingLeft: 20, paddingRight: 6 }}
        snapToInterval={SNAP}
        decelerationRate="fast"
        getItemLayout={(_, i) => ({ length: SNAP, offset: SNAP * i, index: i })}
        // Scroll silently to CENTER on first layout
        onLayout={() => {
          if (!initializedRef.current) {
            initializedRef.current = true;
            scrollTo(CENTER, false);
          }
        }}
        onScrollBeginDrag={() => {
          pausedRef.current = true;
          progressAnimRef.current?.stop();
          progressAnim.setValue(0);
        }}
        onMomentumScrollEnd={(e) => {
          const i = Math.round(e.nativeEvent.contentOffset.x / SNAP);
          const clamped = Math.max(0, Math.min(i, loopedClubs.length - 1));
          loopIndexRef.current = clamped;
          setLoopIndex(clamped);
          pausedRef.current = false;
        }}
        renderItem={({ item }) => (
          <ClubCard
            club={item}
            onPress={() => {
              Haptics.selectionAsync();
              router.push({ pathname: "/club/[id]", params: { id: item.id } });
            }}
          />
        )}
      />

      {n > 1 && (
        <View style={styles.dotsRow}>
          {clubs.map((_, i) => (
            <TouchableOpacity key={i} onPress={() => goTo(i)} activeOpacity={0.7}>
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor:
                      i === dotIndex ? colors.primary + "40" : colors.border,
                    width: i === dotIndex ? 32 : 6,
                  },
                ]}
              >
                {i === dotIndex && (
                  <Animated.View
                    style={[
                      styles.dotFill,
                      {
                        backgroundColor: colors.primary,
                        width: progressAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: ["0%", "100%"],
                        }),
                      },
                    ]}
                  />
                )}
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 5,
    marginTop: 10,
  },
  dot: {
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  dotFill: {
    height: "100%",
    borderRadius: 2,
  },
});
