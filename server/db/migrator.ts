import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import mysql, { type Connection, type RowDataPacket } from "mysql2/promise";
import { dbToISO, isoToDB } from "./datetime";
import { nowISO } from "./ids";
import { getPool } from "./pool";

/**
 * Forward-only SQL migration runner.
 *
 *   - Migrations are plain `.sql` files in `./migrations/` named
 *     `NNNN_short_name.sql`. They sort lexically, so always keep the
 *     numeric prefix (zero-padded to 4 digits by convention).
 *   - Each applied migration is recorded in `schema_migrations` with its
 *     SHA-256 checksum. Editing an already-applied file is rejected on
 *     the next status / migrate run, because that's the only way to
 *     detect "someone tweaked an old migration instead of writing a new
 *     one".
 *   - `runMigrations()` acquires a MySQL advisory lock so two app
 *     instances coming up at the same time don't double-apply.
 *   - DDL in MySQL is implicitly committed, so per-file atomicity is the
 *     contract — write migrations to be idempotent when possible.
 */

const MIGRATIONS_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "migrations"
);

const SCHEMA_MIGRATIONS_DDL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id          VARCHAR(64)  PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    checksum    CHAR(64)     NOT NULL,
    applied_at  DATETIME(3)  NOT NULL,
    duration_ms INT UNSIGNED NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const ADVISORY_LOCK = "schema_migrations";
const ADVISORY_LOCK_TIMEOUT_SECONDS = 30;

// Drop order respects child→parent FK chains; toggle FOREIGN_KEY_CHECKS
// anyway because the migrator may be invoked against half-built or
// already-broken schemas during dev resets.
const KNOWN_TABLES_DROP_ORDER = [
  "active_timer",
  "auth_email_verifications",
  "auth_refresh_tokens",
  "checklist_items",
  "time_blocks",
  "tasks",
  "epics",
  "users",
  "schema_migrations",
];

// -------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------

export interface MigrationFile {
  id: string;        // "0001_initial"
  name: string;      // "initial"
  filename: string;  // "0001_initial.sql"
  sql: string;
  checksum: string;
}

export interface AppliedMigration {
  id: string;
  name: string;
  checksum: string;
  appliedAt: string;
  durationMs: number;
}

export interface MigrationDrift {
  id: string;
  expected: string;  // checksum of the current file on disk
  actual: string;    // checksum stored when the migration was applied
}

export interface MigrationStatus {
  applied: AppliedMigration[];
  pending: MigrationFile[];
  drift: MigrationDrift[];
}

// -------------------------------------------------------------------------
// File discovery
// -------------------------------------------------------------------------

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export async function discoverMigrations(): Promise<MigrationFile[]> {
  let entries: string[];
  try {
    entries = await readdir(MIGRATIONS_DIR);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const sqlFiles = entries.filter((f) => f.endsWith(".sql")).sort();
  const out: MigrationFile[] = [];
  for (const filename of sqlFiles) {
    const match = /^(\d{4,})_([a-z0-9_]+)\.sql$/i.exec(filename);
    if (!match) {
      throw new Error(
        `Invalid migration filename: "${filename}". Use NNNN_short_name.sql (e.g. 0002_add_archived_at.sql).`
      );
    }
    const id = filename.replace(/\.sql$/, "");
    const sql = await readFile(join(MIGRATIONS_DIR, filename), "utf8");
    out.push({ id, name: match[2], filename, sql, checksum: sha256(sql) });
  }
  return out;
}

// -------------------------------------------------------------------------
// Status (read-only)
// -------------------------------------------------------------------------

async function readApplied(conn: Connection): Promise<AppliedMigration[]> {
  await conn.query(SCHEMA_MIGRATIONS_DDL);
  const [rows] = await conn.query<RowDataPacket[]>(
    "SELECT id, name, checksum, applied_at, duration_ms FROM schema_migrations ORDER BY id ASC"
  );
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    checksum: String(r.checksum),
    appliedAt: dbToISO(String(r.applied_at)),
    durationMs: Number(r.duration_ms),
  }));
}

export async function migrationStatus(): Promise<MigrationStatus> {
  const files = await discoverMigrations();
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    const applied = await readApplied(conn);
    const appliedById = new Map(applied.map((m) => [m.id, m]));
    const pending: MigrationFile[] = [];
    const drift: MigrationDrift[] = [];
    for (const file of files) {
      const ap = appliedById.get(file.id);
      if (!ap) {
        pending.push(file);
      } else if (ap.checksum !== file.checksum) {
        drift.push({
          id: file.id,
          expected: file.checksum,
          actual: ap.checksum,
        });
      }
    }
    return { applied, pending, drift };
  } finally {
    conn.release();
  }
}

/**
 * Hard fail if the schema isn't up-to-date. Called from the boot plugin
 * and from any one-shot script that needs a current schema (e.g.
 * `scripts/migrate-auth.ts`).
 */
