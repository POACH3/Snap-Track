// `pnpm db:migrate`: applies pending migrations to DATABASE_PATH. Changes the database;
// see .claude/rules/database-commands.md before running it.
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { openSqlite } from "./connection.ts";
import { applyMigrations, countPendingMigrations } from "./migrations.ts";

const path = process.env["DATABASE_PATH"];
if (!path) {
  console.error("DATABASE_PATH is not set.");
  process.exit(1);
}
mkdirSync(dirname(path), { recursive: true });
const sqlite = openSqlite(path, { mustExist: false });
const pending = countPendingMigrations(sqlite);
applyMigrations(sqlite);
sqlite.close();
console.log(`Applied ${pending} migration(s) to ${path}.`);
