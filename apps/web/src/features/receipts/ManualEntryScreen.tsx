import { isDefinedError } from "@orpc/client";
import type { IdentifierQuestion } from "@snaptrack/contracts";
import { ArrowLeft } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Link, useBlocker, useNavigate } from "react-router";
import { useLockPageScroll } from "../../shared/use-lock-page-scroll.ts";
import { useMediaQuery, WIDE } from "../../shared/use-media-query.ts";
import { Button } from "../../shared/ui/Button.tsx";
import { ConfirmModal } from "../../shared/ui/ConfirmModal.tsx";
import { TextField } from "../../shared/ui/TextField.tsx";
import { useToast } from "../../shared/ui/toast-context.ts";
import { CategoryPicker } from "../labels/CategoryPicker.tsx";
import { pathsOf, SOURCE_TEXT } from "../labels/labels.ts";
import { useCategories, useStoreDefault } from "../labels/use-labels.ts";
import { DuplicateWarnings } from "./DuplicateWarnings.tsx";
import labelStyles from "./LineLabels.module.css";
import styles from "./ManualEntry.module.css";
import { MoveQuestions } from "./MoveQuestions.tsx";
import { ReceiptFields, type Update } from "./ReceiptFields.tsx";
import { draftFromForm, emptyForm, quickEntryForm, type FormErrors, type FormState } from "./receipt-form.ts";
import { formatTotal } from "./receipt-format.ts";
import screen from "./ReceiptScreen.module.css";
import { StoreChoice, type ChosenStore } from "./StoreChoice.tsx";
import { useDraftCheck, usePutManual } from "./use-receipts.ts";

/** Today's local date, `YYYY-MM-DD`. */
function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

type Mode = "quick" | "items";

/**
 * Add expense (SPEC.md §6.6; docs/DESIGN.md, "Add expense"): a purchase with no paper receipt.
 * Quick entry (store, date, total, category, note) or the full form with lines, the same fields
 * as review without the photo. Saved as confirmed with **Save expense**.
 */
