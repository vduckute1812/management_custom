/**
 * Resolve a Google profile into a local user for login / link intents.
 */
import { createError } from "h3";
import { AuthOAuthIntent, AuthProvider } from "../../types/auth";
import type { GoogleProfile } from "~/server/utils/googleOAuth";
import {
  createUser,
  getIdentityByProviderSubject,
  getUserByEmail,
  getUserById,
  linkIdentity,
  type UserRecord,
} from "~/server/utils/db";
import { isAppLocale, type AppLocale } from "~/types/locale";

export async function resolveGoogleLoginUser(
  profile: GoogleProfile,
  locale?: string,
): Promise<UserRecord> {
  if (!profile.emailVerified) {
    throw createError({
      statusCode: 403,
      statusMessage: "Google email is not verified",
    });
  }

  const existingIdentity = await getIdentityByProviderSubject(
    AuthProvider.Google,
    profile.sub,
  );
  if (existingIdentity) {
    const user = await getUserById(existingIdentity.userId);
    if (!user) {
      throw createError({
        statusCode: 500,
        statusMessage: "Linked Google account is missing locally",
      });
    }
    return user;
  }

  const byEmail = await getUserByEmail(profile.email);
  if (byEmail) {
    // Never auto-link + verify an unverified password signup — that lets an
    // attacker who registered the victim's email first take over when the
    // victim later continues with Google.
    if (!byEmail.emailVerified) {
      throw createError({
        statusCode: 409,
        statusMessage:
          "An account with this email exists but is not verified yet",
        data: { code: "unverified" },
      });
    }
    await linkIdentity({
      userId: byEmail.id,
      provider: AuthProvider.Google,
      providerSubject: profile.sub,
      providerEmail: profile.email,
    });
    return byEmail;
  }

  const preferredLocale: AppLocale | undefined = isAppLocale(locale)
    ? locale
    : undefined;
  const created = await createUser({
    email: profile.email,
    passwordHash: null,
    name: profile.name,
    emailVerified: true,
    locale: preferredLocale,
  });
  await linkIdentity({
    userId: created.id,
    provider: AuthProvider.Google,
    providerSubject: profile.sub,
    providerEmail: profile.email,
  });
  return created;
}

export async function resolveGoogleLinkUser(
  profile: GoogleProfile,
  sessionUserId: string,
): Promise<UserRecord> {
  if (!profile.emailVerified) {
    throw createError({
      statusCode: 403,
      statusMessage: "Google email is not verified",
    });
  }

  const sessionUser = await getUserById(sessionUserId);
  if (!sessionUser) {
    throw createError({
      statusCode: 401,
      statusMessage: "Sign in again to link Google",
    });
  }

  const existingIdentity = await getIdentityByProviderSubject(
    AuthProvider.Google,
    profile.sub,
  );
  if (existingIdentity) {
    if (existingIdentity.userId !== sessionUserId) {
      throw createError({
        statusCode: 409,
        statusMessage: "That Google account is already linked to another user",
      });
    }
    return sessionUser;
  }

  // Prefer matching emails so we don't silently attach a different inbox.
  if (profile.email !== sessionUser.email) {
    throw createError({
      statusCode: 409,
      statusMessage:
        "Google email must match your account email to link. Sign in with Google instead, or use the same address.",
    });
  }

  await linkIdentity({
    userId: sessionUser.id,
    provider: AuthProvider.Google,
    providerSubject: profile.sub,
    providerEmail: profile.email,
  });
  return sessionUser;
}

export async function resolveGoogleOAuthUser(input: {
  profile: GoogleProfile;
  intent: (typeof AuthOAuthIntent)[keyof typeof AuthOAuthIntent];
  linkUserId?: string;
  locale?: string;
}): Promise<UserRecord> {
  if (input.intent === AuthOAuthIntent.Link) {
    if (!input.linkUserId) {
      throw createError({
        statusCode: 401,
        statusMessage: "Sign in again to link Google",
      });
    }
    return resolveGoogleLinkUser(input.profile, input.linkUserId);
  }
  return resolveGoogleLoginUser(input.profile, input.locale);
}
