/**
 * POST /api/auth/signup
 *
 * Body:  { email, password, name, locale? }
 * Reply: { user: AuthUser, verificationSent: boolean }
 *
 * Creates a new account with `role: UserRole.Normal` and dispatches a verification
 * email. The new account is NOT logged in automatically — the caller must
 * verify their email then POST /api/auth/login. This keeps the verified-vs-
 * unverified state machine simple and the login route is the only path that
 * issues tokens.
 */
import { parseBody, mapDomainError } from "~/server/utils/http";
import { signupBodySchema } from "~/server/schemas";
import { assertAccountRateLimit } from "~/server/rate-limit";
import { signupAccount } from "~/server/services/authService";

export default defineEventHandler(async (event) => {
  const body = await parseBody(event, signupBodySchema);
  const email = body.email.trim().toLowerCase();

  await assertAccountRateLimit(event, email, "/api/auth/signup");

  try {
    return await signupAccount(body);
  } catch (err) {
    mapDomainError(err);
  }
});
