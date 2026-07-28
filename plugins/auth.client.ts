/**
 * Hydrates auth state from localStorage at app start (client only).
 *
 * If the access token is past its expiry we eagerly call `/auth/refresh` so
 * the very first protected request doesn't take the 401-then-retry path.
 * If both tokens fail to validate, we end up with a clean unauthenticated
 * state. Public routes (/, /feed, …) remain reachable; protected routes are
 * gated by `middleware/auth.global.ts`.
 *
 * Session chrome (`isAuthenticatedUi`) is deferred on selectively SSR'd
 * public paths so the guest HTML Google (and the hydrator) see matches.
 */
function isSelectiveSsrPath(path: string): boolean {
  if (path === "/") return true;
  if (path === "/feed") return true;
  return false;
}

export default defineNuxtPlugin(async (nuxtApp) => {
  const auth = useAuth();
  const route = useRoute();
  auth.hydrateFromStorage();

  if (!auth.refreshToken.value) {
    auth.clearSession();
  } else {
    // Either probe with the cached access token, or refresh outright if we
    // know it's expired. `fetchMe` is a no-op when there's no token.
    const expiresAt = auth.accessExpiresAt.value
      ? new Date(auth.accessExpiresAt.value).getTime()
      : 0;
    const needsRefresh =
      !auth.accessToken.value || expiresAt - Date.now() < 30_000;

    if (needsRefresh) {
      try {
        await auth.refresh();
      } catch {
        auth.clearSession();
      }
    }

    if (auth.refreshToken.value) {
      try {
        const me = await auth.fetchMe();
        if (!me) {
          auth.clearSession();
        }
      } catch {
        auth.clearSession();
      }
    }
  }

  if (isSelectiveSsrPath(route.path)) {
    nuxtApp.hook("app:mounted", () => {
      auth.markSessionUiReady();
    });
  } else {
    auth.markSessionUiReady();
  }
});
