import { UserRole, type AuthUser } from "~/types/task";
import {
  defaultMoneyCurrencyForLocale,
  isAppLocale,
  type AppLocale,
} from "~/types/locale";
import { isMoneyCurrency } from "~/types/money";
import { nameFromEmail } from "~/utils/displayName";

/**
 * Auth state for the client. Owns:
 *   - the cached AuthUser (localStorage — non-secret profile chrome)
 *   - the short-lived access token in memory (mirrored briefly for Bearer
 *     headers; also set as HttpOnly `mgmt_at` for media)
 *   - refresh lives ONLY in the HttpOnly `mgmt_rt` cookie — never localStorage
 *
 * On boot the client POSTs `/api/auth/refresh` with credentials; a valid
 * cookie restores the session without a refresh secret in JS.
 */
export interface AuthSession {
  user: AuthUser;
  accessToken: string;
  accessExpiresAt: string;
  /** Present only for legacy responses; ignored by the cookie-based client. */
  refreshToken?: string;
  refreshExpiresAt?: string;
}

const KEYS = {
  user: "auth:user",
  accessToken: "auth:accessToken",
  accessExpiresAt: "auth:accessExpiresAt",
  /** Cleared on hydrate — legacy localStorage refresh secrets. */
  refreshToken: "auth:refreshToken",
  hasSession: "auth:hasSession",
} as const;

const CREDENTIALS = { credentials: "include" as const };

