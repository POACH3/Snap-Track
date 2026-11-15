import { FakeClock } from "@snaptrack/core/testing";
import { beforeEach, describe, expect, it } from "vitest";
import { toDrizzle, type Sqlite } from "../../../platform/db/connection.ts";
import { createTestDatabase } from "../../../platform/db/testing/test-database.ts";
import { SqliteSessionRepository, SqliteUserRepository } from "./sqlite-repositories.ts";

let sqlite: Sqlite;
let users: SqliteUserRepository;
let sessions: SqliteSessionRepository;
const clock = new FakeClock(new Date("2026-05-01T00:00:00.000Z"));

const sam = {
  id: "6f1c2b0e-0d55-4c38-9a8e-3c4a3f1b2a10",
  username: "sam",
  displayName: "Sam",
  passwordHash: "h",
};

beforeEach(() => {
  sqlite = createTestDatabase();
  const db = toDrizzle(sqlite);
  users = new SqliteUserRepository(db, clock);
  sessions = new SqliteSessionRepository(db, clock);
  users.insert(sam);
});

describe("SqliteUserRepository", () => {
  it("finds a user by id and by username", () => {
    expect(users.findById(sam.id)).toEqual(sam);
    expect(users.findByUsername("sam")).toEqual(sam);
    expect(users.findByUsername("nobody")).toBeUndefined();
  });

  it("refuses a second user with the same username", () => {
    expect(users.insert({ ...sam, id: "1e4f5a6b-7c8d-4e9f-8a0b-1c2d3e4f5a6b" })).toBe(false);
  });

  it("updates the password hash", () => {
    users.updatePasswordHash(sam.id, "new-hash");
    expect(users.findById(sam.id)?.passwordHash).toBe("new-hash");
  });
});

describe("SqliteSessionRepository", () => {
  const session = (id: string, expiresAt: string) => ({ id, userId: sam.id, expiresAt: new Date(expiresAt) });

  it("stores and reads a session, keeping the exact expiry", () => {
    sessions.insert(session("s1", "2026-07-30T08:15:30.123Z"));
    expect(sessions.findById("s1")).toEqual(session("s1", "2026-07-30T08:15:30.123Z"));
  });

  it("deletes only expired sessions", () => {
    sessions.insert(session("old", "2026-04-30T23:59:59.999Z"));
    sessions.insert(session("now", "2026-05-01T00:00:00.000Z"));
    sessions.insert(session("live", "2026-05-01T00:00:00.001Z"));
    sessions.deleteExpired(clock.now());
    expect(sessions.findById("old")).toBeUndefined();
    expect(sessions.findById("now")).toBeUndefined();
    expect(sessions.findById("live")).toBeDefined();
  });

  it("refuses a session for a user who doesn't exist", () => {
    expect(() => {
      sessions.insert({ ...session("s1", "2026-06-01T00:00:00.000Z"), userId: "no-such-user" });
    }).toThrow();
  });

  it("removes a user's sessions when the user is deleted", () => {
    sessions.insert(session("s1", "2026-06-01T00:00:00.000Z"));
    sqlite.prepare("delete from users where id = ?").run(sam.id);
    expect(sessions.findById("s1")).toBeUndefined();
  });
});
