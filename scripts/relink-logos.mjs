import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGOS_DIR = path.resolve(__dirname, "../artifacts/api-server/logos");

const conn = await mysql.createConnection({
  host: process.env.MYSQL_HOST,
  port: parseInt(process.env.MYSQL_PORT || "3306"),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
});

const logoFiles = fs.readdirSync(LOGOS_DIR);
const entries = [];
for (const f of logoFiles) {
  const m = f.match(/^(\d+)\.(png|jpe?g|gif|webp|svg|ico)$/i);
  if (m) entries.push({ id: parseInt(m[1]), file: f });
}
console.log(`Found ${entries.length} logo files on disk`);

// Build a single CASE ... WHEN batch update
if (entries.length > 0) {
  const caseExpr = entries.map(e => `WHEN ${e.id} THEN '/api/logos/${e.file}'`).join(" ");
  const ids = entries.map(e => e.id).join(",");
  const sql = `UPDATE clubs SET image_url = CASE id ${caseExpr} END WHERE id IN (${ids})`;
  const [result] = await conn.query(sql);
  console.log(`✅ Updated ${result.affectedRows} clubs with logo URLs`);
}

const [[r]] = await conn.query("SELECT COUNT(*) as c FROM clubs WHERE image_url LIKE '/api/logos/%'");
console.log(`Clubs with logo in DB: ${r.c}`);

await conn.end();
