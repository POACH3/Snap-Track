// The whole server for Playwright (pnpm test:e2e): wired like main.ts, but on an in-memory
// database with one test user, real sips, and a temporary image folder removed on exit.
// Serves the built web app, so run `pnpm build` first.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileSystemFileStore, SipsImageConverter } from "../modules/receipts/index.ts";
import { createTestApp } from "./create-test-app.ts";

export const E2E_USER = { username: "e2e", displayName: "Pat Tester", password: "e2e-password-123" };

const port = Number(process.env["E2E_PORT"] ?? "4399");
const imageDir = mkdtempSync(join(tmpdir(), "snaptrack-e2e-"));

const { app, auth, sqlite } = createTestApp({
  files: new FileSystemFileStore(imageDir),
  converter: new SipsImageConverter(),
  webDistDir: new URL("../../../web/dist", import.meta.url).pathname,
  logLevel: "warn",
});
await auth.service.createUser(E2E_USER);

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    void app.close().then(() => {
      sqlite.close();
      rmSync(imageDir, { recursive: true, force: true });
      process.exit(0);
    });
  });
}

await app.listen({ host: "127.0.0.1", port });
