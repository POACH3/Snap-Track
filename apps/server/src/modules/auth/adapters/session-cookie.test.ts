import { describe, expect, it } from "vitest";
import { createSessionCookie } from "./session-cookie.ts";

const now = new Date("2026-05-01T00:00:00.000Z");
const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

describe("session cookie", () => {
  it("over HTTPS: __Host- name, Secure, HttpOnly, SameSite=Lax, Path=/, Max-Age", () => {
    expect(createSessionCookie({ secure: true }).set("tok", in90Days, now)).toBe(
      "__Host-snaptrack_session=tok; Max-Age=7776000; Path=/; HttpOnly; SameSite=Lax; Secure",
    );
  });

  it("over plain http in development: no prefix and no Secure, so the browser keeps it", () => {
    expect(createSessionCookie({ secure: false }).set("tok", in90Days, now)).toBe(
      "snaptrack_session=tok; Max-Age=7776000; Path=/; HttpOnly; SameSite=Lax",
    );
  });

  it("clears with Max-Age=0 and the same attributes", () => {
    expect(createSessionCookie({ secure: true }).clear()).toBe(
      "__Host-snaptrack_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax; Secure",
    );
  });

  it("reads its own cookie from a header with others", () => {
    const cookie = createSessionCookie({ secure: true });
    expect(cookie.read("a=1; __Host-snaptrack_session=abc-_123; b=2")).toBe("abc-_123");
    expect(cookie.read("snaptrack_session=wrong-name")).toBeUndefined();
    expect(cookie.read(undefined)).toBeUndefined();
  });
});
