import { implement } from "@orpc/server";
import { contract } from "@snaptrack/contracts";

/** The contract's server side. Modules implement their procedures from this (SPEC.md §4.2). */
export const os = implement(contract);
