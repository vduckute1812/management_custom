/**
 * POST /api/auth/logout
 *
 * Body:  { refreshToken? }
 * Reply: { ok: true }
 *
 * Revokes the supplied refresh token (if any). The short-lived access token
 * is left to expire on its own — by the time anyone could intercept it the
 * 15-minute window is gone, and the user is locked out of issuing new ones
 * because their refresh token is dead.
 *
 * If the caller is authenticated (has a valid bearer access token) AND no
 * refresh token is supplied we revoke EVERY active refresh token for the
 * user — useful for "log out everywhere" semantics from the client.
 */
import {
  hashOpaqueToken,
} from "~/server/utils/auth";
import {
  revokeAllRefreshTokensForUser,
  revokeRefreshToken,
} from "~/server/utils/db";
import { getOptionalUser } from "~/server/utils/authContext";

interface LogoutBody {
  refreshToken?: string;
  everywhere?: boolean;
}

export default defineEventHandler(async (event) => {
  const body = await readBody<LogoutBody>(event).catch(() => ({} as LogoutBody));
  const presented = body?.refreshToken ?? "";
  const everywhere = body?.everywhere === true;
  const user = getOptionalUser(event);

  if (presented) {
    await revokeRefreshToken(hashOpaqueToken(presented));
  }
  if (everywhere && user) {
    await revokeAllRefreshTokensForUser(user.sub);
  }

  return { ok: true };
});
