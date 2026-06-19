/**
 * Hydrates auth state from localStorage at app start (client only).
 *
 * If the access token is past its expiry we eagerly call `/auth/refresh` so
 * the very first protected request doesn't take the 401-then-retry path.
 * If both tokens fail to validate, we end up with a clean unauthenticated
 * state and the global middleware will redirect to /login on the next nav.
 */
export default defineNuxtPlugin(async () => {
  const auth = useAuth();
  auth.hydrateFromStorage();

  if (!auth.refreshToken.value) {
    auth.clearSession();
    return;
  }

  // Either probe with the cached access token, or refresh outright if we
  // know it's expired. `fetchMe` is a no-op when there's no token.
  const expiresAt = auth.accessExpiresAt.value
    ? new Date(auth.accessExpiresAt.value).getTime()
    : 0;
  const needsRefresh = !auth.accessToken.value || expiresAt - Date.now() < 30_000;

  if (needsRefresh) {
    try {
      await auth.refresh();
    } catch {
      auth.clearSession();
      return;
    }
  }

  try {
    const me = await auth.fetchMe();
    if (!me) {
      auth.clearSession();
    }
  } catch {
    auth.clearSession();
  }
});
