import type { PasswordHasher } from "../ports.ts";

/** Instant stand-in for Argon2 in tests. Salted, so two hashes of one password differ, like the real one. */
export class FakePasswordHasher implements PasswordHasher {
  #counter = 0;

  hash(password: string): Promise<string> {
    this.#counter += 1;
    return Promise.resolve(`fake$${this.#counter}$${password}`);
  }

  verify(passwordHash: string, password: string): Promise<boolean> {
    const [kind, salt, ...rest] = passwordHash.split("$");
    return Promise.resolve(kind === "fake" && salt !== undefined && rest.join("$") === password);
  }
}
