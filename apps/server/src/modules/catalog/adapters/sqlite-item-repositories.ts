import type { IdentifierState, ItemRef } from "@snaptrack/contracts";
import { newId, type Clock, type Id } from "@snaptrack/core";
import { asc, count, eq, inArray, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { LineIdentifier } from "../domain/items.ts";
import type { ItemIdentifierRepository, ItemIdentifierRow, ItemRepository } from "../ports.ts";
import { itemIdentifiers, items, stores } from "./schema.ts";

type Db = BetterSQLite3Database;
const byName = sql`${items.name} collate nocase`;
const ref = { id: items.id, name: items.name, nameSource: items.nameSource };

export class SqliteItemRepository implements ItemRepository {
  readonly #db: Db;
  readonly #clock: Clock;

  constructor(db: Db, clock: Clock) {
    this.#db = db;
    this.#clock = clock;
  }

  findById(id: Id): ItemRef | undefined {
    return this.#db.select(ref).from(items).where(eq(items.id, id)).get();
  }

  findByIds(ids: readonly Id[]): ItemRef[] {
    if (ids.length === 0) return [];
    return this.#db
      .select(ref)
      .from(items)
      .where(inArray(items.id, [...new Set(ids)]))
      .all();
  }

  insert(item: ItemRef): void {
    const now = this.#clock.now().toISOString();
    this.#db
      .insert(items)
      .values({ ...item, createdAt: now, updatedAt: now })
      .run();
  }

  rename(id: Id, name: string): void {
    this.#db
      .update(items)
      .set({ name, nameSource: "user", updatedAt: this.#clock.now().toISOString() })
      .where(eq(items.id, id))
      .run();
  }

  search(query: string, limit: number): { item: ItemRef; identifierCount: number }[] {
    const pattern = `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    return this.#db
      .select({ ...ref, identifierCount: count(itemIdentifiers.id) })
      .from(items)
      .leftJoin(itemIdentifiers, eq(itemIdentifiers.itemId, items.id))
      .where(query === "" ? undefined : sql`${items.name} like ${pattern} escape '\\'`)
      .groupBy(items.id)
      .orderBy(byName)
      .limit(limit)
      .all()
      .map(({ identifierCount, ...item }) => ({ item, identifierCount }));
  }

  all(): ItemRef[] {
    return this.#db.select(ref).from(items).all();
  }
}

const row = {
  id: itemIdentifiers.id,
  itemId: itemIdentifiers.itemId,
  storeId: itemIdentifiers.storeId,
  storeName: stores.name,
  type: itemIdentifiers.type,
  value: itemIdentifiers.value,
  displayValue: itemIdentifiers.displayValue,
  state: itemIdentifiers.state,
  timesSeen: itemIdentifiers.timesSeen,
  lastSeenAt: itemIdentifiers.lastSeenAt,
};

export class SqliteItemIdentifierRepository implements ItemIdentifierRepository {
  readonly #db: Db;
  readonly #clock: Clock;

  constructor(db: Db, clock: Clock) {
    this.#db = db;
    this.#clock = clock;
  }

  #select() {
    return this.#db
      .select(row)
      .from(itemIdentifiers)
      .leftJoin(stores, eq(stores.id, itemIdentifiers.storeId));
  }

  findByValues(values: readonly string[]): ItemIdentifierRow[] {
    if (values.length === 0) return [];
    return this.#select()
      .where(inArray(itemIdentifiers.value, [...new Set(values)]))
      .all();
  }

  findById(id: Id): ItemIdentifierRow | undefined {
    return this.#select().where(eq(itemIdentifiers.id, id)).get();
  }

  listForItem(itemId: Id): ItemIdentifierRow[] {
    return this.#select()
      .where(eq(itemIdentifiers.itemId, itemId))
      .orderBy(asc(itemIdentifiers.createdAt), sql`${itemIdentifiers}.rowid`)
      .all();
  }

  insert(identifier: LineIdentifier & { itemId: Id; firstReceiptId: Id | null }): void {
    const now = this.#clock.now().toISOString();
    this.#db
      .insert(itemIdentifiers)
      .values({
        id: newId(),
        itemId: identifier.itemId,
        storeId: identifier.storeId,
        type: identifier.type,
        value: identifier.value,
        displayValue: identifier.displayValue,
        state: "active",
        firstReceiptId: identifier.firstReceiptId,
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
      .update(itemIdentifiers)
      .set({ timesSeen: sql`${itemIdentifiers.timesSeen} + 1`, lastSeenAt: now, updatedAt: now })
      .where(eq(itemIdentifiers.id, id))
      .run();
  }

  move(id: Id, itemId: Id, receiptId: Id | null): void {
    const now = this.#clock.now().toISOString();
    this.#db
      .update(itemIdentifiers)
      .set({
        itemId,
        state: "active",
        firstReceiptId: receiptId,
        timesSeen: receiptId === null ? 0 : 1,
        lastSeenAt: receiptId === null ? null : now,
        updatedAt: now,
      })
      .where(eq(itemIdentifiers.id, id))
      .run();
  }

  setState(id: Id, state: IdentifierState): void {
    this.#db
      .update(itemIdentifiers)
      .set({ state, updatedAt: this.#clock.now().toISOString() })
      .where(eq(itemIdentifiers.id, id))
      .run();
  }

  remove(id: Id): void {
    this.#db.delete(itemIdentifiers).where(eq(itemIdentifiers.id, id)).run();
  }
}
