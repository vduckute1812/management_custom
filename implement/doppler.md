# Secrets with Doppler

Env keys (`JWT_SECRET`, `DB_*`, `REDIS_PASSWORD`, OAuth, SMTP, R2, LLM, …)
are managed in [Doppler](https://www.doppler.com/). File secrets (TLS certs,
Cloudflare Tunnel credentials) stay on the Pi under `~/.config/management`.

## Project layout

| Doppler                     | Purpose                                      |
| --------------------------- | -------------------------------------------- |
| Project `management_custom` | This app (override with `DOPPLER_PROJECT`)   |
| Config `dev`                | Local development (`.doppler.yaml` default)  |
| Config `prd`                | Raspberry Pi production (`docker/.env.prod`) |

## One-time setup

### 1. Create the project and import keys

1. Create project `management_custom` with configs `dev` and `prd`.
2. Import the current Pi file into `prd`:

   ```bash
   # On a machine with the Pi secrets (or after scp):
   doppler secrets upload ~/.config/management/.env.prod \
     --project management_custom --config prd
   ```

3. Copy a subset into `dev` (or start from `.env.example`) and set local
   `DB_HOST` / weaker secrets as needed.

Required production keys include at least: `JWT_SECRET`, `DB_HOST`, `DB_USER`,
`DB_PASS`, `DB_NAME`, `MYSQL_ROOT_PASSWORD`, `REDIS_PASSWORD`, `APP_BASE_URL`
(or `APP_HOST`), plus any OAuth / SMTP / R2 / LLM keys you use.

### 2. Service token for the Pi

```bash
doppler configs tokens create pi-deploy \
  --project management_custom --config prd --plain
```

Store it **one or both** of:

- GitHub → Settings → Secrets and variables → Actions → `DOPPLER_TOKEN`
- On the Pi: `~/.config/management/doppler.token` (mode `600`)

Optional repo **variables**: `DOPPLER_PROJECT`, `DOPPLER_CONFIG` (defaults
`management_custom` / `prd`).

### 3. Install CLI (local + Pi)

```bash
bash docker/install-doppler-cli.sh
# or: https://docs.doppler.com/docs/install-cli
```

The Deploy workflow installs the CLI automatically when missing.

## How deploy uses Doppler

`docker/link-secrets.sh` (called by Deploy and `ci-deploy.sh`):

1. Runs `docker/fetch-doppler-secrets.sh` when a token is available → writes
   `docker/.env.prod` (and caches `~/.config/management/.env.prod`).
2. If Doppler is not configured, falls back to the local secrets file.
3. Still links `ssl/` + `cloudflared/` from the local secrets dir.
4. Ensures `REDIS_PASSWORD` / `ALLOW_ROOT_DB` bridges for older configs.

Service tokens are **read-only**. Edit secrets in the Doppler dashboard (or
`doppler secrets set KEY=value --config prd`). After changing `prd`, re-run
**Deploy (Raspberry Pi)** (or push a `docker/**` change) so the Pi refreshes
`docker/.env.prod` before recreate.

## Local development

```bash
doppler setup   # once — picks project/config from .doppler.yaml
npm run dev:doppler
# or materialise a gitignored .env:
npm run secrets:pull
npm run dev
```

## Scripts

| Script                            | Role                                     |
| --------------------------------- | ---------------------------------------- |
| `docker/install-doppler-cli.sh`   | Install CLI                              |
| `docker/fetch-doppler-secrets.sh` | Download `prd` → `docker/.env.prod`      |
| `docker/link-secrets.sh`          | Doppler-or-local + file secrets          |
| `npm run dev:doppler`             | `doppler run --config dev -- nuxt dev`   |
| `npm run secrets:pull`            | Download current Doppler config → `.env` |
| `npm run secrets:pull:prd`        | Same as fetch script for production      |

## What stays off Doppler

- `docker/ssl/*` (TLS for direct-IP HTTPS)
- `docker/cloudflared/*` + `cloudflared.env` (tunnel)
- GitHub Actions runner registration token
