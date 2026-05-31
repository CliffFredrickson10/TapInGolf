import { describe, it, expect, beforeEach, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";

// ── Mocks ────────────────────────────────────────────────────────────────────
// pg layer: in-memory query/row/exec controlled per-test.
vi.mock("../lib/pg", () => ({
  query: vi.fn(),
  row: vi.fn(),
  exec: vi.fn(),
}));

// auth: keep the real pure helpers (isSuper etc.); only stub getUser so we can
// inject the calling user without a real token / DB.
vi.mock("../lib/auth", async () => {
  const actual = await vi.importActual<typeof import("../lib/auth")>("../lib/auth");
  return { ...actual, getUser: vi.fn() };
});

// notifications: never hit Expo push during tests.
vi.mock("../lib/notifications", () => ({ sendPushNotifications: vi.fn() }));

import hnaRouter from "./hnaVerification";
import { query, row, exec } from "../lib/pg";
import { getUser } from "../lib/auth";
import { sendPushNotifications } from "../lib/notifications";

const SUPER = { id: 1, name: "Marco", email: "marco@tapingolf.co.za", is_super_user: 1, role: "golfer", club_id: null };
const CLUB_ADMIN = { id: 2, name: "Club Admin", email: "ca@club.co.za", is_super_user: 0, role: "club_admin", club_id: 9 };
const GOLFER = { id: 3, name: "Golfer", email: "g@x.co.za", is_super_user: 0, role: "golfer", club_id: null };

function makeApp(): Express {
  const app = express();
  app.use(express.json());
  app.use("/", hnaRouter);
  return app;
}

const mGetUser = vi.mocked(getUser);
const mRow = vi.mocked(row);
const mQuery = vi.mocked(query);
const mExec = vi.mocked(exec);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("authorization gating (super-user only)", () => {
  const endpoints: Array<[string, "get" | "post"]> = [
    ["/admin/hna-verifications", "get"],
    ["/admin/hna-verifications/1", "get"],
    ["/admin/hna-verifications/1/approve", "post"],
    ["/admin/hna-verifications/1/reject", "post"],
  ];

  for (const [path, method] of endpoints) {
    it(`returns 403 for a club_admin on ${method.toUpperCase()} ${path}`, async () => {
      mGetUser.mockResolvedValue(CLUB_ADMIN);
      const res = await request(makeApp())[method](path).send({});
      expect(res.status).toBe(403);
    });

    it(`returns 403 for an ordinary golfer on ${method.toUpperCase()} ${path}`, async () => {
      mGetUser.mockResolvedValue(GOLFER);
      const res = await request(makeApp())[method](path).send({});
      expect(res.status).toBe(403);
    });

    it(`returns 403 for an unauthenticated request on ${method.toUpperCase()} ${path}`, async () => {
      mGetUser.mockResolvedValue(null);
      const res = await request(makeApp())[method](path).send({});
      expect(res.status).toBe(403);
    });
  }
});

describe("GET /admin/hna-verifications (list)", () => {
  it("lets a super-user list pending verifications", async () => {
    mGetUser.mockResolvedValue(SUPER);
    mQuery.mockResolvedValue([
      { id: 10, user_id: 3, hna_number: "1234567890", status: "pending" },
    ]);
    const res = await request(makeApp()).get("/admin/hna-verifications?status=pending");
    expect(res.status).toBe(200);
    expect(res.body.verifications).toHaveLength(1);
    expect(res.body.verifications[0].id).toBe(10);
  });

  it("rejects an invalid status filter with 400", async () => {
    mGetUser.mockResolvedValue(SUPER);
    const res = await request(makeApp()).get("/admin/hna-verifications?status=bogus");
    expect(res.status).toBe(400);
    expect(mQuery).not.toHaveBeenCalled();
  });
});

describe("GET /admin/hna-verifications/:id (detail)", () => {
  it("returns the card detail for a super-user", async () => {
    mGetUser.mockResolvedValue(SUPER);
    mRow.mockResolvedValue({ id: 10, user_id: 3, hna_number: "1234567890", card_image: "data:image/png;base64,xx", status: "pending" });
    const res = await request(makeApp()).get("/admin/hna-verifications/10");
    expect(res.status).toBe(200);
    expect(res.body.verification.id).toBe(10);
  });

  it("returns 404 when the verification does not exist", async () => {
    mGetUser.mockResolvedValue(SUPER);
    mRow.mockResolvedValue(null);
    const res = await request(makeApp()).get("/admin/hna-verifications/999");
    expect(res.status).toBe(404);
  });
});

describe("POST /admin/hna-verifications/:id/approve", () => {
  it("approves and locks the HNA number onto the golfer's profile", async () => {
    mGetUser.mockResolvedValue(SUPER);
    // 1st row(): the verification being approved; 2nd row(): target push_token lookup.
    mRow
      .mockResolvedValueOnce({ id: 10, user_id: 3, hna_number: "1234567890", status: "pending" })
      .mockResolvedValueOnce({ push_token: null });
    mExec.mockResolvedValue(1);

    const res = await request(makeApp()).post("/admin/hna-verifications/10/approve").send({});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, status: "approved" });

    // The golfer's users.hna_number is set from the approved verification's number.
    const userUpdate = mExec.mock.calls.find(
      ([sql]) => /UPDATE users SET hna_number/i.test(String(sql)),
    );
    expect(userUpdate).toBeDefined();
    expect(userUpdate?.[1]).toEqual(["1234567890", 3]);
  });

  it("accepts an optional valid_until and rejects a malformed one", async () => {
    mGetUser.mockResolvedValue(SUPER);
    mRow
      .mockResolvedValue({ id: 10, user_id: 3, hna_number: "1234567890", status: "pending" });
    mExec.mockResolvedValue(1);

    const bad = await request(makeApp()).post("/admin/hna-verifications/10/approve").send({ valid_until: "31-12-2026" });
    expect(bad.status).toBe(400);
  });

  it("returns 404 when the verification is missing", async () => {
    mGetUser.mockResolvedValue(SUPER);
    mRow.mockResolvedValue(null);
    const res = await request(makeApp()).post("/admin/hna-verifications/999/approve").send({});
    expect(res.status).toBe(404);
  });

  it("pushes a notification when the golfer has a push token", async () => {
    mGetUser.mockResolvedValue(SUPER);
    mRow
      .mockResolvedValueOnce({ id: 10, user_id: 3, hna_number: "1234567890", status: "pending" })
      .mockResolvedValueOnce({ push_token: "ExponentPushToken[xxx]" });
    mExec.mockResolvedValue(1);

    const res = await request(makeApp()).post("/admin/hna-verifications/10/approve").send({});
    expect(res.status).toBe(200);
    expect(sendPushNotifications).toHaveBeenCalledTimes(1);
  });
});

