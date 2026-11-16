import { isDefinedError } from "@orpc/client";
import {
  StoreIdentifierType,
  type IdentifierQuestion,
  type StoreDetail,
  type StoreIdentifier,
} from "@snaptrack/contracts";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { useId, useState, type SyntheticEvent } from "react";
import { Link, useParams } from "react-router";
import { Button } from "../../shared/ui/Button.tsx";
import { ConfirmModal } from "../../shared/ui/ConfirmModal.tsx";
import { EmptyState } from "../../shared/ui/EmptyState.tsx";
import { Loader } from "../../shared/ui/Loader.tsx";
import { Pill } from "../../shared/ui/Pill.tsx";
import { TextField } from "../../shared/ui/TextField.tsx";
import { useToast } from "../../shared/ui/toast-context.ts";
import { StoreDefaultCard } from "./LabelCards.tsx";
import { MergeStoreCard } from "./MergeCards.tsx";
import styles from "./Library.module.css";
import {
  useAddIdentifier,
  useRemoveIdentifier,
  useRenameStore,
  useSetIdentifierState,
  useStore,
} from "./use-stores.ts";

const TYPE_LABEL: Record<StoreIdentifierType, string> = {
  name: "Printed name",
  legal_name: "Legal name",
  logo_text: "Logo",
  phone: "Phone number",
  website: "Website",
  address: "Address",
};

const seen = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });

/**
 * One store: its name and every detail it is recognized by (SPEC.md §6.7). Everything is
 * editable, and the app matches by it from then on.
 */
export function StoreScreen() {
  const { id = "" } = useParams();
  const query = useStore(id);
  const back = (
    <Link to="/library/stores" className={styles.back}>
      <ArrowLeft size={18} aria-hidden /> Stores
    </Link>
  );
  if (query.isPending) return <Loader label="Loading store…" />;
  if (query.isError) {
    return (
      <div className={styles.screen}>
        {back}
        <EmptyState title={isDefinedError(query.error) ? "No such store" : "Can't load this store"}>
          {isDefinedError(query.error)
            ? "It may have been merged into another."
            : "Check your connection, then try again."}
        </EmptyState>
      </div>
    );
  }
  return (
    <div className={styles.screen}>
      {back}
      <Rename detail={query.data} />
      <StoreDefaultCard
        storeId={query.data.store.id}
        storeName={query.data.store.name}
        categoryId={query.data.defaultCategoryId}
      />
      <Identifiers detail={query.data} />
      <AddIdentifier storeId={query.data.store.id} storeName={query.data.store.name} />
      <MergeStoreCard storeId={query.data.store.id} storeName={query.data.store.name} />
    </div>
  );
}

function Rename({ detail }: { detail: StoreDetail }) {
  const rename = useRenameStore();
  const toast = useToast();
  const [name, setName] = useState(detail.store.name);
  const [error, setError] = useState<string>();
  const changed = name.trim() !== "" && name.trim() !== detail.store.name;

  function submit(event: SyntheticEvent) {
    event.preventDefault();
    if (name.trim() === "") {
      setError("Enter a name.");
      return;
    }
    rename.mutate(
      { id: detail.store.id, name: name.trim() },
      {
        onSuccess: ({ store }) => {
          setError(undefined);
          toast({ kind: "success", title: "Store renamed.", detail: store.name });
        },
        onError: (e) => {
          setError(
            isDefinedError(e) && e.code === "STORE_NAME_TAKEN"
              ? "Another store already has that name."
              : undefined,
          );
          if (!isDefinedError(e))
            toast({ kind: "error", title: "Couldn't rename the store.", detail: "Check your connection." });
        },
      },
    );
  }

  return (
    <form className={styles.card} onSubmit={submit}>
      <h1 className={styles.title}>{detail.store.name}</h1>
      <div className={styles.inline}>
        <TextField
          label="Name"
          className={styles.grow}
          value={name}
          error={error}
          onChange={(event) => {
            setName(event.target.value);
            setError(undefined);
          }}
        />
        <Button type="submit" variant="secondary" disabled={!changed} busy={rename.isPending}>
          Rename
        </Button>
      </div>
    </form>
  );
}

