// Categories and tags on the receipt page (SPEC.md §6.5; docs/DESIGN.md, "Categories and
// tags"): each line's category chip and tags, the model's suggestion, the store-default question,
// Set all lines, and the tags in a line's sheet. A line's own category and tags, and what was
// done with a suggestion, are saved with the confirm; anything "for this item" or a store's
// default is saved at once, like an item's name.
import { isDefinedError } from "@orpc/client";
import type { Category } from "@snaptrack/contracts";
import { effectiveCategory, lineTags, pendingSuggestion, type EffectiveCategory } from "@snaptrack/core";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "../../shared/ui/Button.tsx";
import { Modal } from "../../shared/ui/Modal.tsx";
import { useToast } from "../../shared/ui/toast-context.ts";
import { CategoryPicker, ScopeChoice, type Scope } from "../labels/CategoryPicker.tsx";
import { hiddenIds, pathsOf, SOURCE_TEXT } from "../labels/labels.ts";
import {
  useAddTag,
  useCategories,
  useItemLabels,
  useSetItemCategory,
  useSetItemTags,
  useSetStoreDefault,
  useStoreDefault,
  useTags,
} from "../labels/use-labels.ts";
import type { FormLine, FormState } from "./receipt-form.ts";
import styles from "./LineLabels.module.css";

type Update = (change: (form: FormState) => FormState) => void;

/** The store the receipt is set to, when it already exists (a new one has no default yet). */
export type KnownStore = { id: string; name: string } | null;

/** Everything the line labels need to know about the hierarchy, tags, items and store. */
export interface LabelContext {
  categories: readonly Category[];
  paths: ReadonlyMap<string, string>;
  /** Archived entries, and everything below them. */
  hidden: ReadonlySet<string>;
  tagName: ReadonlyMap<string, string>;
  activeTags: readonly { id: string; name: string }[];
  archivedTags: ReadonlySet<string>;
  store: KnownStore;
  storeDefault: string | null;
  storeDefaultLoaded: boolean;
  /** A line's item's category and tags: saved ones for a known item, chosen ones for a new one. */
  itemLabels: (line: FormLine) => { categoryId: string | null; tagIds: readonly string[] };
}

export function useLabelContext(form: FormState, store: KnownStore): LabelContext {
  const categories = useCategories().data?.categories;
  const tags = useTags().data?.tags;
  const itemIds = form.lines.flatMap((line) => (line.item?.kind === "existing" ? [line.item.item.id] : []));
  const labels = useItemLabels(itemIds).data?.items;
  const storeDefault = useStoreDefault(store?.id ?? null);
  return useMemo(() => {
    const all = categories ?? [];
    const byItem = new Map((labels ?? []).map((item) => [item.id, item]));
    return {
      categories: all,
      paths: pathsOf(all),
      hidden: hiddenIds(all),
      tagName: new Map((tags ?? []).map((t) => [t.id, t.name])),
      activeTags: (tags ?? []).filter((t) => !t.archived),
      archivedTags: new Set((tags ?? []).filter((t) => t.archived).map((t) => t.id)),
      store,
      storeDefault: storeDefault.categoryId,
      storeDefaultLoaded: storeDefault.loaded,
      itemLabels: (line: FormLine) => {
        if (line.item === null) return { categoryId: null, tagIds: [] };
        if (line.item.kind === "new") return { categoryId: line.item.categoryId, tagIds: line.item.tagIds };
        const found = byItem.get(line.item.item.id);
        return { categoryId: found?.categoryId ?? null, tagIds: found?.tagIds ?? [] };
      },
    };
  }, [categories, tags, labels, store, storeDefault.categoryId, storeDefault.loaded]);
}

/** The line's category as the rule works it out now (SPEC.md §5). */
export function categoryOf(line: FormLine, context: LabelContext): EffectiveCategory | null {
  return effectiveCategory({
    line: line.categoryId,
    item: context.itemLabels(line).categoryId,
    store: context.storeDefault,
  });
}

const itemNameOf = (line: FormLine): string | null =>
  line.item === null ? null : line.item.kind === "existing" ? line.item.item.name : line.item.name;

