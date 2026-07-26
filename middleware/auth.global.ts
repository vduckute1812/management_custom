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
 * The app runs in SPA mode (see nuxt.config.ts), so this only fires on the
 * client. The `auth.client.ts` plugin awaits its hydrate/refresh work before
 * the app mounts, so by the time this middleware runs `isAuthenticated` is
 * already correct — no flash of /login for users with a valid session.
 */
const PUBLIC_PATHS = new Set(["/", "/login", "/signup", "/verify-email"]);
const AUTH_FORM_PATHS = new Set(["/login", "/signup"]);

function isPublicPath(path: string): boolean {
  if (PUBLIC_PATHS.has(path)) return true;
  // Feed (and nested feed routes) are browseable anonymously; public posts
  // are served by the API without auth. Mutations still require a session.
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
      const { t } = useI18n();
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
