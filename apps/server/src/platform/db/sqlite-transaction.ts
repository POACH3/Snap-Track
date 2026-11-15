import type { NotPromise, Transaction } from "@snaptrack/core";
import type { Sqlite } from "./connection.ts";

/**
 * The `Transaction` port over better-sqlite3 (SPEC.md §3.1 rule 7). One connection serves
 * the whole process, so every repository call inside `fn` is part of the transaction.
 * Nested calls become savepoints.
 */
export class SqliteTransaction implements Transaction {
  readonly #sqlite: Sqlite;

  constructor(sqlite: Sqlite) {
    this.#sqlite = sqlite;
  }

  run<T>(fn: () => NotPromise<T>): T {
    // better-sqlite3 also throws if fn returns a Promise, which catches casts around the type.
    return this.#sqlite.transaction(fn)();
  }
}
