import { describe, it, expect, beforeEach, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";

vi.mock("../lib/pg", () => ({
  query: vi.fn(),
  row: vi.fn(),
  exec: vi.fn(),
  run: vi.fn(),
}));

vi.mock("../lib/auth", async () => {
  const actual = await vi.importActual<typeof import("../lib/auth")>("../lib/auth");
  return { ...actual, getUser: vi.fn() };
});

vi.mock("../lib/portalAuth", () => ({
  requireClubAuth: vi.fn((_req: any, _res: any, next: any) => next()),
  getClub: vi.fn(() => ({ id: 9, name: "Test Club" })),
}));

vi.mock("../lib/notifications", () => ({ sendPushNotifications: vi.fn() }));

vi.mock("../lib/userNotifications", () => ({ saveUserNotification: vi.fn() }));

import knockoutRouter from "./knockout";
import { query, row, run } from "../lib/pg";
import { getUser } from "../lib/auth";
import { saveUserNotification } from "../lib/userNotifications";

function makeApp(): Express {
  const app = express();
  app.use(express.json());
  app.use("/", knockoutRouter);
  return app;
}

const mRow    = vi.mocked(row);
const mRun    = vi.mocked(run);
const mQuery  = vi.mocked(query);
const mSave   = vi.mocked(saveUserNotification);
const mGetUser = vi.mocked(getUser);

beforeEach(() => {
  vi.clearAllMocks();
  mRun.mockResolvedValue(undefined as any);
  mSave.mockResolvedValue(undefined as any);
});

const EVENT = { id: 1, club_id: 9, format: "knockout_individual", name: "Test Open" };

const MAIN_MATCH = {
  id: 5, event_id: 1, round_id: 10,
  player1_id: 1, player2_id: 2,
  player1_name: "Alice", player2_name: "Bob",
  p1_token: null, p2_token: null,
  status: "in_progress", winner_id: null,
  player1_result: null, player2_result: null,
  dispute: false, score: null,
  next_match_id: null,
  loser_next_match_id: 20, loser_slot_position: "bottom",
  slot_position: "top",
  round_label: "Quarter-Finals", round_deadline: null,
};

const PLATE_MATCH_BOTH = {
  id: 20, event_id: 1, round_id: 11,
  player1_id: 3, player2_id: 2,
  player1_name: "Carol", player2_name: "Bob",
  p1_token: null, p2_token: null,
  status: "pending", notification_sent_at: null,
  round_label: "Plate Flight R1", round_deadline: null,
  next_match_id: null, loser_next_match_id: null,
};

const PLATE_MATCH_NOTIFIED = {
  ...PLATE_MATCH_BOTH,
  notification_sent_at: new Date("2026-06-30T10:00:00Z"),
};

// ── Portal PUT /portal/knockout/:id/matches/:matchId ──────────────────────────
// Row call sequence for this route:
//   1. event auth check
//   2. main match fetch
//   3. consolation outer fetch (after setting loser slot)
//   4. consolation inner re-fetch (notification guard check)
//   5. event name for notification  ← only when notification_sent_at is null
//   6. autoAdvanceIfUnopposed consolation match
//
// When notification_sent_at is already set, step 5 is skipped and only 5 rows fire.

describe("Portal route — Plate Flight notification guard", () => {
  it("sends Plate Flight notifications to both players on first seeding", async () => {
    mRow
      .mockResolvedValueOnce(EVENT)            // 1. event
      .mockResolvedValueOnce(MAIN_MATCH)       // 2. main match
      .mockResolvedValueOnce(PLATE_MATCH_BOTH) // 3. consolation outer
      .mockResolvedValueOnce(PLATE_MATCH_BOTH) // 4. consolation inner (notif_sent_at: null → fires)
      .mockResolvedValueOnce(EVENT)            // 5. plateEv name
      .mockResolvedValueOnce(PLATE_MATCH_BOTH);// 6. autoAdvanceIfUnopposed (both players → noop)
    mQuery.mockResolvedValue([{ status: "complete" }]);

    const res = await request(makeApp())
      .put("/portal/knockout/1/matches/5")
      .send({ winner_id: 1, score: "2&1" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    expect(mSave).toHaveBeenCalledTimes(2);
    expect(mSave).toHaveBeenCalledWith(
      3, "knockout_next_match",
      expect.stringContaining("Plate Flight"),
      expect.stringContaining("Bob"),
      expect.objectContaining({ matchId: 20 }),
    );
    expect(mSave).toHaveBeenCalledWith(
      2, "knockout_next_match",
      expect.stringContaining("Plate Flight"),
      expect.stringContaining("Carol"),
      expect.objectContaining({ matchId: 20 }),
    );

    const notifRun = mRun.mock.calls.find(([sql]) =>
      /notification_sent_at/i.test(String(sql))
    );
    expect(notifRun).toBeDefined();
  });

  it("does not resend notifications when notification_sent_at is already set (re-seeding guard)", async () => {
    mRow
      .mockResolvedValueOnce(EVENT)               // 1. event
      .mockResolvedValueOnce(MAIN_MATCH)          // 2. main match
      .mockResolvedValueOnce(PLATE_MATCH_BOTH)    // 3. consolation outer
      .mockResolvedValueOnce(PLATE_MATCH_NOTIFIED)// 4. consolation inner (notif_sent_at set → skipped)
      .mockResolvedValueOnce(PLATE_MATCH_BOTH);   // 5. autoAdvanceIfUnopposed (both players → noop)
    mQuery.mockResolvedValue([{ status: "complete" }]);

    const res = await request(makeApp())
      .put("/portal/knockout/1/matches/5")
      .send({ winner_id: 1, score: "2&1" });

    expect(res.status).toBe(200);
    expect(mSave).not.toHaveBeenCalled();
  });
});

// ── User POST /events/:id/knockout/matches/:matchId/result ────────────────────
// Row call sequence (player1 submits "won", player2 already submitted "lost"):
//   1. event fetch
//   2. main match fetch
//   3. consolation outer fetch (after setting loser slot)
//   4. consolation inner re-fetch (notification guard check)
//   5. autoAdvanceIfUnopposed consolation match
//
// The user route reuses `ev` (step 1) for the notification title — no extra event fetch.

describe("User result route — Plate Flight notification guard", () => {
  const USER_P1 = {
    id: 1, name: "Alice", email: "alice@x.co.za",
    is_super_user: 0, role: "golfer", club_id: null, token: "tok",
  };

  const MAIN_MATCH_AWAITING = {
    ...MAIN_MATCH,
    player1_result: null,
    player2_result: "lost",
  };

  it("sends Plate Flight notifications to both players on first seeding", async () => {
    mGetUser.mockResolvedValue(USER_P1);
    mRow
      .mockResolvedValueOnce(EVENT)            // 1. event
      .mockResolvedValueOnce(MAIN_MATCH_AWAITING) // 2. match
      .mockResolvedValueOnce(PLATE_MATCH_BOTH) // 3. consolation outer
      .mockResolvedValueOnce(PLATE_MATCH_BOTH) // 4. consolation inner (notif_sent_at: null → fires)
      .mockResolvedValueOnce(PLATE_MATCH_BOTH);// 5. autoAdvanceIfUnopposed (both → noop)
    mQuery.mockResolvedValue([{ status: "complete" }]);

    const res = await request(makeApp())
      .post("/events/1/knockout/matches/5/result")
      .send({ result: "won" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    expect(mSave).toHaveBeenCalledTimes(2);
    expect(mSave).toHaveBeenCalledWith(
      3, "knockout_next_match",
      expect.stringContaining("Plate Flight"),
      expect.stringContaining("Bob"),
      expect.objectContaining({ matchId: 20 }),
    );
    expect(mSave).toHaveBeenCalledWith(
      2, "knockout_next_match",
      expect.stringContaining("Plate Flight"),
      expect.stringContaining("Carol"),
      expect.objectContaining({ matchId: 20 }),
    );
  });

  it("does not resend notifications when notification_sent_at is already set (re-seeding guard)", async () => {
    mGetUser.mockResolvedValue(USER_P1);
    mRow
      .mockResolvedValueOnce(EVENT)               // 1. event
      .mockResolvedValueOnce(MAIN_MATCH_AWAITING) // 2. match
      .mockResolvedValueOnce(PLATE_MATCH_BOTH)    // 3. consolation outer
      .mockResolvedValueOnce(PLATE_MATCH_NOTIFIED)// 4. consolation inner (notif_sent_at set → skipped)
      .mockResolvedValueOnce(PLATE_MATCH_BOTH);   // 5. autoAdvanceIfUnopposed (both → noop)
    mQuery.mockResolvedValue([{ status: "complete" }]);

    const res = await request(makeApp())
      .post("/events/1/knockout/matches/5/result")
      .send({ result: "won" });

    expect(res.status).toBe(200);
    expect(mSave).not.toHaveBeenCalled();
  });
});
