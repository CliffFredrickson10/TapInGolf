import { Router, type IRouter } from "express";
import { query, row, exec, run } from "../lib/pg";
import { getUser } from "../lib/auth";
import { isHnaVerified } from "../lib/hna";
import { Storage } from "@google-cloud/storage";

const router: IRouter = Router();
const SIDECAR = "http://127.0.0.1:1106";

// ── Age-based tier helpers (shared across endpoints) ─────────────────────────
// pg returns DATE columns as JS Date objects; handle both Date and string safely.
const calcAge = (dob: unknown): number | null => {
  if (!dob) return null;
  const birth = dob instanceof Date ? dob : new Date(String(dob));
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
};
const ageIsJunior    = (dob: unknown) => { const a = calcAge(dob); return a !== null && a <= 18; };
const ageIsStudent   = (dob: unknown) => { const a = calcAge(dob); return a !== null && a >= 18 && a <= 24; };
const ageIsPensioner = (dob: unknown) => { const a = calcAge(dob); return a !== null && a >= 65; };

const pensionerMemberTierType = (membershipType: string): string => {
  if (membershipType.includes("six_day")) return "pensioner_six_day";
  if (membershipType.includes("week_day") || membershipType.includes("weekday")) return "pensioner_week_day";
  return "pensioner_full";
};

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

  const whereClause = filterWhere.join(" AND ");
  const orderBy     = hasLocation
    ? "ORDER BY (c.latitude IS NULL) ASC, distance ASC"
    : "ORDER BY c.featured DESC, c.name ASC";

  const baseSelect = `
    SELECT c.*,
      ROUND(AVG(r.rating)::numeric, 1) as rating,
      COUNT(DISTINCT r.id) as review_count,
      ${distanceExpr} as distance
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
      c.cart_available  = !!c.cart_available;
      c.cart_compulsory = !!c.cart_compulsory;
      c.cart_price      = c.cart_price ? parseFloat(c.cart_price) : null;
      if (c.logo_url) c.logo_url = logoApiUrl(c.id, c.logo_url);
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
  club.cart_available  = !!club.cart_available;
  club.cart_compulsory = !!club.cart_compulsory;
  club.cart_price      = club.cart_price ? parseFloat(club.cart_price) : null;
  if (club.logo_url) club.logo_url = logoApiUrl(club.id, club.logo_url);

  res.json({ club });
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
  const formatted = portalSlots
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
    tee_start_type:   s.tee_start_type,
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

export default router;
