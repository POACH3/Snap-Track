// Lowercase segments of letters, digits, `-` and `.`, joined by `/`; no empty, `.` or `..` segments.
const SEGMENT = /^[a-z0-9][a-z0-9.-]*$/;

/** Whether a FileStore key is well formed, so it can never point outside the store. */
export function isValidFileKey(key: string): boolean {
  if (key.length === 0 || key.length > 300) return false;
  return key
    .split("/")
    .every((segment) => SEGMENT.test(segment) && segment !== "." && !segment.includes(".."));
}

/** Throws on a malformed key: keys are made by code, so a bad one is a bug. */
export function assertValidKey(key: string): void {
  if (!isValidFileKey(key)) throw new Error(`Invalid file key: ${JSON.stringify(key)}`);
}
