/**
 * GET /api/auth/google — start Google OAuth (login/signup or account link).
 *
 * Query: intent=login|link (default login), redirect=/path
 * Link intent requires an authenticated session.
 */
import { AuthOAuthIntent } from "../../../../types/auth";
import { getOptionalUser } from "~/server/utils/authContext";
import {
  buildGoogleAuthorizeUrl,
  createOAuthState,
  getGoogleOAuthConfig,
  parseIntentQuery,
  safeOAuthRedirect,
  setOAuthStateCookie,
} from "~/server/utils/googleOAuth";

export default defineEventHandler(async (event) => {
  const config = getGoogleOAuthConfig();
  if (!config) {
    throw createError({
      statusCode: 503,
      statusMessage: "Google sign-in is not configured",
    });
  }

  const query = getQuery(event);
  const intent = parseIntentQuery(query.intent);
  const redirect = safeOAuthRedirect(query.redirect);

  let userId: string | undefined;
  if (intent === AuthOAuthIntent.Link) {
    const claims = getOptionalUser(event);
    if (!claims) {
      throw createError({
        statusCode: 401,
        statusMessage: "Sign in to link Google",
      });
    }
    userId = claims.sub;
  }

  const { state, nonce } = createOAuthState({ intent, redirect, userId });
  setOAuthStateCookie(event, nonce);
  return sendRedirect(event, buildGoogleAuthorizeUrl(config, state), 302);
});
