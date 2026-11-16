import type { CatalogMergeListener, PurchaseLabelUsage } from "../ports.ts";

/** Stands in for `receipts` in catalog-only tests: no purchase uses any category or tag. */
export const unusedLabels: PurchaseLabelUsage = {
  categoryInUse: () => false,
  tagInUse: () => false,
  purchasesPerItem: () => new Map(),
  lineTags: () => [],
};

/** Stands in for `receipts` in catalog-only tests: a merge has no receipts' rows to move. */
export const noReceipts: CatalogMergeListener = {
  storesMerged: () => undefined,
  itemsMerged: () => undefined,
  categoriesMerged: () => undefined,
  tagsMerged: () => undefined,
};
