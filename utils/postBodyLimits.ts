/**
 * Post body length ceilings.
 *
 * Updates stay social-sized. Manuscripts are sized for essays, research
 * notes, and thesis chapters (stored as MEDIUMTEXT).
 */
export const POST_BODY_MAX_UPDATE = 5_000;
export const POST_BODY_MAX_MANUSCRIPT = 100_000;

/** Absolute API ceiling (manuscripts). */
export const POST_BODY_MAX = POST_BODY_MAX_MANUSCRIPT;

export const POST_TITLE_MAX = 160;

/** @deprecated Use POST_BODY_MAX_UPDATE / POST_BODY_MAX_MANUSCRIPT. */
export const POST_BODY_MAX_SHORT = POST_BODY_MAX_UPDATE;
/** @deprecated Use POST_BODY_MAX_MANUSCRIPT. */
export const POST_BODY_MAX_LONG = POST_BODY_MAX_MANUSCRIPT;

export type PostWriteMode = "short" | "long";

export function postBodyMaxForFormat(
  format: "update" | "manuscript",
): number {
  return format === "manuscript"
    ? POST_BODY_MAX_MANUSCRIPT
    : POST_BODY_MAX_UPDATE;
}

/** @deprecated Prefer postBodyMaxForFormat. */
export function postBodyMaxForMode(mode: PostWriteMode): number {
  return mode === "long" ? POST_BODY_MAX_MANUSCRIPT : POST_BODY_MAX_UPDATE;
}
