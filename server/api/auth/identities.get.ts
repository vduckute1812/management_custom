/**
 * GET /api/auth/identities — linked OAuth providers for the current user.
 */
import { AuthProvider } from "~/types/auth";
import { getUserById, listIdentitiesForUser } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";

export default defineEventHandler(async (event) => {
  const claims = requireUser(event);
  const user = await getUserById(claims.sub);
  if (!user) {
    throw createError({ statusCode: 404, statusMessage: "User not found" });
  }
  const identities = await listIdentitiesForUser(user.id);
  return {
    providers: identities.map((i) => i.provider),
    googleLinked: identities.some((i) => i.provider === AuthProvider.Google),
    hasPassword: Boolean(user.passwordHash),
  };
});