export function ManualEntryScreen() {
  const wide = useMediaQuery(WIDE);
  // The phone layout's card stays put; only its body scrolls, as on the receipt page.
  useLockPageScroll(!wide);
  const navigate = useNavigate();
  const toast = useToast();
  const save = usePutManual();
  // Made once, like a photo's: a retried save is the same entry.
  const [id] = useState(() => crypto.randomUUID());
  const [mode, setMode] = useState<Mode>("quick");
  const [store, setStore] = useState<ChosenStore>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm(today()));
  const [initial] = useState(() => JSON.stringify(emptyForm(today())));
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [storeError, setStoreError] = useState<string>();
  const [questions, setQuestions] = useState<IdentifierQuestion[] | null>(null);
  const leaving = useRef(false);

  const storeId = store?.kind === "existing" ? store.store.id : null;
  const knownStore = store?.kind === "existing" ? store.store : null;
  const storeDefault = useStoreDefault(storeId).categoryId;
  const categories = useCategories().data?.categories;
  const paths = useMemo(() => pathsOf(categories ?? []), [categories]);

  const toSend = mode === "quick" ? quickEntryForm(form, categoryId) : form;
  const parsed = draftFromForm(toSend);
  const draft = "draft" in parsed ? parsed.draft : undefined;
  const check = useDraftCheck(id, draft, storeId, true);
  const dirty = store !== null || categoryId !== null || JSON.stringify(form) !== initial;

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !leaving.current && currentLocation.pathname !== nextLocation.pathname,
  );

  const update: Update = (change) => {
    setForm((current) => change(current));
  };
  const set = (key: "date" | "time" | "total" | "note") => (value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  function done() {
    leaving.current = true;
    void navigate("/");
  }

  function submit(answers: Record<string, boolean> = {}) {
    if (store === null) {
      setStoreError("Choose a store, or type a new store's name.");
      return;
    }
    if (!("draft" in parsed)) {
      setErrors(parsed.errors);
      return;
    }
    if (parsed.draft.totalCents === null) {
      setErrors({ total: "Enter the total. Every other field may be left empty." });
      return;
    }
    setErrors({});
    save.mutate(
      {
        id,
        capturedAt: new Date().toISOString(),
        store:
          store.kind === "existing"
            ? { kind: "existing", storeId: store.store.id }
            : { kind: "new", name: store.name },
        draft: parsed.draft,
        answers: Object.entries(answers).map(([key, move]) => ({ key, move })),
      },
      {
        onSuccess: (result) => {
          setQuestions(null);
          toast({
            kind: "success",
            title: "Expense saved.",
            detail: `${result.receipt.store?.name ?? ""} · ${formatTotal(result.receipt.totalCents)}`,
          });
          done();
        },
        onError: (error) => {
          if (!isDefinedError(error)) {
            toast({
              kind: "error",
              title: "Couldn't save the expense.",
              detail: "Check your connection, then try again.",
            });
            return;
          }
          switch (error.code) {
            case "NEEDS_ANSWERS":
              setQuestions(error.data.questions);
              return;
            case "STORE_NAME_TAKEN":
              setStoreError("A store with that name exists. Search for it and choose it instead.");
              return;
            case "STORE_NOT_FOUND":
              setStoreError("That store no longer exists. Choose another.");
              return;
          }
        },
      },
    );
  }

  const effective =
    categoryId !== null
      ? { categoryId, source: "line" as const }
      : storeDefault !== null
        ? { categoryId: storeDefault, source: "store" as const }
        : null;

  const modeSwitch = (
    <div role="group" aria-label="Entry" className={styles.modes}>
      {(
        [
          ["quick", "Quick"],
          ["items", "Items"],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          className={styles.mode}
          aria-pressed={mode === value}
          onClick={() => {
            setMode(value);
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );

  const storeChoice = (
    <StoreChoice
      printed={null}
      suggestions={[]}
      detected={null}
      prompt={null}
      value={store}
      onChange={(next) => {
        setStore(next);
        setStoreError(undefined);
      }}
      error={storeError}
    />
  );

  const quickFields = (
    <div className={styles.fields}>
      {storeChoice}
      <div className={styles.pair}>
        <TextField
          label="Date"
          type="date"
          value={form.date}
          error={errors["date"]}
          onChange={(e) => {
            set("date")(e.target.value);
          }}
        />
        <TextField
          label="Total"
          inputMode="decimal"
          className={styles.amount}
          value={form.total}
          error={errors["total"]}
          onChange={(e) => {
            set("total")(e.target.value);
          }}
        />
      </div>
      <div className={styles.category}>
        <span className={styles.label}>
          Category <span className={styles.optional}>(optional)</span>
        </span>
        <div>
          <button
            type="button"
            className={labelStyles.chip}
            aria-label={
              effective === null
                ? "Category: none. Choose one"
                : `Category: ${paths.get(effective.categoryId) ?? ""}, ${SOURCE_TEXT[effective.source]}. Change it`
            }
            onClick={() => {
              setPicking(true);
            }}
          >
            {effective === null ? (
              "Category"
            ) : (
              <>
                {paths.get(effective.categoryId) ?? "Category"}
                <span className={labelStyles.source}>· {SOURCE_TEXT[effective.source]}</span>
              </>
            )}
          </button>
        </div>
        {storeDefault !== null && categoryId === null && (
          <span className={styles.hint}>Tap to choose another, for this purchase only.</span>
        )}
      </div>
      <div className={styles.note}>
        <label htmlFor={`${id}-note`} className={styles.label}>
          Note
        </label>
        <textarea
          id={`${id}-note`}
          className={styles.textarea}
          rows={3}
          value={form.note}
          onChange={(event) => {
            set("note")(event.target.value);
          }}
        />
      </div>
    </div>
  );

  const itemFields = (
    <div className={styles.fields}>
      {storeChoice}
      <ReceiptFields
        form={form}
        update={update}
        errors={errors}
        warnings={new Map()}
        wide={wide}
        rawText={null}
        store={knownStore}
        editing
        manual
      />
    </div>
  );

  const body = (
    <>
      <DuplicateWarnings duplicates={check?.duplicates ?? []} />
      {mode === "quick" ? quickFields : itemFields}
    </>
  );
  const saveButton = (
    <Button
      fullWidth={!wide}
      busy={save.isPending}
      onClick={() => {
        submit();
      }}
    >
      Save expense
    </Button>
  );

  return (
    <>
      {wide ? (
        <div className={screen.desktop}>
          <Link to="/" className={screen.back}>
            <ArrowLeft size={18} aria-hidden /> Receipts
          </Link>
          <div className={styles.desktopForm}>
            <header className={styles.desktopHead}>
              <h1 className={screen.title}>Add expense</h1>
              {modeSwitch}
            </header>
            <section aria-label="Expense" className={styles.desktopCard}>
              {body}
              <div className={styles.desktopActions}>
                <Button
                  variant="secondary"
                  onClick={() => {
                    void navigate("/");
                  }}
                >
                  Cancel
                </Button>
                {saveButton}
              </div>
            </section>
          </div>
        </div>
      ) : (
        <div className={`${screen.phone} ${screen.noPhoto}`}>
          <div className={screen.topRow}>
            <Link to="/" className={screen.back}>
              <ArrowLeft size={18} aria-hidden /> Receipts
            </Link>
          </div>
          <section className={screen.editCard} aria-labelledby="add-heading">
            <header className={`${screen.cardHeader} ${screen.ruled}`}>
              <div className={screen.cardHeading}>
                <h1 id="add-heading" className={screen.cardTitle}>
                  Add expense
                </h1>
                {modeSwitch}
              </div>
            </header>
            <div className={screen.cardBody}>{body}</div>
            <footer className={screen.cardFooter}>{saveButton}</footer>
          </section>
        </div>
      )}

      {picking && (
        <CategoryPicker
          title="Category"
          subtitle="This expense, for this purchase only"
          selected={effective?.categoryId ?? null}
          saveLabel="Save category"
          onClear={
            categoryId === null
              ? undefined
              : () => {
                  setCategoryId(null);
                  setPicking(false);
                }
          }
          onSave={(chosen) => {
            setCategoryId(chosen);
            setPicking(false);
          }}
          onClose={() => {
            setPicking(false);
          }}
        />
      )}

      {questions !== null && (
        <MoveQuestions
          questions={questions}
          busy={save.isPending}
          saveLabel="Save expense"
          onCancel={() => {
            setQuestions(null);
          }}
          onSave={submit}
        />
      )}

      <ConfirmModal
        open={blocker.state === "blocked"}
        title="Discard this expense?"
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        destructive
        onCancel={() => {
          blocker.reset?.();
        }}
        onConfirm={() => {
          blocker.proceed?.();
        }}
      >
        Nothing has been saved yet. Leaving now discards what you typed.
      </ConfirmModal>
    </>
  );
}
