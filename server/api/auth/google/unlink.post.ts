/**
 * POST /api/auth/google/unlink — remove Google from the current account.
 * Refuses if the account has no password (would lock the user out).
 */
import { AuthProvider } from "../../../../types/auth";
import {
  getUserById,
  unlinkIdentity,
  userHasProvider,
} from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  assertSameOriginForCookieAuth,
} from "~/server/utils/refreshCookie";

export default defineEventHandler(async (event) => {
  const usedCookie = Boolean(
    getCookie(event, REFRESH_COOKIE)?.trim() ||
    getCookie(event, ACCESS_COOKIE)?.trim(),
  );
  assertSameOriginForCookieAuth(event, usedCookie);
  const claims = requireUser(event);
  const user = await getUserById(claims.sub);
  if (!user) {
    throw createError({ statusCode: 404, statusMessage: "User not found" });
  }

  const linked = await userHasProvider(user.id, AuthProvider.Google);
  if (!linked) {
    return { ok: true, googleLinked: false };
  }

  if (!user.passwordHash) {
    throw createError({
      statusCode: 400,
      statusMessage:
        "Set a password before unlinking Google, or you will be locked out.",
    });
  }

  await unlinkIdentity(user.id, AuthProvider.Google);
  return { ok: true, googleLinked: false };
});
