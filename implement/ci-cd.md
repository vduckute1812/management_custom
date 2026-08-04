# CI/CD (Raspberry Pi)

Production deploys run **on the Pi itself** via a GitHub Actions self-hosted runner. Builds stay native (ARM), reuse your existing `podman` stack, and never need SSH keys in GitHub.

Compose is invoked with **`uv run podman-compose`** from the repo root (`pyproject.toml`). There is no Poetry/pyenv absolute path.

**Image runtime.** `docker/Dockerfile.prod` builds on `node:26.5.0-alpine`. The **builder** installs **npm 12.0.2** globally (`npm install -g` — Alpine omits Corepack) plus native build tools, runs `npm ci` + `nuxt build`, and sets `HUSKY=0`. The **runtime** only installs `tsx` + `mysql2` (migrate / DB wait) and copies Nitro `.output` — it does **not** copy the full builder `node_modules` (that COPY was ~6 min on the Pi SD card).

### Build-time knobs (why deploys got faster)

| Change                                                                  | Effect                                                             |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Keep `:builder-cache`; skip `system prune` unless free disk &lt; ~4 GiB | Reuses apk + `npm ci` layers when `package-lock.json` is unchanged |
| Slim runtime image (no full `node_modules` COPY)                        | Removes the multi-minute SD-card copy after every Nuxt build       |
| Tighter `.dockerignore`                                                 | Smaller `COPY . .` context                                         |
| Workflow `paths-ignore` for docs/tests                                  | Docs-only master pushes skip the Pi job                            |

Overrides: `MGMT_PRUNE_AGGRESSIVE=1` forces a full prune; `MGMT_DISK_FREE_MIN_GIB` (default `4`) sets the low-disk threshold.

## What happens on every `master` push

1. The Pi runner checks out the commit (`clean: false` so local secrets survive). Docs/test-only pushes are skipped via `paths-ignore` (use **Run workflow** to force a deploy).
2. **Sync libs** — `uv sync --frozen` inside `ci-deploy.sh` installs ops deps (`podman-compose`). App npm deps sync via image `npm ci` (retries on flaky links; layers reused from `:builder-cache` when the lockfile is unchanged).
3. Snapshots `:latest` → `:previous`, then removes **old app SHA tags** + stopped containers (builder cache kept unless disk is critically low).
4. Builds a new image tagged with the git SHA.
5. **If the build fails** → running stack untouched; aggressive prune reclaims partial layers.
6. MySQL up; **DB migrations** with the new image while the old app still serves.
7. **If migrate fails** → `:latest` restored to `:previous`; live app not restarted.
8. Redis up (cache); then recreates **only the app** (`--no-deps --force-recreate app`); nginx stays up for Cloudflare Tunnel; health-check `http://${LAN_IP}:3000/`.
9. Renders `nginx.prod.conf.template` → `nginx.prod.rendered.conf` (`LAN_IP`) and reloads nginx so bind-mounted edits take effect.
10. **If health fails** → retag `:previous` → `:latest`, recreate app, fail the job.
11. **After a healthy deploy** → refresh `:builder-cache`, drop old SHA tags / stopped containers. Keeps `:latest` / `:previous` / new SHA / `:builder-cache`; **never** deletes named volumes.

Chat SSE (`/api/chat/inbox/stream`, `/api/chat/conversations/:id/stream`) needs the dedicated nginx locations in `nginx.prod.conf.template` (HTTP/1.1, `proxy_buffering off`, long read timeout). Without them, long-lived EventSource connections 504 behind Cloudflare. Podman on this Pi has no compose service-name DNS, so nginx proxies to `http://${LAN_IP}:3000` (not `http://app:3000`). MySQL and Redis are bound to `127.0.0.1` only; the app uses `host.containers.internal` (compose `extra_hosts` → `host-gateway`) to reach them.

Manual entrypoint: `bash docker/deploy.sh` (same script).

## One-time Pi setup

### 1. Install uv

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
# ensure ~/.local/bin is on PATH
uv --version
```

### 2. Register the self-hosted runner

In GitHub: **Settings → Actions → Runners → New self-hosted runner**. Copy the registration token, then on the Pi (from a clone of this repo):

```bash
bash docker/install-github-runner.sh \
  --url https://github.com/vduckute1812/management_custom \
  --token <REGISTRATION_TOKEN>
```

Custom label registered: `management` (workflow uses `runs-on: [self-hosted, management]`).

Confirm the runner shows **Idle** (green) in GitHub → Settings → Actions → Runners. If it shows **Offline**:

```bash
cd ~/actions-runner   # or the --dir you chose
./svc.sh start
./svc.sh status
```

### 3. Local secrets on the Pi (required)

The Actions checkout does **not** include gitignored files. Keep production
secrets once under `~/.config/management` (or set repo variable / env
`MGMT_SECRETS_DIR`). CI runs `docker/link-secrets.sh` to materialize them into
`docker/` before deploy.

```bash
mkdir -p ~/.config/management

