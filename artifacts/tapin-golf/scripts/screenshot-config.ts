/**
 * App Store / Google Play screenshot pipeline — configuration
 *
 * Defines the screens to capture, the device sizes required by each store,
 * and the mock auth state to inject so protected routes render correctly.
 */

// ─── Auth ─────────────────────────────────────────────────────────────────────

/**
 * A mock user object that matches the User interface in AuthContext.tsx.
 *
 * Injected into localStorage under the key `tapin_user` before navigating to
 * any auth-gated route so the app renders the logged-in state immediately.
 *
 * ## Token strategy
 *
 * By default `token` is a placeholder. The server's background profile-refresh
 * will fail (404/401), but the app still renders with the injected user data so
 * the UI chrome is fully visible.
 *
 * For real seeded content on auth-gated screens (Bookings, Profile, Scoring…):
 *   1. Create a dedicated screenshot test account in the dev database.
 *   2. Generate its HMAC token (use POST /api/auth/login or derive it via the
 *      HMAC secret from the server's TOKEN_SECRET env var).
 *   3. Set the `SCREENSHOT_TOKEN` environment variable to that token value.
 *   4. The pipeline will pick it up automatically — no code change needed.
 *
 * Example (one-time setup):
 *   SCREENSHOT_TOKEN="$(node -e "require('./lib/genToken')(1)")" pnpm run screenshots
 */
export const MOCK_USER = {
  id: 123,
  name: "Alex Golfer",
  email: "screenshot@tapingolf.co.za",
  phone: "+27821234567",
  role: "golfer" as const,
  club_id: null,
  // Real token from SCREENSHOT_TOKEN env var takes precedence over the placeholder.
  // Set this env var to a valid token from a seeded test account for live data.
  // To refresh the token (it expires every 30 days) run:
  //   curl -s -X POST http://localhost:8080/api/auth/login \
  //     -H "Content-Type: application/json" \
  //     -d '{"email":"screenshot@tapingolf.co.za","password":"Screenshot2026!"}' \
  //     | node -e "process.stdin||(process.stdin=require('stream').Readable.from([]));let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).user.token))"
  token: process.env.SCREENSHOT_TOKEN ?? "MOCK_TOKEN_FOR_SCREENSHOTS",
  handicap: 12,
  gender: "male" as const,
  home_province: "Gauteng",
  terms_accepted: true,
};

// ─── Seed IDs ─────────────────────────────────────────────────────────────────

/**
 * Known entity IDs from the seeded database.
 *
 * These are used to build deep-link routes for screens that require a
 * specific resource (club detail, booking detail, etc.).
 *
 * Update these if the seed data changes. You can find valid IDs by running:
 *   SELECT id, name FROM clubs LIMIT 5;
 *   SELECT id FROM bookings LIMIT 5;
 */
export const SEED_IDS = {
  clubId: 142,      // Glendower Golf Club (seeded screenshot club)
  bookingId: 148,   // Screenshot test account's confirmed upcoming booking
  eventId: 1,
};

// ─── Screens ──────────────────────────────────────────────────────────────────

export interface ScreenConfig {
  /** Slug used as the filename: screenshots/{device}/{slug}.png */
  slug: string;
  /** Human-readable label for logs */
  name: string;
  /** Expo-router path — use the exact route segment, e.g. "/(tabs)/" */
  path: string;
  /** Whether this route requires the mock user to be injected into localStorage */
  requiresAuth: boolean;
  /**
   * CSS selector or text to wait for before capturing.
   * The script waits up to 8 s for this to appear; falls back to a fixed
   * 3 s delay if it times out.
   */
  waitForSelector?: string;
  /** Extra milliseconds to pause after the selector appears (let animations settle) */
  settleMs?: number;
}

