import { UserRole, type AuthUser } from "~/types/task";
import { isAppLocale, type AppLocale } from "~/types/locale";
import {
  hydrateAuthFromStorage,
  normalizeAuthUser,
  persistAuthSession,
  type AuthSession,
} from "~/composables/account/authSessionStorage";
import * as authApi from "~/composables/account/authApi";

export type { AuthSession } from "~/composables/account/authSessionStorage";

/**
 * Auth state for the client. Owns:
 *   - the cached AuthUser (localStorage — non-secret profile chrome)
 *   - the short-lived access token in memory (mirrored briefly for Bearer
 *     headers; also set as HttpOnly `mgmt_at` for media)
 *   - refresh lives ONLY in the HttpOnly `mgmt_rt` cookie — never localStorage
 *
 * On boot the client POSTs `/api/auth/refresh` with credentials; a valid
 * cookie restores the session without a refresh secret in JS.
 *
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
    persistAuthSession({
      user: user.value,
      hasRefreshSession: hasRefreshSession.value,
    });
  }

  function hydrateFromStorage() {
    if (!import.meta.client) return;
    try {
      const hydrated = hydrateAuthFromStorage();
      hasRefreshSession.value = hydrated.hasRefreshSession;
      user.value = hydrated.user;
    } catch {
      clearSession();
    }
  }

  function applyAccountLocale(locale: AuthUser["locale"]) {
    if (import.meta.client && isAppLocale(locale)) {
      try {
        const { update } = useSettings();
        update("locale", locale);
      } catch {
        // Settings may be unavailable during early boot — non-fatal.
      }
    }
  }

  function setSession(session: AuthSession) {
    user.value = normalizeAuthUser(session.user);
    accessToken.value = session.accessToken;
    accessExpiresAt.value = session.accessExpiresAt;
    hasRefreshSession.value = true;
    persist();
    applyAccountLocale(user.value.locale);
  }

  function clearSession() {
    user.value = null;
    accessToken.value = null;
    accessExpiresAt.value = null;
    hasRefreshSession.value = false;
    persist();
  }

  async function login(email: string, password: string): Promise<AuthUser> {
    const session = await authApi.authLogin(email, password);
    setSession(session);
    return session.user;
  }

  async function signup(input: {
    email: string;
    password: string;
    name: string;
    locale?: AppLocale;
  }): Promise<{ user: AuthUser; verificationSent: boolean }> {
    return await authApi.authSignup(input);
  }

  async function verifyEmail(token: string): Promise<AuthUser> {
    return await authApi.authVerifyEmail(token);
  }

  async function requestPasswordReset(email: string): Promise<void> {
    await authApi.authRequestPasswordReset(email);
  }

  async function resetPassword(token: string, password: string): Promise<void> {
    await authApi.authResetPassword(token, password);
  }

  async function refresh(): Promise<AuthSession> {
    try {
      const session = await authApi.authRefresh();
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
      const fresh = await authApi.authFetchMe(accessToken.value);
      user.value = normalizeAuthUser(fresh);
      persist();
      applyAccountLocale(user.value.locale);
      return fresh;
    } catch (error: unknown) {
      console.warn(
        "[auth] Could not refresh the current user:",
        error instanceof Error ? error.message : "Unknown error",
      );
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
    const fresh = await authApi.authUpdateProfile(accessToken.value, input);
    user.value = normalizeAuthUser(fresh);
    persist();
    return fresh;
  }

  async function updatePreferences(input: {
    locale?: AppLocale;
    moneyCurrency?: import("~/types/money").MoneyCurrency;
  }): Promise<AuthUser> {
    const fresh = await authApi.authUpdatePreferences(accessToken.value, input);
    user.value = normalizeAuthUser(fresh);
    persist();
    return fresh;
  }

  async function logout(opts?: { everywhere?: boolean }) {
    try {
      await authApi.authLogout(accessToken.value, opts);
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
