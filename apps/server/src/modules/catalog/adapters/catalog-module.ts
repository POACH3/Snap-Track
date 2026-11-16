import type { Clock, Transaction } from "@snaptrack/core";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { createCatalogService } from "../application/catalog-service.ts";
import { createCatalogRouter } from "./rpc.ts";
import { SqliteStoreIdentifierRepository, SqliteStoreRepository } from "./sqlite-catalog-repositories.ts";
import { SqliteItemIdentifierRepository, SqliteItemRepository } from "./sqlite-item-repositories.ts";

export interface CatalogModuleOptions {
  db: BetterSQLite3Database;
  clock: Clock;
  transaction: Transaction;
}

/** Wires the catalog module's adapters to its ports. Called from a composition root. */
export function createCatalogModule(options: CatalogModuleOptions) {
  const service = createCatalogService({
    stores: new SqliteStoreRepository(options.db, options.clock),
    identifiers: new SqliteStoreIdentifierRepository(options.db, options.clock),
    items: new SqliteItemRepository(options.db, options.clock),
    itemIdentifiers: new SqliteItemIdentifierRepository(options.db, options.clock),
    transaction: options.transaction,
  });
  return { service, router: createCatalogRouter(service) };
}
