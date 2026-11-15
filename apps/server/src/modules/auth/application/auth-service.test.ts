// Use-case tests (SPEC.md §3.5): real SQLite in memory, fake hasher and clock.
import { FakeClock } from "@snaptrack/core/testing";
import { beforeEach, describe, expect, it } from "vitest";
import { toDrizzle, type Sqlite } from "../../../platform/db/connection.ts";
import { SqliteTransaction } from "../../../platform/db/sqlite-transaction.ts";
import { createTestDatabase } from "../../../platform/db/testing/test-database.ts";
import { HmacSessionTokens } from "../adapters/hmac-session-tokens.ts";
import { InMemoryLoginAttempts } from "../adapters/in-memory-login-attempts.ts";
import { SqliteSessionRepository, SqliteUserRepository } from "../adapters/sqlite-repositories.ts";
import { FakePasswordHasher } from "../testing/fake-password-hasher.ts";
import { createAuthService, type AuthService } from "./auth-service.ts";

const DAY = 24 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;
const PASSWORD = "correct horse battery";

let sqlite: Sqlite;
let clock: FakeClock;
let auth: AuthService;

beforeEach(async () => {
  sqlite = createTestDatabase();
  clock = new FakeClock();
  const db = toDrizzle(sqlite);
  auth = createAuthService({
    users: new SqliteUserRepository(db, clock),
    sessions: new SqliteSessionRepository(db, clock),
    hasher: new FakePasswordHasher(),
    tokens: new HmacSessionTokens("secret-secret-secret-secret-secret"),
    attempts: new InMemoryLoginAttempts(),
    clock,
    transaction: new SqliteTransaction(sqlite),
  });
  await auth.createUser({ username: "Sam", displayName: "Sam Smith", password: PASSWORD });
});

const sessionCount = () => (sqlite.prepare("select count(*) as n from sessions").get() as { n: number }).n;

async function loginToken(username = "sam", password = PASSWORD): Promise<string> {
  const result = await auth.login({ username, password });
  if (!result.ok) throw new Error(`login failed: ${result.error.kind}`);
  return result.value.token;
}

describe("createUser", () => {
  it("stores the username lowercase and refuses the same name in another case", async () => {
    expect(await auth.createUser({ username: "SAM", displayName: "Other", password: PASSWORD })).toEqual({
      ok: false,
      error: "username-taken",
    });
  });

  it("refuses bad usernames, display names and passwords", async () => {
    const base = { username: "alex", displayName: "Alex", password: PASSWORD };
    expect((await auth.createUser({ ...base, username: "a" })).ok).toBe(false);
    expect(await auth.createUser({ ...base, displayName: "  " })).toEqual({
      ok: false,
      error: "display-name-invalid",
    });
    expect(await auth.createUser({ ...base, password: "short" })).toEqual({
      ok: false,
      error: "password-too-short",
    });
  });

  it("never stores the password itself", () => {
    const row = sqlite.prepare("select password_hash from users").get() as { password_hash: string };
    expect(row.password_hash).not.toBe(PASSWORD);
  });
});

