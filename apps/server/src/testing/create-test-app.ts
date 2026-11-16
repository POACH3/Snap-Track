// The whole server wired like main.ts, but on an in-memory database with a fake clock, a fast
// password hasher and in-memory images by default. For HTTP-level and end-to-end tests.
import type { Clock } from "@snaptrack/core";
import { FakeClock } from "@snaptrack/core/testing";
import { createAuthModule } from "../modules/auth/index.ts";
import { createCatalogModule } from "../modules/catalog/index.ts";
import { FakePasswordHasher } from "../modules/auth/testing/fake-password-hasher.ts";
import { createExtractionModule, type ReceiptExtractor } from "../modules/extraction/index.ts";
import { ScriptedExtractor } from "../modules/extraction/testing/scripted-extractor.ts";
import { healthRouter } from "../modules/health/index.ts";
import {
  createReceiptsModule,
  SqlitePurchaseLabelUsage,
  type FileStore,
  type ImageConverter,
} from "../modules/receipts/index.ts";
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
  /** Defaults to a scripted extractor with no replies; the worker isn't started unless a test starts it. */
  extractor?: ReceiptExtractor;
  maxRequestBytes?: number;
  webDistDir?: string;
  logLevel?: string;
  /** Defaults to a fake clock that never moves; the e2e server passes the real one. */
  clock?: Clock;
}

export function createTestApp(options: TestAppOptions = {}) {
  const sqlite = createTestDatabase();
  // Tests move the fake clock; the e2e server passes the real one instead.
  const fakeClock = new FakeClock();
  const clock = options.clock ?? fakeClock;
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
  const catalog = createCatalogModule({ db, clock, transaction, usage: new SqlitePurchaseLabelUsage(db) });
  const files = options.files ?? new InMemoryFileStore();
  const receipts = createReceiptsModule({
    db,
    clock,
    transaction,
    files,
    converter: options.converter ?? new FakeImageConverter(),
    users: auth.service,
    catalog: catalog.service,
    onUploaded: {
      receiptUploaded: (receiptId) => {
        extraction.uploadedListener.receiptUploaded(receiptId);
      },
    },
    onDeleted: {
      receiptDeleted: (receiptId) => {
        extraction.deletedListener.receiptDeleted(receiptId);
      },
    },
  });
  const extraction = createExtractionModule({
    db,
    clock,
    transaction,
    receipts: receipts.service,
    labels: catalog.service,
    extractor: options.extractor ?? new ScriptedExtractor(),
    log: { info: () => undefined, error: () => undefined },
  });
  const app = createHttpServer({
    router: os.router({
      auth: auth.router,
      catalog: catalog.router,
      health: healthRouter,
      receipts: receipts.router,
    }),
    authenticate: (cookieHeader) => auth.authenticate(cookieHeader),
    routes: [receipts.routes],
    logLevel: options.logLevel ?? "silent",
    webDistDir: options.webDistDir,
    ...(options.maxRequestBytes === undefined ? {} : { maxRequestBytes: options.maxRequestBytes }),
  });
  return { app, auth, catalog, receipts, extraction, files, clock: fakeClock, sqlite };
}

/** Headers every API call from the web client carries. */
export const CSRF_HEADER = { "x-csrf-token": "orpc" };
