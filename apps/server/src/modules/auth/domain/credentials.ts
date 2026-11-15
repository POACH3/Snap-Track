import { err, ok, type Result } from "@snaptrack/core";

const USERNAME = /^[a-z0-9._-]{2,32}$/;
export const MIN_PASSWORD_LENGTH = 10;

/** Usernames are compared lowercase, so "Sam" and "sam" are one person. */
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export type UsernameError = "invalid-username";

export function validateUsername(raw: string): Result<string, UsernameError> {
  const username = normalizeUsername(raw);
  return USERNAME.test(username) ? ok(username) : err("invalid-username");
}

export type PasswordError = "password-too-short";

const characters = new Intl.Segmenter();

/** Length is the only rule (NIST 800-63B): no required character classes. Counts characters as people see them. */
export function validateNewPassword(password: string): Result<string, PasswordError> {
  const length = Array.from(characters.segment(password)).length;
  return length >= MIN_PASSWORD_LENGTH ? ok(password) : err("password-too-short");
}
