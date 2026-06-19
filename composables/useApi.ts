/**
 * `apiFetch` is the project-wide replacement for `$fetch` inside the app
 * code. It:
 *
 *   - Attaches `Authorization: Bearer <accessToken>` when a token is set.
 *   - Proactively refreshes the access token when it's <30s from expiry,
 *     to keep the next call from making a wasted 401 round-trip.
 *   - On a 401 from the server, attempts ONE refresh-and-retry. If that
 *     also fails, the session is cleared and the user is bounced to /login
 *     with a `redirect` query so we can come back after they re-auth.
 *
 * A single in-flight refresh promise is shared across concurrent callers so
 * a burst of expired-token requests only triggers one refresh.
 */
// Loose options bag — we don't extend ofetch's FetchOptions here because
// its generic constraints (in particular on `body`) make wrapping awkward;
// we just shovel options through and let `$fetch` validate them at the
// call site. This sacrifices a bit of compile-time strictness for a
// dramatically simpler signature at every call site.
type ApiFetchOptions = Record<string, unknown> & {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  body?: unknown;
  headers?: HeadersInit;
};

let _refreshInFlight: Promise<unknown> | null = null;

function isAbsolute(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export const useApi = () => {
  const auth = useAuth();
  const route = useRoute();

  function withAuthHeaders(
    options: ApiFetchOptions | undefined,
    token: string | null
  ): ApiFetchOptions {
    const next: ApiFetchOptions = { ...(options ?? {}) };
    if (token) {
      const headers = new Headers(next.headers);
      headers.set("Authorization", `Bearer ${token}`);
      next.headers = headers;
    }
    return next;
  }

  async function ensureFreshAccessToken() {
    if (!auth.accessToken.value || !auth.accessExpiresAt.value) return;
    const expiresAt = new Date(auth.accessExpiresAt.value).getTime();
    if (Number.isNaN(expiresAt)) return;
    if (expiresAt - Date.now() > 30_000) return;
    if (!auth.refreshToken.value) return;
    if (!_refreshInFlight) {
      _refreshInFlight = auth.refresh().finally(() => {
        _refreshInFlight = null;
      });
    }
    try {
      await _refreshInFlight;
    } catch {
      // Swallow — call site will hit the 401 path next.
    }
  }

  async function bounceToLogin() {
    auth.clearSession();
    if (!route.path.startsWith("/login")) {
      await navigateTo({
        path: "/login",
        query: { redirect: route.fullPath },
      });
    }
  }

  async function apiFetch<T = unknown>(
    url: string,
    options?: ApiFetchOptions
  ): Promise<T> {
    if (!isAbsolute(url) && !url.startsWith("/")) {
      url = `/${url}`;
    }
    await ensureFreshAccessToken();

    try {
      return (await $fetch(
        url,
        withAuthHeaders(options, auth.accessToken.value) as Parameters<typeof $fetch>[1]
      )) as T;
    } catch (err: unknown) {
      const status =
        (err as { status?: number; statusCode?: number })?.status ??
        (err as { statusCode?: number })?.statusCode;
      if (status !== 401) {
        throw err;
      }
      if (!auth.refreshToken.value) {
        await bounceToLogin();
        throw err;
      }
      try {
        if (!_refreshInFlight) {
          _refreshInFlight = auth.refresh().finally(() => {
            _refreshInFlight = null;
          });
        }
        await _refreshInFlight;
      } catch {
        await bounceToLogin();
        throw err;
      }
      return (await $fetch(
        url,
        withAuthHeaders(options, auth.accessToken.value) as Parameters<typeof $fetch>[1]
      )) as T;
    }
  }

  return { apiFetch };
};
