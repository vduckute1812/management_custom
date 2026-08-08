/**
 * Auth workflow orchestration — signup, refresh rotation, account delete,
 * Google OAuth callback redirects. Handlers stay thin (parse + cookies + map).
 */
import type { H3Event } from "h3";
import type { z } from "zod";
import { AuthOAuthIntent } from "~/types/auth";
import type { AuthUser } from "~/types/auth";
import { UserRole } from "~/types/auth";
import {
  createUserWithEmailVerification,
  findActiveRefreshToken,
  findRefreshTokenByHash,
  getUserByEmail,
  getUserById,
  revokeRefreshTokenFamily,
  rotateRefreshToken,
  toAuthUser,
  type UserRecord,
} from "~/server/utils/db";
import { deleteUserAccount } from "~/server/services/auth/accountDeletionService";
import {
  emailConfirmationMatches,
  generateOpaqueToken,
  hashOpaqueToken,
  hashPassword,
  nowPlusSeconds,
  signAccessToken,
  TOKEN_TTL,
  verifyPassword,
} from "~/server/utils/auth";
import { enqueueVerificationEmail } from "~/server/utils/queue";
import { DomainError } from "~/server/utils/http";
import { issueAuthSession } from "~/server/utils/authSession";
import {
  clearOAuthStateCookie,
  exchangeGoogleCode,
  fetchGoogleProfile,
  getGoogleOAuthConfig,
  parseOAuthState,
  readOAuthStateCookie,
  safeOAuthRedirect,
} from "~/server/utils/googleOAuth";
import { resolveGoogleOAuthUser } from "~/server/utils/googleOAuthUser";
import { passwordStrengthError } from "~/utils/passwordPolicy";
import type {
  deleteAccountBodySchema,
  signupBodySchema,
} from "~/server/schemas";

type SignupBody = z.infer<typeof signupBodySchema>;
type DeleteAccountBody = z.infer<typeof deleteAccountBodySchema>;

const VERIFY_TTL_SECONDS = 24 * 3600;

export async function signupAccount(
  body: SignupBody,
): Promise<{ user: AuthUser; verificationSent: boolean }> {
  const email = body.email.trim().toLowerCase();
  const password = body.password;
  const name = body.name.trim();

  const strengthError = passwordStrengthError(password);
  if (strengthError) {
    throw new DomainError(400, strengthError);
  }

  const existing = await getUserByEmail(email);
  if (existing) {
    throw new DomainError(409, "An account with this email already exists");
  }

  const passwordHash = await hashPassword(password);
  const rawToken = generateOpaqueToken();
  const locale = body.locale;
  const user = await createUserWithEmailVerification({
    user: {
      email,
      passwordHash,
      name,
      role: UserRole.Normal,
      emailVerified: false,
      locale,
    },
    tokenHash: hashOpaqueToken(rawToken),
    expiresAt: nowPlusSeconds(VERIFY_TTL_SECONDS),
  });

  let verificationSent = true;
  try {
    await enqueueVerificationEmail({
      to: email,
      token: rawToken,
      locale: user.locale,
    });
  } catch (err) {
    console.error("[signup] failed to enqueue verification email", err);
    verificationSent = false;
  }

  return {
    user: toAuthUser(user),
    verificationSent,
  };
}

export type RefreshSessionResult = {
  user: AuthUser;
  accessToken: string;
  accessExpiresAt: string;
  refreshToken: string;
  refreshExpiresAt: string;
};

/**
 * Rotate a presented refresh token. Caller sets cookies and clears them on
 * DomainError 401 (reuse / missing user / race).
 */
export async function refreshAuthSession(
  event: H3Event,
  presented: string,
): Promise<RefreshSessionResult> {
  const presentedHash = hashOpaqueToken(presented);
  const record = await findActiveRefreshToken(presentedHash);
  if (!record) {
    const prior = await findRefreshTokenByHash(presentedHash);
    if (prior?.revokedAt) {
      await revokeRefreshTokenFamily(prior.familyId);
    }
    throw new DomainError(401, "Refresh token invalid or expired");
  }

  const user = await getUserById(record.userId);
  if (!user) {
    throw new DomainError(401, "Account no longer exists");
  }

  const newRefresh = generateOpaqueToken();
  const refreshExpiresAt = nowPlusSeconds(TOKEN_TTL.refreshSeconds);
  const rotated = await rotateRefreshToken({
    presentedHash,
    familyId: record.familyId,
    next: {
      userId: user.id,
      tokenHash: hashOpaqueToken(newRefresh),
      expiresAt: refreshExpiresAt,
      userAgent: getRequestHeader(event, "user-agent") ?? undefined,
      ip: getRequestIP(event, { xForwardedFor: true }) ?? undefined,
    },
  });
  if (!rotated) {
    throw new DomainError(401, "Refresh token invalid or expired");
  }

  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
  });
  const accessExpiresAt = nowPlusSeconds(TOKEN_TTL.accessSeconds);

  return {
    user: toAuthUser(user),
    accessToken,
    accessExpiresAt,
    refreshToken: newRefresh,
    refreshExpiresAt,
  };
}

