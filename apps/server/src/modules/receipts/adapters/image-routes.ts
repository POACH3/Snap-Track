import type { FastifyReply, FastifyRequest } from "fastify";
import type { HttpRoutes } from "../../../platform/http/create-http-server.ts";
import type { ImageVariant, ReceiptsService } from "../application/receipts-service.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ImageRequest = FastifyRequest<{ Params: { imageId: string } }>;

/**
 * Plain GET routes for receipt images, so `<img>` can load them and the browser can cache them
 * (docs/feature-plans/capture-and-upload-plan.md). They need a signed-in session. They change
 * nothing, so they need no CSRF header.
 */
export function registerImageRoutes(service: ReceiptsService): HttpRoutes {
  return (app, authenticate) => {
    const serve = (variant: ImageVariant) => async (request: ImageRequest, reply: FastifyReply) => {
      if (authenticate(request.headers.cookie) === null) {
        return reply.status(401).send({ error: "Unauthorized" });
      }
      const { imageId } = request.params;
      const bytes = UUID.test(imageId) ? await service.readImage(imageId, variant) : undefined;
      if (bytes === undefined) return reply.status(404).send({ error: "Not found" });
      return (
        reply
          .header("content-type", "image/jpeg")
          // An image's bytes never change; `private` keeps shared caches out of it.
          .header("cache-control", "private, max-age=31536000, immutable")
          .send(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength))
      );
    };
    app.get("/files/receipt-images/:imageId", serve("image"));
    app.get("/files/receipt-images/:imageId/thumbnail", serve("thumbnail"));
  };
}
