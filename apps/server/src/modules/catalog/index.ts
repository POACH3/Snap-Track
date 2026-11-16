// Stores (companies), their identifiers, store identification and learning (SPEC.md §4.3, §6.4,
// §6.7). Items and categories join in later parts of Stage 4. The only file other modules may import.
export { createCatalogModule, type CatalogModuleOptions } from "./adapters/catalog-module.ts";
export type { CatalogService } from "./application/catalog-service.ts";
