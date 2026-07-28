/**
 * Prefer cookie-authenticated `/api/uploads/...` URLs (HttpOnly `mgmt_at`).
 * Falls back to appending `?access_token=` only when a Bearer token exists
 * but cookies may not apply (kept for transitional HTML / SSR edge cases).
 */
export function useMediaUrl() {
  const auth = useAuth();

  function mediaUrl(path: string | null | undefined): string {
    if (!path) return "";
    // Same-origin uploads pick up the HttpOnly access cookie automatically.
    if (path.startsWith("/api/uploads/")) return path;
    const token = auth.accessToken.value;
    if (!token) return path;
    const join = path.includes("?") ? "&" : "?";
    return `${path}${join}access_token=${encodeURIComponent(token)}`;
  }

  return { mediaUrl };
}
