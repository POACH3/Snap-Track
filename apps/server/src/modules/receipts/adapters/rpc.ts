import { ORPCError } from "@orpc/server";
import { os, signedInUser } from "../../../platform/http/rpc.ts";
import type { ReceiptsService } from "../application/receipts-service.ts";

export function createReceiptsRouter(service: ReceiptsService) {
  return {
    put: os.receipts.put.handler(async ({ input, context, errors }) => {
      const user = signedInUser(context);
      const images = await Promise.all(
        input.images.map(async (file) => new Uint8Array(await file.arrayBuffer())),
      );
      const result = await service.putReceipt(
        { id: input.id, capturedAt: input.capturedAt, images },
        user.id,
      );
      if (!result.ok) throw errors.UNSUPPORTED_IMAGE({ data: { position: result.error.position } });
      return { receipt: result.value };
    }),

    list: os.receipts.list.handler(({ input }) => {
      const result = service.listReceipts({ cursor: input.cursor, limit: input.limit, status: input.status });
      if (!result.ok) throw new ORPCError("BAD_REQUEST", { message: "Unknown list cursor." });
      return result.value;
    }),

    get: os.receipts.get.handler(({ input, errors }) => {
      const receipt = service.getReceipt(input.id);
      if (receipt === undefined) throw errors.RECEIPT_NOT_FOUND();
      return { receipt };
    }),

    checkDraft: os.receipts.checkDraft.handler(({ input }) =>
      service.checkDraft(input.id, input.draft, input.storeId),
    ),

    putManual: os.receipts.putManual.handler(({ input, context, errors }) => {
      const result = service.putManual(input, signedInUser(context).id);
      if (result.ok) return result.value;
      switch (result.error.kind) {
        case "store-not-found":
          throw errors.STORE_NOT_FOUND();
        case "name-taken":
          throw errors.STORE_NAME_TAKEN();
        case "needs-answers":
          throw errors.NEEDS_ANSWERS({ data: { questions: result.error.questions } });
        case "receipt-not-found":
        case "receipt-changed":
          throw new Error(`Unexpected ${result.error.kind} for a manual entry`);
      }
    }),

    dismissDuplicate: os.receipts.dismissDuplicate.handler(({ input, context, errors }) => {
      const result = service.dismissDuplicate(input.id, input.otherId, signedInUser(context).id);
      if (!result.ok) throw errors.RECEIPT_NOT_FOUND();
      return { receipt: result.value };
    }),

    delete: os.receipts.delete.handler(async ({ input, errors }) => {
      const result = await service.deleteReceipt(input.id);
      if (!result.ok) throw errors.RECEIPT_NOT_FOUND();
      return {};
    }),

    confirm: os.receipts.confirm.handler(({ input, context, errors }) => {
      const result = service.confirm(input, signedInUser(context).id);
      if (result.ok) return result.value;
      switch (result.error.kind) {
        case "receipt-not-found":
          throw errors.RECEIPT_NOT_FOUND();
        case "store-not-found":
          throw errors.STORE_NOT_FOUND();
        case "name-taken":
          throw errors.STORE_NAME_TAKEN();
        case "receipt-changed":
          throw errors.RECEIPT_CHANGED();
        case "needs-answers":
          throw errors.NEEDS_ANSWERS({ data: { questions: result.error.questions } });
      }
    }),

    counts: os.receipts.counts.handler(() => service.countWaiting()),

    rematch: os.receipts.rematch.handler(() => service.rematch()),

    itemPurchases: os.receipts.itemPurchases.handler(({ input }) => ({
      purchases: service.itemPurchases(input.itemId, input.limit),
    })),
  };
}
