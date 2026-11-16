import type {
  IdentifierRef,
  IdentifierState,
  StoreIdentifierType,
  StoreIssue,
  StoreMatch,
} from "@snaptrack/contracts";
import type { Id } from "@snaptrack/core";
import { isStrong, lookupKey, toRef, type ReceiptIdentifier } from "./identifiers.ts";

/** A row of `store_identifiers`, as the rules see it. */
export interface SavedIdentifier {
  readonly id: Id;
  readonly storeId: Id;
  readonly type: StoreIdentifierType;
  readonly value: string;
  readonly displayValue: string;
  readonly state: IdentifierState;
}

/** A store that a receipt's identifiers point to, and which of them do. */
export interface StoreCandidate {
  readonly storeId: Id;
  /** `identifier`: strong identifiers point to it; `address`: only addresses do. */
  readonly reason: "identifier" | "address";
  readonly identifiers: readonly IdentifierRef[];
}

export type Identification =
  | { readonly kind: "matched"; readonly storeId: Id; readonly match: StoreMatch }
  | {
      readonly kind: "needs-confirmation";
      readonly issue: StoreIssue;
      readonly candidates: readonly StoreCandidate[];
    };

/**
 * Decides a receipt's store from its identifiers and the saved identifiers sharing their values
 * (SPEC.md §6.4 step 1). A store is applied only when every strong hit points to it; addresses
 * only support a match, and ambiguous identifiers are ignored. Guesses never decide anything.
 */
export function identifyStore(
  identifiers: readonly ReceiptIdentifier[],
  saved: readonly SavedIdentifier[],
): Identification {
  const byKey = Map.groupBy(
    saved.filter((row) => row.state === "active"),
    (row) => lookupKey(row.type, row.value),
  );

  // For each store, the receipt's identifiers that point to it, strong and supporting apart.
  const strong = new Map<Id, IdentifierRef[]>();
  const addresses = new Map<Id, IdentifierRef[]>();
  for (const identifier of identifiers) {
    const target = isStrong(identifier.type) ? strong : addresses;
    const storeIds = new Set(
      (byKey.get(lookupKey(identifier.type, identifier.value)) ?? []).map((row) => row.storeId),
    );
    for (const storeId of storeIds) {
      const refs = target.get(storeId) ?? [];
      refs.push(toRef(identifier));
      target.set(storeId, refs);
    }
  }

  const ranked = (hits: Map<Id, IdentifierRef[]>, reason: StoreCandidate["reason"]): StoreCandidate[] =>
    [...hits]
      .sort(([, a], [, b]) => b.length - a.length)
      .map(([storeId, refs]) => ({ storeId, reason, identifiers: refs }));

  if (strong.size === 1) {
    const [[storeId, matched]] = [...strong] as [[Id, IdentifierRef[]]];
    return { kind: "matched", storeId, match: { matched, supporting: addresses.get(storeId) ?? [] } };
  }
  if (strong.size > 1)
    return { kind: "needs-confirmation", issue: "conflict", candidates: ranked(strong, "identifier") };
  if (addresses.size > 0) {
    return { kind: "needs-confirmation", issue: "address_only", candidates: ranked(addresses, "address") };
  }
  return { kind: "needs-confirmation", issue: "unknown", candidates: [] };
}
