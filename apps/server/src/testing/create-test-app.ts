// The whole server wired like main.ts, but on an in-memory database with a fake clock and
// a fast password hasher. For HTTP-level tests.
import { FakeClock } from "@snaptrack/core/testing";
import { createAuthModule } from "../modules/auth/index.ts";
import { FakePasswordHasher } from "../modules/auth/testing/fake-password-hasher.ts";
import { healthRouter } from "../modules/health/index.ts";
import { toDrizzle } from "../platform/db/connection.ts";
import { SqliteTransaction } from "../platform/db/sqlite-transaction.ts";
import { createTestDatabase } from "../platform/db/testing/test-database.ts";
import { createHttpServer } from "../platform/http/create-http-server.ts";
import { os } from "../platform/http/rpc.ts";

export const TEST_SESSION_SECRET = "test-secret-test-secret-test-secret!";

export function createTestApp(options: { secureCookies?: boolean } = {}) {
  const sqlite = createTestDatabase();
  const clock = new FakeClock();
  const auth = createAuthModule({
    db: toDrizzle(sqlite),
    clock,
    transaction: new SqliteTransaction(sqlite),
    sessionSecret: TEST_SESSION_SECRET,
    secureCookies: options.secureCookies ?? false,
    hasher: new FakePasswordHasher(),
  });
  const app = createHttpServer({
    router: os.router({ auth: auth.router, health: healthRouter }),
    authenticate: (cookieHeader) => auth.authenticate(cookieHeader),
    logLevel: "silent",
    webDistDir: undefined,
  });
  return { app, auth, clock, sqlite };
}

/** Headers every API call from the web client carries. */
export const CSRF_HEADER = { "x-csrf-token": "orpc" };
