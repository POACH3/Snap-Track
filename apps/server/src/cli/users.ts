// `pnpm user:create` and `pnpm user:set-password`: manage household logins (SPEC.md §9).
// Both change the database in DATABASE_PATH; see .claude/rules/database-commands.md.
// A second entry point beside main.ts, wired the same way.
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { loadConfig } from "../config/load-config.ts";
import { openSqlite, toDrizzle } from "../platform/db/connection.ts";
import { countPendingMigrations } from "../platform/db/migrations.ts";
import { SqliteTransaction } from "../platform/db/sqlite-transaction.ts";
import { systemClock } from "../platform/system-clock.ts";
import { createAuthModule } from "../modules/auth/index.ts";

const MESSAGES: Record<string, string> = {
  "invalid-username": "Usernames are 2–32 characters: letters, digits, dot, underscore or hyphen.",
  "display-name-invalid": "The display name must be 1–64 characters.",
  "password-too-short": "Passwords must be at least 10 characters.",
  "username-taken": "That username is already in use.",
  "user-not-found": "There is no user with that username.",
};

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const command = process.argv[2];
if (command !== "create" && command !== "set-password") {
  fail("Usage: users.ts create | set-password");
}

const config = loadConfig(process.env);
if (!config.ok) fail(`The configuration is invalid.\n  ${config.error.join("\n  ")}`);
const { DATABASE_PATH, SESSION_SECRET, PUBLIC_ORIGIN } = config.value;

const sqlite = (() => {
  try {
    return openSqlite(DATABASE_PATH, { mustExist: true });
  } catch {
    return fail(`No database at ${DATABASE_PATH}. Run \`pnpm db:migrate\` first.`);
  }
})();
if (countPendingMigrations(sqlite) > 0) fail("Migrations are pending. Run `pnpm db:migrate` first.");

const auth = createAuthModule({
  db: toDrizzle(sqlite),
  clock: systemClock,
  transaction: new SqliteTransaction(sqlite),
  sessionSecret: SESSION_SECRET,
  secureCookies: PUBLIC_ORIGIN.startsWith("https://"),
});

// Prompts read from the terminal; typed passwords are not echoed.
let muted = false;
const output = new Writable({
  write(chunk: Buffer, _encoding, done) {
    if (!muted) process.stdout.write(chunk);
    done();
  },
});
const prompt = createInterface({ input: process.stdin, output, terminal: process.stdin.isTTY });
// Reading through the iterator buffers lines, so piped input works as well as typing.
const lines = prompt[Symbol.asyncIterator]();
async function ask(question: string): Promise<string> {
  process.stdout.write(question);
  const line = await lines.next();
  return line.done === true ? fail("\nInput ended early.") : line.value;
}
async function askHidden(question: string): Promise<string> {
  muted = true;
  try {
    return await ask(question);
  } finally {
    muted = false;
    process.stdout.write("\n");
  }
}
async function askNewPassword(): Promise<string> {
  const password = await askHidden("Password (at least 10 characters): ");
  if ((await askHidden("Password again: ")) !== password) fail("The passwords don't match.");
  return password;
}

try {
  if (command === "create") {
    const username = await ask("Username: ");
    const displayName = await ask("Display name (shown in the app): ");
    const result = await auth.service.createUser({ username, displayName, password: await askNewPassword() });
    if (!result.ok) fail(MESSAGES[result.error] ?? result.error);
    console.log(`Created ${result.value.displayName} (${result.value.username}).`);
  } else {
    const username = await ask("Username: ");
    const result = await auth.service.setPassword({ username, password: await askNewPassword() });
    if (!result.ok) fail(MESSAGES[result.error] ?? result.error);
    console.log(`Password changed for ${username.trim().toLowerCase()}; they are signed out everywhere.`);
  }
} finally {
  prompt.close();
  sqlite.close();
}
