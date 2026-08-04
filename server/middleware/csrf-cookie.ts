/**
 * Soft CSRF guard for cookie-authenticated mutating `/api/*` requests.
 *
 * Auth routes already call `assertSameOriginForCookieAuth` locally; this
 * middleware covers the rest of the API (posts, money, chat, …) so a
 * cross-site form post cannot ride the HttpOnly session cookies.
 *
 * Safe methods (GET/HEAD/OPTIONS) are skipped. Bearer-only requests without
 * auth cookies are skipped (no cookie CSRF surface).
 */
import {
  assertSameOriginForCookieAuth,
  hasAuthCookie,
} from "~/server/utils/refreshCookie";

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

export default defineEventHandler((event) => {
  const method = event.method.toUpperCase();
  if (SAFE.has(method)) return;

  const path = (event.path.split("?")[0] || "").replace(/\/+$/, "") || "/";
  if (!path.startsWith("/api/")) return;

  if (!hasAuthCookie(event)) return;

  assertSameOriginForCookieAuth(event, true);
});
