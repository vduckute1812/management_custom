/**
 * `apiFetch` is the project-wide replacement for `$fetch` inside the app
 * code. It:
 *
 *   - Attaches `Authorization: Bearer <accessToken>` when a token is set.
 *   - Sends credentials so HttpOnly auth cookies travel with the request.
 *   - Proactively refreshes the access token when it's <30s from expiry,
 *     to keep the next call from making a wasted 401 round-trip.
 *   - On a 401 from the server, attempts ONE refresh-and-retry. If that
 *     also fails, the session is cleared and the user is bounced to /login
 *     with a `redirect` query so we can come back after they re-auth.
 *   - Coalesces identical in-flight client GETs (same method + url + query)
 *     so bursts share one network call — without delaying the first request.
 *
 * A single in-flight refresh promise is shared across concurrent callers so
 * a burst of expired-token requests only triggers one refresh.
 */
import { requestKey } from "~/utils/apiRequestKey";

type ApiFetchOptions = Record<string, unknown> & {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  body?: unknown;
  query?: Record<string, unknown>;
  headers?: HeadersInit;
  credentials?: RequestCredentials;
};

let _refreshInFlight: Promise<unknown> | null = null;
const _inFlight = new Map<string, Promise<unknown>>();

function isAbsolute(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export const useApi = () => {
  const auth = useAuth();
  const route = useRoute();

  function withAuthHeaders(
    options: ApiFetchOptions | undefined,
    token: string | null,
  ): ApiFetchOptions {
    const next: ApiFetchOptions = {
      credentials: "include",
      ...(options ?? {}),
    };
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
    if (!auth.hasRefreshSession.value) return;
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

  async function doFetch<T>(
    url: string,
    options: ApiFetchOptions | undefined,
  ): Promise<T> {
    await ensureFreshAccessToken();

    try {
      return (await $fetch(
        url,
        withAuthHeaders(options, auth.accessToken.value) as Parameters<
          typeof $fetch
        >[1],
      )) as T;
    } catch (err: unknown) {
      const status =
        (err as { status?: number; statusCode?: number })?.status ??
        (err as { statusCode?: number })?.statusCode;
      if (status !== 401) {
        throw err;
      }
      // Anonymous callers (no session) must not be bounced to /login — public
      // pages like / and /feed call optional-auth endpoints that 401 for guests
      // (e.g. stories). Only clear+redirect when we actually had a session.
      if (!auth.hasRefreshSession.value) {
        if (auth.accessToken.value || auth.user.value) {
          await bounceToLogin();
        }
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
        withAuthHeaders(options, auth.accessToken.value) as Parameters<
          typeof $fetch
        >[1],
      )) as T;
    }
  }

  async function apiFetch<T = unknown>(
    url: string,
    options?: ApiFetchOptions,
  ): Promise<T> {
    if (!isAbsolute(url) && !url.startsWith("/")) {
      url = `/${url}`;
    }

    // Coalesce maps are process-global — unsafe across concurrent SSR users.
    // FormData uploads must not coalesce: identical URL + method would return
    // the wrong file's response when several uploads run in parallel.
    const isMultipart =
      typeof FormData !== "undefined" && options?.body instanceof FormData;
    if (import.meta.server || isMultipart) {
      return doFetch<T>(url, options);
    }

    const method = (options?.method ?? "GET").toUpperCase();
    const key = requestKey(url, method, options?.query);

    const existing = _inFlight.get(key);
    if (existing) {
      return existing as Promise<T>;
    }

    const run = doFetch<T>(url, options);
    _inFlight.set(key, run);
    try {
      return await run;
    } finally {
      _inFlight.delete(key);
    }
  }

  return { apiFetch };
};
