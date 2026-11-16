import { isDefinedError } from "@orpc/client";
import {
  receiptImagePath,
  type ConfirmReceiptInput,
  type IdentifierQuestion,
  type ReceiptDetail,
  type ReceiptDraft,
} from "@snaptrack/contracts";
import { ArrowLeft, ChevronRight, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useBlocker, useNavigate, useParams } from "react-router";
import { api } from "../../shared/api/client.ts";
import { useLockPageScroll } from "../../shared/use-lock-page-scroll.ts";
import { useMediaQuery, WIDE } from "../../shared/use-media-query.ts";
import { Button } from "../../shared/ui/Button.tsx";
import { ConfirmModal } from "../../shared/ui/ConfirmModal.tsx";
import { EmptyState } from "../../shared/ui/EmptyState.tsx";
import { ImageViewer } from "../../shared/ui/ImageViewer.tsx";
import { Loader } from "../../shared/ui/Loader.tsx";
import { useToast } from "../../shared/ui/toast-context.ts";
import { ReceiptFields, type Update } from "./ReceiptFields.tsx";
import { SetAllLines } from "./LineLabels.tsx";
import {
  draftFromForm,
  formFromDraft,
  warningField,
  warningText,
  type FormErrors,
  type FormState,
} from "./receipt-form.ts";
import { STATUS_LABEL, detectedName, formatTotal, shortDate } from "./receipt-format.ts";
import styles from "./ReceiptScreen.module.css";
import { MoveQuestions } from "./MoveQuestions.tsx";
import { identifierText, StoreChoice, type ChosenStore } from "./StoreChoice.tsx";
import { DuplicateWarnings } from "./DuplicateWarnings.tsx";
import {
  useConfirmReceipt,
  useDeleteReceipt,
  useDismissDuplicate,
  useDraftCheck,
  useReceipt,
  useRematch,
} from "./use-receipts.ts";

/** The receipt page (SPEC.md §6.5): the photo beside every field, for review, entry by hand, or a later look. */
export function ReceiptScreen() {
  const { id = "" } = useParams();
  const query = useReceipt(id);

  if (query.isPending) return <Loader label="Loading receipt…" />;
  if (query.isError) {
    const missing = isDefinedError(query.error); // RECEIPT_NOT_FOUND is its only defined error
    return (
      <div className={styles.message}>
        <BackLink />
        <EmptyState title={missing ? "No such receipt" : "Can't load this receipt"}>
          {missing ? "It may have been removed." : "Check your connection, then try again."}
        </EmptyState>
      </div>
    );
  }
  return <Review key={id} latest={query.data.receipt} />;
}

function BackLink() {
  return (
    <Link to="/" className={styles.back}>
      <ArrowLeft size={18} aria-hidden /> Receipts
    </Link>
  );
}

/**
 * The store the form starts with: the receipt's own, else, when nothing known is suggested, a new
 * store named as the receipt shows it, so a correct name needs no typing. Still only a choice:
 * nothing is saved until Confirm.
 */
function initialStore(receipt: ReceiptDetail): ChosenStore {
  if (receipt.store !== null) return { kind: "existing", store: receipt.store };
  const detected = detectedName(receipt.draft.storeEvidence);
  return detected !== null && receipt.storeSuggestions.length === 0 ? { kind: "new", name: detected } : null;
}
const storeKey = (store: ChosenStore) =>
  store === null ? "" : store.kind === "existing" ? store.store.id : `new:${store.name.toLowerCase()}`;
const storeLabel = (store: ChosenStore) =>
  store === null ? null : store.kind === "existing" ? store.store.name : store.name;

/** "The Fresh Mart receipt from Nov 13, its photo and its 6 lines will be removed from every total." */
function deleteText(receipt: ReceiptDetail): string {
  const store = receipt.store?.name ?? "unknown store's";
  const lines = receipt.draft.lines.length;
  const parts = [
    receipt.images.length === 0 ? null : receipt.images.length === 1 ? "its photo" : "its photos",
    lines === 0 ? null : lines === 1 ? "its 1 line" : `its ${lines} lines`,
  ].filter(Boolean);
  const what = receipt.source === "manual" ? "entry" : "receipt";
  return `The ${store} ${what} from ${shortDate(receipt.purchasedAt, receipt.capturedAt)}${parts.length > 0 ? `, ${parts.join(" and ")},` : ""} will be removed from every total.`;
}

