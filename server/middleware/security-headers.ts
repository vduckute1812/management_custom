/**
 * Baseline security headers for HTML + API responses.
 * CSP is intentionally strict-but-compatible with Nuxt/Vite inline theme boot
 * and KaTeX/CDN-free self-hosted assets. Tighten further as the surface grows.
 */
import { CONTENT_SECURITY_POLICY } from "../utils/content-security-policy";

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
});
