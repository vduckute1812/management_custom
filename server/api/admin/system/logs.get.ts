import { requireSuperAdmin } from "~/server/utils/authContext";
import { getRecentLogs, type LogLevel } from "~/server/utils/logBuffer";

/**
 * GET /api/admin/system/logs — **superadmin only**.
 * Recent in-process console lines (this app container only).
 */
export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event);
  const q = getQuery(event);
  const limitRaw = Number(q.limit ?? 120);
  const limit = Number.isFinite(limitRaw) ? limitRaw : 120;
  const levelRaw = typeof q.level === "string" ? q.level : "all";
  const allowed: Array<LogLevel | "all"> = [
    "all",
    "log",
    "info",
    "warn",
    "error",
    "debug",
  ];
  const level = allowed.includes(levelRaw as LogLevel | "all")
    ? (levelRaw as LogLevel | "all")
    : "all";

  return {
    scope: "app-container" as const,
    entries: getRecentLogs({ limit, level }),
  };
});
