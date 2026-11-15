// The relay adapter against a stub HTTP server playing the relay's recorded replies (SPEC.md §3.5),
// as listed in docs/feature-plans/extraction-plan.md.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { RelayExtractor, retryAfterMs } from "./relay-extractor.ts";

type Handler = (request: IncomingMessage, body: string, response: ServerResponse) => void;

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => {
            resolve();
          });
        }),
    ),
  );
});

/** A stub relay; returns its address. */
async function relay(handler: Handler): Promise<string> {
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk: Buffer) => (body += chunk.toString()));
    request.on("end", () => {
      handler(request, body, response);
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const json = (
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) => {
  response.writeHead(status, { "content-type": "application/json", ...headers });
  response.end(JSON.stringify(body));
};

const completion = (content: string) => ({
  model: "Qwen3.6-35B-A3B-4bit",
  choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
  usage: { prompt_tokens: 4000, completion_tokens: 300 },
});

const extractor = (baseUrl: string, timeoutMs = 5000) =>
  new RelayExtractor({ baseUrl, apiKey: "sub-key", model: "Qwen3.6-35B-A3B-4bit", timeoutMs });
const images = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])];
const signal = () => new AbortController().signal;

describe("RelayExtractor", () => {
  it("sends one low-priority request with every photo in order and extraction settings", async () => {
    let seen:
      | { headers: IncomingMessage["headers"]; path: string | undefined; body: Record<string, unknown> }
      | undefined;
    const url = await relay((request, body, response) => {
      seen = {
        headers: request.headers,
        path: request.url,
        body: JSON.parse(body) as Record<string, unknown>,
      };
      json(response, 200, completion("{}"));
    });
    await extractor(url).extract(images, signal());

    expect(seen?.path).toBe("/v1/chat/completions");
    expect(seen?.headers).toMatchObject({
      authorization: "Bearer sub-key",
      "x-llm-priority": "low",
      "x-openwebui-user-name": "snaptrack",
    });
    expect(seen?.body).toMatchObject({
      model: "Qwen3.6-35B-A3B-4bit",
      stream: false,
      temperature: 0,
      presence_penalty: 0,
      max_tokens: 8000,
      chat_template_kwargs: { enable_thinking: false },
    });
    const messages = seen?.body["messages"] as { role: string; content: unknown }[];
    expect(messages.map((m) => m.role)).toEqual(["system", "user"]);
    const parts = messages[1]?.content as { type: string; text?: string; image_url?: { url: string } }[];
    expect(parts[0]?.text).toContain("These 2 photos");
    expect(parts.slice(1).map((p) => p.image_url?.url)).toEqual([
      "data:image/jpeg;base64,AQID",
      "data:image/jpeg;base64,BAUG",
    ]);
  });

  it("returns the model's answer and name", async () => {
    const url = await relay((_req, _body, res) => {
      json(res, 200, completion('{"total": 5}'));
    });
    expect(await extractor(url).extract(images, signal())).toEqual({
      kind: "output",
      content: '{"total": 5}',
      model: "Qwen3.6-35B-A3B-4bit",
    });
  });

  it("reads an answer that oMLX preceded with keep-alive spaces", async () => {
    const url = await relay((_req, _body, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.write("   ");
      res.end(JSON.stringify(completion('{"total": 5}')));
    });
    expect(await extractor(url).extract(images, signal())).toMatchObject({
      kind: "output",
      content: '{"total": 5}',
    });
  });

  it("treats a 200 with no choices (a failure after oMLX committed to 200) as a failure", async () => {
    const url = await relay((_req, _body, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(`  ${JSON.stringify({ error: { message: "out of memory" } })}`);
    });
    const reply = await extractor(url).extract(images, signal());
    expect(reply).toMatchObject({ kind: "failure" });
    expect(reply.kind === "failure" && reply.message).toContain("out of memory");
  });

  it("waits when the owner has reserved the server, for as long as it says", async () => {
    const url = await relay((_req, _body, res) => {
      json(
        res,
        503,
        { error: { message: "reserved", type: "server_reserved", code: "server_reserved" } },
        { "retry-after": "300" },
      );
    });
    expect(await extractor(url).extract(images, signal())).toEqual({
      kind: "wait",
      reason: "reserved",
      retryAfterMs: 300_000,
    });
  });

  it("waits when a chat is running or another model is loaded", async () => {
    const url = await relay((_req, _body, res) => {
      json(
        res,
        503,
        { error: { message: "busy", type: "low_priority_busy", code: "low_priority_busy" } },
        { "retry-after": "30" },
      );
    });
    expect(await extractor(url).extract(images, signal())).toEqual({
      kind: "wait",
      reason: "busy",
      retryAfterMs: 30_000,
    });
  });

  it("waits when the model server isn't running (502) or the relay isn't (connection refused)", async () => {
    const url = await relay((_req, _body, res) => {
      json(res, 502, { error: { message: "The model server is not running." } });
    });
    expect(await extractor(url).extract(images, signal())).toEqual({
      kind: "wait",
      reason: "offline",
      retryAfterMs: null,
    });
    expect(await extractor("http://127.0.0.1:1").extract(images, signal())).toEqual({
      kind: "wait",
      reason: "offline",
      retryAfterMs: null,
    });
  });

  it("treats any other status, including an unknown 503, as a failure", async () => {
    for (const [status, body] of [
      [500, { error: { message: "boom" } }],
      [401, { error: { message: "bad key" } }],
      [503, { error: { code: "something_else" } }],
    ] as const) {
      const url = await relay((_req, _body, res) => {
        json(res, status, body);
      });
      expect(await extractor(url).extract(images, signal())).toMatchObject({ kind: "failure" });
    }
  });

  it("gives up after the time limit, as a failure", async () => {
    const url = await relay(() => {
      // never answers
    });
    expect(await extractor(url, 200).extract(images, signal())).toEqual({
      kind: "failure",
      message: "No answer within 0.2 s.",
    });
  });

  it("stopping SnapTrack mid-request is a wait to retry, not a failure", async () => {
    const url = await relay(() => {
      // never answers
    });
    const controller = new AbortController();
    const pending = extractor(url).extract(images, controller.signal);
    setTimeout(() => {
      controller.abort();
    }, 50);
    expect(await pending).toEqual({ kind: "wait", reason: "cancelled", retryAfterMs: null });
  });
});

describe("retryAfterMs", () => {
  it("reads seconds or an HTTP date", () => {
    expect(retryAfterMs("30")).toBe(30_000);
    expect(retryAfterMs(null)).toBeNull();
    expect(retryAfterMs("soon")).toBeNull();
    const now = Date.parse("2026-11-15T12:00:00Z");
    expect(retryAfterMs("Sun, 15 Nov 2026 12:01:00 GMT", now)).toBe(60_000);
  });
});
