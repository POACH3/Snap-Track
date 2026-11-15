import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { api } from "../../shared/api/client.ts";

/** Newest first, a page at a time. */
export function useReceiptList() {
  return useInfiniteQuery(
    api.receipts.list.infiniteOptions({
      input: (cursor: string | undefined) => (cursor === undefined ? {} : { cursor }),
      initialPageParam: undefined,
      getNextPageParam: (page) => page.nextCursor ?? undefined,
    }),
  );
}

export function useReceipt(id: string) {
  return useQuery(api.receipts.get.queryOptions({ input: { id }, retry: false }));
}
