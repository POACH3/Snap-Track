import type { IdentifierRef, StoreEvidence } from "@snaptrack/contracts";
import type { Id } from "@snaptrack/core";
import type { Identification } from "./identify-store.ts";
import { normalizeName } from "./identifiers.ts";

/** How alike two names must be to suggest a store (bigram Dice score, 0 to 1). */
export const SIMILAR_NAME_THRESHOLD = 0.5;
/** Most stores suggested at once. */
export const MAX_SUGGESTIONS = 5;

/** A known store and every name it goes by: its own and its saved name identifiers. */
export interface KnownStore {
  readonly id: Id;
  readonly name: string;
  readonly names: readonly string[];
}

export interface RankedSuggestion {
  readonly storeId: Id;
  readonly reason: "identifier" | "address" | "brand_guess" | "similar_name";
  readonly identifiers: readonly IdentifierRef[];
}

function bigrams(text: string): Map<string, number> {
  const compact = text.replace(/\s/g, "");
  const counts = new Map<string, number>();
  for (let i = 0; i < compact.length - 1; i++) {
    const pair = compact.slice(i, i + 2);
    counts.set(pair, (counts.get(pair) ?? 0) + 1);
  }
  return counts;
}

/** Sørensen–Dice score on character pairs of two normalized names: 1 for the same, 0 for nothing shared. */
export function nameSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const left = bigrams(a);
  const right = bigrams(b);
  let shared = 0;
  let total = 0;
  for (const [pair, count] of left) {
    shared += Math.min(count, right.get(pair) ?? 0);
    total += count;
  }
  for (const count of right.values()) total += count;
  return total === 0 ? 0 : (2 * shared) / total;
}

const best = (wanted: readonly string[], store: KnownStore): number =>
  Math.max(0, ...wanted.flatMap((name) => store.names.map((known) => nameSimilarity(name, known))));

/**
 * Stores to offer when a receipt has no store (SPEC.md §6.4): the stores its identifiers point
 * to now, then the store the model's brand guess names, then known stores with similar names.
 * Suggestions only; nothing here is ever applied.
 */
export function rankSuggestions(
  identification: Identification,
  evidence: StoreEvidence,
  stores: readonly KnownStore[],
): RankedSuggestion[] {
  // A receipt read before its store was learned can match now; that store is offered first.
  const suggestions: RankedSuggestion[] =
    identification.kind === "matched"
      ? [{ storeId: identification.storeId, reason: "identifier", identifiers: identification.match.matched }]
      : identification.candidates.map((candidate) => ({ ...candidate }));
  const taken = new Set(suggestions.map((suggestion) => suggestion.storeId));
  const open = () => stores.filter((store) => !taken.has(store.id));

  const guess = evidence.brandGuess === null ? null : normalizeName(evidence.brandGuess);
  if (guess !== null) {
    const named = open()
      .map((store) => ({ store, score: best([guess], store) }))
      .filter(({ score }) => score >= SIMILAR_NAME_THRESHOLD)
      .sort((a, b) => b.score - a.score)[0];
    if (named !== undefined) {
      suggestions.push({ storeId: named.store.id, reason: "brand_guess", identifiers: [] });
      taken.add(named.store.id);
    }
  }

  const printed = [evidence.printedName, evidence.logoText, evidence.legalName]
    .map((name) => (name === null ? null : normalizeName(name)))
    .filter((name): name is string => name !== null);
  if (printed.length > 0) {
    const similar = open()
      .map((store) => ({ store, score: best(printed, store) }))
      .filter(({ score }) => score >= SIMILAR_NAME_THRESHOLD)
      .sort((a, b) => b.score - a.score || a.store.name.localeCompare(b.store.name));
    for (const { store } of similar)
      suggestions.push({ storeId: store.id, reason: "similar_name", identifiers: [] });
  }

  return suggestions.slice(0, MAX_SUGGESTIONS);
}
