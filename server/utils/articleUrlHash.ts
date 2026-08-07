import { createHash } from "node:crypto";
import { normalizeArticleUrl } from "../../utils/articleUrl";

/** Stable SHA-256 of a normalized article URL — server-only (Node crypto). */
export function hashArticleUrl(url: string): string {
  return createHash("sha256").update(normalizeArticleUrl(url)).digest("hex");
}
