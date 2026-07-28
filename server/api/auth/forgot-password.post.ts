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
import { buildResetUrl } from "~/server/utils/mailer";
import { enqueuePasswordResetEmail } from "~/server/utils/queue";

interface ForgotPasswordBody {
  email?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESET_TTL_SECONDS = 3600;

export default defineEventHandler(async (event) => {
  const body = await readBody<ForgotPasswordBody>(event);
  const email = (body?.email ?? "").trim().toLowerCase();

  if (!EMAIL_RE.test(email)) {
    throw createError({
      statusCode: 400,
      statusMessage: "A valid email is required",
    });
  }

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
      await enqueuePasswordResetEmail({ to: email, token: rawToken });
    } catch (err) {
      console.error("[forgot-password] failed to enqueue reset email", err);
      console.error(
        `[forgot-password] reset link (enqueue failed; one-time, expires in 1h):\n${buildResetUrl(rawToken)}`,
      );
    }
  }

  return { ok: true };
});
