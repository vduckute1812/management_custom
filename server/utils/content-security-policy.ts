/**
 * Content-Security-Policy value shared by security-headers middleware and tests.
 *
 * Remote allowlist stays narrow:
 * - Cloudflare Web Analytics beacon
 * - Google Fonts CSS + files used by the manuscript feed chrome
 * - Google OAuth endpoints used by the login redirect flow
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "object-src 'none'",
  // Remote https images remain allowed for user Markdown embeds; scripts cannot.
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  // unsafe-inline covers the pre-hydration theme boot in nuxt.config.
  // Cloudflare Insights is injected by the edge; allow its beacon script only.
  "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
  "connect-src 'self' https://static.cloudflareinsights.com https://accounts.google.com https://oauth2.googleapis.com",
].join("; ");
