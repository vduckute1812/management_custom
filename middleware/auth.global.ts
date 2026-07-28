/**
 * Global route guard.
 *
 *   - Public paths (/, /feed, login / signup / verify-email) are always
 *     accessible without a session. Authenticated users hitting /login or
 *     /signup are bounced to "/" (or `?redirect=` if present).
 *   - Protected app sections (tasks, settings, admin, …) require an
 *     authenticated session; unauth users get bounced to /login with a
 *     `redirect` query so we can return them.
 *   - /admin requires `role: admin`; non-admins land on /.
 *
 * `/` and `/feed` are selectively SSR'd (see nuxt.config.ts); other app
 * routes stay client-only. The `auth.client.ts` plugin awaits its
 * hydrate/refresh work before the app mounts, so by the time this
 * middleware runs on protected SPA routes `isAuthenticated` is already
 * correct — no flash of /login for users with a valid session.
 */
const PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/signup",
  "/verify-email",
  "/forgot-password",
  "/reset-password",
]);
const AUTH_FORM_PATHS = new Set(["/login", "/signup", "/forgot-password"]);

function isPublicPath(path: string): boolean {
  if (PUBLIC_PATHS.has(path)) return true;
  // Feed is browseable anonymously; writing / editing requires a session.
  if (path === "/feed/write") return false;
  if (path.startsWith("/feed/edit")) return false;
  if (path === "/feed" || path.startsWith("/feed/")) return true;
  return false;
}

export default defineNuxtRouteMiddleware((to) => {
  const auth = useAuth();

  if (isPublicPath(to.path)) {
    if (auth.isAuthenticated.value && AUTH_FORM_PATHS.has(to.path)) {
      const redirect = (to.query.redirect as string) || "/";
      return navigateTo(redirect, { replace: true });
    }
    return;
  }

  if (!auth.isAuthenticated.value) {
    return navigateTo({
      path: "/login",
      query: { redirect: to.fullPath },
    });
  }

  if (to.path.startsWith("/admin") && !auth.isAdmin.value) {
    if (import.meta.client) {
      const { pushToast } = useToasts();
      // Middleware has no Vue setup instance — useI18n() throws prod "26".
      const { t } = useSafeI18n();
      queueMicrotask(() => {
        pushToast(t("auth.adminAccessRequired"), {
          tone: "danger",
          duration: 3200,
        });
      });
    }
    return navigateTo("/");
  }
});
