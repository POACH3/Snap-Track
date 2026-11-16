import type { IdentifierState, StoreIdentifierType, StoreRef } from "@snaptrack/contracts";
import { newId, type Clock, type Id } from "@snaptrack/core";
import { and, asc, count, eq, inArray, ne, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { normalizeName } from "../domain/identifiers.ts";
import type { KnownStore } from "../domain/suggestions.ts";
import type { StoreIdentifierRepository, StoreIdentifierRow, StoreRepository } from "../ports.ts";
import { storeIdentifiers, stores } from "./schema.ts";

type Db = BetterSQLite3Database;

const NAME_TYPES: StoreIdentifierType[] = ["name", "legal_name", "logo_text"];
const byName = sql`${stores.name} collate nocase`;

/** SQLite's error when a unique index refuses a row. */
export const isUniqueViolation = (error: unknown) =>
  error instanceof Error && "code" in error && error.code === "SQLITE_CONSTRAINT_UNIQUE";

export class SqliteStoreRepository implements StoreRepository {
  readonly #db: Db;
  readonly #clock: Clock;

  constructor(db: Db, clock: Clock) {
    this.#db = db;
    this.#clock = clock;
  }

  findById(id: Id): StoreRef | undefined {
    return this.#db.select({ id: stores.id, name: stores.name }).from(stores).where(eq(stores.id, id)).get();
  }

  findByIds(ids: readonly Id[]): StoreRef[] {
    if (ids.length === 0) return [];
    return this.#db
      .select({ id: stores.id, name: stores.name })
      .from(stores)
      .where(inArray(stores.id, [...ids]))
      .all();
  }

  findByName(name: string): StoreRef | undefined {
    return this.#db
      .select({ id: stores.id, name: stores.name })
      .from(stores)
      .where(sql`${stores.name} = ${name} collate nocase`)
      .get();
  }

  insert(store: StoreRef): boolean {
    const now = this.#clock.now().toISOString();
    try {
      this.#db
        .insert(stores)
        .values({ ...store, createdAt: now, updatedAt: now })
        .run();
      return true;
    } catch (error) {
      if (isUniqueViolation(error)) return false;
      throw error;
    }
  }

  rename(id: Id, name: string): boolean {
    const taken = this.#db
      .select({ id: stores.id })
      .from(stores)
      .where(and(sql`${stores.name} = ${name} collate nocase`, ne(stores.id, id)))
      .get();
    if (taken !== undefined) return false;
    this.#db
      .update(stores)
      .set({ name, updatedAt: this.#clock.now().toISOString() })
      .where(eq(stores.id, id))
      .run();
    return true;
  }

  search(query: string, limit: number): StoreRef[] {
    const pattern = `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    return this.#db
      .select({ id: stores.id, name: stores.name })
      .from(stores)
      .where(query === "" ? undefined : sql`${stores.name} like ${pattern} escape '\\'`)
      .orderBy(byName)
      .limit(limit)
      .all();
  }

  listWithCounts(): { store: StoreRef; identifierCount: number }[] {
    return this.#db
      .select({ id: stores.id, name: stores.name, identifierCount: count(storeIdentifiers.id) })
      .from(stores)
      .leftJoin(storeIdentifiers, eq(storeIdentifiers.storeId, stores.id))
      .groupBy(stores.id)
      .orderBy(byName)
      .all()
      .map(({ identifierCount, ...store }) => ({ store, identifierCount }));
  }

  knownStores(): KnownStore[] {
    const all = this.#db.select({ id: stores.id, name: stores.name }).from(stores).all();
    const names = this.#db
      .select({ storeId: storeIdentifiers.storeId, value: storeIdentifiers.value })
      .from(storeIdentifiers)
      .where(inArray(storeIdentifiers.type, NAME_TYPES))
      .all();
    const byStore = Map.groupBy(names, (row) => row.storeId);
    return all.map((store) => {
      const own = normalizeName(store.name);
      const saved = (byStore.get(store.id) ?? []).map((row) => row.value);
      return { ...store, names: [...new Set(own === null ? saved : [own, ...saved])] };
    });
  }

  defaultCategoryOf(id: Id): Id | null {
    return (
      this.#db.select({ categoryId: stores.defaultCategoryId }).from(stores).where(eq(stores.id, id)).get()
        ?.categoryId ?? null
    );
  }

  setDefaultCategory(id: Id, categoryId: Id | null): void {
    this.#db
      .update(stores)
      .set({ defaultCategoryId: categoryId, updatedAt: this.#clock.now().toISOString() })
      .where(eq(stores.id, id))
      .run();
  }
}

type IdentifierRecord = typeof storeIdentifiers.$inferSelect;
const toRow = (record: IdentifierRecord): StoreIdentifierRow => ({
  id: record.id,
  storeId: record.storeId,
  type: record.type,
  value: record.value,
  displayValue: record.displayValue,
  state: record.state,
  firstReceiptId: record.firstReceiptId,
  timesSeen: record.timesSeen,
  lastSeenAt: record.lastSeenAt,
});

export class SqliteStoreIdentifierRepository implements StoreIdentifierRepository {
  readonly #db: Db;
  readonly #clock: Clock;

  constructor(db: Db, clock: Clock) {
    this.#db = db;
    this.#clock = clock;
  }

  findByValues(values: readonly string[]): StoreIdentifierRow[] {
    if (values.length === 0) return [];
    return this.#db
      .select()
      .from(storeIdentifiers)
      .where(inArray(storeIdentifiers.value, [...new Set(values)]))
      .all()
      .map(toRow);
  }

  findById(id: Id): StoreIdentifierRow | undefined {
    const record = this.#db.select().from(storeIdentifiers).where(eq(storeIdentifiers.id, id)).get();
    return record && toRow(record);
  }

  listForStore(storeId: Id): StoreIdentifierRow[] {
    return this.#db
      .select()
      .from(storeIdentifiers)
      .where(eq(storeIdentifiers.storeId, storeId))
      .orderBy(asc(storeIdentifiers.createdAt), sql`rowid`)
      .all()
      .map(toRow);
  }

  insert(identifier: {
    storeId: Id;
    type: StoreIdentifierType;
    value: string;
    displayValue: string;
    firstReceiptId: Id | null;
  }): void {
    const now = this.#clock.now().toISOString();
    this.#db
      .insert(storeIdentifiers)
      .values({
        ...identifier,
        id: newId(),
        state: "active",
        timesSeen: identifier.firstReceiptId === null ? 0 : 1,
        lastSeenAt: identifier.firstReceiptId === null ? null : now,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  markSeen(id: Id): void {
    const now = this.#clock.now().toISOString();
    this.#db
      .update(storeIdentifiers)
      .set({ timesSeen: sql`${storeIdentifiers.timesSeen} + 1`, lastSeenAt: now, updatedAt: now })
      .where(eq(storeIdentifiers.id, id))
      .run();
  }

  move(id: Id, storeId: Id, receiptId: Id | null): void {
    const now = this.#clock.now().toISOString();
    this.#db
      .update(storeIdentifiers)
      .set({
        storeId,
        state: "active",
        firstReceiptId: receiptId,
        timesSeen: receiptId === null ? 0 : 1,
        lastSeenAt: receiptId === null ? null : now,
        updatedAt: now,
      })
      .where(eq(storeIdentifiers.id, id))
      .run();
  }

  setState(id: Id, state: IdentifierState): void {
    this.#db
      .update(storeIdentifiers)
      .set({ state, updatedAt: this.#clock.now().toISOString() })
      .where(eq(storeIdentifiers.id, id))
      .run();
  }

  remove(id: Id): void {
    this.#db.delete(storeIdentifiers).where(eq(storeIdentifiers.id, id)).run();
  }
}
