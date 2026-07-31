import { getPool } from "~/server/db/pool";
import { migrationStatus } from "~/server/db/migrator";

/**
 * Public liveness/readiness probe for deploy health checks.
 * Returns 200 only when MySQL answers and migrations are current (no pending/drift).
 */
export default defineEventHandler(async (event) => {
  const started = Date.now();
  let dbOk = false;
  let migrationsOk = false;
  let pending = 0;
  let drift = 0;
  let error: string | null = null;

  try {
    const pool = getPool();
    await pool.query("SELECT 1");
    dbOk = true;

    const status = await migrationStatus();
    pending = status.pending.length;
    drift = status.drift.length;
    migrationsOk = pending === 0 && drift === 0;
  } catch (err) {
    error = err instanceof Error ? err.message : "health check failed";
  }

  const ok = dbOk && migrationsOk;
  setResponseStatus(event, ok ? 200 : 503);
  return {
    ok,
    status: ok ? "ok" : "degraded",
    db: dbOk,
    migrations: {
      ok: migrationsOk,
      pending,
      drift,
    },
    uptimeMs: Math.round(process.uptime() * 1000),
    durationMs: Date.now() - started,
    ...(error ? { error } : {}),
  };
});
