import { describe, it, expect } from "vitest";
import { isSuper, isStaff, isPlatform, effectiveClubId, generateToken, verifyToken } from "./auth";

const superUser = { id: 1, role: "golfer", club_id: null, is_super_user: 1 };
const superUserBool = { id: 2, role: "golfer", club_id: null, is_super_user: true };
const clubAdmin = { id: 3, role: "club_admin", club_id: 42, is_super_user: 0 };
const platformAdmin = { id: 4, role: "club_admin", club_id: null, is_super_user: 0 };
const golfer = { id: 5, role: "golfer", club_id: null, is_super_user: 0 };

describe("isSuper", () => {
  it("accepts is_super_user as 1 or true", () => {
    expect(isSuper(superUser)).toBe(true);
    expect(isSuper(superUserBool)).toBe(true);
  });
  it("rejects non-super and falsy users", () => {
    expect(isSuper(clubAdmin)).toBe(false);
    expect(isSuper(golfer)).toBe(false);
    expect(isSuper(null)).toBe(false);
    expect(isSuper(undefined)).toBe(false);
  });
});

describe("isStaff", () => {
  it("accepts club_admin and super-users", () => {
    expect(isStaff(clubAdmin)).toBe(true);
    expect(isStaff(platformAdmin)).toBe(true);
    expect(isStaff(superUser)).toBe(true);
  });
  it("rejects ordinary golfers and falsy users", () => {
    expect(isStaff(golfer)).toBe(false);
    expect(isStaff(null)).toBe(false);
  });
});

describe("isPlatform", () => {
  it("accepts super-users and club_admins with no club", () => {
    expect(isPlatform(superUser)).toBe(true);
    expect(isPlatform(platformAdmin)).toBe(true);
  });
  it("rejects a club-pinned club_admin and ordinary golfers", () => {
    expect(isPlatform(clubAdmin)).toBe(false);
    expect(isPlatform(golfer)).toBe(false);
  });
});

describe("effectiveClubId", () => {
  it("pins a club_admin to their own club, ignoring the requested id", () => {
    expect(effectiveClubId(clubAdmin, undefined)).toBe(42);
    expect(effectiveClubId(clubAdmin, "999")).toBe(42);
  });
  it("requires a super-user to supply an explicit club_id", () => {
    expect(effectiveClubId(superUser, undefined)).toBeNull();
    expect(effectiveClubId(superUser, null)).toBeNull();
    expect(effectiveClubId(superUser, "")).toBeNull();
    expect(effectiveClubId(superUser, "abc")).toBeNull();
  });
  it("uses the requested club_id for a platform user when valid", () => {
    expect(effectiveClubId(platformAdmin, "7")).toBe(7);
    expect(effectiveClubId(superUser, 13)).toBe(13);
  });
});

describe("token round-trip", () => {
  it("generates a token that verifies back to the user id", () => {
    const token = generateToken(123);
    expect(verifyToken(token)).toBe(123);
  });
  it("rejects a tampered token", () => {
    const token = generateToken(123);
    const [payload, sig] = token.split(".");
    // Flip the first hex char of the signature, keeping the same length so the
    // HMAC comparison (not a length guard) is what rejects it.
    const flipped = (sig[0] === "a" ? "b" : "a") + sig.slice(1);
    expect(verifyToken(`${payload}.${flipped}`)).toBeNull();
    expect(verifyToken("not-a-token")).toBeNull();
  });
});
