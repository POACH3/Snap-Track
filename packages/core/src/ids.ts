/** A UUID. Receipt IDs are made on the phone at capture time (SPEC.md §5). */
export type Id = string;

export function newId(): Id {
  return globalThis.crypto.randomUUID();
}
