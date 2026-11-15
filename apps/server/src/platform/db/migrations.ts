import { readFileSync } from "node:fs";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { toDrizzle, type Sqlite } from "./connection.ts";

export const migrationsFolder = new URL("../../../drizzle", import.meta.url).pathname;

export function applyMigrations(sqlite: Sqlite): void {
  migrate(toDrizzle(sqlite), { migrationsFolder });
}

/** How many migrations in the code have not been applied to this database. */
export function countPendingMigrations(sqlite: Sqlite): number {
  const journal = JSON.parse(readFileSync(`${migrationsFolder}/meta/_journal.json`, "utf8")) as {
    entries: unknown[];
  };
  const tableExists = sqlite
    .prepare("select 1 from sqlite_master where type = 'table' and name = '__drizzle_migrations'")
    .get();
  const applied = tableExists
    ? (sqlite.prepare("select count(*) as n from __drizzle_migrations").get() as { n: number }).n
    : 0;
  return journal.entries.length - applied;
}
