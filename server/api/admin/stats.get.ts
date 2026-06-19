/**
 * GET /api/admin/stats?days=30  — admin only
 *
 * System-wide rollups for the admin dashboard charts:
 *   - per-user task / epic / hours-logged summaries (for a bar chart)
 *   - per-day total hours across all users (for a line chart)
 *   - per-status task counts (for a doughnut chart)
 *   - top-level totals (user count, task count, hours)
 */
import {
  getAdminUserSummaries,
  getDailyHoursAllUsers,
  getStatusBreakdownAllUsers,
} from "~/server/utils/db";
import { requireAdmin } from "~/server/utils/authContext";

export default defineEventHandler(async (event) => {
  requireAdmin(event);
  const query = getQuery(event);
  const days = Math.min(
    365,
    Math.max(1, Number(query.days ?? 30) || 30)
  );

  const [users, daily, statuses] = await Promise.all([
    getAdminUserSummaries(),
    getDailyHoursAllUsers(days),
    getStatusBreakdownAllUsers(),
  ]);

  const totals = {
    userCount: users.length,
    taskCount: users.reduce((sum, u) => sum + u.taskCount, 0),
    epicCount: users.reduce((sum, u) => sum + u.epicCount, 0),
    hoursLogged:
      Math.round(users.reduce((sum, u) => sum + u.hoursLogged, 0) * 100) / 100,
  };

  return {
    rangeDays: days,
    totals,
    users,
    daily,
    statuses,
  };
});
