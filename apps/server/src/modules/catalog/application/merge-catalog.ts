import type { Category, ItemDetail, StoreDetail, Tag } from "@snaptrack/contracts";
import { err, ok, type Id, type Result, type Transaction } from "@snaptrack/core";
import type {
  CatalogMergeListener,
  CategoryRepository,
  ItemRepository,
  MergeRepository,
  StoreRepository,
  TagRepository,
} from "../ports.ts";

export interface MergeCatalogDeps {
  stores: StoreRepository;
  items: ItemRepository;
  categories: CategoryRepository;
  tags: TagRepository;
  merges: MergeRepository;
  mergeListener: CatalogMergeListener;
  transaction: Transaction;
}

export type MergeError = { kind: "not-found" } | { kind: "same" } | { kind: "different-level" };

/**
 * Merging two stores, items, hierarchy entries or tags into one (SPEC.md §4.3, Merges;
 * docs/feature-plans/catalog-merges-plan.md). `catalog` merges its own rows and the listener
 * moves `receipts`' rows, in one transaction: a failure anywhere changes nothing. The kept
 * one's own values win; the merged-away one's fill gaps; tags combine.
 */
export function createMergeCatalog(
  deps: MergeCatalogDeps,
  details: {
    storeDetail: (id: Id) => StoreDetail | undefined;
    itemDetail: (id: Id) => ItemDetail | undefined;
  },
) {
  /** Its children move under `to`; one with the same name as a child of `to` merges into it. */
  function mergeCategory(from: Id, to: Id): void {
    const all = deps.categories.all();
    const childrenOf = (id: Id) => all.filter((c) => c.parentId === id);
    const kept = childrenOf(to);
    for (const child of childrenOf(from)) {
      const twin = kept.find((k) => k.name.toLowerCase() === child.name.toLowerCase());
      if (twin === undefined) deps.merges.reparent([child.id], to);
      else mergeCategory(child.id, twin.id);
    }
    deps.merges.pointCategoryAt(from, to);
    deps.mergeListener.categoriesMerged(from, to);
    deps.merges.deleteCategory(from);
  }

  return {
    mergeStores(from: Id, to: Id): Result<StoreDetail, MergeError> {
      if (from === to) return err({ kind: "same" });
      return deps.transaction.run(() => {
        if (deps.stores.findById(from) === undefined || deps.stores.findById(to) === undefined)
          return err({ kind: "not-found" as const });
        deps.merges.moveStoreIdentifiers(from, to);
        deps.merges.moveItemIdentifiersToStore(from, to);
        deps.merges.fillStoreDefault(from, to);
        deps.mergeListener.storesMerged(from, to);
        deps.merges.deleteStore(from);
        return ok(details.storeDetail(to) as StoreDetail);
      });
    },

    mergeItems(from: Id, to: Id): Result<ItemDetail, MergeError> {
      if (from === to) return err({ kind: "same" });
      return deps.transaction.run(() => {
        if (deps.items.findById(from) === undefined || deps.items.findById(to) === undefined)
          return err({ kind: "not-found" as const });
        deps.merges.moveItemIdentifiersToItem(from, to);
        deps.merges.fillItemCategory(from, to);
        deps.merges.moveItemTags(from, to);
        deps.mergeListener.itemsMerged(from, to);
        deps.merges.deleteItem(from);
        return ok(details.itemDetail(to) as ItemDetail);
      });
    },

    /** Only on the same level (SPEC.md §5 Rules). */
    mergeCategories(from: Id, to: Id): Result<Category, MergeError> {
      if (from === to) return err({ kind: "same" });
      return deps.transaction.run(() => {
        const source = deps.categories.findById(from);
        const target = deps.categories.findById(to);
        if (source === undefined || target === undefined) return err({ kind: "not-found" as const });
        if (source.level !== target.level) return err({ kind: "different-level" as const });
        mergeCategory(from, to);
        return ok(deps.categories.findById(to) as Category);
      });
    },

    mergeTags(from: Id, to: Id): Result<Tag, MergeError> {
      if (from === to) return err({ kind: "same" });
      return deps.transaction.run(() => {
        if (deps.tags.findById(from) === undefined || deps.tags.findById(to) === undefined)
          return err({ kind: "not-found" as const });
        deps.merges.moveTagOnItems(from, to);
        deps.mergeListener.tagsMerged(from, to);
        deps.merges.deleteTag(from);
        return ok(deps.tags.findById(to) as Tag);
      });
    },
  };
}
