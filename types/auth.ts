/**
 * Auth-provider identities (OAuth). Integer end-to-end — never string tokens.
 * See `.cursor/skills/integer-db-enums/SKILL.md`.
 */

/** OAuth / external identity provider. */
export const AuthProvider = {
  Google: 0,
} as const;
export type AuthProvider = (typeof AuthProvider)[keyof typeof AuthProvider];
export const AUTH_PROVIDERS = [AuthProvider.Google] as const;

/** OAuth start intent (signed into the state JWT — not a DB column). */
export const AuthOAuthIntent = {
  Login: 0,
  Link: 1,
} as const;
export type AuthOAuthIntent =
  (typeof AuthOAuthIntent)[keyof typeof AuthOAuthIntent];
export const AUTH_OAUTH_INTENTS = [
  AuthOAuthIntent.Login,
  AuthOAuthIntent.Link,
] as const;

export function isAuthProvider(value: unknown): value is AuthProvider {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    (AUTH_PROVIDERS as readonly number[]).includes(value)
  );
}

export function toAuthProvider(value: unknown): AuthProvider {
  const n = typeof value === "string" ? Number(value) : value;
  return isAuthProvider(n) ? n : AuthProvider.Google;
}

export function isAuthOAuthIntent(value: unknown): value is AuthOAuthIntent {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    (AUTH_OAUTH_INTENTS as readonly number[]).includes(value)
  );
}