export async function verifyMigrationsApplied(): Promise<void> {
  const status = await migrationStatus();
  if (status.drift.length) {
    throw new Error(driftMessage(status.drift));
  }
  if (status.pending.length) {
    const list = status.pending.map((m) => `  - ${m.id}`).join("\n");
    throw new Error(
      `Schema out of date. Pending migrations:\n${list}\n\n` +
        `Run \`npm run migrate\` to apply.`
    );
  }
}

// -------------------------------------------------------------------------
// Apply (write)
// -------------------------------------------------------------------------

export interface MigrationRunResult {
  applied: string[];
  alreadyApplied: number;
}

/**
 * Apply every pending migration in order. Uses a dedicated connection
 * with `multipleStatements: true` so each `.sql` file can contain many
 * statements without us hand-rolling a SQL splitter.
 */
export async function runMigrations(): Promise<MigrationRunResult> {
  const status = await migrationStatus();
  if (status.drift.length) {
    throw new Error(driftMessage(status.drift));
  }
  if (!status.pending.length) {
    return { applied: [], alreadyApplied: status.applied.length };
  }

  const conn = await openMultiStatementConnection();
  const applied: string[] = [];
  try {
    await withAdvisoryLock(conn, async () => {
      await conn.query(SCHEMA_MIGRATIONS_DDL);
      for (const m of status.pending) {
        const t0 = Date.now();
        try {
          await conn.query(m.sql);
        } catch (err) {
          throw new Error(
            `Migration ${m.id} failed: ${(err as Error).message}`
          );
        }
        const duration = Date.now() - t0;
        await conn.query(
          `INSERT INTO schema_migrations (id, name, checksum, applied_at, duration_ms)
           VALUES (?, ?, ?, ?, ?)`,
          [m.id, m.name, m.checksum, isoToDB(nowISO()), duration]
        );
        applied.push(m.id);
      }
    });
  } finally {
    await conn.end();
  }

  return { applied, alreadyApplied: status.applied.length };
}

// -------------------------------------------------------------------------
// Reset (DEV ONLY — drops every known table, including schema_migrations)
// -------------------------------------------------------------------------

export async function resetSchema(): Promise<string[]> {
  if (process.env.MIGRATE_RESET_CONFIRM !== "yes") {
    throw new Error(
      "Refusing to drop schema. Set MIGRATE_RESET_CONFIRM=yes to confirm."
    );
  }
  const pool = getPool();
  const dropped: string[] = [];
  await pool.query("SET FOREIGN_KEY_CHECKS = 0");
  try {
    for (const t of KNOWN_TABLES_DROP_ORDER) {
      await pool.query(`DROP TABLE IF EXISTS \`${t}\``);
      dropped.push(t);
    }
  } finally {
    await pool.query("SET FOREIGN_KEY_CHECKS = 1");
  }
  return dropped;
}

// -------------------------------------------------------------------------
// Internals
// -------------------------------------------------------------------------

async function openMultiStatementConnection(): Promise<Connection> {
  return await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASS ?? process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME || "rc",
    // Enabled only for the migration runner so a SQL file with N
    // statements can be sent as one query. The main runtime pool keeps
    // this OFF (the default) so app-level queries can never be coerced
    // into multi-statement injection.
    multipleStatements: true,
    dateStrings: true,
    timezone: "Z",
  });
}

async function withAdvisoryLock<T>(
  conn: Connection,
  fn: () => Promise<T>
): Promise<T> {
  // GET_LOCK returns: 1 on success, 0 on timeout, NULL on internal error.
  // The lock is per-connection — releasing it (or closing the connection)
  // is mandatory, so we always go through the finally.
  const [rows] = await conn.query<RowDataPacket[]>(
    "SELECT GET_LOCK(?, ?) AS got",
    [ADVISORY_LOCK, ADVISORY_LOCK_TIMEOUT_SECONDS]
  );
  const got = rows[0]?.got;
  if (Number(got) !== 1) {
    throw new Error(
      `Could not acquire MySQL lock "${ADVISORY_LOCK}" within ` +
        `${ADVISORY_LOCK_TIMEOUT_SECONDS}s — another migration is in progress?`
    );
  }
  try {
    return await fn();
  } finally {
    await conn.query("SELECT RELEASE_LOCK(?)", [ADVISORY_LOCK]).catch(() => {
      // Best-effort; closing the connection releases the lock anyway.
    });
  }
}

function driftMessage(drift: MigrationDrift[]): string {
  const lines = drift.map(
    (d) =>
      `  - ${d.id}  on-disk=${d.expected.slice(0, 12)}…  ` +
      `applied=${d.actual.slice(0, 12)}…`
  );
  return (
    `Migration checksum mismatch:\n${lines.join("\n")}\n\n` +
    `Migrations are immutable once applied. Revert your edit to the ` +
    `affected file, or add a NEW migration that performs the change.`
  );
}
