import { getPool } from "~/server/db/pool";
import { migrationStatus } from "~/server/db/migrator";

/**
 * Public liveness/readiness probe for deploy health checks.
 * Returns 200 only when MySQL answers and migrations are current (no pending/drift).
 *
 * Deliberately returns only booleans publicly: MySQL connection errors embed
 * host/user details (`Access denied for user 'root'@…`, `ECONNREFUSED 10.…`),
 * and pending/drift counts advertise schema state to unauthenticated callers.
 * Details go to the server log.
 */
export default defineEventHandler(async (event) => {
  const started = Date.now();
  let dbOk = false;
  let migrationsOk = false;

  try {
    const pool = getPool();
    await pool.query("SELECT 1");
    dbOk = true;

    const status = await migrationStatus();
    migrationsOk = status.pending.length === 0 && status.drift.length === 0;
    if (!migrationsOk) {
      console.warn(
        `[health] migrations not current: pending=${status.pending.length} drift=${status.drift.length}`,
      );
    }
  } catch (err) {
    console.warn(
      "[health] check failed:",
      err instanceof Error ? err.message : err,
    );
  }

  const ok = dbOk && migrationsOk;
  setResponseStatus(event, ok ? 200 : 503);
  return {
    ok,
    status: ok ? "ok" : "degraded",
    db: dbOk,
    migrations: { ok: migrationsOk },
    uptimeMs: Math.round(process.uptime() * 1000),
    durationMs: Date.now() - started,
  };
});
