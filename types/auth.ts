/**
 * Auth domain types — account identity, roles, OAuth providers.
 *
 * Task/epic types live in `types/task.ts`. Money currency/locale deps are
 * imported from their own modules so this file stays free of task domain.
 *
 * Integer enums end-to-end — see `.cursor/skills/integer-db-enums/SKILL.md`.
 */

import type { AppLocale } from "./locale";
import type { MoneyCurrency } from "./money";

// -------------------------------------------------------------------------
// OAuth / external identity provider
// -------------------------------------------------------------------------

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

// -------------------------------------------------------------------------
// UserRole — higher = more privileged
// -------------------------------------------------------------------------

export const UserRole = {
  Normal: 0,
  Admin: 1,
  Superadmin: 2,
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const USER_ROLES: readonly UserRole[] = [
  UserRole.Normal,
  UserRole.Admin,
  UserRole.Superadmin,
];

/**
 * Roles a user with admin powers may assign through the UI. `Superadmin` is
 * intentionally absent — it's seeded by `npm run migrate:auth` and can never
 * be granted from the app.
 */
export const ASSIGNABLE_USER_ROLES: readonly UserRole[] = [
  UserRole.Admin,
  UserRole.Normal,
];

/** i18n keys under `roles.*`. */
export const ROLE_I18N_KEYS: Record<UserRole, string> = {
  [UserRole.Normal]: "roles.normal",
  [UserRole.Admin]: "roles.admin",
  [UserRole.Superadmin]: "roles.superadmin",
};

/** @deprecated Prefer ROLE_I18N_KEYS + t(). */
export const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.Normal]: "Member",
  [UserRole.Admin]: "Admin",
  [UserRole.Superadmin]: "Superadmin",
};

/** True for any role with admin-dashboard access. */
export function isAdminRole(role: UserRole): boolean {
  return role >= UserRole.Admin;
}

// -------------------------------------------------------------------------
// Account shapes
// -------------------------------------------------------------------------

/**
 * Public-safe shape of a user account. Server responses MUST NEVER include
 * `passwordHash` or any other internal field. Anything beyond these props
 * is admin-only and lives in `AdminUserSummary` below.
 */
export interface AuthUser {
  id: string;
  email: string;
  /** Display name — always set (signup required; legacy rows derived from email). */
  name: string;
  /** Proxied upload URL (`/api/uploads/…`) when the user set an avatar. */
  avatarUrl?: string;
  /** Short professional headline (e.g. "Staff engineer"). */
  title?: string;
  /** Job / role at work (e.g. "Frontend lead at Acme"). */
  job?: string;
  /** Free-form location (city, timezone, remote, …). */
  location?: string;
  /**
   * Preferred UI / email language (`en` / `vi` / `zh-CN` / `zh-TW`).
   * Stored on the user so outbound mail matches the account, not the device.
   */
  locale: AppLocale;
  /**
   * Money display currency (`MoneyCurrency` TINYINT). Defaults from locale
   * at signup; user may change later without rewriting history.
   */
  moneyCurrency: MoneyCurrency;
  role: UserRole;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUserSummary extends AuthUser {
  taskCount: number;
  epicCount: number;
  hoursLogged: number;
  /** Latest `time_blocks.end_at` across this user's tasks. */
  lastActivity?: string;
  /** Latest successful `POST /api/auth/login` stamp. Undefined = never. */
  lastLoginAt?: string;
}
