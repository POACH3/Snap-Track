import { useMemo, useState } from "react";
import { Button } from "../../shared/ui/Button.tsx";
import { useToast } from "../../shared/ui/toast-context.ts";
import { CategoryPicker } from "../labels/CategoryPicker.tsx";
import { pathsOf } from "../labels/labels.ts";
import {
  useCategories,
  useSetItemCategory,
  useSetItemTags,
  useSetStoreDefault,
  useTags,
} from "../labels/use-labels.ts";
import labelStyles from "./Labels.module.css";
import styles from "./Library.module.css";

const failed = "Check your connection.";

/** A store's default category: what its lines without their own or their item's get (SPEC.md §5). */
export function StoreDefaultCard({
  storeId,
  storeName,
  categoryId,
}: {
  storeId: string;
  storeName: string;
  categoryId: string | null;
}) {
  const toast = useToast();
  const save = useSetStoreDefault();
  const categories = useCategories().data?.categories;
  const paths = useMemo(() => pathsOf(categories ?? []), [categories]);
  const [picking, setPicking] = useState(false);
  const set = (next: string | null) => {
    save.mutate(
      { id: storeId, categoryId: next },
      {
        onSuccess: () => {
          setPicking(false);
        },
        onError: () => {
          toast({ kind: "error", title: "Couldn't save the default.", detail: failed });
        },
      },
    );
  };
  return (
    <section className={styles.card} aria-labelledby="store-default">
      <h2 id="store-default" className={styles.subtitle}>
        Default category
      </h2>
      <p className={styles.detail}>
        {categoryId === null
          ? "None. Lines from this store without their own or their item's category are Unclassified."
          : (paths.get(categoryId) ?? "…")}
      </p>
      <div className={styles.actions}>
        <Button
          variant="secondary"
          onClick={() => {
            setPicking(true);
          }}
        >
          {categoryId === null ? "Choose a category" : "Change"}
        </Button>
      </div>
      {picking && (
        <CategoryPicker
          title="Default category"
          subtitle={`${storeName} · lines without their own category use it`}
          selected={categoryId}
          saveLabel="Set default"
          busy={save.isPending}
          onSave={set}
          onClear={
            categoryId === null
              ? undefined
              : () => {
                  set(null);
                }
          }
          onClose={() => {
            setPicking(false);
          }}
        />
      )}
    </section>
  );
}

/** An item's category and tags: they apply to every purchase of it (SPEC.md §5). */
export function ItemLabelsCard({
  itemId,
  itemName,
  categoryId,
  tagIds,
}: {
  itemId: string;
  itemName: string;
  categoryId: string | null;
  tagIds: readonly string[];
}) {
  const toast = useToast();
  const setCategory = useSetItemCategory();
  const setTags = useSetItemTags();
  const categories = useCategories().data?.categories;
  const tags = useTags().data?.tags ?? [];
  const paths = useMemo(() => pathsOf(categories ?? []), [categories]);
  const [picking, setPicking] = useState(false);
  const shown = tags.filter((t) => !t.archived || tagIds.includes(t.id));
  const saveCategory = (next: string | null) => {
    setCategory.mutate(
      { id: itemId, categoryId: next },
      {
        onSuccess: () => {
          setPicking(false);
        },
        onError: () => {
          toast({ kind: "error", title: "Couldn't save the category.", detail: failed });
        },
      },
    );
  };
  return (
    <section className={styles.card} aria-labelledby="item-labels">
      <h2 id="item-labels" className={styles.subtitle}>
        Category and tags
      </h2>
      <p className={styles.detail}>
        For every purchase of {itemName}, at any store. A purchase's own category wins.
      </p>
      <div className={styles.inline}>
        <span className={styles.grow}>
          {categoryId === null ? "No category" : (paths.get(categoryId) ?? "…")}
        </span>
        <Button
          variant="secondary"
          onClick={() => {
            setPicking(true);
          }}
        >
          {categoryId === null ? "Choose a category" : "Change"}
        </Button>
      </div>
      {shown.length > 0 && (
        <div className={labelStyles.tags} role="group" aria-label={`Tags for ${itemName}`}>
          {shown.map((t) => {
            const on = tagIds.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                className={labelStyles.tag}
                aria-pressed={on}
                disabled={setTags.isPending}
                onClick={() => {
                  setTags.mutate(
                    { id: itemId, tagIds: on ? tagIds.filter((id) => id !== t.id) : [...tagIds, t.id] },
                    {
                      onError: () => {
                        toast({ kind: "error", title: "Couldn't save the tags.", detail: failed });
                      },
                    },
                  );
                }}
              >
                {t.name}
              </button>
            );
          })}
        </div>
      )}
      {picking && (
        <CategoryPicker
          title="Category"
          subtitle={`${itemName} · every purchase of it`}
          selected={categoryId}
          saveLabel="Save category"
          busy={setCategory.isPending}
          onSave={saveCategory}
          onClear={
            categoryId === null
              ? undefined
              : () => {
                  saveCategory(null);
                }
          }
          onClose={() => {
            setPicking(false);
          }}
        />
      )}
    </section>
  );
}
