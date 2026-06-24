import { Router, type IRouter } from "express";
import { query, row, exec, run } from "../lib/pg";
import { getUser } from "../lib/auth";
import { isHnaVerified } from "../lib/hna";
import { Storage } from "@google-cloud/storage";
import { calcAge, ageIsJunior, ageIsStudent, ageIsPensioner, pensionerMemberTierType } from "../lib/pricing";

const router: IRouter = Router();
const SIDECAR = "http://127.0.0.1:1106";

// Human-readable labels for every pricing tier — mirrors the club portal's pricing page.
const TIER_LABELS: Record<string, string> = {
  full_member:              "Full Member",
  six_day_member:           "Six Day Member",
  week_day_member:          "Week Day Member",
  pensioner_full:           "Pensioner Full Member",
  pensioner_six_day:        "Pensioner Six Day Member",
  pensioner_week_day:       "Pensioner Week Day Member",
  student_member:           "Student Member",
  junior_member:            "Junior Member",
  honorary:                 "Honorary Member",
  affiliated_visitor:       "Affiliated Visitor",
  affiliated_pensioner:     "Affiliated Pensioner Visitor",
  non_affiliated_visitor:   "Non-Affiliated Visitor",
  non_affiliated_pensioner: "Non-Affiliated Pensioner Visitor",
  student_visitor:          "Student Visitor",
  junior_visitor:           "Junior Visitor",
};
const tierLabelFor = (t: string): string =>
  TIER_LABELS[t] ?? t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
const LOGO_BUCKET = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID ?? "";

const gcsClient = new Storage({
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
  } as any,
  projectId: "",
});

function logoApiUrl(clubId: number, rawLogoUrl?: string | null): string {
  if (rawLogoUrl) {
    const filename = rawLogoUrl.split("/").pop() ?? "";
    const hash = filename.split(".")[0]?.slice(0, 8);
    if (hash) return `/api/clubs/${clubId}/logo?v=${hash}`;
  }
  return `/api/clubs/${clubId}/logo`;
}

/**
 * DB stores paths like /objects//BUCKET/.private/club-logos/uuid.ext
 * Strip "/objects" (8 chars) to get the GCS object name with its leading slash:
 * → //BUCKET/.private/club-logos/uuid.ext
 * which matches exactly what was passed to bucket.file() at upload time.
 */
function gcsObjectName(dbPath: string): string | null {
  if (!dbPath.startsWith("/objects/")) return null;
  return dbPath.slice("/objects/".length); // → /BUCKET/.private/...
}

router.get("/clubs/pins", async (_req, res): Promise<void> => {
  const rows = await query<any>(
    `SELECT id, name, location, province, latitude, longitude, price_from
     FROM clubs WHERE active = 1 AND latitude IS NOT NULL AND latitude != 0
     ORDER BY name ASC`
  );
  res.json(rows);
});

router.get("/clubs/counts", async (_req, res): Promise<void> => {
  const [rows] = await (async () => {
    const { query: q2 } = await import("../lib/pg");
    return [await q2<{ province: string; cnt: number }>(
      "SELECT province, COUNT(*) as cnt FROM clubs WHERE active = 1 GROUP BY province ORDER BY cnt DESC"
    )];
  })();
  const total = rows.reduce((s, r) => s + Number(r.cnt), 0);
  const byProvince: Record<string, number> = {};
  for (const r of rows) byProvince[r.province] = Number(r.cnt);
  res.json({ All: total, ...byProvince });
});

router.get("/clubs", async (req, res): Promise<void> => {
  const q        = String(req.query.q ?? "").trim();
  const province = String(req.query.province ?? "").trim();
  const featured = req.query.featured === "1";
  const limit    = Math.min(parseInt(String(req.query.limit ?? "20")), 100);
  const offset   = Math.max(parseInt(String(req.query.offset ?? "0")), 0);
  const userLat  = parseFloat(String(req.query.lat ?? ""));
  const userLng  = parseFloat(String(req.query.lng ?? ""));
  const hasLocation = !isNaN(userLat) && !isNaN(userLng);

  const distanceExpr = hasLocation
    ? `ROUND((6371 * ACOS(LEAST(1, COS(RADIANS(?)) * COS(RADIANS(c.latitude)) * COS(RADIANS(c.longitude) - RADIANS(?)) + SIN(RADIANS(?)) * SIN(RADIANS(c.latitude)))))::numeric, 1)`
    : "NULL";

  // Distance params (for SELECT) are separate from filter params (for WHERE + COUNT)
  const distanceParams: any[] = hasLocation ? [userLat, userLng, userLat] : [];
  const filterParams: any[]   = [];
  const filterWhere: string[] = ["c.active = 1"];

  if (q) {
    filterWhere.push("(c.name ILIKE ? OR c.location ILIKE ?)");
    filterParams.push(`%${q}%`, `%${q}%`);
  }
  if (province && province !== "All") {
    filterWhere.push("c.province = ?");
    filterParams.push(province);
  }
  if (featured) {
    filterWhere.push("c.featured = 1");
  }

  const whereClause = filterWhere.join(" AND ");
  const orderBy     = hasLocation
    ? "ORDER BY (c.latitude IS NULL) ASC, distance ASC"
    : "ORDER BY c.featured DESC, c.name ASC";

  const adCreativeSubqueries = `
    (SELECT a.slot_duration FROM ads a
     WHERE a.club_id = c.id AND a.placement = 'featured_home' AND a.active = 1
       AND (a.campaign_end IS NULL OR a.campaign_end >= CURRENT_DATE)
     ORDER BY a.id DESC LIMIT 1) AS ad_slot_duration,
    (SELECT a.title FROM ads a
     WHERE a.club_id = c.id AND a.placement = 'featured_home' AND a.active = 1
       AND (a.campaign_end IS NULL OR a.campaign_end >= CURRENT_DATE)
     ORDER BY a.id DESC LIMIT 1) AS ad_title,
    (SELECT a.subtitle FROM ads a
     WHERE a.club_id = c.id AND a.placement = 'featured_home' AND a.active = 1
       AND (a.campaign_end IS NULL OR a.campaign_end >= CURRENT_DATE)
     ORDER BY a.id DESC LIMIT 1) AS ad_subtitle,
    (SELECT a.image_url FROM ads a
     WHERE a.club_id = c.id AND a.placement = 'featured_home' AND a.active = 1
       AND (a.campaign_end IS NULL OR a.campaign_end >= CURRENT_DATE)
     ORDER BY a.id DESC LIMIT 1) AS ad_image_url,
    (SELECT a.cta_text FROM ads a
     WHERE a.club_id = c.id AND a.placement = 'featured_home' AND a.active = 1
       AND (a.campaign_end IS NULL OR a.campaign_end >= CURRENT_DATE)
     ORDER BY a.id DESC LIMIT 1) AS ad_cta_text,
    (SELECT a.layout FROM ads a
     WHERE a.club_id = c.id AND a.placement = 'featured_home' AND a.active = 1
       AND (a.campaign_end IS NULL OR a.campaign_end >= CURRENT_DATE)
     ORDER BY a.id DESC LIMIT 1) AS ad_layout
  `;

  const baseSelect = `
    SELECT c.*,
      ROUND(AVG(r.rating)::numeric, 1) as rating,
      COUNT(DISTINCT r.id) as review_count,
      ${distanceExpr} as distance,
      ${adCreativeSubqueries}
    FROM clubs c
    LEFT JOIN reviews r ON r.club_id = c.id AND r.hidden = 0
  `;

  function normalize(clubs: any[]): any[] {
    clubs.forEach((c) => {
      c.facilities      = typeof c.facilities === "string" ? JSON.parse(c.facilities) : (c.facilities ?? []);
      c.rating          = c.rating ? parseFloat(c.rating) : null;
      c.review_count    = parseInt(c.review_count ?? "0");
      c.price_from      = c.price_from ? parseFloat(c.price_from) : null;
      c.featured        = !!c.featured;
      c.distance_km     = c.distance != null ? parseFloat(c.distance) : null;
      c.cart_available        = !!c.cart_available;
      c.cart_compulsory       = !!c.cart_compulsory;
      c.cart_price            = c.cart_price ? parseFloat(c.cart_price) : null;
      c.range_balls_enabled   = !!c.range_balls_enabled;
      c.range_balls_price     = c.range_balls_price ? parseFloat(c.range_balls_price) : null;
      c.range_balls_options   = c.range_balls_options
        ? (typeof c.range_balls_options === "string" ? JSON.parse(c.range_balls_options) : c.range_balls_options)
        : [];
      c.club_hire_enabled     = !!c.club_hire_enabled;
      c.club_hire_price       = c.club_hire_price ? parseFloat(c.club_hire_price) : null;
      c.pay_at_club_enabled   = !!c.pay_at_club_enabled;
      c.stitch_enabled      = c.stitch_enabled  !== undefined ? !!c.stitch_enabled  : true;
      c.wallet_enabled      = true;
      c.prepaid_enabled     = c.prepaid_enabled !== undefined ? !!c.prepaid_enabled : true;
      c.voucher_enabled     = c.voucher_enabled !== undefined ? !!c.voucher_enabled : true;
      if (c.logo_url) c.logo_url = logoApiUrl(c.id, c.logo_url);
      const slotMatch = String(c.ad_slot_duration ?? "").match(/^(\d+)/);
      c.slot_seconds = slotMatch
        ? parseInt(slotMatch[1])
        : (c.featured_slot_seconds ? parseInt(c.featured_slot_seconds) : null);
      if (c.ad_layout !== 'profile' && (c.ad_title || c.ad_image_url)) {
        c.ad_creative = {
          title:     c.ad_title     ?? null,
          subtitle:  c.ad_subtitle  ?? null,
          image_url: c.ad_image_url ?? null,
          cta_text:  c.ad_cta_text  ?? null,
        };
      }
      delete c.ad_slot_duration;
      delete c.ad_title;
      delete c.ad_subtitle;
      delete c.ad_image_url;
      delete c.ad_cta_text;
      delete c.ad_layout;
      delete c.featured_slot_seconds;
    });
    return clubs;
  }

  const [clubs, countRow] = await Promise.all([
    query<any>(
      `${baseSelect} WHERE ${whereClause} GROUP BY c.id ${orderBy} LIMIT ${limit} OFFSET ${offset}`,
      [...distanceParams, ...filterParams]
    ),
    row<any>(
      `SELECT COUNT(*) as total FROM clubs c WHERE ${whereClause}`,
      filterParams
    ),
  ]);

  const total = parseInt(countRow?.total ?? "0");
  res.json({ clubs: normalize(clubs), total, hasMore: offset + clubs.length < total });
});

