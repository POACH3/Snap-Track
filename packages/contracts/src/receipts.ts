import { z } from "zod";
import {
  IdentifierAnswer,
  LearningNotice,
  NEEDS_ANSWERS_ERROR,
  StoreIssue,
  StoreMatch,
  StoreMatchedBy,
  StoreName,
  StoreRef,
  StoreSuggestion,
} from "./catalog.ts";
import { LineUnit, Payment, StoreEvidence, TaxLine, TransactionNumber } from "./extraction.ts";
import { procedure } from "./procedure.ts";

/** A receipt's place in its lifecycle (SPEC.md §5, `receipts.status`). */
export const ReceiptStatus = z.enum(["uploaded", "extracting", "unreviewed", "review_required", "confirmed"]);
export type ReceiptStatus = z.infer<typeof ReceiptStatus>;

export const ReceiptSource = z.enum(["photo", "manual", "import"]);
export type ReceiptSource = z.infer<typeof ReceiptSource>;

/** Most photos one receipt may have. A long receipt takes a few (SPEC.md §6.1). */
export const MAX_IMAGES_PER_RECEIPT = 10;
/** Largest single image file accepted. An original HEIC the browser couldn't shrink is a few MB. */
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

export const ReceiptImageRef = z.object({
  id: z.uuid(),
  /** Order on the receipt, top first, from 0. */
  position: z.number().int().min(0),
});
export type ReceiptImageRef = z.infer<typeof ReceiptImageRef>;

export const ReceiptSummary = z.object({
  id: z.uuid(),
  status: ReceiptStatus,
  source: ReceiptSource,
  /** When the photo was taken on the device. */
  capturedAt: z.iso.datetime(),
  /** Local date as printed (`YYYY-MM-DD`), with `THH:MM` when a time was printed. */
  purchasedAt: z.string().nullable(),
  /** The receipt's amount (SPEC.md §5 Rules); null while nothing has been read. */
  totalCents: z.number().int().nullable(),
  /** Null until identified or chosen. */
  store: StoreRef.nullable(),
  loggedBy: z.object({ id: z.uuid(), displayName: z.string() }),
  /** Photos in order. Empty for manual and imported entries. */
  images: z.array(ReceiptImageRef),
});
export type ReceiptSummary = z.infer<typeof ReceiptSummary>;

/** Largest amount accepted from a form, either way: a million dollars. */
const MAX_CENTS = 100_000_000;
const cents = z.number().int().min(-MAX_CENTS).max(MAX_CENTS);
const shortText = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => shortText(max).nullable();

/** A line as the review form edits it. Its position is its place in the list. */
export const DraftLine = z.object({
  /** Present for a line the receipt already has, so what is attached to it is kept. */
  id: z.uuid().optional(),
  kind: z.enum(["item", "fee"]),
  rawName: optionalText(300),
  itemCode: optionalText(100),
  /** Integer thousandths of the unit: 2.31 lb is 2310. */
  quantityMilli: z.number().int().min(1).max(100_000_000),
  unit: LineUnit,
  unitPriceCents: cents.nullable(),
  /** The amount actually charged, after any item discount. */
  lineTotalCents: cents.nullable(),
  /** Savings on this line, already included in the line total. */
  discountCents: cents.nullable(),
  taxCode: optionalText(20),
});
export type DraftLine = z.infer<typeof DraftLine>;

const evidenceText = optionalText(300);
/** The store details as printed, editable before they are learned (SPEC.md §6.5). */
export const DraftStoreEvidence = StoreEvidence.extend({
  logoText: evidenceText,
  brandGuess: evidenceText,
  printedName: evidenceText,
  legalName: evidenceText,
  branchName: evidenceText,
  storeNumber: evidenceText,
  address: z
    .object({ street: evidenceText, city: evidenceText, state: evidenceText, zip: evidenceText })
    .nullable(),
  phones: z.array(z.object({ number: shortText(50), label: evidenceText })).max(20),
  websites: z.array(shortText(300)).max(20),
  emails: z.array(shortText(300)).max(20),
  merchantId: evidenceText,
});

