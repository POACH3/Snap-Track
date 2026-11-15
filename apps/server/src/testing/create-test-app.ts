// The whole server wired like main.ts, but on an in-memory database with a fake clock, a fast
// password hasher and in-memory images by default. For HTTP-level and end-to-end tests.
import { FakeClock } from "@snaptrack/core/testing";
import { createAuthModule } from "../modules/auth/index.ts";
import { FakePasswordHasher } from "../modules/auth/testing/fake-password-hasher.ts";
import { healthRouter } from "../modules/health/index.ts";
import { createReceiptsModule, type FileStore, type ImageConverter } from "../modules/receipts/index.ts";
import { FakeImageConverter } from "../modules/receipts/testing/fake-image-converter.ts";
import { InMemoryFileStore } from "../modules/receipts/testing/in-memory-file-store.ts";
import { toDrizzle } from "../platform/db/connection.ts";
import { SqliteTransaction } from "../platform/db/sqlite-transaction.ts";
import { createTestDatabase } from "../platform/db/testing/test-database.ts";
import { createHttpServer } from "../platform/http/create-http-server.ts";
import { os } from "../platform/http/rpc.ts";

export const TEST_SESSION_SECRET = "test-secret-test-secret-test-secret!";

export interface TestAppOptions {
  secureCookies?: boolean;
  files?: FileStore;
  converter?: ImageConverter;
  maxRequestBytes?: number;
  webDistDir?: string;
  logLevel?: string;
}

export function createTestApp(options: TestAppOptions = {}) {
  const sqlite = createTestDatabase();
  const clock = new FakeClock();
  const db = toDrizzle(sqlite);
  const transaction = new SqliteTransaction(sqlite);
  const auth = createAuthModule({
    db,
    clock,
    transaction,
    sessionSecret: TEST_SESSION_SECRET,
    secureCookies: options.secureCookies ?? false,
    hasher: new FakePasswordHasher(),
  });
  const files = options.files ?? new InMemoryFileStore();
  const receipts = createReceiptsModule({
    db,
    clock,
    transaction,
    files,
    converter: options.converter ?? new FakeImageConverter(),
    users: auth.service,
  });
  const app = createHttpServer({
    router: os.router({ auth: auth.router, health: healthRouter, receipts: receipts.router }),
    authenticate: (cookieHeader) => auth.authenticate(cookieHeader),
    routes: [receipts.routes],
    logLevel: options.logLevel ?? "silent",
    webDistDir: options.webDistDir,
    ...(options.maxRequestBytes === undefined ? {} : { maxRequestBytes: options.maxRequestBytes }),
  });
  return { app, auth, receipts, files, clock, sqlite };
}

/** Headers every API call from the web client carries. */
export const CSRF_HEADER = { "x-csrf-token": "orpc" };