router.get("/clubs/:id", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);

  const club = await row<any>(
    `SELECT c.*,
       ROUND(AVG(r.rating)::numeric, 1) as rating,
       COUNT(DISTINCT r.id) as review_count
     FROM clubs c
     LEFT JOIN reviews r ON r.club_id = c.id AND r.hidden = 0
     WHERE c.id = ? AND c.active = 1
     GROUP BY c.id`,
    [id]
  );

  if (!club) {
    res.status(404).json({ message: "Club not found" });
    return;
  }

  club.facilities      = typeof club.facilities === "string" ? JSON.parse(club.facilities) : (club.facilities ?? []);
  club.rating          = club.rating ? parseFloat(club.rating) : null;
  club.review_count    = parseInt(club.review_count ?? "0");
  club.price_from      = club.price_from ? parseFloat(club.price_from) : null;
  club.cart_available      = !!club.cart_available;
  club.cart_compulsory     = !!club.cart_compulsory;
  club.cart_price          = club.cart_price ? parseFloat(club.cart_price) : null;
  club.range_balls_enabled = !!club.range_balls_enabled;
  club.range_balls_price   = club.range_balls_price ? parseFloat(club.range_balls_price) : null;
  club.range_balls_options = club.range_balls_options
    ? (typeof club.range_balls_options === "string" ? JSON.parse(club.range_balls_options) : club.range_balls_options)
    : [];
  club.club_hire_enabled   = !!club.club_hire_enabled;
  club.club_hire_price     = club.club_hire_price ? parseFloat(club.club_hire_price) : null;
  if (club.logo_url) club.logo_url = logoApiUrl(club.id, club.logo_url);

  res.json({ club });
});

router.get("/clubs/:id/scorecard", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const sc = await row<any>(
    "SELECT holes, tee_colors FROM club_scorecards WHERE club_id = ?",
    [id]
  ).catch(() => null);
  if (!sc) { res.json({ scorecard: null }); return; }
  const holes: any[]     = typeof sc.holes      === "string" ? JSON.parse(sc.holes)      : (sc.holes      ?? []);
  const teeColors: any[] = typeof sc.tee_colors === "string" ? JSON.parse(sc.tee_colors) : (sc.tee_colors ?? []);
  const hasData = holes.some((h: any) =>
    h.yellow != null || h.white != null || h.blue != null || h.red != null
  );
  if (!hasData) { res.json({ scorecard: null }); return; }
  res.json({ scorecard: { holes, tee_colors: teeColors } });
});

router.get("/clubs/:id/local-rules", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const lr = await row<any>(
    "SELECT rules, course_ratings, footer_notes FROM club_local_rules WHERE club_id = ?",
    [id]
  ).catch(() => null);
  if (!lr) { res.json({ local_rules: null }); return; }
  const rules: any[]         = typeof lr.rules          === "string" ? JSON.parse(lr.rules)          : (lr.rules          ?? []);
  const courseRatings: any[] = typeof lr.course_ratings === "string" ? JSON.parse(lr.course_ratings) : (lr.course_ratings ?? []);
  const footerNotes: string  = lr.footer_notes ?? "";
  if (rules.length === 0 && courseRatings.length === 0 && !footerNotes.trim()) {
    res.json({ local_rules: null }); return;
  }
  res.json({ local_rules: { rules, course_ratings: courseRatings, footer_notes: footerNotes } });
});

router.get("/clubs/:id/logo", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const club = await row<{ logo_url: string | null }>(
    "SELECT logo_url FROM clubs WHERE id = ? AND active = 1 LIMIT 1",
    [id]
  );
  if (!club?.logo_url) {
    res.status(404).json({ message: "No logo" });
    return;
  }

  // Portal upload stores a full https:// URL — redirect to its path so the
  // storage endpoint serves it directly. Avoids the /objects/ path mismatch.
  if (club.logo_url.startsWith("http")) {
    try {
      const parsed = new URL(club.logo_url);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.redirect(302, parsed.pathname);
    } catch {
      res.status(404).json({ message: "Logo unavailable" });
    }
    return;
  }

  const objectName = gcsObjectName(club.logo_url);
  if (!objectName || !LOGO_BUCKET) {
    res.status(404).json({ message: "Logo unavailable" });
    return;
  }
  try {
    const file = gcsClient.bucket(LOGO_BUCKET).file(objectName);
    const [exists] = await file.exists();
    if (!exists) {
      res.status(404).json({ message: "Logo not found" });
      return;
    }
    const [metadata] = await file.getMetadata();
    const contentType = (metadata.contentType as string) || "image/png";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    file.createReadStream().pipe(res);
  } catch {
    res.status(404).json({ message: "Logo unavailable" });
  }
});

router.get("/clubs/:id/tee-times", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const clubId = parseInt(rawId, 10);
  // Default to today's date in SAST (UTC+2), not UTC, so clients that omit
  // ?date= near midnight get the correct South African calendar day.
  const date   = String(req.query.date ?? new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" }));

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ message: "Invalid date format" });
    return;
  }

  // Look up the authenticated user's tier price for this club (member tier, or visitor fallback)
  let tierPrice18: number | null = null;
  let tierPrice9:  number | null = null;
  const authUser = await getUser(req).catch(() => null);
  const userId = authUser?.id ?? null;

  // Determine all tier types this user qualifies for — lowest price wins
  let tierType: string | null = null;
  const tierCandidates: string[] = [];
  if (userId) {
    const [memberRow, userRow] = await Promise.all([
      row<any>(
        "SELECT membership_type FROM club_members WHERE club_id = ? AND user_id = ? AND status = 'active'",
        [clubId, userId]
      ).catch(() => null),
      row<any>("SELECT date_of_birth, hna_number FROM users WHERE id = ?", [userId]).catch(() => null),
    ]);
    const dob    = userRow?.date_of_birth ?? null;
    // Affiliated rate requires a CLUB-VERIFIED HNA (active, non-expired membership
    // somewhere) — a number typed by the golfer alone no longer qualifies.
    const hasHna = await isHnaVerified(userId);
    const memberType  = memberRow?.membership_type ?? null;
    const isHonorary  = memberType === "honorary";
    const isJunior    = !isHonorary && ageIsJunior(dob);
    const isStudent   = !isHonorary && !isJunior && ageIsStudent(dob);
    const isPensioner = ageIsPensioner(dob);
    if (isHonorary) {
      tierType = "honorary";
      tierCandidates.push("honorary");
      if (isPensioner) tierCandidates.push("pensioner_full");
    } else if (isJunior) {
      tierType = memberRow ? "junior_member" : "junior_visitor";
      tierCandidates.push(tierType);
      if (!memberRow && hasHna) tierCandidates.push("affiliated_visitor");
    } else if (isStudent) {
      tierType = memberRow ? "student_member" : "student_visitor";
      tierCandidates.push(tierType);
      if (!memberRow && hasHna) tierCandidates.push("affiliated_visitor");
    } else if (isPensioner) {
      if (memberRow) {
        tierType = pensionerMemberTierType(memberType ?? "");
      } else {
        tierType = hasHna ? "affiliated_pensioner" : "non_affiliated_pensioner";
      }
      tierCandidates.push(tierType);
    } else {
      tierType = (memberType ?? (hasHna ? "affiliated_visitor" : "non_affiliated_visitor")) as string;
      tierCandidates.push(tierType);
    }
  } else {
    tierType = "non_affiliated_visitor";
    tierCandidates.push(tierType);
  }

  // Fetch all candidate tier prices in parallel and take the lowest
  const candidateRows = await Promise.all(
    tierCandidates.map(t =>
      row<any>(
        "SELECT price_18h, price_9h FROM club_pricing_tiers WHERE club_id = ? AND tier_type = ?",
        [clubId, t]
      ).catch(() => null)
    )
  );
  for (const tr of candidateRows) {
    if (!tr) continue;
    const p18 = tr.price_18h != null ? parseFloat(tr.price_18h) : null;
    const p9  = tr.price_9h  != null ? parseFloat(tr.price_9h)  : null;
    if (p18 !== null && (tierPrice18 === null || p18 < tierPrice18)) tierPrice18 = p18;
    if (p9  !== null && (tierPrice9  === null || p9  < tierPrice9))  tierPrice9  = p9;
  }

  const fmtName = (full: string) => {
    const parts = (full ?? "").trim().split(/\s+/);
    if (parts.length < 2) return parts[0] ?? "Guest";
    return `${parts[0]} ${parts[parts.length - 1][0]}.`;
  };

  // ── All tee slots come from portal_tee_slots ─────────────────────────────
  const portalSlots = await query<any>(
    `SELECT pts.*,
       GREATEST(0, pts.max_players - pts.player_count) AS available_slots,
       (SELECT JSON_AGG(JSON_BUILD_OBJECT('name', psb.player_name, 'players', 1))
        FROM portal_slot_bookings psb WHERE psb.slot_id = pts.id
       ) AS existing_players,
       ge.name AS event_name
     FROM portal_tee_slots pts
     LEFT JOIN golf_events ge ON ge.id = pts.event_id
     WHERE pts.club_id = ? AND pts.date = ? AND pts.is_active = 1
     ORDER BY pts.tee_time ASC`,
    [clubId, date]
  );

  const isJuniorResponse = !!(authUser?.id && (tierType === "junior_member" || tierType === "junior_visitor"));
  // Hide tee times that have already passed (clubs operate in SAST = UTC+2)
  const nowMs = Date.now();
  const isPastSlot = (dateStr: string, timeStr: string): boolean => {
    const dt = new Date(`${dateStr}T${String(timeStr).slice(0, 5)}:00+02:00`);
    return !isNaN(dt.getTime()) && dt.getTime() < nowMs;
  };
  // DB now stores canonical snake_case; keep as a safety net for any legacy rows
  const normTeeStartType = (v: string | null | undefined): "first_tee" | "tenth_tee" | "two_tee" | null => {
    if (!v) return null;
    if (v === "first_tee"  || v === "1st Tee")       return "first_tee";
    if (v === "tenth_tee"  || v === "10th Tee")       return "tenth_tee";
    if (v === "two_tee"    || v === "Two-Tee Start")  return "two_tee";
    return null;
  };

  const mappedSlots = portalSlots
    .filter((s: any) => {
      const dateStr = (s.date instanceof Date ? s.date.toISOString() : String(s.date)).slice(0, 10);
      return !isPastSlot(dateStr, s.tee_time);
    })
    .map((s: any) => ({
      id:               s.id,
      date:             (s.date instanceof Date ? s.date.toISOString() : String(s.date)).slice(0, 10),
      time:             s.tee_time,
      total_slots:      s.max_players,
      available_slots:  parseInt(s.available_slots ?? "0"),
      price:            tierPrice18 ?? 0,
      price_9:          tierPrice9 ?? null,
      promotional_price: null,
      tee_start_type:   normTeeStartType(s.tee_start_type),
      session_type:     s.session_type,
      active:           s.is_active === 1,
      slot_source:      "portal" as const,
      event_id:         s.event_id ?? null,
      event_name:       s.event_name ?? null,
      existing_players: (s.existing_players ?? []).map((p: any) => ({
        name:    fmtName(p.name),
        players: p.players,
      })),
    }));

  // Deduplicate: when multiple slots share the same time + tee_start_type,
  // keep the event-linked one (if any), otherwise keep the first.
  const seen = new Map<string, (typeof mappedSlots)[0]>();
  for (const slot of mappedSlots) {
    const key = `${slot.time}|${slot.tee_start_type ?? "any"}`;
    const existing = seen.get(key);
    if (!existing || (!existing.event_id && slot.event_id)) {
      seen.set(key, slot);
    }
  }
  const formatted = Array.from(seen.values()).sort((a, b) =>
    a.time < b.time ? -1 : a.time > b.time ? 1 : 0
  );

  res.json({ tee_times: formatted, is_junior: isJuniorResponse });
});

