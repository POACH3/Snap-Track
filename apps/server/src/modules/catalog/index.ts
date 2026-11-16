// Stores (companies), items, their identifiers, identification and learning, and the
// classification hierarchy and tags (SPEC.md §4.3, §5, §6.4, §6.7). The only file other modules
// may import.
export { createCatalogModule, type CatalogModuleOptions } from "./adapters/catalog-module.ts";
export type { CatalogService } from "./application/catalog-service.ts";
export type { LabelChoices } from "./application/label-catalog.ts";
export type { PurchaseLabelUsage } from "./ports.ts";
// The precedence rule for a line's category (SPEC.md §5, "One rule, two forms"). It lives in
// `@snaptrack/core` so the receipt page can apply it while a person edits; this is its server name.
export { effectiveCategory, lineTags, pendingSuggestion } from "@snaptrack/core";
