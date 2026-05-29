import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  port: parseInt(process.env.MYSQL_PORT ?? "3306"),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
});

await pool.execute("ALTER TABLE clubs ADD COLUMN IF NOT EXISTS website VARCHAR(500) DEFAULT NULL");
await pool.execute("ALTER TABLE clubs ADD COLUMN IF NOT EXISTS logo_url VARCHAR(500) DEFAULT NULL");
const [rows] = await pool.execute("SELECT id, name FROM clubs ORDER BY id") as [any[], any];
console.log(`✅ Columns ready. ${rows.length} clubs:`);
rows.forEach((r: any) => console.log(`  [${r.id}] ${r.name}`));
await pool.end();