router.get("/clubs/:id/tier-price", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const clubId = parseInt(rawId, 10);
  const tier    = String(req.query.tier   ?? "non_affiliated_visitor");
  const holes   = parseInt(String(req.query.holes ?? "18"));
  const priceCol = holes === 9 ? "price_9h" : "price_18h";
  const tierRow = await row<any>(
    `SELECT ${priceCol} FROM club_pricing_tiers WHERE club_id = ? AND tier_type = ?`,
    [clubId, tier]
  ).catch(() => null);
  const price = tierRow?.[priceCol] != null ? parseFloat(tierRow[priceCol]) : null;
  res.json({ price });
});

// Returns the correct tier type and greens price for a specific user at a club.
// Used by the booking form to show accurate per-player pricing before confirming.
// Applies full age-based tier logic (pensioner, junior, student) in addition to
// membership and HNA checks — same rules as the tee-times pricing endpoint.
router.get("/clubs/:id/user-tier-price", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const clubId = parseInt(rawId, 10);
  const userId = parseInt(String(req.query.user_id ?? "0"));
  const holes  = parseInt(String(req.query.holes ?? "18"));

  if (!userId) {
    res.status(400).json({ message: "user_id required" });
    return;
  }

  const priceCol = holes === 9 ? "price_9h" : "price_18h";

  const [memberRow, userRow] = await Promise.all([
    row<any>(
      "SELECT membership_type FROM club_members WHERE club_id = ? AND user_id = ? AND status = 'active'",
      [clubId, userId]
    ).catch(() => null),
    row<any>("SELECT date_of_birth, hna_number FROM users WHERE id = ?", [userId]).catch(() => null),
  ]);

  const dob        = userRow?.date_of_birth ?? null;
  // Affiliated rate requires a CLUB-VERIFIED HNA (active, non-expired membership)
  const hasHna     = await isHnaVerified(userId);
  const memberType = memberRow?.membership_type ?? null;
  const isHonorary = memberType === "honorary";
  const isJunior   = !isHonorary && ageIsJunior(dob);
  const isStudent  = !isHonorary && !isJunior && ageIsStudent(dob);
  const isPensioner = ageIsPensioner(dob);

  // Build list of all tier candidates — lowest price wins
  let tierType: string;
  const tierCandidates: string[] = [];

  if (isHonorary) {
    tierType = "honorary";
    tierCandidates.push("honorary");
    if (isPensioner) tierCandidates.push("pensioner_full");
  } else if (isJunior) {
    tierType = memberRow ? "junior_member" : "junior_visitor";
    tierCandidates.push(tierType);
    if (!memberRow && hasHna) tierCandidates.push("affiliated_visitor");
  } else if (isStudent) {
    tierType = memberRow ? "student_member" : "student_visitor";
    tierCandidates.push(tierType);
    if (!memberRow && hasHna) tierCandidates.push("affiliated_visitor");
  } else if (isPensioner) {
    if (memberRow) {
      tierType = pensionerMemberTierType(memberType ?? "");
    } else {
      tierType = hasHna ? "affiliated_pensioner" : "non_affiliated_pensioner";
    }
    tierCandidates.push(tierType);
  } else {
    tierType = memberType ?? (hasHna ? "affiliated_visitor" : "non_affiliated_visitor");
    tierCandidates.push(tierType);
  }

  // Fetch all candidate tier prices in parallel and take the lowest
  const candidateRows = await Promise.all(
    tierCandidates.map(t =>
      row<any>(
        `SELECT ${priceCol} FROM club_pricing_tiers WHERE club_id = ? AND tier_type = ?`,
        [clubId, t]
      ).catch(() => null)
    )
  );
  let price: number | null = null;
  for (const tr of candidateRows) {
    if (!tr) continue;
    const p = tr[priceCol] != null ? parseFloat(tr[priceCol]) : null;
    if (p !== null && (price === null || p < price)) price = p;
  }

  res.json({ tier_type: tierType, tier_label: tierLabelFor(tierType), price });
});

router.get("/clubs/:id/reviews", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const clubId = parseInt(rawId, 10);
  const limit  = Math.min(parseInt(String(req.query.limit ?? "10")), 50);

  const reviews = await query<any>(
    `SELECT rv.id, rv.rating, rv.comment, rv.created_at,
            rv.response, rv.responded_at,
            u.name as reviewer_name
     FROM reviews rv
     JOIN users u ON u.id = rv.user_id
     WHERE rv.club_id = ? AND rv.hidden = 0
     ORDER BY rv.created_at DESC
     LIMIT ?`,
    [clubId, limit]
  );

  res.json({ reviews });
});

router.post("/clubs/:id/reviews", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const clubId = parseInt(rawId, 10);

  const user = await getUser(req);
  if (!user) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }

  const { rating, comment } = req.body as { rating: number; comment?: string };
  if (!rating || rating < 1 || rating > 5) {
    res.status(400).json({ message: "Rating must be 1–5" });
    return;
  }

  // Check user hasn't already reviewed this club — update if so
  const existing = await row<any>(
    "SELECT id FROM reviews WHERE club_id = ? AND user_id = ?",
    [clubId, user.id]
  );
  if (existing) {
    await run(
      "UPDATE reviews SET rating = ?, comment = ? WHERE id = ?",
      [rating, comment ?? null, existing.id]
    );
    res.json({ message: "Review updated" });
    return;
  }

  const reviewId = await exec(
    "INSERT INTO reviews (club_id, user_id, rating, comment) VALUES (?, ?, ?, ?)",
    [clubId, user.id, rating, comment ?? null]
  );

  res.status(201).json({ review_id: reviewId });
});

// ── Club photo gallery ────────────────────────────────────────────────────────
router.get("/clubs/:id/images", async (req, res): Promise<void> => {
  const clubId = parseInt(req.params.id, 10);
  const images = await query<any>(
    "SELECT id, url, caption, display_order FROM club_images WHERE club_id = ? ORDER BY display_order ASC, id ASC",
    [clubId]
  );
  res.json({ images });
});

// ── Prepaid round balance for authenticated user at this club ─────────────────
router.get("/clubs/:id/prepaid-balance", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }
  const clubId = parseInt(req.params.id, 10);
  const membership = await row<any>(
    "SELECT prepaid_rounds, prepaid_rounds_used FROM club_members WHERE club_id = ? AND user_id = ? AND status = 'active'",
    [clubId, user.id]
  );
  if (!membership) {
    res.json({ is_member: false, total: 0, used: 0, remaining: 0 });
    return;
  }
  const total = parseInt(membership.prepaid_rounds) || 0;
  const used  = parseInt(membership.prepaid_rounds_used) || 0;
  res.json({ is_member: true, total, used, remaining: Math.max(0, total - used) });
});

