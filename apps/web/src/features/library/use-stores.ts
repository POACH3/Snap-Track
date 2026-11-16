import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../shared/api/client.ts";

/** Stores whose names contain `query`, for the store picker. */
export function useStoreSearch(query: string) {
  return useQuery(
    api.catalog.stores.search.queryOptions({
      input: { query: query.trim() },
      placeholderData: (previous) => previous,
    }),
  );
}

export function useStoreList() {
  return useQuery(api.catalog.stores.list.queryOptions({ input: {} }));
}

export function useStore(id: string) {
  return useQuery(api.catalog.stores.get.queryOptions({ input: { id }, retry: false }));
}

/** A change to a store or its identifiers: receipts may now show or match differently. */
function useInvalidate() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: api.catalog.key() }),
      queryClient.invalidateQueries({ queryKey: api.receipts.key() }),
    ]);
}

export function useRenameStore() {
  const invalidate = useInvalidate();
  return useMutation(api.catalog.stores.rename.mutationOptions({ onSuccess: invalidate }));
}

export function useAddIdentifier() {
  const invalidate = useInvalidate();
  return useMutation(api.catalog.identifiers.add.mutationOptions({ onSuccess: invalidate }));
}

export function useRemoveIdentifier() {
  const invalidate = useInvalidate();
  return useMutation(api.catalog.identifiers.remove.mutationOptions({ onSuccess: invalidate }));
}

export function useSetIdentifierState() {
  const invalidate = useInvalidate();
  return useMutation(api.catalog.identifiers.setState.mutationOptions({ onSuccess: invalidate }));
}
