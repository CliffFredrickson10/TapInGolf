import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  port: parseInt(process.env.MYSQL_PORT || "3306"),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 5,
});

function parseCSV(content) {
  const lines = content.split("\n").filter(l => l.trim());
  const headers = lines[0].split(",").map(h => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const cols = [];
    let cur = "";
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; }
      else if (ch === "," && !inQuotes) { cols.push(cur.trim()); cur = ""; }
      else { cur += ch; }
    }
    cols.push(cur.trim());
    if (cols.length < 3) continue;
    const row = {};
    headers.forEach((h, i) => row[h] = cols[i] ?? "");
    rows.push(row);
  }
  return rows;
}

async function run() {
  const conn = await pool.getConnection();
  try {
    console.log("Connected to MySQL");

    // 0. Add columns if missing
    console.log("Ensuring schema columns exist...");
    const alterations = [
      "ALTER TABLE clubs ADD COLUMN IF NOT EXISTS phone VARCHAR(50) NULL",
      "ALTER TABLE clubs ADD COLUMN IF NOT EXISTS website VARCHAR(500) NULL",
      "ALTER TABLE clubs ADD COLUMN IF NOT EXISTS latitude DECIMAL(10,7) NULL",
      "ALTER TABLE clubs ADD COLUMN IF NOT EXISTS longitude DECIMAL(10,7) NULL",
    ];
    for (const sql of alterations) {
      await conn.query(sql);
    }
    console.log("Schema ready");

    // 1. Clear dependent tables first, then clubs
    console.log("Clearing old data...");
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");
    await conn.query("TRUNCATE TABLE reviews");
    await conn.query("TRUNCATE TABLE booking_players");
    await conn.query("TRUNCATE TABLE bookings");
    await conn.query("TRUNCATE TABLE tee_times");
    await conn.query("TRUNCATE TABLE clubs");
    await conn.query("SET FOREIGN_KEY_CHECKS = 1");
    console.log("All old data cleared");

    // 2. Parse CSV
    const csvPath = path.resolve(__dirname, "../sa_golf_courses.csv");
    const content = fs.readFileSync(csvPath, "utf8");
    const rows = parseCSV(content);
    console.log(`Parsed ${rows.length} clubs from CSV`);

    // 3. Insert clubs in batches of 50
    let inserted = 0;
    const BATCH = 50;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const values = batch.map(r => {
        const name = r["Name"] || "";
        const location = r["City"] || r["Address"] || "";
        const province = r["Province"] || "";
        const holes = parseInt(r["Holes"]) || 18;
        const greenFee = parseFloat(r["Green Fee (ZAR)"]) || null;
        const phone = r["Phone"] || null;
        const website = r["Website"] || null;
        const lat = parseFloat(r["Latitude"]) || null;
        const lng = parseFloat(r["Longitude"]) || null;
        const facilities = JSON.stringify(["Pro Shop", "Club Hire"]);
        return [name, location, province, holes, greenFee, facilities, phone, website, lat, lng];
      });

      const placeholders = values.map(() => "(?,?,?,?,?,?,?,?,?,?)").join(",");
      await conn.query(
        `INSERT INTO clubs (name, location, province, holes, price_from, facilities, phone, website, latitude, longitude)
         VALUES ${placeholders}`,
        values.flat()
      );
      inserted += batch.length;
      process.stdout.write(`\rInserted ${inserted}/${rows.length} clubs...`);
    }
    console.log(`\n✅ Inserted ${inserted} clubs`);

    // 4. Seed tee times for next 14 days
    console.log("Seeding tee times for next 14 days...");
    const [clubRows] = await conn.query("SELECT id, price_from FROM clubs");
    const times = ["07:00","07:30","08:00","08:30","09:00","09:30","10:00","10:30","11:00","11:30","12:00","14:00","14:30","15:00"];

    let teeCount = 0;
    for (let d = 0; d < 14; d++) {
      const date = new Date();
      date.setDate(date.getDate() + d);
      const dateStr = date.toISOString().split("T")[0];

      // Batch all clubs × times for this day
      const dayValues = [];
      for (const club of clubRows) {
        for (const time of times) {
          const price = parseFloat(club.price_from) || 500;
          dayValues.push([club.id, dateStr, time, price]);
        }
      }
      for (let b = 0; b < dayValues.length; b += 500) {
        const chunk = dayValues.slice(b, b + 500);
        const ph = chunk.map(() => "(?,?,?,?,4)").join(",");
        await conn.query(
          `INSERT INTO tee_times (club_id, date, time, price, total_slots) VALUES ${ph}`,
          chunk.flat()
        );
        teeCount += chunk.length;
      }
      process.stdout.write(`\rSeeded day ${d + 1}/14 (${teeCount} tee times)...`);
    }
    console.log(`\n✅ Seeded ${teeCount} tee times`);

    console.log("\n🎉 Done! Database loaded with all clubs and tee times.");
  } finally {
    conn.release();
    await pool.end();
  }
}

run().catch(e => { console.error("❌ Error:", e.message); process.exit(1); });
