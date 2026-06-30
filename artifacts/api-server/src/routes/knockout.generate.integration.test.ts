/**
 * Integration tests for POST /portal/knockout/:id/generate
 *
 * These tests use the REAL PostgreSQL database (no pg mock) to verify that the
 * FK ON DELETE CASCADE in the schema actually removes both main-bracket and
 * consolation-bracket rows when the generate endpoint fires its single
 * `DELETE FROM knockout_rounds WHERE event_id = ?` statement.
 *
 * portalAuth is mocked only to inject the test club without a real HMAC token.
 * All other layers (pg, knockout route logic) are real.
 *
 * Cleanup: afterAll deletes the seeded club (cascades → golf_events via
 * explicit delete, then users individually). Tests are isolated by event id.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { Pool } from "pg";

// ── portalAuth: inject test club id at call time via shared variable ──────────
// vi.mock is hoisted before imports, so we use a module-level reference.
let _testClubId = 0;

vi.mock("../lib/portalAuth", () => ({
  requireClubAuth: (_req: any, _res: any, next: any) => {
    _req.club = { id: _testClubId, name: "Integration Test Club" };
    next();
  },
  getClub: (req: any) => req.club,
}));

vi.mock("../lib/notifications",     () => ({ sendPushNotifications: vi.fn() }));
vi.mock("../lib/userNotifications", () => ({ saveUserNotification:  vi.fn() }));
vi.mock("../lib/logger",            () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import knockoutRouter from "./knockout";

// ── DB connection ─────────────────────────────────────────────────────────────
let pool: Pool;

// ── Test-data IDs — populated in beforeAll ────────────────────────────────────
let clubId: number;
let userIds: number[] = [];
let eventId: number;

// ── Express app ───────────────────────────────────────────────────────────────
let app: Express;

// ─────────────────────────────────────────────────────────────────────────────
beforeAll(async () => {
  pool = new Pool({ connectionString: process.env["DATABASE_URL"], connectionTimeoutMillis: 10_000 });

  // ── Club ───────────────────────────────────────────────────────────────────
  const clubRes = await pool.query(
    `INSERT INTO clubs (name, location, province, active) VALUES ($1, $2, $3, 1) RETURNING id`,
    ["__integration_test_club__", "Test City", "Gauteng"]
  );
  clubId = clubRes.rows[0].id;
  _testClubId = clubId; // inject into the portalAuth mock closure

  // ── Users (4 golfers) ─────────────────────────────────────────────────────
  for (let i = 1; i <= 4; i++) {
    const ur = await pool.query(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'golfer') RETURNING id`,
      [`IntTestPlayer${i}`, `int_test_player${i}_${Date.now()}@tapingolf-test.invalid`, "nohash"]
    );
    userIds.push(ur.rows[0].id);
  }

  // ── Club memberships ───────────────────────────────────────────────────────
  for (const uid of userIds) {
    await pool.query(
      `INSERT INTO club_members (club_id, user_id, added_by, status) VALUES ($1, $2, $3, 'active')`,
      [clubId, uid, userIds[0]]
    );
  }

  // ── Golf event with consolation enabled ───────────────────────────────────
  const evRes = await pool.query(
    `INSERT INTO golf_events
       (club_id, name, event_date, format, knockout_type, consolation_enabled,
        event_type, status, created_by)
     VALUES ($1, $2, NOW()::DATE, 'knockout_individual', 'individual', TRUE,
             'competition', 'active', $3)
     RETURNING id`,
    [clubId, "__integration_test_event__", userIds[0]]
  );
  eventId = evRes.rows[0].id;

  // ── Express app ───────────────────────────────────────────────────────────
  app = express();
  app.use(express.json());
  app.use("/", knockoutRouter);
});

afterAll(async () => {
  if (pool) {
    // golf_events delete cascades → knockout_rounds → knockout_matches
    await pool.query(`DELETE FROM golf_events WHERE id = $1`, [eventId]);
    await pool.query(`DELETE FROM club_members WHERE club_id = $1`, [clubId]);
    await pool.query(`DELETE FROM clubs WHERE id = $1`, [clubId]);
    if (userIds.length) {
      await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
    }
    await pool.end();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
describe("Integration — generate endpoint CASCADE DELETE (real DB)", () => {
  it("physically removes pre-existing main and consolation rounds/matches via FK cascade on re-generate", async () => {
    // ── Phase 1: manually seed main + consolation rounds & matches ───────────
    // This simulates the state after an initial generate and a player being
    // seeded into consolation after losing a main R1 match.

    const mainR1 = await pool.query(
      `INSERT INTO knockout_rounds (event_id, round_number, label, bracket)
       VALUES ($1, 1, 'Round 1', 'main') RETURNING id`,
      [eventId]
    );
    const mainR1Id = mainR1.rows[0].id;

    const mainR2 = await pool.query(
      `INSERT INTO knockout_rounds (event_id, round_number, label, bracket)
       VALUES ($1, 2, 'Final', 'main') RETURNING id`,
      [eventId]
    );
    const mainR2Id = mainR2.rows[0].id;

    const consolR1 = await pool.query(
      `INSERT INTO knockout_rounds (event_id, round_number, label, bracket)
       VALUES ($1, 1, 'Plate · Final', 'consolation') RETURNING id`,
      [eventId]
    );
    const consolR1Id = consolR1.rows[0].id;

    // Main R1 matches
    const m1Res = await pool.query(
      `INSERT INTO knockout_matches (event_id, round_id, match_sequence, player1_id, player2_id, status, slot_position, bracket)
       VALUES ($1, $2, 0, $3, $4, 'pending', 'top', 'main') RETURNING id`,
      [eventId, mainR1Id, userIds[0], userIds[1]]
    );
    const mainMatch1Id = m1Res.rows[0].id;

    const m2Res = await pool.query(
      `INSERT INTO knockout_matches (event_id, round_id, match_sequence, player1_id, player2_id, status, slot_position, bracket)
       VALUES ($1, $2, 1, $3, $4, 'pending', 'bottom', 'main') RETURNING id`,
      [eventId, mainR1Id, userIds[2], userIds[3]]
    );
    const mainMatch2Id = m2Res.rows[0].id;

    // Main R2 (Final)
    await pool.query(
      `INSERT INTO knockout_matches (event_id, round_id, match_sequence, status, slot_position, bracket)
       VALUES ($1, $2, 0, 'pending', 'top', 'main')`,
      [eventId, mainR2Id]
    );

    // Consolation match — status 'pending', has player1_id (seeded from loser)
    const cm1Res = await pool.query(
      `INSERT INTO knockout_matches (event_id, round_id, match_sequence, player1_id, status, slot_position, bracket)
       VALUES ($1, $2, 0, $3, 'pending', 'top', 'consolation') RETURNING id`,
      [eventId, consolR1Id, userIds[1]]
    );
    const consolMatchId = cm1Res.rows[0].id;

    // Link loser_next_match_id on both main R1 matches → consolation match
    await pool.query(
      `UPDATE knockout_matches SET loser_next_match_id = $1, loser_slot_position = 'top' WHERE id = $2`,
      [consolMatchId, mainMatch1Id]
    );
    await pool.query(
      `UPDATE knockout_matches SET loser_next_match_id = $1, loser_slot_position = 'bottom' WHERE id = $2`,
      [consolMatchId, mainMatch2Id]
    );

    // Confirm the seeded rounds and matches exist in the DB
    const beforeRounds = await pool.query(
      `SELECT id, bracket FROM knockout_rounds WHERE event_id = $1 ORDER BY bracket, round_number`,
      [eventId]
    );
    expect(beforeRounds.rows.length).toBe(3); // main R1, main R2, consolation R1

    const beforeMatches = await pool.query(
      `SELECT id, bracket FROM knockout_matches WHERE event_id = $1 ORDER BY bracket, match_sequence`,
      [eventId]
    );
    expect(beforeMatches.rows.length).toBe(4); // 2 main R1 + 1 main R2 + 1 consolation

    // ── Phase 2: call the generate endpoint (re-generate) ────────────────────
    // The guard query finds NO in_progress/complete consolation matches, so it proceeds.
    const res = await request(app)
      .post(`/portal/knockout/${eventId}/generate`)
      .set("Authorization", "Bearer integration-test-token")
      .send({ draw_method: "random" });

    expect(res.status).toBe(200);
    expect(res.body.consolation_enabled).toBe(true);

    // ── Phase 3: verify FK ON DELETE CASCADE wiped ALL old rows ──────────────
    // The pre-existing manually seeded main and consolation rounds must be gone.
    const oldRoundsStillPresent = await pool.query(
      `SELECT id FROM knockout_rounds WHERE id = ANY($1)`,
      [[mainR1Id, mainR2Id, consolR1Id]]
    );
    expect(oldRoundsStillPresent.rows.length).toBe(0); // cascade deleted them all

    // Their child matches must also be gone (cascaded from rounds)
    const oldMatchesStillPresent = await pool.query(
      `SELECT id FROM knockout_matches WHERE id = ANY($1)`,
      [[mainMatch1Id, mainMatch2Id, consolMatchId]]
    );
    expect(oldMatchesStillPresent.rows.length).toBe(0); // cascade deleted matches too

    // New rounds were created by the re-generate
    const newRounds = await pool.query(
      `SELECT id, bracket FROM knockout_rounds WHERE event_id = $1`,
      [eventId]
    );
    expect(newRounds.rows.length).toBeGreaterThan(0);

    // Both 'main' and 'consolation' bracket rounds are present after fresh generate
    const brackets = newRounds.rows.map((r: any) => r.bracket);
    expect(brackets).toContain("main");
    expect(brackets).toContain("consolation");

    // Clean up freshly generated rounds so the next test starts from a clean state
    await pool.query(`DELETE FROM knockout_rounds WHERE event_id = $1`, [eventId]);
  });

  it("returns 409 and leaves ALL existing rounds and consolation matches untouched when a consolation result is in progress", async () => {
    // Seed a consolation match with status='in_progress' (score being entered)
    const mainRound = await pool.query(
      `INSERT INTO knockout_rounds (event_id, round_number, label, bracket)
       VALUES ($1, 1, 'Round 1', 'main') RETURNING id`,
      [eventId]
    );
    const consolRound = await pool.query(
      `INSERT INTO knockout_rounds (event_id, round_number, label, bracket)
       VALUES ($1, 1, 'Plate · Final', 'consolation') RETURNING id`,
      [eventId]
    );

    const consolMatch = await pool.query(
      `INSERT INTO knockout_matches (event_id, round_id, match_sequence, player1_id, player2_id, status, slot_position, bracket)
       VALUES ($1, $2, 0, $3, $4, 'in_progress', 'top', 'consolation') RETURNING id`,
      [eventId, consolRound.rows[0].id, userIds[0], userIds[1]]
    );

    const mainRoundId    = mainRound.rows[0].id;
    const consolRoundId  = consolRound.rows[0].id;
    const consolMatchId  = consolMatch.rows[0].id;

    // Attempt to re-generate
    const res = await request(app)
      .post(`/portal/knockout/${eventId}/generate`)
      .set("Authorization", "Bearer integration-test-token")
      .send({});

    // Must be blocked — Plate Flight is live
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/plate flight/i);

    // Verify the DB was not touched — all rounds and the live consolation match survive
    const roundsAfter = await pool.query(
      `SELECT id FROM knockout_rounds WHERE id = ANY($1)`,
      [[mainRoundId, consolRoundId]]
    );
    expect(roundsAfter.rows.length).toBe(2); // both intact

    const matchAfter = await pool.query(
      `SELECT id, status FROM knockout_matches WHERE id = $1`,
      [consolMatchId]
    );
    expect(matchAfter.rows.length).toBe(1);
    expect(matchAfter.rows[0].status).toBe("in_progress"); // unchanged

    // Cleanup
    await pool.query(`DELETE FROM knockout_rounds WHERE event_id = $1`, [eventId]);
  });
});
