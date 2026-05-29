/**
 * CachedImage — drop-in Image replacement with local disk caching.
 *
 * Cache strategy
 * ──────────────
 * • Cache key = unsigned 32-bit djb2 hash of the full URI → deterministic filename.
 * • If the URI stored in the DB changes (different path / filename), the hash
 *   changes, a new file is downloaded, and the old one is left for the OS to
 *   evict from the cache directory.
 * • On web, caching is skipped (expo-file-system is unavailable) and the
 *   image is loaded directly.
 * • data: URIs (base64 avatars) are rendered in-place — never cached.
 */

import * as FileSystem from "expo-file-system";
import React, { useEffect, useRef, useState } from "react";
import {
  Image,
  ImageResizeMode,
  Platform,
  StyleProp,
  ImageStyle,
  View,
  StyleSheet,
} from "react-native";

const CACHE_DIR = (FileSystem.cacheDirectory ?? "") + "tapin_img/";

let cacheDirReady = false;
async function ensureCacheDir() {
  if (cacheDirReady) return;
  const info = await FileSystem.getInfoAsync(CACHE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
  }
  cacheDirReady = true;
}

/** Unsigned 32-bit djb2 hash → base-36 string (short, filesystem-safe). */
function hashUri(uri: string): string {
  let h = 5381;
  for (let i = 0; i < uri.length; i++) {
    h = (((h << 5) + h) ^ uri.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}

/** Extract a safe extension from the URL (ignores query strings). */
function extOf(uri: string): string {
  const clean = uri.split("?")[0].split("#")[0];
  const m = clean.match(/\.([a-zA-Z0-9]{1,5})$/);
  return m ? m[1].toLowerCase() : "jpg";
}

function cachePathFor(uri: string): string {
  return CACHE_DIR + hashUri(uri) + "." + extOf(uri);
}

// ─── In-progress download promise dedup ──────────────────────────────────────
const inFlight: Record<string, Promise<string>> = {};

async function resolveUri(uri: string): Promise<string> {
  // Already a local file
  if (uri.startsWith("file://")) return uri;

  const path = cachePathFor(uri);

  // Fast path: already cached
  const info = await FileSystem.getInfoAsync(path);
  if (info.exists) return path;

  // Dedup: if another component is already downloading the same URI, reuse that promise
  if (inFlight[uri]) return inFlight[uri];

  const download = (async () => {
    await ensureCacheDir();
    const result = await FileSystem.downloadAsync(uri, path);
    delete inFlight[uri];
    return result.uri;
  })();

  inFlight[uri] = download;
  return download;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  uri: string | null | undefined;
  style?: StyleProp<ImageStyle>;
  resizeMode?: ImageResizeMode;
  /** Show while the local cache is being resolved. Defaults to a transparent filler. */
  placeholder?: React.ReactElement;
}

export default function CachedImage({ uri, style, resizeMode = "cover", placeholder }: Props) {
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [errored, setErrored] = useState(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    setLocalUri(null);
    setErrored(false);

    if (!uri) return;

    // data: URIs and web — skip caching
    if (Platform.OS === "web" || uri.startsWith("data:") || uri.startsWith("file://")) {
      setLocalUri(uri);
      return;
    }

    resolveUri(uri)
      .then((local) => {
        if (!cancelledRef.current) setLocalUri(local);
      })
      .catch(() => {
        if (!cancelledRef.current) {
          // Fall back to remote URL so the image still shows
          setLocalUri(uri);
        }
      });

    return () => {
      cancelledRef.current = true;
    };
  }, [uri]);

  if (!localUri) {
    return placeholder ?? <View style={[style, styles.filler]} />;
  }

  return (
    <Image
      source={{ uri: errored ? uri ?? "" : localUri }}
      style={style}
      resizeMode={resizeMode}
      onError={() => {
        // If the cached file is corrupt, retry with the original remote URL
        if (!errored && uri && localUri !== uri) {
          setErrored(true);
        }
      }}
    />
  );
}

const styles = StyleSheet.create({
  filler: { backgroundColor: "transparent" },
});