// ── Events feed (tournaments tab) ────────────────────────────────────────────
// GET /events/feed — tournaments the user has access to, split into home-club + open
router.get("/events/feed", async (req, res): Promise<void> => {
  const user = await getUser(req).catch(() => null);
  const userId = user?.id ?? null;

  const baseCols = `
    ge.id, ge.name, ge.event_date, ge.end_date, ge.event_type, ge.format,
    ge.format_custom, ge.restriction, ge.entry_fee, ge.payment_required,
    ge.image_url,
    (SELECT COUNT(*) FROM event_registrations WHERE event_id = ge.id AND status = 'approved') AS approved_count,
    ge.max_participants,
    c.id AS club_id, c.name AS club_name, c.logo_url AS club_logo_url
  `;

  // Date filter: regular events use event_date; knockout and eclectic tournaments (which span
  // weeks/months) stay visible until their end_date passes.
  const dateFilter = `(
    ge.event_date >= CURRENT_DATE
    OR (ge.format IN ('knockout_individual','knockout_team') AND COALESCE(ge.end_date, ge.event_date) >= CURRENT_DATE)
    OR (ge.event_type = 'eclectic' AND COALESCE(ge.end_date, ge.event_date) >= CURRENT_DATE)
  )`;

  // Home-club events: clubs the user is an active member of, for eligible restrictions
  let homeClubEvents: any[] = [];
  if (userId) {
    homeClubEvents = await query<any>(
      `SELECT ${baseCols}
       FROM golf_events ge
       JOIN clubs c ON c.id = ge.club_id
       WHERE ge.status = 'active'
         AND ${dateFilter}
         AND ge.club_id IN (SELECT club_id FROM club_members WHERE user_id = ? AND status = 'active')
         AND (
           ge.restriction IN ('open', 'members_only', 'whs_players_only')
           OR (ge.restriction = 'invitation_only' AND EXISTS (
             SELECT 1 FROM event_invites WHERE event_id = ge.id AND user_id = ?
           ))
         )
       ORDER BY ge.event_date ASC
       LIMIT 20`,
      [userId, userId]
    );
  }

  // Open events: restriction = 'open', from clubs the user is NOT a member of (or all if not logged in)
  let openEvents: any[] = [];
  if (userId) {
    openEvents = await query<any>(
      `SELECT ${baseCols}
       FROM golf_events ge
       JOIN clubs c ON c.id = ge.club_id
       WHERE ge.status = 'active'
         AND ${dateFilter}
         AND ge.restriction = 'open'
         AND ge.club_id NOT IN (SELECT club_id FROM club_members WHERE user_id = ? AND status = 'active')
       ORDER BY ge.event_date ASC
       LIMIT 20`,
      [userId]
    );
  } else {
    openEvents = await query<any>(
      `SELECT ${baseCols}
       FROM golf_events ge
       JOIN clubs c ON c.id = ge.club_id
       WHERE ge.status = 'active'
         AND ${dateFilter}
         AND ge.restriction = 'open'
       ORDER BY ge.event_date ASC
       LIMIT 20`,
      []
    );
  }

  // Parse numeric fields
  for (const ev of [...homeClubEvents, ...openEvents]) {
    ev.approved_count   = parseInt(ev.approved_count ?? "0");
    ev.max_participants = ev.max_participants ? parseInt(ev.max_participants) : null;
    ev.entry_fee        = ev.entry_fee != null ? parseFloat(ev.entry_fee) : null;
    ev.payment_required = Number(ev.payment_required ?? 0);
    ev.user_registration = null;
  }

  // Batch-load registration status for authenticated users
  if (userId) {
    const allEvents = [...homeClubEvents, ...openEvents];
    if (allEvents.length > 0) {
      const ids = allEvents.map(e => e.id);
      const placeholders = ids.map(() => "?").join(",");

      // 1. event_registrations (formal registrations)
      const regs = await query<any>(
        `SELECT event_id, id, status FROM event_registrations WHERE user_id = ? AND event_id IN (${placeholders})`,
        [userId, ...ids]
      );
      const regMap: Record<number, any> = {};
      for (const r of regs) regMap[r.event_id] = r;

      // 2. Confirmed tee-slot bookings — covers players booked into a slot for an event
      //    without a separate event_registrations row (e.g. monthly medals booked via tee sheet)
      const slotBookings = await query<any>(
        `SELECT DISTINCT pts.event_id, b.id
         FROM bookings b
         JOIN booking_players bp ON bp.booking_id = b.id
         JOIN portal_tee_slots pts ON pts.id = b.portal_slot_id
         WHERE bp.user_id = ? AND b.status = 'confirmed' AND pts.event_id IN (${placeholders})`,
        [userId, ...ids]
      );
      const slotMap: Record<number, any> = {};
      for (const s of slotBookings) slotMap[s.event_id] = { id: s.id, status: 'approved' };

      // Merge: event_registration wins; fall back to tee-slot booking
      for (const ev of allEvents) {
        ev.user_registration = regMap[ev.id] ?? slotMap[ev.id] ?? null;
      }
    }
  }

  res.json({ home_club: homeClubEvents, open: openEvents });
});

// ── Events (mobile / public) ──────────────────────────────────────────────────

router.get("/clubs/:id/events", async (req, res): Promise<void> => {
  const clubId = parseInt(req.params.id, 10);
  const user = await getUser(req);
  const userId = user?.id ?? null;

  const events = await query<any>(
    `SELECT ge.*,
       (SELECT COUNT(*) FROM event_registrations WHERE event_id = ge.id AND status = 'approved') AS approved_count,
       (SELECT COUNT(*) FROM event_registrations WHERE event_id = ge.id AND status = 'pending')  AS pending_count
     FROM golf_events ge
     WHERE ge.club_id = ? AND ge.status = 'active' AND ge.event_date >= CURRENT_DATE
     ORDER BY ge.event_date ASC`,
    [clubId]
  );

  for (const ev of events) {
    ev.approved_count = parseInt(ev.approved_count ?? "0");
    ev.pending_count  = parseInt(ev.pending_count  ?? "0");
    ev.entry_fee      = ev.entry_fee != null ? parseFloat(ev.entry_fee) : null;
    ev.divisions      = typeof ev.divisions === "string" ? JSON.parse(ev.divisions) : ev.divisions;

    if (userId) {
      const reg = await row<any>(
        "SELECT id, status, payment_status, division FROM event_registrations WHERE event_id = ? AND user_id = ?",
        [ev.id, userId]
      );
      ev.user_registration = reg ?? null;
      if (ev.restriction === "members_only") {
        const m = await row<any>("SELECT id FROM club_members WHERE club_id = ? AND user_id = ? AND status = 'active'", [clubId, userId]);
        ev.user_eligible = !!m;
      } else if (ev.restriction === "invitation_only") {
        const inv = await row<any>("SELECT id FROM event_invites WHERE event_id = ? AND user_id = ?", [ev.id, userId]);
        ev.user_eligible = !!inv;
      } else {
        ev.user_eligible = true;
      }
    } else {
      ev.user_registration = null;
      ev.user_eligible = ev.restriction === "open";
    }
  }

  res.json({ events });
});

// ─── Team-format helpers ───────────────────────────────────────────────────
// Formats where 2 players form a permanent partnership (betterball variants)
const PAIR_FORMATS = new Set([
  "betterball", "fourball", "fourball_gross_betterball", "fourball_net_betterball",
  "betterball_match_play", "fourball_stableford", "shamble", "best_ball_aggregate",
  "high_low", "daytona", "low_ball_total", "the_ghost", "betterball_bonus_bogey",
  "pinehurst_points", "chapman",
  "betterball_gross_match_play", "fourball_stableford_match_play",
]);
// Formats where the whole draw group (up to 4) is one team
const GROUP_FORMATS = new Set(["american_scramble", "scramble", "alliance", "texas_scramble"]);

function teamSize(format: string): "pair" | "group" | "individual" {
  if (PAIR_FORMATS.has(format)) return "pair";
  if (GROUP_FORMATS.has(format)) return "group";
  return "individual";
}

// ─── Format-aware leaderboard rank order ─────────────────────────────────────
// Returns the ORDER BY fragment for RANK() OVER based on which metric is primary
// for the given format (gross-stroke < net-stroke < points-stableford).

const RANK_GROSS_ASC_FMTS = new Set([
  "gross_stroke_play", "chairman",
  "texas_scramble", "american_scramble", "scramble", "chapman",
  "betterball_gross_match_play", "fourball_gross_betterball", "singles_gross_match_play",
]);
const RANK_NET_ASC_FMTS = new Set([
  "net_stroke_play",
  "betterball_match_play", "fourball_net_betterball",
  "singles_match_play",
]);

function rankOrderClause(format: string): string {
  if (RANK_GROSS_ASC_FMTS.has(format)) return `
    CASE WHEN SUM(es.gross)  IS NOT NULL THEN SUM(es.gross)  END ASC,
    CASE WHEN SUM(es.net)    IS NOT NULL THEN SUM(es.net)    END ASC,
    CASE WHEN SUM(es.points) IS NOT NULL THEN SUM(es.points) END DESC`;
  if (RANK_NET_ASC_FMTS.has(format)) return `
    CASE WHEN SUM(es.net)    IS NOT NULL THEN SUM(es.net)    END ASC,
    CASE WHEN SUM(es.gross)  IS NOT NULL THEN SUM(es.gross)  END ASC,
    CASE WHEN SUM(es.points) IS NOT NULL THEN SUM(es.points) END DESC`;
  return `
    CASE WHEN SUM(es.points) IS NOT NULL THEN SUM(es.points) END DESC,
    CASE WHEN SUM(es.net)    IS NOT NULL THEN SUM(es.net)    END ASC,
    CASE WHEN SUM(es.gross)  IS NOT NULL THEN SUM(es.gross)  END ASC`;
}

function rankOrderClauseDQ(format: string): string {
  if (RANK_GROSS_ASC_FMTS.has(format)) return `
    CASE WHEN NOT BOOL_OR(es.dq) AND SUM(es.gross)  IS NOT NULL THEN SUM(es.gross)  END ASC,
    CASE WHEN NOT BOOL_OR(es.dq) AND SUM(es.net)    IS NOT NULL THEN SUM(es.net)    END ASC,
    CASE WHEN NOT BOOL_OR(es.dq) AND SUM(es.points) IS NOT NULL THEN SUM(es.points) END DESC`;
  if (RANK_NET_ASC_FMTS.has(format)) return `
    CASE WHEN NOT BOOL_OR(es.dq) AND SUM(es.net)    IS NOT NULL THEN SUM(es.net)    END ASC,
    CASE WHEN NOT BOOL_OR(es.dq) AND SUM(es.gross)  IS NOT NULL THEN SUM(es.gross)  END ASC,
    CASE WHEN NOT BOOL_OR(es.dq) AND SUM(es.points) IS NOT NULL THEN SUM(es.points) END DESC`;
  return `
    CASE WHEN NOT BOOL_OR(es.dq) AND SUM(es.points) IS NOT NULL THEN SUM(es.points) END DESC,
    CASE WHEN NOT BOOL_OR(es.dq) AND SUM(es.net)    IS NOT NULL THEN SUM(es.net)    END ASC,
    CASE WHEN NOT BOOL_OR(es.dq) AND SUM(es.gross)  IS NOT NULL THEN SUM(es.gross)  END ASC`;
}

