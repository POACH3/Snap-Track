import { oc } from "@orpc/contract";

/** Metadata on every procedure. `public: true` lets it run without a signed-in user. */
export interface ProcedureMeta {
  public?: boolean;
}

/** Start every procedure from this, so every one carries `ProcedureMeta`. Protected unless marked public. */
export const procedure = oc.$meta<ProcedureMeta>({});
export const publicProcedure = procedure.meta({ public: true });