/** What the page heading says about how the store was set. */
function matchText(receipt: ReceiptDetail): string | null {
  const [first] = receipt.storeMatch?.matched ?? [];
  if (receipt.storeMatchedBy === "identifier" && first !== undefined)
    return `Matched by ${identifierText(first)}`;
  return null;
}

/**
 * `latest` is what the server has now (it refreshes while a receipt is being read). The form works
 * from `receipt`, the version it was loaded from, and moves to a newer one only while nothing has
 * been changed, so a person's typing is never replaced; confirming from an old version is refused.
 */
const count = (n: number, one: string, many: string) => (n === 1 ? one : `${n} ${many}`);

function rematchTitle({ stores, items }: { stores: number; items: number }): string {
  if (items === 0) return `Match ${count(stores, "another receipt", "other receipts")} too?`;
  if (stores === 0) return `Match ${count(items, "an earlier purchase", "earlier purchases")} too?`;
  return "Match the others too?";
}

function rematchBody({ stores, items }: { stores: number; items: number }): string {
  const parts = [
    stores > 0
      ? `${count(stores, "Another receipt with no store", "receipts with no store")} now match a store you have confirmed.`
      : "",
    items > 0
      ? `${count(items, "An earlier purchase with no item", "earlier purchases with no item")} now match items you've named.`
      : "",
  ];
  return parts.filter(Boolean).join(" ");
}

