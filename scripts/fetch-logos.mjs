/**
 * Fetches logos for all clubs that have a website.
 * Strategy per club:
 *   1. Fetch the homepage HTML, extract <meta property="og:image"> or <link rel="...icon">
 *   2. Fall back to /favicon.ico on the domain
 * Downloads the image and saves it to artifacts/api-server/logos/<id>.<ext>
 * Updates clubs.image_url = '/api/logos/<id>.<ext>'
 */
import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGOS_DIR = path.resolve(__dirname, "../artifacts/api-server/logos");
fs.mkdirSync(LOGOS_DIR, { recursive: true });

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  port: parseInt(process.env.MYSQL_PORT || "3306"),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  connectionLimit: 5,
});

const TIMEOUT_MS = 8000;
const CONCURRENCY = 8;

async function fetchWithTimeout(url, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal, redirect: "follow" });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

function extractLogoUrl(html, baseUrl) {
  const base = new URL(baseUrl);

  // 1. og:image
  const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (ogMatch) return resolveUrl(ogMatch[1], base);

  // 2. apple-touch-icon (highest res icon)
  const appleMatch = html.match(/<link[^>]+rel=["'][^"']*apple-touch-icon[^"']*["'][^>]+href=["']([^"']+)["']/i)
    || html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*apple-touch-icon[^"']*["']/i);
  if (appleMatch) return resolveUrl(appleMatch[1], base);

  // 3. shortcut icon / icon with size ≥ 64
  const iconMatches = [...html.matchAll(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>/gi)];
  for (const m of iconMatches) {
    const sizeMatch = m[0].match(/sizes=["'](\d+)x/i);
    if (sizeMatch && parseInt(sizeMatch[1]) >= 64) return resolveUrl(m[1], base);
  }
  if (iconMatches.length) return resolveUrl(iconMatches[0][1], base);

  return null;
}

function resolveUrl(href, base) {
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

function extFromContentType(ct, fallbackUrl) {
  if (!ct) ct = "";
  if (ct.includes("png"))  return "png";
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  if (ct.includes("gif"))  return "gif";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("svg"))  return "svg";
  if (ct.includes("ico"))  return "ico";
  // guess from URL
  const m = fallbackUrl?.match(/\.(png|jpe?g|gif|webp|svg|ico)(\?|$)/i);
  return m ? m[1].replace("jpeg", "jpg") : "png";
}

async function downloadImage(url, destBase) {
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("text/html")) throw new Error("Got HTML instead of image");
  const ext = extFromContentType(ct, url);
  const dest = `${destBase}.${ext}`;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 100) throw new Error("Image too small (probably blank)");
  fs.writeFileSync(dest, buf);
  return { dest, ext };
}

async function processClub(club) {
  const { id, name, website } = club;
  let logoImageUrl = null;

  // Remove any existing logo files for this club
  for (const f of fs.readdirSync(LOGOS_DIR)) {
    if (f.startsWith(`${id}.`)) fs.unlinkSync(path.join(LOGOS_DIR, f));
  }

  const destBase = path.join(LOGOS_DIR, String(id));

  try {
    // Ensure URL has a protocol
    const siteUrl = website.startsWith("http") ? website : `https://${website}`;

    // Step 1: fetch HTML and extract logo URL
    const htmlRes = await fetchWithTimeout(siteUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; TapInGolfBot/1.0)" }
    });

    if (htmlRes.ok) {
      const html = await htmlRes.text();
      const imgUrl = extractLogoUrl(html, siteUrl);
      if (imgUrl) {
        try {
          const { ext } = await downloadImage(imgUrl, destBase);
          logoImageUrl = `/api/logos/${id}.${ext}`;
        } catch (e) {
          // fall through to favicon
        }
      }
    }

    // Step 2: fallback — try /favicon.ico
    if (!logoImageUrl) {
      const base = new URL(website.startsWith("http") ? website : `https://${website}`);
      const faviconUrl = `${base.origin}/favicon.ico`;
      try {
        const { ext } = await downloadImage(faviconUrl, destBase);
        logoImageUrl = `/api/logos/${id}.${ext}`;
      } catch {
        // no logo found
      }
    }
  } catch {
    // site unreachable
  }

  return { id, name, logoImageUrl };
}

async function runBatch(clubs) {
  return Promise.all(clubs.map(c => processClub(c).catch(() => ({ id: c.id, name: c.name, logoImageUrl: null }))));
}

async function run() {
  const [clubs] = await pool.query(
    "SELECT id, name, website FROM clubs WHERE website IS NOT NULL AND website != '' AND (image_url IS NULL OR image_url NOT LIKE '/api/logos/%') ORDER BY id"
  );
  console.log(`Found ${clubs.length} clubs with websites`);

  let done = 0, found = 0;
  const conn = await pool.getConnection();

  for (let i = 0; i < clubs.length; i += CONCURRENCY) {
    const batch = clubs.slice(i, i + CONCURRENCY);
    const results = await runBatch(batch);

    for (const { id, name, logoImageUrl } of results) {
      if (logoImageUrl) {
        await conn.query("UPDATE clubs SET image_url = ? WHERE id = ?", [logoImageUrl, id]);
        found++;
      }
      done++;
    }

    process.stdout.write(`\r[${done}/${clubs.length}] Logos found: ${found}`);
  }

  conn.release();
  await pool.end();
  console.log(`\n\n✅ Done. Found logos for ${found}/${clubs.length} clubs with websites.`);
}

run().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
