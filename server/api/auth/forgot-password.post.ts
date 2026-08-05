/**
 * POST /api/auth/forgot-password
 *
 * Body:  { email }
 * Reply: { ok: true }
 *
 * Sends a one-shot password-reset link when the account exists and email is
 * verified. Always returns `{ ok: true }` so callers cannot enumerate
 * registered addresses.
 */
import {
  createPasswordReset,
  getUserByEmail,
  invalidatePendingPasswordResets,
} from "~/server/utils/db";
import {
  generateOpaqueToken,
  hashOpaqueToken,
  nowPlusSeconds,
} from "~/server/utils/auth";
import { enqueuePasswordResetEmail } from "~/server/utils/queue";
import { mapDomainError, parseBody } from "~/server/utils/http";
import { forgotPasswordBodySchema } from "~/server/schemas";
import { assertAccountRateLimit } from "~/server/rate-limit";

const RESET_TTL_SECONDS = 3600;

export default defineEventHandler(async (event) => {
  try {
    const body = await parseBody(event, forgotPasswordBodySchema);
    const email = body.email.trim().toLowerCase();

    await assertAccountRateLimit(event, email, "/api/auth/forgot-password");

    const user = await getUserByEmail(email);
    if (user?.emailVerified) {
      const rawToken = generateOpaqueToken();
      await invalidatePendingPasswordResets(user.id);
      await createPasswordReset({
        userId: user.id,
        tokenHash: hashOpaqueToken(rawToken),
        expiresAt: nowPlusSeconds(RESET_TTL_SECONDS),
      });

      try {
        await enqueuePasswordResetEmail({
          to: email,
          token: rawToken,
          locale: user.locale,
        });
      } catch (err) {
        // Never log the raw token / reset URL.
        console.error("[forgot-password] failed to enqueue reset email", err);
      }
    }

    return { ok: true };
  } catch (err) {
    mapDomainError(err);
  }
});
