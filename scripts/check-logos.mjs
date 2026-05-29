import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  port: parseInt(process.env.MYSQL_PORT || "3306"),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
});

const [[r]] = await pool.query("SELECT COUNT(*) as with_logo FROM clubs WHERE image_url LIKE '/api/logos/%'");
console.log("Clubs with logos in DB:", r.with_logo);

const [sample] = await pool.query("SELECT id, name, image_url FROM clubs WHERE image_url LIKE '/api/logos/%' LIMIT 5");
sample.forEach(c => console.log(" -", c.name, "|", c.image_url));

await pool.end();