/** Applies a category (and tags) "for this item": at once for a known item, on the new one otherwise. */
function useApplyToItem() {
  const toast = useToast();
  const setCategory = useSetItemCategory();
  const setTags = useSetItemTags();
  const failed = () => {
    toast({ kind: "error", title: "Couldn't save it for this item.", detail: "Check your connection." });
  };
  return {
    busy: setCategory.isPending || setTags.isPending,
    apply(
      line: FormLine,
      change: { categoryId?: string; addTags?: readonly string[]; tagIds?: readonly string[] },
      context: LabelContext,
      setLine: (change: Partial<FormLine>) => void,
      done: () => void,
    ) {
      const item = line.item;
      if (item === null) return;
      const current = context.itemLabels(line).tagIds;
      const tagIds =
        change.tagIds !== undefined
          ? [...change.tagIds]
          : change.addTags !== undefined
            ? [...new Set([...current, ...change.addTags])]
            : undefined;
      // The item's category only shows where the line has none of its own.
      const lineChange: Partial<FormLine> = change.categoryId === undefined ? {} : { categoryId: null };
      if (item.kind === "new") {
        setLine({
          ...lineChange,
          item: {
            ...item,
            ...(change.categoryId === undefined ? {} : { categoryId: change.categoryId }),
            ...(tagIds === undefined ? {} : { tagIds }),
          },
        });
        done();
        return;
      }
      const id = item.item.id;
      const saveTags = () => {
        if (tagIds === undefined) {
          setLine(lineChange);
          done();
          return;
        }
        setTags.mutate(
          { id, tagIds },
          {
            onSuccess: () => {
              setLine(lineChange);
              done();
            },
            onError: failed,
          },
        );
      };
      if (change.categoryId === undefined) saveTags();
      else
        setCategory.mutate({ id, categoryId: change.categoryId }, { onSuccess: saveTags, onError: failed });
    },
  };
}

/** Under a line: its category chip, its tags, and the model's suggestion while it applies. */
export function LineLabelsRow({
  line,
  context,
  setLine,
  onOpenOptions,
}: {
  line: FormLine;
  context: LabelContext;
  setLine: (change: Partial<FormLine>) => void;
  onOpenOptions: () => void;
}) {
  const [picking, setPicking] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const toItem = useApplyToItem();
  const effective = categoryOf(line, context);
  const itemName = itemNameOf(line);
  const tags = lineTags(context.itemLabels(line).tagIds, line.tagIds);
  const suggestion = pendingSuggestion({
    effective,
    suggestedCategoryId: line.suggestedCategoryId,
    suggestedTagIds: line.suggestedTagIds,
    tagIds: [...tags.fromItem, ...tags.fromLine],
    outcome: line.suggestionOutcome,
    usable: (id) =>
      (context.paths.has(id) && !context.hidden.has(id)) ||
      (context.tagName.has(id) && !context.archivedTags.has(id)),
  });
  const name = (id: string) => context.tagName.get(id);
  // A guess for a category or tags the household hasn't made yet (or removed) is not shown.
  const suggestionText =
    suggestion === null
      ? null
      : [
          suggestion.categoryId === null ? null : context.paths.get(suggestion.categoryId),
          ...suggestion.tagIds.map(name),
        ]
          .filter(Boolean)
          .join(" · ");

  const acceptAs = (scope: Scope) => {
    if (suggestion === null) return;
    if (scope === "line") {
      setLine({
        ...(suggestion.categoryId === null ? {} : { categoryId: suggestion.categoryId }),
        tagIds: [...new Set([...line.tagIds, ...suggestion.tagIds])],
        suggestionOutcome: "accepted",
      });
      setAccepting(false);
      return;
    }
    toItem.apply(
      line,
      {
        ...(suggestion.categoryId === null ? {} : { categoryId: suggestion.categoryId }),
        addTags: suggestion.tagIds,
      },
      context,
      (change) => {
        setLine({ ...change, suggestionOutcome: "accepted" });
      },
      () => {
        setAccepting(false);
      },
    );
  };

  const kind = line.kind;
  return (
    <>
      <div className={styles.row}>
        <button
          type="button"
          className={styles.chip}
          aria-label={
            effective === null
              ? "Category: none. Choose one"
              : `Category: ${context.paths.get(effective.categoryId) ?? ""}, ${SOURCE_TEXT[effective.source]}. Change it`
          }
          onClick={() => {
            setPicking(true);
          }}
        >
          {effective === null ? (
            "Category"
          ) : (
            <>
              {context.paths.get(effective.categoryId) ?? "Category"}
              <span className={styles.source}>· {SOURCE_TEXT[effective.source]}</span>
            </>
          )}
        </button>
        {tags.fromItem.map((id) => (
          <span key={id} className={styles.tag}>
            {name(id)}
          </span>
        ))}
        {tags.fromLine.map((id) => (
          <span key={id} className={`${styles.tag} ${styles.purchaseTag}`}>
            {name(id)} · this purchase
          </span>
        ))}
        {kind === "item" && (
          <button
            type="button"
            className={styles.addTag}
            onClick={onOpenOptions}
            aria-label="Tags: add or remove"
          >
            <Plus size={14} aria-hidden /> Tag
          </button>
        )}
      </div>
      {suggestionText !== null && suggestionText !== "" && (
        <p className={styles.suggestion}>
          <span>
            Suggested: <strong>{suggestionText}</strong>
          </span>
          <span className={styles.suggestionActions}>
            <button
              type="button"
              className={styles.accept}
              onClick={() => {
                if (line.item === null) acceptAs("line");
                else setAccepting(true);
              }}
            >
              Accept
            </button>
            <button
              type="button"
              className={styles.dismiss}
              onClick={() => {
                setLine({ suggestionOutcome: "dismissed" });
              }}
            >
              Dismiss
            </button>
          </span>
        </p>
      )}

      {picking && (
        <CategoryPicker
          title="Category"
          subtitle={[
            itemName ?? (line.rawName || "This line"),
            effective && context.paths.get(effective.categoryId),
          ]
            .filter(Boolean)
            .join(" · ")}
          selected={effective?.categoryId ?? null}
          scope={itemName === null ? undefined : { itemName }}
          saveLabel="Save category"
          busy={toItem.busy}
          onClear={
            line.categoryId === null
              ? undefined
              : () => {
                  setLine({ categoryId: null });
                  setPicking(false);
                }
          }
          onSave={(categoryId, scope) => {
            if (scope === "line") {
              setLine({ categoryId });
              setPicking(false);
              return;
            }
            toItem.apply(line, { categoryId }, context, setLine, () => {
              setPicking(false);
            });
          }}
          onClose={() => {
            setPicking(false);
          }}
        />
      )}
      {accepting && itemName !== null && (
        <AcceptSuggestion
          text={suggestionText ?? ""}
          itemName={itemName}
          busy={toItem.busy}
          onAccept={acceptAs}
          onClose={() => {
            setAccepting(false);
          }}
        />
      )}
    </>
  );
}

