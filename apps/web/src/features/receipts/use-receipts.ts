import type { ReceiptDraft, ReceiptStatus } from "@snaptrack/contracts";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, client } from "../../shared/api/client.ts";

/** While extraction may still change a receipt, its screen checks back this often. */
const PENDING_REFRESH_MS = 10_000;
/** How long after the last keystroke the form asks for warnings again. */
const CHECK_DELAY_MS = 500;
const isPending = (status: ReceiptStatus) => status === "uploaded" || status === "extracting";

export type ReviewFilter = "unreviewed" | "review_required" | undefined;

/** Newest first, a page at a time; only receipts waiting for a person when filtered. */
export function useReceiptList(status?: ReviewFilter) {
  return useInfiniteQuery(
    api.receipts.list.infiniteOptions({
      input: (cursor: string | undefined) => ({
        ...(cursor === undefined ? {} : { cursor }),
        ...(status === undefined ? {} : { status }),
      }),
      initialPageParam: undefined,
      getNextPageParam: (page) => page.nextCursor ?? undefined,
      refetchInterval: (query) =>
        query.state.data?.pages.some((page) => page.receipts.some((receipt) => isPending(receipt.status)))
          ? PENDING_REFRESH_MS
          : false,
    }),
  );
}

/** How many receipts are unreviewed and review required, for the filter chips. */
export function useReceiptCounts() {
  return useQuery(api.receipts.counts.queryOptions({ input: {} }));
}

export function useReceipt(id: string) {
  return useQuery(
    api.receipts.get.queryOptions({
      input: { id },
      retry: false,
      refetchInterval: (query) =>
        query.state.data !== undefined && isPending(query.state.data.receipt.status)
          ? PENDING_REFRESH_MS
          : false,
    }),
  );
}

/** Everything cached about receipts and stores is out of date after a confirm or re-match. */
function useInvalidateReceipts() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: api.receipts.key() }),
      queryClient.invalidateQueries({ queryKey: api.catalog.key() }),
    ]);
}

export function useConfirmReceipt() {
  const invalidate = useInvalidateReceipts();
  return useMutation(api.receipts.confirm.mutationOptions({ onSuccess: invalidate }));
}

export function useRematch() {
  const invalidate = useInvalidateReceipts();
  return useMutation(api.receipts.rematch.mutationOptions({ onSuccess: invalidate }));
}

/**
 * The server's consistency warnings for the form's current figures (SPEC.md §6.3 step 4),
 * asked for once typing pauses. Undefined until the first answer; stale answers are dropped.
 */
export function useDraftWarnings(id: string, draft: ReceiptDraft | undefined, enabled: boolean) {
  const [warnings, setWarnings] =
    useState<Awaited<ReturnType<typeof client.receipts.checkDraft>>["warnings"]>();
  const key = draft === undefined ? undefined : JSON.stringify(draft);

  useEffect(() => {
    if (!enabled || draft === undefined) return;
    let current = true;
    const timer = setTimeout(() => {
      client.receipts
        .checkDraft({ id, draft })
        .then((result) => {
          if (current) setWarnings(result.warnings);
        })
        // Warnings help but never block; a failed check keeps the last ones shown.
        .catch(() => undefined);
    }, CHECK_DELAY_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
    // `key` stands for `draft`: a new object with the same contents shouldn't ask again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, key, enabled]);

  return warnings;
}