// GET /events/:id  — returns event object directly (screen uses data directly, not data.event)
router.get("/events/:id", async (req, res): Promise<void> => {
  const evId = parseInt(req.params.id, 10);
  const user = await getUser(req);
  const userId = user?.id ?? null;

  const ev = await row<any>(
    `SELECT ge.*, c.name AS club_name, c.logo_url AS club_logo,
       (SELECT COUNT(*) FROM event_registrations WHERE event_id = ge.id AND status = 'approved') AS approved_count,
       (SELECT COUNT(*) FROM event_registrations WHERE event_id = ge.id AND status = 'pending')  AS pending_count
     FROM golf_events ge
     JOIN clubs c ON c.id = ge.club_id
     WHERE ge.id = ?`,
    [evId]
  );
  if (!ev) { res.status(404).json({ message: "Event not found" }); return; }

  ev.approved_count = parseInt(ev.approved_count ?? "0");
  ev.pending_count  = parseInt(ev.pending_count  ?? "0");
  ev.entry_fee      = ev.entry_fee != null ? parseFloat(ev.entry_fee) : null;
  ev.divisions      = typeof ev.divisions === "string" ? JSON.parse(ev.divisions) : ev.divisions;
  ev.ballot         = Number(ev.ballot ?? 0);
  ev.scoring_enabled   = Number(ev.scoring_enabled ?? 0);
  ev.payment_required  = Number(ev.payment_required ?? 0);
  ev.entries_required  = Number(ev.entries_required ?? 1);
  ev.allow_wallet      = Number(ev.allow_wallet ?? 0);
  ev.allow_prepaid     = Number(ev.allow_prepaid ?? 0);
  ev.allow_voucher     = Number(ev.allow_voucher ?? 0);
  ev.rounds            = Number(ev.rounds ?? 1);
  // Always expose team_format so the mobile client can enforce partner selection
  // regardless of whether the user is authenticated
  ev.team_format = teamSize(ev.format ?? "");

  if (userId) {
    const reg = await row<any>(
      `SELECT er.id, er.status, er.payment_status, er.payment_url, er.division, er.frozen_handicap,
              er.team_id, et.name AS team_name,
              (SELECT json_agg(json_build_object('user_id', er2.user_id, 'name', u2.name))
               FROM event_registrations er2
               JOIN users u2 ON u2.id = er2.user_id
               WHERE er2.team_id = er.team_id AND er2.user_id <> er.user_id AND er.team_id IS NOT NULL
              ) AS teammates
       FROM event_registrations er
       LEFT JOIN event_teams et ON et.id = er.team_id
       WHERE er.event_id = ? AND er.user_id = ?`,
      [evId, userId]
    );
    ev.user_registration = reg ?? null;

    // Preview which division they'd be assigned based on handicap
    if (!reg && ev.divisions?.length && user?.handicap_index != null) {
      const hcp = parseFloat(user.handicap_index);
      for (const d of ev.divisions) {
        if (hcp >= parseFloat(d.min_hcp) && hcp <= parseFloat(d.max_hcp)) {
          ev.user_division_preview = d.key; break;
        }
      }
    } else { ev.user_division_preview = null; }

    if (ev.restriction === "members_only") {
      const m = await row<any>("SELECT id FROM club_members WHERE club_id = ? AND user_id = ? AND status = 'active'", [ev.club_id, userId]);
      ev.user_eligible = !!m;
    } else if (ev.restriction === "invitation_only") {
      const inv = await row<any>("SELECT id FROM event_invites WHERE event_id = ? AND user_id = ?", [evId, userId]);
      ev.user_eligible = !!inv;
    } else {
      ev.user_eligible = true;
    }
  } else {
    ev.user_registration = null;
    ev.user_division_preview = null;
    ev.user_eligible = ev.restriction === "open";
  }

  // Return event directly (not wrapped) — screen does setEvent(data)
  res.json(ev);
});

// POST /events/:id/register — returns { status, division, frozen_handicap } directly (matches screen expectations)
router.post("/events/:id/register", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Login required to register for events" }); return; }

  const evId = parseInt(req.params.id, 10);
  const ev = await row<any>("SELECT * FROM golf_events WHERE id = ? AND status = 'active'", [evId]);
  if (!ev) { res.status(404).json({ message: "Event not found or no longer active" }); return; }

  const now = new Date();
  if (ev.entries_open  && new Date(String(ev.entries_open).slice(0, 10)  + "T00:00:00") > now) { res.status(400).json({ message: "Entries are not open yet" }); return; }
  if (ev.entries_close && new Date(String(ev.entries_close).slice(0, 10) + "T23:59:59") < now) { res.status(400).json({ message: "Entries are closed" });          return; }

  if (ev.restriction === "members_only") {
    const m = await row<any>("SELECT id FROM club_members WHERE club_id = ? AND user_id = ? AND status = 'active'", [ev.club_id, user.id]);
    if (!m) { res.status(403).json({ message: "This event is for active club members only" }); return; }
    if (user.handicap_index == null) {
      res.status(403).json({ message: "A valid WHS handicap index is required to enter this event. Please add your handicap index to your profile." }); return;
    }
  } else if (ev.restriction === "invitation_only") {
    const inv = await row<any>("SELECT id FROM event_invites WHERE event_id = ? AND user_id = ?", [evId, user.id]);
    if (!inv) { res.status(403).json({ message: "This event is by invitation only. You have not been invited." }); return; }
  } else if (ev.restriction === "whs_players_only") {
    if (user.handicap_index == null) {
      res.status(403).json({ message: "This event is for WHS-indexed players only. Please add your handicap index to your profile before entering." }); return;
    }
  }

  // If the event has divisions, a handicap index is required to be placed in a division
  const evDivisions: any[] = ev.divisions
    ? (typeof ev.divisions === "string" ? JSON.parse(ev.divisions) : ev.divisions)
    : [];
  if (evDivisions.length > 0 && user.handicap_index == null) {
    res.status(403).json({ message: "This event uses divisions. A WHS handicap index is required so you can be assigned to the correct division. Please update your profile." }); return;
  }

  const existing = await row<any>("SELECT id, status FROM event_registrations WHERE event_id = ? AND user_id = ?", [evId, user.id]);
  if (existing) { res.status(409).json({ message: "You are already registered for this event", status: existing.status }); return; }

  // Block only if the paid field is already full (capacity is enforced at payment, not registration)
  if (ev.max_participants) {
    const cnt = await row<any>("SELECT COUNT(*) AS n FROM event_registrations WHERE event_id = ? AND payment_status = 'paid'", [evId]);
    if (parseInt(cnt?.n ?? "0") >= parseInt(ev.max_participants)) { res.status(400).json({ message: "This event is full" }); return; }
  }

  // Auto-assign division from handicap
  let division: string | null = null;
  let frozenHcp: number | null = user.handicap_index != null ? parseFloat(user.handicap_index) : null;
  if (ev.divisions && frozenHcp != null) {
    const divs: any[] = typeof ev.divisions === "string" ? JSON.parse(ev.divisions) : ev.divisions;
    for (const d of divs) {
      if (frozenHcp >= parseFloat(d.min_hcp) && frozenHcp <= parseFloat(d.max_hcp)) { division = d.key; break; }
    }
  }

  // ── Team pairing (betterball/scramble formats) ────────────────────────────
  const ts = teamSize(ev.format ?? "");
  let teamId: number | null = null;
  const { partner_id, partner_ids } = req.body ?? {};

  // Enforce partner requirement — reject registrations that arrive without one
  if (ts === "pair" && !partner_id) {
    res.status(400).json({
      message: "A playing partner is required for this team format event. Search for your partner on the registration screen and select them before entering.",
      requires_partner: true,
      team_format: "pair",
    });
    return;
  }
  if (ts === "group" && (!Array.isArray(partner_ids) || partner_ids.length === 0)) {
    res.status(400).json({
      message: "At least one teammate is required for this group format event. Select your teammates before entering.",
      requires_partner: true,
      team_format: "group",
    });
    return;
  }

  if (ts === "pair" && partner_id) {
    const partnerId = parseInt(partner_id, 10);
    const partnerUser = await row<any>("SELECT id, name, handicap, push_token FROM users WHERE id = ?", [partnerId]);
    if (!partnerUser) {
      res.status(400).json({ message: "Partner not found." }); return;
    }
    // Check if partner is already registered
    let partnerReg = await row<any>(
      "SELECT id, team_id FROM event_registrations WHERE event_id = ? AND user_id = ? AND status = 'approved'",
      [evId, partnerId]
    );
    if (!partnerReg) {
      // Auto-register the partner so the pair can be created immediately.
      // The partner gets a push notification to let them know they've been entered.
      let partnerDiv: string | null = null;
      let partnerHcp: number | null = partnerUser.handicap != null ? parseFloat(partnerUser.handicap) : null;
      if (evDivisions.length > 0 && partnerHcp != null) {
        for (const d of evDivisions) {
          if (partnerHcp >= parseFloat(d.min_hcp) && partnerHcp <= parseFloat(d.max_hcp)) { partnerDiv = d.key; break; }
        }
      }
      const partnRegId = await exec(
        "INSERT INTO event_registrations (event_id, user_id, status, division, frozen_handicap) VALUES (?, ?, 'approved', ?, ?)",
        [evId, partnerId, partnerDiv, partnerHcp]
      );
      partnerReg = { id: partnRegId, team_id: null };
      // Notify the auto-registered partner
      const notifTitle = "You've been entered in a tournament! ⛳";
      const notifBody  = `${user.name} has entered you as their partner in "${ev.name}". Open TapIn Golf to confirm your spot.`;
      await exec(
        "INSERT INTO user_notifications (user_id, type, title, body, data) VALUES (?, ?, ?, ?, ?::jsonb)",
        [partnerId, "event_registration_update", notifTitle, notifBody,
         JSON.stringify({ type: "event_registration_update", event_id: evId, status: "approved" })]
      );
      if (partnerUser.push_token) {
        const { sendPushNotifications } = await import("../lib/notifications");
        sendPushNotifications([{ to: partnerUser.push_token, sound: "default", title: notifTitle, body: notifBody,
          data: { type: "event_registration_update", event_id: evId } }]);
      }
    }
    // Link or join existing team
    if (partnerReg.team_id) {
      teamId = partnerReg.team_id;
    } else {
      const teamName = `${user.name} / ${partnerUser.name}`;
      const newTeam = await row<any>(
        "INSERT INTO event_teams (event_id, name) VALUES (?, ?) RETURNING id",
        [evId, teamName]
      );
      teamId = newTeam!.id;
      await exec("UPDATE event_registrations SET team_id = ? WHERE event_id = ? AND user_id = ?", [teamId, evId, partnerId]);
    }
  }

  if (ts === "group" && Array.isArray(partner_ids) && partner_ids.length > 0) {
    const partnerIdList: number[] = partner_ids.map((p: any) => parseInt(p, 10)).filter(Boolean);
    // Fetch whichever of these partners are already registered
    const placeholders = partnerIdList.map(() => "?").join(",");
    const partnerRegs = await query<any>(
      `SELECT user_id, team_id FROM event_registrations WHERE event_id = ? AND user_id IN (${placeholders}) AND status = 'approved'`,
      [evId, ...partnerIdList]
    );
    if (partnerRegs.length > 0) {
      const existingTeam = partnerRegs.find((p: any) => p.team_id);
      if (existingTeam) {
        teamId = existingTeam.team_id;
      } else {
        const partnerUsers = await query<any>(
          `SELECT name FROM users WHERE id IN (${placeholders})`,
          partnerIdList
        );
        const teamName = [user.name, ...partnerUsers.map((p: any) => p.name)].join(" / ");
        const newTeam = await row<any>(
          "INSERT INTO event_teams (event_id, name) VALUES (?, ?) RETURNING id",
          [evId, teamName]
        );
        teamId = newTeam!.id;
        for (const pr of partnerRegs) {
          await exec("UPDATE event_registrations SET team_id = ? WHERE event_id = ? AND user_id = ?", [teamId, evId, pr.user_id]);
        }
      }
    }
  }

  // Always auto-approve — no manual club approval required. Payment confirms the spot.
  const status = "approved";
  await exec(
    "INSERT INTO event_registrations (event_id, user_id, status, division, frozen_handicap, team_id) VALUES (?, ?, ?, ?, ?, ?)",
    [evId, user.id, status, division, frozenHcp, teamId]
  );

  // Notify player: spot is reserved, pending payment (or confirmed if free)
  const needsPayment = ev.payment_required && ev.entry_fee;
  const notifTitle = "Entry Received ⛳";
  const notifBody  = needsPayment
    ? `Your entry for "${ev.name}" is reserved. Open the app to complete payment of R${parseFloat(ev.entry_fee).toFixed(2)}.`
    : `You're in! Your entry for "${ev.name}" is confirmed.`;
  await exec(
    "INSERT INTO user_notifications (user_id, type, title, body, data) VALUES (?, ?, ?, ?, ?::jsonb)",
    [user.id, "event_registration_update", notifTitle, notifBody, JSON.stringify({ type: "event_registration_update", event_id: evId, status: "approved" })]
  );
  if (user.push_token) {
    const { sendPushNotifications } = await import("../lib/notifications");
    sendPushNotifications([{ to: user.push_token, sound: "default", title: notifTitle, body: notifBody, data: { type: "event_registration_update", event_id: evId } }]);
  }

  res.json({ status, division, frozen_handicap: frozenHcp });
});

