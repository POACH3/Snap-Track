// Every procedure requires a signed-in user unless its contract entry is marked public
// (docs/feature-plans/accounts-plan.md). This walks the whole contract, so a new procedure
// is covered without anyone remembering to add a test for it.
import { contract, type ProcedureMeta } from "@snaptrack/contracts";
import { describe, expect, it } from "vitest";
import { createTestApp, CSRF_HEADER } from "./create-test-app.ts";

interface Leaf {
  path: string;
  method: string;
  public: boolean;
}

interface ContractLeaf {
  "~orpc": { meta: ProcedureMeta; route: { method?: string } };
}

function isLeaf(value: unknown): value is ContractLeaf {
  return typeof value === "object" && value !== null && "~orpc" in value;
}

function leaves(node: object, prefix: string[] = []): Leaf[] {
  return Object.entries(node).flatMap(([key, value]: [string, unknown]) => {
    const path = [...prefix, key];
    if (isLeaf(value)) {
      const orpc = value["~orpc"];
      return [
        { path: path.join("/"), method: orpc.route.method ?? "POST", public: orpc.meta.public === true },
      ];
    }
    return typeof value === "object" && value !== null ? leaves(value, path) : [];
  });
}

const procedures = leaves(contract);
const PUBLIC = ["auth/login", "auth/logout", "health/ping"];

describe("API protection", () => {
  it("finds every procedure in the contract", () => {
    expect(procedures.length).toBeGreaterThanOrEqual(4);
  });

  it("only the intended procedures are public", () => {
    expect(procedures.filter((p) => p.public).map((p) => p.path)).toEqual(PUBLIC);
  });

  const isProtected = procedures.filter((p) => !p.public);
  it.each(isProtected.map((p) => [p.path, p] as const))(
    "%s refuses a request without a session, and with an unknown one",
    async (_path, procedure) => {
      const { app } = createTestApp();
      for (const cookie of [undefined, "snaptrack_session=made-up-token"]) {
        const headers: Record<string, string> = { ...CSRF_HEADER, "content-type": "application/json" };
        if (cookie !== undefined) headers["cookie"] = cookie;
        const response = await app.inject({
          method: procedure.method === "GET" ? "GET" : "POST",
          url: `/rpc/${procedure.path}`,
          headers,
          ...(procedure.method === "GET" ? {} : { payload: JSON.stringify({ json: {} }) }),
        });
        expect(response.statusCode).toBe(401);
      }
    },
  );
});
