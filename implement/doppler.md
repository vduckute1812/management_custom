# Secrets with Doppler

Env keys (`JWT_SECRET`, `DB_*`, `REDIS_PASSWORD`, OAuth, SMTP, R2, LLM, …)
are managed **only** in [Doppler](https://www.doppler.com/). Deploy downloads
config `prd` into `docker/.env.prod`. If a required key is missing or empty,
deploy **fails** (no local `.env.prod` fallback, no auto-mint).

File secrets (TLS certs, Cloudflare Tunnel credentials) stay on the Pi under
`~/.config/management`. The only runtime “sync” left is **public IP →
`APP_HOST`** via `docker/sync-public-ip.sh` (updates the local env after the
Doppler download when the router IP changes).

## Project layout

| Doppler                     | Purpose                                    |
| --------------------------- | ------------------------------------------ |
| Project `management_custom` | This app (override with `DOPPLER_PROJECT`) |
| Config `dev`                | Local development (`.doppler.yaml`)        |
| Config `prd`                | Raspberry Pi production                    |

## Required production keys

`fetch-doppler-secrets.sh` refuses to continue without non-empty:

`JWT_SECRET`, `DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME`, `MYSQL_ROOT_PASSWORD`,
`REDIS_PASSWORD`

Also set whatever else the app needs (`APP_BASE_URL`, OAuth, SMTP, R2, LLM, …).
If `DB_USER` is still `root`, set `ALLOW_ROOT_DB=1` only as a temporary bridge —
then cut over to `mgmt` via `docker/mysql-create-app-user.sql` and **delete**
`ALLOW_ROOT_DB` from Doppler (see [`getting-started.md`](./getting-started.md)).

Edit in the Doppler dashboard or:

```bash
doppler secrets set KEY=value --project management_custom --config prd
```

## Auth on the Pi / CI

Store a **read** service token as:

- GitHub Actions secret `DOPPLER_TOKEN`, and/or
- `~/.config/management/doppler.token` (mode `600`)

Optional repo variables: `DOPPLER_PROJECT`, `DOPPLER_CONFIG` (defaults
`management_custom` / `prd`).

```bash
bash docker/install-doppler-cli.sh
```

## Deploy flow

1. Install Doppler CLI (workflow).
2. `docker/link-secrets.sh` → `fetch-doppler-secrets.sh` (hard fail on missing keys).
3. Link local `ssl/` + `cloudflared/` if present.
4. `docker/sync-public-ip.sh` may rewrite `APP_HOST` when the public IP changes.
5. Build / migrate / recreate app.

## Local development

```bash
doppler setup
npm run dev:doppler
# or:
npm run secrets:pull   # writes gitignored .env
npm run dev
```

## Scripts

| Script                            | Role                                |
| --------------------------------- | ----------------------------------- |
| `docker/install-doppler-cli.sh`   | Install CLI                         |
| `docker/fetch-doppler-secrets.sh` | Download `prd` → `docker/.env.prod` |
| `docker/link-secrets.sh`          | Doppler env + local file secrets    |
| `docker/sync-public-ip.sh`        | Detect IP; update `APP_HOST` / TLS  |
| `npm run dev:doppler`             | `doppler run --config dev -- nuxt`  |
| `npm run secrets:pull`            | Download current config → `.env`    |
| `npm run secrets:pull:prd`        | Same as fetch script for production |

There is **no** upload/sync-to-Doppler script or workflow — secrets are edited
in Doppler only.
