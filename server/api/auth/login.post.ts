/**
 * POST /api/auth/login — Zod-validated; sets HttpOnly auth cookies.
 */
import { getUserByEmail } from "~/server/utils/db";
import { verifyPassword } from "~/server/utils/auth";
import { issueAuthSession } from "~/server/utils/authSession";
import { parseBody } from "~/server/utils/http";
import { loginBodySchema } from "~/server/schemas";
import { assertAccountRateLimit } from "~/server/rate-limit";

const GENERIC_INVALID = "Invalid email or password";

export default defineEventHandler(async (event) => {
  const body = await parseBody(event, loginBodySchema);
  const email = body.email.trim().toLowerCase();
  const password = body.password;

  // Per-email budget on top of the per-IP middleware. Counts every attempt —
  // including wrong passwords — so rotating source IPs cannot stuff one inbox.
  await assertAccountRateLimit(event, email, "/api/auth/login");

  const user = await getUserByEmail(email);
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: GENERIC_INVALID });
  }

  if (!user.passwordHash) {
    throw createError({
      statusCode: 401,
      statusMessage:
        "This account uses Google sign-in. Continue with Google instead.",
    });
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    throw createError({ statusCode: 401, statusMessage: GENERIC_INVALID });
  }

  if (!user.emailVerified) {
    throw createError({
      statusCode: 403,
      statusMessage:
        "Email not verified yet. Check your inbox for the verification link.",
    });
  }

  return issueAuthSession(event, user);
});
