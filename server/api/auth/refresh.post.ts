/**
 * POST /api/auth/refresh
 *
 * Cookie `mgmt_rt` (preferred) or body `{ refreshToken }` (legacy).
 * Reply: { user, accessToken, accessExpiresAt, refreshExpiresAt }
 *
 * Rotates the refresh token atomically: the presented hash is revoked and the
 * successor inserted in one transaction so concurrent refreshes cannot both
 * succeed.
 */
import {
  findActiveRefreshToken,
  getUserById,
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

interface RefreshBody {
  refreshToken?: string;
}

export default defineEventHandler(async (event) => {
  const body = await readBody<RefreshBody>(event).catch(
    () => ({} as RefreshBody),
  );
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
    next: {
      userId: user.id,
      tokenHash: hashOpaqueToken(newRefresh),
      expiresAt: refreshExpiresAt,
      userAgent: getRequestHeader(event, "user-agent") ?? undefined,
      ip: getRequestIP(event, { xForwardedFor: true }) ?? undefined,
    },
  });
  if (!rotated) {
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
