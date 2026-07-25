# CI/CD (Raspberry Pi)

Production deploys run **on the Pi itself** via a GitHub Actions self-hosted runner. That keeps builds native (ARM), reuses your existing `podman` / `docker/.env.prod` / tunnel files, and never needs SSH keys in GitHub.

## What happens on every `master` push

1. The Pi runner fetches `origin/master` into the deploy checkout.
2. `docker/ci-deploy.sh` snapshots the current app image as `:previous`.
3. It builds a new image tagged with the git SHA.
4. **If the build fails** → the running stack is **not** restarted (stays on the old release).
5. On build success it recreates the compose stack and health-checks `http://127.0.0.1:3000/`.
6. **If health fails** → it retags `:previous` → `:latest`, recreates the app, and fails the job.

Manual / legacy entrypoint `bash docker/deploy.sh` now calls the same script.

## One-time Pi setup

### 1. Deploy checkout

```bash
mkdir -p ~/Projects
git clone https://github.com/vduckute1812/management_custom.git ~/Projects/management
# Ensure docker/.env.prod, TLS certs, and tunnel config already exist here
# (same files you use for manual deploys today).
```

Override the path with a GitHub Actions repository variable `DEPLOY_DIR` if needed.

### 2. Register the self-hosted runner

In GitHub: **Settings → Actions → Runners → New self-hosted runner**. Copy the registration token, then on the Pi:

```bash
cd ~/Projects/management
bash docker/install-github-runner.sh \
  --url https://github.com/vduckute1812/management_custom \
  --token <REGISTRATION_TOKEN>
```

The installer registers labels `self-hosted,linux,ARM64,management` (required by `.github/workflows/deploy-pi.yml`).

Confirm the runner shows **Idle** in the GitHub UI.

### 3. Trigger a deploy

- Push to `master`, or
- **Actions → Deploy (Raspberry Pi) → Run workflow**

## Rollback behaviour (summary)

| Failure point        | Running site                         |
| -------------------- | ------------------------------------ |
| `podman build` error | Unchanged (old containers keep running) |
| Compose / health fail| Restored from `:previous` image      |
| Success              | New SHA is live as `:latest`         |

Force a manual rollback on the Pi:

```bash
cd ~/Projects/management
podman tag localhost/mgmt-app-prod:previous localhost/mgmt-app-prod:latest
# or: docker tag ...
podman-compose -f docker/docker-compose.prod.yml up -d --force-recreate app
```

## Useful env overrides

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `DEPLOY_DIR` (GitHub var) | `/home/duc13t3/Projects/management` | Checkout the workflow syncs |
| `MGMT_COMPOSE` | auto-detect | Compose CLI |
| `MGMT_IMAGE` | `localhost/mgmt-app-prod` | App image name |
| `MGMT_HEALTH_URL` | `http://127.0.0.1:3000/` | Post-deploy probe |
| `MGMT_HEALTH_RETRIES` | `30` | Probe attempts |
| `LAN_IP` | `192.168.1.4` | Printed in deploy output |

## Workflow file

See [`.github/workflows/deploy-pi.yml`](../.github/workflows/deploy-pi.yml). Concurrency group `deploy-pi-production` ensures only one deploy runs at a time (`cancel-in-progress: false` so an in-flight deploy is never aborted mid-rollback).
