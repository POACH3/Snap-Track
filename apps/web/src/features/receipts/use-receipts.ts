import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { ReceiptStatus } from "@snaptrack/contracts";
import { api } from "../../shared/api/client.ts";

/** While extraction may still change a receipt, its screen checks back this often. */
const PENDING_REFRESH_MS = 10_000;
const isPending = (status: ReceiptStatus) => status === "uploaded" || status === "extracting";

/** Newest first, a page at a time. */
export function useReceiptList() {
  return useInfiniteQuery(
    api.receipts.list.infiniteOptions({
      input: (cursor: string | undefined) => (cursor === undefined ? {} : { cursor }),
      initialPageParam: undefined,
      getNextPageParam: (page) => page.nextCursor ?? undefined,
      refetchInterval: (query) =>
        query.state.data?.pages.some((page) => page.receipts.some((receipt) => isPending(receipt.status)))
          ? PENDING_REFRESH_MS
          : false,
    }),
  );
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
