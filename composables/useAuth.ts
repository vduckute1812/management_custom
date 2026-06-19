import { UserRole, type AuthUser } from "~/types/task";

/**
 * Auth state for the client. Owns:
 *   - the cached AuthUser
 *   - the short-lived access token (in memory + mirrored to localStorage so
 *     a page refresh doesn't log the user out for 15 minutes)
 *   - the long-lived refresh token (localStorage only — never sent on every
 *     request, only when explicitly refreshing or logging out)
 *
 * localStorage is the pragmatic choice for a single-user local app — it
 * matches the rest of the project's "your data lives on your machine" model.
 * Anyone hardening this for multi-tenant production should move the refresh
 * token into an HttpOnly cookie instead.
 */
export interface AuthSession {
  user: AuthUser;
  accessToken: string;
  accessExpiresAt: string;
  refreshToken: string;
  refreshExpiresAt: string;
}

const KEYS = {
  user: "auth:user",
  accessToken: "auth:accessToken",
  accessExpiresAt: "auth:accessExpiresAt",
  refreshToken: "auth:refreshToken",
} as const;

export const useAuth = () => {
  const user = useState<AuthUser | null>("auth:user", () => null);
  const accessToken = useState<string | null>("auth:accessToken", () => null);
  const accessExpiresAt = useState<string | null>(
    "auth:accessExpiresAt",
    () => null
  );
  const refreshToken = useState<string | null>("auth:refreshToken", () => null);

  function persist() {
    if (!import.meta.client) return;
    try {
      const ls = window.localStorage;
      if (user.value) ls.setItem(KEYS.user, JSON.stringify(user.value));
      else ls.removeItem(KEYS.user);
      if (accessToken.value) ls.setItem(KEYS.accessToken, accessToken.value);
      else ls.removeItem(KEYS.accessToken);
      if (accessExpiresAt.value)
        ls.setItem(KEYS.accessExpiresAt, accessExpiresAt.value);
      else ls.removeItem(KEYS.accessExpiresAt);
      if (refreshToken.value) ls.setItem(KEYS.refreshToken, refreshToken.value);
      else ls.removeItem(KEYS.refreshToken);
    } catch {
      // Quota errors / privacy modes — non-fatal; session just won't survive
      // a reload, which is acceptable degradation.
    }
  }

  function hydrateFromStorage() {
    if (!import.meta.client) return;
    try {
      const ls = window.localStorage;
      accessToken.value = ls.getItem(KEYS.accessToken);
      accessExpiresAt.value = ls.getItem(KEYS.accessExpiresAt);
      refreshToken.value = ls.getItem(KEYS.refreshToken);
      const u = ls.getItem(KEYS.user);
      const parsed = u ? (JSON.parse(u) as AuthUser) : null;
      // Legacy compat: pre-int-enum clients persisted `role` as a string
      // ("admin" / "normal" / "superadmin"). Drop the cached user in that
      // case so the next `/api/auth/me` refresh re-seeds with the new shape.
      // The refresh token still works (it's opaque), so the user stays
      // signed in across this format upgrade.
      if (parsed && typeof parsed.role !== "number") {
        user.value = null;
        ls.removeItem(KEYS.user);
      } else {
        user.value = parsed;
      }
    } catch {
      clearSession();
    }
  }

  function setSession(session: AuthSession) {
    user.value = session.user;
    accessToken.value = session.accessToken;
    accessExpiresAt.value = session.accessExpiresAt;
    refreshToken.value = session.refreshToken;
    persist();
  }

  function clearSession() {
    user.value = null;
    accessToken.value = null;
    accessExpiresAt.value = null;
    refreshToken.value = null;
    persist();
  }

  async function login(email: string, password: string): Promise<AuthUser> {
    const session = await $fetch<AuthSession>("/api/auth/login", {
      method: "POST",
      body: { email, password },
    });
    setSession(session);
    return session.user;
  }

  async function signup(input: {
    email: string;
    password: string;
    name?: string;
  }): Promise<{ user: AuthUser; verificationSent: boolean }> {
    return await $fetch("/api/auth/signup", {
      method: "POST",
      body: input,
    });
  }

  async function verifyEmail(token: string): Promise<AuthUser> {
    const data = await $fetch<{ ok: boolean; user: AuthUser }>(
      "/api/auth/verify-email",
      { method: "POST", body: { token } }
    );
    return data.user;
  }

  async function refresh(): Promise<AuthSession> {
    if (!refreshToken.value) {
      throw createError({
        statusCode: 401,
        statusMessage: "No refresh token available",
      });
    }
    const session = await $fetch<AuthSession>("/api/auth/refresh", {
      method: "POST",
      body: { refreshToken: refreshToken.value },
    });
    setSession(session);
    return session;
  }

  async function fetchMe(): Promise<AuthUser | null> {
    if (!accessToken.value) return null;
    try {
      const { user: fresh } = await $fetch<{ user: AuthUser }>(
        "/api/auth/me",
        {
          headers: { Authorization: `Bearer ${accessToken.value}` },
        }
      );
      user.value = fresh;
      persist();
      return fresh;
    } catch {
      return null;
    }
  }

  async function logout(opts?: { everywhere?: boolean }) {
    const rt = refreshToken.value;
    try {
      await $fetch("/api/auth/logout", {
        method: "POST",
        body: { refreshToken: rt, everywhere: opts?.everywhere ?? false },
        headers: accessToken.value
          ? { Authorization: `Bearer ${accessToken.value}` }
          : undefined,
      });
    } catch {
      // Network errors shouldn't trap the user — destroy local state regardless.
    }
    clearSession();
  }

  const isAuthenticated = computed(
    () => !!user.value && !!accessToken.value
  );
  const isAdmin = computed(() => (user.value?.role ?? -1) >= UserRole.Admin);
  const isSuperAdmin = computed(
    () => user.value?.role === UserRole.Superadmin
  );

  return {
    user,
    accessToken,
    accessExpiresAt,
    refreshToken,
    isAuthenticated,
    isAdmin,
    isSuperAdmin,
    hydrateFromStorage,
    setSession,
    clearSession,
    login,
    signup,
    verifyEmail,
    refresh,
    fetchMe,
    logout,
  };
};
