import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  port: parseInt(process.env.MYSQL_PORT || "3306"),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
});

const [cleared] = await pool.query("UPDATE clubs SET featured = 0");
console.log("Cleared all featured flags");

const [rows] = await pool.query(
  "SELECT id, name FROM clubs WHERE province = ? ORDER BY RAND() LIMIT 8",
  ["Gauteng"]
);
const ids = rows.map(r => r.id);
await pool.query(`UPDATE clubs SET featured = 1 WHERE id IN (${ids.map(() => "?").join(",")})`, ids);

console.log("✅ 8 Gauteng clubs set as featured:");
rows.forEach((r, i) => console.log(`  ${i + 1}. ${r.name} (id: ${r.id})`));

await pool.end();
