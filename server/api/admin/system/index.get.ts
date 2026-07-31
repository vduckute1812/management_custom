import { requireSuperAdmin } from "~/server/utils/authContext";
import { collectSystemSnapshot } from "~/server/utils/systemMetrics";

/**
 * GET /api/admin/system — **superadmin only**.
 * Live ops snapshot: process RAM/CPU, disk, DB/readiness/Redis latency, cache + queue.
 */
export default defineEventHandler(async (event) => {
  requireSuperAdmin(event);
  return await collectSystemSnapshot();
});
