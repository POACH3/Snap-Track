// Login, session and logout over real HTTP, as the web client uses them.
import { beforeEach, describe, expect, it } from "vitest";
import { createTestApp, CSRF_HEADER } from "../../../testing/create-test-app.ts";

const DAY = 24 * 60 * 60 * 1000;
const PASSWORD = "correct horse battery";

let t: ReturnType<typeof createTestApp>;

beforeEach(async () => {
  t = createTestApp();
  await t.auth.service.createUser({ username: "sam", displayName: "Sam Smith", password: PASSWORD });
});

function call(path: string, options: { body?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = { ...CSRF_HEADER };
  if (options.cookie !== undefined) headers["cookie"] = options.cookie;
  return options.body === undefined
    ? t.app.inject({ method: "GET", url: `/rpc/${path}`, headers })
    : t.app.inject({
        method: "POST",
        url: `/rpc/${path}`,
        headers: { ...headers, "content-type": "application/json" },
        payload: JSON.stringify({ json: options.body }),
      });
}

/** The `name=value` part of a Set-Cookie header, ready to send back. */
function cookiePair(setCookie: string | string[] | undefined): string {
  const header = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return (header ?? "").split(";")[0] ?? "";
}

async function login(): Promise<string> {
  const response = await call("auth/login", { body: { username: "sam", password: PASSWORD } });
  expect(response.statusCode).toBe(200);
  return cookiePair(response.headers["set-cookie"]);
}

describe("auth over HTTP", () => {
  it("login sets an HttpOnly, SameSite=Lax session cookie and returns the user", async () => {
    const response = await call("auth/login", { body: { username: "SAM", password: PASSWORD } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ json: { user: { username: "sam", displayName: "Sam Smith" } } });
    const setCookie = String(response.headers["set-cookie"]);
    expect(setCookie).toMatch(
      /^snaptrack_session=[A-Za-z0-9_-]{43}; Max-Age=7776000; Path=\/; HttpOnly; SameSite=Lax$/,
    );
  });

  it("over HTTPS the cookie is Secure and __Host- prefixed", async () => {
    t = createTestApp({ secureCookies: true });
    await t.auth.service.createUser({ username: "sam", displayName: "Sam", password: PASSWORD });
    const response = await call("auth/login", { body: { username: "sam", password: PASSWORD } });
    expect(String(response.headers["set-cookie"])).toMatch(/^__Host-snaptrack_session=.*; Secure$/);
  });

  it("a wrong password is a 401 INVALID_CREDENTIALS with no cookie", async () => {
    const response = await call("auth/login", { body: { username: "sam", password: "wrong" } });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ json: { code: "INVALID_CREDENTIALS", defined: true } });
    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("too many failures is a 429 saying how long to wait", async () => {
    for (let i = 0; i < 5; i++) await call("auth/login", { body: { username: "sam", password: "wrong" } });
    const response = await call("auth/login", { body: { username: "sam", password: PASSWORD } });
    expect(response.statusCode).toBe(429);
    expect(response.json()).toMatchObject({
      json: { code: "TOO_MANY_ATTEMPTS", data: { retryAfterSeconds: 900 } },
    });
  });

  it("me returns the signed-in user with the cookie, and 401 without", async () => {
    const cookie = await login();
    expect((await call("auth/me", { cookie })).json()).toMatchObject({ json: { user: { username: "sam" } } });
    expect((await call("auth/me")).statusCode).toBe(401);
  });

  it("renews the cookie when the session is renewed", async () => {
    const cookie = await login();
    t.clock.advance(2 * DAY);
    const response = await call("auth/me", { cookie });
    expect(response.statusCode).toBe(200);
    expect(String(response.headers["set-cookie"])).toContain("Max-Age=7776000");
    expect(cookiePair(response.headers["set-cookie"])).toBe(cookie);
  });

  it("refuses an expired session", async () => {
    const cookie = await login();
    t.clock.advance(90 * DAY);
    expect((await call("auth/me", { cookie })).statusCode).toBe(401);
  });

  it("logout ends the session and clears the cookie", async () => {
    const cookie = await login();
    const response = await call("auth/logout", { body: {}, cookie });
    expect(response.statusCode).toBe(200);
    expect(String(response.headers["set-cookie"])).toMatch(/^snaptrack_session=; Max-Age=0;/);
    expect((await call("auth/me", { cookie })).statusCode).toBe(401);
  });

  it("logout works without a session, so a stale cookie can always be cleared", async () => {
    expect((await call("auth/logout", { body: {}, cookie: "snaptrack_session=stale" })).statusCode).toBe(200);
  });
});
