import { isDefinedError } from "@orpc/client";
import type { Category } from "@snaptrack/contracts";
import { Check, ChevronDown, ChevronRight, Plus, Search } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { Button } from "../../shared/ui/Button.tsx";
import { Modal } from "../../shared/ui/Modal.tsx";
import { useToast } from "../../shared/ui/toast-context.ts";
import { ancestorIds, childrenOf, hiddenIds, pathsOf } from "./labels.ts";
import styles from "./CategoryPicker.module.css";
import { useAddCategory, useCategories } from "./use-labels.ts";

export type Scope = "item" | "line";

interface CategoryPickerProps {
  title: string;
  /** Under the title: what is being classified. */
  subtitle: string;
  /** The category it has now, if any. */
  selected: string | null;
  /** For a line with an item: the "Apply to" choice, starting on This item (decided 2026-11-15). */
  scope?: { itemName: string } | undefined;
  saveLabel: string;
  busy?: boolean;
  onSave: (categoryId: string, scope: Scope) => void;
  /** Takes the category off, when there is one to take off. */
  onClear?: (() => void) | undefined;
  onClose: () => void;
}

/**
 * The hierarchy as a tree to browse, with a filter, a **New category** button and a row for
 * adding a class under each open category (docs/DESIGN.md, "Category picker"). Archived entries
 * and everything below them are left out.
 */
