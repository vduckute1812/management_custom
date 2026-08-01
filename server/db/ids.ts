import { randomBytes } from "node:crypto";

export type IdPrefix =
  | "task"
  | "epic"
  | "block"
  | "chk"
  | "user"
  | "rtok"
  | "vrfy"
  | "prst"
  | "post"
  | "cmt"
  | "upl"
  | "att"
  | "story"
  | "cat"
  | "tgrp"
  | "chat"
  | "msg"
  | "job"
  | "oid";

/**
 * 96 bits from the CSPRNG. `Math.random()` gave 32 bits from a predictable
 * generator, which put a 50% collision chance at roughly 77k rows per prefix —
 * reachable for `msg_` / `cmt_` — and most insert paths surface a collision as
 * an unexplained 500 rather than retrying.
 *
 * Hex rather than base64url on purpose: every id column is
 * `utf8mb4_unicode_ci`, a case-insensitive collation, so a mixed-case alphabet
 * would compare `aB` equal to `Ab` — silently halving the alphabet and
 * inviting spurious duplicate-key errors.
 *
 * Ids stay well inside the existing VARCHAR(64) columns, so no migration is
 * needed and shorter legacy ids remain valid.
 */
export function generateId(prefix: IdPrefix = "task"): string {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

export function nowISO(): string {
  return new Date().toISOString();
}
