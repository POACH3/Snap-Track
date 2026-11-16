import type { Clock, Transaction } from "@snaptrack/core";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { createReceiptsService } from "../application/receipts-service.ts";
import type {
  FileStore,
  ImageConverter,
  ReceiptUploadedListener,
  StoreCatalog,
  UserDirectory,
} from "../ports.ts";
import { registerImageRoutes } from "./image-routes.ts";
import { createReceiptsRouter } from "./rpc.ts";
import { SqliteReceiptRepository } from "./sqlite-receipt-repository.ts";

export interface ReceiptsModuleOptions {
  db: BetterSQLite3Database;
  clock: Clock;
  transaction: Transaction;
  files: FileStore;
  converter: ImageConverter;
  users: UserDirectory;
  catalog: StoreCatalog;
  onUploaded?: ReceiptUploadedListener;
}

/** Wires the receipts module's adapters to its ports. Called from a composition root. */
export function createReceiptsModule(options: ReceiptsModuleOptions) {
  const service = createReceiptsService({
    receipts: new SqliteReceiptRepository(options.db, options.clock),
    files: options.files,
    converter: options.converter,
    users: options.users,
    catalog: options.catalog,
    transaction: options.transaction,
    ...(options.onUploaded === undefined ? {} : { onUploaded: options.onUploaded }),
  });
  return {
    service,
    router: createReceiptsRouter(service),
    routes: registerImageRoutes(service),
  };
}
