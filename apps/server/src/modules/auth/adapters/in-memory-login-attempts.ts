import { MAX_FAILED_ATTEMPTS } from "../domain/login-throttle.ts";
import type { LoginAttempts } from "../ports.ts";

/** Kept in memory: a restart forgets recent failures, which is acceptable for a household. */
export class InMemoryLoginAttempts implements LoginAttempts {
  readonly #failures = new Map<string, Date[]>();

  failures(username: string): Date[] {
    return [...(this.#failures.get(username) ?? [])];
  }

  recordFailure(username: string, at: Date): void {
    // The throttle rule only ever looks at the most recent MAX_FAILED_ATTEMPTS.
    const kept = [...(this.#failures.get(username) ?? []), at].slice(-MAX_FAILED_ATTEMPTS);
    this.#failures.set(username, kept);
  }

  clear(username: string): void {
    this.#failures.delete(username);
  }
}
