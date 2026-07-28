/**
 * POST /api/auth/login
 *
 * Body:  { email, password }
 * Reply: { user: AuthUser, accessToken, accessExpiresAt, refreshExpiresAt }
 *
 * Issues a fresh access + refresh pair. Refresh is set as an HttpOnly cookie
 * (`mgmt_rt`); access is returned in the JSON body (in-memory client use) and
 * mirrored as HttpOnly `mgmt_at` for same-origin media requests.
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

interface LoginBody {
  email?: string;
  password?: string;
}

const GENERIC_INVALID = "Invalid email or password";

export default defineEventHandler(async (event) => {
  const body = await readBody<LoginBody>(event);
  const email = (body?.email ?? "").trim().toLowerCase();
  const password = body?.password ?? "";
  if (!email || !password) {
    throw createError({ statusCode: 400, statusMessage: GENERIC_INVALID });
  }

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

  // Best-effort: a write failure here must NOT block sign-in. The admin
  // dashboard simply shows "Never" / a stale value if this UPDATE drops.
  await recordUserLogin(user.id).catch(() => {});

  return {
    user: toAuthUser(user),
    accessToken,
    accessExpiresAt,
    refreshExpiresAt,
  };
});