describe("POST /admin/hna-verifications/:id/reject", () => {
  it("requires a note", async () => {
    mGetUser.mockResolvedValue(SUPER);
    mRow.mockResolvedValue({ id: 10, user_id: 3, status: "pending" });

    const res = await request(makeApp()).post("/admin/hna-verifications/10/reject").send({});
    expect(res.status).toBe(400);
    // No status update should have happened.
    expect(mExec).not.toHaveBeenCalled();
  });

  it("rejects a whitespace-only note", async () => {
    mGetUser.mockResolvedValue(SUPER);
    mRow.mockResolvedValue({ id: 10, user_id: 3, status: "pending" });

    const res = await request(makeApp()).post("/admin/hna-verifications/10/reject").send({ note: "   " });
    expect(res.status).toBe(400);
  });

  it("rejects with a note and stores it", async () => {
    mGetUser.mockResolvedValue(SUPER);
    mRow
      .mockResolvedValueOnce({ id: 10, user_id: 3, status: "pending" })
      .mockResolvedValueOnce({ push_token: null });
    mExec.mockResolvedValue(1);

    const res = await request(makeApp())
      .post("/admin/hna-verifications/10/reject")
      .send({ note: "Card image unclear" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, status: "rejected" });

    const update = mExec.mock.calls.find(([sql]) => /UPDATE hna_verifications/i.test(String(sql)));
    expect(update).toBeDefined();
    expect(String(update?.[1]?.[0])).toBe("Card image unclear");
  });

  it("returns 404 when the verification is missing", async () => {
    mGetUser.mockResolvedValue(SUPER);
    mRow.mockResolvedValue(null);
    const res = await request(makeApp()).post("/admin/hna-verifications/999/reject").send({ note: "x" });
    expect(res.status).toBe(404);
  });
});
