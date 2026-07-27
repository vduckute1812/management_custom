/**
 * Helpers for manuscript (long-form) presentation.
 */

/** Rough reading-time estimate. Vietnamese averages ~5 chars/word. */
export function estimateReadingMinutes(body: string, title = ""): number {
  const text = `${title}\n${body}`.trim();
  if (!text) return 1;
  const words = text.split(/\s+/).filter(Boolean).length;
  const charWords = Math.ceil(text.replace(/\s+/g, "").length / 5);
  const estimate = Math.max(words, charWords);
  return Math.max(1, Math.round(estimate / 200));
}

/** First meaningful paragraph / line for card excerpts. */
export function manuscriptExcerpt(body: string, max = 180): string {
  const cleaned = body.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max).trimEnd()}…`;
}
