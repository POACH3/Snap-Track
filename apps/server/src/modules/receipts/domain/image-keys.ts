import type { Id } from "@snaptrack/core";

/**
 * FileStore keys for a receipt image and its thumbnail. Each upload attempt uses fresh image
 * ids, so two copies of one upload racing each other never write to the same file.
 */
export function receiptImageKeys(receiptId: Id, imageId: Id): { image: string; thumbnail: string } {
  return {
    image: `receipts/${receiptId}/${imageId}.jpg`,
    thumbnail: `receipts/${receiptId}/${imageId}-thumb.jpg`,
  };
}
