/**
 * GET /api/admin/users  — admin only
 *
 * Returns a per-user summary suitable for the admin dashboard's user table:
 * roll-ups of task/epic counts, hours logged, and last-activity timestamp.
 * Does NOT return password hashes or token state.
 */
import { getAdminUserSummaries } from "~/server/utils/db";
import { requireAdmin } from "~/server/utils/authContext";

export default defineEventHandler(async (event) => {
  requireAdmin(event);
  const users = await getAdminUserSummaries();
  return { users };
});
