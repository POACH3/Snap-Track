import type { Id } from "@snaptrack/core";
import type { Session, User } from "./domain/user.ts";

/** Repositories are synchronous (SPEC.md §3.1 rule 7). */
export interface UserRepository {
  findById(id: Id): User | undefined;
  findByUsername(username: string): User | undefined;
  /** Returns false if the username is taken. */
  insert(user: User): boolean;
  updatePasswordHash(id: Id, passwordHash: string): void;
}

export interface SessionRepository {
  insert(session: Session): void;
  findById(id: string): Session | undefined;
  updateExpiry(id: string, expiresAt: Date): void;
  delete(id: string): void;
  deleteAllForUser(userId: Id): void;
  deleteExpired(now: Date): void;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(passwordHash: string, password: string): Promise<boolean>;
}

/** Makes session tokens and the keyed hash stored for each. */
export interface SessionTokens {
  generate(): string;
  idFor(token: string): string;
}

/** Recent failed logins per username. */
export interface LoginAttempts {
  failures(username: string): Date[];
  recordFailure(username: string, at: Date): void;
  clear(username: string): void;
}
