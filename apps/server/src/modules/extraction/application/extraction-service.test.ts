// Use-case tests (SPEC.md §3.5): the whole server wired on in-memory SQLite (real receipts
// module); the LLM server is a scripted extractor, images and clock are fakes.
import { newId } from "@snaptrack/core";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestApp } from "../../../testing/create-test-app.ts";
import { fakeImage } from "../../../testing/test-images.ts";
import { ScriptedExtractor, output } from "../testing/scripted-extractor.ts";

const MINUTE = 60_000;

/** A typical grocery receipt as the model returns it. */
const GROCERY = {
  store: { logoText: "Fresh Mart", printedName: "FRESH MART #42", phones: [{ number: "(555) 123-4567" }] },
  purchaseDate: "2026-11-14",
  purchaseTime: "17:05",
  subtotal: 9.47,
  tax: 0.76,
  taxLines: [{ label: "TAX", rate: "8%", amount: 0.76 }],
  total: 10.23,
  payments: [{ method: "card", cardBrand: "Visa", cardType: "credit", last4: "1234", amount: 10.23 }],
  lines: [
    { printedName: "MILK 2% GAL", amount: 3.49, kind: "item" },
    { printedName: "BANANAS", quantity: 2.31, unit: "lb", unitPrice: 0.59, amount: 1.36, kind: "item" },
    { printedName: "COFFEE", unitPrice: 5.62, amount: 4.62, discount: 1.0, kind: "item" },
  ],
  rawText: "FRESH MART #42\nMILK 2% GAL 3.49\n...",
};

let extractor: ScriptedExtractor;
let t: ReturnType<typeof createTestApp>;
let user: string;

beforeEach(async () => {
  extractor = new ScriptedExtractor();
  t = createTestApp({ extractor });
  t.clock.set(new Date("2026-11-15T12:00:00.000Z"));
  const created = await t.auth.service.createUser({
    username: "sam",
    displayName: "Sam",
    password: "correct horse battery",
  });
  if (!created.ok) throw new Error("setup failed");
  user = created.value.id;
});

const photo = (tag: string) => fakeImage("jpeg", { width: 1000, height: 1800 }, tag);
const signal = () => new AbortController().signal;

async function upload(photos = [photo("only")]): Promise<string> {
  const id = newId();
  const result = await t.receipts.service.putReceipt(
    { id, capturedAt: "2026-11-15T11:00:00Z", images: photos },
    user,
  );
  if (!result.ok) throw new Error("upload failed");
  return id;
}

const run = () => t.extraction.service.runNextJob(signal());
const status = (receiptId: string) => t.receipts.service.getReceipt(receiptId)?.status;
const job = (receiptId: string) => t.extraction.jobs.findByReceipt(receiptId);

describe("queueing", () => {
  it("an upload queues one job, in the same transaction; a repeated upload adds none", async () => {
    const id = await upload();
    expect(job(id)).toMatchObject({ status: "pending", attempts: 0 });
    await t.receipts.service.putReceipt(
      { id, capturedAt: "2026-11-15T11:00:00Z", images: [photo("x")] },
      user,
    );
    expect((t.sqlite.prepare("select count(*) as n from extraction_jobs").get() as { n: number }).n).toBe(1);
  });

  it("an upload whose job can't be saved saves no receipt either", async () => {
    t.sqlite.exec(
      "create trigger refuse_jobs before insert on extraction_jobs begin select raise(abort, 'no jobs'); end",
    );
    await expect(upload()).rejects.toThrow(/no jobs/);
    expect((t.sqlite.prepare("select count(*) as n from receipts").get() as { n: number }).n).toBe(0);
  });

  it("does nothing with an empty queue", async () => {
    expect(await run()).toBe("idle");
  });
});

