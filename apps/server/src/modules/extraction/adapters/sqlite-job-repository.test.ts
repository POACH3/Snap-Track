// Repository test on in-memory SQLite (SPEC.md §3.5): queue order and state changes.
import { describe, expect, it } from "vitest";
import { toDrizzle } from "../../../platform/db/connection.ts";
import { createTestDatabase } from "../../../platform/db/testing/test-database.ts";
import { SqliteJobRepository } from "./sqlite-job-repository.ts";

const at = (minutes: number) => new Date(Date.parse("2026-11-15T12:00:00Z") + minutes * 60_000);
const repo = () => new SqliteJobRepository(toDrizzle(createTestDatabase()));

describe("SqliteJobRepository", () => {
  it("keeps one job per receipt", () => {
    const jobs = repo();
    jobs.insertPending("r1", at(0));
    jobs.insertPending("r1", at(1));
    expect(jobs.findByReceipt("r1")?.nextAttemptAt).toBe(at(0).toISOString());
  });

  it("claims the job due soonest, only once it is due, and only once", () => {
    const jobs = repo();
    jobs.insertPending("later", at(0));
    jobs.insertPending("sooner", at(0));
    jobs.reschedule(jobs.findByReceipt("later")?.id ?? "", at(10), undefined, at(0));
    expect(jobs.claimNextDue(at(1))?.receiptId).toBe("sooner");
    expect(jobs.claimNextDue(at(1))).toBeUndefined();
    expect(jobs.nextDueAt()).toEqual(at(10));
    expect(jobs.claimNextDue(at(10))?.receiptId).toBe("later");
  });

  it("records a failed attempt only when told to, and keeps the raw output", () => {
    const jobs = repo();
    jobs.insertPending("r1", at(0));
    const id = jobs.claimNextDue(at(0))?.id ?? "";
    jobs.reschedule(id, at(1), undefined, at(0));
    expect(jobs.findByReceipt("r1")).toMatchObject({ status: "pending", attempts: 0, lastError: null });
    jobs.claimNextDue(at(1));
    jobs.reschedule(
      id,
      at(2),
      { attempts: 1, invalidOutputs: 1, lastError: "bad", rawOutput: "junk" },
      at(1),
    );
    expect(jobs.findByReceipt("r1")).toMatchObject({
      attempts: 1,
      invalidOutputs: 1,
      lastError: "bad",
      rawOutput: "junk",
    });
  });

  it("puts running jobs back to pending, due now, and says which receipts", () => {
    const jobs = repo();
    jobs.insertPending("r1", at(0));
    jobs.insertPending("r2", at(0));
    jobs.claimNextDue(at(0));
    expect(jobs.resetRunning(at(5))).toEqual(["r1"]);
    expect(jobs.findByReceipt("r1")).toMatchObject({ status: "pending", nextAttemptAt: at(5).toISOString() });
    expect(jobs.resetRunning(at(6))).toEqual([]);
  });

  it("finished jobs are never claimed again", () => {
    const jobs = repo();
    jobs.insertPending("done", at(0));
    jobs.insertPending("failed", at(0));
    jobs.markDone(jobs.claimNextDue(at(0))?.id ?? "", { model: "m", rawOutput: "{}" }, at(0));
    jobs.markFailed(
      jobs.claimNextDue(at(0))?.id ?? "",
      { attempts: 5, invalidOutputs: 0, lastError: "x", rawOutput: null },
      at(0),
    );
    expect(jobs.claimNextDue(at(100))).toBeUndefined();
    expect(jobs.nextDueAt()).toBeUndefined();
    expect(jobs.findByReceipt("done")).toMatchObject({ status: "done", rawOutput: "{}" });
  });
});
