# CI/CD (Raspberry Pi)

Production deploys run **on the Pi itself** via a GitHub Actions self-hosted runner. Builds stay native (ARM), reuse your existing `podman` stack, and never need SSH keys in GitHub.

Compose is invoked with **`uv run podman-compose`** from the repo root (`pyproject.toml`). There is no Poetry/pyenv absolute path.

## What happens on every `master` push

1. The Pi runner checks out the commit into its workspace (`actions/checkout`, `clean: false` so local secrets survive).
2. **Sync libs** — `uv sync --frozen` installs ops deps (`podman-compose`). App npm deps sync inside the image build via `npm ci` (Dockerfile retries on registry timeouts).
3. `docker/ci-deploy.sh` snapshots the current app image as `:previous`, then **prunes** unused Podman/Docker layers (old SHA tags of `mgmt-app-prod`, dangling images, stopped containers, build cache) so Pi disks do not fill up mid-`COPY node_modules`.
4. It builds a new image tagged with the git SHA.
5. **If the build fails** → the running stack is **not** restarted (and prune runs again to reclaim partial layers).
6. MySQL is ensured up; **DB migrations** run with the _new_ image (`scripts/migrate.ts up`) while the old app is still serving.
7. **If migrate fails** → `:latest` is restored to `:previous` and the live app is **not** restarted.
8. On success it recreates **only the app** container (`--no-deps --force-recreate app`) so nginx stays up for Cloudflare Tunnel, then health-checks `http://${LAN_IP}:3000/`.
9. Reloads nginx so `docker/nginx.prod.conf` edits (e.g. chat SSE proxy settings) take effect without bouncing the tunnel upstream.
10. **If health fails** → it retags `:previous` → `:latest`, recreates the app, and fails the job.
11. **After a healthy deploy** → prune again: multi-stage `<none>` intermediates, old SHA tags, and stopped one-shot containers. Keeps `:latest` / `:previous` / the new SHA; **never** deletes named volumes (MySQL data).

Chat SSE (`/api/chat/inbox/stream`, `/api/chat/conversations/:id/stream`) needs the dedicated nginx locations in `nginx.prod.conf` (HTTP/1.1, `proxy_buffering off`, long read timeout). Without them, long-lived EventSource connections 504 behind Cloudflare.

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

### Troubleshooting: brief 5xx while a deploy is running

Old deploys used `compose up --force-recreate` on the **whole** stack, which bounced nginx and made Cloudflare Tunnel briefly unable to reach `127.0.0.1:8080`. That shows up as a short public outage (often a gateway / internal error page) right when GitHub Actions switches the release. Current `ci-deploy.sh` only recreates the app container.

Force a manual rollback on the Pi (from the repo root):

```bash
podman tag localhost/mgmt-app-prod:previous localhost/mgmt-app-prod:latest
uv run podman-compose -f docker/docker-compose.prod.yml up -d --force-recreate app
```

## Useful env overrides

| Variable              | Default                                  | Purpose                  |
| --------------------- | ---------------------------------------- | ------------------------ |
| `MGMT_COMPOSE`        | `uv run --project <repo> podman-compose` | Compose CLI override     |
| `MGMT_IMAGE`          | `localhost/mgmt-app-prod`                | App image name           |
| `MGMT_HEALTH_URL`     | `http://127.0.0.1:3000/`                 | Post-deploy probe        |
| `MGMT_HEALTH_RETRIES` | `30`                                     | Probe attempts           |
| `LAN_IP`              | `192.168.1.4`                            | Printed in deploy output |

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
