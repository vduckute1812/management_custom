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
import { DomainError, mapDomainError, parseBody } from "~/server/utils/http";
import { verifyEmailBodySchema } from "~/server/schemas";

export default defineEventHandler(async (event) => {
  try {
    const body = await parseBody(event, verifyEmailBodySchema);
    const presented = body.token;

    const userId = await redeemEmailVerification(hashOpaqueToken(presented));
    if (!userId) {
      throw new DomainError(400, "Verification link is invalid or expired");
    }

    const user = await getUserById(userId);
    if (!user) {
      throw new DomainError(404, "User not found");
    }
    return { ok: true, user: toAuthUser(user) };
  } catch (err) {
    mapDomainError(err);
  }
});
