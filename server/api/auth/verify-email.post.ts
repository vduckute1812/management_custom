/**
 * POST /api/auth/verify-email
 *
 * Body:  { token }
 * Reply: { ok: true, user: AuthUser }
 *
 * Consumes a one-time email-verification token (one-shot, hashed
 * server-side) and flips the user's `email_verified` flag.
 */
import {
  consumeEmailVerification,
  getUserById,
  setEmailVerified,
  toAuthUser,
} from "~/server/utils/db";
import { hashOpaqueToken } from "~/server/utils/auth";

interface VerifyBody {
  token?: string;
}

export default defineEventHandler(async (event) => {
  const body = await readBody<VerifyBody>(event);
  const presented = body?.token ?? "";
  if (!presented) {
    throw createError({ statusCode: 400, statusMessage: "token is required" });
  }

  const userId = await consumeEmailVerification(hashOpaqueToken(presented));
  if (!userId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Verification link is invalid or expired",
    });
  }

  await setEmailVerified(userId, true);
  const user = await getUserById(userId);
  if (!user) {
    throw createError({ statusCode: 404, statusMessage: "User not found" });
  }
  return { ok: true, user: toAuthUser(user) };
});
