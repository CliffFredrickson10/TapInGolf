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

vi.mock("../lib/notifications", () => ({ sendPushNotifications: vi.fn() }));

import eventsRouter from "./events";
import { query } from "../lib/pg";
import { getUser } from "../lib/auth";

const SUPER = { id: 1, name: "Marco", email: "marco@tapingolf.co.za", is_super_user: 1, role: "golfer", club_id: null };
const CLUB_ADMIN = { id: 2, name: "Club Admin", email: "ca@club.co.za", is_super_user: 0, role: "club_admin", club_id: 9 };
const GOLFER = { id: 3, name: "Golfer", email: "g@x.co.za", is_super_user: 0, role: "golfer", club_id: null };

function makeApp(): Express {
  const app = express();
  app.use(express.json());
  app.use("/", eventsRouter);
  return app;
}

const mGetUser = vi.mocked(getUser);
const mQuery = vi.mocked(query);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /admin/events — club-scoped staff endpoint", () => {
  it("returns 403 for an ordinary golfer", async () => {
    mGetUser.mockResolvedValue(GOLFER);
    const res = await request(makeApp()).get("/admin/events");
    expect(res.status).toBe(403);
  });

  it("requires a super-user to supply an explicit club_id (400 without one)", async () => {
    mGetUser.mockResolvedValue(SUPER);
    const res = await request(makeApp()).get("/admin/events");
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/club_id/i);
    expect(mQuery).not.toHaveBeenCalled();
  });

  it("scopes to the supplied club_id for a super-user", async () => {
    mGetUser.mockResolvedValue(SUPER);
    mQuery.mockResolvedValue([]);
    const res = await request(makeApp()).get("/admin/events?club_id=42");
    expect(res.status).toBe(200);
    // The query is parameterised on the requested club id.
    const call = mQuery.mock.calls.find(([sql]) => /FROM golf_events/i.test(String(sql)));
    expect(call?.[1]).toContain(42);
  });

  it("pins a club_admin to their own club without needing a club_id param", async () => {
    mGetUser.mockResolvedValue(CLUB_ADMIN);
    mQuery.mockResolvedValue([]);
    const res = await request(makeApp()).get("/admin/events");
    expect(res.status).toBe(200);
    const call = mQuery.mock.calls.find(([sql]) => /FROM golf_events/i.test(String(sql)));
    expect(call?.[1]).toContain(9);
  });
});
