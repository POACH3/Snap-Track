/** A quantity in integer thousandths of its unit, so it is exact: 2.31 lb is 2310 (SPEC.md §5). */
export type Milli = number;

export function toMilli(quantity: number): Milli {
  return Math.round(quantity * 1000);
}

/** One of something: the quantity of a line that prints none. */
export const ONE: Milli = 1000;
