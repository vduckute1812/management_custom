/**
 * PATCH /api/auth/preferences
 *
 * Body: { locale?, moneyCurrency? } (at least one required)
 * Reply: { user: AuthUser }
 *
 * Persists account language (emails + AuthUser.locale) and Money currency.
 * Changing locale does not rewrite moneyCurrency.
 */
import { toAuthUser, updateUserPreferences } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";
import { parseBody, mapDomainError } from "~/server/utils/http";
import { preferencesPatchBodySchema } from "~/server/schemas";

export default defineEventHandler(async (event) => {
  const claims = requireUser(event);
  try {
    const data = await parseBody(event, preferencesPatchBodySchema);
    const user = await updateUserPreferences(claims.sub, data);
    return { user: toAuthUser(user) };
  } catch (err) {
    mapDomainError(err);
  }
});