/** Accepting a suggestion for a line with an item asks the same way as choosing a category. */
function AcceptSuggestion({
  text,
  itemName,
  busy,
  onAccept,
  onClose,
}: {
  text: string;
  itemName: string;
  busy: boolean;
  onAccept: (scope: Scope) => void;
  onClose: () => void;
}) {
  const [scope, setScope] = useState<Scope>("item");
  return (
    <Modal
      open
      title="Accept the suggestion?"
      busy={busy}
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            busy={busy}
            onClick={() => {
              onAccept(scope);
            }}
          >
            Accept
          </Button>
        </>
      }
    >
      <p className={styles.acceptText}>{text}</p>
      <ScopeChoice itemName={itemName} value={scope} onChange={setScope} />
    </Modal>
  );
}

/** "What do you usually buy at <store>?" while the store has no default (docs/DESIGN.md). */
export function StoreDefaultQuestion({ context }: { context: LabelContext }) {
  const toast = useToast();
  const save = useSetStoreDefault();
  const [notNow, setNotNow] = useState(false);
  const [picking, setPicking] = useState(false);
  const store = context.store;
  if (store === null || !context.storeDefaultLoaded || context.storeDefault !== null || notNow) return null;
  return (
    <div className={styles.question}>
      <p className={styles.questionTitle}>What do you usually buy at {store.name}?</p>
      <p className={styles.questionText}>
        Its lines without their own category will use it, now and on every receipt from here.
      </p>
      <div className={styles.questionActions}>
        <Button
          className={styles.small}
          onClick={() => {
            setPicking(true);
          }}
        >
          Choose a category
        </Button>
        <Button
          variant="ghost"
          className={styles.small}
          onClick={() => {
            setNotNow(true);
          }}
        >
          Not now
        </Button>
      </div>
      {picking && (
        <CategoryPicker
          title="Default category"
          subtitle={`${store.name} · lines without their own category use it`}
          selected={null}
          saveLabel="Set default"
          busy={save.isPending}
          onSave={(categoryId) => {
            save.mutate(
              { id: store.id, categoryId },
              {
                onSuccess: () => {
                  setPicking(false);
                  toast({
                    kind: "success",
                    title: "Default category set.",
                    detail: `${store.name}: ${context.paths.get(categoryId) ?? ""}`,
                  });
                },
                onError: () => {
                  toast({
                    kind: "error",
                    title: "Couldn't set the default.",
                    detail: "Check your connection.",
                  });
                },
              },
            );
          }}
          onClose={() => {
            setPicking(false);
          }}
        />
      )}
    </div>
  );
}

