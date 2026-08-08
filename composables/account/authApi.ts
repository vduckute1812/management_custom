import type { AuthUser } from "~/types/auth";
import type { AppLocale } from "~/types/locale";
import type { MoneyCurrency } from "~/types/money";
import {
  AUTH_CREDENTIALS,
  type AuthSession,
} from "~/composables/account/authSessionStorage";

/** Thin `$fetch` wrappers for auth endpoints (no client state). */

export async function authLogin(
  email: string,
  password: string,
): Promise<AuthSession> {
  return await $fetch<AuthSession>("/api/auth/login", {
    method: "POST",
    body: { email, password },
    ...AUTH_CREDENTIALS,
  });
}

export async function authSignup(input: {
  email: string;
  password: string;
  name: string;
  locale?: AppLocale;
}): Promise<{ user: AuthUser; verificationSent: boolean }> {
  return await $fetch("/api/auth/signup", {
    method: "POST",
    body: input,
    ...AUTH_CREDENTIALS,
  });
}

export async function authVerifyEmail(token: string): Promise<AuthUser> {
  const data = await $fetch<{ ok: boolean; user: AuthUser }>(
    "/api/auth/verify-email",
    { method: "POST", body: { token }, ...AUTH_CREDENTIALS },
  );
  return data.user;
}

export async function authRequestPasswordReset(email: string): Promise<void> {
  await $fetch("/api/auth/forgot-password", {
    method: "POST",
    body: { email },
    ...AUTH_CREDENTIALS,
  });
}

export async function authResetPassword(
  token: string,
  password: string,
): Promise<void> {
  await $fetch("/api/auth/reset-password", {
    method: "POST",
    body: { token, password },
    ...AUTH_CREDENTIALS,
  });
}

export async function authRefresh(): Promise<AuthSession> {
  return await $fetch<AuthSession>("/api/auth/refresh", {
    method: "POST",
    body: {},
    ...AUTH_CREDENTIALS,
  });
}

export async function authFetchMe(
  accessToken: string | null,
): Promise<AuthUser> {
  const { user } = await $fetch<{ user: AuthUser }>("/api/auth/me", {
    headers: accessToken
      ? { Authorization: `Bearer ${accessToken}` }
      : undefined,
    ...AUTH_CREDENTIALS,
  });
  return user;
}

export async function authUpdateProfile(
  accessToken: string | null,
  input: {
    name?: string;
    avatarUploadId?: string | null;
    title?: string | null;
    job?: string | null;
    location?: string | null;
  },
): Promise<AuthUser> {
  const { user } = await $fetch<{ user: AuthUser }>("/api/auth/profile", {
    method: "PATCH",
    body: input,
    headers: accessToken
      ? { Authorization: `Bearer ${accessToken}` }
      : undefined,
    ...AUTH_CREDENTIALS,
  });
  return user;
}

export async function authUpdatePreferences(
  accessToken: string | null,
  input: {
    locale?: AppLocale;
    moneyCurrency?: MoneyCurrency;
  },
): Promise<AuthUser> {
  const { user } = await $fetch<{ user: AuthUser }>("/api/auth/preferences", {
    method: "PATCH",
    body: input,
    headers: accessToken
      ? { Authorization: `Bearer ${accessToken}` }
      : undefined,
    ...AUTH_CREDENTIALS,
  });
  return user;
}

export async function authLogout(
  accessToken: string | null,
  opts?: { everywhere?: boolean },
): Promise<void> {
  await $fetch("/api/auth/logout", {
    method: "POST",
    body: { everywhere: opts?.everywhere ?? false },
    headers: accessToken
      ? { Authorization: `Bearer ${accessToken}` }
      : undefined,
    ...AUTH_CREDENTIALS,
  });
}
