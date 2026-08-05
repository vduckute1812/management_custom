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
  passwordResetIsRedeemable,
  redeemPasswordReset,
} from "~/server/utils/db";
import { hashOpaqueToken, hashPassword } from "~/server/utils/auth";
import { DomainError, mapDomainError, parseBody } from "~/server/utils/http";
import { resetPasswordBodySchema } from "~/server/schemas";
import { passwordStrengthError } from "~/utils/passwordPolicy";

export default defineEventHandler(async (event) => {
  try {
    const body = await parseBody(event, resetPasswordBodySchema);
    const presented = body.token;
    const password = body.password;

    const strengthError = passwordStrengthError(password);
    if (strengthError) {
      throw new DomainError(400, strengthError);
    }

    const tokenHash = hashOpaqueToken(presented);

    // Reject junk tokens before spending a bcrypt hash on them; `redeem` below
    // re-checks the same predicate atomically, so this is an optimisation, not
    // the security boundary.
    if (!(await passwordResetIsRedeemable(tokenHash))) {
      throw new DomainError(400, "Reset link is invalid or expired");
    }

    const userId = await redeemPasswordReset({
      tokenHash,
      passwordHash: await hashPassword(password),
    });
    if (!userId) {
      throw new DomainError(400, "Reset link is invalid or expired");
    }

    return { ok: true };
  } catch (err) {
    mapDomainError(err);
  }
});
