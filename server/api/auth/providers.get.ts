/**
 * GET /api/auth/providers — which social login buttons the client may show.
 */
import { isGoogleOAuthConfigured } from "~/server/utils/googleOAuth";

export default defineEventHandler(() => {
  return {
    google: isGoogleOAuthConfigured(),
  };
});
