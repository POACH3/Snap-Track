// The four-level classification hierarchy (SPEC.md §5): L1 categories, L2 subcategories, L3
// and L4 classes, each below exactly one parent one level up. Pure rules; no storage.
import type { Id } from "@snaptrack/core";

export const MAX_LEVEL = 4;

export interface Entry {
  readonly id: Id;
  readonly name: string;
  readonly level: number;
  readonly parentId: Id | null;
  readonly sortOrder: number;
  readonly archived: boolean;
}

/** Shown between levels in a path: "Groceries › Dairy › Milk". */
export const PATH_SEPARATOR = " › ";

/** The level a new entry under `parent` gets (1 with no parent), or undefined below L4. */
export function levelUnder(parent: Entry | undefined): number | undefined {
  if (parent === undefined) return 1;
  return parent.level < MAX_LEVEL ? parent.level + 1 : undefined;
}

/** An entry keeps its level when it moves, so its new parent must be one level above it. */
export function canMoveUnder(entry: Entry, parent: Entry): boolean {
  return entry.level > 1 && parent.level === entry.level - 1 && parent.id !== entry.parentId;
}

/** Names are unique among siblings, ignoring case (L1 entries are siblings of each other). */
export function nameTaken(
  entries: readonly Entry[],
  name: string,
  parentId: Id | null,
  exceptId: Id | null = null,
): boolean {
  const wanted = name.trim().toLowerCase();
  return entries.some(
    (entry) => entry.parentId === parentId && entry.id !== exceptId && entry.name.toLowerCase() === wanted,
  );
}

/** Every entry below `id`, at any depth. */
export function descendants(entries: readonly Entry[], id: Id): Entry[] {
  const children = new Map<Id, Entry[]>();
  for (const entry of entries) {
    if (entry.parentId === null) continue;
    children.set(entry.parentId, [...(children.get(entry.parentId) ?? []), entry]);
  }
  const found: Entry[] = [];
  const visit = (parentId: Id) => {
    for (const child of children.get(parentId) ?? []) {
      found.push(child);
      visit(child.id);
    }
  };
  visit(id);
  return found;
}

/** `id` and the entries above it, nearest first. */
export function ancestors(entries: readonly Entry[], id: Id): Entry[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const found: Entry[] = [];
  let parentId = byId.get(id)?.parentId ?? null;
  while (parentId !== null) {
    const parent = byId.get(parentId);
    if (parent === undefined || found.includes(parent)) break;
    found.push(parent);
    parentId = parent.parentId;
  }
  return found;
}

/** Archived entries and everything below them: what pickers leave out (SPEC.md §5 Rules). */
export function hiddenIds(entries: readonly Entry[]): Set<Id> {
  const hidden = new Set<Id>();
  for (const entry of entries) {
    if (!entry.archived) continue;
    hidden.add(entry.id);
    for (const below of descendants(entries, entry.id)) hidden.add(below.id);
  }
  return hidden;
}

/** Every entry's full path. */
export function paths(entries: readonly Entry[]): Map<Id, string> {
  return new Map(
    entries.map((entry) => [
      entry.id,
      [...ancestors(entries, entry.id).reverse(), entry].map((e) => e.name).join(PATH_SEPARATOR),
    ]),
  );
}

/** Parents before their children; siblings by sort order, then name. */
export function treeOrder<T extends Entry>(entries: readonly T[]): T[] {
  const bySiblings = (a: T, b: T) =>
    a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  const children = new Map<Id | null, T[]>();
  for (const entry of entries) children.set(entry.parentId, [...(children.get(entry.parentId) ?? []), entry]);
  const ids = new Set(entries.map((entry) => entry.id));
  const ordered: T[] = [];
  const visit = (parentId: Id | null) => {
    for (const child of [...(children.get(parentId) ?? [])].sort(bySiblings)) {
      ordered.push(child);
      visit(child.id);
    }
  };
  visit(null);
  // Entries whose parent is missing (never expected) still appear, at the end.
  for (const entry of entries)
    if (entry.parentId !== null && !ids.has(entry.parentId) && !ordered.includes(entry)) ordered.push(entry);
  return ordered;
}

/**
 * What removing an entry does (SPEC.md §5 Rules): delete it when nothing uses it and it has no
 * children; archive it otherwise, so past purchases keep it.
 */
export function removal(input: { hasChildren: boolean; inUse: boolean }): "deleted" | "archived" {
  return input.hasChildren || input.inUse ? "archived" : "deleted";
}