describe("login", () => {
  it("returns the user and a session, whatever case the username is typed in", async () => {
    const result = await auth.login({ username: " SAM ", password: PASSWORD });
    expect(result.ok && result.value.user).toMatchObject({ username: "sam", displayName: "Sam Smith" });
    expect(result.ok && result.value.expiresAt.getTime() - clock.now().getTime()).toBe(90 * DAY);
    expect(sessionCount()).toBe(1);
  });

  it("gives the same answer for a wrong password and an unknown user", async () => {
    expect(await auth.login({ username: "sam", password: "wrong password" })).toEqual({
      ok: false,
      error: { kind: "invalid-credentials" },
    });
    expect(await auth.login({ username: "nobody", password: PASSWORD })).toEqual({
      ok: false,
      error: { kind: "invalid-credentials" },
    });
    expect(sessionCount()).toBe(0);
  });

  it("stores only a keyed hash of the token", async () => {
    const token = await loginToken();
    const row = sqlite.prepare("select id from sessions").get() as { id: string };
    expect(row.id).not.toBe(token);
  });

  it("refuses a 6th attempt after 5 failures, even with the right password, then allows it later", async () => {
    for (let i = 0; i < 5; i++) {
      await auth.login({ username: "sam", password: "wrong password" });
      clock.advance(MINUTE);
    }
    // The latest failure was a minute ago, so 14 of the 15 minutes remain.
    const refused = await auth.login({ username: "sam", password: PASSWORD });
    expect(refused).toEqual({ ok: false, error: { kind: "too-many-attempts", retryAfterMs: 14 * MINUTE } });
    clock.advance(14 * MINUTE);
    expect((await auth.login({ username: "sam", password: PASSWORD })).ok).toBe(true);
  });

  it("after the lock ends, each wrong password locks it for another 15 minutes", async () => {
    for (let i = 0; i < 5; i++) await auth.login({ username: "sam", password: "wrong password" });
    clock.advance(15 * MINUTE);
    expect(await auth.login({ username: "sam", password: "wrong again" })).toEqual({
      ok: false,
      error: { kind: "invalid-credentials" },
    });
    expect(await auth.login({ username: "sam", password: PASSWORD })).toEqual({
      ok: false,
      error: { kind: "too-many-attempts", retryAfterMs: 15 * MINUTE },
    });
  });

  it("forgets failures after 24 hours without one, so the next five are free again", async () => {
    for (let i = 0; i < 5; i++) await auth.login({ username: "sam", password: "wrong password" });
    clock.advance(24 * 60 * MINUTE);
    for (let i = 0; i < 4; i++) {
      expect(await auth.login({ username: "sam", password: "wrong password" })).toEqual({
        ok: false,
        error: { kind: "invalid-credentials" },
      });
    }
    expect((await auth.login({ username: "sam", password: PASSWORD })).ok).toBe(true);
  });

  it("does not forget them a minute before the 24 hours are up", async () => {
    for (let i = 0; i < 5; i++) await auth.login({ username: "sam", password: "wrong password" });
    clock.advance(24 * 60 * MINUTE - MINUTE);
    await auth.login({ username: "sam", password: "wrong password" });
    expect(await auth.login({ username: "sam", password: PASSWORD })).toMatchObject({
      error: { kind: "too-many-attempts" },
    });
  });

  it("attempts refused while locked don't extend the lock", async () => {
    for (let i = 0; i < 5; i++) await auth.login({ username: "sam", password: "wrong password" });
    clock.advance(10 * MINUTE);
    await auth.login({ username: "sam", password: "wrong password" });
    clock.advance(5 * MINUTE);
    expect((await auth.login({ username: "sam", password: PASSWORD })).ok).toBe(true);
  });

  it("throttles unknown usernames too, so they can't be probed", async () => {
    for (let i = 0; i < 5; i++) await auth.login({ username: "nobody", password: "x" });
    expect(await auth.login({ username: "nobody", password: "x" })).toMatchObject({
      error: { kind: "too-many-attempts" },
    });
  });

  it("forgets earlier failures after a successful login", async () => {
    for (let i = 0; i < 4; i++) await auth.login({ username: "sam", password: "wrong password" });
    await loginToken();
    for (let i = 0; i < 4; i++) await auth.login({ username: "sam", password: "wrong password" });
    expect((await auth.login({ username: "sam", password: PASSWORD })).ok).toBe(true);
  });

  it("clears out expired sessions", async () => {
    await loginToken();
    clock.advance(91 * DAY);
    await loginToken();
    expect(sessionCount()).toBe(1);
  });
});

describe("authenticate", () => {
  it("finds the user behind a valid token", async () => {
    const token = await loginToken();
    expect(auth.authenticate(token)?.user).toMatchObject({ username: "sam" });
  });

  it("refuses missing, empty and unknown tokens", () => {
    expect(auth.authenticate(undefined)).toBeUndefined();
    expect(auth.authenticate("")).toBeUndefined();
    expect(auth.authenticate("not-a-real-token")).toBeUndefined();
  });

  it("refuses an expired session and removes it", async () => {
    const token = await loginToken();
    clock.advance(90 * DAY);
    expect(auth.authenticate(token)).toBeUndefined();
    expect(sessionCount()).toBe(0);
  });

  it("renews a session in use, so it outlives 90 days from login", async () => {
    const token = await loginToken();
    clock.advance(60 * DAY);
    expect(auth.authenticate(token)?.renewedExpiresAt).toEqual(new Date(clock.now().getTime() + 90 * DAY));
    clock.advance(60 * DAY); // 120 days after login
    expect(auth.authenticate(token)?.user.username).toBe("sam");
  });

  it("does not renew more than once a day", async () => {
    const token = await loginToken();
    clock.advance(DAY - 1);
    expect(auth.authenticate(token)?.renewedExpiresAt).toBeUndefined();
  });
});

describe("logout", () => {
  it("ends that session only", async () => {
    const phone = await loginToken();
    const laptop = await loginToken();
    auth.logout(phone);
    expect(auth.authenticate(phone)).toBeUndefined();
    expect(auth.authenticate(laptop)).toBeDefined();
  });

  it("does nothing without a token", () => {
    expect(() => {
      auth.logout(undefined);
    }).not.toThrow();
  });
});

describe("setPassword", () => {
  it("changes the password and signs the user out everywhere", async () => {
    const token = await loginToken();
    expect(await auth.setPassword({ username: "Sam", password: "a brand new password" })).toEqual({
      ok: true,
      value: null,
    });
    expect(auth.authenticate(token)).toBeUndefined();
    expect((await auth.login({ username: "sam", password: PASSWORD })).ok).toBe(false);
    expect((await auth.login({ username: "sam", password: "a brand new password" })).ok).toBe(true);
  });

  it("refuses a short password and an unknown user", async () => {
    expect(await auth.setPassword({ username: "sam", password: "short" })).toEqual({
      ok: false,
      error: "password-too-short",
    });
    expect(await auth.setPassword({ username: "nobody", password: "long enough password" })).toEqual({
      ok: false,
      error: "user-not-found",
    });
  });
});
