import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../shared/api/client.ts";

/** Items whose names contain `query`, for the item picker and Library › Items. */
export function useItemSearch(query: string) {
  return useQuery(
    api.catalog.items.search.queryOptions({
      input: { query: query.trim() },
      placeholderData: (previous) => previous,
    }),
  );
}

export function useItem(id: string) {
  return useQuery(api.catalog.items.get.queryOptions({ input: { id }, retry: false }));
}

export function useItemPurchases(itemId: string) {
  return useQuery(api.receipts.itemPurchases.queryOptions({ input: { itemId } }));
}

/** A change to an item shows on every purchase of it, so receipts are refreshed too. */
function useInvalidate() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: api.catalog.key() }),
      queryClient.invalidateQueries({ queryKey: api.receipts.key() }),
    ]);
}

export function useRenameItem() {
  const invalidate = useInvalidate();
  return useMutation(api.catalog.items.rename.mutationOptions({ onSuccess: invalidate }));
}

export function useRemoveItemIdentifier() {
  const invalidate = useInvalidate();
  return useMutation(api.catalog.itemIdentifiers.remove.mutationOptions({ onSuccess: invalidate }));
}

export function useSetItemIdentifierState() {
  const invalidate = useInvalidate();
  return useMutation(api.catalog.itemIdentifiers.setState.mutationOptions({ onSuccess: invalidate }));
}

/** Merges one item into another (SPEC.md §4.3); its purchases move too. */
export function useMergeItem() {
  const invalidate = useInvalidate();
  // Not awaited: the page of the merged-away one is left for the kept one's before the refresh
  // finds it gone.
  return useMutation(
    api.catalog.items.merge.mutationOptions({
      onSuccess: () => {
        void invalidate();
      },
    }),
  );
}
