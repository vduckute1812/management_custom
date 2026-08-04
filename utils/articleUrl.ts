import { createHash } from "node:crypto";

/** Normalize URL for hashing (strip fragment, trailing slash, lowercase host). */
export function normalizeArticleUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    u.pathname = u.pathname.replace(/\/+$/, "") || "/";
    return u.toString();
  } catch {
    return url.trim().replace(/#.*$/, "").replace(/\/+$/, "");
  }
}

export function hashArticleUrl(url: string): string {
  return createHash("sha256").update(normalizeArticleUrl(url)).digest("hex");
}
