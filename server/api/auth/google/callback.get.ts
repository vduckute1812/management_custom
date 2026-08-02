/**
 * GET /api/auth/google/callback — Google OAuth redirect handler.
 */
import { AuthOAuthIntent } from "../../../../types/auth";
import { issueAuthSession } from "~/server/utils/authSession";
import {
  clearOAuthStateCookie,
  exchangeGoogleCode,
  fetchGoogleProfile,
  getGoogleOAuthConfig,
  parseOAuthState,
  readOAuthStateCookie,
  safeOAuthRedirect,
} from "~/server/utils/googleOAuth";
import { resolveGoogleOAuthUser } from "~/server/utils/googleOAuthUser";

function failRedirect(
  intent: (typeof AuthOAuthIntent)[keyof typeof AuthOAuthIntent] | null,
  code: string,
): string {
  const path = intent === AuthOAuthIntent.Link ? "/settings" : "/login";
  const url = new URL(path, "http://local.invalid");
  url.searchParams.set("oauth_error", code);
  return `${url.pathname}?${url.searchParams.toString()}`;
}

/** After login/signup OAuth: hydrate client session from cookies. */
function continueRedirect(redirect: string): string {
  const dest = safeOAuthRedirect(redirect, "/");
  const url = new URL("/auth/continue", "http://local.invalid");
  url.searchParams.set("redirect", dest);
  return `${url.pathname}?${url.searchParams.toString()}`;
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const stateRaw = typeof query.state === "string" ? query.state : "";
  const stateHint = stateRaw ? parseOAuthState(stateRaw) : null;

  const config = getGoogleOAuthConfig();
  if (!config) {
    clearOAuthStateCookie(event);
    return sendRedirect(
      event,
      failRedirect(stateHint?.intent ?? null, "config"),
      302,
    );
  }

  const err = typeof query.error === "string" ? query.error : "";
  if (err) {
    clearOAuthStateCookie(event);
    return sendRedirect(
      event,
      failRedirect(stateHint?.intent ?? null, "denied"),
      302,
    );
  }

  const code = typeof query.code === "string" ? query.code : "";
  const cookieNonce = readOAuthStateCookie(event);
  clearOAuthStateCookie(event);

  const state = stateHint;
  if (!state || !cookieNonce || state.nonce !== cookieNonce) {
    return sendRedirect(event, failRedirect(null, "state"), 302);
  }

  if (!code) {
    return sendRedirect(event, failRedirect(state.intent, "denied"), 302);
  }

  try {
    const accessToken = await exchangeGoogleCode(config, code);
    const profile = await fetchGoogleProfile(accessToken);
    const user = await resolveGoogleOAuthUser({
      profile,
      intent: state.intent,
      linkUserId: state.userId,
    });
    await issueAuthSession(event, user);

    if (state.intent === AuthOAuthIntent.Link) {
      const dest = safeOAuthRedirect(state.redirect, "/settings");
      const url = new URL(
        dest.startsWith("/settings") ? dest : "/settings",
        "http://local.invalid",
      );
      url.searchParams.set("linked", "google");
      return sendRedirect(
        event,
        `${url.pathname}?${url.searchParams.toString()}`,
        302,
      );
    }

    return sendRedirect(event, continueRedirect(state.redirect), 302);
  } catch (e: unknown) {
    const status = (e as { statusCode?: number }).statusCode;
    const msg = (e as { statusMessage?: string }).statusMessage ?? "";
    console.error("[google-oauth] callback failed", status, msg, e);
    let codeKey = "failed";
    if (status === 409) codeKey = "conflict";
    else if (status === 403) codeKey = "email";
    else if (status === 401) codeKey = "auth";
    else if (status === 502) codeKey = "google";
    return sendRedirect(event, failRedirect(state.intent, codeKey), 302);
  }
});
