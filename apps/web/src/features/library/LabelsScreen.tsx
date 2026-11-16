import { isDefinedError } from "@orpc/client";
import type { Category, Tag } from "@snaptrack/contracts";
import { ArrowLeft, ChevronDown, ChevronRight, Ellipsis, Plus, Trash2 } from "lucide-react";
import { useId, useMemo, useState, type SyntheticEvent } from "react";
import { Link } from "react-router";
import { Button } from "../../shared/ui/Button.tsx";
import { ConfirmModal } from "../../shared/ui/ConfirmModal.tsx";
import { Loader } from "../../shared/ui/Loader.tsx";
import { Modal } from "../../shared/ui/Modal.tsx";
import { TextField } from "../../shared/ui/TextField.tsx";
import { useToast } from "../../shared/ui/toast-context.ts";
import { childrenOf, LEVEL_NAME, pathsOf } from "../labels/labels.ts";
import {
  useAddCategory,
  useAddTag,
  useCategories,
  useMergeCategory,
  useMergeTag,
  useMoveCategory,
  useRemoveCategory,
  useRemoveTag,
  useRenameCategory,
  useRenameTag,
  useRestoreCategory,
  useRestoreTag,
  useTags,
} from "../labels/use-labels.ts";
import styles from "./Labels.module.css";
import { MergeDialog } from "./MergeDialog.tsx";
import library from "./Library.module.css";

type TagRow = Tag & { purchaseCount: number };

/** The error a label change failed with, in words (contract errors, or the connection). */
function failure(error: unknown): string {
  const defined = error instanceof Error && isDefinedError(error);
  if (!defined) return "Check your connection.";
  const code = (error as { code?: unknown }).code;
  switch (code) {
    case "NAME_TAKEN":
      return "Another entry in the same place already has that name.";
    case "TOO_DEEP":
      return "Classes go four levels deep at most.";
    case "INVALID_PARENT":
      return "An entry can only move under a parent one level above it.";
    default:
      return "It may have been removed. Reload the page.";
  }
}

/**
 * Library › Labels (docs/DESIGN.md, "Library › Labels"): the categories and classes as a tree,
 * and the tags. The household can add, rename, move and remove any of them; one already used is
 * archived instead of deleted, so past receipts keep it (SPEC.md §5 Rules).
 */
export function LabelsScreen() {
  const categories = useCategories();
  const tags = useTags();
  return (
    <div className={library.screen}>
      <Link to="/library" className={library.back}>
        <ArrowLeft size={18} aria-hidden /> Library
      </Link>
      <h1 className={styles.heading}>Labels</h1>
      {categories.isPending ? (
        <Loader label="Loading categories…" />
      ) : (
        <CategoryTree categories={categories.data?.categories ?? []} />
      )}
      {tags.isPending ? <Loader label="Loading tags…" /> : <Tags tags={tags.data?.tags ?? []} />}
    </div>
  );
}

type Sheet = { kind: "entry"; entry: Category } | { kind: "add"; parentId: string | null } | null;