function Identifiers({ detail }: { detail: StoreDetail }) {
  const remove = useRemoveIdentifier();
  const setState = useSetIdentifierState();
  const toast = useToast();
  const [removing, setRemoving] = useState<StoreIdentifier | null>(null);

  return (
    <section className={styles.card} aria-labelledby="identifiers-heading">
      <h2 id="identifiers-heading" className={styles.subtitle}>
        Recognized by
      </h2>
      <p className={styles.detail}>
        A receipt is matched to {detail.store.name} automatically when it shows one of these. Ambiguous ones
        are kept but never used for matching.
      </p>
      {detail.identifiers.length === 0 ? (
        <p className={styles.detail}>
          Nothing yet. Details are learned when you confirm a receipt from this store.
        </p>
      ) : (
        <ul className={styles.identifiers} aria-label="Identifiers">
          {detail.identifiers.map((identifier) => (
            <li key={identifier.id} className={styles.identifier}>
              <span className={styles.text}>
                <span className={styles.idType}>{TYPE_LABEL[identifier.type]}</span>
                <span className={styles.name}>{identifier.displayValue}</span>
                <span className={styles.detail}>
                  {identifier.addedByHand
                    ? "Added by hand"
                    : `Seen ${identifier.timesSeen === 1 ? "once" : `${identifier.timesSeen} times`}${
                        identifier.lastSeenAt === null
                          ? ""
                          : `, last ${seen.format(new Date(identifier.lastSeenAt))}`
                      }`}
                </span>
              </span>
              {identifier.state === "ambiguous" && <Pill variant="warning">Ambiguous</Pill>}
              <span className={styles.actions}>
                <Button
                  variant="secondary"
                  busy={setState.isPending && setState.variables.id === identifier.id}
                  onClick={() => {
                    setState.mutate(
                      { id: identifier.id, state: identifier.state === "active" ? "ambiguous" : "active" },
                      {
                        onError: () => {
                          toast({
                            kind: "error",
                            title: "Couldn't change it.",
                            detail: "Check your connection.",
                          });
                        },
                      },
                    );
                  }}
                >
                  {identifier.state === "active" ? "Mark ambiguous" : "Use for matching"}
                </Button>
                <button
                  type="button"
                  className={styles.iconDanger}
                  aria-label={`Remove ${TYPE_LABEL[identifier.type].toLowerCase()} ${identifier.displayValue}`}
                  onClick={() => {
                    setRemoving(identifier);
                  }}
                >
                  <Trash2 size={18} aria-hidden />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <ConfirmModal
        open={removing !== null}
        title="Remove this detail?"
        confirmLabel="Remove detail"
        destructive
        busy={remove.isPending}
        onCancel={() => {
          setRemoving(null);
        }}
        onConfirm={() => {
          if (removing === null) return;
          remove.mutate(
            { id: removing.id },
            {
              onSuccess: () => {
                toast({ kind: "success", title: "Detail removed." });
              },
              onError: () => {
                toast({ kind: "error", title: "Couldn't remove it.", detail: "Check your connection." });
              },
              onSettled: () => {
                setRemoving(null);
              },
            },
          );
        }}
      >
        Receipts showing {removing?.displayValue} will no longer be matched to {detail.store.name} by it. It
        is learned again the next time you confirm a receipt from this store that shows it.
      </ConfirmModal>
    </section>
  );
}

function AddIdentifier({ storeId, storeName }: { storeId: string; storeName: string }) {
  const add = useAddIdentifier();
  const toast = useToast();
  const typeId = useId();
  const [type, setType] = useState<StoreIdentifierType>("phone");
  const [value, setValue] = useState("");
  const [zip, setZip] = useState("");
  const [error, setError] = useState<string>();
  const [question, setQuestion] = useState<IdentifierQuestion | null>(null);

  const text = type === "address" ? `${value.trim()}, ${zip.trim()}` : value.trim();

  function send(answers: { key: string; move: boolean }[] = []) {
    add.mutate(
      { storeId, type, value: text, answers },
      {
        onSuccess: () => {
          setQuestion(null);
          setValue("");
          setZip("");
          setError(undefined);
          toast({
            kind: "success",
            title: "Detail added.",
            detail: `Receipts showing it now match ${storeName}.`,
          });
        },
        onError: (e) => {
          if (!isDefinedError(e)) {
            toast({ kind: "error", title: "Couldn't add it.", detail: "Check your connection." });
            return;
          }
          switch (e.code) {
            case "NEEDS_ANSWERS":
              setQuestion(e.data.questions[0] ?? null);
              return;
            case "INVALID_IDENTIFIER":
              setError(e.message);
              return;
            case "IDENTIFIER_EXISTS":
              setError(e.message);
              return;
            case "SHARED_ADDRESS":
              setValue("");
              setZip("");
              toast({
                kind: "success",
                title: "Shared location",
                detail: `That address is also saved for ${e.data.alsoSavedFor.name}. Both stores are there, so it is no longer used to match either.`,
              });
              return;
            case "STORE_NOT_FOUND":
              toast({ kind: "error", title: "This store no longer exists." });
              return;
          }
        },
      },
    );
  }

  return (
    <form
      className={styles.card}
      onSubmit={(event) => {
        event.preventDefault();
        if (value.trim() === "" || (type === "address" && zip.trim() === "")) {
          setError(type === "address" ? "Enter the street and the ZIP." : "Enter a value.");
          return;
        }
        send();
      }}
    >
      <h2 className={styles.subtitle}>Add a detail</h2>
      <div className={styles.addGrid}>
        <div className={styles.field}>
          <label htmlFor={typeId} className={styles.label}>
            Kind
          </label>
          <select
            id={typeId}
            className={styles.select}
            value={type}
            onChange={(event) => {
              const next = StoreIdentifierType.safeParse(event.target.value);
              if (next.success) setType(next.data);
              setError(undefined);
            }}
          >
            {StoreIdentifierType.options.map((option) => (
              <option key={option} value={option}>
                {TYPE_LABEL[option]}
              </option>
            ))}
          </select>
        </div>
        <TextField
          label={type === "address" ? "Street" : "Value"}
          value={value}
          error={type === "address" ? undefined : error}
          onChange={(event) => {
            setValue(event.target.value);
            setError(undefined);
          }}
        />
        {type === "address" && (
          <TextField
            label="ZIP"
            inputMode="numeric"
            value={zip}
            error={error}
            onChange={(event) => {
              setZip(event.target.value);
              setError(undefined);
            }}
          />
        )}
      </div>
      <Button type="submit" variant="secondary" busy={add.isPending} className={styles.start}>
        <Plus size={18} aria-hidden /> Add detail
      </Button>

      <ConfirmModal
        open={question !== null}
        title="Move this detail?"
        confirmLabel={`Move it to ${storeName}`}
        cancelLabel={`Keep it with ${question?.savedFor.name ?? "the other store"}`}
        busy={add.isPending}
        onCancel={() => {
          setQuestion(null);
        }}
        onConfirm={() => {
          if (question !== null) send([{ key: question.key, move: true }]);
        }}
      >
        {question?.identifier.displayValue} is saved for {question?.savedFor.name}. Moving it means receipts
        showing it match {storeName} instead.
      </ConfirmModal>
    </form>
  );
}
