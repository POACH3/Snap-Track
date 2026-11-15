import type { Clock, Transaction } from "@snaptrack/core";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { createAuthService, type AuthDeps } from "../application/auth-service.ts";
import type { PasswordHasher } from "../ports.ts";
import { Argon2PasswordHasher } from "./argon2-password-hasher.ts";
import { HmacSessionTokens } from "./hmac-session-tokens.ts";
import { InMemoryLoginAttempts } from "./in-memory-login-attempts.ts";
import { createAuthRouter } from "./rpc.ts";
import { createSessionCookie } from "./session-cookie.ts";
import { SqliteSessionRepository, SqliteUserRepository } from "./sqlite-repositories.ts";

export interface AuthModuleOptions {
  db: BetterSQLite3Database;
  clock: Clock;
  transaction: Transaction;
  sessionSecret: string;
  /** True when served over HTTPS: the cookie is then Secure and `__Host-` prefixed. */
  secureCookies: boolean;
  /** Tests pass a fast fake; production uses Argon2id. */
  hasher?: PasswordHasher;
}

/** Wires the auth module's adapters to its ports. Called from a composition root. */
export function createAuthModule(options: AuthModuleOptions) {
  const deps: AuthDeps = {
    users: new SqliteUserRepository(options.db, options.clock),
    sessions: new SqliteSessionRepository(options.db, options.clock),
    hasher: options.hasher ?? new Argon2PasswordHasher(),
    tokens: new HmacSessionTokens(options.sessionSecret),
    attempts: new InMemoryLoginAttempts(),
    clock: options.clock,
    transaction: options.transaction,
  };
  const service = createAuthService(deps);
  const cookie = createSessionCookie({ secure: options.secureCookies });

  return {
    service,
    router: createAuthRouter(service, cookie, options.clock),
    /** For the HTTP server: the user behind a request's cookie, renewing the cookie when due. */
    authenticate(cookieHeader: string | undefined) {
      const token = cookie.read(cookieHeader);
      const result = service.authenticate(token);
      if (result === undefined || token === undefined) return null;
      const setCookie =
        result.renewedExpiresAt === undefined
          ? undefined
          : cookie.set(token, result.renewedExpiresAt, options.clock.now());
      return setCookie === undefined ? { user: result.user } : { user: result.user, setCookie };
    },
  };
}
