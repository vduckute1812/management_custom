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
 * The account deletion service cascades the user's rows, sweeps the R2
 * objects behind their uploads are swept, and comment counters on other
 * people's posts are recounted. There is no recycle bin and no grace period —
 * the privacy policy promises exactly that.
 */
import { getUserById } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  assertSameOriginForCookieAuth,
  clearAuthCookies,
} from "~/server/utils/refreshCookie";
import { parseBody, mapDomainError } from "~/server/utils/http";
import { deleteAccountBodySchema } from "~/server/schemas";
import { assertAccountRateLimit } from "~/server/rate-limit";
import { deleteOwnAccount } from "~/server/services/authService";

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

  try {
    await deleteOwnAccount(user, body);
  } catch (err) {
    mapDomainError(err);
  }

  clearAuthCookies(event);
  return { ok: true };
});