function Review({ latest }: { latest: ReceiptDetail }) {
  const [receipt, setReceipt] = useState(latest);
  const wide = useMediaQuery(WIDE);
  // The phone layout's cards stay put; only the edit card scrolls inside.
  useLockPageScroll(!wide);
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirmReceipt();
  const rematch = useRematch();

  const initialForm = useMemo(() => formFromDraft(receipt.draft), [receipt]);
  const initialDraft = useMemo(() => JSON.stringify(draftFromForm(initialForm)), [initialForm]);
  const [form, setForm] = useState<FormState>(initialForm);
  const [store, setStore] = useState<ChosenStore>(initialStore(receipt));
  const [editing, setEditing] = useState(receipt.status !== "confirmed");
  const [step, setStep] = useState<"store" | "details">(receipt.store === null ? "store" : "details");
  const [changingStore, setChangingStore] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [storeError, setStoreError] = useState<string>();
  const [questions, setQuestions] = useState<IdentifierQuestion[] | null>(null);
  const [changed, setChanged] = useState(false);
  const [toRematch, setRematch] = useState({ stores: 0, items: 0 });
  const rematchCount = toRematch.stores + toRematch.items;
  const leaving = useRef(false);
  const reloading = useRef(false);
  const queryClient = useQueryClient();

  function startFrom(next: ReceiptDetail) {
    setReceipt(next);
    setForm(formFromDraft(next.draft));
    setStore(initialStore(next));
    setStep(next.store === null ? "store" : "details");
    setEditing(next.status !== "confirmed");
    setErrors({});
  }

  const parsed = draftFromForm(form);
  const draft: ReceiptDraft | undefined = "draft" in parsed ? parsed.draft : undefined;
  const dirty =
    JSON.stringify(parsed) !== initialDraft || storeKey(store) !== storeKey(initialStore(receipt));
  const storeId = store?.kind === "existing" ? store.store.id : null;
  const live = useDraftCheck(receipt.id, draft, storeId, editing && dirty);
  const liveWarnings = live?.warnings;
  const dismiss = useDismissDuplicate();
  const remove = useDeleteReceipt();
  const [deleting, setDeleting] = useState(false);
  // Pairs dismissed here leave the live list at once, before the next check comes back.
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const duplicates = (live?.duplicates ?? receipt.duplicates).filter((d) => !dismissed.has(d.receipt.id));

  useEffect(() => {
    if (latest.updatedAt === receipt.updatedAt) return;
    if (!dirty || reloading.current) {
      reloading.current = false;
      startFrom(latest);
    }
    // Only a new version from the server should restart the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latest.updatedAt]);
  const warnings = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const warning of liveWarnings ?? receipt.warnings) {
      const field = warningField(warning, form.lines);
      map.set(field, [...(map.get(field) ?? []), warningText(warning)]);
    }
    return map;
  }, [liveWarnings, receipt.warnings, form.lines]);

  // Leaving with unsaved changes asks first (SPEC.md §6.5).
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !leaving.current && currentLocation.pathname !== nextLocation.pathname,
  );

  const update: Update = (change) => {
    setForm((current) => change(current));
  };

  function done() {
    leaving.current = true;
    void navigate("/");
  }

  function submit(withAnswers: Record<string, boolean> = {}) {
    if (store === null) {
      setStoreError("Choose a store, or type a new store's name.");
      setStep("store");
      setChangingStore(true);
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
    const input: ConfirmReceiptInput = {
      id: receipt.id,
      expectedUpdatedAt: receipt.updatedAt,
      store:
        store.kind === "existing"
          ? { kind: "existing", storeId: store.store.id }
          : { kind: "new", name: store.name },
      draft: parsed.draft,
      answers: Object.entries(withAnswers).map(([key, move]) => ({ key, move })),
    };
    confirm.mutate(input, {
      onSuccess: (result) => {
        setQuestions(null);
        toast({
          kind: "success",
          title: receipt.status === "confirmed" ? "Receipt saved." : "Receipt confirmed.",
          detail: `${result.receipt.store?.name ?? ""} · ${formatTotal(result.receipt.totalCents)}`,
        });
        for (const notice of result.notices) {
          toast({
            kind: "success",
            title: "Shared location",
            detail: `This address is also saved for ${notice.alsoSavedFor.name}. It is now treated as a shared location.`,
          });
        }
        if (result.rematchCount + result.itemRematchCount > 0) {
          setRematch({ stores: result.rematchCount, items: result.itemRematchCount });
        } else done();
      },
      onError: (error) => {
        if (!isDefinedError(error)) {
          toast({
            kind: "error",
            title: "Couldn't confirm the receipt.",
            detail: "Check your connection, then try again.",
          });
          return;
        }
        switch (error.code) {
          case "NEEDS_ANSWERS":
            setQuestions(error.data.questions);
            return;
          case "RECEIPT_CHANGED":
            setQuestions(null);
            setChanged(true);
            return;
          case "STORE_NAME_TAKEN":
            setStoreError("A store with that name exists. Search for it and choose it instead.");
            setStep("store");
            setChangingStore(true);
            return;
          case "STORE_NOT_FOUND":
            setStoreError("That store no longer exists. Choose another.");
            setStep("store");
            setChangingStore(true);
            return;
          case "RECEIPT_NOT_FOUND":
            toast({ kind: "error", title: "This receipt no longer exists." });
            done();
            return;
        }
      },
    });
  }

  const chosenName = storeLabel(store);
  const reading = receipt.status === "uploaded" || receipt.status === "extracting";
  const sources = receipt.images.map((image) => receiptImagePath(image.id));
  const confirmLabel = receipt.status === "confirmed" ? "Save" : "Confirm";

  const storeChoice = (
    <StoreChoice
      printed={receipt.draft.storeEvidence.printedName ?? receipt.draft.storeEvidence.logoText}
      suggestions={receipt.storeSuggestions}
      detected={detectedName(receipt.draft.storeEvidence)}
      value={store}
      onChange={(next) => {
        setStore(next);
        setStoreError(undefined);
      }}
      error={storeError}
    />
  );
  const duplicateWarnings = (
    <DuplicateWarnings
      duplicates={duplicates}
      busy={dismiss.isPending || remove.isPending}
      onDelete={() => {
        setDeleting(true);
      }}
      onDismiss={(otherId) => {
        dismiss.mutate(
          { id: receipt.id, otherId },
          {
            onSuccess: () => {
              setDismissed((current) => new Set([...current, otherId]));
            },
            onError: () => {
              toast({ kind: "error", title: "Couldn't save that.", detail: "Check your connection." });
            },
          },
        );
      }}
    />
  );
  const deleteButton = (
    <button
      type="button"
      className={styles.deleteReceipt}
      onClick={() => {
        setDeleting(true);
      }}
    >
      <Trash2 size={16} aria-hidden /> Delete receipt
    </button>
  );
  const fields = (
    <fieldset className={styles.fieldset} disabled={!editing}>
      <legend className={styles.hidden}>Receipt details</legend>
      {reading && editing && (
        <p className={styles.notice}>
          This receipt is still being read. You can wait, or type it in yourself; what you confirm is kept.
        </p>
      )}
      <ReceiptFields
        form={form}
        update={update}
        errors={errors}
        warnings={warnings}
        wide={wide}
        rawText={receipt.rawText}
        store={store?.kind === "existing" ? store.store : null}
        editing={editing}
      />
    </fieldset>
  );
  const primary = editing ? (
    <Button
      fullWidth={!wide}
      busy={confirm.isPending}
      onClick={() => {
        submit();
      }}
    >
      {confirmLabel}
    </Button>
  ) : (
    <Button
      fullWidth={!wide}
      onClick={() => {
        setEditing(true);
      }}
    >
      Edit
    </Button>
  );
  const byline = `${shortDate(receipt.purchasedAt, receipt.capturedAt)} · Logged by ${receipt.loggedBy.displayName}`;

  return (
    <>
      {wide ? (
        <div className={styles.desktop}>
          <BackLink />
          <div className={sources.length > 0 ? styles.columns : undefined}>
            <div className={styles.form}>
              <header className={styles.header}>
                <div>
                  <h1 className={styles.title}>{chosenName ?? "Review receipt"}</h1>
                  <p className={styles.meta}>
                    {[
                      store !== null && storeKey(store) === storeKey(initialStore(receipt))
                        ? matchText(receipt)
                        : null,
                      STATUS_LABEL[receipt.status],
                      `Logged by ${receipt.loggedBy.displayName}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                {editing && receipt.store !== null && (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setChangingStore((open) => !open);
                    }}
                  >
                    {changingStore ? "Done" : "Change store"}
                  </Button>
                )}
              </header>
              {/* Open until the receipt has a saved store, so a pre-chosen new store is always seen. */}
              {editing && (receipt.store === null || changingStore) && (
                <section className={styles.storePanel}>{storeChoice}</section>
              )}
              {duplicateWarnings}
              {fields}
              <div className={styles.actions}>{primary}</div>
              <div className={styles.deleteRow}>{deleteButton}</div>
            </div>
            {sources.length > 0 && <ImageViewer sources={sources} controls className={styles.photoPane} />}
          </div>
        </div>
      ) : (
        <div className={sources.length > 0 ? styles.phone : `${styles.phone} ${styles.noPhoto}`}>
          <div className={styles.topRow}>
            <BackLink />
            <span className={styles.meta}>{byline}</span>
          </div>
          {sources.length > 0 && (
            <section aria-label="Photo" className={styles.photoCard}>
              <ImageViewer sources={sources} className={styles.photoViewer} />
            </section>
          )}
          <section className={styles.editCard} aria-labelledby="edit-heading">
            {editing && step === "store" ? (
              <>
                <header className={styles.cardHeader}>
                  <h1 id="edit-heading" className={styles.cardTitle}>
                    Store
                  </h1>
                  <span className={styles.meta}>1 of 2</span>
                </header>
                <div className={styles.cardBody}>{storeChoice}</div>
                <footer className={styles.cardFooter}>
                  <Button
                    fullWidth
                    disabled={store === null}
                    onClick={() => {
                      setStep("details");
                    }}
                  >
                    Continue to items <ChevronRight size={18} aria-hidden />
                  </Button>
                </footer>
              </>
            ) : (
              <>
                <header className={`${styles.cardHeader} ${styles.ruled}`}>
                  <div className={styles.cardHeading}>
                    <h1 id="edit-heading" className={styles.cardTitle}>
                      {editing ? "Items & totals" : (chosenName ?? "Receipt")}
                    </h1>
                    {editing && <SetAllLines update={update} count={form.lines.length} />}
                  </div>
                  <p className={styles.meta}>
                    {editing ? chosenName : (matchText(receipt) ?? STATUS_LABEL[receipt.status])}
                    {editing && (
                      <>
                        {" · "}
                        <button
                          type="button"
                          className={styles.linkButton}
                          onClick={() => {
                            setStep("store");
                          }}
                        >
                          Change store
                        </button>
                        {" · 2 of 2"}
                      </>
                    )}
                  </p>
                </header>
                <div className={styles.cardBody}>
                  {duplicateWarnings}
                  {fields}
                  <div className={styles.deleteRow}>{deleteButton}</div>
                </div>
                <footer className={styles.cardFooter}>{primary}</footer>
              </>
            )}
          </section>
        </div>
      )}

      {questions !== null && (
        <MoveQuestions
          questions={questions}
          busy={confirm.isPending}
          saveLabel={`${confirmLabel} receipt`}
          onCancel={() => {
            setQuestions(null);
          }}
          onSave={submit}
        />
      )}

      <ConfirmModal
        open={rematchCount > 0}
        title={rematchTitle(toRematch)}
        confirmLabel={rematchCount === 1 ? "Match it" : "Match them"}
        cancelLabel="Not now"
        busy={rematch.isPending}
        onCancel={() => {
          setRematch({ stores: 0, items: 0 });
          done();
        }}
        onConfirm={() => {
          rematch.mutate(
            {},
            {
              onSuccess: ({ matched, items }) => {
                const parts = [
                  matched > 0 ? (matched === 1 ? "1 receipt" : `${matched} receipts`) : null,
                  items > 0 ? (items === 1 ? "1 purchase" : `${items} purchases`) : null,
                ].filter(Boolean);
                toast({ kind: "success", title: `${parts.join(" and ") || "Nothing"} matched.` });
              },
              onError: () => {
                toast({
                  kind: "error",
                  title: "Couldn't match the other receipts.",
                  detail: "Nothing was changed.",
                });
              },
              onSettled: () => {
                setRematch({ stores: 0, items: 0 });
                done();
              },
            },
          );
        }}
      >
        {rematchBody(toRematch)} Nothing changes unless you say so.
      </ConfirmModal>

      <ConfirmModal
        open={changed}
        title="This receipt changed"
        confirmLabel="Reload"
        cancelLabel="Keep editing"
        onCancel={() => {
          setChanged(false);
        }}
        onConfirm={() => {
          setChanged(false);
          if (latest.updatedAt !== receipt.updatedAt) {
            startFrom(latest);
            return;
          }
          reloading.current = true;
          void queryClient.invalidateQueries({
            queryKey: api.receipts.get.key({ input: { id: receipt.id } }),
          });
        }}
      >
        Someone else saved it, or the model finished reading it, since you opened it. Reload to see the new
        version; your changes here will be lost.
      </ConfirmModal>

      <ConfirmModal
        open={deleting}
        title="Delete this receipt?"
        confirmLabel="Delete receipt"
        destructive
        busy={remove.isPending}
        onCancel={() => {
          setDeleting(false);
        }}
        onConfirm={() => {
          remove.mutate(
            { id: receipt.id },
            {
              onSuccess: () => {
                setDeleting(false);
                toast({ kind: "success", title: "Receipt deleted." });
                done();
              },
              onError: () => {
                toast({
                  kind: "error",
                  title: "Couldn't delete the receipt.",
                  detail: "Check your connection.",
                });
              },
            },
          );
        }}
      >
        {deleteText(receipt)} What was learned from it, like its store's details, is kept.
      </ConfirmModal>

      <ConfirmModal
        open={blocker.state === "blocked"}
        title="Discard your changes?"
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        destructive
        onCancel={() => {
          blocker.reset?.();
        }}
        onConfirm={() => {
          blocker.proceed?.();
        }}
      >
        Nothing on this receipt has been saved yet. Leaving now discards what you changed.
      </ConfirmModal>

      {Object.keys(errors).length > 0 && (
        <div className={styles.hidden} role="alert">
          Some fields need fixing.
        </div>
      )}
    </>
  );
}
