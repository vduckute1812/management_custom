# CI/CD (Raspberry Pi)

Production deploys run **on the Pi itself** via a GitHub Actions self-hosted runner. Builds stay native (ARM), reuse your existing `podman` stack, and never need SSH keys in GitHub.

Compose is invoked with **`uv run podman-compose`** from the repo root (`pyproject.toml`). There is no Poetry/pyenv absolute path.

## What happens on every `master` push

1. The Pi runner checks out the commit into its workspace (`actions/checkout`, `clean: false` so local secrets survive).
2. **Sync libs** — `uv sync --frozen` installs ops deps (`podman-compose`). App npm deps sync inside the image build via `npm ci`.
3. `docker/ci-deploy.sh` snapshots the current app image as `:previous`.
4. It builds a new image tagged with the git SHA.
5. **If the build fails** → the running stack is **not** restarted.
6. MySQL is ensured up; **DB migrations** run with the *new* image (`scripts/migrate.ts up`) while the old app is still serving.
7. **If migrate fails** → `:latest` is restored to `:previous` and the live app is **not** restarted.
8. On success it recreates the compose stack and health-checks `http://127.0.0.1:3000/`.
9. **If health fails** → it retags `:previous` → `:latest`, recreates the app, and fails the job.

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

Labels registered: `self-hosted,linux,ARM64,management` (required by `.github/workflows/deploy-pi.yml`).

### 3. Local secrets in the runner workspace

After the first workflow checkout (or a manual clone into the runner work dir), keep these **relative** files on the Pi (gitignored):

- `docker/.env.prod`
- `docker/ssl/…`
- `docker/cloudflared/…`

`clean: false` on checkout preserves them between runs.

### 4. Trigger a deploy

- Push to `master`, or
- **Actions → Deploy (Raspberry Pi) → Run workflow**

## Rollback behaviour (summary)

| Failure point           | Running site                            |
| ----------------------- | --------------------------------------- |
| `uv sync` / lib error   | Unchanged                               |
| Image build error       | Unchanged (old containers keep running) |
| DB migration error      | Unchanged; `:latest` tag restored       |
| Compose / health fail   | Restored from `:previous` image         |
| Success                 | New SHA is live as `:latest`            |

Force a manual rollback on the Pi (from the repo root):

```bash
podman tag localhost/mgmt-app-prod:previous localhost/mgmt-app-prod:latest
uv run podman-compose -f docker/docker-compose.prod.yml up -d --force-recreate app
```

## Useful env overrides

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `MGMT_COMPOSE` | `uv run --project <repo> podman-compose` | Compose CLI override |
| `MGMT_IMAGE` | `localhost/mgmt-app-prod` | App image name |
| `MGMT_HEALTH_URL` | `http://127.0.0.1:3000/` | Post-deploy probe |
| `MGMT_HEALTH_RETRIES` | `30` | Probe attempts |
| `LAN_IP` | `192.168.1.4` | Printed in deploy output |

## Workflow file

See [`.github/workflows/deploy-pi.yml`](../.github/workflows/deploy-pi.yml). Concurrency group `deploy-pi-production` ensures only one deploy runs at a time (`cancel-in-progress: false` so an in-flight deploy is never aborted mid-rollback).
