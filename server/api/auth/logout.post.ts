/**
 * POST /api/auth/logout
 *
 * Body:  { refreshToken?, everywhere? }
 * Reply: { ok: true }
 *
 * Revokes the refresh token from the HttpOnly cookie (preferred) or body,
 * clears auth cookies, and optionally revokes every active refresh token for
 * the authenticated user (`everywhere: true`).
 */
import { hashOpaqueToken } from "~/server/utils/auth";
import {
  revokeAllRefreshTokensForUser,
  revokeRefreshToken,
} from "~/server/utils/db";
import { getOptionalUser } from "~/server/utils/authContext";
import {
  REFRESH_COOKIE,
  assertSameOriginForCookieAuth,
  clearAuthCookies,
  readPresentedRefreshToken,
} from "~/server/utils/refreshCookie";
import { parseBody, mapDomainError } from "~/server/utils/http";
import { logoutBodySchema } from "~/server/schemas";

export default defineEventHandler(async (event) => {
  try {
    const body = await parseBody(event, logoutBodySchema);
    const usedCookie = Boolean(getCookie(event, REFRESH_COOKIE)?.trim());
    assertSameOriginForCookieAuth(event, usedCookie);

    const presented = readPresentedRefreshToken(event, body?.refreshToken);
    const everywhere = body?.everywhere === true;
    const user = getOptionalUser(event);

    if (presented) {
      await revokeRefreshToken(hashOpaqueToken(presented));
    }
    if (everywhere && user) {
      await revokeAllRefreshTokensForUser(user.sub);
    }

    clearAuthCookies(event);
    return { ok: true };
  } catch (err) {
    mapDomainError(err);
  }
});
