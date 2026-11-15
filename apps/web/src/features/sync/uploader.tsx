import { safe } from "@orpc/client";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import { api, client } from "../../shared/api/client.ts";
import { useToast } from "../../shared/ui/toast-context.ts";
import { InMemoryUploadQueue } from "./in-memory-upload-queue.ts";
import type { QueuedReceipt, UploadQueue } from "./upload-queue.ts";
import { UploaderContext, type Uploader } from "./uploader-context.ts";

const photos = (n: number) => (n === 1 ? "1 photo" : `${n} photos`);

/** The oRPC contract takes files; a resized photo is a plain Blob, so it gets a name. */
const asFile = (blob: Blob, index: number) =>
  blob instanceof File ? blob : new File([blob], `photo-${index + 1}.jpg`, { type: blob.type });

/**
 * Uploads queued receipts, one at a time, oldest first (SPEC.md §6.2). Flushes after each
 * capture and on **Try again**. Stage 5 adds flushing when the app opens and when the
 * connection returns, with a durable queue.
 */
export function UploaderProvider({ children, queue: given }: { children: ReactNode; queue?: UploadQueue }) {
  const queue = useMemo(() => given ?? new InMemoryUploadQueue(), [given]);
  const entries = useSyncExternalStore(
    (listener) => queue.subscribe(listener),
    () => queue.entries(),
  );
  const queryClient = useQueryClient();
  const toast = useToast();
  const flushing = useRef(false);

  const upload = useCallback(
    async (receipt: QueuedReceipt) => {
      queue.setState(receipt.id, "uploading");
      const [error, result, isDefined] = await safe(
        client.receipts.put({
          id: receipt.id,
          capturedAt: receipt.capturedAt,
          images: receipt.images.map(asFile),
        }),
      );
      if (error !== null) {
        if (isDefined) {
          queue.setState(receipt.id, "rejected");
          toast({
            kind: "error",
            title: "Receipt not saved.",
            detail: `Photo ${error.data.position + 1} isn't a JPEG, PNG or HEIC image. Take or choose it again.`,
          });
          return;
        }
        queue.setState(receipt.id, "failed");
        toast({
          kind: "error",
          title: "Upload failed.",
          detail: "Check your connection, then tap Try again on the receipts list.",
        });
        return;
      }
      // Removed only once the server confirms it has every photo (SPEC.md §6.2).
      if (result.receipt.images.length !== receipt.images.length) {
        queue.setState(receipt.id, "rejected");
        toast({
          kind: "error",
          title: "Receipt not saved.",
          detail: "SnapTrack already has a different receipt with this ID. Take the photos again.",
        });
        return;
      }
      queue.remove(receipt.id);
      void queryClient.invalidateQueries({ queryKey: api.receipts.key() });
      toast({ kind: "success", title: "Receipt saved.", detail: `${photos(receipt.images.length)}.` });
    },
    [queue, queryClient, toast],
  );

  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      for (;;) {
        const next = queue.entries().find((entry) => entry.state === "waiting");
        if (next === undefined) break;
        await upload(next.receipt);
      }
    } finally {
      flushing.current = false;
    }
  }, [queue, upload]);

  const uploader = useMemo<Uploader>(
    () => ({
      entries,
      enqueue: (receipt) => {
        queue.add(receipt);
        void flush();
      },
      retry: (id) => {
        queue.setState(id, "waiting");
        void flush();
      },
    }),
    [entries, queue, flush],
  );

  return <UploaderContext.Provider value={uploader}>{children}</UploaderContext.Provider>;
}
