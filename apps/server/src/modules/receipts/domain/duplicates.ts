// Duplicate warnings (SPEC.md §6.5): whether two receipts look like the same purchase. Pure;
// the caller supplies the other receipts (same store, or sharing a photo) and the pairs a person
// said are not duplicates.
import type { Payment, TransactionNumber } from "@snaptrack/contracts";
import type { Id } from "@snaptrack/core";

export interface DuplicateFacts {
  readonly id: Id;
  readonly storeId: Id | null;
  /** `YYYY-MM-DD`, with `THH:MM` when a time was printed. */
  readonly purchasedAt: string | null;
  readonly totalCents: number | null;
  readonly transactionNumbers: readonly TransactionNumber[];
  readonly payments: readonly Pick<Payment, "approvalCode" | "last4">[];
  /** The photos' SHA-256, kept after the images are deleted (SPEC.md §6.8). */
  readonly imageHashes: readonly string[];
}

export type DuplicateReason = "transaction_number" | "approval_code" | "same_photo" | "same_details";

export interface Duplicate {
  readonly id: Id;
  readonly kind: "definite" | "possible";
  readonly reason: DuplicateReason;
  /** What matched, as printed. */
  readonly detail: string | null;
}

/** Printed codes compared without case, spaces or dashes ("TRN 0044-71" = "trn004471"). */
const code = (value: string | null | undefined) => (value ?? "").replace(/[\s-]/g, "").toUpperCase();

/** The order key of a pair, so one stored row covers it either way round. */
export function pairKey(a: Id, b: Id): [Id, Id] {
  return a < b ? [a, b] : [b, a];
}

function matchOf(target: DuplicateFacts, other: DuplicateFacts): Duplicate | undefined {
  const hashes = new Set(target.imageHashes);
  if (other.imageHashes.some((hash) => hashes.has(hash)))
    return { id: other.id, kind: "definite", reason: "same_photo", detail: null };

  // Everything else compares receipts of one known store.
  if (target.storeId === null || target.storeId !== other.storeId) return undefined;

  const numbers = new Map(
    target.transactionNumbers.map((t) => [code(t.value), t.value] as const).filter(([key]) => key !== ""),
  );
  const number = other.transactionNumbers.find((t) => numbers.has(code(t.value)));
  if (number !== undefined)
    return { id: other.id, kind: "definite", reason: "transaction_number", detail: number.value };

  const approvals = new Set(
    target.payments
      .filter((p) => code(p.approvalCode) !== "" && p.last4 !== null)
      .map((p) => `${code(p.approvalCode)}|${p.last4 ?? ""}`),
  );
  const approval = other.payments.find(
    (p) =>
      code(p.approvalCode) !== "" && p.last4 !== null && approvals.has(`${code(p.approvalCode)}|${p.last4}`),
  );
  if (approval !== undefined)
    return { id: other.id, kind: "definite", reason: "approval_code", detail: approval.approvalCode };

  if (
    target.purchasedAt !== null &&
    other.purchasedAt !== null &&
    target.totalCents !== null &&
    target.totalCents === other.totalCents &&
    sameMoment(target.purchasedAt, other.purchasedAt)
  )
    return { id: other.id, kind: "possible", reason: "same_details", detail: null };
  return undefined;
}

/** Same date, and the same time when both print one. */
function sameMoment(a: string, b: string): boolean {
  const [dateA, timeA] = a.split("T");
  const [dateB, timeB] = b.split("T");
  if (dateA !== dateB) return false;
  return timeA === undefined || timeB === undefined || timeA === timeB;
}

/**
 * The other receipts `target` looks like, definite first. Itself and `dismissed` pairs (ids a
 * person said are not duplicates of it) are left out.
 */
export function findDuplicates(
  target: DuplicateFacts,
  others: readonly DuplicateFacts[],
  dismissed: ReadonlySet<Id> = new Set(),
): Duplicate[] {
  return others
    .filter((other) => other.id !== target.id && !dismissed.has(other.id))
    .flatMap((other) => matchOf(target, other) ?? [])
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "definite" ? -1 : 1));
}
