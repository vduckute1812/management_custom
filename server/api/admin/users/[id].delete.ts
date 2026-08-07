/**
 * DELETE /api/admin/users/:id  — superadmin only
 *
 * Permanently removes a user and all of their data (epics, tasks, tokens,
 * etc. cascade via FK constraints). Guard rails:
 *   - Only the install superadmin may call this.
 *   - The superadmin account itself cannot be deleted.
 *   - You cannot delete your own account while signed in.
 */
import { UserRole, getUserById } from "~/server/utils/db";
import { requireSuperAdmin } from "~/server/utils/authContext";
import { DomainError, mapDomainError } from "~/server/utils/http";
import { deleteUserAccount } from "~/server/services/accountDeletionService";

export default defineEventHandler(async (event) => {
  try {
    const actor = await requireSuperAdmin(event);
    const id = getRouterParam(event, "id");
    if (!id) {
      throw new DomainError(400, "Missing user id");
    }

    if (id === actor.sub) {
      throw new DomainError(400, "You cannot delete your own account.");
    }

    const target = await getUserById(id);
    if (!target) {
      throw new DomainError(404, "User not found");
    }

    if (target.role === UserRole.Superadmin) {
      throw new DomainError(400, "The superadmin account cannot be deleted.");
    }

    const removed = await deleteUserAccount(id);
    if (!removed) {
      throw new DomainError(404, "User not found");
    }

    return { ok: true };
  } catch (err) {
    mapDomainError(err);
  }
});
