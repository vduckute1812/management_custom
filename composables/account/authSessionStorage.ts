import { type AuthUser } from "~/types/task";
import {
  defaultMoneyCurrencyForLocale,
  isAppLocale,
  type AppLocale,
} from "~/types/locale";
import { isMoneyCurrency } from "~/types/money";
import { nameFromEmail } from "~/utils/displayName";

/**
 * Auth session shape returned by login/refresh. Access token is short-lived;
 * refresh lives only in the HttpOnly `mgmt_rt` cookie.
 */
export interface AuthSession {
  user: AuthUser;
  accessToken: string;
  accessExpiresAt: string;
  /** Present only for legacy responses; ignored by the cookie-based client. */
  refreshToken?: string;
  refreshExpiresAt?: string;
}

export const AUTH_STORAGE_KEYS = {
  user: "auth:user",
  accessToken: "auth:accessToken",
  accessExpiresAt: "auth:accessExpiresAt",
  /** Cleared on hydrate — legacy localStorage refresh secrets. */
  refreshToken: "auth:refreshToken",
  hasSession: "auth:hasSession",
} as const;

export const AUTH_CREDENTIALS = { credentials: "include" as const };

/** Normalize legacy cached AuthUser shapes missing locale / moneyCurrency / name. */
export function normalizeAuthUser(raw: AuthUser): AuthUser {
  const locale: AppLocale = isAppLocale(raw.locale) ? raw.locale : "en";
  const moneyCurrency = isMoneyCurrency(raw.moneyCurrency)
    ? raw.moneyCurrency
    : defaultMoneyCurrencyForLocale(locale);
  const name =
    typeof raw.name === "string" && raw.name.trim()
      ? raw.name.trim()
      : nameFromEmail(raw.email);
  return { ...raw, name, locale, moneyCurrency };
}

export function persistAuthSession(input: {
  user: AuthUser | null;
  hasRefreshSession: boolean;
}): void {
  if (!import.meta.client) return;
  try {
    const ls = window.localStorage;
    if (input.user)
      ls.setItem(AUTH_STORAGE_KEYS.user, JSON.stringify(input.user));
    else ls.removeItem(AUTH_STORAGE_KEYS.user);
    // Access token stays in memory only — page reload rehydrates via cookie.
    ls.removeItem(AUTH_STORAGE_KEYS.accessToken);
    ls.removeItem(AUTH_STORAGE_KEYS.accessExpiresAt);
    ls.removeItem(AUTH_STORAGE_KEYS.refreshToken);
    if (input.hasRefreshSession) ls.setItem(AUTH_STORAGE_KEYS.hasSession, "1");
    else ls.removeItem(AUTH_STORAGE_KEYS.hasSession);
  } catch {
    // Quota errors / privacy modes — non-fatal.
  }
}

export function hydrateAuthFromStorage(): {
  user: AuthUser | null;
  hasRefreshSession: boolean;
} {
  if (!import.meta.client) {
    return { user: null, hasRefreshSession: false };
  }
  try {
    const ls = window.localStorage;
    // Drop any legacy secrets that older builds left behind.
    ls.removeItem(AUTH_STORAGE_KEYS.accessToken);
    ls.removeItem(AUTH_STORAGE_KEYS.accessExpiresAt);
    ls.removeItem(AUTH_STORAGE_KEYS.refreshToken);
    const hasRefreshSession = ls.getItem(AUTH_STORAGE_KEYS.hasSession) === "1";
    const u = ls.getItem(AUTH_STORAGE_KEYS.user);
    const parsed = u ? (JSON.parse(u) as AuthUser) : null;
    if (parsed && typeof parsed.role !== "number") {
      ls.removeItem(AUTH_STORAGE_KEYS.user);
      return { user: null, hasRefreshSession };
    }
    return {
      user: parsed ? normalizeAuthUser(parsed) : null,
      hasRefreshSession,
    };
  } catch {
    return { user: null, hasRefreshSession: false };
  }
}