export const SCREENS: ScreenConfig[] = [
  {
    slug: "home",
    name: "Home",
    path: "/",
    requiresAuth: true,
    waitForSelector: "text=Find Your Round",
    settleMs: 1000,
  },
  {
    slug: "explore",
    name: "Explore",
    path: "/(tabs)/explore",
    requiresAuth: true,
    waitForSelector: "text=Showing",
    settleMs: 1500,
  },
  {
    slug: "tournaments",
    name: "Tournaments",
    path: "/(tabs)/tournaments",
    requiresAuth: true,
    waitForSelector: "text=Tournaments",
    settleMs: 1200,
  },
  {
    slug: "club-detail",
    name: "Club Detail",
    path: `/club/${SEED_IDS.clubId}`,
    requiresAuth: false,
    waitForSelector: "[data-testid=club-name], text=holes",
    settleMs: 1200,
  },
  {
    slug: "my-golf",
    name: "My Golf",
    path: "/(tabs)/my-golf",
    requiresAuth: true,
    waitForSelector: "text=My Golf",
    settleMs: 800,
  },
  {
    slug: "bookings",
    name: "Bookings",
    path: "/(tabs)/bookings",
    requiresAuth: true,
    waitForSelector: "text=Bookings",
    settleMs: 1000,
  },
  {
    slug: "booking-detail",
    name: "Booking Detail",
    path: `/booking/${SEED_IDS.bookingId}`,
    requiresAuth: true,
    waitForSelector: "text=Booking Details",
    settleMs: 1000,
  },
  {
    slug: "friends",
    name: "Friends",
    path: "/(tabs)/friends",
    requiresAuth: true,
    waitForSelector: "text=Friends",
    settleMs: 800,
  },
  {
    slug: "profile",
    name: "Profile",
    path: "/(tabs)/profile",
    requiresAuth: true,
    waitForSelector: "text=Alex Golfer, text=Profile",
    settleMs: 800,
  },
  {
    slug: "scoring",
    name: "Scoring",
    path: "/(tabs)/scoring",
    requiresAuth: true,
    waitForSelector: "text=Scoring, text=Scorecard",
    settleMs: 1000,
  },
];

// ─── Device sizes ─────────────────────────────────────────────────────────────

export interface DeviceConfig {
  /** Directory name: screenshots/{slug}/{screen}.png */
  slug: string;
  /** Human-readable label */
  name: string;
  /** Viewport width in CSS pixels */
  width: number;
  /** Viewport height in CSS pixels */
  height: number;
  /**
   * Device pixel ratio — Playwright uses this to produce a physical
   * screenshot at width*dpr × height*dpr pixels, which matches what the
   * stores expect.
   */
  deviceScaleFactor: number;
  /** Store this size targets */
  store: "ios" | "android";
}

export const DEVICES: DeviceConfig[] = [
  // ── iOS ───────────────────────────────────────────────────────────────────
  {
    slug: "ios-6_7in",
    name: 'iPhone 16 Pro Max — 6.7"',
    width: 430,
    height: 932,
    deviceScaleFactor: 3,       // 1290×2796 physical
    store: "ios",
  },
  {
    slug: "ios-6_5in",
    name: 'iPhone 15 Plus — 6.5"',
    width: 428,
    height: 926,
    deviceScaleFactor: 3,       // 1284×2778 physical
    store: "ios",
  },
  {
    slug: "ios-5_5in",
    name: 'iPhone 8 Plus — 5.5"',
    width: 414,
    height: 736,
    deviceScaleFactor: 3,       // 1242×2208 physical
    store: "ios",
  },
  {
    slug: "ios-ipad-pro-12_9in",
    name: 'iPad Pro 12.9"',
    width: 1024,
    height: 1366,
    deviceScaleFactor: 2,       // 2048×2732 physical
    store: "ios",
  },

  // ── Android ───────────────────────────────────────────────────────────────
  {
    slug: "android-phone",
    name: "Android Phone (1080×1920)",
    width: 360,
    height: 640,
    deviceScaleFactor: 3,       // 1080×1920 physical
    store: "android",
  },
  {
    slug: "android-7in-tablet",
    name: 'Android 7" Tablet (1200×1920)',
    width: 600,
    height: 960,
    deviceScaleFactor: 2,       // 1200×1920 physical
    store: "android",
  },
  {
    slug: "android-10in-tablet",
    name: 'Android 10" Tablet (1600×2560)',
    width: 800,
    height: 1280,
    deviceScaleFactor: 2,       // 1600×2560 physical
    store: "android",
  },
];
