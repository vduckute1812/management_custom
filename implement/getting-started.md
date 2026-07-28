# Getting Started

Everything you need to take a fresh checkout from "I just cloned this" to "I'm logged in and looking at the calendar". Pairs with [`database.md`](./database.md) (schema), [`auth.md`](./auth.md) (admin seed), [`api.md`](./api.md) (routes), and [`i18n.md`](./i18n.md) (languages).

---

## Prerequisites

- **Node.js ≥ 24** (see `.nvmrc` / `package.json` `engines`)
- npm
- **MySQL 8** running on `localhost:3306` (or wherever you point the env vars)
- Optional: **Cloudflare R2** credentials if you want feed/story file attachments
- Optional: **Redis** (`REDIS_URL`) if you want a shared cache across app processes — not required; memory cache is the default

## Provision the database

Create the empty database yourself. Schema is applied only by migrations (`npm run migrate`) — the Nitro boot plugin verifies migrations; it does **not** create tables.

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
# absolute URL inside verification emails.
# Prefer APP_BASE_URL behind a reverse proxy / Cloudflare Tunnel.
# Production site identity for emails + @nuxtjs/seo is https://dntechx.com
# APP_BASE_URL=https://dntechx.com
APP_HOST=localhost
APP_PORT=3000
# APP_PROTOCOL=http

# Cloudflare R2 (optional) — required for Attach on posts/stories.
# R2_ACCOUNT_ID=…
# R2_ACCESS_KEY_ID=…
# R2_SECRET_ACCESS_KEY=…
# R2_BUCKET=mgmt-uploads
# R2_ENDPOINT=…          # optional override
# R2_SIGNED_URL_TTL=3600 # optional

# Cache — memory by default. Set REDIS_URL for a shared Redis driver.
# REDIS_URL=redis://127.0.0.1:6379/0
# CACHE_DRIVER=memory
# CACHE_NAMESPACE=rc
# CACHE_MEMORY_MAX=500

# Background jobs — MySQL table `jobs`, worker inside Nitro (default on).
# QUEUE_WORKER_ENABLED=true
# QUEUE_POLL_MS=1500
# QUEUE_IDLE_MS=4000
# QUEUE_STALE_SECONDS=300
# QUEUE_PURGE_DAYS=14
```

The MySQL driver accepts `DB_PASSWORD` as an alias for `DB_PASS` for anyone whose shop standard prefers the long form.

Cache & queue design notes: [`cache-queue.md`](./cache-queue.md).

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

The app boots at `http://localhost:3000` on the **public hub** (`/`). Guests can open **Feed** (`/feed`) without signing in. Protected sections (Time Management `/tasks`, settings, admin, …) bounce unauthenticated users to `/login?redirect=…`.

Sign in with the seed superadmin, or sign up a normal user — the verification link prints to the server console unless SMTP is configured.

UI language defaults to English (or a browser match on first visit). Change it anytime under **Settings → Language**, or from the header account menu — preference stays in local storage for that browser. See [`i18n.md`](./i18n.md).

## Building for production

```bash
npm run build
node --env-file=.env .output/server/index.mjs
```

On the live host, confirm SEO endpoints after deploy:

- `https://dntechx.com/` and `https://dntechx.com/feed` (view-source should show real copy / public posts, not an empty `#__nuxt` shell)
- `https://dntechx.com/robots.txt`
- `https://dntechx.com/sitemap.xml` (should list `/` and `/feed` only)

Then submit the sitemap in Google Search Console. Details: [`architecture.md`](./architecture.md#seo-nuxtjsseo).

## Type-checking Vue / TypeScript

```bash
npx vue-tsc --noEmit -p tsconfig.json
```

Requires **TypeScript 5.9.x** (classic compiler API). Do **not** upgrade to native TypeScript 7 — `vue-tsc` / Volar cannot load it (`typescript/lib/tsc` is not exported). Plural/`t()` call shapes that fail type-check are documented in [`i18n.md`](./i18n.md).

## Verifying the database

```bash
npm run check:db
```

Pings the DB, verifies no migrations are pending or have drifted, confirms expected core tables are present, and reports the current user count. Exits non-zero if the schema is incomplete.

## First-run experience

After signing in, open **Time Management** (`/tasks`, or `g d`). An empty calendar offers:

1. **Quick capture** — single-line task input (`n`).
2. **Load sample data** — seeds a sample Epic with tasks across the current week so calendar/analytics have something to render.

The hub (`/`) explains the two modules (Feed vs Time Management) without requiring a session.
