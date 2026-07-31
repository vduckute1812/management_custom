/**
 * Same-origin `/api/uploads/...` URLs authenticate via the HttpOnly `mgmt_at`
 * cookie. Do not append `?access_token=` — tokens in URLs land in access logs,
 * browser history, and Referer headers, and the server only accepts that
 * query param on media GETs as a temporary bridge for cached HTML.
 */
export function useMediaUrl() {
  function mediaUrl(path: string | null | undefined): string {
    if (!path) return "";
    return path;
  }

  return { mediaUrl };
}