/** Normalize legacy cached AuthUser shapes missing locale / moneyCurrency / name. */
function normalizeAuthUser(raw: AuthUser): AuthUser {
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

/**
 * Public routes (`/`, `/feed`) are selectively SSR'd for Google. Auth still
 * hydrates on the client, so the server always renders the guest chrome.
 * `sessionUiReady` stays false until after client mount on those pages so
 * hydration matches; SPA routes mark it ready immediately.
 */
export const useAuth = () => {
  const user = useState<AuthUser | null>("auth:user", () => null);
  const accessToken = useState<string | null>("auth:accessToken", () => null);
  const accessExpiresAt = useState<string | null>(
    "auth:accessExpiresAt",
    () => null,
  );
  /** True when we believe an HttpOnly refresh cookie may still be valid. */
  const hasRefreshSession = useState<boolean>(
    "auth:hasRefreshSession",
    () => false,
  );
  const sessionUiReady = useState<boolean>("auth:sessionUiReady", () => false);

  function persist() {
    if (!import.meta.client) return;
    try {
      const ls = window.localStorage;
      if (user.value) ls.setItem(KEYS.user, JSON.stringify(user.value));
      else ls.removeItem(KEYS.user);
      // Access token stays in memory only — page reload rehydrates via cookie.
      ls.removeItem(KEYS.accessToken);
      ls.removeItem(KEYS.accessExpiresAt);
      ls.removeItem(KEYS.refreshToken);
      if (hasRefreshSession.value) ls.setItem(KEYS.hasSession, "1");
      else ls.removeItem(KEYS.hasSession);
    } catch {
      // Quota errors / privacy modes — non-fatal.
    }
  }

  function hydrateFromStorage() {
    if (!import.meta.client) return;
    try {
      const ls = window.localStorage;
      // Drop any legacy secrets that older builds left behind.
      ls.removeItem(KEYS.accessToken);
      ls.removeItem(KEYS.accessExpiresAt);
      ls.removeItem(KEYS.refreshToken);
      hasRefreshSession.value = ls.getItem(KEYS.hasSession) === "1";
      const u = ls.getItem(KEYS.user);
      const parsed = u ? (JSON.parse(u) as AuthUser) : null;
      if (parsed && typeof parsed.role !== "number") {
        user.value = null;
        ls.removeItem(KEYS.user);
      } else {
        user.value = parsed ? normalizeAuthUser(parsed) : null;
      }
    } catch {
      clearSession();
    }
  }

  function setSession(session: AuthSession) {
    user.value = normalizeAuthUser(session.user);
    accessToken.value = session.accessToken;
    accessExpiresAt.value = session.accessExpiresAt;
    hasRefreshSession.value = true;
    persist();
    // Keep device language aligned with the account (emails use AuthUser.locale).
    if (import.meta.client && isAppLocale(user.value.locale)) {
      try {
        const { update } = useSettings();
        update("locale", user.value.locale);
      } catch {
        // Settings may be unavailable during early boot — non-fatal.
      }
    }
  }

  function clearSession() {
    user.value = null;
    accessToken.value = null;
    accessExpiresAt.value = null;
    hasRefreshSession.value = false;
    persist();
  }

  async function login(email: string, password: string): Promise<AuthUser> {
    const session = await $fetch<AuthSession>("/api/auth/login", {
      method: "POST",
      body: { email, password },
      ...CREDENTIALS,
    });
    setSession(session);
    return session.user;
  }

  async function signup(input: {
    email: string;
    password: string;
    name: string;
    locale?: AppLocale;
  }): Promise<{ user: AuthUser; verificationSent: boolean }> {
    return await $fetch("/api/auth/signup", {
      method: "POST",
      body: input,
      ...CREDENTIALS,
    });
  }

  async function verifyEmail(token: string): Promise<AuthUser> {
    const data = await $fetch<{ ok: boolean; user: AuthUser }>(
      "/api/auth/verify-email",
      { method: "POST", body: { token }, ...CREDENTIALS },
    );
    return data.user;
  }

  async function requestPasswordReset(email: string): Promise<void> {
    await $fetch("/api/auth/forgot-password", {
      method: "POST",
      body: { email },
      ...CREDENTIALS,
    });
  }

  async function resetPassword(token: string, password: string): Promise<void> {
    await $fetch("/api/auth/reset-password", {
      method: "POST",
      body: { token, password },
      ...CREDENTIALS,
    });
  }

  async function refresh(): Promise<AuthSession> {
    try {
      const session = await $fetch<AuthSession>("/api/auth/refresh", {
        method: "POST",
        body: {},
        ...CREDENTIALS,
      });
      setSession(session);
      return session;
    } catch (err) {
      clearSession();
      throw err;
    }
  }

  async function fetchMe(): Promise<AuthUser | null> {
    if (!accessToken.value && !hasRefreshSession.value) return null;
    try {
      const { user: fresh } = await $fetch<{ user: AuthUser }>("/api/auth/me", {
        headers: accessToken.value
          ? { Authorization: `Bearer ${accessToken.value}` }
          : undefined,
        ...CREDENTIALS,
      });
      user.value = normalizeAuthUser(fresh);
      persist();
      if (import.meta.client && isAppLocale(user.value.locale)) {
        try {
          const { update } = useSettings();
          update("locale", user.value.locale);
        } catch {
          // ignore
        }
      }
      return fresh;
    } catch {
      return null;
    }
  }

  async function updateProfile(input: {
    name?: string;
    avatarUploadId?: string | null;
    title?: string | null;
    job?: string | null;
    location?: string | null;
  }): Promise<AuthUser> {
    const { user: fresh } = await $fetch<{ user: AuthUser }>(
      "/api/auth/profile",
      {
        method: "PATCH",
        body: input,
        headers: accessToken.value
          ? { Authorization: `Bearer ${accessToken.value}` }
          : undefined,
        ...CREDENTIALS,
      },
    );
    user.value = normalizeAuthUser(fresh);
    persist();
    return fresh;
  }

  async function updatePreferences(input: {
    locale?: AppLocale;
    moneyCurrency?: import("~/types/money").MoneyCurrency;
  }): Promise<AuthUser> {
    const { user: fresh } = await $fetch<{ user: AuthUser }>(
      "/api/auth/preferences",
      {
        method: "PATCH",
        body: input,
        headers: accessToken.value
          ? { Authorization: `Bearer ${accessToken.value}` }
          : undefined,
        ...CREDENTIALS,
      },
    );
    user.value = normalizeAuthUser(fresh);
    persist();
    return fresh;
  }

  async function logout(opts?: { everywhere?: boolean }) {
    try {
      await $fetch("/api/auth/logout", {
        method: "POST",
        body: { everywhere: opts?.everywhere ?? false },
        headers: accessToken.value
          ? { Authorization: `Bearer ${accessToken.value}` }
          : undefined,
        ...CREDENTIALS,
      });
    } catch {
      // Network errors shouldn't trap the user — destroy local state regardless.
    }
    clearSession();
  }

  const isAuthenticated = computed(() => !!user.value && !!accessToken.value);
  const isAdmin = computed(() => (user.value?.role ?? -1) >= UserRole.Admin);
  const isSuperAdmin = computed(() => user.value?.role === UserRole.Superadmin);

  /** Template-safe auth flags — false until session UI is allowed to paint. */
  const isAuthenticatedUi = computed(
    () => sessionUiReady.value && isAuthenticated.value,
  );
  const isAdminUi = computed(() => sessionUiReady.value && isAdmin.value);
  const userUi = computed(() => (sessionUiReady.value ? user.value : null));

  function markSessionUiReady() {
    sessionUiReady.value = true;
  }

  return {
    user,
    accessToken,
    accessExpiresAt,
    hasRefreshSession,
    sessionUiReady,
    isAuthenticated,
    isAuthenticatedUi,
    isAdmin,
    isAdminUi,
    isSuperAdmin,
    userUi,
    hydrateFromStorage,
    markSessionUiReady,
    setSession,
    clearSession,
    login,
    signup,
    verifyEmail,
    requestPasswordReset,
    resetPassword,
    refresh,
    fetchMe,
    updateProfile,
    updatePreferences,
    logout,
  };
};
