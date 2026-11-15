import { healthContract } from "./health.ts";

/** Every API endpoint, defined once and shared by server and client (SPEC.md §4.2). */
export const contract = {
  health: healthContract,
};
export type Contract = typeof contract;

export { PingOutput } from "./health.ts";
