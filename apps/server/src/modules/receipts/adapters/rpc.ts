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

    checkDraft: os.receipts.checkDraft.handler(({ input, errors }) => {
      const result = service.checkDraft(input.id, input.draft);
      if (!result.ok) throw errors.RECEIPT_NOT_FOUND();
      return { warnings: result.value };
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

    rematch: os.receipts.rematch.handler(() => ({ matched: service.rematch() })),
  };
}
