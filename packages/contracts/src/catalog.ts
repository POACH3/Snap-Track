import { z } from "zod";
import { procedure } from "./procedure.ts";

// Stores (companies) and the identifiers they are recognized by (SPEC.md §5, §6.4, §6.7).

/** The kinds of detail a store is recognized by (SPEC.md §5, `store_identifiers.type`). */
export const StoreIdentifierType = z.enum(["name", "legal_name", "logo_text", "phone", "website", "address"]);
export type StoreIdentifierType = z.infer<typeof StoreIdentifierType>;

/** An ambiguous identifier is never used for automatic matching. */
export const IdentifierState = z.enum(["active", "ambiguous"]);
export type IdentifierState = z.infer<typeof IdentifierState>;

/** How a receipt's store was set (SPEC.md §5, `receipts.store_matched_by`). */
export const StoreMatchedBy = z.enum(["identifier", "user", "import_format"]);
export type StoreMatchedBy = z.infer<typeof StoreMatchedBy>;

/** Store names are unique, ignoring case. */
export const MAX_STORE_NAME_LENGTH = 100;
export const StoreName = z.string().trim().min(1).max(MAX_STORE_NAME_LENGTH);

export const StoreRef = z.object({ id: z.uuid(), name: z.string() });
export type StoreRef = z.infer<typeof StoreRef>;

/** One identifier as people see it: the value as first printed (or typed), not the normalized one. */
export const IdentifierRef = z.object({ type: StoreIdentifierType, displayValue: z.string() });
export type IdentifierRef = z.infer<typeof IdentifierRef>;

/** What made an automatic match, stored on the receipt (`receipts.store_match`) to explain it. */
export const StoreMatch = z.object({
  /** The strong identifiers that pointed to the store. */
  matched: z.array(IdentifierRef),
  /** Addresses saved for the same store: further evidence, never a match on their own. */
  supporting: z.array(IdentifierRef),
});
export type StoreMatch = z.infer<typeof StoreMatch>;

/** Why a receipt's store needs a person (SPEC.md §6.4 step 1). */
export const StoreIssue = z.enum(["conflict", "address_only", "unknown"]);
export type StoreIssue = z.infer<typeof StoreIssue>;

/** A store offered on the review screen, and why. Never applied without a person. */
export const StoreSuggestion = z.object({
  store: StoreRef,
  /** `identifier`: a saved strong identifier points to it; `address`: only an address does. */
  reason: z.enum(["identifier", "address", "brand_guess", "similar_name"]),
  identifiers: z.array(IdentifierRef),
});
export type StoreSuggestion = z.infer<typeof StoreSuggestion>;

/** "This phone number is saved for Target. Move it to Walmart?" (SPEC.md §6.7). */
export const IdentifierQuestion = z.object({
  /** Stable for one identifier; sent back with the answer. */
  key: z.string(),
  identifier: IdentifierRef,
  savedFor: StoreRef,
});
export type IdentifierQuestion = z.infer<typeof IdentifierQuestion>;

export const IdentifierAnswer = z.object({ key: z.string().max(400), move: z.boolean() });
export type IdentifierAnswer = z.infer<typeof IdentifierAnswer>;

/** Told to the user after learning, with no question asked. */
export const LearningNotice = z.object({
  kind: z.literal("shared_address"),
  identifier: IdentifierRef,
  alsoSavedFor: StoreRef,
});
export type LearningNotice = z.infer<typeof LearningNotice>;

export const StoreIdentifier = z.object({
  id: z.uuid(),
  type: StoreIdentifierType,
  displayValue: z.string(),
  state: IdentifierState,
  timesSeen: z.number().int().min(0),
  lastSeenAt: z.iso.datetime().nullable(),
  /** Typed in the Library rather than learned from a receipt. */
  addedByHand: z.boolean(),
});
export type StoreIdentifier = z.infer<typeof StoreIdentifier>;

export const StoreListEntry = StoreRef.extend({ identifierCount: z.number().int().min(0) });
export type StoreListEntry = z.infer<typeof StoreListEntry>;

export const StoreDetail = z.object({ store: StoreRef, identifiers: z.array(StoreIdentifier) });
export type StoreDetail = z.infer<typeof StoreDetail>;

const NEEDS_ANSWERS = {
  status: 409,
  message: "Some details are saved for another store. Choose whether to move them.",
  data: z.object({ questions: z.array(IdentifierQuestion) }),
} as const;
const STORE_NOT_FOUND = { status: 404, message: "No such store." } as const;

export const catalogContract = {
  stores: {
    /** By name, for the store picker. An empty query lists stores alphabetically. */
    search: procedure
      .route({ method: "GET" })
      .input(z.object({ query: z.string().max(MAX_STORE_NAME_LENGTH).default("") }))
      .output(z.object({ stores: z.array(StoreRef) })),
    /** Every store, alphabetically (Library › Stores). */
    list: procedure.route({ method: "GET" }).output(z.object({ stores: z.array(StoreListEntry) })),
    get: procedure
      .route({ method: "GET" })
      .input(z.object({ id: z.uuid() }))
      .output(StoreDetail)
      .errors({ STORE_NOT_FOUND }),
    rename: procedure
      .input(z.object({ id: z.uuid(), name: StoreName }))
      .output(z.object({ store: StoreRef }))
      .errors({
        STORE_NOT_FOUND,
        STORE_NAME_TAKEN: { status: 409, message: "Another store already has that name." },
      }),
  },
  identifiers: {
    /**
     * Add an identifier by hand. Normalized like a learned one. If it is saved for another
     * store, the first call returns NEEDS_ANSWERS and changes nothing.
     */
    add: procedure
      .input(
        z.object({
          storeId: z.uuid(),
          type: StoreIdentifierType,
          value: z.string().trim().min(1).max(300),
          answers: z.array(IdentifierAnswer).max(1).default([]),
        }),
      )
      .output(StoreDetail)
      .errors({
        STORE_NOT_FOUND,
        NEEDS_ANSWERS,
        INVALID_IDENTIFIER: {
          status: 400,
          message: "That can't identify a store (too short, or it belongs to a payment company).",
        },
        IDENTIFIER_EXISTS: { status: 409, message: "This store already has that identifier." },
        SHARED_ADDRESS: {
          status: 409,
          message:
            "That address is saved for another store. Both are there, so it is now a shared location, used for neither.",
          data: z.object({ alsoSavedFor: StoreRef }),
        },
      }),
    remove: procedure
      .input(z.object({ id: z.uuid() }))
      .output(StoreDetail)
      .errors({ IDENTIFIER_NOT_FOUND: { status: 404, message: "No such identifier." } }),
    /** Mark ambiguous (never used for matching), or active again. */
    setState: procedure
      .input(z.object({ id: z.uuid(), state: IdentifierState }))
      .output(StoreDetail)
      .errors({ IDENTIFIER_NOT_FOUND: { status: 404, message: "No such identifier." } }),
  },
};

export { NEEDS_ANSWERS as NEEDS_ANSWERS_ERROR };
