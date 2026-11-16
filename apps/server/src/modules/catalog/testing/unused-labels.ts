import type { PurchaseLabelUsage } from "../ports.ts";

/** Stands in for `receipts` in catalog-only tests: no purchase uses any category or tag. */
export const unusedLabels: PurchaseLabelUsage = {
  categoryInUse: () => false,
  tagInUse: () => false,
  purchasesPerItem: () => new Map(),
  lineTags: () => [],
};
