// Receipts over real HTTP. Uploads are sent the way the oRPC client sends files: multipart,
// with the input as JSON in `data` and each file in a numbered part (see `uploadBody`).
import type { ReceiptSummary } from "@snaptrack/contracts";
import { newId } from "@snaptrack/core";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestApp, CSRF_HEADER } from "../../../testing/create-test-app.ts";
import { fakeImage } from "../testing/fake-images.ts";

const PASSWORD = "correct horse battery";
let t: ReturnType<typeof createTestApp>;
let cookie: string;

async function signIn(username: string, displayName: string): Promise<string> {
  await t.auth.service.createUser({ username, displayName, password: PASSWORD });
  const response = await t.app.inject({
    method: "POST",
    url: "/rpc/auth/login",
    headers: { ...CSRF_HEADER, "content-type": "application/json" },
    payload: JSON.stringify({ json: { username, password: PASSWORD } }),
  });
  return String(response.headers["set-cookie"]).split(";")[0] ?? "";
}

beforeEach(async () => {
  t = createTestApp();
  cookie = await signIn("sam", "Sam Smith");
});

/** The multipart body the oRPC client sends for an input with files in `images`. */
async function uploadBody(input: { id: string; capturedAt: string }, images: Uint8Array<ArrayBuffer>[]) {
  const form = new FormData();
  const maps = images.map((_, i) => ["images", i]);
  form.set("data", JSON.stringify({ json: { ...input, images: images.map(() => ({})) }, maps }));
  images.forEach((bytes, i) => {
    form.set(String(i), new File([bytes], `photo-${i}.jpg`, { type: "image/jpeg" }));
  });
  const request = new Request("http://localhost/", { method: "POST", body: form });
  return {
    payload: Buffer.from(await request.arrayBuffer()),
    contentType: request.headers.get("content-type") ?? "",
  };
}

async function upload(id: string, images: Uint8Array<ArrayBuffer>[], as = cookie) {
  const body = await uploadBody({ id, capturedAt: "2026-11-15T10:00:00.000Z" }, images);
  return t.app.inject({
    method: "POST",
    url: "/rpc/receipts/put",
    headers: { ...CSRF_HEADER, cookie: as, "content-type": body.contentType },
    payload: body.payload,
  });
}

/** The `json` part of an oRPC response body. */
type Injected = { json: () => unknown };
const receiptOf = (response: Injected) =>
  (response.json() as { json: { receipt: ReceiptSummary } }).json.receipt;
const receiptsOf = (response: Injected) =>
  (response.json() as { json: { receipts: ReceiptSummary[] } }).json.receipts;

const jpeg = (tag = "") => fakeImage("jpeg", { width: 1000, height: 1800 }, tag);
const count = (table: string) =>
  (t.sqlite.prepare(`select count(*) as n from ${table}`).get() as { n: number }).n;

describe("receipts over HTTP", () => {
  it("uploads a receipt, attributed to the signed-in person", async () => {
    const id = newId();
    const response = await upload(id, [jpeg("one"), jpeg("two")]);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      json: { receipt: { id, status: "uploaded", loggedBy: { displayName: "Sam Smith" } } },
    });
    expect(receiptOf(response).images).toHaveLength(2);
  });

  it("the person is the session's, whoever else retries the same upload", async () => {
    const id = newId();
    await upload(id, [jpeg()]);
    const alex = await signIn("alex", "Alex");
    const again = await upload(id, [jpeg()], alex);
    expect(again.statusCode).toBe(200);
    expect(receiptOf(again).loggedBy.displayName).toBe("Sam Smith");
  });

  it("uploading the same receipt twice creates one record", async () => {
    const id = newId();
    const first = await upload(id, [jpeg()]);
    const second = await upload(id, [jpeg()]);
    expect(second.json()).toEqual(first.json());
    expect(count("receipts")).toBe(1);
    expect(count("receipt_images")).toBe(1);
  });

  it("refuses a file that isn't an image with 415, naming its position", async () => {
    const response = await upload(newId(), [jpeg(), new Uint8Array(new TextEncoder().encode("hello"))]);
    expect(response.statusCode).toBe(415);
    expect(response.json()).toMatchObject({ json: { code: "UNSUPPORTED_IMAGE", data: { position: 1 } } });
  });

  it("refuses a request over the size limit with 413, before reading it", async () => {
    t = createTestApp({ maxRequestBytes: 1000 });
    cookie = await signIn("sam", "Sam");
    const response = await upload(newId(), [fakeImage("jpeg", { width: 10, height: 10 }, "x".repeat(2000))]);
    expect(response.statusCode).toBe(413);
    expect(count("receipts")).toBe(0);
  });

  it("refuses a request with no images", async () => {
    const response = await t.app.inject({
      method: "POST",
      url: "/rpc/receipts/put",
      headers: { ...CSRF_HEADER, cookie, "content-type": "application/json" },
      payload: JSON.stringify({ json: { id: newId(), capturedAt: "2026-11-15T10:00:00.000Z", images: [] } }),
    });
    expect(response.statusCode).toBe(400);
  });

  it("lists and gets receipts; an unknown receipt is a 404", async () => {
    const id = newId();
    await upload(id, [jpeg()]);
    const list = await t.app.inject({
      url: `/rpc/receipts/list?data=${encodeURIComponent(JSON.stringify({ json: {} }))}`,
      headers: { ...CSRF_HEADER, cookie },
    });
    expect(receiptsOf(list).map((r) => r.id)).toEqual([id]);

    const get = (receiptId: string) =>
      t.app.inject({
        url: `/rpc/receipts/get?data=${encodeURIComponent(JSON.stringify({ json: { id: receiptId } }))}`,
        headers: { ...CSRF_HEADER, cookie },
      });
    expect(receiptOf(await get(id)).id).toBe(id);
    expect((await get(newId())).statusCode).toBe(404);
  });
});

describe("receipt image routes", () => {
  async function uploadedImageId(): Promise<string> {
    const response = await upload(newId(), [jpeg("served")]);
    return receiptOf(response).images[0]?.id ?? "";
  }

  it("serve the image and its thumbnail as cacheable private JPEGs", async () => {
    const imageId = await uploadedImageId();
    for (const url of [`/files/receipt-images/${imageId}`, `/files/receipt-images/${imageId}/thumbnail`]) {
      const response = await t.app.inject({ url, headers: { cookie } });
      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toBe("image/jpeg");
      expect(response.headers["cache-control"]).toBe("private, max-age=31536000, immutable");
    }
    const image = await t.app.inject({ url: `/files/receipt-images/${imageId}`, headers: { cookie } });
    expect(image.body).toContain("served");
  });

  it("need a session", async () => {
    const imageId = await uploadedImageId();
    for (const as of [undefined, "snaptrack_session=made-up"]) {
      const response = await t.app.inject({
        url: `/files/receipt-images/${imageId}`,
        headers: as === undefined ? {} : { cookie: as },
      });
      expect(response.statusCode).toBe(401);
    }
  });

  it("return 404 for unknown or malformed image ids", async () => {
    for (const imageId of [newId(), "not-a-uuid", "..%2F..%2Fetc"]) {
      const response = await t.app.inject({ url: `/files/receipt-images/${imageId}`, headers: { cookie } });
      expect(response.statusCode).toBe(404);
    }
  });
});
