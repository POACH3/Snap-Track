import type { Id } from "@snaptrack/core";

/** Where a page of the receipts list ends: newest first by capture time, then id. */
export interface ListPosition {
  readonly capturedAt: string;
  readonly id: Id;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function encodeCursor(position: ListPosition): string {
  return `${position.capturedAt}~${position.id}`;
}

/** Undefined if the cursor was not made by `encodeCursor`. */
export function decodeCursor(cursor: string): ListPosition | undefined {
  const [capturedAt, id, ...rest] = cursor.split("~");
  if (rest.length > 0 || capturedAt === undefined || id === undefined) return undefined;
  if (!ISO_UTC.test(capturedAt) || !UUID.test(id)) return undefined;
  return { capturedAt, id };
}

/** Capture times are stored in one exact form, so that text order is time order. */
export function normalizeTimestamp(iso: string): string {
  return new Date(iso).toISOString();
}
