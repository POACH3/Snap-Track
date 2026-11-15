// The worker loop with real timers: reads uploads as they arrive, recovers at start, stops cleanly.
import { newId } from "@snaptrack/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../../../testing/create-test-app.ts";
import { fakeImage } from "../../../testing/test-images.ts";
import { ScriptedExtractor, output } from "../testing/scripted-extractor.ts";

const stops: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(stops.splice(0).map((stop) => stop()));
});

async function setup(extractor: ScriptedExtractor) {
  const t = createTestApp({ extractor });
  await t.auth.service.createUser({ username: "sam", displayName: "Sam", password: "correct horse battery" });
  const user = t.sqlite.prepare("select id from users").get() as { id: string };
  const upload = async () => {
    const id = newId();
    await t.receipts.service.putReceipt(
      { id, capturedAt: "2026-01-15T11:00:00Z", images: [fakeImage("jpeg", { width: 100, height: 200 })] },
      user.id,
    );
    return id;
  };
  stops.push(() => t.extraction.worker.stop());
  return { t, upload };
}

describe("ExtractionWorker", () => {
  it("reads a receipt as soon as it is uploaded, without waiting for the next check", async () => {
    const { t, upload } = await setup(new ScriptedExtractor([output({ total: 5 })]));
    t.extraction.worker.start();
    const id = await upload();
    await vi.waitFor(() => {
      expect(t.receipts.service.getReceipt(id)?.status).toBe("unreviewed");
    });
  });

  it("at start, picks up receipts queued while it was stopped", async () => {
    const { t, upload } = await setup(new ScriptedExtractor([output({ total: 1 }), output({ total: 2 })]));
    const [a, b] = [await upload(), await upload()];
    t.extraction.worker.start();
    await vi.waitFor(() => {
      expect([t.receipts.service.getReceipt(a)?.status, t.receipts.service.getReceipt(b)?.status]).toEqual([
        "unreviewed",
        "unreviewed",
      ]);
    });
  });

  it("stops promptly while idle, and can be stopped twice", async () => {
    const { t } = await setup(new ScriptedExtractor());
    t.extraction.worker.start();
    const started = Date.now();
    await t.extraction.worker.stop();
    await t.extraction.worker.stop();
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
