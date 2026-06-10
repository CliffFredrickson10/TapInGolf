import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
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

export type FeaturedClub = Club & { slot_seconds?: number | null };

interface Props {
  clubs: FeaturedClub[];
}

export default function FeaturedCarousel({ clubs }: Props) {
  const colors = useColors();
  const listRef   = useRef<FlatList>(null);
  const indexRef  = useRef(0);
  const pausedRef = useRef(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const progressAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  const slotMs = useCallback(
    (i: number) => (clubs[i]?.slot_seconds ?? DEFAULT_SECS) * 1000,
    [clubs]
  );

  const scrollTo = (i: number) => {
    try {
      listRef.current?.scrollToIndex({ index: i, animated: true, viewPosition: 0 });
    } catch {}
  };

  const startProgress = useCallback(
    (i: number) => {
      progressAnimRef.current?.stop();
      progressAnim.setValue(0);
      if (clubs.length < 2) return;
      const anim = Animated.timing(progressAnim, {
        toValue: 1,
        duration: slotMs(i),
        useNativeDriver: false,
      });
      progressAnimRef.current = anim;
      anim.start(({ finished }) => {
        if (!finished || pausedRef.current) return;
        const next = (indexRef.current + 1) % clubs.length;
        indexRef.current = next;
        setCurrentIndex(next);
        scrollTo(next);
      });
    },
    [clubs, progressAnim, slotMs]
  );

  useEffect(() => {
    if (!pausedRef.current) startProgress(currentIndex);
  }, [currentIndex]);

  useEffect(() => () => { progressAnimRef.current?.stop(); }, []);

  if (clubs.length === 0) return null;

  const goTo = (i: number) => {
    pausedRef.current = false;
    indexRef.current = i;
    setCurrentIndex(i);
    scrollTo(i);
  };

  return (
    <View>
      <FlatList
        ref={listRef}
        data={clubs}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={{ paddingLeft: 20, paddingRight: 6 }}
        snapToInterval={SNAP}
        decelerationRate="fast"
        getItemLayout={(_, index) => ({ length: SNAP, offset: SNAP * index, index })}
        onScrollBeginDrag={() => {
          pausedRef.current = true;
          progressAnimRef.current?.stop();
          progressAnim.setValue(0);
        }}
        onMomentumScrollEnd={(e) => {
          const i = Math.round(e.nativeEvent.contentOffset.x / SNAP);
          const clamped = Math.max(0, Math.min(i, clubs.length - 1));
          indexRef.current = clamped;
          setCurrentIndex(clamped);
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

      {clubs.length > 1 && (
        <View style={styles.dotsRow}>
          {clubs.map((_, i) => (
            <TouchableOpacity key={i} onPress={() => goTo(i)} activeOpacity={0.7}>
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor:
                      i === currentIndex ? colors.primary + "40" : colors.border,
                    width: i === currentIndex ? 32 : 6,
                  },
                ]}
              >
                {i === currentIndex && (
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
