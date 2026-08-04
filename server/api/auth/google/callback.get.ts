/**
 * GET /api/auth/google/callback — Google OAuth redirect handler.
 */
import { completeGoogleOAuthCallback } from "~/server/services/authService";

export default defineEventHandler(async (event) => {
  const dest = await completeGoogleOAuthCallback(event);
  return sendRedirect(event, dest, 302);
});
