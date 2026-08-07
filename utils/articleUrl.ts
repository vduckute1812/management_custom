/** True when the URL uses http: or https: only (blocks javascript:/data:/etc.). */
export function isSafeHttpUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Normalize URL for hashing (strip fragment, trailing slash, lowercase host). */
export function normalizeArticleUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return url.trim();
    }
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    u.pathname = u.pathname.replace(/\/+$/, "") || "/";
    return u.toString();
  } catch {
    return url.trim().replace(/#.*$/, "").replace(/\/+$/, "");
  }
}
