import type { Clock } from "../clock.ts";

/** A clock that only moves when told to. */
export class FakeClock implements Clock {
  #now: Date;

  constructor(start: Date = new Date("2026-01-15T12:00:00.000Z")) {
    this.#now = new Date(start);
  }

  now(): Date {
    return new Date(this.#now);
  }

  advance(ms: number): void {
    this.#now = new Date(this.#now.getTime() + ms);
  }

  set(time: Date): void {
    this.#now = new Date(time);
  }
}
