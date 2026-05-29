import mysql from "mysql2/promise";
import { Storage } from "@google-cloud/storage";
import { randomUUID } from "crypto";
import https from "https";
import http from "http";
import { URL } from "url";

// ── GCS client (Replit sidecar auth) ──────────────────────────────────────
const SIDECAR = "http://127.0.0.1:1106";
const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${SIDECAR}/token`,
    type: "external_account",
    credential_source: {
      url: `${SIDECAR}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});
const BUCKET = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID!;
const PRIVATE_DIR = process.env.PRIVATE_OBJECT_DIR ?? "uploads";

// ── MySQL ──────────────────────────────────────────────────────────────────
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  port: parseInt(process.env.MYSQL_PORT ?? "3306"),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 3,
});

// ── HTTP helpers ───────────────────────────────────────────────────────────
function fetchHtml(url: string, redirects = 5): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === "https:" ? https : http;
    const req = lib.get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; TapInGolfBot/1.0; +https://tapingolf.co.za)",
          Accept: "text/html",
        },
        timeout: 10000,
      },
      (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location &&
          redirects > 0
        ) {
          const loc = res.headers.location;
          const next = loc.startsWith("http")
            ? loc
            : `${parsed.protocol}//${parsed.host}${loc}`;
          resolve(fetchHtml(next, redirects - 1));
          return;
        }
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve(data));
      }
    );
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
  });
}

function fetchBinary(url: string, redirects = 5): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === "https:" ? https : http;
    const req = lib.get(
      url,
      {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; TapInGolfBot/1.0)" },
        timeout: 15000,
      },
      (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location &&
          redirects > 0
        ) {
          const loc = res.headers.location;
          const next = loc.startsWith("http")
            ? loc
            : `${parsed.protocol}//${parsed.host}${loc}`;
          resolve(fetchBinary(next, redirects - 1));
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      }
    );
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
  });
}

// ── Logo extraction ────────────────────────────────────────────────────────
function extractLogoUrl(html: string, baseUrl: string): string | null {
  function abs(src: string): string {
    try { return new URL(src, baseUrl).href; } catch { return ""; }
  }

  // 1. og:image (skip data: URIs)
  const ogImg = html.match(
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
  ) || html.match(
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i
  );
  if (ogImg?.[1] && !ogImg[1].startsWith("data:")) return abs(ogImg[1]);

  // 2. <img> with "logo" in src or class or id or alt
  const logoImgRe = /<img[^>]+(src|class|id|alt)=["'][^"']*logo[^"']*["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = logoImgRe.exec(html)) !== null) {
    const srcM = m[0].match(/src=["']([^"']+)["']/i);
    if (srcM?.[1]) {
      const u = abs(srcM[1]);
      if (u) return u;
    }
  }

  // 3. apple-touch-icon
  const ati = html.match(
    /<link[^>]+rel=["']apple-touch-icon["'][^>]+href=["']([^"']+)["']/i
  ) || html.match(
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']apple-touch-icon["']/i
  );
  if (ati?.[1]) return abs(ati[1]);

  // 4. link rel icon (prefer png/svg over .ico)
  const iconRe = /<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]+href=["']([^"']+)["']/gi;
  const icons: string[] = [];
  while ((m = iconRe.exec(html)) !== null) {
    const u = abs(m[1]);
    if (u) icons.push(u);
  }
  const pngIcon = icons.find((u) => /\.(png|svg|webp)/i.test(u));
  if (pngIcon) return pngIcon;
  if (icons[0]) return icons[0];

  const base = new URL(baseUrl);
  return `${base.protocol}//${base.host}/favicon.png`;
}

// ── GCS upload ─────────────────────────────────────────────────────────────
function mimeFromUrl(url: string): string {
  if (/\.svg/i.test(url)) return "image/svg+xml";
  if (/\.webp/i.test(url)) return "image/webp";
  if (/\.gif/i.test(url)) return "image/gif";
  if (/\.jpe?g/i.test(url)) return "image/jpeg";
  return "image/png";
}

async function uploadToGcs(buf: Buffer, mimeType: string, ext: string): Promise<string> {
  const bucket = storage.bucket(BUCKET);
  const objectPath = `${PRIVATE_DIR}/club-logos/${randomUUID()}${ext}`;
  const file = bucket.file(objectPath);
  await file.save(buf, { contentType: mimeType, resumable: false });
  return `/objects/${objectPath}`;
}

