import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "../../shared/ui/Button.tsx";
import { useToast } from "../../shared/ui/toast-context.ts";
import styles from "./Library.module.css";
import { MergeDialog } from "./MergeDialog.tsx";
import { useItemSearch, useMergeItem } from "./use-items.ts";
import { useMergeStore, useStoreSearch } from "./use-stores.ts";

const failed = "Check your connection, then try again. Nothing was changed.";

/** "Same store as another?" on a store's page: merge it into the one to keep (SPEC.md §4.3). */
export function MergeStoreCard({ storeId, storeName }: { storeId: string; storeName: string }) {
  const navigate = useNavigate();
  const toast = useToast();
  const merge = useMergeStore();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const options = (useStoreSearch(query).data?.stores ?? [])
    .filter((store) => store.id !== storeId)
    .map((store) => ({ id: store.id, label: store.name }));
  return (
    <section className={styles.card} aria-labelledby="merge-store">
      <h2 id="merge-store" className={styles.subtitle}>
        Same store as another?
      </h2>
      <p className={styles.detail}>
        Merge it into the one to keep: its receipts and details move there, and {storeName} is gone.
      </p>
      <div className={styles.actions}>
        <Button
          variant="secondary"
          onClick={() => {
            setOpen(true);
          }}
        >
          Merge into another store
        </Button>
      </div>
      {open && (
        <MergeDialog
          title={`Merge ${storeName} into…`}
          query={query}
          onQuery={setQuery}
          options={options}
          confirmTitle={(into) => `Merge ${storeName} into ${into.label}?`}
          confirmText={(into) =>
            `Its receipts and details move to ${into.label}, which keeps its own name and default category. ${storeName} is then gone.`
          }
          confirmLabel="Merge stores"
          busy={merge.isPending}
          onMerge={(intoId) => {
            merge.mutate(
              { id: storeId, intoId },
              {
                onSuccess: (kept) => {
                  toast({
                    kind: "success",
                    title: "Stores merged.",
                    detail: `${storeName} is now part of ${kept.store.name}.`,
                  });
                  void navigate(`/library/stores/${kept.store.id}`, { replace: true });
                },
                onError: () => {
                  toast({ kind: "error", title: "Couldn't merge the stores.", detail: failed });
                },
              },
            );
          }}
          onClose={() => {
            setOpen(false);
          }}
        />
      )}
    </section>
  );
}

/** "Same item as another?" on an item's page. */
export function MergeItemCard({ itemId, itemName }: { itemId: string; itemName: string }) {
  const navigate = useNavigate();
  const toast = useToast();
  const merge = useMergeItem();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const options = (useItemSearch(query).data?.items ?? [])
    .filter((item) => item.id !== itemId)
    .map((item) => ({ id: item.id, label: item.name }));
  return (
    <section className={styles.card} aria-labelledby="merge-item">
      <h2 id="merge-item" className={styles.subtitle}>
        Same item as another?
      </h2>
      <p className={styles.detail}>
        Merge it into the one to keep: its purchases, details and tags move there, and this one is gone.
      </p>
      <div className={styles.actions}>
        <Button
          variant="secondary"
          onClick={() => {
            setOpen(true);
          }}
        >
          Merge into another item
        </Button>
      </div>
      {open && (
        <MergeDialog
          title={`Merge ${itemName} into…`}
          query={query}
          onQuery={setQuery}
          options={options}
          confirmTitle={(into) => `Merge ${itemName} into ${into.label}?`}
          confirmText={(into) =>
            `Its purchases, details and tags move to ${into.label}, which keeps its own name and category. ${itemName} is then gone.`
          }
          confirmLabel="Merge items"
          busy={merge.isPending}
          onMerge={(intoId) => {
            merge.mutate(
              { id: itemId, intoId },
              {
                onSuccess: (kept) => {
                  toast({
                    kind: "success",
                    title: "Items merged.",
                    detail: `Every purchase now shows ${kept.item.name}.`,
                  });
                  void navigate(`/library/items/${kept.item.id}`, { replace: true });
                },
                onError: () => {
                  toast({ kind: "error", title: "Couldn't merge the items.", detail: failed });
                },
              },
            );
          }}
          onClose={() => {
            setOpen(false);
          }}
        />
      )}
    </section>
  );
}
