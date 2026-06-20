/**
 * DELETE /api/admin/users/:id  — superadmin only
 *
 * Permanently removes a user and all of their data (epics, tasks, tokens,
 * etc. cascade via FK constraints). Guard rails:
 *   - Only the install superadmin may call this.
 *   - The superadmin account itself cannot be deleted.
 *   - You cannot delete your own account while signed in.
 */
import { UserRole, deleteUser, getUserById } from "~/server/utils/db";
import { requireSuperAdmin } from "~/server/utils/authContext";

export default defineEventHandler(async (event) => {
  const actor = requireSuperAdmin(event);
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Missing user id" });
  }

  if (id === actor.sub) {
    throw createError({
      statusCode: 400,
      statusMessage: "You cannot delete your own account.",
    });
  }

  const target = await getUserById(id);
  if (!target) {
    throw createError({ statusCode: 404, statusMessage: "User not found" });
  }

  if (target.role === UserRole.Superadmin) {
    throw createError({
      statusCode: 400,
      statusMessage: "The superadmin account cannot be deleted.",
    });
  }

  const removed = await deleteUser(id);
  if (!removed) {
    throw createError({ statusCode: 404, statusMessage: "User not found" });
  }

  return { ok: true };
});
