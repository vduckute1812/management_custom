/**
 * Per-request auth helpers.
 *
 * `attachUserFromHeader` runs in middleware and, when an `Authorization:
 * Bearer <jwt>` is present and valid, attaches the user's claims to
 * `event.context.user`. Failures (no token, bad token, expired token) leave
 * the context empty — they DON'T throw — so unauthenticated routes like
 * /api/auth/login still work.
 *
 * Route handlers that require auth call `requireUser(event)` (or
 * `requireAdmin(event)`), which translates a missing/insufficient context
 * into a `401`/`403`. This keeps the security contract local to the route
 * file rather than relying on the middleware to know which paths are
 * protected (which is fragile when route filenames change).
 */
import { createError, getCookie, getRequestHeader, type H3Event } from "h3";
import { verifyAccessToken, type AccessTokenClaims } from "./auth";
import { UserRole, isAdminRole } from "./db";
import { ACCESS_COOKIE } from "./refreshCookie";

declare module "h3" {
  interface H3EventContext {
    user?: AccessTokenClaims;
  }
}

const TOKEN_RE = /^Bearer\s+(.+)$/i;

export function attachUserFromHeader(event: H3Event): void {
  const raw = getRequestHeader(event, "authorization");
  let token: string | undefined;
  if (raw) {
    const match = TOKEN_RE.exec(raw.trim());
    if (match) token = match[1];
  }
  // HttpOnly access cookie — used by same-origin <img>/<video> media loads
  // that cannot set Authorization.
  if (!token) {
    const fromCookie = getCookie(event, ACCESS_COOKIE);
    if (fromCookie && fromCookie.trim()) token = fromCookie.trim();
  }
  // Query `?access_token=` is intentionally not accepted — tokens in URLs
  // land in access logs, browser history, and Referer headers. Media GETs
  // use the HttpOnly access cookie instead.
  if (!token) return;
  try {
    event.context.user = verifyAccessToken(token);
  } catch {
    // Swallow — middleware never blocks; protected routes assert below.
  }
}

export function getOptionalUser(event: H3Event): AccessTokenClaims | undefined {
  return event.context.user;
}

export function requireUser(event: H3Event): AccessTokenClaims {
  const user = event.context.user;
  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: "Authentication required",
    });
  }
  return user;
}

export async function requireAdmin(event: H3Event): Promise<AccessTokenClaims> {
  const user = requireUser(event);
  // Re-read role so demotions apply before the access JWT expires (~15m).
  const { getUserById } = await import("~/server/db/users");
  const row = await getUserById(user.sub);
  if (!row || !isAdminRole(row.role)) {
    throw createError({
      statusCode: 403,
      statusMessage: "Admin access required",
    });
  }
  return { ...user, role: row.role };
}

/**
 * Stricter than `requireAdmin` — only the seeded `superadmin` (the install
 * owner) passes. Use this for operations that even regular admins must not
 * perform (e.g. anything that could lock the install out, or anything that
 * could escalate privileges).
 */
export async function requireSuperAdmin(
  event: H3Event,
): Promise<AccessTokenClaims> {
  const user = requireUser(event);
  // Re-read role so demotions apply before the access JWT expires (~15m).
  const { getUserById } = await import("~/server/db/users");
  const row = await getUserById(user.sub);
  if (!row || row.role !== UserRole.Superadmin) {
    throw createError({
      statusCode: 403,
      statusMessage: "Superadmin access required",
    });
  }
  return { ...user, role: row.role };
}