// GET /events/:id/draw  — public draw for an event (all rounds)
router.get("/events/:id/draw", async (req, res): Promise<void> => {
  const evId = parseInt(req.params.id, 10);
  const ev = await row<any>("SELECT id FROM golf_events WHERE id = ? AND status = 'active'", [evId]);
  if (!ev) { res.status(404).json({ message: "Event not found" }); return; }
  const draws = await query<any>(
    `SELECT d.round, d.tee_date, d.tee_time, d.draw_group, d.starting_tee,
            d.seed_metric, d.seed_value,
            u.id as user_id, u.name as user_name,
            r.division, r.frozen_handicap
     FROM event_draws d
     JOIN users u ON u.id = d.user_id
     JOIN event_registrations r ON r.event_id = d.event_id AND r.user_id = d.user_id
     WHERE d.event_id = ?
     ORDER BY d.round ASC, d.tee_time ASC, d.draw_group ASC`,
    [evId]
  );
  res.json(draws.map((d: any) => ({
    ...d,
    seed_value: d.seed_value != null ? parseFloat(d.seed_value) : null,
  })));
});

router.delete("/events/:id/register", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Login required" }); return; }

  const evId = parseInt(req.params.id, 10);
  const reg = await row<any>("SELECT id FROM event_registrations WHERE event_id = ? AND user_id = ?", [evId, user.id]);
  if (!reg) { res.status(404).json({ message: "Registration not found" }); return; }

  await exec("DELETE FROM event_registrations WHERE id = ?", [reg.id]);
  res.json({ message: "Registration cancelled successfully" });
});

// GET /events/:id/leaderboard  — returns leaderboard grouped by division (team-aware)
router.get("/events/:id/leaderboard", async (req, res): Promise<void> => {
  const evId = parseInt(req.params.id, 10);
  const ev = await row<any>("SELECT id, scoring_enabled, format, event_type, club_id, event_date, end_date FROM golf_events WHERE id = ?", [evId]);
  if (!ev) { res.status(404).json({ message: "Event not found" }); return; }

  // ── Eclectic leaderboard — reads from ringer board, not event_scores ─────
  if (ev.event_type === 'eclectic') {
    const boards = await query<any>(
      `SELECT erb.user_id, u.name AS player_name, erb.division,
          erb.total_gross, erb.total_net, erb.rounds_counted, erb.holes, erb.holes_net,
          erb.frozen_handicap, u.handicap AS current_handicap
       FROM eclectic_ringer_board erb
       JOIN users u ON u.id = erb.user_id
       WHERE erb.event_id = ?
       ORDER BY erb.division, erb.total_net ASC NULLS LAST`,
      [evId]
    ).catch(() => [] as any[]);

    // Find which players have ANY unverified contributing round
    const endDate2 = ev.end_date ?? ev.event_date;
    const unverifiedUsers = new Set<number>();
    if (boards.length > 0) {
      const uvRows = await query<any>(
        `SELECT DISTINCT es.user_id
         FROM event_scores es
         JOIN scoring_rounds sr ON sr.tournament_id = es.event_id AND sr.user_id = es.user_id
         WHERE sr.score_submitted = 1
           AND sr.club_id = ?
           AND DATE(sr.started_at) BETWEEN ? AND ?
           AND es.verified = 0`,
        [ev.club_id, ev.event_date, endDate2]
      ).catch(() => [] as any[]);
      for (const row of uvRows) unverifiedUsers.add(row.user_id);
    }

    const grouped: Record<string, any[]> = {};
    const divPositions: Record<string, number> = {};
    for (const b of boards) {
      const d = b.division ?? "Open";
      if (!grouped[d]) { grouped[d] = []; divPositions[d] = 1; }
      const hc = b.current_handicap != null ? parseFloat(b.current_handicap)
               : b.frozen_handicap  != null ? parseFloat(b.frozen_handicap)
               : null;
      grouped[d].push({
        user_id: b.user_id,
        player_name: b.player_name,
        position: divPositions[d]++,
        division: d,
        gross: b.total_gross != null ? parseInt(b.total_gross) : null,
        net:   b.total_net   != null ? parseInt(b.total_net)   : null,
        points: null,
        rounds: b.rounds_counted,
        holes: b.holes,
        holes_net: b.holes_net,
        handicap: hc,
        verified: unverifiedUsers.has(b.user_id) ? 0 : 1,
        dq: false,
      });
    }
    res.json({
      leaderboard: Object.entries(grouped).map(([division, players]) => ({ division, players })),
      team_format: "individual",
      eclectic: true,
    });
    return;
  }

  const ts = teamSize(ev.format ?? "");

  if (ts !== "individual") {
    // Team leaderboard — one row per team per round (aggregate rounds)
    const scores = await query<any>(
      `SELECT es.team_id, et.name AS team_name, es.division, es.verified,
         SUM(es.gross)  AS gross,
         SUM(es.net)    AS net,
         SUM(es.points) AS points,
         RANK() OVER (PARTITION BY es.division ORDER BY
           ${rankOrderClause(ev.format ?? "")}
         ) AS position
       FROM event_scores es
       JOIN event_teams et ON et.id = es.team_id
       WHERE es.event_id = ? AND es.team_id IS NOT NULL
       GROUP BY es.team_id, et.name, es.division, es.verified`,
      [evId]
    ).catch(() => [] as any[]);

    const grouped: Record<string, any[]> = {};
    for (const s of scores) {
      const d = s.division ?? "Open";
      if (!grouped[d]) grouped[d] = [];
      grouped[d].push({
        team_id: s.team_id, team_name: s.team_name,
        player_name: s.team_name,
        position: parseInt(s.position), division: d,
        gross:  s.gross  != null ? parseInt(s.gross)     : null,
        net:    s.net    != null ? parseInt(s.net)        : null,
        points: s.points != null ? parseFloat(s.points)  : null,
        verified: parseInt(s.verified ?? "0"),
      });
    }
    res.json({ leaderboard: Object.entries(grouped).map(([division, players]) => ({ division, players })), team_format: ts });
    return;
  }

  // Individual leaderboard — aggregate across rounds; DQ players ranked separately
  const scores = await query<any>(
    `SELECT es.user_id, u.name AS player_name, er.division,
       SUM(es.gross)  AS gross,
       SUM(es.net)    AS net,
       SUM(es.points) AS points,
       er.frozen_handicap, MAX(es.verified) AS verified,
       BOOL_OR(es.dq) AS dq,
       MAX(es.dq_reason) AS dq_reason,
       RANK() OVER (PARTITION BY er.division ORDER BY
         ${rankOrderClauseDQ(ev.format ?? "")}
       ) AS position
     FROM event_scores es
     JOIN users u ON u.id = es.user_id
     JOIN event_registrations er ON er.event_id = es.event_id AND er.user_id = es.user_id
     WHERE es.event_id = ? AND es.team_id IS NULL
     GROUP BY es.user_id, u.name, er.division, er.frozen_handicap
     ORDER BY er.division, BOOL_OR(es.dq) ASC, position`,
    [evId]
  );

  const grouped: Record<string, any[]> = {};
  for (const s of scores) {
    const d = s.division ?? "Open";
    if (!grouped[d]) grouped[d] = [];
    const isDQ = s.dq === true || s.dq === "true" || s.dq === 1;
    grouped[d].push({
      user_id: s.user_id, player_name: s.player_name,
      position: isDQ ? "DQ" : parseInt(s.position), division: d,
      gross:  s.gross  != null ? parseInt(s.gross)    : null,
      net:    s.net    != null ? parseInt(s.net)       : null,
      points: s.points != null ? parseFloat(s.points) : null,
      frozen_handicap: s.frozen_handicap != null ? parseFloat(s.frozen_handicap) : null,
      verified: parseInt(s.verified ?? "0"),
      dq: isDQ, dq_reason: s.dq_reason ?? null,
    });
  }

  res.json({ leaderboard: Object.entries(grouped).map(([division, players]) => ({ division, players })), team_format: ts });
});

