import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST, port: parseInt(process.env.MYSQL_PORT || "3306"),
  user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
});

// Total and ID range
const [[counts]] = await pool.query("SELECT COUNT(*) as total, MIN(id) as min_id, MAX(id) as max_id FROM clubs");
console.log("Total clubs:", counts.total, "| IDs:", counts.min_id, "–", counts.max_id);

// Duplicate names
const [dupes] = await pool.query(`
  SELECT name, COUNT(*) as cnt FROM clubs GROUP BY name HAVING cnt > 1 ORDER BY cnt DESC LIMIT 20
`);
console.log("\nDuplicate names:", dupes.length);
dupes.forEach(d => console.log(` x${d.cnt}  ${d.name}`));

// ID gap analysis — where are the clusters?
const [idBuckets] = await pool.query(`
  SELECT FLOOR(id/100)*100 as bucket, COUNT(*) as cnt FROM clubs GROUP BY bucket ORDER BY bucket
`);
console.log("\nID distribution (buckets of 100):");
idBuckets.forEach(b => console.log(`  ${b.bucket}–${b.bucket+99}: ${b.cnt} clubs`));

// Sample of highest IDs (likely the "extras")
const [highIds] = await pool.query("SELECT id, name, location, province FROM clubs ORDER BY id DESC LIMIT 10");
console.log("\nHighest ID clubs (last inserted):");
highIds.forEach(c => console.log(`  #${c.id} ${c.name} – ${c.location}, ${c.province}`));

await pool.end();
