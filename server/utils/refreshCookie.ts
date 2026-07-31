/**
 * HttpOnly cookie helpers for the refresh (and optional access) tokens.
 *
 * Refresh stays off localStorage so XSS cannot exfiltrate the 30-day secret.
 * Access is also mirrored as an HttpOnly cookie so same-origin <img>/<video>
 * requests to `/api/uploads/*` authenticate without `?access_token=` in the URL.
 */
import type { H3Event } from "h3";
import { TOKEN_TTL } from "./auth";

export const REFRESH_COOKIE = "mgmt_rt";
export const ACCESS_COOKIE = "mgmt_at";

function cookieSecure(): boolean {
  // Prefer explicit env; otherwise Secure cookies whenever we are not in plain
  // local HTTP (NODE_ENV=production or APP_BASE_URL is https).
  const forced = process.env.COOKIE_SECURE;
  if (forced === "0" || forced === "false") return false;
  if (forced === "1" || forced === "true") return true;
  const base = process.env.APP_BASE_URL ?? "";
  if (base.startsWith("https://")) return true;
  return process.env.NODE_ENV === "production";
}

function commonCookieOpts(maxAge: number) {
  return {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export function setRefreshCookie(event: H3Event, token: string): void {
  setCookie(event, REFRESH_COOKIE, token, {
    ...commonCookieOpts(TOKEN_TTL.refreshSeconds),
  });
}

export function clearRefreshCookie(event: H3Event): void {
  deleteCookie(event, REFRESH_COOKIE, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    path: "/",
  });
}

export function setAccessCookie(event: H3Event, token: string): void {
  setCookie(event, ACCESS_COOKIE, token, {
    ...commonCookieOpts(TOKEN_TTL.accessSeconds),
  });
}

export function clearAccessCookie(event: H3Event): void {
  deleteCookie(event, ACCESS_COOKIE, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    path: "/",
  });
}

export function clearAuthCookies(event: H3Event): void {
  clearRefreshCookie(event);
  clearAccessCookie(event);
}

/** Prefer cookie; fall back to body/legacy localStorage clients. */
export function readPresentedRefreshToken(
  event: H3Event,
  bodyToken?: string | null,
): string {
  const fromCookie = getCookie(event, REFRESH_COOKIE);
  if (fromCookie && fromCookie.trim()) return fromCookie.trim();
  if (typeof bodyToken === "string" && bodyToken.trim())
    return bodyToken.trim();
  return "";
}

/**
 * Soft CSRF guard for cookie-authenticated auth mutations.
 * Same-origin SPA POSTs always send Origin (or Referer). Cross-site form
 * posts typically do not match our host — reject those when a cookie is used.
 */
export function assertSameOriginForCookieAuth(
  event: H3Event,
  usedCookie: boolean,
): void {
  if (!usedCookie) return;
  const host = getRequestHeader(event, "host");
  if (!host) return;
  const origin = getRequestHeader(event, "origin");
  const referer = getRequestHeader(event, "referer");
  const allowed = (value: string | undefined): boolean => {
    if (!value) return false;
    try {
      const u = new URL(value);
      return u.host === host;
    } catch {
      return false;
    }
  };
  if (allowed(origin) || allowed(referer)) return;
  // Dev tools / curl without Origin — allow when neither header is present
  // and the request is not obviously cross-site.
  if (!origin && !referer) return;
  throw createError({
    statusCode: 403,
    statusMessage: "Cross-origin auth cookie use blocked",
  });
}
