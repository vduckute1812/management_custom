/**
 * MySQL smoke: pool + migrations + drift-only comment recount.
 * Skipped unless DB_INTEGRATION=1.
 */
import type { RowDataPacket } from "mysql2/promise";
import { describe, expect, it } from "vitest";
import { recountCommentCounts } from "../../server/db/postComments";
import { getPool } from "../../server/utils/db";
import {
  assertIntegrationDbReady,
  integrationEnabled,
  useIntegrationPoolTeardown,
} from "./helpers";

describe.skipIf(!integrationEnabled)("integration: db smoke", () => {
  useIntegrationPoolTeardown();

  it("connects and has migrations applied", async () => {
    await assertIntegrationDbReady();
    const pool = getPool();
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS n FROM schema_migrations",
    );
    expect(Number(rows[0]?.n ?? 0)).toBeGreaterThan(0);
  });

  it("recountCommentCounts with no args is drift-only (returns a number)", async () => {
    await assertIntegrationDbReady();
    const fixed = await recountCommentCounts();
    expect(typeof fixed).toBe("number");
    expect(fixed).toBeGreaterThanOrEqual(0);
  });
});
