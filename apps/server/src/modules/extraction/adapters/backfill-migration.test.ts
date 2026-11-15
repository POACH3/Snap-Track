// Migration 0003 makes an extraction job for every receipt uploaded before extraction existed.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, describe, expect, it } from "vitest";
import { openSqlite, toDrizzle } from "../../../platform/db/connection.ts";
import { migrationsFolder } from "../../../platform/db/migrations.ts";

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

/** A copy of the migrations folder that stops before migration `index`. */
function migrationsBefore(index: number): string {
  const folder = mkdtempSync(join(tmpdir(), "snaptrack-migrations-"));
  folders.push(folder);
  cpSync(migrationsFolder, folder, { recursive: true });
  const journalPath = join(folder, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: { tag: string }[] };
  journal.entries = journal.entries.slice(0, index);
  writeFileSync(journalPath, JSON.stringify(journal));
  return folder;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("migration 0003_extraction", () => {
  it("queues a job for each receipt still uploaded, and none for others", () => {
    const sqlite = openSqlite(":memory:", { mustExist: false });
    migrate(toDrizzle(sqlite), { migrationsFolder: migrationsBefore(3) });
    const insert = sqlite.prepare(
      "insert into receipts (id, logged_by_user_id, source, status, captured_at, created_at, updated_at) values (?, 'u', 'photo', ?, 'now', 'now', 'now')",
    );
    insert.run("r-uploaded-1", "uploaded");
    insert.run("r-uploaded-2", "uploaded");
    insert.run("r-confirmed", "confirmed");

    migrate(toDrizzle(sqlite), { migrationsFolder });

    const jobs = sqlite
      .prepare(
        "select id, receipt_id, status, attempts, next_attempt_at from extraction_jobs order by receipt_id",
      )
      .all() as {
      id: string;
      receipt_id: string;
      status: string;
      attempts: number;
      next_attempt_at: string;
    }[];
    expect(jobs.map((j) => [j.receipt_id, j.status, j.attempts])).toEqual([
      ["r-uploaded-1", "pending", 0],
      ["r-uploaded-2", "pending", 0],
    ]);
    for (const job of jobs) {
      expect(job.id).toMatch(UUID);
      expect(job.next_attempt_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    }
    expect(new Set(jobs.map((j) => j.id)).size).toBe(2);
    sqlite.close();
  });
});
