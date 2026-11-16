// The hierarchy as screens show it: full paths, what pickers hide, and where a line's category
// came from. The precedence rule itself is `effectiveCategory` in @snaptrack/core.
import type { Category, CategorySource } from "@snaptrack/contracts";

export const PATH_SEPARATOR = " › ";

/** Every entry's full path, "Groceries › Dairy › Milk". */
export function pathsOf(categories: readonly Category[]): Map<string, string> {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const path = (c: Category, seen: Set<string>): string => {
    const parent = c.parentId === null ? undefined : byId.get(c.parentId);
    if (parent === undefined || seen.has(parent.id)) return c.name;
    return `${path(parent, new Set([...seen, c.id]))}${PATH_SEPARATOR}${c.name}`;
  };
  return new Map(categories.map((c) => [c.id, path(c, new Set())]));
}

/** Archived entries and everything below them: what pickers leave out (SPEC.md §5 Rules). */
export function hiddenIds(categories: readonly Category[]): Set<string> {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const hidden = new Set<string>();
  for (const c of categories) {
    let at: Category | undefined = c;
    const seen = new Set<string>();
    while (at !== undefined && !seen.has(at.id)) {
      if (at.archived) {
        hidden.add(c.id);
        break;
      }
      seen.add(at.id);
      at = at.parentId === null ? undefined : byId.get(at.parentId);
    }
  }
  return hidden;
}

/** Children by parent (null for L1), in the order the server lists them. */
export function childrenOf(categories: readonly Category[]): Map<string | null, Category[]> {
  const children = new Map<string | null, Category[]>();
  for (const c of categories) children.set(c.parentId, [...(children.get(c.parentId) ?? []), c]);
  return children;
}

/** The entries above `id`, top first. */
export function ancestorIds(categories: readonly Category[], id: string): string[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const found: string[] = [];
  let parentId = byId.get(id)?.parentId ?? null;
  while (parentId !== null && !found.includes(parentId)) {
    found.unshift(parentId);
    parentId = byId.get(parentId)?.parentId ?? null;
  }
  return found;
}

/** What the chip says after the path (docs/DESIGN.md, "Line category chip"). */
export const SOURCE_TEXT: Record<CategorySource, string> = {
  line: "this purchase",
  item: "this item",
  store: "store default",
};

/** L1 is a category; deeper levels are classes (SPEC.md §5). */
export const LEVEL_NAME: Record<number, string> = { 1: "category", 2: "subcategory", 3: "class", 4: "class" };
