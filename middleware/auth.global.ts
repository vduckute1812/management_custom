/**
 * Global route guard.
 *
 *   - Public paths (login / signup / verify-email) are always accessible to
 *     unauthenticated users. Authenticated users hitting /login or /signup are
 *     bounced to "/" (or `?redirect=` if present) — no point showing a sign-in
 *     form to someone who's already signed in.
 *   - Everything else requires an authenticated session; unauth users get
 *     bounced to /login with a `redirect` query so we can return them.
 *   - /admin requires `role: admin`; non-admins land on /.
 *
 * The app runs in SPA mode (see nuxt.config.ts), so this only fires on the
 * client. The `auth.client.ts` plugin awaits its hydrate/refresh work before
 * the app mounts, so by the time this middleware runs `isAuthenticated` is
 * already correct — no flash of /login for users with a valid session.
 */
const PUBLIC_PATHS = new Set(["/login", "/signup", "/verify-email"]);
const AUTH_FORM_PATHS = new Set(["/login", "/signup"]);

export default defineNuxtRouteMiddleware((to) => {
  const auth = useAuth();

  if (PUBLIC_PATHS.has(to.path)) {
    if (auth.isAuthenticated.value && AUTH_FORM_PATHS.has(to.path)) {
      const redirect = (to.query.redirect as string) || "/";
      return navigateTo(redirect, { replace: true });
    }
    return;
  }

  if (!auth.isAuthenticated.value) {
    return navigateTo({
      path: "/login",
      query: to.fullPath === "/" ? undefined : { redirect: to.fullPath },
    });
  }

  if (to.path.startsWith("/admin") && !auth.isAdmin.value) {
    return navigateTo("/");
  }
});