// GET /events/:id/eclectic-board  — full ringer board for all players (portal & mobile)
router.get("/events/:id/eclectic-board", async (req, res): Promise<void> => {
  const evId = parseInt(req.params.id, 10);
  const ev = await row<any>("SELECT id, event_type FROM golf_events WHERE id = ?", [evId]);
  if (!ev) { res.status(404).json({ message: "Event not found" }); return; }
  if (ev.event_type !== 'eclectic') { res.status(400).json({ message: "Not an eclectic event" }); return; }

  const boards = await query<any>(
    `SELECT erb.user_id, u.name AS player_name, erb.division,
        erb.total_gross, erb.total_net, erb.rounds_counted,
        erb.holes, erb.holes_net, erb.frozen_handicap,
        u.handicap AS current_handicap, erb.updated_at
     FROM eclectic_ringer_board erb
     JOIN users u ON u.id = erb.user_id
     WHERE erb.event_id = ?
     ORDER BY erb.division, erb.total_net ASC NULLS LAST`,
    [evId]
  ).catch(() => [] as any[]);

  res.json({ boards });
});

// GET /events/:id/eclectic-rounds  — per-player round history used to build the eclectic ringer board
router.get("/events/:id/eclectic-rounds", async (req, res): Promise<void> => {
  const evId = parseInt(req.params.id, 10);
  const userId = req.query.userId ? parseInt(String(req.query.userId), 10) : null;

  const ev = await row<any>(
    "SELECT id, name, event_type, club_id, event_date, end_date FROM golf_events WHERE id = ?",
    [evId]
  );
  if (!ev || ev.event_type !== "eclectic") { res.status(404).json({ message: "Not an eclectic event" }); return; }

  const players = await query<any>(
    `SELECT u.id AS user_id, u.name AS player_name
     FROM eclectic_ringer_board erb
     JOIN users u ON u.id = erb.user_id
     WHERE erb.event_id = ?
     ORDER BY u.name`,
    [evId]
  ).catch(() => [] as any[]);

  if (!userId) { res.json({ players, rounds: [] }); return; }

  const endDate = ev.end_date ?? ev.event_date;

  const rounds = await query<any>(
    `SELECT sr.id AS round_id, sr.user_id, sr.total_gross, sr.playing_handicap, sr.completed_at, sr.tournament_id,
            COALESCE(ge.name, ?) AS tournament_name,
            es.hole_scores AS es_hole_scores,
            es.net AS total_net,
            COALESCE(es.verified, 0) AS verified
     FROM scoring_rounds sr
     LEFT JOIN golf_events ge ON ge.id = sr.tournament_id
     LEFT JOIN event_scores es
           ON es.event_id = sr.tournament_id AND es.user_id = sr.user_id
     WHERE sr.score_submitted = 1
       AND sr.user_id = ?
       AND (
         sr.tournament_id = ?
         OR (sr.club_id = ? AND sr.tournament_id IS NOT NULL
             AND DATE(sr.started_at) BETWEEN ? AND ?)
       )
     ORDER BY sr.completed_at DESC`,
    [ev.name, userId, evId, ev.club_id, ev.event_date, endDate]
  ).catch(() => [] as any[]);

  if (rounds.length === 0) { res.json({ players, rounds: [] }); return; }

  // Fall back to scoring_holes for rounds without event_scores
  const missingIds = rounds
    .filter((r: any) => !r.es_hole_scores)
    .map((r: any) => r.round_id);

  const holesByRound: Record<number, Record<string, number>> = {};
  if (missingIds.length > 0) {
    const ph2 = missingIds.map(() => '?').join(',');
    const holeRows = await query<any>(
      `SELECT round_id, hole_number, gross_score
       FROM scoring_holes
       WHERE round_id IN (${ph2}) AND gross_score IS NOT NULL AND is_nr = 0`,
      missingIds
    ).catch(() => [] as any[]);
    for (const h of holeRows) {
      if (!holesByRound[h.round_id]) holesByRound[h.round_id] = {};
      holesByRound[h.round_id][String(h.hole_number)] = h.gross_score;
    }
  }

  // Fetch club scorecard for stroke index (needed to compute nett per hole)
  const scRows = await query<any>(
    "SELECT holes FROM club_scorecards WHERE club_id = ?",
    [ev.club_id]
  ).catch(() => [] as any[]);
  const rawHoles: any[] = scRows.length > 0 ? scRows[0].holes : [];
  // Build hole→stroke_index lookup (1-indexed)
  const strokeIndex: Record<number, number> = {};
  for (const h of rawHoles) {
    if (h.number != null && h.stroke_index != null) strokeIndex[Number(h.number)] = Number(h.stroke_index);
  }

  res.json({
    players,
    rounds: rounds.map((r: any) => {
      let hs: Record<string, number> = holesByRound[r.round_id] ?? {};
      if (r.es_hole_scores) {
        const parsed = typeof r.es_hole_scores === 'string'
          ? JSON.parse(r.es_hole_scores)
          : r.es_hole_scores;
        if (Array.isArray(parsed)) {
          hs = {};
          (parsed as number[]).forEach((v, i) => {
            if (typeof v === 'number') hs[String(i + 1)] = v;
          });
        } else {
          hs = Object.fromEntries(
            Object.entries(parsed as Record<string, unknown>)
              .filter(([, v]) => typeof v === 'number')
              .map(([k, v]) => [k, v as number])
          );
        }
      }

      // Compute nett per-hole: gross minus handicap strokes on that hole
      const phcp = Math.round(Number(r.playing_handicap ?? 0));
      const fullStrokes = Math.floor(phcp / 18);
      const extraHoles = phcp % 18; // top-N holes by stroke index also get +1
      const nettHoleScores: Record<string, number> = {};
      for (const [hStr, gross] of Object.entries(hs)) {
        const si = strokeIndex[Number(hStr)] ?? Number(hStr);
        const shots = fullStrokes + (si <= extraHoles ? 1 : 0);
        nettHoleScores[hStr] = (gross as number) - shots;
      }

      return { ...r, hole_scores: hs, nett_hole_scores: nettHoleScores };
    }),
  });
});

// GET /events/:id/partner-search  — search all TapIn Golf users to pick a partner
// We search across all users (not just those already registered) so the first
// person registering isn't blocked by an empty list.
router.get("/events/:id/partner-search", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Login required" }); return; }
  const evId = parseInt(req.params.id, 10);
  const q = String(req.query.q ?? "").trim();
  if (!q || q.length < 2) { res.json({ players: [] }); return; }
  const players = await query<any>(
    `SELECT u.id, u.name, u.handicap,
            er.team_id,
            CASE WHEN er.id IS NOT NULL THEN TRUE ELSE FALSE END AS already_registered
     FROM users u
     LEFT JOIN event_registrations er
       ON er.event_id = ? AND er.user_id = u.id AND er.status = 'approved'
     WHERE u.id <> ?
       AND (LOWER(u.name) LIKE LOWER(?) OR CAST(u.handicap AS TEXT) LIKE ?)
     ORDER BY already_registered DESC, u.name
     LIMIT 20`,
    [evId, user.id, `%${q}%`, `%${q}%`]
  );
  res.json({ players: players.map((p: any) => ({
    id: p.id, name: p.name,
    handicap_index: p.handicap != null ? parseFloat(p.handicap) : null,
    has_partner: !!p.team_id,
    already_registered: !!p.already_registered,
  })) });
});

// GET /events/:id/my-scores  — fetch the authenticated user's own submitted scores for this event
router.get("/events/:id/my-scores", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Login required" }); return; }
  const evId = parseInt(req.params.id, 10);
  const reg = await row<any>(
    "SELECT team_id FROM event_registrations WHERE event_id = ? AND user_id = ?",
    [evId, user.id]
  );
  if (!reg) { res.json({ scores: [] }); return; }

  let scores: any[];
  if (reg.team_id) {
    scores = await query<any>(
      "SELECT round, gross, net, points, dq, dq_reason, original_gross, original_net, original_points, corrected_at FROM event_scores WHERE event_id = ? AND team_id = ?",
      [evId, reg.team_id]
    );
  } else {
    scores = await query<any>(
      "SELECT round, gross, net, points, dq, dq_reason, original_gross, original_net, original_points, corrected_at FROM event_scores WHERE event_id = ? AND user_id = ? AND team_id IS NULL",
      [evId, user.id]
    );
  }
  res.json({ scores });
});