function CategoryTree({ categories }: { categories: readonly Category[] }) {
  const children = useMemo(() => childrenOf(categories), [categories]);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [sheet, setSheet] = useState<Sheet>(null);

  const rows: React.ReactNode[] = [];
  const visit = (entry: Category, depth: number) => {
    const kids = children.get(entry.id) ?? [];
    const isOpen = open.has(entry.id);
    rows.push(
      <li
        key={entry.id}
        className={entry.archived ? `${styles.entry} ${styles.archived}` : styles.entry}
        style={{ paddingLeft: `${12 + depth * 20}px` }}
      >
        {kids.length > 0 ? (
          <button
            type="button"
            className={styles.chevron}
            aria-expanded={isOpen}
            aria-label={`${isOpen ? "Close" : "Open"} ${entry.name}`}
            onClick={() => {
              setOpen((current) => {
                const next = new Set(current);
                if (next.has(entry.id)) next.delete(entry.id);
                else next.add(entry.id);
                return next;
              });
            }}
          >
            {isOpen ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
          </button>
        ) : (
          <span className={styles.chevron} aria-hidden />
        )}
        <span className={entry.level === 1 ? `${styles.entryName} ${styles.top}` : styles.entryName}>
          {entry.name}
          {entry.archived && " (archived)"}
        </span>
        <span className={styles.level}>L{entry.level}</span>
        <button
          type="button"
          className={styles.more}
          aria-label={`Options for ${entry.name}: rename, move, add a class, remove`}
          onClick={() => {
            setSheet({ kind: "entry", entry });
          }}
        >
          <Ellipsis size={18} aria-hidden />
        </button>
      </li>,
    );
    if (isOpen) for (const kid of kids) visit(kid, depth + 1);
  };
  for (const entry of children.get(null) ?? []) visit(entry, 0);

  return (
    <section className={styles.card} aria-labelledby="categories-heading">
      <header className={styles.cardHead}>
        <h2 id="categories-heading" className={styles.cardTitle}>
          Categories and classes
        </h2>
        <button
          type="button"
          className={styles.pillButton}
          onClick={() => {
            setSheet({ kind: "add", parentId: null });
          }}
        >
          <Plus size={14} aria-hidden /> Category
        </button>
      </header>
      <ul className={styles.tree} aria-label="Categories and classes">
        {rows}
      </ul>
      <p className={styles.note}>
        Starts with a default set. Remove any you don't use; one already on a purchase is archived instead, so
        past receipts keep it.
      </p>
      {sheet?.kind === "add" && (
        <AddEntry
          parent={sheet.parentId === null ? null : (categories.find((c) => c.id === sheet.parentId) ?? null)}
          onDone={(parentId) => {
            if (parentId !== null) setOpen((current) => new Set([...current, parentId]));
            setSheet(null);
          }}
        />
      )}
      {sheet?.kind === "entry" && (
        <EntryOptions
          entry={sheet.entry}
          categories={categories}
          onAddClass={() => {
            setSheet({ kind: "add", parentId: sheet.entry.id });
          }}
          onClose={() => {
            setSheet(null);
          }}
        />
      )}
    </section>
  );
}

function AddEntry({
  parent,
  onDone,
}: {
  parent: Category | null;
  onDone: (parentId: string | null) => void;
}) {
  const add = useAddCategory();
  const toast = useToast();
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const formId = useId();
  const what = parent === null ? "category" : LEVEL_NAME[parent.level + 1];

  function submit(event: SyntheticEvent) {
    event.preventDefault();
    if (name.trim() === "") {
      setError("Enter a name.");
      return;
    }
    add.mutate(
      { name: name.trim(), parentId: parent?.id ?? null },
      {
        onSuccess: ({ category }) => {
          toast({ kind: "success", title: "Added.", detail: category.name });
          onDone(parent?.id ?? null);
        },
        onError: (e) => {
          setError(failure(e));
        },
      },
    );
  }

  return (
    <Modal
      open
      title={parent === null ? "New category" : `New ${what} under ${parent.name}`}
      busy={add.isPending}
      onClose={() => {
        onDone(null);
      }}
      actions={
        <>
          <Button
            variant="secondary"
            onClick={() => {
              onDone(null);
            }}
          >
            Cancel
          </Button>
          <Button type="submit" form={formId} busy={add.isPending}>
            Add {what}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit}>
        <TextField
          label="Name"
          value={name}
          error={error}
          maxLength={60}
          autoFocus
          onChange={(event) => {
            setName(event.target.value);
            setError(undefined);
          }}
        />
      </form>
    </Modal>
  );
}

function EntryOptions({
  entry,
  categories,
  onAddClass,
  onClose,
}: {
  entry: Category;
  categories: readonly Category[];
  onAddClass: () => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const rename = useRenameCategory();
  const move = useMoveCategory();
  const remove = useRemoveCategory();
  const restore = useRestoreCategory();
  const merge = useMergeCategory();
  const [merging, setMerging] = useState(false);
  const [mergeQuery, setMergeQuery] = useState("");
  const [name, setName] = useState(entry.name);
  const [error, setError] = useState<string>();
  const [confirming, setConfirming] = useState(false);
  const paths = useMemo(() => pathsOf(categories), [categories]);
  const parents = categories.filter(
    (c) => c.level === entry.level - 1 && c.id !== entry.parentId && !c.archived,
  );
  const moveId = useId();
  const busy = rename.isPending || move.isPending || remove.isPending || restore.isPending;
  const failed = (e: unknown) => {
    toast({ kind: "error", title: "Couldn't change it.", detail: failure(e) });
  };

  return (
    <>
      {/* The merge picker takes its place: no window opens over another (docs/DESIGN.md, "Modals"). */}
      <Modal open={!merging} size="medium" title={entry.name} busy={busy} onClose={onClose}>
        <p className={styles.path}>{paths.get(entry.id)}</p>
        <div className={library.inline}>
          <TextField
            label="Name"
            className={library.grow}
            value={name}
            error={error}
            maxLength={60}
            onChange={(event) => {
              setName(event.target.value);
              setError(undefined);
            }}
          />
          <Button
            variant="secondary"
            busy={rename.isPending}
            disabled={name.trim() === "" || name.trim() === entry.name}
            onClick={() => {
              rename.mutate(
                { id: entry.id, name: name.trim() },
                {
                  onSuccess: ({ category }) => {
                    toast({ kind: "success", title: "Renamed.", detail: category.name });
                    onClose();
                  },
                  onError: (e) => {
                    setError(failure(e));
                  },
                },
              );
            }}
          >
            Rename
          </Button>
        </div>

        {entry.level > 1 && parents.length > 0 && (
          <div className={styles.option}>
            <label htmlFor={moveId} className={library.label}>
              Move under
            </label>
            <select
              id={moveId}
              className={library.select}
              value=""
              disabled={busy}
              onChange={(event) => {
                const parentId = event.target.value;
                if (parentId === "") return;
                move.mutate(
                  { id: entry.id, parentId },
                  {
                    onSuccess: () => {
                      toast({
                        kind: "success",
                        title: "Moved.",
                        detail: `${entry.name} and everything under it are now under ${paths.get(parentId) ?? ""}.`,
                      });
                      onClose();
                    },
                    onError: failed,
                  },
                );
              }}
            >
              <option value="">Choose a new place…</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {paths.get(p.id)}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className={styles.optionButtons}>
          {entry.level < 4 && !entry.archived && (
            <Button variant="secondary" disabled={busy} onClick={onAddClass}>
              <Plus size={18} aria-hidden /> Add a class
            </Button>
          )}
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              setMerging(true);
            }}
          >
            Merge into…
          </Button>
          {entry.archived ? (
            <Button
              variant="secondary"
              busy={restore.isPending}
              onClick={() => {
                restore.mutate(
                  { id: entry.id },
                  {
                    onSuccess: () => {
                      toast({
                        kind: "success",
                        title: "Restored.",
                        detail: `${entry.name} is back in the pickers.`,
                      });
                      onClose();
                    },
                    onError: failed,
                  },
                );
              }}
            >
              Restore
            </Button>
          ) : (
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => {
                setConfirming(true);
              }}
            >
              <Trash2 size={18} aria-hidden /> Remove
            </Button>
          )}
        </div>
      </Modal>
      {merging && (
        <MergeDialog
          title={`Merge ${entry.name} into…`}
          query={mergeQuery}
          onQuery={setMergeQuery}
          options={categories
            .filter(
              (c) =>
                c.level === entry.level &&
                c.id !== entry.id &&
                !c.archived &&
                (paths.get(c.id) ?? c.name).toLowerCase().includes(mergeQuery.trim().toLowerCase()),
            )
            .map((c) => ({ id: c.id, label: c.name, detail: paths.get(c.id) }))}
          confirmTitle={(into) => `Merge ${entry.name} into ${into.label}?`}
          confirmText={(into) =>
            `Everything in ${entry.name} moves to ${into.detail ?? into.label}: its classes (one with the same name as a class there merges into it), and every item, store default and purchase that has it. ${entry.name} is then gone.`
          }
          confirmLabel="Merge categories"
          busy={merge.isPending}
          onMerge={(intoId) => {
            merge.mutate(
              { id: entry.id, intoId },
              {
                onSuccess: ({ category }) => {
                  toast({
                    kind: "success",
                    title: "Merged.",
                    detail: `${entry.name} is now part of ${category.name}.`,
                  });
                  setMerging(false);
                  onClose();
                },
                onError: failed,
              },
            );
          }}
          onClose={() => {
            setMerging(false);
          }}
        />
      )}
      {confirming && (
        <ConfirmModal
          open
          title={`Remove ${entry.name}?`}
          confirmLabel="Remove"
          destructive
          busy={remove.isPending}
          onCancel={() => {
            setConfirming(false);
          }}
          onConfirm={() => {
            remove.mutate(
              { id: entry.id },
              {
                onSuccess: ({ outcome }) => {
                  toast({
                    kind: "success",
                    title: outcome === "deleted" ? "Removed." : "Archived.",
                    detail:
                      outcome === "deleted"
                        ? `${entry.name} was deleted.`
                        : `${entry.name} is in use, so it was archived. Past receipts keep it.`,
                  });
                  setConfirming(false);
                  onClose();
                },
                onError: failed,
              },
            );
          }}
        >
          If a purchase, item or store uses it, or it has classes under it, it is archived instead: hidden
          from the pickers, kept on past receipts.
        </ConfirmModal>
      )}
    </>
  );
}

function Tags({ tags }: { tags: readonly TagRow[] }) {
  const [sheet, setSheet] = useState<TagRow | "add" | null>(null);
  return (
    <section className={styles.card} aria-labelledby="tags-heading">
      <header className={styles.cardHead}>
        <h2 id="tags-heading" className={styles.cardTitle}>
          Tags
        </h2>
        <button
          type="button"
          className={styles.pillButton}
          onClick={() => {
            setSheet("add");
          }}
        >
          <Plus size={14} aria-hidden /> Tag
        </button>
      </header>
      <div className={styles.tagsBody}>
        <p className={styles.description}>
          Simple filters outside the categories. A purchase can have any number.
        </p>
        {tags.length === 0 ? (
          <p className={styles.description}>No tags yet.</p>
        ) : (
          <ul className={styles.tags} aria-label="Tags">
            {tags.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className={t.archived ? `${styles.tag} ${styles.archived}` : styles.tag}
                  onClick={() => {
                    setSheet(t);
                  }}
                >
                  {t.name}
                  {t.archived && " (archived)"}
                  <span className={styles.count}>{t.purchaseCount}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {sheet === "add" && (
        <AddTag
          onDone={() => {
            setSheet(null);
          }}
        />
      )}
      {sheet !== null && sheet !== "add" && (
        <TagOptions
          tag={sheet}
          tags={tags}
          onClose={() => {
            setSheet(null);
          }}
        />
      )}
    </section>
  );
}

function AddTag({ onDone }: { onDone: () => void }) {
  const add = useAddTag();
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const formId = useId();
  function submit(event: SyntheticEvent) {
    event.preventDefault();
    if (name.trim() === "") {
      setError("Enter a name.");
      return;
    }
    add.mutate(
      { name: name.trim() },
      {
        onSuccess: onDone,
        onError: (e) => {
          setError(isDefinedError(e) ? "Another tag already has that name." : "Check your connection.");
        },
      },
    );
  }
  return (
    <Modal
      open
      title="New tag"
      busy={add.isPending}
      onClose={onDone}
      actions={
        <>
          <Button variant="secondary" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" form={formId} busy={add.isPending}>
            Add tag
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit}>
        <TextField
          label="Name"
          value={name}
          error={error}
          maxLength={60}
          autoFocus
          onChange={(event) => {
            setName(event.target.value);
            setError(undefined);
          }}
        />
      </form>
    </Modal>
  );
}

function TagOptions({ tag, tags, onClose }: { tag: TagRow; tags: readonly TagRow[]; onClose: () => void }) {
  const toast = useToast();
  const merge = useMergeTag();
  const [merging, setMerging] = useState(false);
  const [mergeQuery, setMergeQuery] = useState("");
  const rename = useRenameTag();
  const remove = useRemoveTag();
  const restore = useRestoreTag();
  const [name, setName] = useState(tag.name);
  const [error, setError] = useState<string>();
  const [confirming, setConfirming] = useState(false);
  const busy = rename.isPending || remove.isPending || restore.isPending;
  const failed = () => {
    toast({ kind: "error", title: "Couldn't change the tag.", detail: "Check your connection." });
  };
  return (
    <>
      <Modal open={!merging} title={tag.name} busy={busy} onClose={onClose}>
        <p className={styles.path}>
          {tag.purchaseCount === 1 ? "1 purchase" : `${tag.purchaseCount} purchases`}
        </p>
        <div className={library.inline}>
          <TextField
            label="Name"
            className={library.grow}
            value={name}
            error={error}
            maxLength={60}
            onChange={(event) => {
              setName(event.target.value);
              setError(undefined);
            }}
          />
          <Button
            variant="secondary"
            busy={rename.isPending}
            disabled={name.trim() === "" || name.trim() === tag.name}
            onClick={() => {
              rename.mutate(
                { id: tag.id, name: name.trim() },
                {
                  onSuccess: onClose,
                  onError: (e) => {
                    setError(
                      isDefinedError(e) ? "Another tag already has that name." : "Check your connection.",
                    );
                  },
                },
              );
            }}
          >
            Rename
          </Button>
        </div>
        <div className={styles.optionButtons}>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              setMerging(true);
            }}
          >
            Merge into…
          </Button>
          {tag.archived ? (
            <Button
              variant="secondary"
              busy={restore.isPending}
              onClick={() => {
                restore.mutate({ id: tag.id }, { onSuccess: onClose, onError: failed });
              }}
            >
              Restore
            </Button>
          ) : (
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => {
                setConfirming(true);
              }}
            >
              <Trash2 size={18} aria-hidden /> Remove
            </Button>
          )}
        </div>
      </Modal>
      {merging && (
        <MergeDialog
          title={`Merge ${tag.name} into…`}
          query={mergeQuery}
          onQuery={setMergeQuery}
          options={tags
            .filter(
              (t) =>
                t.id !== tag.id &&
                !t.archived &&
                t.name.toLowerCase().includes(mergeQuery.trim().toLowerCase()),
            )
            .map((t) => ({ id: t.id, label: t.name }))}
          confirmTitle={(into) => `Merge ${tag.name} into ${into.label}?`}
          confirmText={(into) =>
            `Every item and purchase tagged ${tag.name} is tagged ${into.label} instead. ${tag.name} is then gone.`
          }
          confirmLabel="Merge tags"
          busy={merge.isPending}
          onMerge={(intoId) => {
            merge.mutate(
              { id: tag.id, intoId },
              {
                onSuccess: ({ tag: kept }) => {
                  toast({
                    kind: "success",
                    title: "Tags merged.",
                    detail: `${tag.name} is now ${kept.name}.`,
                  });
                  setMerging(false);
                  onClose();
                },
                onError: failed,
              },
            );
          }}
          onClose={() => {
            setMerging(false);
          }}
        />
      )}
      {confirming && (
        <ConfirmModal
          open
          title={`Remove ${tag.name}?`}
          confirmLabel="Remove"
          destructive
          busy={remove.isPending}
          onCancel={() => {
            setConfirming(false);
          }}
          onConfirm={() => {
            remove.mutate(
              { id: tag.id },
              {
                onSuccess: ({ outcome }) => {
                  toast({
                    kind: "success",
                    title: outcome === "deleted" ? "Tag removed." : "Tag archived.",
                    detail:
                      outcome === "deleted" ? tag.name : `${tag.name} is in use, so past receipts keep it.`,
                  });
                  setConfirming(false);
                  onClose();
                },
                onError: failed,
              },
            );
          }}
        >
          If an item or a purchase has it, it is archived instead: hidden from the pickers, kept on past
          receipts.
        </ConfirmModal>
      )}
    </>
  );
}
