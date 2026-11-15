// Port contract test (SPEC.md §3.5): the fake must behave like the real adapter.
import { describe, expect, it } from "vitest";
import { Argon2PasswordHasher } from "../adapters/argon2-password-hasher.ts";
import type { PasswordHasher } from "../ports.ts";
import { FakePasswordHasher } from "./fake-password-hasher.ts";

describe.each<[string, () => PasswordHasher]>([
  ["Argon2PasswordHasher", () => new Argon2PasswordHasher()],
  ["FakePasswordHasher", () => new FakePasswordHasher()],
])("PasswordHasher contract: %s", (_name, create) => {
  it("verifies the password it hashed", async () => {
    const hasher = create();
    expect(await hasher.verify(await hasher.hash("correct horse battery"), "correct horse battery")).toBe(
      true,
    );
  });

  it("rejects a different password", async () => {
    const hasher = create();
    const hash = await hasher.hash("correct horse battery");
    expect(await hasher.verify(hash, "correct horse batterY")).toBe(false);
    expect(await hasher.verify(hash, "")).toBe(false);
  });

  it("salts: two hashes of one password differ, and both verify", async () => {
    const hasher = create();
    const [a, b] = [await hasher.hash("same password"), await hasher.hash("same password")];
    expect(a).not.toBe(b);
    expect(await hasher.verify(a, "same password")).toBe(true);
    expect(await hasher.verify(b, "same password")).toBe(true);
  });

  it("rejects a malformed hash instead of throwing", async () => {
    expect(await create().verify("not-a-hash", "anything")).toBe(false);
  });

  it("handles passwords with any characters", async () => {
    const hasher = create();
    const password = "pässwörd 🔑 $ with $dollars$";
    expect(await hasher.verify(await hasher.hash(password), password)).toBe(true);
  });
});

describe("Argon2PasswordHasher format", () => {
  it("stores a standard argon2id PHC string with the OWASP minimum parameters", async () => {
    const hash = await new Argon2PasswordHasher().hash("x");
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/);
  });

  it("never contains the password", async () => {
    expect(await new Argon2PasswordHasher().hash("plain-text-check-123")).not.toContain(
      "plain-text-check-123",
    );
  });
});
