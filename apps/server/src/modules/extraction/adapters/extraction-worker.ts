import type { ExtractionService } from "../application/extraction-service.ts";

/** Pino-style logging, as Fastify's logger provides. */
export interface WorkerLog {
  info(details: object, message: string): void;
  error(details: object, message: string): void;
}

/** Longest the worker sleeps before checking the queue again, even with nothing due. */
const IDLE_CHECK_MS = 30_000;

/**
 * Runs extraction jobs one at a time in the server process (SPEC.md §6.3 step 7). Sleeps until
 * the next job is due, and wakes at once when a receipt is uploaded. Stopping abandons the
 * request in flight; its job goes back in the queue without using an attempt.
 */
export class ExtractionWorker {
  readonly #service: ExtractionService;
  readonly #log: WorkerLog;
  readonly #now: () => number;
  #running = false;
  #abort = new AbortController();
  #wake: (() => void) | undefined;
  #loop: Promise<void> | undefined;

  constructor(service: ExtractionService, log: WorkerLog, now: () => number = Date.now) {
    this.#service = service;
    this.#log = log;
    this.#now = now;
  }

  start(): void {
    if (this.#running) return;
    this.#running = true;
    this.#abort = new AbortController();
    const recovered = this.#service.recoverInterrupted();
    if (recovered > 0)
      this.#log.info({ jobs: recovered }, "Extraction jobs interrupted by a restart are queued again");
    this.#loop = this.#run();
  }

  /** Something new may be due: check the queue now instead of after the current sleep. */
  wake(): void {
    this.#wake?.();
  }

  async stop(): Promise<void> {
    this.#running = false;
    this.#abort.abort();
    this.wake();
    await this.#loop;
  }

  async #run(): Promise<void> {
    while (this.#running) {
      try {
        if ((await this.#service.runNextJob(this.#abort.signal)) === "worked") continue;
      } catch (error) {
        // A bug, not an expected failure (those are replies). Log it and keep the worker alive.
        this.#log.error({ err: error }, "Extraction worker error");
      }
      await this.#sleep();
    }
  }

  #sleep(): Promise<void> {
    if (!this.#running) return Promise.resolve();
    const due = this.#service.nextDueAt();
    const delay =
      due === undefined ? IDLE_CHECK_MS : Math.min(IDLE_CHECK_MS, Math.max(0, due.getTime() - this.#now()));
    return new Promise<void>((resolve) => {
      const timer = setTimeout(done, delay);
      function done() {
        clearTimeout(timer);
        resolve();
      }
      this.#wake = done;
    }).then(() => {
      this.#wake = undefined;
    });
  }
}
