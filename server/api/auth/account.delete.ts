/**
 * DELETE /api/auth/account — the signed-in user erases their own account.
 *
 * Reply: { ok: true }
 * Body:  { email, password? }
 *
 * `email` is a typed confirmation of the account's own address; `password` is
 * required for accounts that have one. Google-only accounts have no hash to
 * check, so the typed address is the whole gate for them — a stolen session can
 * therefore delete such an account, the same exposure it already has to delete
 * every post by hand. Closing it properly needs a Google re-consent round trip.
 *
 * Everything else is `deleteUser`: MySQL cascades the user's rows, the R2
 * objects behind their uploads are swept, and comment counters on other
 * people's posts are recounted. There is no recycle bin and no grace period —
 * the privacy policy promises exactly that.
 */
import { UserRole, deleteUser, getUserById } from "~/server/utils/db";
import { emailConfirmationMatches, verifyPassword } from "~/server/utils/auth";
import { requireUser } from "~/server/utils/authContext";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  assertSameOriginForCookieAuth,
  clearAuthCookies,
} from "~/server/utils/refreshCookie";
import { parseBody } from "~/server/utils/http";
import { deleteAccountBodySchema } from "~/server/schemas";
import { assertAccountRateLimit } from "~/server/rate-limit";

export default defineEventHandler(async (event) => {
  const usedCookie = Boolean(
    getCookie(event, REFRESH_COOKIE)?.trim() ||
    getCookie(event, ACCESS_COOKIE)?.trim(),
  );
  assertSameOriginForCookieAuth(event, usedCookie);

  const claims = requireUser(event);
  const body = await parseBody(event, deleteAccountBodySchema);

  const user = await getUserById(claims.sub);
  if (!user) {
    throw createError({ statusCode: 404, statusMessage: "User not found" });
  }

  // Budget the account, not the request body, so wrong guesses still count.
  await assertAccountRateLimit(event, user.email, "/api/auth/account");

  if (user.role === UserRole.Superadmin) {
    throw createError({
      statusCode: 400,
      statusMessage:
        "The superadmin account cannot be deleted — the install would lose its operator.",
    });
  }

  if (!emailConfirmationMatches(body.email, user.email)) {
    throw createError({
      statusCode: 400,
      statusMessage: "The email you typed does not match this account.",
    });
  }

  if (user.passwordHash) {
    if (!body.password) {
      throw createError({
        statusCode: 400,
        statusMessage: "Your password is required to delete this account.",
      });
    }
    const ok = await verifyPassword(body.password, user.passwordHash);
    if (!ok) {
      throw createError({ statusCode: 401, statusMessage: "Wrong password" });
    }
  }

  const removed = await deleteUser(user.id);
  if (!removed) {
    throw createError({ statusCode: 404, statusMessage: "User not found" });
  }

  clearAuthCookies(event);
  return { ok: true };
});
