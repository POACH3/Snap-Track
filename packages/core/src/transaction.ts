/** A function's return type, refused if it is a Promise. */
export type NotPromise<T> = T extends PromiseLike<unknown> ? never : T;

/**
 * Runs `fn` so its database changes are saved together or not at all (SPEC.md §3.1 rule 7).
 * The database driver is synchronous, and anything after an `await` would run after the
 * transaction has already been saved, so `fn` may not return a Promise.
 */
export interface Transaction {
  run<T>(fn: () => NotPromise<T>): T;
}
