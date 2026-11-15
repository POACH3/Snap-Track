import { describe, expect, it } from "vitest";
import { loadConfig } from "./load-config.ts";

const valid = {
  PORT: "4310",
  LLM_SERVER_URL: "http://127.0.0.1:8080",
  LLM_SERVER_API_KEY: "key",
  EXTRACTION_MODEL: "model",
  EXTRACTION_TIMEOUT_MS: "120000",
  DATABASE_PATH: "./data/snaptrack.db",
  IMAGE_DIR: "./data/images",
  SESSION_SECRET: "x".repeat(32),
  PUBLIC_ORIGIN: "https://mac.example.ts.net",
};

describe("loadConfig", () => {
  it("accepts a complete configuration and converts numbers", () => {
    const result = loadConfig(valid);
    expect(result.ok && result.value.PORT).toBe(4310);
    expect(result.ok && result.value.NODE_ENV).toBe("development");
  });

  it.each(Object.keys(valid))("refuses to start without %s, naming it", (name) => {
    const result = loadConfig({ ...valid, [name]: undefined });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.some((message) => message.startsWith(`${name}:`))).toBe(true);
  });

  it("reports every bad variable at once", () => {
    const result = loadConfig({
      ...valid,
      PORT: "not-a-port",
      SESSION_SECRET: "short",
      LLM_SERVER_URL: "nope",
    });
    expect(!result.ok && result.error.length).toBe(3);
  });

  it("refuses an out-of-range port and a short session secret", () => {
    expect(loadConfig({ ...valid, PORT: "70000" }).ok).toBe(false);
    expect(loadConfig({ ...valid, SESSION_SECRET: "x".repeat(31) }).ok).toBe(false);
  });
});