describe("reading a receipt", () => {
  it("a typical receipt reaches unreviewed with its lines, store evidence, payments and transcription", async () => {
    extractor.then(output(GROCERY));
    const id = await upload();
    expect(await run()).toBe("worked");

    expect(status(id)).toBe("unreviewed");
    expect(t.receipts.service.getReceipt(id)?.totalCents).toBe(1023);
    const row = t.sqlite
      .prepare("select purchased_at, payments, store_evidence, raw_text from receipts")
      .get() as Record<string, string>;
    expect(row["purchased_at"]).toBe("2026-11-14T17:05");
    expect(JSON.parse(row["payments"] ?? "")).toEqual([
      expect.objectContaining({ cardBrand: "Visa", last4: "1234", amountCents: 1023 }),
    ]);
    expect(JSON.parse(row["store_evidence"] ?? "")).toMatchObject({
      logoText: "Fresh Mart",
      phones: [{ number: "(555) 123-4567" }],
    });
    expect(row["raw_text"]).toContain("MILK 2% GAL");
    // Line totals are what was charged, net of item discounts.
    const lines = t.sqlite
      .prepare("select raw_name, line_total_cents, discount_cents from line_items order by position")
      .all();
    expect(lines).toEqual([
      { raw_name: "MILK 2% GAL", line_total_cents: 349, discount_cents: null },
      { raw_name: "BANANAS", line_total_cents: 136, discount_cents: null },
      { raw_name: "COFFEE", line_total_cents: 462, discount_cents: 100 },
    ]);
    expect(job(id)).toMatchObject({ status: "done", attempts: 0, rawOutput: JSON.stringify(GROCERY) });
  });

  it("sends a long receipt's photos together, in order, as one request", async () => {
    extractor.then(output(GROCERY));
    await upload([photo("top"), photo("middle"), photo("bottom")]);
    await run();
    expect(extractor.requests).toHaveLength(1);
    expect(extractor.requests[0]?.map((bytes) => new TextDecoder().decode(bytes).split("|").at(-1))).toEqual([
      "top",
      "middle",
      "bottom",
    ]);
  });

  it("an unreadable image ends up review required after the one retry for invalid output", async () => {
    extractor.then(
      { kind: "output", content: "I can't read this receipt.", model: null },
      { kind: "output", content: "Sorry, the image is too blurry.", model: null },
    );
    const id = await upload();
    await run();
    expect(status(id)).toBe("uploaded");
    expect(job(id)).toMatchObject({ status: "pending", attempts: 1 });
    t.clock.advance(MINUTE);
    await run();
    expect(status(id)).toBe("review_required");
    expect(job(id)).toMatchObject({
      status: "failed",
      invalidOutputs: 2,
      rawOutput: "Sorry, the image is too blurry.",
    });
  });

  it("valid output with neither a total nor any line amount is review required, and what was read is kept", async () => {
    extractor.then(output({ rawText: "FRESH MART\n(smudged)", lines: [{ printedName: "MILK" }] }));
    const id = await upload();
    await run();
    expect(status(id)).toBe("review_required");
    expect(job(id)?.status).toBe("done");
    expect(t.sqlite.prepare("select raw_text from receipts").get()).toEqual({
      raw_text: "FRESH MART\n(smudged)",
    });
  });

  it("a receipt whose photos are gone is review required", async () => {
    const id = await upload();
    // Deleted, e.g. under the retention rules (SPEC.md §6.8).
    const keys = t.sqlite.prepare("select image_key from receipt_images").all() as { image_key: string }[];
    for (const { image_key } of keys) await t.files.delete(image_key);
    await run();
    expect(status(id)).toBe("review_required");
    expect(job(id)?.status).toBe("failed");
    expect(extractor.requests).toHaveLength(0);
  });
});

