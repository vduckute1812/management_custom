/**
 * Baseline security headers for HTML + API responses.
 * CSP is intentionally strict-but-compatible with Nuxt/Vite inline theme boot
 * and KaTeX/CDN-free self-hosted assets. Tighten further as the surface grows.
 */
import type { H3Event } from "h3";
import { CONTENT_SECURITY_POLICY } from "../utils/content-security-policy";

function isHttpsRequest(event: H3Event): boolean {
  const proto = getRequestHeader(event, "x-forwarded-proto");
  if (typeof proto === "string" && proto.split(",")[0]?.trim() === "https") {
    return true;
  }
  return getRequestURL(event).protocol === "https:";
}

export default defineEventHandler((event) => {
  setHeader(event, "X-Content-Type-Options", "nosniff");
  setHeader(event, "Referrer-Policy", "strict-origin-when-cross-origin");
  setHeader(event, "X-Frame-Options", "SAMEORIGIN");
  setHeader(
    event,
    "Permissions-Policy",
    // Chat voice notes need same-origin mic; camera/geo stay off.
    "camera=(), microphone=(self), geolocation=()",
  );
  setHeader(event, "Content-Security-Policy", CONTENT_SECURITY_POLICY);
  // HSTS only on HTTPS (incl. Cloudflare Tunnel via X-Forwarded-Proto).
  // Browsers ignore HSTS on plain HTTP responses.
  if (isHttpsRequest(event)) {
    setHeader(
      event,
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }
});
