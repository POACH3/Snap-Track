import { authContract } from "./auth.ts";
import { healthContract } from "./health.ts";

/** Every API endpoint, defined once and shared by server and client (SPEC.md §4.2). */
export const contract = {
  auth: authContract,
  health: healthContract,
};
export type Contract = typeof contract;

export type { ProcedureMeta } from "./procedure.ts";
export { LoginInput, PublicUser } from "./auth.ts";
export { PingOutput } from "./health.ts";
