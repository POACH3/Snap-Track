import { newId, type Id } from "@snaptrack/core";
import { and, asc, eq, lte } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { ExtractionJob } from "../domain/job.ts";
import type { ExtractionJobRepository, JobFailure } from "../ports.ts";
import { extractionJobs } from "./schema.ts";

type Db = BetterSQLite3Database;
type Row = typeof extractionJobs.$inferSelect;

const toJob = (row: Row): ExtractionJob => ({
  id: row.id,
  receiptId: row.receiptId,
  status: row.status,
  attempts: row.attempts,
  invalidOutputs: row.invalidOutputs,
  nextAttemptAt: row.nextAttemptAt,
});

const failureColumns = (failure: JobFailure) => ({
  attempts: failure.attempts,
  invalidOutputs: failure.invalidOutputs,
  lastError: failure.lastError,
  ...(failure.rawOutput === null ? {} : { rawOutput: failure.rawOutput }),
});

export class SqliteJobRepository implements ExtractionJobRepository {
  readonly #db: Db;

  /** Times come in with each call, from the use case's clock. */
  constructor(db: Db) {
    this.#db = db;
  }

  insertPending(receiptId: Id, now: Date): void {
    const at = now.toISOString();
    this.#db
      .insert(extractionJobs)
      .values({ id: newId(), receiptId, status: "pending", nextAttemptAt: at, createdAt: at, updatedAt: at })
      .onConflictDoNothing({ target: extractionJobs.receiptId })
      .run();
  }

  claimNextDue(now: Date): ExtractionJob | undefined {
    const row = this.#db
      .select()
      .from(extractionJobs)
      .where(and(eq(extractionJobs.status, "pending"), lte(extractionJobs.nextAttemptAt, now.toISOString())))
      .orderBy(asc(extractionJobs.nextAttemptAt), asc(extractionJobs.createdAt))
      .limit(1)
      .get();
    if (row === undefined) return undefined;
    this.#db
      .update(extractionJobs)
      .set({ status: "running", updatedAt: now.toISOString() })
      .where(eq(extractionJobs.id, row.id))
      .run();
    return toJob({ ...row, status: "running" });
  }

  markDone(id: Id, result: { model: string | null; rawOutput: string }, now: Date): void {
    const at = now.toISOString();
    this.#db
      .update(extractionJobs)
      .set({
        status: "done",
        model: result.model,
        rawOutput: result.rawOutput,
        completedAt: at,
        updatedAt: at,
      })
      .where(eq(extractionJobs.id, id))
      .run();
  }

  reschedule(id: Id, nextAttemptAt: Date, failure: JobFailure | undefined, now: Date): void {
    this.#db
      .update(extractionJobs)
      .set({
        status: "pending",
        nextAttemptAt: nextAttemptAt.toISOString(),
        updatedAt: now.toISOString(),
        ...(failure === undefined ? {} : failureColumns(failure)),
      })
      .where(eq(extractionJobs.id, id))
      .run();
  }

  markFailed(id: Id, failure: JobFailure, now: Date): void {
    const at = now.toISOString();
    this.#db
      .update(extractionJobs)
      .set({ status: "failed", completedAt: at, updatedAt: at, ...failureColumns(failure) })
      .where(eq(extractionJobs.id, id))
      .run();
  }

  resetRunning(now: Date): Id[] {
    const rows = this.#db
      .update(extractionJobs)
      .set({ status: "pending", nextAttemptAt: now.toISOString(), updatedAt: now.toISOString() })
      .where(eq(extractionJobs.status, "running"))
      .returning({ receiptId: extractionJobs.receiptId })
      .all();
    return rows.map((row) => row.receiptId);
  }

  nextDueAt(): Date | undefined {
    const row = this.#db
      .select({ at: extractionJobs.nextAttemptAt })
      .from(extractionJobs)
      .where(eq(extractionJobs.status, "pending"))
      .orderBy(asc(extractionJobs.nextAttemptAt))
      .limit(1)
      .get();
    return row && new Date(row.at);
  }

  findByReceipt(receiptId: Id) {
    const row = this.#db.select().from(extractionJobs).where(eq(extractionJobs.receiptId, receiptId)).get();
    return row && { ...toJob(row), lastError: row.lastError, rawOutput: row.rawOutput };
  }
}
