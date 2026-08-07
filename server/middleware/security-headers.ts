/**
 * Baseline security headers for HTML + API responses.
 * Document CSP nonces are applied in `server/plugins/csp-nonce.ts` during
 * render so they stay paired with SWR-cached HTML. This middleware sets a
 * strict no-inline script CSP as the default (API/JSON and any response that
 * never hits the HTML renderer).
 */
import type { H3Event } from "h3";
import { buildApiContentSecurityPolicy } from "../utils/content-security-policy";

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
  setHeader(event, "Content-Security-Policy", buildApiContentSecurityPolicy());
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
