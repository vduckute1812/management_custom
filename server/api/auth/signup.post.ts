/**
 * POST /api/auth/signup
 *
 * Body:  { email, password, name? }
 * Reply: { user: AuthUser, verificationSent: boolean }
 *
 * Creates a new account with `role: UserRole.Normal` and dispatches a verification
 * email. The new account is NOT logged in automatically — the caller must
 * verify their email then POST /api/auth/login. This keeps the verified-vs-
 * unverified state machine simple and the login route is the only path that
 * issues tokens.
 */
import {
  UserRole,
  createUserWithEmailVerification,
  getUserByEmail,
  toAuthUser,
} from "~/server/utils/db";
import {
  generateOpaqueToken,
  hashOpaqueToken,
  hashPassword,
  nowPlusSeconds,
} from "~/server/utils/auth";
import { buildVerifyUrl } from "~/server/utils/mailer";
import { enqueueVerificationEmail } from "~/server/utils/queue";
import { passwordStrengthError } from "~/utils/passwordPolicy";

interface SignupBody {
  email?: string;
  password?: string;
  name?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VERIFY_TTL_SECONDS = 24 * 3600;

export default defineEventHandler(async (event) => {
  const body = await readBody<SignupBody>(event);
  const email = (body?.email ?? "").trim().toLowerCase();
  const password = body?.password ?? "";
  const name = body?.name?.trim() || undefined;

  if (!EMAIL_RE.test(email)) {
    throw createError({
      statusCode: 400,
      statusMessage: "A valid email is required",
    });
  }
  const strengthError = passwordStrengthError(password);
  if (strengthError) {
    throw createError({
      statusCode: 400,
      statusMessage: strengthError,
    });
  }
  if (name && name.length > 120) {
    throw createError({ statusCode: 400, statusMessage: "Name too long" });
  }

  const existing = await getUserByEmail(email);
  if (existing) {
    // Use a generic 409 — explicitly avoid leaking "this email already has
    // an account" via timing/body differences elsewhere, but on direct
    // sign-up the user is asking us point-blank.
    throw createError({
      statusCode: 409,
      statusMessage: "An account with this email already exists",
    });
  }

  const passwordHash = await hashPassword(password);
  const rawToken = generateOpaqueToken();
  const user = await createUserWithEmailVerification({
    user: {
      email,
      passwordHash,
      name,
      role: UserRole.Normal,
      emailVerified: false,
    },
    tokenHash: hashOpaqueToken(rawToken),
    expiresAt: nowPlusSeconds(VERIFY_TTL_SECONDS),
  });

  let verificationSent = true;
  try {
    // Enqueue so signup stays fast and SMTP retries happen in the worker.
    await enqueueVerificationEmail({ to: email, token: rawToken });
  } catch (err) {
    // Queue insert failures shouldn't block sign-up — the user + verification
    // row already exist. Log the one-time link so an operator can finish
    // verify from the server console (token is never returned to the browser).
    console.error("[signup] failed to enqueue verification email", err);
    console.error(
      `[signup] verification link (enqueue failed; one-time, expires in 24h):\n${buildVerifyUrl(rawToken)}`,
    );
    verificationSent = false;
  }

  return {
    user: toAuthUser(user),
    verificationSent,
  };
});
