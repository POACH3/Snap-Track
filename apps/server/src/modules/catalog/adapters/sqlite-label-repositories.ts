import type { Clock, Id } from "@snaptrack/core";
import { and, eq, inArray, isNull, max, ne, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { Entry } from "../domain/hierarchy.ts";
import type { CategoryRepository, TagRepository } from "../ports.ts";
import { categories, items, itemTags, stores, tags } from "./schema.ts";
import { isUniqueViolation } from "./sqlite-catalog-repositories.ts";

type Db = BetterSQLite3Database;

const entry = {
  id: categories.id,
  name: categories.name,
  level: categories.level,
  parentId: categories.parentId,
  sortOrder: categories.sortOrder,
  archived: categories.archived,
};

const sameName = (name: string) => sql`${categories.name} = ${name} collate nocase`;
const underParent = (parentId: Id | null) =>
  parentId === null ? isNull(categories.parentId) : eq(categories.parentId, parentId);

export class SqliteCategoryRepository implements CategoryRepository {
  readonly #db: Db;
  readonly #clock: Clock;

  constructor(db: Db, clock: Clock) {
    this.#db = db;
    this.#clock = clock;
  }

  all(): Entry[] {
    return this.#db.select(entry).from(categories).all();
  }

  findById(id: Id): Entry | undefined {
    return this.#db.select(entry).from(categories).where(eq(categories.id, id)).get();
  }

  insert(value: Omit<Entry, "archived">): boolean {
    const now = this.#clock.now().toISOString();
    try {
      this.#db
        .insert(categories)
        .values({ ...value, archived: false, createdAt: now, updatedAt: now })
        .run();
      return true;
    } catch (error) {
      if (isUniqueViolation(error)) return false;
      throw error;
    }
  }

  #taken(name: string, parentId: Id | null, exceptId: Id): boolean {
    return (
      this.#db
        .select({ id: categories.id })
        .from(categories)
        .where(and(sameName(name), underParent(parentId), ne(categories.id, exceptId)))
        .get() !== undefined
    );
  }

  rename(id: Id, name: string): boolean {
    const current = this.findById(id);
    if (current === undefined || this.#taken(name, current.parentId, id)) return false;
    this.#db
      .update(categories)
      .set({ name, updatedAt: this.#clock.now().toISOString() })
      .where(eq(categories.id, id))
      .run();
    return true;
  }

  move(id: Id, parentId: Id): boolean {
    const current = this.findById(id);
    if (current === undefined || this.#taken(current.name, parentId, id)) return false;
    this.#db
      .update(categories)
      .set({ parentId, sortOrder: this.nextSortOrder(parentId), updatedAt: this.#clock.now().toISOString() })
      .where(eq(categories.id, id))
      .run();
    return true;
  }

  setArchived(ids: readonly Id[], archived: boolean): void {
    if (ids.length === 0) return;
    this.#db
      .update(categories)
      .set({ archived, updatedAt: this.#clock.now().toISOString() })
      .where(inArray(categories.id, [...ids]))
      .run();
  }

  delete(id: Id): void {
    this.#db.delete(categories).where(eq(categories.id, id)).run();
  }

  nextSortOrder(parentId: Id | null): number {
    const found = this.#db
      .select({ top: max(categories.sortOrder) })
      .from(categories)
      .where(underParent(parentId))
      .get();
    return (found?.top ?? -1) + 1;
  }

  isReferenced(id: Id): boolean {
    const item = this.#db.select({ id: items.id }).from(items).where(eq(items.categoryId, id)).get();
    if (item !== undefined) return true;
    return (
      this.#db.select({ id: stores.id }).from(stores).where(eq(stores.defaultCategoryId, id)).get() !==
      undefined
    );
  }
}

const tag = { id: tags.id, name: tags.name, archived: tags.archived };

export class SqliteTagRepository implements TagRepository {
  readonly #db: Db;
  readonly #clock: Clock;

  constructor(db: Db, clock: Clock) {
    this.#db = db;
    this.#clock = clock;
  }

  all() {
    return this.#db
      .select(tag)
      .from(tags)
      .orderBy(sql`${tags.name} collate nocase`)
      .all();
  }

  findById(id: Id) {
    return this.#db.select(tag).from(tags).where(eq(tags.id, id)).get();
  }

  insert(value: { id: Id; name: string }): boolean {
    const now = this.#clock.now().toISOString();
    try {
      this.#db
        .insert(tags)
        .values({ ...value, archived: false, createdAt: now, updatedAt: now })
        .run();
      return true;
    } catch (error) {
      if (isUniqueViolation(error)) return false;
      throw error;
    }
  }

  rename(id: Id, name: string): boolean {
    const taken = this.#db
      .select({ id: tags.id })
      .from(tags)
      .where(and(sql`${tags.name} = ${name} collate nocase`, ne(tags.id, id)))
      .get();
    if (taken !== undefined) return false;
    this.#db
      .update(tags)
      .set({ name, updatedAt: this.#clock.now().toISOString() })
      .where(eq(tags.id, id))
      .run();
    return true;
  }

  setArchived(id: Id, archived: boolean): void {
    this.#db
      .update(tags)
      .set({ archived, updatedAt: this.#clock.now().toISOString() })
      .where(eq(tags.id, id))
      .run();
  }

  delete(id: Id): void {
    this.#db.delete(tags).where(eq(tags.id, id)).run();
  }

  isReferenced(id: Id): boolean {
    return (
      this.#db.select({ id: itemTags.itemId }).from(itemTags).where(eq(itemTags.tagId, id)).get() !==
      undefined
    );
  }

  itemsByTag(): Map<Id, Id[]> {
    const rows = this.#db.select({ itemId: itemTags.itemId, tagId: itemTags.tagId }).from(itemTags).all();
    const byTag = new Map<Id, Id[]>();
    for (const { itemId, tagId } of rows) byTag.set(tagId, [...(byTag.get(tagId) ?? []), itemId]);
    return byTag;
  }
}
