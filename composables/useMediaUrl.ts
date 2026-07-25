/**
 * Append the current access token for media URLs loaded via <img>/<a>
 * (browsers cannot send Authorization on those requests).
 */
export function useMediaUrl() {
  const auth = useAuth();

  function mediaUrl(path: string | null | undefined): string {
    if (!path) return "";
    const token = auth.accessToken.value;
    if (!token) return path;
    const join = path.includes("?") ? "&" : "?";
    return `${path}${join}access_token=${encodeURIComponent(token)}`;
  }

  return { mediaUrl };
}
