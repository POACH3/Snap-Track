import { authContract } from "./auth.ts";
import { catalogContract } from "./catalog.ts";
import { healthContract } from "./health.ts";
import { receiptsContract } from "./receipts.ts";

/** Every API endpoint, defined once and shared by server and client (SPEC.md §4.2). */
export const contract = {
  auth: authContract,
  catalog: catalogContract,
  health: healthContract,
  receipts: receiptsContract,
};
export type Contract = typeof contract;

export type { ProcedureMeta } from "./procedure.ts";
export { LoginInput, PublicUser } from "./auth.ts";
export { PingOutput } from "./health.ts";
export {
  ConfirmReceiptInput,
  ConsistencyWarning,
  DraftLine,
  DraftStoreEvidence,
  ListReceiptsInput,
  MAX_IMAGE_BYTES,
  MAX_IMAGES_PER_RECEIPT,
  PutReceiptInput,
  ReceiptDetail,
  ReceiptDraft,
  ReceiptImageRef,
  ReceiptSource,
  ReceiptStatus,
  ReceiptSummary,
  StoreChoice,
  receiptImagePath,
  receiptThumbnailPath,
} from "./receipts.ts";
export {
  IdentifierAnswer,
  IdentifierQuestion,
  IdentifierRef,
  IdentifierState,
  LearningNotice,
  MAX_STORE_NAME_LENGTH,
  StoreDetail,
  StoreIdentifier,
  StoreIdentifierType,
  StoreIssue,
  StoreListEntry,
  StoreMatch,
  StoreMatchedBy,
  StoreName,
  StoreRef,
  StoreSuggestion,
} from "./catalog.ts";
export {
  ExtractedLine,
  ExtractedPayment,
  ExtractedReceipt,
  ExtractedStore,
  ExtractedTaxLine,
  ExtractedTransactionNumber,
  LineUnit,
  Payment,
  StoreEvidence,
  TaxLine,
  TransactionNumber,
} from "./extraction.ts";
