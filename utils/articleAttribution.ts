import { isSafeHttpUrl } from "~/utils/articleUrl";

/** Trailing source / attribution footer we manage (strip before re-appending). */
const SOURCE_BLOCK_RE =
  /\n+---\s*\n+(?:\*\*|__|\*)?(?:Source|Nguồn|Adapted from)\b[\s\S]*$/i;

/**
 * Ensure the manuscript ends with a clear source link footer.
 * Idempotent: replaces any prior Source / Nguồn / Adapted-from block.
 */
export function ensureSourceAttribution(
  body: string,
  sourceName: string,
  originalUrl: string | null | undefined,
): string {
  const trimmed = (body || "").trimEnd();
  const withoutOld = trimmed.replace(SOURCE_BLOCK_RE, "").trimEnd();
  const name = (sourceName || "").trim() || "Source";
  const url =
    originalUrl && isSafeHttpUrl(originalUrl) ? originalUrl.trim() : null;
  const line = url ? `**Source:** [${name}](${url})` : `**Source:** ${name}`;
  if (!withoutOld) return `---\n\n${line}\n`;
  return `${withoutOld}\n\n---\n\n${line}\n`;
}
