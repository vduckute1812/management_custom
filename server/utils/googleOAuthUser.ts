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
  markUserEmailVerified,
  type UserRecord,
} from "~/server/utils/db";

export async function resolveGoogleLoginUser(
  profile: GoogleProfile,
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
    await linkIdentity({
      userId: byEmail.id,
      provider: AuthProvider.Google,
      providerSubject: profile.sub,
      providerEmail: profile.email,
    });
    if (!byEmail.emailVerified) {
      await markUserEmailVerified(byEmail.id);
      const refreshed = await getUserById(byEmail.id);
      return refreshed ?? byEmail;
    }
    return byEmail;
  }

  const created = await createUser({
    email: profile.email,
    passwordHash: null,
    name: profile.name,
    emailVerified: true,
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
  return resolveGoogleLoginUser(input.profile);
}