// POST /events/:id/scores  — submit a player's/team's scorecard (gross, net, points per round)
router.post("/events/:id/scores", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Login required" }); return; }

  const evId = parseInt(req.params.id, 10);
  const ev = await row<any>("SELECT id, scoring_enabled, format FROM golf_events WHERE id = ? AND status = 'active'", [evId]);
  if (!ev) { res.status(404).json({ message: "Event not found or not active" }); return; }
  if (!ev.scoring_enabled) { res.status(400).json({ message: "Scoring is not enabled for this event" }); return; }

  const reg = await row<any>(
    "SELECT id, status, division, frozen_handicap, team_id FROM event_registrations WHERE event_id = ? AND user_id = ?",
    [evId, user.id]
  );
  if (!reg || reg.status !== "approved") { res.status(403).json({ message: "You must be a confirmed participant to submit scores" }); return; }

  const { round = 1, hole_scores, gross, net, points } = req.body ?? {};
  if (gross == null && !hole_scores) { res.status(400).json({ message: "gross or hole_scores required" }); return; }

  const totalGross = gross != null ? Number(gross) : Object.values(hole_scores ?? {}).reduce((s: any, v: any) => s + Number(v), 0);
  const totalNet   = net    != null ? Number(net)   : null;
  const totalPts   = points != null ? Number(points) : null;
  const ts = teamSize(ev.format ?? "");

  if (ts !== "individual" && reg.team_id) {
    // Team format: one score row per team per round — block re-submission
    const existing = await row<any>("SELECT id FROM event_scores WHERE event_id = ? AND team_id = ? AND round = ?", [evId, reg.team_id, round]);
    if (existing) {
      res.status(409).json({ message: "A score for this round has already been submitted and cannot be changed." });
      return;
    }
    await exec(
      "INSERT INTO event_scores (event_id, team_id, user_id, division, frozen_handicap, round, gross, net, points, hole_scores, verified) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)",
      [evId, reg.team_id, user.id, reg.division, reg.frozen_handicap, round, totalGross, totalNet, totalPts, JSON.stringify(hole_scores ?? {})]
    );
  } else {
    // Individual: one row per player per round — block re-submission
    const existing = await row<any>("SELECT id FROM event_scores WHERE event_id = ? AND user_id = ? AND round = ? AND team_id IS NULL", [evId, user.id, round]);
    if (existing) {
      res.status(409).json({ message: "A score for this round has already been submitted and cannot be changed." });
      return;
    }
    await exec(
      "INSERT INTO event_scores (event_id, user_id, division, frozen_handicap, round, gross, net, points, hole_scores, verified) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)",
      [evId, user.id, reg.division, reg.frozen_handicap, round, totalGross, totalNet, totalPts, JSON.stringify(hole_scores ?? {})]
    );
  }
  res.json({ message: "Score submitted. A club official will verify your scorecard." });
});

// POST /events/:id/pay  — initiate event entry payment (Stitch / wallet / prepaid / voucher)
router.post("/events/:id/pay", async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ message: "Login required" }); return; }

  const evId = parseInt(req.params.id, 10);
  const ev = await row<any>("SELECT * FROM golf_events WHERE id = ? AND status = 'active'", [evId]);
  if (!ev) { res.status(404).json({ message: "Event not found" }); return; }

  const reg = await row<any>(
    "SELECT id, status, payment_status, division FROM event_registrations WHERE event_id = ? AND user_id = ?",
    [evId, user.id]
  );
  if (!reg || reg.status !== "approved") { res.status(403).json({ message: "You must have an approved entry to pay" }); return; }
  if (reg.payment_status === "paid") { res.json({ paid: true, message: "Already paid" }); return; }

  const { payment_method = "stitch", voucher_code } = req.body ?? {};

  // ── Resolve the entry fee ─────────────────────────────────────────────────
  // Tiered pricing: look up the user's club rate. Fixed fee otherwise.
  let fee: number;
  if (Number(ev.use_tiered_pricing)) {
    const holes    = ev.holes === 9 ? 9 : 18;
    const priceCol = holes === 9 ? "price_9h" : "price_18h";
    const [memberRow, userRow] = await Promise.all([
      row<any>("SELECT membership_type FROM club_members WHERE club_id = ? AND user_id = ? AND status = 'active'", [ev.club_id, user.id]).catch(() => null),
      row<any>("SELECT date_of_birth FROM users WHERE id = ?", [user.id]).catch(() => null),
    ]);
    const dob         = userRow?.date_of_birth ?? null;
    const hasHna      = await isHnaVerified(user.id);
    const memberType  = memberRow?.membership_type ?? null;
    const isHonorary  = memberType === "honorary";
    const isJuniorAge = !isHonorary && ageIsJunior(dob);
    const isStudentAge = !isHonorary && !isJuniorAge && ageIsStudent(dob);
    const isPensionerAge = ageIsPensioner(dob);
    const tierCandidates: string[] = [];
    if (isHonorary) {
      tierCandidates.push("honorary");
      if (isPensionerAge) tierCandidates.push("pensioner_full");
    } else if (isJuniorAge) {
      tierCandidates.push(memberRow ? "junior_member" : "junior_visitor");
      if (!memberRow && hasHna) tierCandidates.push("affiliated_visitor");
    } else if (isStudentAge) {
      tierCandidates.push(memberRow ? "student_member" : "student_visitor");
      if (!memberRow && hasHna) tierCandidates.push("affiliated_visitor");
    } else if (isPensionerAge) {
      tierCandidates.push(memberRow ? pensionerMemberTierType(memberType ?? "") : (hasHna ? "affiliated_pensioner" : "non_affiliated_pensioner"));
    } else {
      tierCandidates.push(memberType ?? (hasHna ? "affiliated_visitor" : "non_affiliated_visitor"));
    }
    const candidateRows = await Promise.all(
      tierCandidates.map(t => row<any>(`SELECT ${priceCol} FROM club_pricing_tiers WHERE club_id = ? AND tier_type = ?`, [ev.club_id, t]).catch(() => null))
    );
    let tierPrice: number | null = null;
    for (const tr of candidateRows) {
      if (!tr) continue;
      const p = tr[priceCol] != null ? parseFloat(tr[priceCol]) : null;
      if (p !== null && (tierPrice === null || p < tierPrice)) tierPrice = p;
    }
    fee = tierPrice ?? 0;
  } else {
    fee = parseFloat(ev.entry_fee ?? "0");
  }

  // ── Add any additional event fees (competition fee, two-club fee, etc.) ───
  const additionalFees: { name: string; amount: number }[] = Array.isArray(ev.additional_fees)
    ? ev.additional_fees
    : (typeof ev.additional_fees === "string" ? JSON.parse(ev.additional_fees || "[]") : []);
  const additionalTotal = additionalFees.reduce((s, f) => s + (Number(f.amount) || 0), 0);
  fee = fee + additionalTotal;

  // ── Voucher ───────────────────────────────────────────────────────────────
  if (payment_method === "voucher") {
    if (!voucher_code) { res.status(400).json({ message: "Voucher code required" }); return; }
    const codeUpper = String(voucher_code).toUpperCase().trim();
    let discountAmount = 0;
    if (codeUpper.startsWith("CV-")) {
      const cv = await row<any>("SELECT * FROM cancellation_vouchers WHERE code = ? AND user_id = ?", [codeUpper, user.id]);
      const cvRemaining = cv ? (cv.value_remaining != null ? parseFloat(cv.value_remaining) : (cv.value_rands ? parseFloat(cv.value_rands) : 0)) : 0;
      if (!cv || cv.redeemed_at || cvRemaining <= 0 || (cv.expires_at && new Date(cv.expires_at) < new Date())) {
        res.status(400).json({ message: "Invalid or expired voucher" }); return;
      }
      discountAmount = Math.min(cvRemaining, fee);
    } else {
      const voucher = await row<any>("SELECT * FROM vouchers WHERE code = ? AND active = 1", [codeUpper]);
      if (!voucher || (voucher.expires_at && new Date(voucher.expires_at) < new Date()) || (voucher.max_uses !== null && voucher.uses_count >= voucher.max_uses)) {
        res.status(400).json({ message: "Invalid or expired voucher" }); return;
      }
      discountAmount = voucher.discount_type === "percentage"
        ? Math.round(fee * parseFloat(voucher.discount_value) / 100 * 100) / 100
        : Math.min(parseFloat(voucher.discount_value), fee);
      await exec("UPDATE vouchers SET uses_count = uses_count + 1 WHERE id = ?", [voucher.id]);
    }
    await exec("UPDATE event_registrations SET payment_status = 'paid', payment_method = 'voucher', paid_at = NOW() WHERE id = ?", [reg.id]);
    res.json({ paid: true, discount: discountAmount, final_fee: Math.max(0, fee - discountAmount) });
    return;
  }

  // ── Prepaid round ─────────────────────────────────────────────────────────
  if (payment_method === "prepaid") {
    const membership = await row<any>(
      "SELECT id, prepaid_rounds, prepaid_rounds_used FROM club_members WHERE club_id = ? AND user_id = ? AND status = 'active'",
      [ev.club_id, user.id]
    );
    if (!membership) { res.status(403).json({ message: "Prepaid rounds can only be used at your home club as an active member." }); return; }
    const remaining = (parseInt(membership.prepaid_rounds) || 0) - (parseInt(membership.prepaid_rounds_used) || 0);
    if (remaining <= 0) { res.status(400).json({ message: "You have no prepaid rounds remaining at this club." }); return; }
    await exec("UPDATE club_members SET prepaid_rounds_used = prepaid_rounds_used + 1 WHERE id = ?", [membership.id]);
    await exec("UPDATE event_registrations SET payment_status = 'paid', payment_method = 'prepaid', paid_at = NOW() WHERE id = ?", [reg.id]);
    res.json({ paid: true });
    return;
  }

  // ── Wallet ────────────────────────────────────────────────────────────────
  if (payment_method === "wallet") {
    const walletRow = await row<any>("SELECT balance FROM wallets WHERE user_id = ?", [user.id]);
    const balance = parseFloat(walletRow?.balance ?? "0");
    if (balance < fee) { res.status(400).json({ message: `Insufficient wallet balance (R${balance.toFixed(2)} available, R${fee.toFixed(2)} required)` }); return; }
    await exec("UPDATE wallets SET balance = balance - ? WHERE user_id = ?", [fee, user.id]);
    await exec("UPDATE event_registrations SET payment_status = 'paid', payment_method = 'wallet', paid_at = NOW() WHERE id = ?", [reg.id]);
    res.json({ paid: true });
    return;
  }

  // ── Stitch ────────────────────────────────────────────────────────────────
  if (fee <= 0) {
    // Free entry (honorary member, complimentary tier, etc.) — mark paid immediately
    await exec("UPDATE event_registrations SET payment_status = 'paid', payment_method = 'free', paid_at = NOW() WHERE id = ?", [reg.id]);
    res.json({ paid: true });
    return;
  }
  const { createStitchPayment } = await import("../lib/stitch");
  const host = process.env.REPLIT_DEV_DOMAIN ?? "localhost:8080";
  const merchantReference = `event-${evId}-user-${user.id}`;
  try {
    const paymentUrl = await createStitchPayment({
      amount: fee,
      currency: "ZAR",
      merchantReference,
      redirectUrl: `https://${host}/booking/success`,
    });
    await exec("UPDATE event_registrations SET payment_status = 'pending', payment_method = 'stitch' WHERE id = ?", [reg.id]);
    res.json({ payment_url: paymentUrl });
  } catch (e: any) {
    res.status(502).json({ message: e?.message ?? "Payment initiation failed" });
  }
});

export default router;
