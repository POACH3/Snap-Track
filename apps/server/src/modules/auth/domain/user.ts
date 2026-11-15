import type { Id } from "@snaptrack/core";

export interface User {
  id: Id;
  username: string;
  displayName: string;
  passwordHash: string;
}

export interface Session {
  /** The keyed hash of the token in the cookie; the token itself is never stored. */
  id: string;
  userId: Id;
  expiresAt: Date;
}

/** What the rest of the app may know about a signed-in user. */
export interface SignedInUser {
  id: Id;
  username: string;
  displayName: string;
}

export function toSignedInUser(user: User): SignedInUser {
  return { id: user.id, username: user.username, displayName: user.displayName };
}
