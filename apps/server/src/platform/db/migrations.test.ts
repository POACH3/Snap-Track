import { describe, expect, it } from "vitest";
import { openSqlite } from "./connection.ts";
import { applyMigrations, countPendingMigrations } from "./migrations.ts";
import { createTestDatabase } from "./testing/test-database.ts";

describe("migrations", () => {
  it("a new database has every migration pending", () => {
    const sqlite = openSqlite(":memory:", { mustExist: false });
    expect(countPendingMigrations(sqlite)).toBeGreaterThan(0);
    sqlite.close();
  });

  it("applying them leaves none pending and creates the tables", () => {
    const sqlite = createTestDatabase();
    expect(countPendingMigrations(sqlite)).toBe(0);
    expect(sqlite.prepare("select name from sqlite_master where name = 'meta'").get()).toBeDefined();
    sqlite.close();
  });

  it("applying them twice changes nothing", () => {
    const sqlite = createTestDatabase();
    applyMigrations(sqlite);
    expect(countPendingMigrations(sqlite)).toBe(0);
    sqlite.close();
  });

  it("turns on foreign keys for every connection", () => {
    const sqlite = createTestDatabase();
    expect(sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
    sqlite.close();
  });
});
