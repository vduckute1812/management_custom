/**
 * Hydrates auth state at app start (client only).
 *
 * Refresh secrets live in the HttpOnly `mgmt_rt` cookie. When
 * `auth:hasSession` is set (or a cached user exists), we POST `/api/auth/refresh`
 * with credentials to restore the in-memory access token.
 *
 * One-time migration: if an older build left `auth:refreshToken` in
 * localStorage, send it in the refresh body once so the server can mint the
 * HttpOnly cookie, then wipe the local secret.
 *
 * Session chrome (`isAuthenticatedUi`) is deferred on selectively SSR'd
 * public paths so the guest HTML Google (and the hydrator) see matches.
 */
function isSelectiveSsrPath(path: string): boolean {
  if (path === "/") return true;
  if (path === "/feed") return true;
  return false;
}

function takeLegacyRefreshToken(): string | null {
  if (!import.meta.client) return null;
  try {
    const ls = window.localStorage;
    const legacy = ls.getItem("auth:refreshToken");
    if (legacy) ls.removeItem("auth:refreshToken");
    return legacy && legacy.trim() ? legacy.trim() : null;
  } catch {
    return null;
  }
}

export default defineNuxtPlugin(async (nuxtApp) => {
  const auth = useAuth();
  const route = useRoute();
  const legacyRefresh = takeLegacyRefreshToken();
  auth.hydrateFromStorage();

  const shouldTryRefresh =
    Boolean(legacyRefresh) ||
    auth.hasRefreshSession.value ||
    Boolean(auth.user.value);

  if (shouldTryRefresh) {
    try {
      if (legacyRefresh) {
        // Body fallback still accepted by /api/auth/refresh; sets cookies.
        const session = await $fetch<
          import("~/composables/useAuth").AuthSession
        >("/api/auth/refresh", {
          method: "POST",
          body: { refreshToken: legacyRefresh },
          credentials: "include",
        });
        auth.setSession(session);
      } else {
        await auth.refresh();
      }
      const me = await auth.fetchMe();
      if (!me) {
        auth.clearSession();
      }
    } catch {
      auth.clearSession();
    }
  } else {
    auth.clearSession();
  }

  if (isSelectiveSsrPath(route.path)) {
    nuxtApp.hook("app:mounted", () => {
      auth.markSessionUiReady();
    });
  } else {
    auth.markSessionUiReady();
  }
});
