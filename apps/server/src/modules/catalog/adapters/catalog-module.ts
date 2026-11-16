import type { Clock, Transaction } from "@snaptrack/core";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { createCatalogService } from "../application/catalog-service.ts";
import type { CatalogMergeListener, PurchaseLabelUsage } from "../ports.ts";
import { createCatalogRouter } from "./rpc.ts";
import { SqliteStoreIdentifierRepository, SqliteStoreRepository } from "./sqlite-catalog-repositories.ts";
import { SqliteItemIdentifierRepository, SqliteItemRepository } from "./sqlite-item-repositories.ts";
import { SqliteCategoryRepository, SqliteTagRepository } from "./sqlite-label-repositories.ts";
import { SqliteMergeRepository } from "./sqlite-merge-repository.ts";

export interface CatalogModuleOptions {
  db: BetterSQLite3Database;
  clock: Clock;
  transaction: Transaction;
  /** How purchases use categories and tags; supplied by `receipts`, which is wired after this. */
  usage: PurchaseLabelUsage;
  /** Moves `receipts`' rows when entries merge; supplied by `receipts`. */
  mergeListener: CatalogMergeListener;
}

/** Wires the catalog module's adapters to its ports. Called from a composition root. */
export function createCatalogModule(options: CatalogModuleOptions) {
  const service = createCatalogService({
    stores: new SqliteStoreRepository(options.db, options.clock),
    identifiers: new SqliteStoreIdentifierRepository(options.db, options.clock),
    items: new SqliteItemRepository(options.db, options.clock),
    itemIdentifiers: new SqliteItemIdentifierRepository(options.db, options.clock),
    categories: new SqliteCategoryRepository(options.db, options.clock),
    tags: new SqliteTagRepository(options.db, options.clock),
    usage: options.usage,
    merges: new SqliteMergeRepository(options.db, options.clock),
    mergeListener: options.mergeListener,
    transaction: options.transaction,
  });
  return { service, router: createCatalogRouter(service) };
}
