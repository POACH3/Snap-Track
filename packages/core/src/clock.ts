/** The current time, behind a port so tests control it (SPEC.md §3.1 rule 1). */
export interface Clock {
  now(): Date;
}
