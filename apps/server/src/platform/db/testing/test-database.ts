import { openSqlite, type Sqlite } from "../connection.ts";
import { applyMigrations } from "../migrations.ts";

/** A fresh in-memory database with every migration applied (SPEC.md §3.5). One per test. */
export function createTestDatabase(): Sqlite {
  const sqlite = openSqlite(":memory:", { mustExist: false });
  applyMigrations(sqlite);
  return sqlite;
}
