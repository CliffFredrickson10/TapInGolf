import { Storage } from "@google-cloud/storage";
import * as fs from "fs";
import * as path from "path";
import * as mysql from "mysql2/promise";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  } as any,
  projectId: "",
});

const BUCKET_ID = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID!;
const ASSETS_DIR = "/home/runner/workspace/attached_assets";
const DEV_DOMAIN = process.env.REPLIT_DEV_DOMAIN || "localhost";

const LOGO_MAP: Record<string, string[]> = {
  "Arabella_Golf_Estate_1779270381755.jpg":     ["Arabella Golf Estate"],
  "Blair_Atholl_Golf_Estate_1779270381755.png":  ["Blair Atholl Golf Estate"],
  "Bloemfontein_Golf_Club_1779270381755.jpg":    ["Bloemfontein Golf Club"],
  "Country_Club_Johannesburg_1779270381756.jpg": ["Country Club Johannesburg", "The Country Club Johannesburg"],
  "East_London_Golf_Club_1779270381756.jpg":     ["East London Golf Club"],
  "Humewood_Golf_Club_1779270381757.jpg":        ["Humewood Golf Club"],
  "Kimberley_Golf_Club_1779270381757.jpg":       ["Kimberley Golf Club"],
  "Milnerton_Golf_Club_1779270381757.jpg":       ["Milnerton Golf Club"],
  "Pretoria_Country_Club_1779270381759.jpg":     ["Pretoria Country Club"],
  "Royal_Cape_Golf_Club_1779270381760.jpg":      ["Royal Cape Golf Club"],
  "Selborne_Country_Club_1779270381760.jpg":     ["Selborne Country Club", "Selborne Golf Estate"],
  "White_River_Country_Club_1779270381760.jpg":  ["White River Country Club"],
};

async function main() {
  const db = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
  });

  const bucket = storage.bucket(BUCKET_ID);
  const publicBase = `https://${DEV_DOMAIN}/api/storage/public-objects/${BUCKET_ID}`;

  for (const [filename, clubNames] of Object.entries(LOGO_MAP)) {
    const filePath = path.join(ASSETS_DIR, filename);
    if (!fs.existsSync(filePath)) {
      console.log(`SKIP (not found): ${filename}`);
      continue;
    }

    const ext = path.extname(filename).toLowerCase();
    const objectName = `public/club-logos/${filename}`;
    const contentType = ext === ".png" ? "image/png" : "image/jpeg";

    console.log(`Uploading ${filename}...`);
    await bucket.upload(filePath, {
      destination: objectName,
      metadata: { contentType },
    });

    const publicUrl = `https://${DEV_DOMAIN}/api/storage/public-objects/club-logos/${filename}`;

    for (const name of clubNames) {
      const [result]: any = await db.execute(
        "UPDATE clubs SET logo_url = ? WHERE name LIKE ?",
        [publicUrl, `%${name}%`]
      );
      console.log(`  Updated "${name}": ${result.affectedRows} row(s)`);
    }
  }

  await db.end();
  console.log("\nDone!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
