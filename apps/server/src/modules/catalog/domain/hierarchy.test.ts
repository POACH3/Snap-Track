import { describe, expect, it } from "vitest";
import {
  ancestors,
  canMoveUnder,
  descendants,
  hiddenIds,
  levelUnder,
  nameTaken,
  paths,
  removal,
  treeOrder,
  type Entry,
} from "./hierarchy.ts";

const entry = (
  id: string,
  name: string,
  level: number,
  parentId: string | null,
  archived = false,
): Entry => ({
  id,
  name,
  level,
  parentId,
  sortOrder: 0,
  archived,
});

const groceries = entry("g", "Groceries", 1, null);
const dining = entry("d", "Dining", 1, null);
const dairy = entry("da", "Dairy", 2, "g");
const frozen = entry("f", "Frozen foods", 2, "g");
const milk = entry("m", "Milk", 3, "da");
const iceCream = entry("i", "Ice cream", 3, "f");
const premium = entry("p", "Premium ice cream", 4, "i");
const all = [premium, iceCream, milk, frozen, dairy, dining, groceries];

describe("levels", () => {
  it("puts a new entry one level below its parent, L1 with none, and nothing below L4", () => {
    expect(levelUnder(undefined)).toBe(1);
    expect(levelUnder(groceries)).toBe(2);
    expect(levelUnder(iceCream)).toBe(4);
    expect(levelUnder(premium)).toBeUndefined();
  });
});

describe("moves", () => {
  it("only under another parent exactly one level up", () => {
    expect(canMoveUnder(milk, frozen)).toBe(true);
    expect(canMoveUnder(milk, groceries)).toBe(false);
    expect(canMoveUnder(milk, iceCream)).toBe(false);
    expect(canMoveUnder(milk, dairy)).toBe(false);
  });

  it("never moves an L1 category", () => {
    expect(canMoveUnder(groceries, dining)).toBe(false);
  });

  it("takes the children along: they stay below the moved entry", () => {
    const moved = all.map((e) => (e.id === "i" ? { ...e, parentId: "da" } : e));
    expect(
      descendants(moved, "da")
        .map((e) => e.id)
        .sort(),
    ).toEqual(["i", "m", "p"]);
    expect(descendants(moved, "f")).toEqual([]);
  });
});

describe("names", () => {
  it("are unique among siblings ignoring case, L1 included, but may repeat under other parents", () => {
    expect(nameTaken(all, "groceries", null)).toBe(true);
    expect(nameTaken(all, " DAIRY ", "g")).toBe(true);
    expect(nameTaken(all, "Dairy", "d")).toBe(false);
    expect(nameTaken(all, "Dairy", "g", "da")).toBe(false);
  });
});

describe("archiving", () => {
  it("hides an archived entry and everything below it", () => {
    const archived = all.map((e) => (e.id === "f" ? { ...e, archived: true } : e));
    expect([...hiddenIds(archived)].sort()).toEqual(["f", "i", "p"]);
  });
});

describe("paths and order", () => {
  it("writes each entry's full path", () => {
    const p = paths(all);
    expect(p.get("p")).toBe("Groceries › Frozen foods › Ice cream › Premium ice cream");
    expect(p.get("g")).toBe("Groceries");
    expect(ancestors(all, "m").map((e) => e.id)).toEqual(["da", "g"]);
  });

  it("orders parents before children, siblings by sort order then name", () => {
    expect(treeOrder(all).map((e) => e.id)).toEqual(["d", "g", "da", "m", "f", "i", "p"]);
  });
});

describe("removal", () => {
  it("deletes only an unused entry with no children", () => {
    expect(removal({ hasChildren: false, inUse: false })).toBe("deleted");
    expect(removal({ hasChildren: true, inUse: false })).toBe("archived");
    expect(removal({ hasChildren: false, inUse: true })).toBe("archived");
  });
});