/** Every field the review form edits (SPEC.md §6.5). Shared by `checkDraft` and `confirm`. */
export const ReceiptDraft = z.object({
  purchasedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/)
    .nullable(),
  subtotalCents: cents.nullable(),
  /** Receipt-wide discounts only; item discounts are on the lines. */
  discountCents: cents.nullable(),
  taxCents: cents.nullable(),
  tipCents: cents.nullable(),
  totalCents: cents.nullable(),
  printedSavingsCents: cents.nullable(),
  printedItemCount: z.number().int().min(0).max(10_000).nullable(),
  taxLines: z
    .array(TaxLine.extend({ label: optionalText(100), rate: optionalText(20), amountCents: cents }))
    .max(50),
  payments: z
    .array(
      Payment.extend({
        method: optionalText(50),
        cardBrand: optionalText(50),
        last4: z
          .string()
          .regex(/^\d{4}$/)
          .nullable(),
        amountCents: cents.nullable(),
        approvalCode: optionalText(50),
      }),
    )
    .max(20),
  transactionNumbers: z
    .array(TransactionNumber.extend({ label: optionalText(100), value: shortText(100) }))
    .max(20),
  storeEvidence: DraftStoreEvidence,
  note: optionalText(2000),
  lines: z.array(DraftLine).max(500),
});
export type ReceiptDraft = z.infer<typeof ReceiptDraft>;

/** A figure that doesn't add up (SPEC.md §6.3 step 4). Warnings, never failures. */
export const ConsistencyWarning = z.discriminatedUnion("kind", [
  z.object({
    kind: z.enum([
      "lines-vs-subtotal",
      "subtotal-vs-total",
      "tax-lines-vs-tax",
      "payments-vs-total",
      "discounts-vs-savings",
    ]),
    expectedCents: z.number().int(),
    printedCents: z.number().int(),
  }),
  z.object({ kind: z.literal("item-count"), counted: z.number().int(), printed: z.number().int() }),
  z.object({
    kind: z.literal("line-price"),
    /** The line's place in the list, from 0. */
    position: z.number().int(),
    expectedCents: z.number().int(),
    printedCents: z.number().int(),
  }),
  z.object({ kind: z.enum(["date-in-future", "date-too-old"]), purchasedAt: z.string() }),
]);
export type ConsistencyWarning = z.infer<typeof ConsistencyWarning>;

/** Everything about one receipt, for the receipt page and the digital receipt. */
export const ReceiptDetail = ReceiptSummary.extend({
  /** Sent back with `confirm`, which refuses if the receipt changed since. */
  updatedAt: z.iso.datetime(),
  storeMatchedBy: StoreMatchedBy.nullable(),
  /** What made an automatic match. */
  storeMatch: StoreMatch.nullable(),
  /** Why the store needs a person; null once it is set. */
  storeIssue: StoreIssue.nullable(),
  /** Worked out now, with the identifiers known now (SPEC.md §6.4). Empty once the store is set. */
  storeSuggestions: z.array(StoreSuggestion),
  draft: ReceiptDraft.extend({
    lines: z.array(DraftLine.extend({ id: z.uuid(), suggestedItemName: z.string().nullable() })),
  }),
  /** Word-for-word transcription. */
  rawText: z.string().nullable(),
  confirmedAt: z.iso.datetime().nullable(),
  confirmedBy: z.object({ id: z.uuid(), displayName: z.string() }).nullable(),
  warnings: z.array(ConsistencyWarning),
});
export type ReceiptDetail = z.infer<typeof ReceiptDetail>;

/** The store a person chose: one already known, or a new one created with the confirm. */
export const StoreChoice = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("existing"), storeId: z.uuid() }),
  z.object({ kind: z.literal("new"), name: StoreName }),
]);
export type StoreChoice = z.infer<typeof StoreChoice>;

export const ConfirmReceiptInput = z.object({
  id: z.uuid(),
  /** The `updatedAt` the form loaded. */
  expectedUpdatedAt: z.iso.datetime(),
  store: StoreChoice,
  /** A total is required to confirm (SPEC.md §6.5); every other field may be empty. */
  draft: ReceiptDraft.refine((draft) => draft.totalCents !== null, {
    message: "A total is required.",
    path: ["totalCents"],
  }),
  /** Answers to the questions a previous call returned. */
  answers: z.array(IdentifierAnswer).max(50).default([]),
});
export type ConfirmReceiptInput = z.input<typeof ConfirmReceiptInput>;

