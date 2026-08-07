/**
 * Quick DB health check.
 *
 * Exercises the same pool + bootstrap code path as the Nitro server, then
 * runs a couple of cheap reads so a green check means "the app can actually
 * read/write through this config", not just "TCP handshake succeeded".
 *
 *   npm run check:db
 */

import { countUsers, getPool, migrationStatus } from "../server/utils/db";
import type { RowDataPacket } from "mysql2/promise";

interface PingRow extends RowDataPacket {
  version: string;
  server_time: Date;
  tz: string;
  db: string | null;
}

interface TableRow extends RowDataPacket {
  TABLE_NAME: string;
  TABLE_ROWS: number | null;
}

function fmt(ms: number) {
  return `${ms.toFixed(0)}ms`;
}

async function main() {
  const started = Date.now();

  console.log("[check] target:", {
    host: process.env.DB_HOST || "127.0.0.1",
    port: process.env.DB_PORT || "3306",
    user: process.env.DB_USER || "root",
    database: process.env.DB_NAME || "rc",
    passwordSet: Boolean(process.env.DB_PASS ?? process.env.DB_PASSWORD),
  });

  const pool = getPool();

  const t0 = Date.now();
  const [pingRows] = await pool.query<PingRow[]>(
    "SELECT VERSION() AS version, NOW(3) AS server_time, @@time_zone AS tz, DATABASE() AS db",
  );
  console.log(`[check] ping ok in ${fmt(Date.now() - t0)} ->`, pingRows[0]);

  const t1 = Date.now();
  const status = await migrationStatus();
  if (status.drift.length) {
    throw new Error(
      `Migration checksum drift on: ${status.drift.map((d) => d.id).join(", ")}. ` +
        "See `npm run migrate:status` for details.",
    );
  }
  if (status.pending.length) {
    throw new Error(
      `Pending migrations: ${status.pending.map((m) => m.id).join(", ")}. ` +
        "Run `npm run migrate` to apply.",
    );
  }
  console.log(
    `[check] migrations ok in ${fmt(Date.now() - t1)} (${status.applied.length} applied)`,
  );

  const t2 = Date.now();
  const EXPECTED_TABLES = [
    "active_timer",
    "auth_email_verifications",
    "auth_password_resets",
    "auth_refresh_tokens",
    "chat_conversation_reads",
    "chat_message_reactions",
    "chat_messages",
    "chat_conversations",
    "checklist_items",
    "epics",
    "jobs",
    "post_attachments",
    "post_audience",
    "post_categories",
    "post_comments",
    "post_reactions",
    "posts",
    "stories",
    "story_reactions",
    "story_views",
    "tasks",
    "time_blocks",
    "uploads",
    "users",
  ];
  const placeholders = EXPECTED_TABLES.map(() => "?").join(",");
  const [tableRows] = await pool.query<TableRow[]>(
    `SELECT TABLE_NAME, TABLE_ROWS
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN (${placeholders})
      ORDER BY TABLE_NAME`,
    EXPECTED_TABLES,
  );
  console.log(
    `[check] schema present in ${fmt(Date.now() - t2)}:`,
    tableRows.map((r) => `${r.TABLE_NAME}(${r.TABLE_ROWS})`).join(", "),
  );
  const missing = EXPECTED_TABLES.filter(
    (name) => !tableRows.some((r) => r.TABLE_NAME === name),
  );
  if (missing.length) {
    throw new Error(
      `Missing tables: ${missing.join(", ")}. Run \`npm run migrate\` to apply the schema.`,
    );
  }

  const t3 = Date.now();
  const users = await countUsers();
  console.log(`[check] live reads in ${fmt(Date.now() - t3)}: users=${users}`);
  if (users === 0) {
    console.warn(
      "[check] WARNING: no users in the database — run `npm run migrate:auth` to seed the initial admin.",
    );
  }

  await pool.end();
  console.log(`[check] OK (total ${fmt(Date.now() - started)})`);
}

main().catch((err) => {
  console.error("[check] FAILED:", err?.message ?? err);
  if (err?.code) console.error("        code:", err.code);
  if (err?.errno) console.error("        errno:", err.errno);
  if (err?.sqlState) console.error("    sqlState:", err.sqlState);
  process.exit(1);
});
