/**
 * Extracts logos from a zip where filenames = club names,
 * fuzzy-matches each to a club in the DB, stores as <id>.<ext>
 * in artifacts/api-server/logos/, and updates image_url.
 * Replaces any existing logo for a matched club.
 */
import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGOS_DIR  = path.resolve(__dirname, "../artifacts/api-server/logos");
const ZIP_PATH   = path.resolve(__dirname, "../attached_assets/Club_logos_1_1779295243345.zip");
const EXTRACT_TMP = "/tmp/club_logos_extracted";

// ── 1. Extract zip via python3 (built-in zipfile) ───────────────────────────
if (fs.existsSync(EXTRACT_TMP)) execSync(`rm -rf "${EXTRACT_TMP}"`);
fs.mkdirSync(EXTRACT_TMP, { recursive: true });

execSync(
  `python3 -c "import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])" "${ZIP_PATH}" "${EXTRACT_TMP}"`,
  { stdio: "inherit" }
);

const extractedFiles = fs.readdirSync(EXTRACT_TMP);
console.log(`Extracted ${extractedFiles.length} files\n`);

// ── 2. Connect + fetch all clubs ─────────────────────────────────────────────
const conn = await mysql.createConnection({
  host: process.env.MYSQL_HOST,
  port: parseInt(process.env.MYSQL_PORT || "3306"),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
});

const [clubs] = await conn.query("SELECT id, name FROM clubs ORDER BY id");
console.log(`Loaded ${clubs.length} clubs from DB\n`);

// ── 3. Fuzzy match helper ────────────────────────────────────────────────────
function normalise(s) {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function similarity(a, b) {
  // Dice-coefficient on bigrams
  const bigrams = s => {
    const set = new Map();
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2);
      set.set(bg, (set.get(bg) || 0) + 1);
    }
    return set;
  };
  const biA = bigrams(a), biB = bigrams(b);
  let intersection = 0;
  for (const [bg, cnt] of biA) {
    if (biB.has(bg)) intersection += Math.min(cnt, biB.get(bg));
  }
  const total = a.length - 1 + b.length - 1;
  return total === 0 ? 0 : (2 * intersection) / total;
}

const normClubs = clubs.map(c => ({ id: c.id, name: c.name, norm: normalise(c.name) }));

function bestMatch(filename) {
  const q = normalise(filename);
  let best = { score: 0, club: null };
  for (const c of normClubs) {
    const score = similarity(q, c.norm);
    if (score > best.score) best = { score, club: c };
  }
  return best;
}

// ── 4. Process each logo ─────────────────────────────────────────────────────
fs.mkdirSync(LOGOS_DIR, { recursive: true });
const updates = [];
const lowConfidence = [];

for (const filename of extractedFiles) {
  const parsed = path.parse(filename);
  const stem = parsed.name;
  let ext = parsed.ext.toLowerCase();
  if (ext === ".jfif") ext = ".jpg";
  if (ext === ".PNG") ext = ".png";

  const { score, club } = bestMatch(stem);
  if (!club) continue;

  // Remove any existing logo for this club ID
  const existing = fs.readdirSync(LOGOS_DIR).filter(f => f.match(new RegExp(`^${club.id}\\.`, "i")));
  for (const old of existing) fs.unlinkSync(path.join(LOGOS_DIR, old));

  // Copy new logo
  const dest = path.join(LOGOS_DIR, `${club.id}${ext}`);
  fs.copyFileSync(path.join(EXTRACT_TMP, filename), dest);

  const url = `/api/logos/${club.id}${ext}`;
  updates.push({ url, id: club.id });

  const mark = score >= 0.75 ? "✅" : "⚠️ ";
  console.log(`${mark} [${score.toFixed(2)}]  "${stem}"  →  [${club.id}] "${club.name}"  →  ${url}`);
  if (score < 0.75) lowConfidence.push({ stem, matched: club.name, score });
}

// ── 5. Batch update DB ───────────────────────────────────────────────────────
if (updates.length > 0) {
  const caseExpr = updates.map(u => `WHEN ${u.id} THEN '${u.url}'`).join(" ");
  const ids = updates.map(u => u.id).join(",");
  const [result] = await conn.query(
    `UPDATE clubs SET image_url = CASE id ${caseExpr} END WHERE id IN (${ids})`
  );
  console.log(`\n✅ Updated ${result.affectedRows} clubs in the database`);
}

await conn.end();

// ── 6. Summary ────────────────────────────────────────────────────────────────
const [[{ total }]] = await (async () => {
  const c2 = await mysql.createConnection({
    host: process.env.MYSQL_HOST, port: parseInt(process.env.MYSQL_PORT || "3306"),
    user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
  });
  const r = await c2.query("SELECT COUNT(*) as total FROM clubs WHERE image_url IS NOT NULL AND image_url != ''");
  await c2.end();
  return r;
})();

console.log(`\nTotal logos in DB now : ${total}`);
console.log(`Logos processed        : ${updates.length}`);
console.log(`Low-confidence matches : ${lowConfidence.length}`);
if (lowConfidence.length) {
  console.log("\nReview these:");
  for (const { stem, matched, score } of lowConfidence) {
    console.log(`  [${score.toFixed(2)}] "${stem}"  →  "${matched}"`);
  }
}
