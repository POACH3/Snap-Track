import type { Category, RemoveOutcome, Tag } from "@snaptrack/contracts";
import { err, newId, ok, type Id, type Result, type Transaction } from "@snaptrack/core";
import {
  ancestors,
  canMoveUnder,
  descendants,
  hiddenIds,
  levelUnder,
  paths,
  removal,
  treeOrder,
} from "../domain/hierarchy.ts";
import type { CategoryRepository, PurchaseLabelUsage, TagRepository } from "../ports.ts";

export interface LabelCatalogDeps {
  categories: CategoryRepository;
  tags: TagRepository;
  usage: PurchaseLabelUsage;
  transaction: Transaction;
}

export type CategoryNotFound = { kind: "category-not-found" };
export type TagNotFound = { kind: "tag-not-found" };
export type LabelNameTaken = { kind: "name-taken" };

/** The entries and tags a model may suggest, numbered in the prompt (SPEC.md §6.3). */
export interface LabelChoices {
  categories: { id: Id; path: string }[];
  tags: { id: Id; name: string }[];
}

export type LabelCatalog = ReturnType<typeof createLabelCatalog>;

/** The hierarchy and free tags (SPEC.md §5): editing them, and what may be chosen. */
export function createLabelCatalog(deps: LabelCatalogDeps) {
  const category = (id: Id): Category | undefined => deps.categories.findById(id);

  return {
    listCategories(): Category[] {
      return treeOrder(deps.categories.all());
    },

    /** Entries that exist, archived or not; for checking ids sent with a confirm. */
    knownCategoryIds(ids: readonly Id[]): Set<Id> {
      const all = new Set(deps.categories.all().map((entry) => entry.id));
      return new Set(ids.filter((id) => all.has(id)));
    },

    knownTagIds(ids: readonly Id[]): Set<Id> {
      const all = new Set(deps.tags.all().map((t) => t.id));
      return new Set(ids.filter((id) => all.has(id)));
    },

    addCategory(
      name: string,
      parentId: Id | null,
    ): Result<Category, { kind: "parent-not-found" } | { kind: "too-deep" } | LabelNameTaken> {
      return deps.transaction.run(() => {
        const parent = parentId === null ? undefined : category(parentId);
        if (parentId !== null && parent === undefined) return err({ kind: "parent-not-found" as const });
        const level = levelUnder(parent);
        if (level === undefined) return err({ kind: "too-deep" as const });
        const entry = {
          id: newId(),
          name,
          level,
          parentId,
          sortOrder: deps.categories.nextSortOrder(parentId),
        };
        if (!deps.categories.insert(entry)) return err({ kind: "name-taken" as const });
        return ok({ ...entry, archived: false });
      });
    },

    renameCategory(id: Id, name: string): Result<Category, CategoryNotFound | LabelNameTaken> {
      return deps.transaction.run(() => {
        if (category(id) === undefined) return err({ kind: "category-not-found" as const });
        if (!deps.categories.rename(id, name)) return err({ kind: "name-taken" as const });
        return ok(category(id) as Category);
      });
    },

    /** Keeps the entry's level; its children move with it (they stay attached to it). */
    moveCategory(
      id: Id,
      parentId: Id,
    ): Result<Category, CategoryNotFound | { kind: "invalid-parent" } | LabelNameTaken> {
      return deps.transaction.run(() => {
        const entry = category(id);
        if (entry === undefined) return err({ kind: "category-not-found" as const });
        const parent = category(parentId);
        if (parent === undefined || !canMoveUnder(entry, parent))
          return err({ kind: "invalid-parent" as const });
        if (!deps.categories.move(id, parentId)) return err({ kind: "name-taken" as const });
        return ok(category(id) as Category);
      });
    },

    /** Deletes an entry nothing uses and with no children; archives it otherwise (SPEC.md §5 Rules). */
    removeCategory(id: Id): Result<RemoveOutcome, CategoryNotFound> {
      return deps.transaction.run(() => {
        if (category(id) === undefined) return err({ kind: "category-not-found" as const });
        const outcome = removal({
          hasChildren: descendants(deps.categories.all(), id).length > 0,
          inUse: deps.categories.isReferenced(id) || deps.usage.categoryInUse(id),
        });
        if (outcome === "deleted") deps.categories.delete(id);
        else deps.categories.setArchived([id], true);
        return ok(outcome);
      });
    },

    /** Back in the pickers, with any archived entries above it. */
    restoreCategory(id: Id): Result<Category, CategoryNotFound> {
      return deps.transaction.run(() => {
        if (category(id) === undefined) return err({ kind: "category-not-found" as const });
        deps.categories.setArchived([id, ...ancestors(deps.categories.all(), id).map((e) => e.id)], false);
        return ok(category(id) as Category);
      });
    },

    /** Tags with how many purchases have each, from their items or set on the line. */
    listTags(): (Tag & { purchaseCount: number })[] {
      const perItem = deps.usage.purchasesPerItem();
      const itemsByTag = deps.tags.itemsByTag();
      const lineTags = deps.usage.lineTags();
      return deps.tags.all().map((t) => {
        const items = new Set(itemsByTag.get(t.id) ?? []);
        const fromItems = [...items].reduce((n, itemId) => n + (perItem.get(itemId) ?? 0), 0);
        // A line whose item has the tag already counts once, through its item.
        const onLines = new Set(
          lineTags
            .filter((use) => use.tagId === t.id && (use.itemId === null || !items.has(use.itemId)))
            .map((use) => use.lineId),
        ).size;
        return { ...t, purchaseCount: fromItems + onLines };
      });
    },

    addTag(name: string): Result<Tag, LabelNameTaken> {
      const t = { id: newId(), name };
      return deps.tags.insert(t) ? ok({ ...t, archived: false }) : err({ kind: "name-taken" });
    },

    renameTag(id: Id, name: string): Result<Tag, TagNotFound | LabelNameTaken> {
      return deps.transaction.run(() => {
        if (deps.tags.findById(id) === undefined) return err({ kind: "tag-not-found" as const });
        if (!deps.tags.rename(id, name)) return err({ kind: "name-taken" as const });
        return ok(deps.tags.findById(id) as Tag);
      });
    },

    removeTag(id: Id): Result<RemoveOutcome, TagNotFound> {
      return deps.transaction.run(() => {
        if (deps.tags.findById(id) === undefined) return err({ kind: "tag-not-found" as const });
        const outcome = removal({
          hasChildren: false,
          inUse: deps.tags.isReferenced(id) || deps.usage.tagInUse(id),
        });
        if (outcome === "deleted") deps.tags.delete(id);
        else deps.tags.setArchived(id, true);
        return ok(outcome);
      });
    },

    restoreTag(id: Id): Result<Tag, TagNotFound> {
      return deps.transaction.run(() => {
        if (deps.tags.findById(id) === undefined) return err({ kind: "tag-not-found" as const });
        deps.tags.setArchived(id, false);
        return ok(deps.tags.findById(id) as Tag);
      });
    },

    /** What the model may suggest: entries and tags not archived (or below an archived entry). */
    labelChoices(): LabelChoices {
      const all = deps.categories.all();
      const hidden = hiddenIds(all);
      const pathOf = paths(all);
      return {
        categories: treeOrder(all)
          .filter((entry) => !hidden.has(entry.id))
          .map((entry) => ({ id: entry.id, path: pathOf.get(entry.id) ?? entry.name })),
        tags: deps.tags
          .all()
          .filter((t) => !t.archived)
          .map((t) => ({ id: t.id, name: t.name })),
      };
    },
  };
}
