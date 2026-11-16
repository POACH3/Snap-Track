// Receipts, their images and their lifecycle (SPEC.md §4.3). The only file other modules may import.
export { createReceiptsModule, type ReceiptsModuleOptions } from "./adapters/receipts-module.ts";
export { FileSystemFileStore } from "./adapters/file-system-file-store.ts";
export { SqlitePurchaseLabelUsage } from "./adapters/sqlite-purchase-label-usage.ts";
export { SipsImageConverter } from "./adapters/sips-image-converter.ts";
export type { ReceiptsService } from "./application/receipts-service.ts";
export type { FileStore, ImageConverter, ReceiptUploadedListener, Catalog, UserDirectory } from "./ports.ts";
export { checkConsistency, type ConsistencyWarning } from "./domain/consistency.ts";
