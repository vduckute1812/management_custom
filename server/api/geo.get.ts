/**
 * Public endpoint reporting the visitor's country for locale auto-detection.
 *
 * In production the app sits behind a Cloudflare Tunnel, which stamps every
 * request with `CF-IPCountry` (ISO 3166-1 alpha-2). On direct LAN access the
 * header is absent and we return null — the client then falls back to
 * timezone / browser-language detection.
 */
export default defineEventHandler((event) => {
  const raw = getRequestHeader(event, "cf-ipcountry")?.trim().toUpperCase();
  // Cloudflare uses XX for unknown and T1 for Tor exit nodes.
  const country =
    raw && /^[A-Z]{2}$/.test(raw) && raw !== "XX" && raw !== "T1" ? raw : null;
  return { country };
});
