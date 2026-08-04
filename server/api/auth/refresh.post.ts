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
import {
  findActiveRefreshToken,
  findRefreshTokenByHash,
  getUserById,
  revokeRefreshTokenFamily,
  rotateRefreshToken,
  toAuthUser,
} from "~/server/utils/db";
import {
  generateOpaqueToken,
  hashOpaqueToken,
  nowPlusSeconds,
  signAccessToken,
  TOKEN_TTL,
} from "~/server/utils/auth";
import {
  REFRESH_COOKIE,
  assertSameOriginForCookieAuth,
  clearAuthCookies,
  readPresentedRefreshToken,
  setAccessCookie,
  setRefreshCookie,
} from "~/server/utils/refreshCookie";
import { parseBody } from "~/server/utils/http";
import { refreshBodySchema } from "~/server/schemas";

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

  const presentedHash = hashOpaqueToken(presented);
  const record = await findActiveRefreshToken(presentedHash);
  if (!record) {
    // Reuse of a rotated/revoked refresh → kill the whole family so a stolen
    // token cannot keep minting sessions after the victim refreshed.
    const prior = await findRefreshTokenByHash(presentedHash);
    if (prior?.revokedAt) {
      await revokeRefreshTokenFamily(prior.familyId);
    }
    clearAuthCookies(event);
    throw createError({
      statusCode: 401,
      statusMessage: "Refresh token invalid or expired",
    });
  }

  const user = await getUserById(record.userId);
  if (!user) {
    clearAuthCookies(event);
    throw createError({
      statusCode: 401,
      statusMessage: "Account no longer exists",
    });
  }

  const newRefresh = generateOpaqueToken();
  const refreshExpiresAt = nowPlusSeconds(TOKEN_TTL.refreshSeconds);
  const rotated = await rotateRefreshToken({
    presentedHash,
    familyId: record.familyId,
    next: {
      userId: user.id,
      tokenHash: hashOpaqueToken(newRefresh),
      expiresAt: refreshExpiresAt,
      userAgent: getRequestHeader(event, "user-agent") ?? undefined,
      ip: getRequestIP(event, { xForwardedFor: true }) ?? undefined,
    },
  });
  if (!rotated) {
    // Concurrent refresh lost the race — the winner already holds the live
    // successor. Do not revoke the family here (that would kill the winner).
    clearAuthCookies(event);
    throw createError({
      statusCode: 401,
      statusMessage: "Refresh token invalid or expired",
    });
  }

  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
  });
  const accessExpiresAt = nowPlusSeconds(TOKEN_TTL.accessSeconds);

  setRefreshCookie(event, newRefresh);
  setAccessCookie(event, accessToken);

  return {
    user: toAuthUser(user),
    accessToken,
    accessExpiresAt,
    refreshExpiresAt,
  };
});