describe("waiting and retrying", () => {
  it("while the LLM server is stopped, the job waits without using attempts, then completes", async () => {
    extractor.then(
      { kind: "wait", reason: "offline", retryAfterMs: null },
      { kind: "wait", reason: "offline", retryAfterMs: null },
      output(GROCERY),
    );
    const id = await upload();
    await run();
    expect(status(id)).toBe("uploaded");
    expect(job(id)).toMatchObject({ status: "pending", attempts: 0 });
    expect(await run()).toBe("idle"); // not due yet
    t.clock.advance(2 * MINUTE);
    await run();
    t.clock.advance(2 * MINUTE);
    await run();
    expect(status(id)).toBe("unreviewed");
    expect(job(id)?.attempts).toBe(0);
  });

  it("while the relay is busy or reserved, the job waits as long as it says, without using attempts", async () => {
    extractor.then(
      { kind: "wait", reason: "busy", retryAfterMs: 45_000 },
      { kind: "wait", reason: "reserved", retryAfterMs: null },
      output(GROCERY),
    );
    const id = await upload();
    await run();
    expect(job(id)?.nextAttemptAt).toBe("2026-11-15T12:00:45.000Z");
    t.clock.advance(45_000);
    await run();
    expect(job(id)?.nextAttemptAt).toBe("2026-11-15T12:05:45.000Z");
    t.clock.advance(5 * MINUTE);
    await run();
    expect(status(id)).toBe("unreviewed");
    expect(job(id)?.attempts).toBe(0);
  });

  it("an interrupted receipt goes back to the queue and never counts", async () => {
    extractor.then(
      ...Array.from(
        { length: 8 },
        () => ({ kind: "wait", reason: "interrupted", retryAfterMs: null }) as const,
      ),
      output(GROCERY),
    );
    const id = await upload();
    for (let i = 0; i < 9; i++) {
      await run();
      t.clock.advance(MINUTE);
    }
    expect(status(id)).toBe("unreviewed");
    expect(job(id)?.attempts).toBe(0);
  });

  it("real failures back off and, on the fifth, the receipt is review required", async () => {
    extractor.then(
      ...Array.from(
        { length: 5 },
        () => ({ kind: "failure", message: "The LLM server answered 500" }) as const,
      ),
    );
    const id = await upload();
    for (const wait of [1, 2, 4, 8]) {
      await run();
      expect(status(id)).toBe("uploaded");
      t.clock.advance(wait * MINUTE - 1);
      expect(await run()).toBe("idle");
      t.clock.advance(1);
    }
    await run();
    expect(status(id)).toBe("review_required");
    expect(job(id)).toMatchObject({
      status: "failed",
      attempts: 5,
      lastError: "The LLM server answered 500",
    });
  });

  it("an exception from the extractor counts as a failure rather than stopping the queue", async () => {
    const id = await upload();
    await run(); // the scripted extractor has no reply and throws
    expect(job(id)).toMatchObject({ status: "pending", attempts: 1 });
  });

  it("stopping mid-request puts the job back at once, without an attempt", async () => {
    extractor.then({ kind: "wait", reason: "cancelled", retryAfterMs: null });
    const id = await upload();
    await run();
    expect(job(id)).toMatchObject({
      status: "pending",
      attempts: 0,
      nextAttemptAt: "2026-11-15T12:00:00.000Z",
    });
  });
});

describe("restarts", () => {
  it("a job left running by a restart is queued again, attempts unchanged, and then completes", async () => {
    const id = await upload();
    // A crash mid-job: claimed and marked extracting, never finished.
    t.extraction.jobs.claimNextDue(t.clock.now());
    t.receipts.service.setExtractionStatus(id, "extracting");
    expect(status(id)).toBe("extracting");

    // The server starts again: the worker's start-up recovery runs.
    expect(t.extraction.service.recoverInterrupted()).toBe(1);
    expect(status(id)).toBe("uploaded");
    expect(job(id)).toMatchObject({ status: "pending", attempts: 0 });

    extractor.then(output(GROCERY));
    await run();
    expect(status(id)).toBe("unreviewed");
  });
});
