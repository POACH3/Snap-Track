import { isDefinedError } from "@orpc/client";
import type { ItemDetail, ItemIdentifierType } from "@snaptrack/contracts";
import { formatUsd } from "@snaptrack/core";
import { ArrowLeft, Trash2 } from "lucide-react";
import { useState, type SyntheticEvent } from "react";
import { Link, useParams } from "react-router";
import { Button } from "../../shared/ui/Button.tsx";
import { ConfirmModal } from "../../shared/ui/ConfirmModal.tsx";
import { EmptyState } from "../../shared/ui/EmptyState.tsx";
import { Loader } from "../../shared/ui/Loader.tsx";
import { Pill } from "../../shared/ui/Pill.tsx";
import { TextField } from "../../shared/ui/TextField.tsx";
import { useToast } from "../../shared/ui/toast-context.ts";
import { purchaseText } from "../receipts/receipt-format.ts";
import styles from "./Library.module.css";
import {
  useItem,
  useItemPurchases,
  useRemoveItemIdentifier,
  useRenameItem,
  useSetItemIdentifierState,
} from "./use-items.ts";

const TYPE_LABEL: Record<ItemIdentifierType, string> = {
  barcode: "Barcode",
  code: "Item code",
  name: "Printed name",
};

const NAME_SOURCE: Record<ItemDetail["item"]["nameSource"], string> = {
  user: "Named by you",
  model: "Named from the model's reading",
  printed: "Named as printed",
};

/** One item: its name, what it is recognized by, and its latest purchases (SPEC.md §6.7). */
export function ItemScreen() {
  const { id = "" } = useParams();
  const query = useItem(id);
  const back = (
    <Link to="/library/items" className={styles.back}>
      <ArrowLeft size={18} aria-hidden /> Items
    </Link>
  );
  if (query.isPending) return <Loader label="Loading item…" />;
  if (query.isError) {
    return (
      <div className={styles.screen}>
        {back}
        <EmptyState title={isDefinedError(query.error) ? "No such item" : "Can't load this item"}>
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
      <Identifiers detail={query.data} />
      <Purchases itemId={query.data.item.id} />
    </div>
  );
}

function Rename({ detail }: { detail: ItemDetail }) {
  const rename = useRenameItem();
  const toast = useToast();
  const [name, setName] = useState(detail.item.name);
  const [error, setError] = useState<string>();
  const changed = name.trim() !== "" && name.trim() !== detail.item.name;

  function submit(event: SyntheticEvent) {
    event.preventDefault();
    if (name.trim() === "") {
      setError("Enter a name.");
      return;
    }
    rename.mutate(
      { id: detail.item.id, name: name.trim() },
      {
        onSuccess: ({ item }) => {
          toast({
            kind: "success",
            title: "Item renamed.",
            detail: `Every purchase of it now shows ${item.name}.`,
          });
        },
        onError: () => {
          toast({ kind: "error", title: "Couldn't rename the item.", detail: "Check your connection." });
        },
      },
    );
  }

  return (
    <form className={styles.card} onSubmit={submit}>
      <div>
        <h1 className={styles.title}>{detail.item.name}</h1>
        <p className={styles.detail}>{NAME_SOURCE[detail.item.nameSource]}</p>
      </div>
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

function Identifiers({ detail }: { detail: ItemDetail }) {
  const remove = useRemoveItemIdentifier();
  const setState = useSetItemIdentifierState();
  const toast = useToast();
  const [removing, setRemoving] = useState<ItemDetail["identifiers"][number] | null>(null);

  return (
    <section className={styles.card} aria-labelledby="item-identifiers-heading">
      <h2 id="item-identifiers-heading" className={styles.subtitle}>
        Recognized by
      </h2>
      <p className={styles.detail}>
        A line is matched to {detail.item.name} when it shows one of these: a barcode at any store, a code or
        printed name at its store.
      </p>
      {detail.identifiers.length === 0 ? (
        <p className={styles.detail}>
          Nothing yet. Details are learned when you confirm a receipt with this item.
        </p>
      ) : (
        <ul className={styles.identifiers} aria-label="Identifiers">
          {detail.identifiers.map((identifier) => (
            <li key={identifier.id} className={styles.identifier}>
              <span className={styles.text}>
                <span className={styles.idType}>
                  {TYPE_LABEL[identifier.type]}
                  {identifier.store === null ? " · any store" : ` · ${identifier.store.name}`}
                </span>
                <span className={styles.name}>{identifier.displayValue}</span>
                <span className={styles.detail}>
                  {identifier.timesSeen === 1 ? "Seen once" : `Seen ${identifier.timesSeen} times`}
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
        Lines showing {removing?.displayValue} will no longer be matched to {detail.item.name} by it.
        Purchases already on this item stay on it.
      </ConfirmModal>
    </section>
  );
}

function Purchases({ itemId }: { itemId: string }) {
  const query = useItemPurchases(itemId);
  return (
    <section className={styles.card} aria-labelledby="purchases-heading">
      <h2 id="purchases-heading" className={styles.subtitle}>
        Latest purchases
      </h2>
      {query.isPending ? (
        <Loader label="Loading purchases…" />
      ) : query.isError ? (
        <p className={styles.detail}>Can't load purchases. Check your connection.</p>
      ) : query.data.purchases.length === 0 ? (
        <p className={styles.detail}>No purchases yet.</p>
      ) : (
        <ul className={styles.identifiers} aria-label="Purchases">
          {query.data.purchases.map((purchase, index) => (
            <li key={`${purchase.receiptId}-${index}`} className={styles.identifier}>
              <Link to={`/receipts/${purchase.receiptId}`} className={`${styles.text} ${styles.plainLink}`}>
                <span className={styles.name}>{purchase.store?.name ?? "Unknown store"}</span>
                <span className={styles.detail}>
                  {purchaseText(purchase.purchasedAt, purchase.capturedAt)}
                </span>
              </Link>
              <span className={styles.amount}>
                {purchase.lineTotalCents === null ? "—" : formatUsd(purchase.lineTotalCents)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
