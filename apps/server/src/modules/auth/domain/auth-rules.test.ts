import { describe, expect, it } from "vitest";
import { normalizeUsername, validateNewPassword, validateUsername } from "./credentials.ts";
import {
  decideLoginAttempt,
  LOCKOUT_MS,
  MAX_FAILED_ATTEMPTS,
  QUIET_PERIOD_MS,
  quietPeriodOver,
} from "./login-throttle.ts";
import { isExpired, renewedExpiry, sessionExpiry, SESSION_LIFETIME_MS } from "./session-lifetime.ts";

const DAY = 24 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;
const t0 = new Date("2026-03-01T10:00:00.000Z");
const at = (ms: number) => new Date(t0.getTime() + ms);

describe("usernames", () => {
  it("are compared lowercase and trimmed", () => {
    expect(normalizeUsername("  Sam ")).toBe("sam");
    expect(validateUsername("Sam.Smith_2")).toEqual({ ok: true, value: "sam.smith_2" });
  });

  it.each(["a", "x".repeat(33), "sam smith", "sam@home", "", "émile"])("refuses %j", (name) => {
    expect(validateUsername(name)).toEqual({ ok: false, error: "invalid-username" });
  });

  it("accepts 2 and 32 characters", () => {
    expect(validateUsername("ab").ok).toBe(true);
    expect(validateUsername("x".repeat(32)).ok).toBe(true);
  });
});

describe("new passwords", () => {
  it("need at least 10 characters, counted as characters not bytes", () => {
    expect(validateNewPassword("123456789").ok).toBe(false);
    expect(validateNewPassword("1234567890").ok).toBe(true);
    expect(validateNewPassword("🔑🔑🔑🔑🔑🔑🔑🔑🔑").ok).toBe(false);
  });

  it("have no other rules", () => {
    expect(validateNewPassword("aaaaaaaaaa").ok).toBe(true);
  });
});

describe("session lifetime", () => {
  it("lasts 90 days", () => {
    expect(sessionExpiry(t0).getTime() - t0.getTime()).toBe(90 * DAY);
  });

  it("is expired at and after its expiry, not before", () => {
    const expiresAt = sessionExpiry(t0);
    expect(isExpired(expiresAt, at(SESSION_LIFETIME_MS - 1))).toBe(false);
    expect(isExpired(expiresAt, at(SESSION_LIFETIME_MS))).toBe(true);
  });

  it("renews at most once a day", () => {
    const expiresAt = sessionExpiry(t0);
    expect(renewedExpiry(expiresAt, at(DAY - 1))).toBeNull();
    expect(renewedExpiry(expiresAt, at(DAY))).toEqual(sessionExpiry(at(DAY)));
    expect(renewedExpiry(expiresAt, at(80 * DAY))).toEqual(sessionExpiry(at(80 * DAY)));
  });
});

describe("login throttling", () => {
  const failures = (count: number, spacingMs: number) =>
    Array.from({ length: count }, (_, i) => at(i * spacingMs));

  it("allows the first five attempts", () => {
    expect(decideLoginAttempt(failures(MAX_FAILED_ATTEMPTS - 1, MINUTE), at(5 * MINUTE))).toEqual({
      allowed: true,
    });
  });

  it("after five failures, locks for 15 minutes from the latest one", () => {
    const five = failures(5, MINUTE); // at 0, 1, 2, 3, 4 minutes
    expect(decideLoginAttempt(five, at(5 * MINUTE))).toEqual({ allowed: false, retryAfterMs: 14 * MINUTE });
    expect(decideLoginAttempt(five, at(4 * MINUTE + LOCKOUT_MS - 1))).toMatchObject({ allowed: false });
    expect(decideLoginAttempt(five, at(4 * MINUTE + LOCKOUT_MS))).toEqual({ allowed: true });
  });

  it("waits the full 15 minutes however spread out the five failures were", () => {
    const spread = failures(5, 60 * MINUTE); // the latest at 4 hours
    expect(decideLoginAttempt(spread, at(4 * 60 * MINUTE))).toEqual({
      allowed: false,
      retryAfterMs: LOCKOUT_MS,
    });
  });

  it("each failure after the fifth costs another full 15 minutes", () => {
    const six = [...failures(5, MINUTE), at(4 * MINUTE + LOCKOUT_MS)];
    expect(decideLoginAttempt(six, at(4 * MINUTE + LOCKOUT_MS))).toEqual({
      allowed: false,
      retryAfterMs: LOCKOUT_MS,
    });
  });
});

describe("quiet period", () => {
  it("is over 24 hours after the latest failure, not before", () => {
    const failures = [at(0), at(MINUTE)];
    expect(quietPeriodOver(failures, at(MINUTE + QUIET_PERIOD_MS - 1))).toBe(false);
    expect(quietPeriodOver(failures, at(MINUTE + QUIET_PERIOD_MS))).toBe(true);
  });

  it("is never over with no failures", () => {
    expect(quietPeriodOver([], at(0))).toBe(false);
  });
});
