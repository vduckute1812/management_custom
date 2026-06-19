/**
 * POST /api/auth/refresh
 *
 * Body:  { refreshToken }
 * Reply: { accessToken, accessExpiresAt, refreshToken, refreshExpiresAt }
 *
 * Rotates the refresh token: the presented one is revoked and a fresh pair
 * is issued. This means a stolen refresh token has a one-shot window — once
 * the legitimate client refreshes, the attacker's token is dead.
 */
import {
  findActiveRefreshToken,
  getUserById,
  issueRefreshToken,
  revokeRefreshToken,
  toAuthUser,
} from "~/server/utils/db";
import {
  generateOpaqueToken,
  hashOpaqueToken,
  nowPlusSeconds,
  signAccessToken,
  TOKEN_TTL,
} from "~/server/utils/auth";

interface RefreshBody {
  refreshToken?: string;
}

export default defineEventHandler(async (event) => {
  const body = await readBody<RefreshBody>(event);
  const presented = body?.refreshToken ?? "";
  if (!presented) {
    throw createError({
      statusCode: 400,
      statusMessage: "refreshToken is required",
    });
  }

  const presentedHash = hashOpaqueToken(presented);
  const record = await findActiveRefreshToken(presentedHash);
  if (!record) {
    throw createError({
      statusCode: 401,
      statusMessage: "Refresh token invalid or expired",
    });
  }

  const user = await getUserById(record.userId);
  if (!user) {
    // User was deleted out from under us; clean up the token defensively.
    await revokeRefreshToken(presentedHash);
    throw createError({ statusCode: 401, statusMessage: "Account no longer exists" });
  }

  // Rotate.
  await revokeRefreshToken(presentedHash);
  const newRefresh = generateOpaqueToken();
  const refreshExpiresAt = nowPlusSeconds(TOKEN_TTL.refreshSeconds);
  await issueRefreshToken({
    userId: user.id,
    tokenHash: hashOpaqueToken(newRefresh),
    expiresAt: refreshExpiresAt,
    userAgent: getRequestHeader(event, "user-agent") ?? undefined,
    ip: getRequestIP(event, { xForwardedFor: true }) ?? undefined,
  });

  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
  });
  const accessExpiresAt = nowPlusSeconds(TOKEN_TTL.accessSeconds);

  return {
    user: toAuthUser(user),
    accessToken,
    accessExpiresAt,
    refreshToken: newRefresh,
    refreshExpiresAt,
  };
});
