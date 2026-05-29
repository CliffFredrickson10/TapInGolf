/**
 * Corrects the wrong club→logo assignments from the zip import.
 * Moves logo files to the correct club ID and updates DB.
 */
import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGOS_DIR  = path.resolve(__dirname, "../artifacts/api-server/logos");
const TMP_DIR    = "/tmp/club_logos_extracted";

const conn = await mysql.createConnection({
  host: process.env.MYSQL_HOST,
  port: parseInt(process.env.MYSQL_PORT || "3306"),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
});

// Maps: { logoFileStem, wrongClubId, correctClubId }
// wrongClubId = where the import script mistakenly placed the logo
// correctClubId = actual club in DB
const corrections = [
  { stem: "Dainfern Golf Club",         wrongId: 1,   correctId: 85  },
  { stem: "ERPM Golf Club",             wrongId: 68,  correctId: 118 },
  { stem: "Emfuleni Golf Estate",       wrongId: 156, correctId: 113 },
  { stem: "Beachwood Country Club",     wrongId: 495, correctId: 27  },
  { stem: "Heilbron Country Club",      wrongId: 52,  correctId: 167 },
  { stem: "Glengarry Golf Club",        wrongId: 145, correctId: 143 },
  { stem: "Kroonstad Golf Club",        wrongId: 177, correctId: 232 },
  { stem: "Standerton Golf Club",       wrongId: 278, correctId: 417 },
  { stem: "Barberton Country Club",     wrongId: 417, correctId: 25  },
  { stem: "Ladybrand Golf Club",        wrongId: 425, correctId: 241 },
];

// Clubs whose logos were wrongly overwritten by "not in DB" entries
// — clear their image_url so fetch-logos can re-fill them
const clearWrongLogos = [
  { id: 292, note: "Mooipoort — got Komatipoort logo" },
  { id: 295, note: "Mossel Bay — got Still Bay logo" },
  { id: 226, note: "Koro Creek — got Selborne Park logo" },
];

function findFile(clubId) {
  const files = fs.readdirSync(LOGOS_DIR).filter(f => f.match(new RegExp(`^${clubId}\\.`, "i")));
  return files[0] ? path.join(LOGOS_DIR, files[0]) : null;
}

function findExtractedFile(stem) {
  if (!fs.existsSync(TMP_DIR)) return null;
  const files = fs.readdirSync(TMP_DIR).filter(f => path.parse(f).name === stem);
  return files[0] ? path.join(TMP_DIR, files[0]) : null;
}

console.log("=== Fixing logo mismatches ===\n");

// Process corrections in dependency order — Barberton must go first
// so id 417 is free before Standerton moves there
const ordered = [...corrections].sort((a, b) => {
  if (a.wrongId === b.correctId) return -1;
  if (b.wrongId === a.correctId) return 1;
  return 0;
});

for (const { stem, wrongId, correctId } of ordered) {
  // Find the source file — prefer the extracted tmp dir (original), fall back to wrongId slot
  let srcFile = findExtractedFile(stem) || findFile(wrongId);
  if (!srcFile) {
    console.log(`  ⚠️  No source file found for "${stem}" (wrongId=${wrongId}) — skipping`);
    continue;
  }

  const ext = path.extname(srcFile).toLowerCase().replace(".jfif", ".jpg");
  const destFile = path.join(LOGOS_DIR, `${correctId}${ext}`);

  // Remove any existing file at the correct destination
  for (const old of fs.readdirSync(LOGOS_DIR).filter(f => f.match(new RegExp(`^${correctId}\\.`, "i")))) {
    fs.unlinkSync(path.join(LOGOS_DIR, old));
  }

  fs.copyFileSync(srcFile, destFile);

  // Clear image_url at wrongId (unless another correction will fill it)
  const willBeFilledByAnotherCorrection = ordered.some(c => c.correctId === wrongId);
  if (!willBeFilledByAnotherCorrection) {
    await conn.query("UPDATE clubs SET image_url = NULL WHERE id = ?", [wrongId]);
  }

  // Set image_url at correctId
  const url = `/api/logos/${correctId}${ext}`;
  await conn.query("UPDATE clubs SET image_url = ? WHERE id = ?", [url, correctId]);
  console.log(`  ✅  "${stem}"  →  [${correctId}]  (was wrongly at [${wrongId}])  ${url}`);
}

// Clear wrongly overwritten logos
console.log("\n=== Clearing wrongly overwritten logos ===\n");
for (const { id, note } of clearWrongLogos) {
  const f = findFile(id);
  if (f) fs.unlinkSync(f);
  await conn.query("UPDATE clubs SET image_url = NULL WHERE id = ?", [id]);
  console.log(`  🗑  id=${id}  ${note}`);
}

await conn.end();

// Final count
const c2 = await mysql.createConnection({
  host: process.env.MYSQL_HOST, port: parseInt(process.env.MYSQL_PORT || "3306"),
  user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE,
});
const [[{ total }]] = await c2.query("SELECT COUNT(*) as total FROM clubs WHERE image_url IS NOT NULL AND image_url != ''");
await c2.end();
console.log(`\nClubs with logos in DB: ${total}`);
