import { err, ok, type Result } from "@snaptrack/core";
import { ConfigSchema, type Config } from "./config-schema.ts";

/** Validates the environment once at startup (SPEC.md §3.4). Returns one message per bad variable. */
export function loadConfig(env: Record<string, string | undefined>): Result<Config, string[]> {
  const parsed = ConfigSchema.safeParse(env);
  if (parsed.success) return ok(parsed.data);
  return err(parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`));
}
