/**
 * App Store / Google Play screenshot capture script
 *
 * Usage:
 *   pnpm run screenshots                            — auto-detects server (Replit dev domain preferred)
 *   pnpm run screenshots --url https://my.domain    — points at a specific server
 *   pnpm run screenshots --devices ios-6_7in,ios-6_5in  — only specific devices
 *   pnpm run screenshots --screens home,explore     — only specific screens
 *   pnpm run screenshots --verbose                  — show Expo/browser console output
 *
 * Server resolution order:
 *   1. --url flag
 *   2. REPLIT_DEV_DOMAIN env var (preferred on Replit — /api works on same origin)
 *   3. Already-running server on localhost:19006
 *   4. Starts Expo web on localhost:19006 (uses REPLIT_DEV_DOMAIN for API routing
 *      if set; warns if not set and API may be unreachable)
 *
 * Output: screenshots/{device}/{screen}.png
 */

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { spawn, spawnSync, execSync, type ChildProcess } from "child_process";
import { mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { DEVICES, MOCK_USER, SCREENS, type DeviceConfig, type ScreenConfig } from "./screenshot-config";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ─── CLI args ─────────────────────────────────────────────────────────────────

function getArg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

function getFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

const urlArg      = getArg("url");
const devicesArg  = getArg("devices");
const screensArg  = getArg("screens");
const verboseFlag = getFlag("verbose");

const targetDevices  = devicesArg  ? DEVICES.filter(d => devicesArg.split(",").includes(d.slug))   : DEVICES;
const targetScreens  = screensArg  ? SCREENS.filter(s => screensArg.split(",").includes(s.slug))   : SCREENS;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(`[screenshots] ${msg}`);
}

function verbose(msg: string) {
  if (verboseFlag) console.log(`  [verbose] ${msg}`);
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Polls a URL until it returns a successful response or the timeout expires.
 */
async function waitForServer(url: string, timeoutMs = 120_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (res.ok || res.status < 500) return true;
    } catch {
      // server not ready yet
    }
    await sleep(2000);
  }
  return false;
}

// ─── Server management ────────────────────────────────────────────────────────

const EXPO_WEB_PORT = 19006;
let expoProcess: ChildProcess | null = null;

/**
 * Determines the base URL to use for Playwright and ensures a server is running.
 *
 * Resolution order:
 *  1. --url CLI flag
 *  2. REPLIT_DEV_DOMAIN env var (preferred — Expo web + /api are on the same origin,
 *     so all API calls work without any extra configuration)
 *  3. Already-running server on localhost:19006
 *  4. Start a new Expo web server on localhost:19006, forwarding REPLIT_DEV_DOMAIN
 *     as EXPO_PUBLIC_DOMAIN so the app makes API calls to the correct backend
 */
