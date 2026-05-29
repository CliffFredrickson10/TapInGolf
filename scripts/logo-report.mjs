import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  port: parseInt(process.env.MYSQL_PORT || "3306"),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
});

const [all] = await pool.query("SELECT id, name, location, province, website, image_url FROM clubs ORDER BY province, name");
await pool.end();

const noWebsite   = all.filter(c => !c.website);
const hasWebsite  = all.filter(c => c.website);
const hasLogo     = hasWebsite.filter(c => c.image_url?.startsWith("/api/logos/"));
const noLogo      = hasWebsite.filter(c => !c.image_url?.startsWith("/api/logos/"));

console.log("=".repeat(70));
console.log("TAPIN GOLF — CLUB LOGO REPORT");
console.log("=".repeat(70));
console.log(`Total clubs:          ${all.length}`);
console.log(`With website:         ${hasWebsite.length}`);
console.log(`  → Logo found:       ${hasLogo.length}`);
console.log(`  → No logo found:    ${noLogo.length}`);
console.log(`No website listed:    ${noWebsite.length}`);
console.log("");

// Group no-logo clubs by province
console.log("─".repeat(70));
console.log("CLUBS WITH WEBSITE BUT NO LOGO FOUND");
console.log("─".repeat(70));
const noLogoByProv = {};
for (const c of noLogo) {
  (noLogoByProv[c.province] ||= []).push(c);
}
for (const prov of Object.keys(noLogoByProv).sort()) {
  console.log(`\n  ${prov} (${noLogoByProv[prov].length})`);
  for (const c of noLogoByProv[prov]) {
    console.log(`    • ${c.name} (${c.location})`);
    console.log(`      ${c.website}`);
  }
}

// No website
console.log("\n");
console.log("─".repeat(70));
console.log("CLUBS WITH NO WEBSITE");
console.log("─".repeat(70));
const noWebByProv = {};
for (const c of noWebsite) {
  (noWebByProv[c.province] ||= []).push(c);
}
for (const prov of Object.keys(noWebByProv).sort()) {
  console.log(`\n  ${prov} (${noWebByProv[prov].length})`);
  for (const c of noWebByProv[prov]) {
    console.log(`    • ${c.name} (${c.location})`);
  }
}

console.log("\n");
console.log("=".repeat(70));
console.log(`SUMMARY: ${hasLogo.length} logos found, ${noLogo.length} missing from websites, ${noWebsite.length} clubs have no website`);
console.log("=".repeat(70));
