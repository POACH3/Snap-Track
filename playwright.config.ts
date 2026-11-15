import { defineConfig, devices } from "@playwright/test";

// End-to-end tests (SPEC.md §3.5): capture and upload through the real server and built web app.
// `pnpm test:e2e` builds the web app first; the server runs on an in-memory database.
const PORT = 4399;

export default defineConfig({
  testDir: "apps/web/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env["CI"]),
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // The service worker would cache the app between tests; these tests are about the server path.
    serviceWorkers: "block",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", grep: /@desktop/, use: { ...devices["Desktop Chrome"] } },
    { name: "phone", grep: /@phone/, use: { ...devices["iPhone 13"] } },
  ],
  webServer: {
    command: "node apps/server/src/testing/e2e-server.ts",
    url: `http://127.0.0.1:${PORT}/healthz`,
    env: { E2E_PORT: String(PORT) },
    reuseExistingServer: false,
    stdout: "pipe",
  },
});
