import { err, newId, ok, type Clock, type Result, type Transaction } from "@snaptrack/core";
import {
  normalizeUsername,
  validateNewPassword,
  validateUsername,
  type PasswordError,
  type UsernameError,
} from "../domain/credentials.ts";
import { decideLoginAttempt, quietPeriodOver } from "../domain/login-throttle.ts";
import { isExpired, renewedExpiry, sessionExpiry } from "../domain/session-lifetime.ts";
import { toSignedInUser, type SignedInUser } from "../domain/user.ts";
import type {
  LoginAttempts,
  PasswordHasher,
  SessionRepository,
  SessionTokens,
  UserRepository,
} from "../ports.ts";

export interface AuthDeps {
  users: UserRepository;
  sessions: SessionRepository;
  hasher: PasswordHasher;
  tokens: SessionTokens;
  attempts: LoginAttempts;
  clock: Clock;
  transaction: Transaction;
}

export type LoginError =
  { kind: "invalid-credentials" } | { kind: "too-many-attempts"; retryAfterMs: number };

export interface NewSession {
  user: SignedInUser;
  token: string;
  expiresAt: Date;
}

export interface Authenticated {
  user: SignedInUser;
  /** Set when this request renewed the session, so the cookie must be renewed too. */
  renewedExpiresAt: Date | undefined;
}

export type CreateUserError = UsernameError | PasswordError | "display-name-invalid" | "username-taken";
export type SetPasswordError = PasswordError | "user-not-found";

export type AuthService = ReturnType<typeof createAuthService>;

export function createAuthService(deps: AuthDeps) {
  // Verifying against a real hash when the username is unknown makes that case take as
  // long as a wrong password, so response times don't reveal which usernames exist.
  let dummyHash: Promise<string> | undefined;
  const hashForUnknownUser = () => (dummyHash ??= deps.hasher.hash("unknown-user-placeholder"));

  return {
    async login(input: { username: string; password: string }): Promise<Result<NewSession, LoginError>> {
      const username = normalizeUsername(input.username);
      if (quietPeriodOver(deps.attempts.failures(username), deps.clock.now())) deps.attempts.clear(username);
      const decision = decideLoginAttempt(deps.attempts.failures(username), deps.clock.now());
      if (!decision.allowed) return err({ kind: "too-many-attempts", retryAfterMs: decision.retryAfterMs });

      const user = deps.users.findByUsername(username);
      const passwordHash = user?.passwordHash ?? (await hashForUnknownUser());
      const valid = await deps.hasher.verify(passwordHash, input.password);
      if (user === undefined || !valid) {
        deps.attempts.recordFailure(username, deps.clock.now());
        return err({ kind: "invalid-credentials" });
      }

      deps.attempts.clear(username);
      const now = deps.clock.now();
      const token = deps.tokens.generate();
      const expiresAt = sessionExpiry(now);
      deps.sessions.deleteExpired(now);
      deps.sessions.insert({ id: deps.tokens.idFor(token), userId: user.id, expiresAt });
      return ok({ user: toSignedInUser(user), token, expiresAt });
    },

    /** The signed-in user for a session token, or undefined if the token is missing, unknown or expired. */
    authenticate(token: string | undefined): Authenticated | undefined {
      if (token === undefined || token === "") return undefined;
      const id = deps.tokens.idFor(token);
      const session = deps.sessions.findById(id);
      if (session === undefined) return undefined;
      const now = deps.clock.now();
      if (isExpired(session.expiresAt, now)) {
        deps.sessions.delete(id);
        return undefined;
      }
      const user = deps.users.findById(session.userId);
      if (user === undefined) return undefined;
      const renewed = renewedExpiry(session.expiresAt, now);
      if (renewed !== null) deps.sessions.updateExpiry(id, renewed);
      return { user: toSignedInUser(user), renewedExpiresAt: renewed ?? undefined };
    },

    logout(token: string | undefined): void {
      if (token === undefined || token === "") return;
      deps.sessions.delete(deps.tokens.idFor(token));
    },

    async createUser(input: {
      username: string;
      displayName: string;
      password: string;
    }): Promise<Result<SignedInUser, CreateUserError>> {
      const username = validateUsername(input.username);
      if (!username.ok) return username;
      const displayName = input.displayName.trim();
      if (displayName.length === 0 || displayName.length > 64) return err("display-name-invalid");
      const password = validateNewPassword(input.password);
      if (!password.ok) return password;

      const user = {
        id: newId(),
        username: username.value,
        displayName,
        passwordHash: await deps.hasher.hash(password.value),
      };
      if (!deps.users.insert(user)) return err("username-taken");
      return ok(toSignedInUser(user));
    },

    /** Sets a new password and signs the user out everywhere. */
    async setPassword(input: {
      username: string;
      password: string;
    }): Promise<Result<null, SetPasswordError>> {
      const password = validateNewPassword(input.password);
      if (!password.ok) return password;
      const user = deps.users.findByUsername(normalizeUsername(input.username));
      if (user === undefined) return err("user-not-found");
      const passwordHash = await deps.hasher.hash(password.value);
      deps.transaction.run(() => {
        deps.users.updatePasswordHash(user.id, passwordHash);
        deps.sessions.deleteAllForUser(user.id);
      });
      return ok(null);
    },
  };
}
