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
  createEmailVerification,
  createUser,
  getUserByEmail,
  toAuthUser,
} from "~/server/utils/db";
import {
  generateOpaqueToken,
  hashOpaqueToken,
  hashPassword,
  nowPlusSeconds,
} from "~/server/utils/auth";
import { sendVerificationEmail } from "~/server/utils/mailer";

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
  if (password.length < 8) {
    throw createError({
      statusCode: 400,
      statusMessage: "Password must be at least 8 characters",
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
  const user = await createUser({
    email,
    passwordHash,
    name,
    role: UserRole.Normal,
    emailVerified: false,
  });

  const rawToken = generateOpaqueToken();
  await createEmailVerification({
    userId: user.id,
    tokenHash: hashOpaqueToken(rawToken),
    expiresAt: nowPlusSeconds(VERIFY_TTL_SECONDS),
  });

  let verificationSent = true;
  try {
    await sendVerificationEmail({ to: email, token: rawToken });
  } catch (err) {
    // SMTP failures shouldn't block sign-up — the user record exists and the
    // verification row exists; they can resend later. Log and continue.
    console.error("[signup] failed to dispatch verification email", err);
    verificationSent = false;
  }

  return {
    user: toAuthUser(user),
    verificationSent,
  };
});