export function CategoryPicker({
  title,
  subtitle,
  selected,
  scope,
  saveLabel,
  busy = false,
  onSave,
  onClear,
  onClose,
}: CategoryPickerProps) {
  const toast = useToast();
  const query = useCategories();
  const add = useAddCategory();
  const all = useMemo(() => query.data?.categories ?? [], [query.data]);
  const hidden = useMemo(() => hiddenIds(all), [all]);
  const visible = useMemo(() => all.filter((c) => !hidden.has(c.id)), [all, hidden]);
  const children = useMemo(() => childrenOf(visible), [visible]);
  const paths = useMemo(() => pathsOf(all), [all]);

  const [choice, setChoice] = useState<string | null>(selected);
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(selected === null ? [] : ancestorIds(all, selected)),
  );
  const [filter, setFilter] = useState("");
  const [adding, setAdding] = useState<{ parentId: string | null } | null>(null);
  const [newName, setNewName] = useState("");
  const [applyTo, setApplyTo] = useState<Scope>("item");
  const filterId = useId();

  const toggle = (id: string) => {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const create = () => {
    const name = newName.trim();
    if (name === "" || adding === null) return;
    add.mutate(
      { name, parentId: adding.parentId },
      {
        onSuccess: ({ category }) => {
          setChoice(category.id);
          if (adding.parentId !== null)
            setOpen((current) => new Set([...current, adding.parentId as string]));
          setAdding(null);
          setNewName("");
          setFilter("");
        },
        onError: (error) => {
          const code = isDefinedError(error) ? error.code : undefined;
          toast({
            kind: "error",
            title: code === "NAME_TAKEN" ? "That name is taken here." : "Couldn't add it.",
            detail:
              code === "NAME_TAKEN"
                ? "Another entry in the same place already has that name."
                : code === "TOO_DEEP"
                  ? "Classes go four levels deep at most."
                  : "Check your connection.",
          });
        },
      },
    );
  };

  const addRow = (parentId: string | null, label: string, depth: number) =>
    adding !== null && adding.parentId === parentId ? (
      <li
        key={`adding-${parentId ?? "top"}`}
        className={styles.addForm}
        style={{ paddingLeft: indent(depth) }}
      >
        <label className={styles.hidden} htmlFor={`${filterId}-new`}>
          {label}
        </label>
        <input
          id={`${filterId}-new`}
          className={styles.input}
          value={newName}
          placeholder={parentId === null ? "New category" : "New class"}
          maxLength={60}
          autoFocus
          onChange={(event) => {
            setNewName(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              create();
            }
          }}
        />
        <Button variant="secondary" busy={add.isPending} disabled={newName.trim() === ""} onClick={create}>
          Add
        </Button>
      </li>
    ) : null;

  const rows: React.ReactNode[] = [];
  const matches =
    filter.trim() === ""
      ? null
      : visible.filter((c) => c.name.toLowerCase().includes(filter.trim().toLowerCase()));

  const row = (c: Category, depth: number, showPath: boolean) => {
    const kids = children.get(c.id) ?? [];
    const isOpen = open.has(c.id);
    const chosen = choice === c.id;
    rows.push(
      <li key={c.id} className={styles.rowItem}>
        <div
          className={chosen ? `${styles.row} ${styles.chosen}` : styles.row}
          style={{ paddingLeft: indent(depth) }}
        >
          {/* Every entry above L4 opens, so a first class can be added under it. */}
          {showPath || (kids.length === 0 && c.level >= 4) ? (
            <span className={styles.chevronSpace} aria-hidden />
          ) : (
            <button
              type="button"
              className={styles.chevron}
              aria-expanded={isOpen}
              aria-label={`${isOpen ? "Close" : "Open"} ${c.name}`}
              onClick={() => {
                toggle(c.id);
              }}
            >
              {isOpen ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
            </button>
          )}
          <button
            type="button"
            className={c.level === 1 ? `${styles.name} ${styles.top}` : styles.name}
            aria-pressed={chosen}
            onClick={() => {
              setChoice(c.id);
            }}
          >
            <span className={styles.nameText}>{c.name}</span>
            {showPath && <span className={styles.path}>{paths.get(c.id)}</span>}
          </button>
          {chosen && <Check size={16} aria-hidden className={styles.check} />}
        </div>
      </li>,
    );
    if (showPath || !isOpen) return;
    for (const kid of kids) row(kid, depth + 1, false);
    if (c.level < 4) {
      const adder = addRow(c.id, `New class under ${c.name}`, depth + 1);
      rows.push(
        adder ?? (
          <li key={`add-${c.id}`}>
            <button
              type="button"
              className={styles.addRow}
              style={{ marginLeft: indent(depth + 1) }}
              onClick={() => {
                setAdding({ parentId: c.id });
                setNewName("");
              }}
            >
              <Plus size={16} aria-hidden /> Add a class under {c.name}
            </button>
          </li>
        ),
      );
    }
  };

  if (matches === null) {
    const top = addRow(null, "New category", 0);
    if (top !== null) rows.push(top);
    for (const c of children.get(null) ?? []) row(c, 0, false);
  } else {
    for (const c of matches) row(c, 0, true);
  }

  return (
    <Modal
      open
      size="medium"
      title={title}
      busy={busy}
      onClose={onClose}
      actions={
        <>
          {onClear !== undefined && (
            <Button variant="ghost" className={styles.clear} disabled={busy} onClick={onClear}>
              Clear
            </Button>
          )}
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            busy={busy}
            disabled={choice === null}
            onClick={() => {
              if (choice !== null) onSave(choice, scope === undefined ? "line" : applyTo);
            }}
          >
            {saveLabel}
          </Button>
        </>
      }
    >
      <p className={styles.subtitle}>{subtitle}</p>
      <div className={styles.tools}>
        <label className={styles.filter} htmlFor={filterId}>
          <span className={styles.hidden}>Filter categories and classes</span>
          <Search size={18} aria-hidden className={styles.searchIcon} />
          <input
            id={filterId}
            className={`${styles.input} ${styles.filterInput}`}
            placeholder="Filter"
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
            }}
          />
        </label>
        <Button
          variant="secondary"
          onClick={() => {
            setFilter("");
            setAdding({ parentId: null });
            setNewName("");
          }}
        >
          <Plus size={18} aria-hidden /> New category
        </Button>
      </div>
      <ul className={styles.tree} aria-label="Categories and classes">
        {query.isPending ? <li className={styles.muted}>Loading…</li> : rows}
        {matches !== null && matches.length === 0 && <li className={styles.muted}>Nothing matches.</li>}
      </ul>
      {scope !== undefined && <ScopeChoice itemName={scope.itemName} value={applyTo} onChange={setApplyTo} />}
    </Modal>
  );
}

const indent = (depth: number) => `${6 + depth * 18}px`;

/** "Apply to": This item (every purchase of it) or This purchase only (SPEC.md §6.5). */
export function ScopeChoice({
  itemName,
  value,
  onChange,
}: {
  itemName: string;
  value: Scope;
  onChange: (scope: Scope) => void;
}) {
  const name = useId();
  return (
    <fieldset className={styles.scope}>
      <legend className={styles.legend}>Apply to</legend>
      <label className={styles.radio}>
        <input
          type="radio"
          name={name}
          checked={value === "item"}
          onChange={() => {
            onChange("item");
          }}
        />
        <span>
          <span className={styles.radioTitle}>This item</span>
          <span className={styles.radioHint}>Every purchase of {itemName}, at any store</span>
        </span>
      </label>
      <label className={styles.radio}>
        <input
          type="radio"
          name={name}
          checked={value === "line"}
          onChange={() => {
            onChange("line");
          }}
        />
        <span>
          <span className={styles.radioTitle}>This purchase only</span>
          <span className={styles.radioHint}>Only this line on this receipt</span>
        </span>
      </label>
    </fieldset>
  );
}
