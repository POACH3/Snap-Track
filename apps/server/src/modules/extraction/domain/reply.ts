/** Why the LLM server can't read a receipt right now (SPEC.md §6.3.1). None of these is a failure. */
export type WaitReason =
  | "busy" // a chat is running, or another model is loaded
  | "reserved" // the owner reserved the server
  | "offline" // the LLM server isn't running
  | "interrupted" // a chat took over mid-receipt
  | "cancelled"; // SnapTrack itself is stopping

/** What the `ReceiptExtractor` got back for one request. */
export type ExtractorReply =
  | { kind: "output"; content: string; model: string | null }
  | { kind: "wait"; reason: WaitReason; retryAfterMs: number | null }
  | { kind: "failure"; message: string };
