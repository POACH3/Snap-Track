import { describe, expect, it } from "vitest";
import { createTestApp, CSRF_HEADER } from "../../testing/create-test-app.ts";

describe("HTTP server", () => {
  it("answers the health check", async () => {
    const response = await createTestApp().app.inject({ method: "GET", url: "/healthz" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("serves contract procedures under /rpc", async () => {
    const response = await createTestApp().app.inject({ url: "/rpc/health/ping", headers: CSRF_HEADER });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ json: { status: "ok" } });
  });

  it("refuses an API call without the CSRF header", async () => {
    const response = await createTestApp().app.inject({ url: "/rpc/health/ping" });
    expect(response.statusCode).toBe(403);
  });

  it("returns 404 for an unknown procedure", async () => {
    const response = await createTestApp().app.inject({
      method: "POST",
      url: "/rpc/health/nope",
      headers: CSRF_HEADER,
      payload: {},
    });
    expect(response.statusCode).toBe(404);
  });

  it("gives each request its own ID", async () => {
    const { app } = createTestApp();
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
