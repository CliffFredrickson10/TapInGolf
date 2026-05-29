import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Keyboard,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

const TENOR_KEY = "LIVDSRZULELA";
const COLS = 2;
const GAP = 6;
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const TILE_W = (Math.min(SCREEN_W, 480) - 24 - GAP) / COLS;
const SHEET_H = Math.round(SCREEN_H * 0.62);

type GifItem = {
  id: string;
  previewUrl: string;
  fullUrl: string;
  aspectRatio: number;
};

async function fetchTenor(query: string): Promise<GifItem[]> {
  const endpoint = query.trim()
    ? `https://api.tenor.com/v1/search?key=${TENOR_KEY}&q=${encodeURIComponent(query)}&limit=24&media_filter=minimal&contentfilter=low`
    : `https://api.tenor.com/v1/trending?key=${TENOR_KEY}&limit=24&media_filter=minimal&contentfilter=low`;
  const res = await fetch(endpoint);
  const json = await res.json();
  return (json.results ?? []).map((d: any) => {
    const media = d.media?.[0] ?? {};
    const preview = media.tinygif ?? media.gif ?? {};
    const full = media.gif ?? media.tinygif ?? {};
    const dims = preview.dims ?? [200, 150];
    return {
      id: String(d.id),
      previewUrl: preview.url ?? "",
      fullUrl: full.url ?? preview.url ?? "",
      aspectRatio: (dims[0] || 200) / (dims[1] || 150),
    };
  }).filter((g: GifItem) => g.previewUrl);
}

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
};

export default function GifPicker({ visible, onClose, onSelect }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [gifs, setGifs] = useState<GifItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    setError(false);
    try {
      const results = await fetchTenor(q);
      setGifs(results);
    } catch {
      setError(true);
      setGifs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      setQuery("");
      setGifs([]);
      load("");
    }
  }, [visible, load]);

  const handleQueryChange = (q: string) => {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(q), 400);
  };

  const handleSelect = (gif: GifItem) => {
    onSelect(gif.fullUrl);
    onClose();
    setQuery("");
    setGifs([]);
  };

  const renderItem = ({ item }: { item: GifItem }) => {
    const tileH = Math.round(TILE_W / item.aspectRatio);
    return (
      <TouchableOpacity
        onPress={() => handleSelect(item)}
        activeOpacity={0.8}
        style={{ width: TILE_W, height: tileH, borderRadius: 10, overflow: "hidden" }}
      >
        <Image
          source={{ uri: item.previewUrl }}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      </TouchableOpacity>
    );
  };

  const bottomPad = Platform.OS === "web" ? 12 : insets.bottom + 8;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Full-screen flex container — pushes sheet to bottom */}
      <View style={styles.overlay}>
        {/* Tappable backdrop */}
        <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={onClose} activeOpacity={1} />

        {/* Bottom sheet — explicit height so FlatList has room */}
        <View style={[styles.sheet, { height: SHEET_H, backgroundColor: colors.card, paddingBottom: bottomPad }]}>
          {/* Drag handle */}
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          {/* Search bar */}
          <View style={[styles.searchRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Ionicons name="search" size={16} color={colors.mutedForeground} style={{ marginLeft: 10 }} />
            <TextInput
              style={[styles.searchInput, { color: colors.foreground, backgroundColor: "transparent" }]}
              value={query}
              onChangeText={handleQueryChange}
              placeholder="Search GIFs…"
              placeholderTextColor={colors.mutedForeground}
              autoCorrect={false}
              returnKeyType="search"
              underlineColorAndroid="transparent"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => { setQuery(""); load(""); }} style={styles.clearBtn}>
                <Ionicons name="close-circle" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}
          </View>

          {/* Attribution */}
          <Text style={[styles.powered, { color: colors.mutedForeground }]}>Powered by Tenor</Text>

          {/* Content */}
          {loading ? (
            <View style={styles.centred}>
              <ActivityIndicator color={colors.primary} size="large" />
            </View>
          ) : error ? (
            <View style={styles.centred}>
              <Ionicons name="wifi-outline" size={36} color={colors.mutedForeground} />
              <Text style={[styles.statusText, { color: colors.mutedForeground }]}>Could not load GIFs</Text>
              <TouchableOpacity onPress={() => load(query)} style={[styles.retryBtn, { borderColor: colors.border }]}>
                <Text style={[styles.retryLabel, { color: colors.primary }]}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : gifs.length === 0 ? (
            <View style={styles.centred}>
              <Ionicons name="images-outline" size={36} color={colors.mutedForeground} />
              <Text style={[styles.statusText, { color: colors.mutedForeground }]}>No GIFs found</Text>
            </View>
          ) : (
            <FlatList
              data={gifs}
              keyExtractor={(item) => item.id}
              numColumns={COLS}
              columnWrapperStyle={{ gap: GAP }}
              contentContainerStyle={{ gap: GAP, paddingHorizontal: 12, paddingBottom: 12 }}
              renderItem={renderItem}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              onScrollBeginDrag={Keyboard.dismiss}
              style={{ flex: 1 }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 10,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 },
    elevation: 16,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 12,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 22,
    marginHorizontal: 12,
    marginBottom: 4,
    height: 42,
    gap: 4,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    paddingRight: 4,
  },
  clearBtn: {
    padding: 8,
  },
  powered: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    textAlign: "right",
    paddingRight: 16,
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  centred: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingBottom: 32,
  },
  statusText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  retryBtn: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 8,
    marginTop: 4,
  },
  retryLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
});
