// Architecture boundaries (SPEC.md §3.1, §3.6). `pnpm boundaries` fails on any violation.
// Paths are not anchored to the repo root so tooling/boundaries.test.ts can check these
// rules against deliberate violations in tooling/boundary-fixtures/.
const MODULE = "apps/server/src/modules/([^/]+)/";
const SHARED = ["packages/core/src/", "packages/contracts/src/"];
// Tests may import test tools and wire real modules together; layer rules apply to production code.
const TESTS = "\\.test\\.tsx?$";

export default {
  forbidden: [
    {
      name: "no-circular",
      comment: "Circular dependencies are not allowed (SPEC.md §4.3).",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "not-to-unresolvable",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: "domain-is-pure",
      comment:
        "Domain code imports only its own module's domain and the shared packages: no framework, no Node built-ins, no other layer (rule 2).",
      severity: "error",
      from: { path: `${MODULE}domain/`, pathNot: TESTS },
      to: { pathNot: ["apps/server/src/modules/$1/domain/", ...SHARED] },
    },
    {
      name: "application-uses-domain-and-ports",
      comment:
        "Use cases depend only on their domain, their ports, other modules' index.ts and the shared packages; never adapters or frameworks (rule 2).",
      severity: "error",
      from: { path: `${MODULE}application/`, pathNot: TESTS },
      to: {
        pathNot: [
          "apps/server/src/modules/$1/(domain|application)/",
          "apps/server/src/modules/$1/ports\\.ts$",
          "apps/server/src/modules/[^/]+/index\\.ts$",
          ...SHARED,
        ],
      },
    },
    {
      name: "only-through-index",
      comment: "Modules import each other only through index.ts (rule 3).",
      severity: "error",
      from: { path: MODULE },
      to: {
        path: "apps/server/src/modules/[^/]+/",
        pathNot: ["apps/server/src/modules/$1/", "apps/server/src/modules/[^/]+/index\\.ts$"],
      },
    },
    {
      name: "platform-not-into-modules",
      comment: "Platform code is cross-cutting and must not depend on any feature module.",
      severity: "error",
      from: { path: "apps/server/src/platform/", pathNot: TESTS },
      to: { path: "apps/server/src/modules/" },
    },
    {
      name: "core-stands-alone",
      comment: "packages/core is plain TypeScript with no dependencies.",
      severity: "error",
      from: { path: "packages/core/src/", pathNot: TESTS },
      to: { pathNot: "packages/core/src/" },
    },
    {
      name: "packages-not-into-apps",
      severity: "error",
      from: { path: "packages/" },
      to: { path: "apps/" },
    },
    {
      name: "apps-independent",
      comment: "The server and web client never import each other (SPEC.md §4.2).",
      severity: "error",
      from: { path: "apps/(server|web)/" },
      to: { path: "apps/(server|web)/", pathNot: "apps/$1/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    // Anchored: a bare "/dist/" would also hide every npm package that resolves into its own dist/.
    exclude: { path: ["^apps/[^/]+/(dist|dev-dist)/"] },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "types", "default"],
      extensions: [".ts", ".tsx", ".js", ".mjs"],
    },
  },
};
