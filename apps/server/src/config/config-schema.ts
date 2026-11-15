import { z } from "zod";

/** Every environment variable the server reads (SPEC.md §4.5). `.env.example` lists the same set. */
export const ConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535),
  LLM_SERVER_URL: z.url(),
  LLM_SERVER_API_KEY: z.string().min(1),
  EXTRACTION_MODEL: z.string().min(1),
  EXTRACTION_TIMEOUT_MS: z.coerce.number().int().positive(),
  DATABASE_PATH: z.string().min(1),
  IMAGE_DIR: z.string().min(1),
  SESSION_SECRET: z.string().min(32, "must be at least 32 characters"),
  PUBLIC_ORIGIN: z.url(),
});
export type Config = z.infer<typeof ConfigSchema>;