async function ensureServer(): Promise<string> {
  if (urlArg) {
    log(`Using provided server URL: ${urlArg}`);
    return urlArg;
  }

  // ── Option 2: Replit dev domain ────────────────────────────────────────────
  // On Replit the proxy exposes both Expo web (port 26107 or similar) and
  // the API server (port 8080) through the same HTTPS domain.  Both the web
  // app and /api are reachable, so we get live data and auth without any extra
  // configuration.
  const replitDomain = process.env.REPLIT_DEV_DOMAIN;
  if (replitDomain) {
    const replitUrl = `https://${replitDomain}`;
    log(`Checking Replit dev domain: ${replitUrl}`);
    try {
      const res = await fetch(replitUrl, { signal: AbortSignal.timeout(8000) });
      if (res.ok || res.status < 500) {
        log(`Using Replit dev domain (Expo web + /api on same origin): ${replitUrl}`);
        return replitUrl;
      }
      log(`Replit dev domain returned ${res.status} — falling back to local server.`);
    } catch {
      log(`Replit dev domain not responding — falling back to local server.`);
    }
  }

  // ── Option 3: Already-running local server ─────────────────────────────────
  const localUrl = `http://localhost:${EXPO_WEB_PORT}`;
  try {
    const res = await fetch(localUrl, { signal: AbortSignal.timeout(2000) });
    if (res.ok || res.status < 500) {
      log(`Found running Expo web server at ${localUrl}`);
      if (!replitDomain) {
        log(`WARNING: REPLIT_DEV_DOMAIN is not set. API calls from the app use relative`);
        log(`         /api paths which resolve to localhost:${EXPO_WEB_PORT}/api — no backend there.`);
        log(`         Pass --url <full-url> where both web and /api are reachable, or`);
        log(`         set REPLIT_DEV_DOMAIN so the app can reach the real API server.`);
      }
      return localUrl;
    }
  } catch {
    // nothing running — fall through to start one
  }

  // ── Option 4: Start Expo web locally ──────────────────────────────────────
  log(`Starting Expo web dev server on port ${EXPO_WEB_PORT}…`);

  // Set EXPO_PUBLIC_DOMAIN so the bundled app makes API calls to the correct
  // backend.  If REPLIT_DEV_DOMAIN is set, API calls go to
  // https://{replitDomain}/api even though the web app is served from
  // localhost:19006.  Without it, API calls would use the relative /api path
  // which has no handler on the Expo dev server.
  const spawnEnv: NodeJS.ProcessEnv = { ...process.env };
  if (replitDomain) {
    spawnEnv.EXPO_PUBLIC_DOMAIN = replitDomain;
    log(`EXPO_PUBLIC_DOMAIN=${replitDomain} — API calls will reach the live backend.`);
  } else {
    // No routable domain available; API calls will silently fail.
    // Screens that don't require API data will still render correctly.
    spawnEnv.EXPO_PUBLIC_DOMAIN = "";
    log(`WARNING: REPLIT_DEV_DOMAIN not set. Data-dependent screens may render empty.`);
    log(`         Set REPLIT_DEV_DOMAIN or pass --url to a URL with a working /api backend.`);
  }

  expoProcess = spawn(
    "pnpm",
    ["exec", "expo", "start", "--web", "--port", String(EXPO_WEB_PORT), "--non-interactive", "--no-dev"],
    { cwd: ROOT, env: spawnEnv, stdio: verboseFlag ? "inherit" : "pipe" }
  );

  expoProcess.on("error", (err) => {
    console.error("[screenshots] Failed to start Expo:", err.message);
  });

  log("Waiting for Expo web to become available (up to 120 s)…");
  const ready = await waitForServer(localUrl, 120_000);

  if (!ready) {
    shutdown();
    throw new Error(`Expo web server did not start within 120 s. Run with --verbose to see output.`);
  }

  // Extra settle time for the bundler to finish all chunks
  await sleep(3000);
  log("Expo web server is ready.");
  return localUrl;
}

function shutdown() {
  if (expoProcess) {
    try { expoProcess.kill("SIGTERM"); } catch {}
    expoProcess = null;
  }
}

// ─── Auth injection ───────────────────────────────────────────────────────────

/**
 * Injects the mock user into the page's localStorage so AuthContext picks it
 * up on the next navigation. AsyncStorage on web stores values at the exact
 * key you provide.
 */
async function injectAuth(page: Page) {
  await page.evaluate((user) => {
    localStorage.setItem("tapin_user", JSON.stringify(user));
  }, MOCK_USER);
}

async function clearAuth(page: Page) {
  await page.evaluate(() => {
    localStorage.removeItem("tapin_user");
  });
}

// ─── Negative-state detection ─────────────────────────────────────────────────

/**
 * Text patterns that indicate the page landed on the wrong state.
 * Detected AFTER content wait so they catch redirects, not transient loaders.
 */
const BAD_STATE_PATTERNS = [
  "Sign in",
  "Log in",
  "Login",
  "Create account",
  "Page not found",
  "Not Found",
  "Something went wrong",
  "Error loading",
  "Network request failed",
];

