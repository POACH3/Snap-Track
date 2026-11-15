import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

interface Violation {
  from: string;
  to: string;
  rule: { name: string };
}

function cruiseFixtures(): Violation[] {
  const run = spawnSync("pnpm", ["exec", "depcruise", "tooling/boundary-fixtures", "--output-type", "json"], {
    encoding: "utf8",
  });
  const report = JSON.parse(run.stdout) as { summary: { violations: Violation[] } };
  return report.summary.violations;
}

const base = "tooling/boundary-fixtures/";

describe("boundary rules catch deliberate violations", () => {
  const violations = cruiseFixtures();
  const has = (rule: string, from: string) =>
    violations.some((v) => v.rule.name === rule && (v.from + "/").startsWith(base + from));

  it.each([
    ["domain-is-pure", "apps/server/src/modules/a/domain/imports-framework.ts"],
    ["domain-is-pure", "apps/server/src/modules/a/domain/imports-node.ts"],
    ["domain-is-pure", "apps/server/src/modules/a/domain/imports-application.ts"],
    ["application-uses-domain-and-ports", "apps/server/src/modules/a/application/use-case.ts"],
    ["only-through-index", "apps/server/src/modules/b/adapters/reaches-into-a.ts"],
    ["platform-not-into-modules", "apps/server/src/platform/imports-module.ts"],
    ["packages-not-into-apps", "packages/core/src/imports-app.ts"],
    ["core-stands-alone", "packages/core/src/imports-app.ts"],
    // A cycle is reported from whichever of its files comes first.
    ["no-circular", "apps/server/src/modules/a/adapters"],
  ])("%s flags %s", (rule, from) => {
    expect(has(rule, from)).toBe(true);
  });

  it("does not flag allowed imports", () => {
    expect(violations.some((v) => v.from === base + "apps/server/src/modules/a/index.ts")).toBe(false);
  });
});
