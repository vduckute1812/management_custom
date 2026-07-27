/**
 * Shared post-body length limits for the Feed composer and API.
 *
 * Short posts stay social-sized; long-form mode is sized for essays,
 * research notes, and thesis-style writing (stored as MEDIUMTEXT).
 */
export const POST_BODY_MAX_SHORT = 5_000;
export const POST_BODY_MAX_LONG = 100_000;

/** Absolute ceiling enforced by the API (matches long-form mode). */
export const POST_BODY_MAX = POST_BODY_MAX_LONG;

export type PostWriteMode = "short" | "long";

export function postBodyMaxForMode(mode: PostWriteMode): number {
  return mode === "long" ? POST_BODY_MAX_LONG : POST_BODY_MAX_SHORT;
}
