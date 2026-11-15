import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

export type Sqlite = Database.Database;
export type Db = BetterSQLite3Database;

/** Opens the database with the settings every connection needs. */
export function openSqlite(path: string, options: { mustExist: boolean }): Sqlite {
  const sqlite = new Database(path, { fileMustExist: options.mustExist });
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  return sqlite;
}

export function toDrizzle(sqlite: Sqlite): Db {
  return drizzle(sqlite);
}
