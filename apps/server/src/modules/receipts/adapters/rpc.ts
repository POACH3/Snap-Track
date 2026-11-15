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
      const result = service.listReceipts({ cursor: input.cursor, limit: input.limit });
      if (!result.ok) throw new ORPCError("BAD_REQUEST", { message: "Unknown list cursor." });
      return result.value;
    }),

    get: os.receipts.get.handler(({ input, errors }) => {
      const receipt = service.getReceipt(input.id);
      if (receipt === undefined) throw errors.RECEIPT_NOT_FOUND();
      return { receipt };
    }),
  };
}
