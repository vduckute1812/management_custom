import mysql, { type Pool } from "mysql2/promise";

/**
 * Lazy-created `mysql2/promise` pool, reused across the Nitro server's
 * lifetime. Connection details come from env so production / docker / CI
 * can override without code changes — defaults match the project README's
 * "local MySQL on 3306, database `rc`" spec.
 */

let _pool: Pool | null = null;

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function getPool(): Pool {
  if (_pool) return _pool;
  // Accept either `DB_PASS` (the short form used in our .env.example) or
  // `DB_PASSWORD` (the long form some shops prefer). Empty string means
  // "no password" — distinct from "unset".
  const password = process.env.DB_PASS ?? process.env.DB_PASSWORD ?? "";
  _pool = mysql.createPool({
    host: process.env.DB_HOST || "127.0.0.1",
    port: envInt("DB_PORT", 3306),
    user: process.env.DB_USER || "root",
    password,
    database: process.env.DB_NAME || "rc",
    connectionLimit: envInt("DB_CONNECTION_LIMIT", 10),
    waitForConnections: true,
    // Server-emitted DATETIME values arrive in MySQL's session timezone as
    // bare strings; we always convert to/from ISO 8601 explicitly in the
    // datetime helpers, so tell the driver to keep them as strings and
    // skip its own Date wrapper.
    dateStrings: true,
    namedPlaceholders: false,
    timezone: "Z",
  });
  return _pool;
}