export const PutReceiptInput = z.object({
  /** Made on the phone at capture time, so a retried upload is the same receipt (SPEC.md §5). */
  id: z.uuid(),
  capturedAt: z.iso.datetime(),
  images: z.array(z.file().max(MAX_IMAGE_BYTES)).min(1).max(MAX_IMAGES_PER_RECEIPT),
});
export type PutReceiptInput = z.infer<typeof PutReceiptInput>;

export const ListReceiptsInput = z.object({
  /** From the previous page's `nextCursor`. */
  cursor: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  /** The list's only filter: receipts waiting for a person (SPEC.md §6.5). */
  status: z.enum(["unreviewed", "review_required"]).optional(),
});
export type ListReceiptsInput = z.input<typeof ListReceiptsInput>;

const RECEIPT_NOT_FOUND = { status: 404, message: "No such receipt." } as const;

export const receiptsContract = {
  /**
   * Upload a photographed receipt (SPEC.md §6.2, `PUT /receipts/:id`). Idempotent: if the
   * server already has this receipt, nothing changes and its current state comes back.
   */
  put: procedure
    .route({ method: "PUT" })
    .input(PutReceiptInput)
    .output(z.object({ receipt: ReceiptSummary }))
    .errors({
      UNSUPPORTED_IMAGE: {
        status: 415,
        message: "Only JPEG, PNG and HEIC photos can be uploaded.",
        data: z.object({ position: z.number().int().min(0) }),
      },
    }),
  /** Newest first, by when the photo was taken. */
  list: procedure
    .route({ method: "GET" })
    .input(ListReceiptsInput)
    .output(z.object({ receipts: z.array(ReceiptSummary), nextCursor: z.string().nullable() })),
  get: procedure
    .route({ method: "GET" })
    .input(z.object({ id: z.uuid() }))
    .output(z.object({ receipt: ReceiptDetail }))
    .errors({ RECEIPT_NOT_FOUND }),
  /** The consistency warnings for a form's current figures, while the user edits. Saves nothing. */
  checkDraft: procedure
    .input(z.object({ id: z.uuid(), draft: ReceiptDraft }))
    .output(z.object({ warnings: z.array(ConsistencyWarning) }))
    .errors({ RECEIPT_NOT_FOUND }),
  /**
   * Save the review and mark the receipt confirmed (also used to save an edit of a confirmed
   * receipt), then learn its store's identifiers (SPEC.md §6.7). If learning would move an
   * identifier saved for another store, returns NEEDS_ANSWERS and saves nothing.
   */
  confirm: procedure
    .input(ConfirmReceiptInput)
    .output(
      z.object({
        receipt: ReceiptDetail,
        notices: z.array(LearningNotice),
        /** Other receipts with no store that would now be matched; offered, never applied (§6.4). */
        rematchCount: z.number().int().min(0),
      }),
    )
    .errors({
      RECEIPT_NOT_FOUND,
      STORE_NOT_FOUND: { status: 404, message: "No such store." },
      STORE_NAME_TAKEN: { status: 409, message: "Another store already has that name." },
      RECEIPT_CHANGED: { status: 409, message: "This receipt changed since it was opened. Reload it." },
      NEEDS_ANSWERS: NEEDS_ANSWERS_ERROR,
    }),
  /** How many receipts are waiting for a person, for the list's filter. */
  counts: procedure
    .route({ method: "GET" })
    .output(z.object({ unreviewed: z.number().int().min(0), reviewRequired: z.number().int().min(0) })),
  /** Match every unconfirmed receipt with no store whose identifiers are now known. Only after the user agrees. */
  rematch: procedure.output(z.object({ matched: z.number().int().min(0) })),
};

/** Where the server serves a receipt image and its thumbnail (plain GET, so `<img>` can load them). */
export const receiptImagePath = (imageId: string) => `/files/receipt-images/${imageId}`;
export const receiptThumbnailPath = (imageId: string) => `/files/receipt-images/${imageId}/thumbnail`;
