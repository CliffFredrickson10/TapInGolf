import { describe, it, expect, beforeEach, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";

// ── Mocks ─────────────────────────────────────────────────────────────────────
vi.mock("../lib/pg", () => ({
  query: vi.fn(),
  row:   vi.fn(),
  exec:  vi.fn(),
  run:   vi.fn(),
}));

vi.mock("../lib/portalAuth", () => ({
  requireClubAuth: (_req: any, _res: any, next: any) => { _req.club = { id: 42, name: "Test Club" }; next(); },
  getClub: (req: any) => req.club,
}));

vi.mock("../lib/notifications",     () => ({ sendPushNotifications: vi.fn() }));
vi.mock("../lib/userNotifications", () => ({ saveUserNotification:  vi.fn() }));
vi.mock("../lib/logger",            () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import knockoutRouter from "./knockout";
import { query, row, exec, run } from "../lib/pg";

const mQuery = vi.mocked(query);
const mRow   = vi.mocked(row);
const mExec  = vi.mocked(exec);
const mRun   = vi.mocked(run);

function makeApp(): Express {
  const app = express();
  app.use(express.json());
  app.use("/", knockoutRouter);
  return app;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────
const BASE_EVENT = {
  id: 1,
  club_id: 42,
  format: "knockout_individual",
  knockout_type: "individual",
  knockout_draw_method: "random",
  consolation_enabled: 0,
  singles_entry_deadline: null,
  scoring_enabled: 0,
};

// 4 members → bracket size 4, byes 0, 2 main rounds.
// 2 real R1 matches → consolation: 1 round, 1 match (cN=2, cSize=2, cByes=0).
const FOUR_MEMBERS = [
  { user_id: 1, name: "Alice",   handicap: 5 },
  { user_id: 2, name: "Bob",     handicap: 8 },
  { user_id: 3, name: "Charlie", handicap: 12 },
  { user_id: 4, name: "Dave",    handicap: 15 },
];

// ── exec-ID helpers ───────────────────────────────────────────────────────────
// For a 4-player bracket WITHOUT consolation:
// exec calls: round1, round2, R1match0, R1match1, R2match → 5 IDs
function stubExecNonConsolation(base = 1) {
  mExec
    .mockResolvedValueOnce(base)       // knockout_rounds round 1
    .mockResolvedValueOnce(base + 1)   // knockout_rounds round 2
    .mockResolvedValueOnce(base + 10)  // knockout_matches R1 match 0
    .mockResolvedValueOnce(base + 11)  // knockout_matches R1 match 1
    .mockResolvedValueOnce(base + 20); // knockout_matches R2 match
}

// For a 4-player bracket WITH consolation:
// extra: consolRound, consolMatch0
function stubExecWithConsolation(base = 1) {
  mExec
    .mockResolvedValueOnce(base)       // knockout_rounds round 1
    .mockResolvedValueOnce(base + 1)   // knockout_rounds round 2
    .mockResolvedValueOnce(base + 10)  // knockout_matches R1 match 0
    .mockResolvedValueOnce(base + 11)  // knockout_matches R1 match 1
    .mockResolvedValueOnce(base + 20)  // knockout_matches R2 match
    .mockResolvedValueOnce(base + 30)  // knockout_rounds consolation round 1
    .mockResolvedValueOnce(base + 40); // knockout_matches consolation R1 match 0
}

// ── query() mock helpers ──────────────────────────────────────────────────────
// When consolation_enabled=1, the endpoint first checks for live consolation
// matches (a guard query). We must return [] for it before the members query.
function stubQueriesNoConsolation() {
  // No consolation_enabled — only members query
  mQuery.mockResolvedValueOnce(FOUR_MEMBERS);
}

function stubQueriesWithConsolation(r1RealMatchIds: number[] = [11, 12]) {
  // 1. live-consolation guard → [] (no in-progress consolation matches)
  mQuery.mockResolvedValueOnce([]);
  // 2. members
  mQuery.mockResolvedValueOnce(FOUR_MEMBERS);
  // 3. r1RealMatches (for consolation bracket construction)
  mQuery.mockResolvedValueOnce(r1RealMatchIds.map(id => ({ id })));
}

// vi.resetAllMocks() clears the mockResolvedValueOnce queues between tests,
// preventing bleed-through. Always re-establish run() default after reset.
beforeEach(() => {
  vi.resetAllMocks();
  mRun.mockResolvedValue(undefined as any);
});

// ─────────────────────────────────────────────────────────────────────────────
describe("POST /portal/knockout/:id/generate — cascade delete on regeneration", () => {
  it("calls DELETE FROM knockout_rounds on every generate, wiping both main and consolation rows", async () => {
    mRow.mockResolvedValue({ ...BASE_EVENT });
    stubQueriesNoConsolation();
    stubExecNonConsolation();

    const res = await request(makeApp())
      .post("/portal/knockout/1/generate")
      .set("Authorization", "Bearer fake-club-token")
      .send({ draw_method: "random" });

    expect(res.status).toBe(200);

    const deleteCalls = mRun.mock.calls.filter(([sql]) =>
      String(sql).includes("DELETE FROM knockout_rounds")
    );
    expect(deleteCalls.length).toBe(1);
    expect(deleteCalls[0]![1]).toContain(1); // event id
  });

  it("issues the cascade DELETE before any INSERT so stale consolation data is always cleared first", async () => {
    mRow.mockResolvedValue({ ...BASE_EVENT });
    stubQueriesNoConsolation();
    stubExecNonConsolation();

    await request(makeApp())
      .post("/portal/knockout/1/generate")
      .set("Authorization", "Bearer fake-club-token")
      .send({});

    const runCalls  = mRun.mock.calls.map(([sql]) => String(sql));
    const deleteIdx = runCalls.findIndex(s => s.includes("DELETE FROM knockout_rounds"));
    // DELETE must be the very first run() call in the handler
    expect(deleteIdx).toBe(0);
  });

  it("returns 404 when the event does not belong to the club", async () => {
    mRow.mockResolvedValue(null);

    const res = await request(makeApp())
      .post("/portal/knockout/99/generate")
      .set("Authorization", "Bearer fake-club-token")
      .send({});

    expect(res.status).toBe(404);
  });

  it("returns 400 when fewer than 2 members are available, without touching the DB", async () => {
    mRow.mockResolvedValue({ ...BASE_EVENT });
    mQuery.mockResolvedValueOnce([{ user_id: 1, name: "Solo", handicap: 10 }]);

    const res = await request(makeApp())
      .post("/portal/knockout/1/generate")
      .set("Authorization", "Bearer fake-club-token")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/at least 2/i);

    const deleteCalls = mRun.mock.calls.filter(([sql]) =>
      String(sql).includes("DELETE FROM knockout_rounds")
    );
    expect(deleteCalls.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("POST /portal/knockout/:id/generate — consolation bracket creation", () => {
  it("creates consolation rounds and matches when consolation_enabled=1 and ≥2 real R1 matches exist", async () => {
    mRow.mockResolvedValue({ ...BASE_EVENT, consolation_enabled: 1 });
    stubQueriesWithConsolation([11, 12]);
    stubExecWithConsolation();

    const res = await request(makeApp())
      .post("/portal/knockout/1/generate")
      .set("Authorization", "Bearer fake-club-token")
      .send({ draw_method: "random" });

    expect(res.status).toBe(200);
    expect(res.body.consolation_enabled).toBe(true);
    expect(res.body.bracket_size).toBe(4);

    // A consolation round was INSERTed
    const consolRoundInserts = mExec.mock.calls.filter(([sql]) =>
      String(sql).includes("knockout_rounds") && String(sql).includes("consolation")
    );
    expect(consolRoundInserts.length).toBeGreaterThanOrEqual(1);

    // A consolation match was INSERTed
    const consolMatchInserts = mExec.mock.calls.filter(([sql]) =>
      String(sql).includes("knockout_matches") && String(sql).includes("consolation")
    );
    expect(consolMatchInserts.length).toBeGreaterThanOrEqual(1);

    // Two loser_next_match_id links: one per real R1 match (mm1 top, mm2 bottom)
    const loserLinks = mRun.mock.calls.filter(([sql]) =>
      String(sql).includes("loser_next_match_id")
    );
    expect(loserLinks.length).toBe(2);
  });

  it("does NOT create consolation rounds when consolation_enabled=0", async () => {
    mRow.mockResolvedValue({ ...BASE_EVENT, consolation_enabled: 0 });
    stubQueriesNoConsolation();
    stubExecNonConsolation();

    const res = await request(makeApp())
      .post("/portal/knockout/1/generate")
      .set("Authorization", "Bearer fake-club-token")
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.consolation_enabled).toBe(false);

    const consolRoundInserts = mExec.mock.calls.filter(([sql]) =>
      String(sql).includes("knockout_rounds") && String(sql).includes("consolation")
    );
    expect(consolRoundInserts.length).toBe(0);
  });

  it("returns 409 (conflict) when live consolation matches already exist — blocking data loss", async () => {
    mRow.mockResolvedValue({ ...BASE_EVENT, consolation_enabled: 1 });
    // Guard query returns a live consolation match
    mQuery.mockResolvedValueOnce([{ id: 55 }]);

    const res = await request(makeApp())
      .post("/portal/knockout/1/generate")
      .set("Authorization", "Bearer fake-club-token")
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/plate flight/i);

    // DELETE must NOT have been called — data is preserved
    const deleteCalls = mRun.mock.calls.filter(([sql]) =>
      String(sql).includes("DELETE FROM knockout_rounds")
    );
    expect(deleteCalls.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("POST /portal/knockout/:id/generate — full lifecycle: generate → consolation score → re-generate", () => {
  it("deletes everything and re-creates consolation when re-generating after a consolation-enabled bracket with no live results", async () => {
    const app = makeApp();

    // ── Phase 1: initial generate ───────────────────────────────────────────
    // Simulates a staff member generating the bracket for the first time.
    // Both main and consolation rounds are created.
    mRow.mockResolvedValue({ ...BASE_EVENT, consolation_enabled: 1 });
    stubQueriesWithConsolation([11, 12]);
    stubExecWithConsolation(100); // IDs starting at 100

    const firstRes = await request(app)
      .post("/portal/knockout/1/generate")
      .set("Authorization", "Bearer fake-club-token")
      .send({});

    expect(firstRes.status).toBe(200);
    expect(firstRes.body.consolation_enabled).toBe(true);

    // First generate must call DELETE once
    const firstDeleteCalls = mRun.mock.calls.filter(([sql]) =>
      String(sql).includes("DELETE FROM knockout_rounds")
    );
    expect(firstDeleteCalls.length).toBe(1);

    // Consolation round + match were created
    const firstConsolRounds = mExec.mock.calls.filter(([sql]) =>
      String(sql).includes("knockout_rounds") && String(sql).includes("consolation")
    );
    expect(firstConsolRounds.length).toBeGreaterThanOrEqual(1);

    // ── Phase 2: consolation match in a pending state (not yet complete) ───
    // In reality a player would be seeded into consolation after losing R1.
    // The guard query checks for 'in_progress' or 'complete' status — pending
    // is NOT blocked. So this simulate the scenario where a consolation bracket
    // exists but no results have been entered yet (admin wants to redo the draw).
    vi.resetAllMocks();
    mRun.mockResolvedValue(undefined as any);

    // ── Phase 3: re-generate — consolation pending (guard passes) ──────────
    mRow.mockResolvedValue({ ...BASE_EVENT, consolation_enabled: 1 });
    stubQueriesWithConsolation([21, 22]); // new R1 match IDs after fresh R1
    stubExecWithConsolation(200); // new IDs starting at 200

    const secondRes = await request(app)
      .post("/portal/knockout/1/generate")
      .set("Authorization", "Bearer fake-club-token")
      .send({});

    expect(secondRes.status).toBe(200);
    expect(secondRes.body.consolation_enabled).toBe(true);

    // DELETE fired again — in the real DB this single statement cascades
    // and removes ALL knockout_rounds rows (bracket='main' and bracket='consolation')
    // along with their knockout_matches children via FK ON DELETE CASCADE.
    const secondDeleteCalls = mRun.mock.calls.filter(([sql]) =>
      String(sql).includes("DELETE FROM knockout_rounds")
    );
    expect(secondDeleteCalls.length).toBe(1);
    // The event id is always the parameter
    expect(secondDeleteCalls[0]![1]).toContain(1);

    // Fresh consolation rounds were inserted after the wipe
    const secondConsolRounds = mExec.mock.calls.filter(([sql]) =>
      String(sql).includes("knockout_rounds") && String(sql).includes("consolation")
    );
    expect(secondConsolRounds.length).toBeGreaterThanOrEqual(1);

    // Loser links were re-established to the newly created main R1 matches
    const secondLoserLinks = mRun.mock.calls.filter(([sql]) =>
      String(sql).includes("loser_next_match_id")
    );
    expect(secondLoserLinks.length).toBe(2); // mm1 (top) + mm2 (bottom)
  });

  it("blocks re-generate (409) when a consolation match result has been recorded, preserving player data", async () => {
    // Simulates: bracket generated → R1 result entered → R1 loser seeded into
    // consolation → consolation match marked in_progress → admin tries to re-generate.
    // The guard must stop this and return 409 to prevent data loss.
    mRow.mockResolvedValue({ ...BASE_EVENT, consolation_enabled: 1 });
    // Guard query finds a consolation match that is in_progress (score entered)
    mQuery.mockResolvedValueOnce([{ id: 77 }]);

    const res = await request(makeApp())
      .post("/portal/knockout/1/generate")
      .set("Authorization", "Bearer fake-club-token")
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/plate flight/i);

    // Absolutely no DB writes — existing bracket and consolation scores are safe
    const writeCalls = mRun.mock.calls.filter(([sql]) =>
      String(sql).includes("DELETE") || String(sql).includes("INSERT") || String(sql).includes("UPDATE")
    );
    expect(writeCalls.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("POST /portal/knockout/:id/generate — seeded draw ordering", () => {
  // Helper: filter exec() calls that insert into knockout_matches with
  // explicit player columns (i.e. Round 1 player matches, not later rounds).
  function r1MatchInserts() {
    return mExec.mock.calls.filter(([sql]) =>
      String(sql).includes("knockout_matches") &&
      String(sql).includes("player1_id, player2_id")
    );
  }

  it("orders players by handicap ascending and places them in serpentine order across bracket slots", async () => {
    // FOUR_MEMBERS: Alice(5), Bob(8), Charlie(12), Dave(15)
    // Sorted ascending: Alice, Bob, Charlie, Dave
    // Serpentine interleave: Alice(lo=0), Dave(hi=3), Bob(lo=1), Charlie(hi=2)
    // → match 0: Alice(1) vs Dave(4), match 1: Bob(2) vs Charlie(3)
    mRow.mockResolvedValue({ ...BASE_EVENT });
    stubQueriesNoConsolation();
    stubExecNonConsolation();

    const res = await request(makeApp())
      .post("/portal/knockout/1/generate")
      .set("Authorization", "Bearer fake-club-token")
      .send({ draw_method: "seeded" });

    expect(res.status).toBe(200);

    const inserts = r1MatchInserts();
    // 4-player bracket → 2 R1 matches
    expect(inserts.length).toBe(2);

    // params: [evId, r1RoundId, matchSequence, player1_id, player2_id, status, slot_position]
    const match0Params = inserts[0]![1] as any[];
    const match1Params = inserts[1]![1] as any[];

    // Match 0: seed #1 (Alice, user_id=1) vs seed #4 (Dave, user_id=4)
    expect(match0Params[3]).toBe(1); // Alice
    expect(match0Params[4]).toBe(4); // Dave

    // Match 1: seed #2 (Bob, user_id=2) vs seed #3 (Charlie, user_id=3)
    expect(match1Params[3]).toBe(2); // Bob
    expect(match1Params[4]).toBe(3); // Charlie
  });

  it("treats null handicap as 99 (highest) so those players sort to the bottom of the seed list", async () => {
    // Members: Zara(null→99), Eve(3), Frank(10), Grace(20)
    // Sorted ascending by (handicap ?? 99): Eve(3), Frank(10), Grace(20), Zara(99)
    // Serpentine: Eve(lo=0), Zara(hi=3), Frank(lo=1), Grace(hi=2)
    // → match 0: Eve vs Zara, match 1: Frank vs Grace
    const membersWithNull = [
      { user_id: 10, name: "Zara",  handicap: null },
      { user_id: 11, name: "Eve",   handicap: 3    },
      { user_id: 12, name: "Frank", handicap: 10   },
      { user_id: 13, name: "Grace", handicap: 20   },
    ];

    mRow.mockResolvedValue({ ...BASE_EVENT });
    mQuery.mockResolvedValueOnce(membersWithNull);
    stubExecNonConsolation();

    const res = await request(makeApp())
      .post("/portal/knockout/1/generate")
      .set("Authorization", "Bearer fake-club-token")
      .send({ draw_method: "seeded" });

    expect(res.status).toBe(200);

    const inserts = r1MatchInserts();
    expect(inserts.length).toBe(2);

    const match0Params = inserts[0]![1] as any[];
    const match1Params = inserts[1]![1] as any[];

    // Match 0: best seed (Eve, 11) vs worst seed (Zara, 10 — null treated as 99)
    expect(match0Params[3]).toBe(11); // Eve — best handicap
    expect(match0Params[4]).toBe(10); // Zara — null → 99

    // Match 1: middle seeds (Frank, 12) vs (Grace, 13)
    expect(match1Params[3]).toBe(12); // Frank
    expect(match1Params[4]).toBe(13); // Grace
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5-real-match consolation bracket (cN=5, cByes=3, cTotalRounds=3)
//
// With cN=5 real R1 matches:
//   ck=3, cSize=8, cByes=3, cTotalRounds=3, cr1Count=4
//   consolation R1 match 0  (m=0) → isConsoBye=true  → exactly 1 loser link
//   consolation R1 match 1  (m=1) → isConsoBye=true  → exactly 1 loser link
//   consolation R1 match 2  (m=2) → isConsoBye=true  → exactly 1 loser link
//   consolation R1 match 3  (m=3) → isConsoBye=false → exactly 2 loser links
//   total loser links = 5 = cN  (no player left without a route)
//
// exec call order (base=1):
//   main  : R1-round(1), R2-round(2), R1m0(11), R1m1(12), R2m0(21)      [5 calls]
//   consol: cR1-round(31), cR2-round(32), cR3-round(33),                 [3 calls]
//           cR1m0(41 bye), cR1m1(42 bye), cR1m2(43 bye), cR1m3(44 real), [4 calls]
//           cR2m0(51), cR2m1(52),                                         [2 calls]
//           cR3m0/final(61)                                               [1 call]
//                                                                  total consolation: 10
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /portal/knockout/:id/generate — 5-real-match consolation bracket (cN=5, cByes=3)", () => {
  function stubExecConsolation5Real(base = 1) {
    mExec
      .mockResolvedValueOnce(base)       // main knockout_rounds round 1
      .mockResolvedValueOnce(base + 1)   // main knockout_rounds round 2
      .mockResolvedValueOnce(base + 10)  // main R1 match 0
      .mockResolvedValueOnce(base + 11)  // main R1 match 1
      .mockResolvedValueOnce(base + 20)  // main R2 match
      .mockResolvedValueOnce(base + 30)  // consolation round 1
      .mockResolvedValueOnce(base + 31)  // consolation round 2
      .mockResolvedValueOnce(base + 32)  // consolation round 3
      .mockResolvedValueOnce(base + 40)  // consolation R1 match 0 — bye slot (m=0)
      .mockResolvedValueOnce(base + 41)  // consolation R1 match 1 — bye slot (m=1)
      .mockResolvedValueOnce(base + 42)  // consolation R1 match 2 — bye slot (m=2)
      .mockResolvedValueOnce(base + 43)  // consolation R1 match 3 — real slot (m=3)
      .mockResolvedValueOnce(base + 50)  // consolation R2 match 0
      .mockResolvedValueOnce(base + 51)  // consolation R2 match 1
      .mockResolvedValueOnce(base + 60); // consolation R3 match (final)
  }

  function stubQueriesConsolation5Real() {
    mQuery.mockResolvedValueOnce([]);           // live-consolation guard → clear
    mQuery.mockResolvedValueOnce(FOUR_MEMBERS); // members (4-player main bracket)
    // r1RealMatches: cN=5 forces cByes=3 in the consolation bracket
    mQuery.mockResolvedValueOnce([
      { id: 101 }, { id: 102 }, { id: 103 }, { id: 104 }, { id: 105 },
    ]);
  }

  it("each bye slot (m=0,1,2) gets exactly one loser_next_match_id link", async () => {
    mRow.mockResolvedValue({ ...BASE_EVENT, consolation_enabled: 1 });
    stubQueriesConsolation5Real();
    stubExecConsolation5Real(1);

    const res = await request(makeApp())
      .post("/portal/knockout/1/generate")
      .set("Authorization", "Bearer fake-club-token")
      .send({ draw_method: "random" });

    expect(res.status).toBe(200);

    // Bye-slot consolation match IDs: base+40=41, base+41=42, base+42=43
    const byeSlotIds = [1 + 40, 1 + 41, 1 + 42]; // [41, 42, 43]
    for (const byeSlotId of byeSlotIds) {
      const linksToSlot = mRun.mock.calls.filter(([sql, params]) =>
        String(sql).includes("loser_next_match_id") &&
        Array.isArray(params) && params[0] === byeSlotId
      );
      expect(linksToSlot.length).toBe(1);
    }
  });

  it("real consolation slot (m=3, m≥cByes) gets exactly two loser_next_match_id links", async () => {
    mRow.mockResolvedValue({ ...BASE_EVENT, consolation_enabled: 1 });
    stubQueriesConsolation5Real();
    stubExecConsolation5Real(1);

    const res = await request(makeApp())
      .post("/portal/knockout/1/generate")
      .set("Authorization", "Bearer fake-club-token")
      .send({ draw_method: "random" });

    expect(res.status).toBe(200);

    // Real-slot consolation match ID: base+43=44
    const realSlotId = 1 + 43; // 44
    const linksToRealSlot = mRun.mock.calls.filter(([sql, params]) =>
      String(sql).includes("loser_next_match_id") &&
      Array.isArray(params) && params[0] === realSlotId
    );

    expect(linksToRealSlot.length).toBe(2);
    // The two losers must land in different slot positions (top vs bottom)
    const positions = linksToRealSlot.map(([sql]) => {
      if (String(sql).includes("'top'"))    return "top";
      if (String(sql).includes("'bottom'")) return "bottom";
      return "unknown";
    });
    expect(positions).toContain("top");
    expect(positions).toContain("bottom");
  });

  it("total loser links equals cN=5 and all 5 r1 match IDs appear exactly once", async () => {
    mRow.mockResolvedValue({ ...BASE_EVENT, consolation_enabled: 1 });
    stubQueriesConsolation5Real();
    stubExecConsolation5Real(1);

    const res = await request(makeApp())
      .post("/portal/knockout/1/generate")
      .set("Authorization", "Bearer fake-club-token")
      .send({ draw_method: "random" });

    expect(res.status).toBe(200);

    const allLoserLinks = mRun.mock.calls.filter(([sql]) =>
      String(sql).includes("loser_next_match_id")
    );

    // cN=5 → every R1 loser must have exactly one route into consolation
    expect(allLoserLinks.length).toBe(5);

    // Each of the 5 real R1 matches (IDs 101–105) must appear as a target
    // exactly once — no match is linked twice, no match is skipped
    const targetMatchIds = allLoserLinks.map(([_sql, params]) =>
      Array.isArray(params) ? params[1] : null
    );
    expect(targetMatchIds).toContain(101);
    expect(targetMatchIds).toContain(102);
    expect(targetMatchIds).toContain(103);
    expect(targetMatchIds).toContain(104);
    expect(targetMatchIds).toContain(105);
    expect(new Set(targetMatchIds).size).toBe(5); // no duplicate links
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bye-heavy consolation bracket (cByes > 0)
//
// With cN=3 real R1 matches:
//   ck=2, cSize=4, cByes=1, cTotalRounds=2, cr1Count=2
//   consolation R1 match 0  → isConsoBye=true  → exactly 1 loser link
//   consolation R1 match 1  → isConsoBye=false → exactly 2 loser links
//   total loser links = 3 = cN  (no player left without a route)
//
// exec call order (base=1):
//   main  : R1-round(1), R2-round(2), R1m0(11), R1m1(12), R2m0(20)
//   consol: cR1-round(30), cR2-round(31), cR1m0(40 bye), cR1m1(41 real), cR2m0(50)
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /portal/knockout/:id/generate — bye-heavy consolation bracket (cByes > 0)", () => {
  function stubExecConsolation3Real(base = 1) {
    mExec
      .mockResolvedValueOnce(base)       // main knockout_rounds round 1
      .mockResolvedValueOnce(base + 1)   // main knockout_rounds round 2
      .mockResolvedValueOnce(base + 10)  // main R1 match 0
      .mockResolvedValueOnce(base + 11)  // main R1 match 1
      .mockResolvedValueOnce(base + 20)  // main R2 match
      .mockResolvedValueOnce(base + 30)  // consolation round 1
      .mockResolvedValueOnce(base + 31)  // consolation round 2
      .mockResolvedValueOnce(base + 40)  // consolation R1 match 0 — bye slot
      .mockResolvedValueOnce(base + 41)  // consolation R1 match 1 — real slot
      .mockResolvedValueOnce(base + 50); // consolation R2 match (final)
  }

  function stubQueriesConsolation3Real() {
    mQuery.mockResolvedValueOnce([]);           // live-consolation guard → clear
    mQuery.mockResolvedValueOnce(FOUR_MEMBERS); // members (4-player main bracket)
    // r1RealMatches: cN=3 forces cByes=1 in the consolation bracket
    mQuery.mockResolvedValueOnce([{ id: 11 }, { id: 12 }, { id: 13 }]);
  }

  it("bye slot (m=0) gets exactly one loser_next_match_id link when cByes=1", async () => {
    mRow.mockResolvedValue({ ...BASE_EVENT, consolation_enabled: 1 });
    stubQueriesConsolation3Real();
    stubExecConsolation3Real(1);

    const res = await request(makeApp())
      .post("/portal/knockout/1/generate")
      .set("Authorization", "Bearer fake-club-token")
      .send({ draw_method: "random" });

    expect(res.status).toBe(200);

    // Bye-slot consolation match has ID = base + 40 = 41.
    // loser_next_match_id UPDATE: params are [consolMatchId, r1MatchId]
    const byeSlotId = 1 + 40; // 41
    const linksToByeSlot = mRun.mock.calls.filter(([sql, params]) =>
      String(sql).includes("loser_next_match_id") &&
      Array.isArray(params) && params[0] === byeSlotId
    );

    expect(linksToByeSlot.length).toBe(1);
  });

  it("real consolation slot (m≥cByes) gets exactly two loser_next_match_id links", async () => {
    mRow.mockResolvedValue({ ...BASE_EVENT, consolation_enabled: 1 });
    stubQueriesConsolation3Real();
    stubExecConsolation3Real(1);

    const res = await request(makeApp())
      .post("/portal/knockout/1/generate")
      .set("Authorization", "Bearer fake-club-token")
      .send({ draw_method: "random" });

    expect(res.status).toBe(200);

    // Real-slot consolation match has ID = base + 41 = 42.
    const realSlotId = 1 + 41; // 42
    const linksToRealSlot = mRun.mock.calls.filter(([sql, params]) =>
      String(sql).includes("loser_next_match_id") &&
      Array.isArray(params) && params[0] === realSlotId
    );

    expect(linksToRealSlot.length).toBe(2);
    // The two losers must land in different slot positions (top vs bottom)
    const positions = linksToRealSlot.map(([sql]) => {
      if (String(sql).includes("'top'"))    return "top";
      if (String(sql).includes("'bottom'")) return "bottom";
      return "unknown";
    });
    expect(positions).toContain("top");
    expect(positions).toContain("bottom");
  });

  it("total loser links equals cN (no player left without a consolation route)", async () => {
    mRow.mockResolvedValue({ ...BASE_EVENT, consolation_enabled: 1 });
    stubQueriesConsolation3Real();
    stubExecConsolation3Real(1);

    const res = await request(makeApp())
      .post("/portal/knockout/1/generate")
      .set("Authorization", "Bearer fake-club-token")
      .send({ draw_method: "random" });

    expect(res.status).toBe(200);

    const allLoserLinks = mRun.mock.calls.filter(([sql]) =>
      String(sql).includes("loser_next_match_id")
    );

    // cN=3 → every R1 loser must have exactly one route into consolation
    expect(allLoserLinks.length).toBe(3);

    // Each of the 3 real R1 matches (IDs 11, 12, 13) must appear as a target
    // exactly once — no match is linked twice, no match is skipped
    const targetMatchIds = allLoserLinks.map(([_sql, params]) =>
      Array.isArray(params) ? params[1] : null
    );
    expect(targetMatchIds).toContain(11);
    expect(targetMatchIds).toContain(12);
    expect(targetMatchIds).toContain(13);
    expect(new Set(targetMatchIds).size).toBe(3); // no duplicate links
  });
});