/** Set all lines: one category for every line, as this-purchase categories (SPEC.md §6.5). */
export function SetAllLines({ update, count }: { update: Update; count: number }) {
  const [picking, setPicking] = useState(false);
  if (count === 0) return null;
  return (
    <>
      <button
        type="button"
        className={styles.setAll}
        onClick={() => {
          setPicking(true);
        }}
      >
        Set all lines
      </button>
      {picking && (
        <CategoryPicker
          title="Category for every line"
          subtitle={`All ${count} lines, for this purchase only`}
          selected={null}
          saveLabel="Set all lines"
          onSave={(categoryId) => {
            update((form) => ({ ...form, lines: form.lines.map((line) => ({ ...line, categoryId })) }));
            setPicking(false);
          }}
          onClose={() => {
            setPicking(false);
          }}
        />
      )}
    </>
  );
}

/** A line's tags in its sheet: its item's (every purchase of it) apart from this purchase's. */
export function TagsSection({
  line,
  context,
  setLine,
}: {
  line: FormLine;
  context: LabelContext;
  setLine: (change: Partial<FormLine>) => void;
}) {
  const toast = useToast();
  const add = useAddTag();
  const toItem = useApplyToItem();
  const [name, setName] = useState("");
  const itemName = itemNameOf(line);
  const onItem = context.itemLabels(line).tagIds;
  // Archived tags still on the line or item stay visible, so they can be taken off.
  const shown = [
    ...context.activeTags,
    ...[...onItem, ...line.tagIds]
      .filter((id) => context.archivedTags.has(id))
      .map((id) => ({ id, name: context.tagName.get(id) ?? "" })),
  ].filter((t, index, all) => all.findIndex((other) => other.id === t.id) === index);
  const toggle = (list: readonly string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  const chips = (selected: readonly string[], onToggle: (id: string) => void, label: string) => (
    <div className={styles.toggles} role="group" aria-label={label}>
      {shown.map((t) => (
        <button
          key={t.id}
          type="button"
          className={styles.toggle}
          aria-pressed={selected.includes(t.id)}
          disabled={toItem.busy}
          onClick={() => {
            onToggle(t.id);
          }}
        >
          {t.name}
        </button>
      ))}
    </div>
  );

  return (
    <section className={styles.tagsSection} aria-label="Tags">
      <h3 className={styles.subhead}>Tags</h3>
      {shown.length === 0 && <p className={styles.muted}>No tags yet. Add one below.</p>}
      {itemName !== null && shown.length > 0 && (
        <>
          <p className={styles.groupLabel}>Every purchase of {itemName}</p>
          {chips(
            onItem,
            (id) => {
              toItem.apply(line, { tagIds: toggle(onItem, id) }, context, setLine, () => undefined);
            },
            `Tags for every purchase of ${itemName}`,
          )}
        </>
      )}
      {shown.length > 0 && (
        <>
          <p className={styles.groupLabel}>This purchase only</p>
          {chips(
            line.tagIds,
            (id) => {
              setLine({ tagIds: toggle(line.tagIds, id) });
            },
            "Tags for this purchase only",
          )}
        </>
      )}
      <div className={styles.newTag}>
        <label className={styles.hidden} htmlFor={`new-tag-${line.key}`}>
          New tag
        </label>
        <input
          id={`new-tag-${line.key}`}
          className={styles.input}
          placeholder="New tag"
          maxLength={60}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
        <Button
          variant="secondary"
          busy={add.isPending}
          disabled={name.trim() === ""}
          onClick={() => {
            add.mutate(
              { name: name.trim() },
              {
                onSuccess: ({ tag }) => {
                  setLine({ tagIds: [...line.tagIds, tag.id] });
                  setName("");
                },
                onError: (error) => {
                  // NAME_TAKEN is the only defined error.
                  const taken = isDefinedError(error);
                  toast({
                    kind: "error",
                    title: taken ? "That tag already exists." : "Couldn't add the tag.",
                    detail: taken ? "Choose it from the list above." : "Check your connection.",
                  });
                },
              },
            );
          }}
        >
          <Plus size={18} aria-hidden /> Add to this purchase
        </Button>
      </div>
    </section>
  );
}
