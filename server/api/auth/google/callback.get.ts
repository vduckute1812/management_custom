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

function failRedirect(redirectBase: string, code: string): string {
  const path = redirectBase.startsWith("/settings") ? "/settings" : "/login";
  const url = new URL(path, "http://local.invalid");
  url.searchParams.set("oauth_error", code);
  return `${url.pathname}?${url.searchParams.toString()}`;
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const config = getGoogleOAuthConfig();
  if (!config) {
    clearOAuthStateCookie(event);
    return sendRedirect(event, failRedirect("/login", "config"), 302);
  }

  const err = typeof query.error === "string" ? query.error : "";
  if (err) {
    clearOAuthStateCookie(event);
    return sendRedirect(event, failRedirect("/login", "denied"), 302);
  }

  const code = typeof query.code === "string" ? query.code : "";
  const stateRaw = typeof query.state === "string" ? query.state : "";
  const cookieNonce = readOAuthStateCookie(event);
  clearOAuthStateCookie(event);

  const state = stateRaw ? parseOAuthState(stateRaw) : null;
  if (!state || !cookieNonce || state.nonce !== cookieNonce) {
    return sendRedirect(event, failRedirect("/login", "state"), 302);
  }

  if (!code) {
    return sendRedirect(event, failRedirect(state.redirect, "denied"), 302);
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

    return sendRedirect(event, safeOAuthRedirect(state.redirect, "/"), 302);
  } catch (e: unknown) {
    const status = (e as { statusCode?: number }).statusCode;
    const msg = (e as { statusMessage?: string }).statusMessage ?? "";
    console.error("[google-oauth] callback failed", status, msg, e);
    let codeKey = "failed";
    if (status === 409) codeKey = "conflict";
    else if (status === 403) codeKey = "email";
    else if (status === 401) codeKey = "auth";
    const bounce =
      state.intent === AuthOAuthIntent.Link ? "/settings" : "/login";
    return sendRedirect(event, failRedirect(bounce, codeKey), 302);
  }
});
