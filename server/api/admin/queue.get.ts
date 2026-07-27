import { requireAdmin } from "~/server/utils/authContext";
import { cacheDriverName } from "~/server/utils/cache";
import { countJobsByStatus } from "~/server/db/jobs";

/**
 * GET /api/admin/queue — admin only.
 * Lightweight ops snapshot for cache driver + job queue depth.
 */
export default defineEventHandler(async (event) => {
  requireAdmin(event);
  const [cacheDriver, jobs] = await Promise.all([
    cacheDriverName(),
    countJobsByStatus(),
  ]);
  return {
    cache: {
      driver: cacheDriver,
      redisConfigured: Boolean(process.env.REDIS_URL?.trim()),
    },
    queue: {
      workerEnabled: !["0", "false", "no", "off"].includes(
        (process.env.QUEUE_WORKER_ENABLED || "true").trim().toLowerCase(),
      ),
      jobs,
    },
  };
});
