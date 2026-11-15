import { z } from "zod";
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
  loggedBy: z.object({ id: z.uuid(), displayName: z.string() }),
  /** Photos in order. Empty for manual and imported entries. */
  images: z.array(ReceiptImageRef),
});
export type ReceiptSummary = z.infer<typeof ReceiptSummary>;

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
});
export type ListReceiptsInput = z.input<typeof ListReceiptsInput>;

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
    .output(z.object({ receipt: ReceiptSummary }))
    .errors({ RECEIPT_NOT_FOUND: { status: 404, message: "No such receipt." } }),
};

/** Where the server serves a receipt image and its thumbnail (plain GET, so `<img>` can load them). */
export const receiptImagePath = (imageId: string) => `/files/receipt-images/${imageId}`;
export const receiptThumbnailPath = (imageId: string) => `/files/receipt-images/${imageId}/thumbnail`;
