import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../shared/api/client.ts";

export function useCategories() {
  return useQuery(api.catalog.categories.list.queryOptions({ input: {} }));
}

export function useTags() {
  return useQuery(api.catalog.tags.list.queryOptions({ input: {} }));
}

/** The categories and tags of the items on a receipt page, in one request. */
export function useItemLabels(ids: readonly string[]) {
  const sorted = [...new Set(ids)].sort();
  return useQuery(
    api.catalog.items.labels.queryOptions({
      input: { ids: sorted },
      enabled: sorted.length > 0,
      placeholderData: (previous) => previous,
    }),
  );
}

/** Labels show on receipts and in the Library, so both are refreshed after a change. */
function useInvalidate() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: api.catalog.key() }),
      queryClient.invalidateQueries({ queryKey: api.receipts.key() }),
    ]);
}

export function useAddCategory() {
  const invalidate = useInvalidate();
  return useMutation(api.catalog.categories.add.mutationOptions({ onSuccess: invalidate }));
}
export function useRenameCategory() {
  const invalidate = useInvalidate();
  return useMutation(api.catalog.categories.rename.mutationOptions({ onSuccess: invalidate }));
}
export function useMoveCategory() {
  const invalidate = useInvalidate();
  return useMutation(api.catalog.categories.move.mutationOptions({ onSuccess: invalidate }));
}
export function useRemoveCategory() {
  const invalidate = useInvalidate();
  return useMutation(api.catalog.categories.remove.mutationOptions({ onSuccess: invalidate }));
}
export function useRestoreCategory() {
  const invalidate = useInvalidate();
  return useMutation(api.catalog.categories.restore.mutationOptions({ onSuccess: invalidate }));
}
export function useAddTag() {
  const invalidate = useInvalidate();
  return useMutation(api.catalog.tags.add.mutationOptions({ onSuccess: invalidate }));
}
export function useRenameTag() {
  const invalidate = useInvalidate();
  return useMutation(api.catalog.tags.rename.mutationOptions({ onSuccess: invalidate }));
}
export function useRemoveTag() {
  const invalidate = useInvalidate();
  return useMutation(api.catalog.tags.remove.mutationOptions({ onSuccess: invalidate }));
}
export function useRestoreTag() {
  const invalidate = useInvalidate();
  return useMutation(api.catalog.tags.restore.mutationOptions({ onSuccess: invalidate }));
}
/** "This item": saved at once, shown on every purchase of it. */
export function useSetItemCategory() {
  const invalidate = useInvalidate();
  return useMutation(api.catalog.items.setCategory.mutationOptions({ onSuccess: invalidate }));
}
export function useSetItemTags() {
  const invalidate = useInvalidate();
  return useMutation(api.catalog.items.setTags.mutationOptions({ onSuccess: invalidate }));
}
/** "What do you usually buy here?": saved at once. */
export function useSetStoreDefault() {
  const invalidate = useInvalidate();
  return useMutation(api.catalog.stores.setDefaultCategory.mutationOptions({ onSuccess: invalidate }));
}

/** A store's default category; nothing for a store that doesn't exist yet. */
export function useStoreDefault(storeId: string | null) {
  const query = useQuery(
    api.catalog.stores.get.queryOptions({
      input: { id: storeId ?? "" },
      enabled: storeId !== null,
      retry: false,
    }),
  );
  return { loaded: storeId !== null && query.isSuccess, categoryId: query.data?.defaultCategoryId ?? null };
}

/** Merges one hierarchy entry into another on the same level (SPEC.md §5 Rules). */
export function useMergeCategory() {
  const invalidate = useInvalidate();
  return useMutation(api.catalog.categories.merge.mutationOptions({ onSuccess: invalidate }));
}

export function useMergeTag() {
  const invalidate = useInvalidate();
  return useMutation(api.catalog.tags.merge.mutationOptions({ onSuccess: invalidate }));
}
