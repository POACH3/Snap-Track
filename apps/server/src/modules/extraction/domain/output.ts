import { ExtractedReceipt } from "@snaptrack/contracts";

/**
 * The model's reply as extracted data, or undefined if it isn't a JSON object. Tolerates what
 * models add around JSON: code fences and a sentence before or after. Individual fields that are
 * wrong become null (see `ExtractedReceipt`), so only an unreadable reply as a whole is invalid.
 */
export function parseModelOutput(content: string): ExtractedReceipt | undefined {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start === -1 || end < start) return undefined;
  let json: unknown;
  try {
    json = JSON.parse(content.slice(start, end + 1));
  } catch {
    return undefined;
  }
  if (typeof json !== "object" || json === null || Array.isArray(json)) return undefined;
  const parsed = ExtractedReceipt.safeParse(json);
  return parsed.success ? parsed.data : undefined;
}
