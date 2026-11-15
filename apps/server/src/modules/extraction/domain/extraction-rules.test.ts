import { describe, expect, it } from "vitest";
import type { ExtractionJob } from "./job.ts";
import { MAX_ATTEMPTS, decideOutcome, retryDelayMs } from "./outcome.ts";
import { parseModelOutput } from "./output.ts";

const NOW = new Date("2026-11-15T12:00:00.000Z");
const job = (patch: Partial<ExtractionJob> = {}): ExtractionJob => ({
  id: "j1",
  receiptId: "r1",
  status: "running",
  attempts: 0,
  invalidOutputs: 0,
  nextAttemptAt: NOW.toISOString(),
  ...patch,
});
const secondsLater = (outcome: { nextAttemptAt: Date }) =>
  (outcome.nextAttemptAt.getTime() - NOW.getTime()) / 1000;

describe("parseModelOutput", () => {
  it("reads plain JSON, JSON in code fences, and JSON with a sentence around it", () => {
    for (const content of [
      '{"total": 5}',
      '```json\n{"total": 5}\n```',
      'Here is the receipt:\n{"total": 5}\nLet me know if you need more.',
    ]) {
      expect(parseModelOutput(content)?.total).toBe(5);
    }
  });

  it("refuses replies that aren't a JSON object", () => {
    for (const content of ["", "I can't read this image.", "[1, 2]", '{"total": 5', "{not json}"]) {
      expect(parseModelOutput(content)).toBeUndefined();
    }
  });
});

describe("decideOutcome", () => {
  it("saves valid output", () => {
    const outcome = decideOutcome(job(), { kind: "output", content: '{"total": 5}', model: "m" }, NOW);
    expect(outcome).toMatchObject({ kind: "save", model: "m", rawOutput: '{"total": 5}' });
  });

  it("waits without counting an attempt, at the relay's suggested time", () => {
    const outcome = decideOutcome(
      job({ attempts: 4 }),
      { kind: "wait", reason: "busy", retryAfterMs: 45_000 },
      NOW,
    );
    expect(outcome.kind).toBe("wait");
    if (outcome.kind === "wait") expect(secondsLater(outcome)).toBe(45);
  });

  it("uses a default wait for each reason when none is suggested", () => {
    const wait = (reason: "busy" | "reserved" | "offline" | "interrupted") => {
      const outcome = decideOutcome(job(), { kind: "wait", reason, retryAfterMs: null }, NOW);
      return outcome.kind === "wait" ? secondsLater(outcome) : Number.NaN;
    };
    expect([wait("busy"), wait("reserved"), wait("offline"), wait("interrupted")]).toEqual([
      30, 300, 120, 30,
    ]);
  });

  it("keeps a suggested wait between 5 seconds and an hour, and retries at once after a cancel", () => {
    const at = (retryAfterMs: number) => {
      const outcome = decideOutcome(job(), { kind: "wait", reason: "busy", retryAfterMs }, NOW);
      return outcome.kind === "wait" ? secondsLater(outcome) : Number.NaN;
    };
    expect([at(0), at(10 * 60 * 60 * 1000)]).toEqual([5, 3600]);
    const cancelled = decideOutcome(job(), { kind: "wait", reason: "cancelled", retryAfterMs: null }, NOW);
    expect(cancelled.kind === "wait" && secondsLater(cancelled)).toBe(0);
  });

  it("counts a real failure and backs off 1, 2, 4, 8 minutes", () => {
    expect([1, 2, 3, 4].map(retryDelayMs)).toEqual([60_000, 120_000, 240_000, 480_000]);
    const outcome = decideOutcome(job({ attempts: 2 }), { kind: "failure", message: "HTTP 500" }, NOW);
    expect(outcome).toMatchObject({ kind: "retry", attempts: 3, lastError: "HTTP 500" });
    if (outcome.kind === "retry") expect(secondsLater(outcome)).toBe(240);
  });

  it("gives up on the fifth real failure", () => {
    const outcome = decideOutcome(
      job({ attempts: MAX_ATTEMPTS - 1 }),
      { kind: "failure", message: "timeout" },
      NOW,
    );
    expect(outcome).toMatchObject({ kind: "give-up", attempts: MAX_ATTEMPTS });
  });

  it("retries an invalid reply once, then gives up, keeping the reply", () => {
    const first = decideOutcome(job(), { kind: "output", content: "no json here", model: null }, NOW);
    expect(first).toMatchObject({ kind: "retry", attempts: 1, invalidOutputs: 1, rawOutput: "no json here" });
    const second = decideOutcome(
      job({ attempts: 1, invalidOutputs: 1 }),
      { kind: "output", content: "still none", model: null },
      NOW,
    );
    expect(second).toMatchObject({ kind: "give-up", invalidOutputs: 2, rawOutput: "still none" });
  });
});
