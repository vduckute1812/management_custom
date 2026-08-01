/**
 * Shared session issuance for password login and OAuth callbacks.
 */
import type { H3Event } from "h3";
import {
  issueRefreshToken,
  recordUserLogin,
  toAuthUser,
  type UserRecord,
} from "~/server/utils/db";
import {
  generateOpaqueToken,
  hashOpaqueToken,
  nowPlusSeconds,
  signAccessToken,
  TOKEN_TTL,
} from "~/server/utils/auth";
import {
  setAccessCookie,
  setRefreshCookie,
} from "~/server/utils/refreshCookie";

export async function issueAuthSession(event: H3Event, user: UserRecord) {
  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
  });
  const accessExpiresAt = nowPlusSeconds(TOKEN_TTL.accessSeconds);

  const refreshToken = generateOpaqueToken();
  const refreshExpiresAt = nowPlusSeconds(TOKEN_TTL.refreshSeconds);
  await issueRefreshToken({
    userId: user.id,
    tokenHash: hashOpaqueToken(refreshToken),
    expiresAt: refreshExpiresAt,
    userAgent: getRequestHeader(event, "user-agent") ?? undefined,
    ip: getRequestIP(event, { xForwardedFor: true }) ?? undefined,
  });

  setRefreshCookie(event, refreshToken);
  setAccessCookie(event, accessToken);
  await recordUserLogin(user.id).catch(() => {});

  return {
    user: toAuthUser(user),
    accessToken,
    accessExpiresAt,
    refreshExpiresAt,
  };
}
