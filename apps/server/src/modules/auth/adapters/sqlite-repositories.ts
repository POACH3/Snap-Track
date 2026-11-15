import type { Clock, Id } from "@snaptrack/core";
import { eq, inArray, lte } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { Session, User } from "../domain/user.ts";
import type { SessionRepository, UserRepository } from "../ports.ts";
import { sessions, users } from "./schema.ts";

type Db = BetterSQLite3Database;

function toUser(row: typeof users.$inferSelect | undefined): User | undefined {
  return (
    row && {
      id: row.id,
      username: row.username,
      displayName: row.displayName,
      passwordHash: row.passwordHash,
    }
  );
}

export class SqliteUserRepository implements UserRepository {
  readonly #db: Db;
  readonly #clock: Clock;

  constructor(db: Db, clock: Clock) {
    this.#db = db;
    this.#clock = clock;
  }

  findById(id: Id): User | undefined {
    return toUser(this.#db.select().from(users).where(eq(users.id, id)).get());
  }

  findByUsername(username: string): User | undefined {
    return toUser(this.#db.select().from(users).where(eq(users.username, username)).get());
  }

  insert(user: User): boolean {
    const now = this.#clock.now().toISOString();
    const result = this.#db
      .insert(users)
      .values({ ...user, createdAt: now, updatedAt: now })
      .onConflictDoNothing({ target: users.username })
      .run();
    return result.changes === 1;
  }

  updatePasswordHash(id: Id, passwordHash: string): void {
    this.#db
      .update(users)
      .set({ passwordHash, updatedAt: this.#clock.now().toISOString() })
      .where(eq(users.id, id))
      .run();
  }

  displayNames(ids: readonly Id[]): Map<Id, string> {
    if (ids.length === 0) return new Map();
    const rows = this.#db
      .select({ id: users.id, displayName: users.displayName })
      .from(users)
      .where(inArray(users.id, [...new Set(ids)]))
      .all();
    return new Map(rows.map((row) => [row.id, row.displayName]));
  }
}

export class SqliteSessionRepository implements SessionRepository {
  readonly #db: Db;
  readonly #clock: Clock;

  constructor(db: Db, clock: Clock) {
    this.#db = db;
    this.#clock = clock;
  }

  insert(session: Session): void {
    const now = this.#clock.now().toISOString();
    this.#db
      .insert(sessions)
      .values({ ...session, expiresAt: session.expiresAt.toISOString(), createdAt: now, updatedAt: now })
      .run();
  }

  findById(id: string): Session | undefined {
    const row = this.#db.select().from(sessions).where(eq(sessions.id, id)).get();
    return row && { id: row.id, userId: row.userId, expiresAt: new Date(row.expiresAt) };
  }

  updateExpiry(id: string, expiresAt: Date): void {
    this.#db
      .update(sessions)
      .set({ expiresAt: expiresAt.toISOString(), updatedAt: this.#clock.now().toISOString() })
      .where(eq(sessions.id, id))
      .run();
  }

  delete(id: string): void {
    this.#db.delete(sessions).where(eq(sessions.id, id)).run();
  }

  deleteAllForUser(userId: Id): void {
    this.#db.delete(sessions).where(eq(sessions.userId, userId)).run();
  }

  deleteExpired(now: Date): void {
    // ISO 8601 UTC strings sort in time order, so a string comparison is a time comparison.
    this.#db.delete(sessions).where(lte(sessions.expiresAt, now.toISOString())).run();
  }
}
