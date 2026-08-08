/**
 * POST /api/auth/refresh
 *
 * Cookie `mgmt_rt` (preferred) or body `{ refreshToken }` (legacy).
 * Reply: { user, accessToken, accessExpiresAt, refreshExpiresAt }
 *
 * Rotates the refresh token atomically: the presented hash is revoked and the
 * successor inserted in one transaction so concurrent refreshes cannot both
 * succeed. Presenting a revoked token revokes the entire token family
 * (reuse / theft detection).
 */
import { parseBody, mapDomainError, DomainError } from "~/server/utils/http";
import { refreshBodySchema } from "~/server/schemas";
import {
  REFRESH_COOKIE,
  assertSameOriginForCookieAuth,
  clearAuthCookies,
  readPresentedRefreshToken,
  setAccessCookie,
  setRefreshCookie,
} from "~/server/utils/refreshCookie";
import { refreshAuthSession } from "~/server/services/auth/authService";

export default defineEventHandler(async (event) => {
  const body = await parseBody(event, refreshBodySchema);
  const usedCookie = Boolean(getCookie(event, REFRESH_COOKIE)?.trim());
  assertSameOriginForCookieAuth(event, usedCookie);

  const presented = readPresentedRefreshToken(event, body?.refreshToken);
  if (!presented) {
    throw createError({
      statusCode: 400,
      statusMessage: "refreshToken is required",
    });
  }

  try {
    const result = await refreshAuthSession(event, presented);
    setRefreshCookie(event, result.refreshToken);
    setAccessCookie(event, result.accessToken);
    return {
      user: result.user,
      accessToken: result.accessToken,
      accessExpiresAt: result.accessExpiresAt,
      refreshExpiresAt: result.refreshExpiresAt,
    };
  } catch (err) {
    if (err instanceof DomainError && err.statusCode === 401) {
      clearAuthCookies(event);
    }
    mapDomainError(err);
  }
});
