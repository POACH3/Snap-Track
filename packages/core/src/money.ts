import { err, ok, type Result } from "./result.ts";

/** An amount of money in integer cents (SPEC.md §5). */
export type Cents = number;

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function formatUsd(cents: Cents): string {
  return usd.format(cents / 100);
}

export type AllocationError =
  "weights-not-integers" | "weights-negative" | "weights-sum-to-zero" | "total-not-integer";

/**
 * Splits `total` across `weights` in proportion, so the parts add up to `total` exactly.
 * Used to spread tax, tip and receipt discounts over lines (SPEC.md §7).
 * Leftover cents go to the largest fractional remainders; ties go to the earlier weight,
 * so the result is the same every time.
 */
export function allocateCents(total: Cents, weights: readonly number[]): Result<Cents[], AllocationError> {
  if (!Number.isInteger(total)) return err("total-not-integer");
  if (!weights.every(Number.isInteger)) return err("weights-not-integers");
  if (weights.some((w) => w < 0)) return err("weights-negative");
  const weightSum = weights.reduce((sum, w) => sum + w, 0);
  if (weightSum === 0) return err("weights-sum-to-zero");

  // Work on the magnitude so rounding behaves the same for negative totals.
  const sign = total < 0 ? -1 : 1;
  const magnitude = Math.abs(total);
  const parts = weights.map((w, index) => {
    const exact = (magnitude * w) / weightSum;
    return { index, floor: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let leftover = magnitude - parts.reduce((sum, p) => sum + p.floor, 0);
  const byRemainder = [...parts].sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  const result = parts.map((p) => p.floor);
  for (const part of byRemainder) {
    if (leftover === 0) break;
    result[part.index] = (result[part.index] ?? 0) + 1;
    leftover -= 1;
  }
  return ok(result.map((c) => (c === 0 ? 0 : c * sign)));
}

/**
 * A decimal amount as printed (4.99) in cents. Printed amounts have at most two decimals, so
 * rounding only removes floating-point noise (4.99 × 100 = 499.00000000000006).
 */
export function dollarsToCents(amount: number): Cents {
  return Math.round(amount * 100);
}
