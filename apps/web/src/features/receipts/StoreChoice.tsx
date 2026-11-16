import type { IdentifierRef, StoreRef, StoreSuggestion } from "@snaptrack/contracts";
import { CircleCheck, Plus, Search } from "lucide-react";
import { useId, useState } from "react";
import { useStoreSearch } from "../library/use-stores.ts";
import styles from "./StoreChoice.module.css";

/** The store a person picked: one already known, or a new one to create when the receipt is confirmed. */
export type ChosenStore = { kind: "existing"; store: StoreRef } | { kind: "new"; name: string } | null;

const TYPE_LABEL: Record<IdentifierRef["type"], string> = {
  name: "printed name",
  legal_name: "legal name",
  logo_text: "logo",
  phone: "phone number",
  website: "website",
  address: "address",
};

export const identifierText = (identifier: IdentifierRef) =>
  `${TYPE_LABEL[identifier.type]} ${identifier.displayValue}`;

function reason(suggestion: StoreSuggestion): string {
  const [first] = suggestion.identifiers;
  switch (suggestion.reason) {
    case "identifier":
      return first === undefined
        ? "Known details match"
        : `Its ${identifierText(first)} is saved for this store`;
    case "address":
      return first === undefined ? "Same address" : `Same address: ${first.displayValue}`;
    case "brand_guess":
      return "The receipt looks like this store's";
    case "similar_name":
      return "Similar name";
  }
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

interface StoreChoiceProps {
  /** What the receipt prints as the store's name, to show the person what to match. */
  printed: string | null;
  suggestions: readonly StoreSuggestion[];
  value: ChosenStore;
  onChange: (value: ChosenStore) => void;
  error?: string | undefined;
}

/**
 * Store needs confirmation (SPEC.md §6.5): suggested stores with why each is suggested, then a
 * search of known stores that can also create a new one. Nothing is saved until Confirm.
 */
export function StoreChoice({ printed, suggestions, value, onChange, error }: StoreChoiceProps) {
  const [query, setQuery] = useState("");
  const search = useStoreSearch(query);
  const inputId = useId();
  const suggested = new Set(suggestions.map((s) => s.store.id));
  const results = query.trim() === "" ? [] : (search.data?.stores ?? []).filter((s) => !suggested.has(s.id));
  const exact = [...suggestions.map((s) => s.store), ...results].some((s) => sameName(s.name, query));
  const chosenId = value?.kind === "existing" ? value.store.id : null;

  const option = (store: StoreRef, detail: string | null) => (
    <li key={store.id}>
      <button
        type="button"
        className={styles.option}
        aria-pressed={chosenId === store.id}
        onClick={() => {
          onChange({ kind: "existing", store });
        }}
      >
        <span className={styles.text}>
          <span className={styles.name}>{store.name}</span>
          {detail !== null && <span className={styles.reason}>{detail}</span>}
        </span>
        {chosenId === store.id && <CircleCheck size={20} className={styles.check} aria-hidden />}
      </button>
    </li>
  );

  return (
    <div className={styles.choice}>
      <p className={styles.prompt}>
        {printed === null ? (
          "Which store is this receipt from?"
        ) : (
          <>
            The receipt says <strong>{printed}</strong>. Which store is it?
          </>
        )}
      </p>
      {suggestions.length > 0 && (
        <ul className={styles.options} aria-label="Suggested stores">
          {suggestions.map((s) => option(s.store, reason(s)))}
        </ul>
      )}
      <div className={styles.search}>
        <label htmlFor={inputId} className={styles.label}>
          {suggestions.length > 0 ? "Another store" : "Store"}
        </label>
        <span className={styles.inputWrap}>
          <Search size={18} className={styles.icon} aria-hidden />
          <input
            id={inputId}
            className={styles.input}
            value={query}
            placeholder="Search, or type a new store's name"
            autoComplete="off"
            onChange={(event) => {
              setQuery(event.target.value);
            }}
          />
        </span>
        {error !== undefined && <p className={styles.error}>{error}</p>}
      </div>
      {(results.length > 0 || (query.trim() !== "" && !exact)) && (
        <ul className={styles.options} aria-label="Matching stores">
          {results.map((store) => option(store, null))}
          {query.trim() !== "" && !exact && (
            <li>
              <button
                type="button"
                className={styles.option}
                aria-pressed={value?.kind === "new" && sameName(value.name, query)}
                onClick={() => {
                  onChange({ kind: "new", name: query.trim() });
                }}
              >
                <span className={styles.text}>
                  <span className={styles.name}>
                    <Plus size={16} aria-hidden /> Create "{query.trim()}"
                  </span>
                  <span className={styles.reason}>A new store, saved when you confirm</span>
                </span>
                {value?.kind === "new" && sameName(value.name, query) && (
                  <CircleCheck size={20} className={styles.check} aria-hidden />
                )}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
