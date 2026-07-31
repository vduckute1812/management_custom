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
  getUserById,
  redeemEmailVerification,
  toAuthUser,
} from "~/server/utils/db";
import { hashOpaqueToken } from "~/server/utils/auth";
import { parseBody } from "~/server/utils/http";
import { verifyEmailBodySchema } from "~/server/schemas";

export default defineEventHandler(async (event) => {
  const body = await parseBody(event, verifyEmailBodySchema);
  const presented = body.token;

  const userId = await redeemEmailVerification(hashOpaqueToken(presented));
  if (!userId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Verification link is invalid or expired",
    });
  }

  const user = await getUserById(userId);
  if (!user) {
    throw createError({ statusCode: 404, statusMessage: "User not found" });
  }
  return { ok: true, user: toAuthUser(user) };
});
