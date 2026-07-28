/**
 * Baseline security headers for HTML + API responses.
 * CSP is intentionally strict-but-compatible with Nuxt/Vite inline theme boot
 * and KaTeX/CDN-free self-hosted assets. Tighten further as the surface grows.
 */
export default defineEventHandler((event) => {
  setHeader(event, "X-Content-Type-Options", "nosniff");
  setHeader(event, "Referrer-Policy", "strict-origin-when-cross-origin");
  setHeader(event, "X-Frame-Options", "SAMEORIGIN");
  setHeader(
    event,
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  // Allow self scripts/styles; unsafe-inline covers the pre-hydration theme
  // boot in nuxt.config and a few Vue inline handlers. No remote script hosts.
  setHeader(
    event,
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: https:",
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline'",
      "connect-src 'self' https:",
    ].join("; "),
  );
});
