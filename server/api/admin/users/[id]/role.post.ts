/**
 * POST /api/admin/users/:id/role  — admin only
 *
 * Body:  { role: UserRole.Admin | UserRole.Normal } (integer)
 * Reply: { ok: true, user: AuthUser }
 *
 * Lets an admin change another user's role. Two guard rails:
 *   - `superadmin` is NEVER an assignable target (no privilege escalation
 *     through the API — that role is seeded only by `npm run migrate:auth`).
 *   - A target whose CURRENT role is `superadmin` cannot be modified at all:
 *     the install owner stays the install owner.
 *   - We also refuse to demote the last admin so the install can't be locked
 *     out of admin-only routes.
 */
import {
  UserRole,
  getUserById,
  isAdminRole,
  listUsers,
  toAuthUser,
  updateUserRole,
} from "~/server/utils/db";
import { requireAdmin } from "~/server/utils/authContext";
import { DomainError, mapDomainError, parseBody } from "~/server/utils/http";
import { adminUserRoleBodySchema } from "~/server/schemas";

export default defineEventHandler(async (event) => {
  try {
    await requireAdmin(event);
    const id = getRouterParam(event, "id");
    if (!id) {
      throw new DomainError(400, "Missing user id");
    }
    const body = await parseBody(event, adminUserRoleBodySchema);
    const role = body.role;

    const target = await getUserById(id);
    if (!target) {
      throw new DomainError(404, "User not found");
    }

    // The seeded superadmin is the install's break-glass account; its role is
    // immutable through the API so it can't be demoted (lock-out risk) or
    // re-graded by another admin.
    if (target.role === UserRole.Superadmin) {
      throw new DomainError(400, "The superadmin's role cannot be changed.");
    }

    if (target.role === UserRole.Admin && role !== UserRole.Admin) {
      const all = await listUsers();
      const admins = all.filter((u) => isAdminRole(u.role));
      if (admins.length <= 1) {
        throw new DomainError(
          400,
          "Cannot demote the last admin — promote another user first.",
        );
      }
    }

    await updateUserRole(id, role);
    const updated = await getUserById(id);
    if (!updated) {
      throw new DomainError(404, "User not found");
    }
    return { ok: true, user: toAuthUser(updated) };
  } catch (err) {
    mapDomainError(err);
  }
});
