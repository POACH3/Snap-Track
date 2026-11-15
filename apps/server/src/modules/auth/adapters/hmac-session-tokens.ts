import { createHmac, randomBytes } from "node:crypto";
import type { SessionTokens } from "../ports.ts";

/** 256-bit random tokens; the stored id is an HMAC of the token keyed with SESSION_SECRET. */
export class HmacSessionTokens implements SessionTokens {
  readonly #secret: string;

  constructor(secret: string) {
    this.#secret = secret;
  }

  generate(): string {
    return randomBytes(32).toString("base64url");
  }

  idFor(token: string): string {
    return createHmac("sha256", this.#secret).update(token).digest("base64url");
  }
}
