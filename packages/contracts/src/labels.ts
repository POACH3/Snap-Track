import { z } from "zod";
import { procedure } from "./procedure.ts";

// The classification hierarchy (categories and classes) and free tags (SPEC.md §5).

export const MAX_LABEL_NAME_LENGTH = 60;
/** Unique among an entry's siblings (L1 among L1), and tag names among tags, ignoring case. */
export const LabelName = z.string().trim().min(1).max(MAX_LABEL_NAME_LENGTH);

/** L1 category, L2 subcategory, L3 and L4 classes. */
export const CategoryLevel = z.number().int().min(1).max(4);
export const MAX_CATEGORY_LEVEL = 4;

export const Category = z.object({
  id: z.uuid(),
  name: z.string(),
  level: CategoryLevel,
  /** Exactly one level up; null for L1. */
  parentId: z.uuid().nullable(),
  sortOrder: z.number().int(),
  /** Hidden from pickers (with everything below it), kept on purchases. */
  archived: z.boolean(),
});
export type Category = z.infer<typeof Category>;

export const Tag = z.object({ id: z.uuid(), name: z.string(), archived: z.boolean() });
export type Tag = z.infer<typeof Tag>;

/** Where a line's category comes from (SPEC.md §5, Classification rules). */
export const CategorySource = z.enum(["line", "item", "store"]);
export type CategorySource = z.infer<typeof CategorySource>;

/** A line's category as worked out when read; null when Unclassified. */
export const LineCategory = z.object({ categoryId: z.uuid(), source: CategorySource });
export type LineCategory = z.infer<typeof LineCategory>;

/** What removing did: deleted when nothing used it, archived when something did (SPEC.md §5 Rules). */
export const RemoveOutcome = z.enum(["deleted", "archived"]);
export type RemoveOutcome = z.infer<typeof RemoveOutcome>;

const CATEGORY_NOT_FOUND = { status: 404, message: "No such category or class." } as const;
const CATEGORY_NAME_TAKEN = {
  status: 409,
  message: "Another entry in the same place already has that name.",
} as const;
const TAG_NOT_FOUND = { status: 404, message: "No such tag." } as const;
const MERGE_INPUT = z.object({ id: z.uuid(), intoId: z.uuid() });
const SAME = { status: 400, message: "Choose a different one to merge into." } as const;
const TAG_NAME_TAKEN = { status: 409, message: "Another tag already has that name." } as const;

export const categoriesContract = {
  /** Every entry, archived ones included, in tree order (parents before children, then sort order). */
  list: procedure.route({ method: "GET" }).output(z.object({ categories: z.array(Category) })),
  /** A new entry under `parentId` (one level below it), or a new L1 category when it is null. */
  add: procedure
    .input(z.object({ name: LabelName, parentId: z.uuid().nullable() }))
    .output(z.object({ category: Category }))
    .errors({
      PARENT_NOT_FOUND: { status: 404, message: "No such parent." },
      TOO_DEEP: { status: 400, message: "Classes go four levels deep at most." },
      NAME_TAKEN: CATEGORY_NAME_TAKEN,
    }),
  rename: procedure
    .input(z.object({ id: z.uuid(), name: LabelName }))
    .output(z.object({ category: Category }))
    .errors({ CATEGORY_NOT_FOUND, NAME_TAKEN: CATEGORY_NAME_TAKEN }),
  /** Under another parent on the level above; keeps its level and takes its children along. */
  move: procedure
    .input(z.object({ id: z.uuid(), parentId: z.uuid() }))
    .output(z.object({ category: Category }))
    .errors({
      CATEGORY_NOT_FOUND,
      INVALID_PARENT: { status: 400, message: "An entry can only move under a parent one level above it." },
      NAME_TAKEN: CATEGORY_NAME_TAKEN,
    }),
  /** Deletes an entry nothing uses and with no children; otherwise archives it. */
  remove: procedure
    .input(z.object({ id: z.uuid() }))
    .output(z.object({ outcome: RemoveOutcome }))
    .errors({ CATEGORY_NOT_FOUND }),
  /**
   * Merges `id` into `intoId`, on the same level (SPEC.md §5 Rules): its children move under the
   * kept entry (one with the same name as a child there merges into it), and everything that had
   * it has the kept one. `id` is then gone.
   */
  merge: procedure
    .input(MERGE_INPUT)
    .output(z.object({ category: Category }))
    .errors({
      CATEGORY_NOT_FOUND,
      SAME,
      DIFFERENT_LEVEL: { status: 400, message: "Entries merge only on the same level." },
    }),
  /** Back in the pickers; also brings back the archived entries above it. */
  restore: procedure
    .input(z.object({ id: z.uuid() }))
    .output(z.object({ category: Category }))
    .errors({ CATEGORY_NOT_FOUND }),
};

export const tagsContract = {
  /** Every tag, archived ones included, alphabetically, with how many purchases have it. */
  list: procedure
    .route({ method: "GET" })
    .output(z.object({ tags: z.array(Tag.extend({ purchaseCount: z.number().int().min(0) })) })),
  add: procedure
    .input(z.object({ name: LabelName }))
    .output(z.object({ tag: Tag }))
    .errors({ NAME_TAKEN: TAG_NAME_TAKEN }),
  rename: procedure
    .input(z.object({ id: z.uuid(), name: LabelName }))
    .output(z.object({ tag: Tag }))
    .errors({ TAG_NOT_FOUND, NAME_TAKEN: TAG_NAME_TAKEN }),
  /** Deletes a tag nothing uses; otherwise archives it. */
  remove: procedure
    .input(z.object({ id: z.uuid() }))
    .output(z.object({ outcome: RemoveOutcome }))
    .errors({ TAG_NOT_FOUND }),
  restore: procedure
    .input(z.object({ id: z.uuid() }))
    .output(z.object({ tag: Tag }))
    .errors({ TAG_NOT_FOUND }),
  /** Merges `id` into `intoId`: items and purchases that had it have the kept tag. `id` is then gone. */
  merge: procedure
    .input(MERGE_INPUT)
    .output(z.object({ tag: Tag }))
    .errors({ TAG_NOT_FOUND, SAME }),
};

export { CATEGORY_NOT_FOUND as CATEGORY_NOT_FOUND_ERROR, TAG_NOT_FOUND as TAG_NOT_FOUND_ERROR };
