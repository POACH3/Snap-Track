import { describe, expect, it } from "vitest";
import { healthRouter } from "../../modules/health/index.ts";
import { createHttpServer } from "./create-http-server.ts";
import { os } from "./rpc.ts";

const server = () =>
  createHttpServer({
    router: os.router({ health: healthRouter }),
    logLevel: "silent",
    webDistDir: undefined,
  });

describe("HTTP server", () => {
  it("answers the health check", async () => {
    const response = await server().inject({ method: "GET", url: "/healthz" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("serves contract procedures under /rpc", async () => {
    const response = await server().inject({ method: "GET", url: "/rpc/health/ping" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ json: { status: "ok" } });
  });

  it("returns 404 for an unknown procedure", async () => {
    const response = await server().inject({ method: "POST", url: "/rpc/health/nope", payload: {} });
    expect(response.statusCode).toBe(404);
  });

  it("gives each request its own ID", async () => {
    const app = server();
    const ids = new Set<string>();
    app.addHook("onRequest", (request, _reply, done) => {
      ids.add(request.id);
      done();
    });
    await app.inject({ url: "/healthz" });
    await app.inject({ url: "/healthz" });
    expect(ids.size).toBe(2);
  });
});
