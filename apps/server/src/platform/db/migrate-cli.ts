// `pnpm db:migrate`: applies pending migrations to DATABASE_PATH. Changes the database;
// see .claude/rules/database-commands.md before running it.
// With `--check` it only prints how many are pending and changes nothing (used by deploy.sh).
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { openSqlite } from "./connection.ts";
import { applyMigrations, countPendingMigrations } from "./migrations.ts";

const path = process.env["DATABASE_PATH"];
if (!path) {
  console.error("DATABASE_PATH is not set.");
  process.exit(1);
}
const checkOnly = process.argv.includes("--check");

mkdirSync(dirname(path), { recursive: true });
const sqlite = openSqlite(path, { mustExist: false });
const pending = countPendingMigrations(sqlite);
if (checkOnly) {
  console.log(pending);
} else {
  applyMigrations(sqlite);
  console.log(`Applied ${pending} migration(s) to ${path}.`);
}
sqlite.close();
