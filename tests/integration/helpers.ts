/**
 * Shared helpers for MySQL integration tests.
 *
 * Gated by `DB_INTEGRATION=1` (plus normal `DB_*` env). Default `npm test`
 * still loads these files; suites skip unless the flag is set so CI stays
 * DB-free. Run against a migrated database with:
 *
 *   DB_INTEGRATION=1 npm run test:integration
 *
 * Prefer a dedicated database (`DB_NAME=rc_test`) — never point this at prod.
 */
import { afterAll } from "vitest";
import { closePool, getPool, migrationStatus } from "../../server/utils/db";

export const integrationEnabled = process.env.DB_INTEGRATION === "1";

export async function assertIntegrationDbReady(): Promise<void> {
  const pool = getPool();
  await pool.query("SELECT 1");
  const status = await migrationStatus();
  if (status.pending.length) {
    throw new Error(
      `Pending migrations: ${status.pending.map((m) => m.id).join(", ")}. ` +
        "Run `npm run migrate` against the integration database first.",
    );
  }
  if (status.drift.length) {
    throw new Error(
      `Migration checksum drift: ${status.drift.map((d) => d.id).join(", ")}`,
    );
  }
}

/** Register once per integration file so the process exits cleanly. */
export function useIntegrationPoolTeardown(): void {
  afterAll(async () => {
    await closePool();
  });
}
