/**
 * Post body length ceilings.
 *
 * Updates stay social-sized. Manuscripts are sized for essays, research
 * notes, and thesis chapters (stored as MEDIUMTEXT).
 */
import { PostFormat } from "~/types/post";

export const POST_BODY_MAX_UPDATE = 5_000;
export const POST_BODY_MAX_MANUSCRIPT = 100_000;

/** Absolute API ceiling (manuscripts). */
export const POST_BODY_MAX = POST_BODY_MAX_MANUSCRIPT;

export const POST_TITLE_MAX = 160;

export function postBodyMaxForFormat(format: PostFormat): number {
  return format === PostFormat.Manuscript
    ? POST_BODY_MAX_MANUSCRIPT
    : POST_BODY_MAX_UPDATE;
}