# From your existing working deploy tree (adjust the source path):
cp docker/.env.prod ~/.config/management/.env.prod
cp -a docker/ssl ~/.config/management/ssl
cp -a docker/cloudflared ~/.config/management/cloudflared
cp docker/cloudflared.env ~/.config/management/cloudflared.env   # if you use it
```

Required at minimum: `~/.config/management/.env.prod`

### 4. Trigger a deploy

- Push to `master`, or
- **Actions → Deploy (Raspberry Pi) → Run workflow**

## Rollback behaviour (summary)

| Failure point              | Running site                                     |
| -------------------------- | ------------------------------------------------ |
| `uv sync` / lib error      | Unchanged                                        |
| Image build error          | Unchanged (old containers keep running)          |
| DB migration error         | Unchanged; `:latest` tag restored                |
| App recreate / health fail | Restored from `:previous` image (nginx stays up) |
| Success                    | New SHA is live as `:latest`                     |

**Migrations are not rolled back with the image.** `ci-deploy.sh` applies SQL with the _new_ image before switching traffic. If the app then fails health and the image is retagged to `:previous`, the database may already be on the newer schema. **Every migration must stay backward-compatible with the previous app release for at least one deploy window** (additive columns with defaults, no destructive renames/drops in the same release that needs the new code).

Post-switch health probes `GET /api/health` (HTTP **200** required): MySQL `SELECT 1` plus zero pending/drifted migrations.

### Troubleshooting: brief 5xx while a deploy is running

Old deploys used `compose up --force-recreate` on the **whole** stack, which bounced nginx and made Cloudflare Tunnel briefly unable to reach `127.0.0.1:8080`. That shows up as a short public outage (often a gateway / internal error page) right when GitHub Actions switches the release. Current `ci-deploy.sh` only recreates the app container.

Force a manual rollback on the Pi (from the repo root):

```bash
podman tag localhost/mgmt-app-prod:previous localhost/mgmt-app-prod:latest
uv run podman-compose -f docker/docker-compose.prod.yml up -d --force-recreate app
```

## Useful env overrides

| Variable                 | Default                                   | Purpose                                                                                                                                                                                                                                                   |
| ------------------------ | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MGMT_COMPOSE`           | `uv run --project <repo> podman-compose`  | Compose CLI override                                                                                                                                                                                                                                      |
| `MGMT_IMAGE`             | `localhost/mgmt-app-prod`                 | App image name                                                                                                                                                                                                                                            |
| `MGMT_HEALTH_URL`        | `http://${LAN_IP}:3000/api/health`        | Post-deploy probe (requires HTTP 200)                                                                                                                                                                                                                     |
| `MGMT_HEALTH_RETRIES`    | `30`                                      | Probe attempts                                                                                                                                                                                                                                            |
| `MGMT_DISK_FREE_MIN_GIB` | `4`                                       | Below this, prune also wipes build cache                                                                                                                                                                                                                  |
| `MGMT_PRUNE_AGGRESSIVE`  | `0`                                       | `1` = always prune dangling + system leftovers                                                                                                                                                                                                            |
| `LAN_IP`                 | `192.168.1.4`                             | Pi LAN bind for **app** publish + nginx upstream (`docker/nginx.prod.conf.template` → `nginx.prod.rendered.conf`), trusted-proxy list, and deploy output URLs. MySQL/Redis publish **loopback only**; the app reaches them via `host.containers.internal` |
| `DB_HOST` (compose)      | `host.containers.internal`                | Forced in `docker-compose.prod.yml` / migrate so the container hits host `127.0.0.1:3306`                                                                                                                                                                 |
| `REDIS_URL` (compose)    | `redis://host.containers.internal:6379/0` | Same pattern for Redis                                                                                                                                                                                                                                    |

## Workflow file

See [`.github/workflows/deploy-pi.yml`](../.github/workflows/deploy-pi.yml). Concurrency group `deploy-pi-production` keeps one deploy at a time; `cancel-in-progress: true` so a newer push cancels an older queued/stuck run.

## Troubleshooting: `docker/.env.prod missing`

The deploy failed because secrets were not on the Pi yet. Create
`~/.config/management/.env.prod` (see §3 above), then re-run the workflow.

## Troubleshooting: stuck on Queued

GitHub will wait **forever** for a matching self-hosted runner. Queued almost always means:

1. No runner is registered for this repo, or
2. The runner is **Offline**, or
3. The runner is missing the `management` label

Fix:

1. In the Actions UI, **Cancel** the stuck run (it can also block newer deploys until cancelled or replaced).
2. On the Pi, confirm the runner service is running and GitHub shows **Idle**.
3. Re-register if needed:

```bash
bash docker/install-github-runner.sh \
  --url https://github.com/vduckute1812/management_custom \
  --token <NEW_REGISTRATION_TOKEN>
```

4. Re-run the workflow: Actions → Deploy (Raspberry Pi) → Run workflow.
