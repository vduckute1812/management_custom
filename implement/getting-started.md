# Getting Started

Everything you need to take a fresh checkout from "I just cloned this" to "I'm logged in and looking at the dashboard". Pairs with [`database.md`](./database.md) (schema), [`auth.md`](./auth.md) (admin seed), and [`api.md`](./api.md) (what the running app exposes).

---

## Prerequisites

- Node.js ≥ 18
- npm
- **MySQL 8** running on `localhost:3306` (or wherever you point the env vars).

## Provision the database

The Nitro plugin creates tables automatically, but you have to create the empty database yourself. With a stock local MySQL:

```sql
CREATE DATABASE rc DEFAULT CHARSET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- Optional: a dedicated user instead of using root
-- CREATE USER 'mgmt'@'localhost' IDENTIFIED BY '…';
-- GRANT ALL PRIVILEGES ON rc.* TO 'mgmt'@'localhost';
```

## Configure the connection

Copy `.env.example` to `.env` and adjust as needed. The interesting groups:

```env
# MySQL
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASS=
DB_NAME=rc
DB_CONNECTION_LIMIT=10

# Auth — REQUIRED. JWT_SECRET must be ≥ 16 chars and kept private.
JWT_SECRET=…                    # `openssl rand -base64 48` is a good source
ADMIN_INITIAL_EMAIL=admin@local
ADMIN_INITIAL_PASSWORD=…        # used once by `migrate:auth`
ADMIN_INITIAL_NAME=Administrator

# SMTP for the email-verification flow. If any of HOST/USER/PASS is blank
# the mailer prints the verification email to the server console so the
# flow still works in dev. For Gmail use an App Password, not your normal
# password.
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
SMTP_SECURE=false

# Where the app is reachable from the user's browser; used to build the
# absolute URL inside verification emails. APP_PROTOCOL is optional and
# defaults to http; the port is omitted from the rendered URL when it
# matches the protocol default (80/443).
APP_HOST=localhost
APP_PORT=3000
# APP_PROTOCOL=http
```

The MySQL driver accepts `DB_PASSWORD` as an alias for `DB_PASS` for anyone whose shop standard prefers the long form.

## Install dependencies

```bash
npm install
```

## Apply the database schema

```bash
npm run migrate
```

Reads `server/db/migrations/*.sql` in lexical order, applies whatever is missing, and records each one in the `schema_migrations` table with a SHA-256 checksum. Idempotent — rerunning is a no-op once everything is current.

Inspect what's applied vs pending at any time:

```bash
npm run migrate:status
```

For local dev only, blow the schema away and re-apply from scratch:

```bash
MIGRATE_RESET_CONFIRM=yes npm run migrate:reset
npm run migrate
```

See [`../server/db/migrations/README.md`](../server/db/migrations/README.md) for the naming convention and the "migrations are immutable once applied" rule.

## Seed the superadmin account

```bash
npm run migrate:auth
```

Idempotent. On first run it verifies the schema is current (refuses to run if any migration is pending), then creates a verified `superadmin` user using `ADMIN_INITIAL_EMAIL` / `ADMIN_INITIAL_PASSWORD`. On subsequent runs the seed row already exists and the script is a no-op; if the row was originally created by an older version of this script with `role: admin`, it is silently promoted to `superadmin` so the install always has its break-glass owner. See [`auth.md`](./auth.md#bootstrap-superadmin) for what `superadmin` can and can't do compared to `admin`.

## Running the development server

```bash
npm run dev
```

The app boots at `http://localhost:3000` and redirects to `/login`. Sign in with the seed superadmin (or sign up a new normal user — verification link prints to the server console unless SMTP is configured).

## Building for production

```bash
npm run build
node --env-file=.env .output/server/index.mjs
```

## Verifying the database

```bash
npm run check:db
```

Pings the DB, verifies no migrations are pending or have drifted, confirms every expected table is present, and reports the current user count. Exits non-zero if the schema is incomplete.

## First-run experience

After signing in, an empty database dashboard offers two paths:

1. **Create your first task** — opens a quick-capture single-line input.
2. **Load sample data** — seeds one Epic ("Sample Project") with three tasks across the current week so all views have something to render.
