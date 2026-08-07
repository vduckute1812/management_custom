/**
 * Content-Security-Policy builders shared by security-headers middleware,
 * the HTML nonce plugin, and tests.
 *
 * Remote allowlist stays narrow:
 * - Cloudflare Web Analytics beacon
 * - Google Fonts CSS + files used by the manuscript feed chrome
 * - Google OAuth endpoints used by the login redirect flow
 *
 * Script `unsafe-inline` is intentionally absent. HTML responses get a
 * per-request nonce (see `server/plugins/csp-nonce.ts`); API/JSON responses
 * use the no-nonce variant (no inline scripts to authorize).
 */
import type { H3Event } from "h3";

declare module "h3" {
  interface H3EventContext {
    /** Per-request CSP nonce for HTML document responses. */
    cspNonce?: string;
  }
}

const CSP_BASE = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "object-src 'none'",
  // Remote https images remain allowed for user Markdown embeds; scripts cannot.
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob:",
  "font-src 'self' data: https://fonts.gstatic.com",
  // Vue scoped styles + KaTeX still need inline style attributes.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  // Block inline event handlers (onclick=…); scripts use nonce or host allowlist.
  "script-src-attr 'none'",
  "connect-src 'self' https://static.cloudflareinsights.com https://accounts.google.com https://oauth2.googleapis.com",
] as const;

function scriptSrc(nonce?: string): string {
  // Cloudflare Insights is injected by the edge; allow its beacon host only.
  if (nonce) {
    return `script-src 'self' 'nonce-${nonce}' https://static.cloudflareinsights.com`;
  }
  return "script-src 'self' https://static.cloudflareinsights.com";
}

/** CSP for API / non-document responses (no inline scripts). */
export function buildApiContentSecurityPolicy(): string {
  return [...CSP_BASE, scriptSrc()].join("; ");
}

/** CSP for HTML documents — nonce must match stamped `<script>` tags. */
export function buildDocumentContentSecurityPolicy(nonce: string): string {
  if (!nonce || /[^A-Za-z0-9+/=_-]/.test(nonce)) {
    throw new Error("CSP nonce must be a non-empty base64url/base64 token");
  }
  return [...CSP_BASE, scriptSrc(nonce)].join("; ");
}

/**
 * @deprecated Prefer `buildApiContentSecurityPolicy` / `buildDocumentContentSecurityPolicy`.
 * Kept as the API-shaped default for callers that still import the constant.
 */
export const CONTENT_SECURITY_POLICY = buildApiContentSecurityPolicy();

export function getRequestCspNonce(event: H3Event): string | undefined {
  return event.context.cspNonce;
}
