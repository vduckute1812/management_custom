/**
 * GET /api/auth/me
 *
 * Reply: { user: AuthUser }
 *
 * Returns the currently-authenticated user as the server sees them. Useful
 * for hydrating the client on a fresh page load and re-validating role
 * (which the JWT carries but the server should always confirm against the
 * latest row).
 */
import { getUserById, toAuthUser } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";

export default defineEventHandler(async (event) => {
  const claims = requireUser(event);
  const user = await getUserById(claims.sub);
  if (!user) {
    throw createError({ statusCode: 404, statusMessage: "User not found" });
  }
  return { user: toAuthUser(user) };
});
