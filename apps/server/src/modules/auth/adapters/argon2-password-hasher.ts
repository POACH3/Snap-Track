import { argon2, randomBytes, timingSafeEqual } from "node:crypto";
import type { PasswordHasher } from "../ports.ts";

/** OWASP's minimum for Argon2id: 19 MiB, 2 passes, 1 lane. */
const DEFAULTS = { memory: 19456, passes: 2, parallelism: 1 };
const SALT_BYTES = 16;
const TAG_BYTES = 32;
const PHC = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

interface Params {
  memory: number;
  passes: number;
  parallelism: number;
}

function derive(password: string, salt: Buffer, params: Params, tagLength: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    argon2("argon2id", { message: password, nonce: salt, tagLength, ...params }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

const b64 = (bytes: Buffer) => bytes.toString("base64").replace(/=+$/, "");

/** Argon2id with Node's built-in implementation, stored as a standard PHC string. */
export class Argon2PasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(SALT_BYTES);
    const tag = await derive(password, salt, DEFAULTS, TAG_BYTES);
    const { memory, passes, parallelism } = DEFAULTS;
    return `$argon2id$v=19$m=${memory},t=${passes},p=${parallelism}$${b64(salt)}$${b64(tag)}`;
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    const match = PHC.exec(passwordHash);
    if (!match) return false;
    const [, memory, passes, parallelism, salt, tag] = match;
    const expected = Buffer.from(tag ?? "", "base64");
    // Uses the parameters stored with the hash, so old hashes still verify if the defaults change.
    const params = { memory: Number(memory), passes: Number(passes), parallelism: Number(parallelism) };
    const actual = await derive(password, Buffer.from(salt ?? "", "base64"), params, expected.length);
    return timingSafeEqual(actual, expected);
  }
}