// ── Known websites (sourced from CSV + manual research) ──────────────────
const KNOWN_WEBSITES: Record<string, string> = {
  // ── Gauteng ───────────────────────────────────────────────────────────
  "Glendower Golf Club":           "https://glendower.co.za",
  "Randpark Golf Club":            "https://randpark.co.za",
  "Wanderers Golf Club":           "https://wanderersgolfclub.co.za",
  "Houghton Golf Club":            "https://www.houghton.co.za",
  "Royal Johannesburg Golf Club":  "https://royaljk.co.za",
  "Country Club Johannesburg":     "https://ccj.co.za",
  "Bryanston Country Club":        "https://www.bryanstoncc.co.za",
  "Eagle Canyon Golf Club":        "https://www.eaglecanyongolfestate.co.za",
  "Dainfern Golf Club":            "https://www.dainferncc.co.za",
  "Ebotse Links":                  "https://ebotselinks.com",
  "Eye of Africa Golf Club":       "https://eyeofafrica.co.za",
  "Copperleaf Golf Estate":        "https://www.copperleaf.co.za",
  "Glenvista Country Club":        "https://glenvistacountryclub.co.za",
  "Centurion Country Club":        "https://centurioncountryclub.co.za",
  "Blair Atholl Golf Estate":      "https://blairathollgolfestate.co.za",
  "Zwartkop Country Club":         "https://zwartkopcc.co.za",
  "Blue Valley Golf Estate":       "https://www.bluevalleygolf.co.za",
  "Irene Country Club":            "https://www.irenecountryclub.co.za",
  "Pebble Rock Golf Club":         "https://pebblerock.co.za",
  "Pretoria Golf Club":            "https://pretoriagolfclub.co.za",
  "Pretoria Country Club":         "https://pretoriacountryclub.co.za",
  "Silver Lakes Golf Estate":      "https://silverlakes.co.za",
  "Waterkloof Golf Club":          "https://waterkloofgolfclub.co.za",
  "Wingate Park Country Club":     "https://www.wingateparkcc.co.za",
  "Woodhill Country Club":         "https://woodhill.co.za",
  "Cullinan Golf Club":            "https://www.cullinangolfclub.com",
  "Soweto Country Club":           "https://www.sowetocountryclub.co.za",
  "Germiston Golf Club":           "https://germistongolfclub.co.za",
  "Sandonia Golf Club":            "https://sandoniagolfclub.co.za",
  "Crown Mines Golf Club":         "https://crownminesgolfclub.co.za",
  "Akasia Golf Club":              "https://akasiagolfclub.co.za",
  "Benoni Lake Club":              "https://www.lakeclub.co.za",
  "CMR Golf Club":                 "https://cmrgolfclub.co.za",
  "Emfuleni Golf Estate":          "https://emfulenigolf.co.za",
  "Serengeti Golf & Wildlife Estate": "https://serengeti-estates.co.za",
  "The Club at Steyn City":        "https://www.steyncity.co.za",
  "Pecanwood Golf Estate":         "https://www.pecanwood.co.za",
  "Sun City Gary Player CC":       "https://www.suninternational.com/sun-city",

  // ── Western Cape ───────────────────────────────────────────────────────
  "Westlake Golf Club":            "https://westlakegolfclub.co.za",
  "Royal Cape Golf Club":          "https://www.royalcapegolfclub.co.za",
  "Steenberg Golf Club":           "https://www.steenberggolfclub.co.za",
  "Erinvale Golf Club":            "https://www.erinvale.com",
  "Arabella Golf Estate":          "https://arabella.co.za",
  "Milnerton Golf Club":           "https://milnertoncc.co.za",
  "Clovelly Country Club":         "https://clovellygolfclub.co.za",
  "Pearl Valley Golf Estate":      "https://www.pearlvalley.co.za",
  "Pezula Championship Course":    "https://www.pezula.com",
  "Atlantic Beach Links":          "https://atlanticbeach.co.za",
  "Bellville Golf Club":           "https://bellvillegolfclub.co.za",
  "Bredasdorp Golf Club":          "https://bredasdorpgolfclub.co.za",
  "Devonvale Golf Estate":         "https://www.devonvale.co.za",
  "De Zalze Golf Club":            "https://dezalze.co.za",
  "King David Mowbray Golf Club":  "https://www.kingdavidmowbraygc.co.za",
  "Kleinmond Golf Club":           "https://www.kleinmondgolfclub.co.za",
  "Langebaan Golf Estate":         "https://langebaanestate.co.za",
  "Rondebosch Golf Club":          "https://rondeboschgolfclub.com",
  "Stellenbosch Golf Club":        "https://stellenboschgolfclub.com",
  "Strand Golf Club":              "https://www.strandgolfclub.co.za",
  "Somerset West Golf Club":       "https://www.somersetwestgolfclub.co.za",
  "Durbanville Golf Club":         "https://www.durbanvillegolfclub.co.za",
  "Hermanus Golf Club":            "https://www.hermanusgolfclub.co.za",
  "Ceres Golf Club":               "https://ceresgolfclub.com",
  "Citrusdal Golf Club":           "https://citrusdalgolfclub.co.za",
  "Clanwilliam Golf Club":         "https://clanwilliamgolfclub.co.za",
  "Caledon Golf Club":             "https://caledoncountryclub.co.za",
  "Moorreesburg Golf Club":        "https://moorreessburggolfclub.co.za",
  "Robertson Golf Club":           "https://robertsongolfclub.co.za",
  "Swellendam Golf Club":          "https://swellendamgolfclub.co.za",
  "Beaufort West Golf Club":       "https://beaufortwestgolfclub.co.za",
  "Darling Golf Club":             "https://darlinggolfclub.co.za",
  "Atlantic Beach Golf Club":      "https://www.atlanticbeachgolf.co.za",
  "Simons Town Country Club":      "https://www.simonstowncountryclub.co.za",
  "Still Bay Golf Club":           "https://stillbaygolfclub.co.za",
  "Hazendal Golf Course":          "https://hazendal.co.za",
  "Boggomsbaai Golf Club":         "https://boggomsbaai.co.za",

  // ── Garden Route / George ──────────────────────────────────────────────
  "George Golf Club":              "https://georgecc.co.za",
  "Goose Valley Golf Estate":      "https://www.goosevalley.co.za",
  "Kingswood Golf Estate":         "https://www.kingswood.co.za",
  "Knysna Golf Club":              "https://knysnagolfclub.co.za",
  "Mossel Bay Golf Club":          "https://www.mosselbaygolfclub.co.za",
  "Oubaai Golf Club":              "https://www.oubaaigolfclub.com",
  "Pezula Golf Club":              "https://www.pezulagolfestate.com",
  "Pinnacle Point Golf Estate":    "https://pinnaclepointestate.co.za",
  "Plettenberg Bay Golf Club":     "https://www.plettgolf.co.za",
  "Simola Hotel Country Club":     "https://www.simola.co.za",
  "Fancourt Hotel & CC":           "https://fancourt.co.za",
  "St Francis Links":              "https://stfrancislinks.com",

  // ── KwaZulu-Natal ──────────────────────────────────────────────────────
  "Durban Country Club":           "https://durbancountryclub.co.za",
  "Zimbali Country Club":          "https://zimbali.com",
  "Royal Durban Golf Club":        "https://www.royaldurban.co.za",
  "Selborne Country Club":         "https://www.selbornecountryclub.com",
  "Beachwood Country Club":        "https://beachwoodgolfclub.co.za",
  "Bluff National Park Golf Club": "https://bluffgolfclub.co.za",
  "Boschoek Golf Club":            "https://boschoek.co.za",
  "Cathedral Peak Golf Course":    "https://www.cathedralpeak.co.za",
  "Cotswold Downs Golf Club":      "https://cotswolddowns.co.za",
  "Kloof Country Club":            "https://kloofcc.co.za",
  "Ladysmith Country Club":        "https://ladysmithcountryclub.co.za",
  "Mount Edgecombe Country Club":  "https://www.mountedgecombe.co.za",
  "Port Shepstone Country Club":   "https://psgolfclub.co.za",
  "Prince's Grant Golf Estate":    "https://www.princesgrant.co.za",
  "San Lameer Golf Club":          "https://sanlameer.co.za",
  "Scottburgh Golf Club":          "https://scottburghgolfclub.co.za",
  "Selborne Park Golf Estate":     "https://selborneparkestate.co.za",
  "Southbroom Golf Club":          "https://www.southbroomgolfclub.co.za",
  "Simbithi Country Club":         "https://simbithi.co.za",
  "Champagne Sports Resort":       "https://www.champagnesports.co.za",
  "Eshowe Hills Eco Estate":       "https://eshowehills.co.za",
  "Amanzimtoti Country Club":      "https://amanzimtotigolfclub.co.za",
  "Gowrie Farm Golf Club":         "https://www.gowrie.co.za",
  "Dundee Country Club":           "https://dundeecountryclub.co.za",
  "Estcourt Golf Club":            "https://estcourtgolfclub.co.za",
  "Empangeni Country Club":        "https://empangenicountryclub.co.za",
  "Cato Ridge Country Club":       "https://catoridgecc.co.za",
  "Camelot Country Club":          "https://camelotcountryclub.co.za",
  "Howick Golf Club":              "https://www.howickgolfclub.co.za",
  "Ixopo Golf Club":               "https://ixopogolfclub.co.za",
  "Mooi River Country Club":       "https://mooirivercountryclub.co.za",
  "Monzi Golf Club":               "https://monzigolfclub.co.za",
  "Mtunzini Country Club":         "https://mtunzinicountryclub.co.za",
  "Richmond Natal Country Club":   "https://richmondnatalcc.co.za",
  "Vryheid Country Club":          "https://vryheid.co.za",
  "Newcastle Country Club":        "https://newcastlecountryclub.co.za",
  "Sakabula Golf Course":          "https://sakabulagolf.co.za",
  "Glengarry Golf Club":           "https://glengarrygolfclub.co.za",
  "Greytown Country Club":         "https://greytowncountryclub.co.za",

  // ── Eastern Cape ───────────────────────────────────────────────────────
  "Humewood Golf Club":            "https://humewoodgolfclub.co.za",
  "East London Golf Club":         "https://eastlondongolfclub.co.za",
  "Wild Coast Sun Country Club":   "https://www.suninternational.com/wild-coast-sun/",
  "Royal Port Alfred Golf Club":   "https://royalportalfredgolfclub.co.za",
  "The Belmont Golf Club":         "https://belmontgolfclub.co.za",
  "Adelaide Golf Club":            "https://adelaidegolfclub.co.za",
  "Aliwal North Golf Club":        "https://aliwalnorthgolfclub.co.za",
  "Barkly East Golf Club":         "https://barklyeastgolfclub.co.za",
  "Bedford Golf Club":             "https://bedfordgolfclub.co.za",
  "Burgersdorp Golf Club":         "https://burgersdorpgolfclub.co.za",
  "Cradock Golf Club":             "https://cradockgolfclub.co.za",
  "Graaff-Reinet Golf Club":       "https://graaffreinetgolfclub.co.za",
  "Gonubie Golf Club":             "https://gonubiegolfclub.co.za",
  "Mthatha Country Club":          "https://mthathacountryclub.co.za",
  "Stutterheim Country Club":      "https://stutterheimcc.co.za",
  "Sardinia Bay Golf Club":        "https://sardiniabay.co.za",
  "Fish River Sun Resort & Golf":  "https://fishriversunestate.co.za",

  // ── Free State ─────────────────────────────────────────────────────────
  "Bloemfontein Golf Club":        "https://bloemfonteingolfclub.co.za",
  "Bethlehem Golf Club":           "https://bethlehemgolfclub.co.za",
  "Clarens Golf Estate":           "https://www.theclarens.co.za",
  "Clocolan Golf Club":            "https://clocolangolfclub.co.za",
  "Ficksburg Golf Club":           "https://ficksburggolfclub.co.za",
  "Heron Banks Golf Estate":       "https://heronbanks.co.za",
  "Kroonstad Golf Club":           "https://kroonstadgolfclub.co.za",
  "Ladybrand Golf Club":           "https://ladybrandgolfclub.co.za",
  "Oppenheimer Park Golf Club":    "https://oppenheimerparkgolf.co.za",
  "Parys Golf & Country Estate":   "https://parysgolf.co.za",
  "Bothaville Golf Club":          "https://bothavillegolfclub.co.za",
  "Brandfort Golf Club":           "https://brandfortgolfclub.co.za",
  "Bethulie Golf Club":            "https://bethuliegolfclub.co.za",
  "Heilbron Country Club":         "https://heilbroncountryclub.co.za",
  "Hoopstad Golf Club":            "https://hoopstadgolfclub.co.za",
  "Harrismith Country Club":       "https://harrismithcc.co.za",
  "Senekal Golf Club":             "https://senekalgolfclub.co.za",
  "Welkom Club / Sand River":      "https://welkomgolfclub.co.za",

  // ── Northern Cape ──────────────────────────────────────────────────────
  "Kimberley Golf Club":           "https://kimberleygolfclub.co.za",
  "Sishen Golf Club":              "https://sishengolfclub.co.za",
  "Alexander Bay Golf Club":       "https://alexanderBaygolf.co.za",
  "Calvinia Golf Club":            "https://calviniagolfclub.co.za",
  "Carnarvon Golf Club":           "https://carnarvongolfclub.co.za",
  "Colesberg Golf Club":           "https://colesberggolfclub.co.za",
  "Douglas Golf Club":             "https://douglasgolfclub.co.za",
  "Hotazel Golf Club":             "https://hotazelgolfclub.co.za",
  "Hartswater Golf Club":          "https://hartswatergolfclub.co.za",
  "Upington Golf Club":            "https://uptingtongolfclub.co.za",
  "Springbok Golf Club":           "https://springbokgolfclub.co.za",
  "Sutherland Golf Club":          "https://sutherlandgolfclub.co.za",
  "Schoeman Park Golf Club":       "https://schoemanparkgolf.co.za",

  // ── Limpopo ────────────────────────────────────────────────────────────
  "Leopard Creek":                 "https://leopardcreek.co.za",
  "Hans Merensky Golf Club":       "https://hansmerensky.com",
  "Koro Creek Bushveld Estate":    "https://www.koro-creek.co.za",
  "Legend Golf & Safari Resort":   "https://www.legendgolf.co.za",
  "Euphoria Golf Estate":          "https://euphoriaestate.co.za",
  "Mogol Golf Club":               "https://mogolclub.co.za",
  "Polokwane Golf Club":           "https://polokwanegolfclub.co.za",
  "Soutpansberg Golf Club":        "https://soutpansberggolfclub.co.za",
  "Drakensig Golf Club":           "https://drakensig.co.za",
  "Groblersdal Golf Club":         "https://groblersdalgolfclub.co.za",
  "Kameeldoring Country Club":     "https://kameeldoringcc.co.za",
  "Naboomspruit Golf Club":        "https://naboomspruitgolfclub.co.za",
  "Swartklip Golf Club":           "https://swartklipgolfclub.co.za",
  "Zebula Country Club":           "https://zebulagolfestate.co.za",
  "Thabazimbi Golf Club":          "https://thabazimbigolf.co.za",

  // ── North West ─────────────────────────────────────────────────────────
  "Sun City Gary Player CC":       "https://www.suninternational.com/sun-city",
  "Magaliespark Golf Club":        "https://magaliespark.co.za",
  "Pecanwood Golf Estate":         "https://www.pecanwood.co.za",
  "Klerksdorp Golf Club":          "https://klerksdorpgolfclub.co.za",
  "Leopard Park Golf Club":        "https://leopardparkgolf.co.za",
  "Mooinooi Golf Club":            "https://mooiooigolf.co.za",
  "Orkney Golf Club":              "https://orkneygolfclub.co.za",
  "Potchefstroom Golf Club":       "https://www.potchcc.co.za",
  "Rustenburg Golf Club":          "https://www.rtbgolfclub.com",
  "Sandy Lane Golf Club":          "https://sandylanegolf.co.za",
  "Seasons Eco Golf Estate":       "https://seasonsecogolf.co.za",
  "Christiana Golf Club":          "https://christianagolfclub.co.za",
  "Schweizer-Reneke Golf Club":    "https://schweizer-renekegolf.co.za",
  "Delareyville Golf Club":        "https://delareyvillegolf.co.za",
  "Sannieshof Golf Club":          "https://sannieshofgolf.co.za",

  // ── Mpumalanga ─────────────────────────────────────────────────────────
  "White River Country Club":      "https://whiterivercountryclub.co.za",
  "Sabi River Sun Golf Club":      "https://www.sabiriver.co.za",
  "Barberton Country Club":        "https://barbertoncountryclub.co.za",
  "Belfast Golf Club":             "https://belfastgolfclub.co.za",
  "Bethal Golf Club":              "https://bethalgolfclub.co.za",
  "Delmas Golf Club":              "https://delmasgolfclub.co.za",
  "Graceland Golf Club":           "https://graceland.co.za",
  "Komatipoort Golf Club":         "https://komatipoortgolfclub.co.za",
  "Kriel Golf Club":               "https://krielgolfclub.co.za",
  "Highland Gate Golf Estate":     "https://highlandgate.co.za",
  "Drakenzicht Mountain Links":    "https://drakenzicht.co.za",
  "Kruger Park Lodge Golf Course": "https://www.krugerparklodge.co.za",
  "Walker Park Golf Club":         "https://walkerparkgolfclub.co.za",
  "Sabie Country Club":            "https://sabiecountryclub.co.za",
  "Middelburg Country Club":       "https://middelburgcc.co.za",
  "Witbank Golf Club":             "https://witbankgolfclub.co.za",
  "Ermelo Country Club":           "https://ermelocountryclub.co.za",
  "Akabeko Golf Club":             "https://akabekogolf.co.za",
  "Amersfoort Golf Club":          "https://amersfoortgolfclub.co.za",
  "Arnot Golf Club":               "https://arnotgolfclub.co.za",
  "Carolina Golf Club":            "https://carolinagolfclub.co.za",
  "Morgenzon Golf Club":           "https://morgenzon.co.za",
  "Standerton Golf Club":          "https://standertoncc.co.za",
};

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const [rows] = await pool.execute(
    "SELECT id, name, website, logo_url FROM clubs ORDER BY id"
  ) as [any[], any];

  console.log(`Processing ${rows.length} clubs...\n`);
  let done = 0, skipped = 0, noWebsite = 0, noLogo = 0;

  for (const club of rows) {
    const id: number = club.id;
    const name: string = club.name;
    let logoUrl: string = club.logo_url || "";
    const knownWebsite: string = KNOWN_WEBSITES[name] || "";
    const dbWebsite: string = club.website || "";

    // Already fully done — skip
    if (logoUrl) { skipped++; continue; }

    // Determine which website URL to try:
    // - If KNOWN_WEBSITES has an entry DIFFERENT from what's in DB → try the new URL
    // - If DB has no website yet AND KNOWN_WEBSITES has one → try it (first time)
    // - Otherwise → skip (already tried, or no website known)
    let website: string;
    if (knownWebsite && knownWebsite !== dbWebsite) {
      website = knownWebsite; // new or corrected URL — always worth trying
    } else if (!dbWebsite && knownWebsite) {
      website = knownWebsite; // never been attempted before
    } else {
      // dbWebsite === knownWebsite (already tried) OR no website at all → skip
      if (!knownWebsite && !dbWebsite) noWebsite++;
      else skipped++;
      continue;
    }

    console.log(`\n▶ [${id}] "${name}"`);
    console.log(`  website: ${website}`);

    // ── Scrape logo from website ────────────────────────────────────────
    if (!logoUrl) {
      try {
        const html = await fetchHtml(website);
        const rawLogoUrl = extractLogoUrl(html, website);
        if (!rawLogoUrl) {
          console.log(`  ✗ no logo found on page`);
          noLogo++;
        } else {
          console.log(`  logo source: ${rawLogoUrl}`);
          const buf = await fetchBinary(rawLogoUrl);
          if (buf.length < 200) {
            console.log(`  ✗ logo too small (${buf.length} bytes), skipping`);
            noLogo++;
          } else {
            const mime = mimeFromUrl(rawLogoUrl);
            const ext = rawLogoUrl.match(/\.(svg|webp|gif|jpe?g|png|ico)(\?.*)?$/i)?.[1] ?? "png";
            const dotExt = `.${ext.replace(/jpeg/, "jpg")}`;
            logoUrl = await uploadToGcs(buf, mime, dotExt);
            console.log(`  ✓ uploaded: ${logoUrl}`);
            done++;
          }
        }
      } catch (e: any) {
        console.log(`  ✗ logo fetch failed: ${e.message}`);
        noLogo++;
      }
    }

    // Save to DB (website always, logo_url if found)
    await pool.execute(
      "UPDATE clubs SET website = ?, logo_url = ? WHERE id = ?",
      [website || null, logoUrl || null, id]
    );
  }

  await pool.end();
  console.log(`\n✅ Done — ${done} new logos | ${skipped} already complete | ${noWebsite} no website | ${noLogo} logo fetch failed`);
}

main().catch((e) => { console.error(e); process.exit(1); });
