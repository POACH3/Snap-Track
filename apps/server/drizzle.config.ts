import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  // Each module keeps its tables in its own adapters/*schema.ts (SPEC.md §3.1 rule 4).
  schema: ["./src/platform/db/meta-schema.ts", "./src/modules/*/adapters/*schema.ts"],
  out: "./drizzle",
});
