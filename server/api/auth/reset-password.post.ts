/**
 * POST /api/auth/reset-password
 *
 * Body:  { token, password }
 * Reply: { ok: true }
 *
 * Consumes a one-shot password-reset token, updates the password hash, and
 * revokes all refresh sessions so the user must sign in again everywhere.
 */
import {
  consumePasswordReset,
  revokeAllRefreshTokensForUser,
  updateUserPassword,
} from "~/server/utils/db";
import { hashOpaqueToken, hashPassword } from "~/server/utils/auth";
import { parseBody } from "~/server/utils/http";
import { resetPasswordBodySchema } from "~/server/schemas";
import { passwordStrengthError } from "~/utils/passwordPolicy";

export default defineEventHandler(async (event) => {
  const body = await parseBody(event, resetPasswordBodySchema);
  const presented = body.token;
  const password = body.password;

  const strengthError = passwordStrengthError(password);
  if (strengthError) {
    throw createError({
      statusCode: 400,
      statusMessage: strengthError,
    });
  }

  const userId = await consumePasswordReset(hashOpaqueToken(presented));
  if (!userId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Reset link is invalid or expired",
    });
  }

  await updateUserPassword(userId, await hashPassword(password));
  await revokeAllRefreshTokensForUser(userId);

  return { ok: true };
});
