#!/bin/sh
set -e

DB_HOST="${DB_HOST:-mysql}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-root}"
DB_PASS="${DB_PASS:-${DB_PASSWORD:-}}"
DB_NAME="${DB_NAME:-rc}"

echo "[mgmt] waiting for database at ${DB_HOST}:${DB_PORT}…"
for i in $(seq 1 60); do
  if node <<EOF
const { createConnection } = require("mysql2/promise");
createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
})
  .then((c) => c.query("SELECT 1").then(() => c.end()))
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
EOF
  then
    echo "[mgmt] database is ready"
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "[mgmt] timeout waiting for database"
    exit 1
  fi
  sleep 5
done

echo "[mgmt] running migrations…"
node --import tsx scripts/migrate.ts up

echo "[mgmt] starting server on ${HOST:-0.0.0.0}:${PORT:-3000}…"
exec node .output/server/index.mjs
