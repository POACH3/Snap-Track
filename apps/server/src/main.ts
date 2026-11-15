// Composition root (SPEC.md §3.1 rule 5): validates config, wires adapters to ports, starts the server.
import { mkdirSync } from "node:fs";
import { loadConfig } from "./config/load-config.ts";
import { openSqlite, toDrizzle } from "./platform/db/connection.ts";
import { countPendingMigrations } from "./platform/db/migrations.ts";
import { SqliteTransaction } from "./platform/db/sqlite-transaction.ts";
import { createHttpServer } from "./platform/http/create-http-server.ts";
import { os } from "./platform/http/rpc.ts";
import { systemClock } from "./platform/system-clock.ts";
import { createAuthModule } from "./modules/auth/index.ts";
import { createExtractionModule, RelayExtractor } from "./modules/extraction/index.ts";
import { healthRouter } from "./modules/health/index.ts";
import { createReceiptsModule, FileSystemFileStore, SipsImageConverter } from "./modules/receipts/index.ts";

const config = loadConfig(process.env);
if (!config.ok) {
  console.error(`SnapTrack will not start: the configuration is invalid.\n  ${config.error.join("\n  ")}`);
  process.exit(1);
}
const {
  NODE_ENV,
  PORT,
  DATABASE_PATH,
  IMAGE_DIR,
  SESSION_SECRET,
  PUBLIC_ORIGIN,
  LLM_SERVER_URL,
  LLM_SERVER_API_KEY,
  EXTRACTION_MODEL,
  EXTRACTION_TIMEOUT_MS,
} = config.value;

let sqlite;
try {
  sqlite = openSqlite(DATABASE_PATH, { mustExist: true });
} catch {
  console.error(`SnapTrack will not start: no database at ${DATABASE_PATH}. Run \`pnpm db:migrate\` first.`);
  process.exit(1);
}
const pending = countPendingMigrations(sqlite);
if (pending > 0) {
  console.error(
    `SnapTrack will not start: ${pending} migration(s) not applied. Run \`pnpm db:migrate\` first.`,
  );
  process.exit(1);
}

const db = toDrizzle(sqlite);
const transaction = new SqliteTransaction(sqlite);

const auth = createAuthModule({
  db,
  clock: systemClock,
  transaction,
  sessionSecret: SESSION_SECRET,
  secureCookies: PUBLIC_ORIGIN.startsWith("https://"),
});

// The service writes only under its data folder (SPEC.md §4.7), which holds IMAGE_DIR.
mkdirSync(IMAGE_DIR, { recursive: true });
const receipts = createReceiptsModule({
  db,
  clock: systemClock,
  transaction,
  files: new FileSystemFileStore(IMAGE_DIR),
  converter: new SipsImageConverter(),
  users: auth.service,
  // Each new receipt is queued for extraction in the transaction that saves it (SPEC.md §4.3).
  onUploaded: {
    receiptUploaded: (receiptId) => {
      extraction.uploadedListener.receiptUploaded(receiptId);
    },
  },
});

const extraction = createExtractionModule({
  db,
  clock: systemClock,
  transaction,
  receipts: receipts.service,
  extractor: new RelayExtractor({
    baseUrl: LLM_SERVER_URL,
    apiKey: LLM_SERVER_API_KEY,
    model: EXTRACTION_MODEL,
    timeoutMs: EXTRACTION_TIMEOUT_MS,
  }),
  log: {
    info: (details, message) => {
      app.log.info(details, message);
    },
    error: (details, message) => {
      app.log.error(details, message);
    },
  },
});

const router = os.router({ auth: auth.router, health: healthRouter, receipts: receipts.router });

const app = createHttpServer({
  router,
  authenticate: (cookieHeader) => auth.authenticate(cookieHeader),
  routes: [receipts.routes],
  logLevel: NODE_ENV === "production" ? "info" : "debug",
  webDistDir: NODE_ENV === "development" ? undefined : new URL("../../web/dist", import.meta.url).pathname,
});

// launchd stops the service with SIGTERM.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    void extraction.worker
      .stop()
      .then(() => app.close())
      .then(() => {
        sqlite.close();
        process.exit(0);
      });
  });
}

await app.listen({ host: "127.0.0.1", port: PORT });
extraction.worker.start();