/**
 * Returns a description of the bad state detected, or null if the page looks
 * correct.  Uses locator().count() so it never throws.
 */
async function detectBadState(page: Page): Promise<string | null> {
  for (const pattern of BAD_STATE_PATTERNS) {
    try {
      const count = await page.locator(`text=${pattern}`).count();
      if (count > 0) return `page contains "${pattern}"`;
    } catch {
      // locator count failed — skip
    }
  }
  return null;
}

// ─── Screenshot capture ───────────────────────────────────────────────────────

interface CaptureResult {
  device: string;
  screen: string;
  path: string;
  ok: boolean;
  error?: string;
}

async function captureScreen(
  page: Page,
  baseUrl: string,
  device: DeviceConfig,
  screen: ScreenConfig,
): Promise<CaptureResult> {
  const outDir      = join(ROOT, "screenshots", device.slug);
  const outPath     = join(outDir, `${screen.slug}.png`);
  const failedPath  = join(outDir, `${screen.slug}-failed.png`);
  mkdirSync(outDir, { recursive: true });

  const url = `${baseUrl}${screen.path}`;

  const fail = async (reason: string): Promise<CaptureResult> => {
    // Save a debug capture so the caller can inspect what actually rendered
    try {
      await page.screenshot({ path: failedPath, fullPage: false, animations: "disabled" });
    } catch {}
    return { device: device.slug, screen: screen.slug, path: outPath, ok: false, error: reason };
  };

  try {
    // ── 1. Set up localStorage auth state ───────────────────────────────────
    // Navigate to root first to get a same-origin context, then set/clear auth.
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    if (screen.requiresAuth) {
      await injectAuth(page);
    } else {
      await clearAuth(page);
    }

    // ── 2. Navigate to the target screen ────────────────────────────────────
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });

    // ── 3. Wait for the expected content selector ────────────────────────────
    if (screen.waitForSelector) {
      // Try each alternative selector in order; fail only when none found.
      const selectors = screen.waitForSelector.split(", ");
      let found = false;
      for (const sel of selectors) {
        try {
          await page.waitForSelector(sel, { timeout: 8_000, state: "visible" });
          verbose(`  selector found: ${sel}`);
          found = true;
          break;
        } catch {
          verbose(`  selector not found: ${sel}`);
        }
      }
      if (!found) {
        return await fail(`Expected content not found — none of [${selectors.join(", ")}] appeared within 8 s`);
      }
    } else {
      await page.waitForLoadState("networkidle").catch(() => {});
    }

    // ── 4. Let animations / skeleton loaders settle ──────────────────────────
    if (screen.settleMs) {
      await sleep(screen.settleMs);
    }

    // ── 5. Negative-state guard ──────────────────────────────────────────────
    // Runs after settle so transient loaders have resolved.
    const badState = await detectBadState(page);
    if (badState) {
      return await fail(`Bad state detected: ${badState}`);
    }

    // ── 6. Remove Expo dev-tools overlays ────────────────────────────────────
    await page.evaluate(() => {
      document.querySelectorAll('[data-testid="expo-error-overlay"]').forEach(el => el.remove());
    });

    // ── 7. Capture ───────────────────────────────────────────────────────────
    await page.screenshot({
      path: outPath,
      fullPage: false,
      animations: "disabled",
    });

    verbose(`  saved ${outPath}`);
    return { device: device.slug, screen: screen.slug, path: outPath, ok: true };

  } catch (err: any) {
    return await fail(err?.message ?? String(err));
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

/**
 * Returns the path to a usable Chromium executable.
 * Searches (in order):
 *  1. PLAYWRIGHT_CHROMIUM_PATH env var (explicit override)
 *  2. Known nix profile symlink locations (Replit NixOS)
 *  3. `which chromium` / `which chromium-browser` on PATH
 * Never falls back to the Playwright-managed binary — it is missing system
 * libraries in the Replit sandbox and will always fail.
 */
function resolveChromiumPath(): string | undefined {
  // 1. Explicit override
  if (process.env.PLAYWRIGHT_CHROMIUM_PATH) {
    log(`Using PLAYWRIGHT_CHROMIUM_PATH: ${process.env.PLAYWRIGHT_CHROMIUM_PATH}`);
    return process.env.PLAYWRIGHT_CHROMIUM_PATH;
  }

  // 2. Known nix profile / system paths (Replit NixOS)
  const nixCandidates = [
    "/root/.nix-profile/bin/chromium",
    "/home/runner/.nix-profile/bin/chromium",
    "/nix/var/nix/profiles/default/bin/chromium",
    "/run/current-system/sw/bin/chromium",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  for (const p of nixCandidates) {
    if (existsSync(p)) {
      log(`Using system Chromium (nix profile): ${p}`);
      return p;
    }
  }

  // 3. `which` lookup (inherits current PATH)
  try {
    const p = execSync("which chromium 2>/dev/null || which chromium-browser 2>/dev/null", {
      encoding: "utf8",
      env: process.env,
      shell: "/bin/bash",
    }).trim();
    if (p) {
      log(`Using system Chromium (PATH): ${p}`);
      return p;
    }
  } catch {
    // not on PATH
  }

  return undefined;
}

async function main() {
  const start = Date.now();

  log(`Capturing ${targetScreens.length} screen(s) × ${targetDevices.length} device(s) = ${targetScreens.length * targetDevices.length} screenshot(s).`);

  const executablePath = resolveChromiumPath();
  if (!executablePath) {
    throw new Error("No Chromium found. Run: pnpm exec playwright install chromium");
  }

  // Start (or locate) the Expo web server
  const baseUrl = await ensureServer();

  // Launch headless Chromium
  const browser: Browser = await chromium.launch({ headless: true, executablePath });

  const results: CaptureResult[] = [];

  try {
    // Capture device by device so each gets a clean context + viewport
    for (const device of targetDevices) {
      log(`\n── ${device.name} (${device.width}×${device.height} @ ${device.deviceScaleFactor}x) ──`);

      const context: BrowserContext = await browser.newContext({
        viewport:          { width: device.width, height: device.height },
        deviceScaleFactor: device.deviceScaleFactor,
        userAgent:         "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36",
        // Disable location permission prompts
        permissions:       [],
        geolocation:       undefined,
        locale:            "en-ZA",
        colorScheme:       "light",
      });

      const page: Page = await context.newPage();

      // Suppress browser console noise unless verbose
      if (!verboseFlag) {
        page.on("console", () => {});
        page.on("pageerror", () => {});
      }

      for (const screen of targetScreens) {
        process.stdout.write(`  ${screen.name.padEnd(20)} … `);
        const result = await captureScreen(page, baseUrl, device, screen);
        results.push(result);
        console.log(result.ok ? `✓  ${result.path}` : `✗  FAILED: ${result.error}`);
      }

      await context.close();
    }
  } finally {
    await browser.close();
    shutdown();
  }

  // ── Summary ────────────────────────────────────────────────────────────────

  const passed = results.filter(r => r.ok);
  const failed = results.filter(r => !r.ok);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`\n${"─".repeat(60)}`);
  console.log(`Screenshots complete in ${elapsed}s`);
  console.log(`  ✓ ${passed.length} written`);

  if (failed.length > 0) {
    console.log(`  ✗ ${failed.length} failed:`);
    for (const f of failed) {
      console.log(`      ${f.device}/${f.screen}: ${f.error}`);
    }
  }

  console.log(`\nOutput folder: ${join(ROOT, "screenshots")}/`);
  console.log(`Structure:     screenshots/{device}/{screen}.png`);
  console.log(`Devices:       ${targetDevices.map(d => d.slug).join(", ")}`);
  console.log(`Screens:       ${targetScreens.map(s => s.slug).join(", ")}`);

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch(err => {
  console.error("[screenshots] Fatal error:", err);
  shutdown();
  process.exit(1);
});
