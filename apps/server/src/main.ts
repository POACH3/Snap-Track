// Composition root (SPEC.md §3.1 rule 5): validates config, wires adapters to ports, starts the server.
import { loadConfig } from "./config/load-config.ts";
import { openSqlite, toDrizzle } from "./platform/db/connection.ts";
import { countPendingMigrations } from "./platform/db/migrations.ts";
import { SqliteTransaction } from "./platform/db/sqlite-transaction.ts";
import { createHttpServer } from "./platform/http/create-http-server.ts";
import { os } from "./platform/http/rpc.ts";
import { systemClock } from "./platform/system-clock.ts";
import { createAuthModule } from "./modules/auth/index.ts";
import { healthRouter } from "./modules/health/index.ts";

const config = loadConfig(process.env);
if (!config.ok) {
  console.error(`SnapTrack will not start: the configuration is invalid.\n  ${config.error.join("\n  ")}`);
  process.exit(1);
}
const { NODE_ENV, PORT, DATABASE_PATH, SESSION_SECRET, PUBLIC_ORIGIN } = config.value;

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

const router = os.router({ auth: auth.router, health: healthRouter });

const app = createHttpServer({
  router,
  authenticate: (cookieHeader) => auth.authenticate(cookieHeader),
  logLevel: NODE_ENV === "production" ? "info" : "debug",
  webDistDir: NODE_ENV === "development" ? undefined : new URL("../../web/dist", import.meta.url).pathname,
});

// launchd stops the service with SIGTERM.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    void app.close().then(() => {
      sqlite.close();
      process.exit(0);
    });
  });
}

await app.listen({ host: "127.0.0.1", port: PORT });
