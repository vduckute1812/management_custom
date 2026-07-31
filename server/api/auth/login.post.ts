/**
 * POST /api/auth/login — Zod-validated; sets HttpOnly auth cookies.
 */
import {
  getUserByEmail,
  issueRefreshToken,
  recordUserLogin,
  toAuthUser,
} from "~/server/utils/db";
import {
  generateOpaqueToken,
  hashOpaqueToken,
  nowPlusSeconds,
  signAccessToken,
  TOKEN_TTL,
  verifyPassword,
} from "~/server/utils/auth";
import {
  setAccessCookie,
  setRefreshCookie,
} from "~/server/utils/refreshCookie";
import { parseBody } from "~/server/utils/http";
import { loginBodySchema } from "~/server/schemas";
import { assertAccountRateLimit } from "~/server/rate-limit";

const GENERIC_INVALID = "Invalid email or password";

export default defineEventHandler(async (event) => {
  const body = await parseBody(event, loginBodySchema);
  const email = body.email.trim().toLowerCase();
  const password = body.password;

  // Per-email budget on top of the per-IP middleware. Counts every attempt —
  // including wrong passwords — so rotating source IPs cannot stuff one inbox.
  await assertAccountRateLimit(event, email, "/api/auth/login");

  const user = await getUserByEmail(email);
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: GENERIC_INVALID });
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    throw createError({ statusCode: 401, statusMessage: GENERIC_INVALID });
  }

  if (!user.emailVerified) {
    throw createError({
      statusCode: 403,
      statusMessage:
        "Email not verified yet. Check your inbox for the verification link.",
    });
  }

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
});
