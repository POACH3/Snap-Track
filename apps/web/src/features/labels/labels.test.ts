import type { Category } from "@snaptrack/contracts";
import { describe, expect, it } from "vitest";
import { ancestorIds, childrenOf, hiddenIds, pathsOf } from "./labels.ts";

const c = (id: string, name: string, level: number, parentId: string | null, archived = false): Category => ({
  id,
  name,
  level,
  parentId,
  sortOrder: 0,
  archived,
});
const all = [
  c("g", "Groceries", 1, null),
  c("d", "Dairy", 2, "g"),
  c("m", "Milk", 3, "d"),
  c("f", "Frozen", 2, "g", true),
  c("i", "Ice cream", 3, "f"),
];

describe("labels", () => {
  it("writes full paths", () => {
    expect(pathsOf(all).get("m")).toBe("Groceries › Dairy › Milk");
    expect(pathsOf(all).get("g")).toBe("Groceries");
  });

  it("hides archived entries and everything below them", () => {
    expect([...hiddenIds(all)].sort()).toEqual(["f", "i"]);
  });

  it("lists children by parent and ancestors top first", () => {
    expect(
      childrenOf(all)
        .get("g")
        ?.map((x) => x.id),
    ).toEqual(["d", "f"]);
    expect(ancestorIds(all, "m")).toEqual(["g", "d"]);
  });
});
