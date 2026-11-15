import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Sqlite } from "./connection.ts";
import { SqliteTransaction } from "./sqlite-transaction.ts";
import { createTestDatabase } from "./testing/test-database.ts";

let sqlite: Sqlite;
let transaction: SqliteTransaction;

beforeEach(() => {
  sqlite = createTestDatabase();
  transaction = new SqliteTransaction(sqlite);
});
afterEach(() => {
  sqlite.close();
});

const insert = (key: string) => {
  sqlite
    .prepare("insert into meta (key, value, created_at, updated_at) values (?, 'v', 'now', 'now')")
    .run(key);
};
const count = () => (sqlite.prepare("select count(*) as n from meta").get() as { n: number }).n;

describe("SqliteTransaction", () => {
  it("saves every change and returns fn's value", () => {
    const value = transaction.run(() => {
      insert("a");
      insert("b");
      return "done";
    });
    expect(value).toBe("done");
    expect(count()).toBe(2);
  });

  it("saves nothing when fn throws partway", () => {
    expect(() =>
      transaction.run(() => {
        insert("a");
        throw new Error("fails after the first write");
      }),
    ).toThrow("fails after the first write");
    expect(count()).toBe(0);
  });

  it("rolls back an inner run without losing the outer one's earlier work when caught", () => {
    transaction.run(() => {
      insert("outer");
      try {
        transaction.run(() => {
          insert("inner");
          throw new Error("inner fails");
        });
      } catch {
        // The outer change stays.
      }
    });
    expect(count()).toBe(1);
  });

  it("refuses a Promise-returning fn, in the type and at run time", () => {
    // @ts-expect-error An async fn would save before its awaited work runs (SPEC.md §3.1 rule 7).
    const run = () => transaction.run(async () => Promise.resolve(1));
    expect(run).toThrow();
  });
});