export async function deleteOwnAccount(
  user: UserRecord,
  body: DeleteAccountBody,
): Promise<void> {
  if (user.role === UserRole.Superadmin) {
    throw new DomainError(
      400,
      "The superadmin account cannot be deleted — the install would lose its operator.",
    );
  }

  if (!emailConfirmationMatches(body.email, user.email)) {
    throw new DomainError(
      400,
      "The email you typed does not match this account.",
    );
  }

  if (user.passwordHash) {
    if (!body.password) {
      throw new DomainError(
        400,
        "Your password is required to delete this account.",
      );
    }
    const ok = await verifyPassword(body.password, user.passwordHash);
    if (!ok) {
      throw new DomainError(401, "Wrong password");
    }
  }

  const removed = await deleteUserAccount(user.id);
  if (!removed) {
    throw new DomainError(404, "User not found");
  }
}

function failRedirect(
  intent: (typeof AuthOAuthIntent)[keyof typeof AuthOAuthIntent] | null,
  code: string,
): string {
  const path = intent === AuthOAuthIntent.Link ? "/settings" : "/login";
  const url = new URL(path, "http://local.invalid");
  url.searchParams.set("oauth_error", code);
  return `${url.pathname}?${url.searchParams.toString()}`;
}

/** After login/signup OAuth: hydrate client session from cookies. */
function continueRedirect(redirect: string): string {
  const dest = safeOAuthRedirect(redirect, "/");
  const url = new URL("/auth/continue", "http://local.invalid");
  url.searchParams.set("redirect", dest);
  return `${url.pathname}?${url.searchParams.toString()}`;
}

/**
 * Google OAuth redirect handler body. Returns a same-origin path (+ query)
 * for `sendRedirect`.
 */
export async function completeGoogleOAuthCallback(
  event: H3Event,
): Promise<string> {
  const query = getQuery(event);
  const stateRaw = typeof query.state === "string" ? query.state : "";
  const stateHint = stateRaw ? parseOAuthState(stateRaw) : null;

  const config = getGoogleOAuthConfig();
  if (!config) {
    clearOAuthStateCookie(event);
    return failRedirect(stateHint?.intent ?? null, "config");
  }

  const err = typeof query.error === "string" ? query.error : "";
  if (err) {
    clearOAuthStateCookie(event);
    return failRedirect(stateHint?.intent ?? null, "denied");
  }

  const code = typeof query.code === "string" ? query.code : "";
  const cookieNonce = readOAuthStateCookie(event);
  clearOAuthStateCookie(event);

  const state = stateHint;
  if (!state || !cookieNonce || state.nonce !== cookieNonce) {
    return failRedirect(null, "state");
  }

  if (!code) {
    return failRedirect(state.intent, "denied");
  }

  try {
    const accessToken = await exchangeGoogleCode(config, code);
    const profile = await fetchGoogleProfile(accessToken);
    const user = await resolveGoogleOAuthUser({
      profile,
      intent: state.intent,
      linkUserId: state.userId,
      locale: state.locale,
    });
    await issueAuthSession(event, user);

    if (state.intent === AuthOAuthIntent.Link) {
      const dest = safeOAuthRedirect(state.redirect, "/settings");
      const url = new URL(
        dest.startsWith("/settings") ? dest : "/settings",
        "http://local.invalid",
      );
      url.searchParams.set("linked", "google");
      return `${url.pathname}?${url.searchParams.toString()}`;
    }

    return continueRedirect(state.redirect);
  } catch (e: unknown) {
    const status = (e as { statusCode?: number }).statusCode;
    const msg = (e as { statusMessage?: string }).statusMessage ?? "";
    const dataCode = (e as { data?: { code?: string } }).data?.code;
    console.error("[google-oauth] callback failed", status, msg);
    let codeKey = "failed";
    if (status === 409) {
      codeKey = dataCode === "unverified" ? "unverified" : "conflict";
    } else if (status === 403) codeKey = "email";
    else if (status === 401) codeKey = "auth";
    else if (status === 502) codeKey = "google";
    return failRedirect(state.intent, codeKey);
  }
}
